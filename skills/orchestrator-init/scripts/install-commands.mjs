#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const repoRoot = path.resolve(scriptDir, "../../..");
const sourceRoot = path.resolve(repoRoot, "commands", "claude");
const targetRoot = expandPath(args.target || "~/.claude/commands");
const write = Boolean(args.write);

if (!fs.existsSync(sourceRoot)) {
  console.error(`Command source directory not found: ${sourceRoot}`);
  process.exit(1);
}

const files = fs.readdirSync(sourceRoot).filter((file) => file.endsWith(".md"));
const plan = files.map((file) => ({
  source: path.join(sourceRoot, file),
  target: path.join(targetRoot, file),
  exists: fs.existsSync(path.join(targetRoot, file)),
}));

if (!write) {
  console.log("Command install plan (dry run):");
  for (const item of plan) {
    console.log(`- ${item.exists ? "would overwrite" : "would create"} ${item.target}`);
  }
  console.log("Re-run with --write after user confirmation.");
  process.exit(0);
}

fs.mkdirSync(targetRoot, { recursive: true });
for (const item of plan) {
  fs.copyFileSync(item.source, item.target);
}

console.log(`Installed ${plan.length} Claude command(s) to ${targetRoot}`);

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

function expandPath(value) {
  if (!value) return value;
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return path.resolve(value);
}
