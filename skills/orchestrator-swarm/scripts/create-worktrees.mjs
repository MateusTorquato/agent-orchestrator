#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const runId = args["run-id"];
const routes = (args.routes || "").split(",").map((item) => item.trim()).filter(Boolean);
const root = expandPath(args.root || "~/.cache/ai-orchestrator/worktrees");

if (!runId || !routes.length) {
  console.error("Usage: create-worktrees.mjs --run-id <id> --routes route-a,route-b [--root <path>]");
  process.exit(2);
}

const repoRoot = runGit(["rev-parse", "--show-toplevel"]).stdout.trim();
const repoName = path.basename(repoRoot);
const baseDir = path.join(root, repoName, runId);
fs.mkdirSync(baseDir, { recursive: true });

const results = [];
for (const route of routes) {
  const safeRoute = route.replace(/[^A-Za-z0-9_.-]+/g, "-");
  const branch = `orchestrator/${runId}/${safeRoute}`;
  const worktreePath = path.join(baseDir, safeRoute);
  const result = runGit(["worktree", "add", "-b", branch, worktreePath, "HEAD"]);
  results.push({
    route,
    branch,
    path: worktreePath,
    ok: result.status === 0,
    stderr: result.stderr.trim(),
  });
}

process.stdout.write(`${JSON.stringify({ repoRoot, baseDir, worktrees: results }, null, 2)}\n`);

function runGit(gitArgs) {
  const result = spawnSync("git", gitArgs, { encoding: "utf8" });
  if (result.status !== 0 && !args["keep-going"]) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
  return result;
}

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
