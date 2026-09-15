// "Is the visitor's devcoach dashboard running?" — a best-effort probe from the https docs page to
// http://127.0.0.1:<port>/ping. Two browsers get in the way, for opposite reasons, and each needs an
// honest answer rather than a generic "no dashboard answered":
//   • WebKit (Safari, every iOS browser) does NOT treat loopback as potentially trustworthy, so any
//     https→http://127.0.0.1 subresource is blocked as mixed content before it leaves the browser
//     (WebKit bug 171934, open since 2017). We skip the probe there — no console noise, no false "down".
//   • Chrome 142+ asks the user for "Local Network Access" before letting a public page reach
//     loopback; a denied/dismissed prompt makes fetch reject exactly like a refused connection. The
//     `local-network-access` permission tells the two apart; `targetAddressSpace: "loopback"` declares
//     the request as local (and exempts it from mixed content in Chrome).
// The Import button is a top-level navigation and is subject to neither restriction.

export type DashboardState =
  | "checking"
  | "up"
  | "down"
  | "blocked-permission"
  | "needs-permission"
  | "unsupported";

export type PermissionVerdict = "granted" | "prompt" | "denied" | "unknown";

/** Safari and every iOS browser (all WebKit); Chrome/Edge/Opera/Firefox spell their own token. */
export function isWebKitOnly(ua: string): boolean {
  return /AppleWebKit/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua);
}

/** Minimal shape of `navigator.permissions` (the query name is not in TS's lib yet). */
export interface PermissionsLike {
  query(descriptor: { name: string }): Promise<{ state: string }>;
}

/** Chrome 142+ answers; browsers that don't know the name throw — that is "unknown", not a block. */
export async function queryLocalNetworkPermission(
  permissions: PermissionsLike | undefined,
): Promise<PermissionVerdict> {
  if (!permissions) return "unknown";
  try {
    const { state } = await permissions.query({ name: "local-network-access" });
    return state === "granted" || state === "prompt" || state === "denied" ? state : "unknown";
  } catch {
    return "unknown";
  }
}

export interface ProbeDeps {
  userAgent: string;
  permissions: PermissionsLike | undefined;
  fetch: typeof fetch;
  /** Called when Chrome is about to show its permission prompt (state "prompt" before the fetch). */
  onPrompt?: () => void;
}

/** One probe of http://127.0.0.1:<port>/ping, resolved to a state the panel can explain. */
export async function probeDashboard(
  port: number,
  signal: AbortSignal,
  deps: ProbeDeps,
): Promise<DashboardState> {
  if (isWebKitOnly(deps.userAgent)) return "unsupported";
  const before = await queryLocalNetworkPermission(deps.permissions);
  if (before === "denied") return "blocked-permission";
  if (before === "prompt") deps.onPrompt?.();
  try {
    const res = await deps.fetch(`http://127.0.0.1:${port}/ping`, {
      mode: "cors",
      cache: "no-store",
      signal,
      // Chrome: declare the destination as loopback (Local Network Access + mixed-content exemption).
      // Unknown RequestInit keys are ignored everywhere else.
      targetAddressSpace: "loopback",
    } as RequestInit);
    if (!res.ok) return "down";
    const body = (await res.json()) as { ok?: boolean };
    return body?.ok ? "up" : "down";
  } catch {
    if (before === "prompt") {
      // The prompt was shown during the fetch: a refusal turns into "denied" right after.
      const after = await queryLocalNetworkPermission(deps.permissions);
      if (after === "denied") return "blocked-permission";
    }
    return "down";
  }
}
