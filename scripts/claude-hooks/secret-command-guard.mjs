// Claude Code PreToolUse hook for Bash. Blocks commands that would put tier 4
// secrets (ADR-0019) in an agent's view: Bitwarden CLI reads and unlocks, and
// hcp:projects runs, which take the protected project inputs map. Exit 2 blocks.
// shortcut: matches command text, not a shell parse. A command word is one at the
// start, after a separator, `$(`, a backtick or a quote (so `sh -c "bw …"` is
// caught), or after env/sudo-style prefixes and VAR=value assignments. A quoted
// mention that starts with `bw` is blocked too, which fails closed.

let input = "";
for await (const chunk of process.stdin) input += chunk;
const command = JSON.parse(input || "{}").tool_input?.command ?? "";

// After a quote, the command must start at once: `'x' path` is an argument, `"bw …"` a command.
const commandWord = String.raw`(?:(?:^|[\n;&|(])\s*|[\x60"'])(?:(?:env|command|sudo|exec|xargs|nohup|time)\s+)*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*`;
const bitwarden = new RegExp(String.raw`${commandWord}(?:\S*/)?bw(?=$|[\s;&|)"'\x60])(?:\s+([^\s;&|)"'\x60]+))?`, "g");
const blocked = [];
for (const match of command.matchAll(bitwarden)) {
  // `bw status` prints only lock state; `--help` and `--version` print no vault data.
  if (!["status", "--help", "-h", "--version", "-v"].includes(match[1] ?? "")) blocked.push("the Bitwarden CLI (`bw`)");
}
if (new RegExp(String.raw`${commandWord}(?:pnpm|npm|yarn)\s+(?:-\S+(?:\s+[^-\s]\S*)?\s+)*(?:run\s+)?hcp:projects(?=$|[\s;&|)"'\x60])|hcp-projects\.ts\s+(?:plan|apply)\b`).test(command)) {
  blocked.push("`hcp:projects`, which reads the protected project inputs");
}
if (new RegExp(String.raw`${commandWord}(?:bash\s+|sh\s+)?(?:[\w.~/-]*/)?hcp-inputs-note-wizard\.sh(?=$|[\s;&|)"'\x60])`).test(command)) {
  blocked.push("the project inputs note wizard");
}

if (blocked.length > 0) {
  console.error(
    `Harness secret guard blocked this command: it runs ${[...new Set(blocked)].join(" and ")}. ` +
      "Agents must not see these secrets. Ask the user to run the command themselves in a separate terminal, " +
      "outside any agent session, and report back only the outcome (see docs/agents/data-safety.md).",
  );
  process.exit(2);
}
