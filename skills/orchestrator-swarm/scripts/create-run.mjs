#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const runId = args["run-id"] || buildRunId(args.task || "swarm");
const root = path.resolve(args.root || ".orchestrator/runs");
const runDir = path.join(root, runId);

for (const subdir of ["prompts", "outputs", "logs"]) {
  fs.mkdirSync(path.join(runDir, subdir), { recursive: true });
}

const runYaml = `run_id: ${JSON.stringify(runId)}
created_at: ${JSON.stringify(new Date().toISOString())}
task: ${JSON.stringify(args.task || "")}
mode: ${JSON.stringify(args.mode || "specialist")}
`;
fs.writeFileSync(path.join(runDir, "run.yaml"), runYaml, "utf8");
console.log(runDir);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function buildRunId(input) {
  const slug = String(input || "swarm").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "swarm";
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
  return `${stamp}-${slug}`;
}
