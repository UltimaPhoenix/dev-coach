import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Repo root = tests/ → ..  (server.json is a static repo file, not runtime code).
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (...p: string[]) => JSON.parse(readFileSync(join(root, ...p), "utf8"));

interface RegistryPackage {
  registryType: string;
  identifier: string;
  version: string;
  transport: { type: string };
}

describe("MCP Registry manifest (server.json)", () => {
  const pkg = readJson("package.json");
  const server = readJson("server.json");

  it("is pinned to the released version (run `npm run plugin:sync`)", () => {
    expect(server.version).toBe(pkg.version);
    for (const p of server.packages as RegistryPackage[]) expect(p.version).toBe(pkg.version);
  });

  it("names match what the registry verifies against the npm tarball", () => {
    // Ownership check: the registry reads `mcpName` from the published package.json.
    expect(server.name).toBe(pkg.mcpName);
    expect(server.name).toMatch(/^io\.github\.UltimaPhoenix\//);
    expect(server.packages).toHaveLength(1);
    const [npmPkg] = server.packages as RegistryPackage[];
    expect(npmPkg.registryType).toBe("npm");
    expect(npmPkg.identifier).toBe(pkg.name);
    expect(npmPkg.transport.type).toBe("stdio");
  });

  it("declares the official schema and the public links", () => {
    expect(server.$schema).toMatch(
      /^https:\/\/static\.modelcontextprotocol\.io\/schemas\/\d{4}-\d{2}-\d{2}\/server\.schema\.json$/,
    );
    // package.json uses the npm form `git+https://…/dev-coach.git`; the registry wants the plain URL.
    const repoUrl = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
    expect(server.repository).toEqual({ url: repoUrl, source: "github" });
    expect(server.websiteUrl).toBe(pkg.homepage);
  });
});
