// Generate the Homebrew formula for the devcoach npm package (the MCP server). The formula
// installs the published npm package, so no compilation/bottles are needed — just
// `depends_on "node"`. There is no CLI: the caveats say how to wire the server into Claude Code
// by hand (the plugin does it for plugin users).
// Usage: node scripts/homebrew-formula.mjs <version> <sha256>  > Formula/devcoach.rb
const [version, sha] = process.argv.slice(2);
if (!version || !sha) {
  console.error("usage: node scripts/homebrew-formula.mjs <version> <sha256>");
  process.exit(1);
}
const url = `https://registry.npmjs.org/devcoach/-/devcoach-${version}.tgz`;

process.stdout.write(`class Devcoach < Formula
  desc "Learn what you don't know yet from the code your AI agent writes"
  homepage "https://github.com/UltimaPhoenix/dev-coach"
  url "${url}"
  sha256 "${sha}"
  license "AGPL-3.0-only"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  def caveats
    <<~EOS
      devcoach is an MCP server. Wire it into Claude Code with:
        claude mcp add --scope user -e DEVCOACH_HOOK_TOOLS=1 devcoach -- devcoach
      then add the two mcp_tool hook entries (Stop -> hook_stop, UserPromptSubmit -> hook_prompt,
      server "devcoach") to ~/.claude/settings.json and copy the coaching skill:
        cp -R #{libexec}/lib/node_modules/devcoach/assets/SKILL.md \\
              #{libexec}/lib/node_modules/devcoach/assets/references ~/.claude/skills/devcoach/
      The exact hook entries: https://github.com/UltimaPhoenix/dev-coach/blob/main/EXPERIMENT.md
      Homebrew cannot undo that wiring on brew uninstall (formulae have no uninstall hook):
      run \`claude mcp remove devcoach\`, delete the two hook entries and ~/.claude/skills/devcoach,
      and delete ~/.devcoach if you want the lessons, profile and notebook gone too.
    EOS
  end

  test do
    assert_match "devcoach", shell_output("#{bin}/devcoach --help")
  end
end
`);
