#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const runId = args["run-id"];
const routes = (args.routes || "").split(",").map((item) => item.trim()).filter(Boolean);
const safeRoutes = [...new Set(routes.map((route) => sanitizeRoute(route)))];
const root = expandPath(args.root || "~/.cache/ai-orchestrator/worktrees");
const write = Boolean(args.write || args.confirmed);

if (!runId || !routes.length) {
  console.error("Usage: create-worktrees.mjs --run-id <id> --routes route-a,route-b [--root <path>] [--write --confirmed]");
  console.error("Default is dry-run. Use --write --confirmed only after explicit user approval.");
  process.exit(2);
}

if (safeRoutes.length < 2) {
  console.error("Worktree swarm requires at least two distinct routes.");
  process.exit(3);
}

const repoRoot = runGit(["rev-parse", "--show-toplevel"]).stdout.trim();
const status = runGit(["status", "--porcelain"]);
if (status.stdout.trim() && !args["allow-dirty"]) {
  console.error("Refusing to create orchestrator worktrees from a dirty checkout. Commit/stash changes or re-run with --allow-dirty after explicit user confirmation.");
  process.exit(4);
}
const repoName = path.basename(repoRoot);
const baseDir = path.join(root, repoName, runId);

const results = [];
for (const safeRoute of safeRoutes) {
  const branch = `orchestrator/${runId}/${safeRoute}`;
  const worktreePath = path.join(baseDir, safeRoute);
  if (!write) {
    results.push({
      route: safeRoute,
      branch,
      path: worktreePath,
      ok: true,
      dry_run: true,
    });
    continue;
  }
  fs.mkdirSync(baseDir, { recursive: true });
  const result = runGit(["worktree", "add", "-b", branch, worktreePath, "HEAD"]);
  results.push({
    route: safeRoute,
    branch,
    path: worktreePath,
    ok: result.status === 0,
    stderr: result.stderr.trim(),
  });
}

process.stdout.write(`${JSON.stringify({ repoRoot, baseDir, dry_run: !write, worktrees: results }, null, 2)}\n`);

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

function sanitizeRoute(route) {
  return route.replace(/[^A-Za-z0-9_.-]+/g, "-");
}
