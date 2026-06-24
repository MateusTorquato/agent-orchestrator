#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-orchestrator-release-"));

const checks = [
  ["unit and script tests", process.execPath, ["tests/run-tests.mjs"]],
  ["skill discovery", "npx", ["skills", "add", ".", "--list"]],
  ["package dry-run", "npm", ["pack", "--dry-run"]],
  ["hook shell syntax", "bash", ["-n", "hooks/session-start", "hooks/session-start-codex", "hooks/run-hook.cmd"]],
  ["bootstrap hook output", "bash", ["-lc", "CLAUDE_PLUGIN_ROOT=\"$PWD\" hooks/session-start | node -e \"let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{if(!s.includes('AGENT_ORCHESTRATOR_BOOTSTRAP')) process.exit(1)})\""]],
  ["secret pattern scan", "bash", ["-lc", "! rg -n --glob '!scripts/verify-release.mjs' \"(sk-[A-Za-z0-9]|gho_|BEGIN .*PRIVATE|password\\\\s*[:=]|api[_-]?key\\\\s*[:=]|token\\\\s*[:=]|secret\\\\s*[:=])\" ."]],
  ["space path install", "bash", ["-lc", spacePathScript()]],
];

for (const [name, command, args] of checks) {
  runCheck(name, command, args);
}

console.log("release verification ok");

function runCheck(name, command, args) {
  process.stdout.write(`checking ${name}... `);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    process.stdout.write("failed\n");
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
  process.stdout.write("ok\n");
}

function spacePathScript() {
  const source = shellQuote(repoRoot);
  const target = shellQuote(path.join(tmp, "repo with space"));
  const commandsTarget = shellQuote(path.join(tmp, "commands target"));
  return [
    `cp -R ${source} ${target}`,
    `node ${shellQuote(path.join(tmp, "repo with space", "tests", "run-tests.mjs"))} >/dev/null`,
    `node ${shellQuote(path.join(tmp, "repo with space", "skills", "orchestrator-init", "scripts", "install-commands.mjs"))} --target ${commandsTarget} >/dev/null`,
  ].join(" && ");
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}
