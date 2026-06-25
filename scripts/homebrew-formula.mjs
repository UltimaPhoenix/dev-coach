// Generate the Homebrew formula for the devcoach npm CLI (Node equivalent of the old
// generate_homebrew_formula.py). The formula installs the published npm package, so no
// compilation/bottles are needed — just `depends_on "node"`.
// Usage: node scripts/homebrew-formula.mjs <version> <sha256>  > Formula/devcoach.rb
const [version, sha] = process.argv.slice(2);
if (!version || !sha) {
  console.error("usage: node scripts/homebrew-formula.mjs <version> <sha256>");
  process.exit(1);
}
const url = `https://registry.npmjs.org/devcoach/-/devcoach-${version}.tgz`;

process.stdout.write(`class Devcoach < Formula
  desc "Progressive technical coach (MCP server) for Claude Code and Claude Desktop"
  homepage "https://github.com/UltimaPhoenix/dev-coach"
  url "${url}"
  sha256 "${sha}"
  license "AGPL-3.0-only"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "devcoach", shell_output("#{bin}/devcoach --version")
  end
end
`);
