// The only I/O in the sharing layer: fetch the text behind a URL the user pasted (a raw gist, a
// paste, a file in a repo) so `parseSharedInput` can read it. Share links carry the lesson in the
// fragment and are decoded locally — they never reach this module.
//
// The URL is untrusted (it may come from a prompt injection via the import_lesson tool), so only
// public hosts are fetched: loopback, private, link-local and unique-local addresses are refused
// after DNS resolution, redirects are followed by hand with the same check on every hop, and the
// body is read with a byte budget instead of trusting Content-Length.
import dns from "node:dns";
import { isIP } from "node:net";
import { ShareInputError } from "./share";

export interface FetchSharedOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** DNS resolver (all addresses of a host); injectable for tests. */
  lookup?: (hostname: string) => Promise<string[]>;
}

const TOO_LARGE = "That URL is too large to be a lesson.";
const NOT_PUBLIC = "Only public http(s) URLs can be imported.";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function isHttpUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

function isPrivateIPv4(ip: string): boolean {
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return (
    a === 0 || // 0.0.0.0/8 "this network"
    a === 10 || // 10/8
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local (incl. cloud metadata)
    (a === 172 && b >= 16 && b <= 31) || // 172.16/12
    (a === 192 && b === 168) || // 192.168/16
    (a === 100 && b >= 64 && b <= 127) || // 100.64/10 carrier-grade NAT
    a >= 224 // multicast + reserved
  );
}

/** True for any address that is not a public unicast one (loopback, private, link-local, …). */
export function isPrivateAddress(address: string): boolean {
  const ip = address
    .replace(/^\[|\]$/g, "")
    .replace(/%.*$/, "")
    .toLowerCase();
  if (isIP(ip) === 4) return isPrivateIPv4(ip);
  if (isIP(ip) !== 6) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped?.[1]) return isPrivateIPv4(mapped[1]);
  if (ip === "::" || ip === "::1") return true;
  const first = ip.split(":")[0] ?? "";
  if (/^f[cd]/.test(first)) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(first)) return true; // fe80::/10 link-local
  return false;
}

async function defaultLookup(hostname: string): Promise<string[]> {
  const found = await dns.promises.lookup(hostname, { all: true });
  return found.map((entry) => entry.address);
}

async function assertPublicHost(url: URL, lookup: (h: string) => Promise<string[]>): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) throw new ShareInputError(NOT_PUBLIC);
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new ShareInputError(NOT_PUBLIC);
    return;
  }
  let addresses: string[];
  try {
    addresses = await lookup(host);
  } catch {
    throw new ShareInputError("The URL could not be reached — copy the lesson text instead.");
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a))) {
    throw new ShareInputError(NOT_PUBLIC);
  }
}

async function readBounded(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new ShareInputError(TOO_LARGE);
  if (!res.body) {
    const text = await res.text();
    if (text.length > maxBytes) throw new ShareInputError(TOO_LARGE);
    return text;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ShareInputError(TOO_LARGE);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function fetchSharedInput(
  url: string,
  opts: FetchSharedOptions = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const maxBytes = opts.maxBytes ?? 256 * 1024;
  const maxRedirects = opts.maxRedirects ?? 3;
  const lookup = opts.lookup ?? defaultLookup;
  if (!isHttpUrl(url)) throw new ShareInputError("Only http(s) URLs can be imported.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = new URL(url.trim());
    for (let hop = 0; ; hop++) {
      await assertPublicHost(current, lookup);
      const res = await fetch(current, { signal: controller.signal, redirect: "manual" });
      if (REDIRECT_STATUSES.has(res.status)) {
        const location = res.headers.get("location");
        if (!location || hop >= maxRedirects) {
          throw new ShareInputError(
            "The URL redirects too many times — copy the lesson text instead.",
          );
        }
        current = new URL(location, current);
        if (!/^https?:$/.test(current.protocol)) throw new ShareInputError(NOT_PUBLIC);
        continue;
      }
      if (!res.ok) {
        throw new ShareInputError(`The URL answered ${res.status} — nothing to import there.`);
      }
      return await readBounded(res, maxBytes);
    }
  } catch (err) {
    if (err instanceof ShareInputError) throw err;
    const reason = (err as Error)?.name === "AbortError" ? "timed out" : "could not be reached";
    throw new ShareInputError(`The URL ${reason} — copy the lesson text instead.`);
  } finally {
    clearTimeout(timer);
  }
}
