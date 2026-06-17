// Stage the bundled Node server + assets + manifest into mcpb/build/, validate, then pack the .mcpb
// with the official @anthropic-ai/mcpb CLI (npx fetches it). Run after `npm run build`.
//   node scripts/build-mcpb.mjs            →  dist-mcpb/devcoach-<version>.mcpb  (unsigned)
//   node scripts/build-mcpb.mjs --sign     →  also self-sign it (writes cert.pem/key.pem in mcpb/, gitignored)
// For a real distribution signature, sign with your own cert instead:
//   npx @anthropic-ai/mcpb sign dist-mcpb/devcoach-<version>.mcpb -c cert.pem -k key.pem
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const stage = join(root, "mcpb", "build");
const out = join(root, "dist-mcpb");

if (!existsSync(join(root, "dist", "bin.js"))) {
  console.error("Run `npm run build` first (dist/bin.js missing).");
  process.exit(1);
}

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(join(root, "dist"), join(stage, "dist"), { recursive: true });
cpSync(join(root, "assets"), join(stage, "assets"), { recursive: true });

const manifest = JSON.parse(readFileSync(join(root, "mcpb", "manifest.json"), "utf8"));
manifest.version = version; // keep in sync with package.json
writeFileSync(join(stage, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
if (existsSync(join(root, "mcpb", "icon.png"))) {
  cpSync(join(root, "mcpb", "icon.png"), join(stage, "icon.png"));
}

// Validate the staged manifest against the official schema before packing (fail fast).
execFileSync("npx", ["-y", "@anthropic-ai/mcpb", "validate", join(stage, "manifest.json")], {
  stdio: "inherit",
});

mkdirSync(out, { recursive: true });
const file = join(out, `devcoach-${version}.mcpb`);
execFileSync("npx", ["-y", "@anthropic-ai/mcpb", "pack", stage, file], { stdio: "inherit" });
console.log(`packed ${file}`);

if (process.argv.includes("--sign")) {
  // Prefer a real code-signing cert from MCPB_CERT/MCPB_KEY (file paths — set by CI from secrets);
  // otherwise self-sign. Self-signed embeds a signature so Claude Desktop installs it, but as an
  // *unverified* publisher (self-signed certs don't chain to a trusted root — expected).
  const cert = process.env.MCPB_CERT;
  const key = process.env.MCPB_KEY;
  if (cert && key && existsSync(cert) && existsSync(key)) {
    execFileSync("npx", ["-y", "@anthropic-ai/mcpb", "sign", file, "-c", cert, "-k", key], {
      stdio: "inherit",
    });
    console.log(`signed ${file} with MCPB_CERT`);
  } else {
    execFileSync("npx", ["-y", "@anthropic-ai/mcpb", "sign", file, "--self-signed"], {
      cwd: join(root, "mcpb"),
      stdio: "inherit",
    });
    console.log(
      `self-signed ${file} (unverified publisher — set MCPB_CERT/MCPB_KEY for a trusted signature)`,
    );
  }
}
