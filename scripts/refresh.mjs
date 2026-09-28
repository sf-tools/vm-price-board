import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { PROVIDERS } from "../src/providers.ts";

const PORT = 8799;
const TEMP_CONFIG = "wrangler.refresh.toml";
const TIMEOUT_MS = 10 * 60_000;

const source = await readFile("wrangler.toml", "utf8");
const config = source
  .replace(/^\[\[routes\]\][^[]*/gm, "")
  .replace(/^(database_id = .*)$/m, "$1\nremote = true");
if (!config.includes("remote = true")) throw new Error("couldn't find database_id in wrangler.toml");
await writeFile(TEMP_CONFIG, config);

const child = spawn(
  "npx", ["wrangler", "dev", "-c", TEMP_CONFIG, "--test-scheduled", "--port", String(PORT)], 
  { stdio: ["ignore", "pipe", "pipe"], }
);

const outcomes = [];
let log = "";

const onData = (chunk) => {
  log += chunk;
  for (const line of String(chunk).split("\n")) {
    const at = line.indexOf('{"provider":');
    if (at >= 0) try {
      outcomes.push(JSON.parse(line.slice(at)));
    } catch {}
  }
};

child.stdout.on("data", onData);
child.stderr.on("data", onData);

const cleanup = async () => {
  child.kill();
  await rm(TEMP_CONFIG, { force: true });
};

try {
  const deadline = Date.now() + TIMEOUT_MS;
  while (!(await fetch(`http://localhost:${PORT}/api/prices`).then((r) => r.ok, () => false))) {
    if (Date.now() > deadline || child.exitCode !== null) throw new Error(`wrangler dev didn't start:\n${log.slice(-2000)}`);
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`Checking ${PROVIDERS.length} providers against the production database…`);
  await fetch(`http://localhost:${PORT}/__scheduled?cron=${encodeURIComponent("17 6 * * 1")}`);

  while (outcomes.length < PROVIDERS.length) {
    if (Date.now() > deadline) throw new Error(`timed out with ${outcomes.length}/${PROVIDERS.length} providers done`);
    await new Promise((r) => setTimeout(r, 1000));
  }

  for (const o of outcomes) {
    const detail = o.error ?? [...(o.changes ?? []), ...(o.problems ?? []).map((p) => `held: ${p}`)].join("; ");
    console.log(`${o.provider.padEnd(10)} ${o.result.padEnd(16)} ${detail ?? ""}`);
  }
} finally {
  await cleanup();
}
