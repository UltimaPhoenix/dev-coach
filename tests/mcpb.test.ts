import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer } from "../src/mcp/server";

// Repo root = tests/ → ..  (the manifest is a static repo file, not runtime code).
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (...p: string[]) => JSON.parse(readFileSync(join(root, ...p), "utf8"));

describe("Claude Desktop extension manifest (mcpb/manifest.json)", () => {
  const manifest = readJson("mcpb", "manifest.json");
  const pkg = readJson("package.json");

  it("is pinned to the released version and branded consistently", () => {
    expect(manifest.name).toBe("devcoach");
    expect(manifest.display_name).toBe("devcoach");
    expect(manifest.version).toBe(pkg.version);
    expect(manifest.license).toBe(pkg.license);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal mcpb placeholder, not a template
    expect(manifest.server.mcp_config.args).toEqual(["${__dirname}/dist/bin.js", "mcp"]);
  });

  it("advertises exactly the tools and prompt the MCP server registers", async () => {
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    await server.connect(st);
    const client = new Client({ name: "t", version: "1.0.0" });
    await client.connect(ct);
    const live = (await client.listTools()).tools.map((t) => t.name).sort();
    const prompts = (await client.listPrompts()).prompts.map((p) => p.name);
    await client.close();
    await server.close();

    const declared = (manifest.tools as { name: string }[]).map((t) => t.name).sort();
    expect(declared).toEqual(live);
    expect((manifest.prompts as { name: string }[]).map((p) => p.name)).toEqual(prompts);
  });
});
