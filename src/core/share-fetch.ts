// The only I/O in the sharing layer: fetch the text behind a URL the user pasted (a raw gist, a
// paste, a file in a repo) so `parseSharedInput` can read it. Share links carry the lesson in the
// fragment and are decoded locally — they never reach this module.
import { ShareInputError } from "./share";

export interface FetchSharedOptions {
  timeoutMs?: number;
  maxBytes?: number;
}

export function isHttpUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

export async function fetchSharedInput(
  url: string,
  opts: FetchSharedOptions = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const maxBytes = opts.maxBytes ?? 256 * 1024;
  if (!isHttpUrl(url)) throw new ShareInputError("Only http(s) URLs can be imported.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.trim(), { signal: controller.signal, redirect: "follow" });
    if (!res.ok)
      throw new ShareInputError(`The URL answered ${res.status} — nothing to import there.`);
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > maxBytes) throw new ShareInputError("That URL is too large to be a lesson.");
    const text = await res.text();
    if (text.length > maxBytes) throw new ShareInputError("That URL is too large to be a lesson.");
    return text;
  } catch (err) {
    if (err instanceof ShareInputError) throw err;
    const reason = (err as Error)?.name === "AbortError" ? "timed out" : "could not be reached";
    throw new ShareInputError(`The URL ${reason} — copy the lesson text instead.`);
  } finally {
    clearTimeout(timer);
  }
}
