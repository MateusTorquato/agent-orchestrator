#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const owner = args.owner || "MateusTorquato";
const repo = args.repo || "agent-orchestrator";
const visibility = args.private ? "--private" : "--public";
const fullName = `${owner}/${repo}`;
const confirmed = Boolean(args.confirmed);

const plan = {
  repository: fullName,
  visibility: visibility.slice(2),
  source: repoRoot,
  remote: "origin",
  push: true,
  confirmed,
};

runRequired("git clean status", "git", ["status", "--porcelain"], (result) => {
  if (result.stdout.trim()) {
    return "Working tree is not clean. Commit or stash changes before publishing.";
  }
});

runRequired("GitHub authentication", "gh", ["auth", "status"]);

const existing = spawnSync("gh", ["repo", "view", fullName, "--json", "nameWithOwner,url,visibility"], {
  cwd: repoRoot,
  encoding: "utf8",
});
if (existing.status === 0) {
  console.error(`Repository already exists: ${fullName}`);
  process.stderr.write(existing.stdout);
  process.exit(2);
}

runRequired("release verification", "npm", ["run", "release:verify"]);

if (!confirmed) {
  console.log("Publish plan (dry run):");
  console.log(JSON.stringify(plan, null, 2));
  console.log("Re-run with --confirmed to create the GitHub repo and push.");
  process.exit(0);
}

runRequired("create repository and push", "gh", [
  "repo",
  "create",
  fullName,
  visibility,
  "--source=.",
  "--remote=origin",
  "--push",
]);

console.log(`Published ${fullName}`);

function runRequired(name, command, commandArgs, validate) {
  process.stdout.write(`${name}... `);
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const validationError = validate?.(result);
  if (result.status !== 0 || validationError) {
    process.stdout.write("failed\n");
    if (validationError) console.error(validationError);
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
  process.stdout.write("ok\n");
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
