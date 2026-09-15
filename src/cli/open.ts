// Open a URL in the user's default browser — `devcoach ui --open`. Fire-and-forget: a headless box
// simply doesn't open anything, and the dashboard keeps running either way.
import { spawn } from "node:child_process";

/** The platform's "open this URL" command, split for tests. */
export function browserCommand(platform: NodeJS.Platform, url: string): [string, string[]] {
  if (platform === "darwin") return ["open", [url]];
  if (platform === "win32") return ["cmd", ["/c", "start", "", url]];
  return ["xdg-open", [url]];
}

export function openInBrowser(url: string, platform: NodeJS.Platform = process.platform): void {
  const [cmd, args] = browserCommand(platform, url);
  try {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    child.on("error", () => undefined);
    child.unref();
  } catch {
    // no opener on this system — the printed link still works
  }
}
