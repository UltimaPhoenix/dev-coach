// The only I/O in the sharing layer: fetch the text behind a URL the user pasted (a raw gist, a
// paste, a file in a repo) so `parseSharedInput` can read it. Share links carry the lesson in the
// fragment and are decoded locally — they never reach this module.
//
// The URL is untrusted (it may come from a prompt injection via the import_lesson tool), so only
// public hosts are fetched: loopback, private, link-local and unique-local addresses are refused
// after DNS resolution, redirects are followed by hand with the same check on every hop, and the
// body is read with a byte budget instead of trusting Content-Length. The request goes through
// Node's own http/https client with a `lookup` that answers with the address the guard validated,
// so the socket is pinned to it: a DNS-rebinding record cannot hand the connection a different,
// private address a moment later (global fetch offers no such hook — and a third-party dispatcher
// is not interoperable with the fetch bundled in every supported Node version).
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { VERSION } from "../version";
import { ShareInputError } from "./share";

export interface FetchSharedOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** DNS resolver (all addresses of a host); injectable for tests. */
  lookup?: (hostname: string) => Promise<string[]>;
  /** The HTTP transport; injectable for tests (defaults to `nodeTransport`). */
  transport?: SharedTransport;
}

/** What the transport hands back: just enough to follow redirects and stream the body. */
export interface SharedResponse {
  status: number;
  location: string | null;
  contentLength: number | null;
  body: AsyncIterable<Uint8Array>;
  /** Stop reading and release the socket (redirects, oversize bodies). */
  abort(): void;
}

/** GET `url`, connecting to `address` (the guard's verdict for the URL's host), abortable via `signal`. */
export type SharedTransport = (
  url: URL,
  address: string,
  signal: AbortSignal,
) => Promise<SharedResponse>;

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

/** The validated public address for the URL's host — the one the socket must connect to. */
async function resolvePublicHost(
  url: URL,
  lookup: (h: string) => Promise<string[]>,
): Promise<string> {
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) throw new ShareInputError(NOT_PUBLIC);
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new ShareInputError(NOT_PUBLIC);
    return host;
  }
  let addresses: string[];
  try {
    addresses = await lookup(host);
  } catch {
    throw new ShareInputError("The URL could not be reached — copy the lesson text instead.");
  }
  const first = addresses[0];
  if (!first || addresses.some((a) => isPrivateAddress(a))) throw new ShareInputError(NOT_PUBLIC);
  return first;
}

/**
 * The real transport: Node's http/https client with a `lookup` pinned to `address`. The URL's
 * hostname still goes into the Host header and the TLS server name, so the request looks normal to
 * the server; only the socket's destination is fixed.
 */
export const nodeTransport: SharedTransport = (url, address, signal) =>
  new Promise((resolve, reject) => {
    const family = isIP(address) === 6 ? 6 : 4;
    const lookup: LookupFunction = (_hostname, options, callback) => {
      if (options.all) callback(null, [{ address, family }]);
      else callback(null, address, family);
    };
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: "GET",
        lookup,
        signal,
        headers: {
          accept: "text/plain, text/markdown, application/json;q=0.9, */*;q=0.5",
          "user-agent": `devcoach/${VERSION}`,
        },
      },
      (res) => {
        const declared = res.headers["content-length"];
        resolve({
          status: res.statusCode ?? 0,
          location: res.headers.location ?? null,
          contentLength: declared === undefined ? null : Number(declared),
          body: res,
          abort: () => res.destroy(),
        });
      },
    );
    req.on("error", reject);
    req.end();
  });

async function readBounded(res: SharedResponse, maxBytes: number): Promise<string> {
  if (res.contentLength !== null && res.contentLength > maxBytes) {
    res.abort();
    throw new ShareInputError(TOO_LARGE);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      res.abort();
      throw new ShareInputError(TOO_LARGE);
    }
    chunks.push(chunk);
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
  const transport = opts.transport ?? nodeTransport;
  if (!isHttpUrl(url)) throw new ShareInputError("Only http(s) URLs can be imported.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = new URL(url.trim());
    for (let hop = 0; ; hop++) {
      const address = await resolvePublicHost(current, lookup);
      const res = await transport(current, address, controller.signal);
      if (REDIRECT_STATUSES.has(res.status)) {
        res.abort();
        if (!res.location || hop >= maxRedirects) {
          throw new ShareInputError(
            "The URL redirects too many times — copy the lesson text instead.",
          );
        }
        current = new URL(res.location, current);
        if (!/^https?:$/.test(current.protocol)) throw new ShareInputError(NOT_PUBLIC);
        continue;
      }
      if (res.status < 200 || res.status >= 300) {
        res.abort();
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
