// `devcoach api [operation] [json | -]` — the model's door into devcoach. The coaching skill
// runs it through the agent's shell tool, so everything it prints is JSON the model reads back:
//   { "ok": true, "result": … }          exit 0
//   { "ok": false, "error": "…" }        exit 1 (refused by the operation or its schema)
//                                        exit 2 (unknown operation, input that is not JSON)
//                                        exit 3 (the database was upgraded by a newer devcoach)
// With no operation it lists them (`--json`: the full catalogue with each input's JSON Schema).
import { text as readStream } from "node:stream/consumers";
import { describeOperations, findOperation, OPERATIONS, runOperation } from "../api/operations";
import { c } from "./term";

const emit = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value)}\n`);
};

function listOperations(json: boolean): void {
  if (json) {
    emit({ ok: true, result: { operations: describeOperations() } });
    return;
  }
  console.log(`\n${c.bold("devcoach api")} ${c.dim("— the operations the coaching skill runs")}\n`);
  for (const op of OPERATIONS) {
    const flags = [op.readOnly ? "read-only" : null, op.destructive ? "destructive" : null]
      .filter(Boolean)
      .join(", ");
    console.log(`  ${c.cyan(op.name.padEnd(24))} ${op.title}${flags ? c.dim(`  (${flags})`) : ""}`);
  }
  console.log(
    `\n${c.dim("Usage:")} devcoach api <operation> ['<json>' | -]   ${c.dim("(- reads the JSON from stdin)")}\n` +
      `${c.dim("Schemas:")} devcoach api --json\n`,
  );
}

/** The operation's input: inline JSON, `-` for stdin, or nothing (`{}`). */
async function readInput(source: string | undefined): Promise<string> {
  if (source === undefined) return "{}";
  if (source === "-") return readStream(process.stdin);
  return source;
}

export async function cmdApi(
  name: string | undefined,
  input: string | undefined,
  opts: { json?: boolean },
): Promise<void> {
  if (!name) {
    listOperations(Boolean(opts.json));
    return;
  }
  const op = findOperation(name);
  if (!op) {
    emit({ ok: false, error: `unknown operation '${name}' — run \`devcoach api\` for the list` });
    process.exitCode = 2;
    return;
  }
  let parsed: unknown;
  try {
    const raw = (await readInput(input)).trim();
    parsed = raw ? JSON.parse(raw) : {};
  } catch (err) {
    emit({ ok: false, error: `${name}: the input is not valid JSON — ${(err as Error).message}` });
    process.exitCode = 2;
    return;
  }
  const result = await runOperation(op, parsed);
  emit(result);
  if (!result.ok) {
    // A write refused because the database was upgraded by a newer devcoach: exit 3, like
    // every other CLI command (src/bin.ts) — the error text already names both versions.
    process.exitCode = result.error.includes("SchemaTooNewError") ? 3 : 1;
  }
}
