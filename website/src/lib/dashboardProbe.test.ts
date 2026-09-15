// Run with `npm test` (node --test; Node 24+ strips the types natively).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isWebKitOnly,
  type PermissionsLike,
  probeDashboard,
  queryLocalNetworkPermission,
} from "./dashboardProbe.ts";

const SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const IOS_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0 Mobile/15E148 Safari/604.1";
const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15.6; rv:143.0) Gecko/20100101 Firefox/143.0";

const perms = (states: string[]): PermissionsLike => ({
  query: async () => ({ state: states.shift() ?? "granted" }),
});
const throwingPerms: PermissionsLike = {
  query: async () => {
    throw new TypeError("'local-network-access' is not a valid enum value");
  },
};
const okFetch = (calls: RequestInit[] = []) =>
  (async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(init ?? {});
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as unknown as typeof fetch;
const refusedFetch = (async () => {
  throw new TypeError("Failed to fetch");
}) as unknown as typeof fetch;
const signal = new AbortController().signal;

test("WebKit-only UAs are Safari and every iOS browser; Chrome/Firefox are not", () => {
  assert.equal(isWebKitOnly(SAFARI), true);
  assert.equal(isWebKitOnly(IOS_CHROME), false);
  assert.equal(isWebKitOnly(CHROME), false);
  assert.equal(isWebKitOnly(FIREFOX), false);
});

test("permission query: Chrome states pass through, unknown names are 'unknown'", async () => {
  assert.equal(await queryLocalNetworkPermission(perms(["denied"])), "denied");
  assert.equal(await queryLocalNetworkPermission(perms(["prompt"])), "prompt");
  assert.equal(await queryLocalNetworkPermission(throwingPerms), "unknown");
  assert.equal(await queryLocalNetworkPermission(undefined), "unknown");
  assert.equal(await queryLocalNetworkPermission(perms(["weird"])), "unknown");
});

test("Safari: unsupported, and the probe is never sent", async () => {
  let called = false;
  const fetch = (async () => {
    called = true;
    throw new Error("must not fetch");
  }) as unknown as typeof fetch;
  assert.equal(
    await probeDashboard(7860, signal, { userAgent: SAFARI, permissions: undefined, fetch }),
    "unsupported",
  );
  assert.equal(called, false);
});

test("Chrome with the permission denied: blocked-permission, no fetch", async () => {
  let called = false;
  const fetch = (async () => {
    called = true;
    throw new Error("must not fetch");
  }) as unknown as typeof fetch;
  assert.equal(
    await probeDashboard(7860, signal, { userAgent: CHROME, permissions: perms(["denied"]), fetch }),
    "blocked-permission",
  );
  assert.equal(called, false);
});

test("Chrome prompt → user refuses during the fetch → blocked-permission; onPrompt fired", async () => {
  let prompted = false;
  const state = await probeDashboard(7860, signal, {
    userAgent: CHROME,
    permissions: perms(["prompt", "denied"]),
    fetch: refusedFetch,
    onPrompt: () => {
      prompted = true;
    },
  });
  assert.equal(state, "blocked-permission");
  assert.equal(prompted, true);
});

test("Chrome prompt → fetch fails but the permission is not denied → down (dashboard off)", async () => {
  assert.equal(
    await probeDashboard(7860, signal, {
      userAgent: CHROME,
      permissions: perms(["prompt", "prompt"]),
      fetch: refusedFetch,
    }),
    "down",
  );
});

test("Firefox / older Chrome (no permission API): ok → up, refused → down", async () => {
  const calls: RequestInit[] = [];
  assert.equal(
    await probeDashboard(7899, signal, { userAgent: FIREFOX, permissions: throwingPerms, fetch: okFetch(calls) }),
    "up",
  );
  assert.equal((calls[0] as { targetAddressSpace?: string }).targetAddressSpace, "loopback");
  assert.equal(calls[0].mode, "cors");
  assert.equal(
    await probeDashboard(7899, signal, { userAgent: FIREFOX, permissions: undefined, fetch: refusedFetch }),
    "down",
  );
});

test("a non-ok or non-devcoach answer is down", async () => {
  const notOk = (async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
  const other = (async () => new Response(JSON.stringify({ hello: 1 }), { status: 200 })) as unknown as typeof fetch;
  assert.equal(await probeDashboard(1, signal, { userAgent: CHROME, permissions: undefined, fetch: notOk }), "down");
  assert.equal(await probeDashboard(1, signal, { userAgent: CHROME, permissions: undefined, fetch: other }), "down");
});
