#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-orchestrator-test-"));
const fakeBin = path.join(tmp, "bin");
const fakeHome = path.join(tmp, "home");
const configDir = path.join(tmp, "config");
fs.mkdirSync(fakeBin, { recursive: true });
fs.mkdirSync(fakeHome, { recursive: true });

writeExecutable("codex", `#!/usr/bin/env bash
if [ "$1" = "--version" ]; then echo "codex 1.0.0"; exit 0; fi
if [ "$1" = "--help" ]; then echo "codex help"; exit 0; fi
if [ "$1" = "exec" ]; then echo "ORCHESTRATOR_OK"; exit 0; fi
echo "codex fake"
`);

writeExecutable("opencode", `#!/usr/bin/env bash
if [ "$1" = "--version" ]; then echo "opencode 2.0.0"; exit 0; fi
if [ "$1" = "--help" ]; then echo "opencode help"; exit 0; fi
if [ "$1" = "run" ]; then echo "ORCHESTRATOR_OK"; exit 0; fi
echo "opencode fake"
`);

writeExecutable("agy", `#!/usr/bin/env bash
if [ "$1" = "--version" ]; then echo "1.0.10"; exit 0; fi
if [ "$1" = "--help" ]; then
  echo "Usage of agy:"
  echo "  --model Model for the current CLI session"
  echo "  --print Run a single prompt non-interactively and print the response"
  echo "Available subcommands:"
  echo "  models List available models"
  exit 0
fi
if [ "$1" = "models" ]; then
  echo "Gemini 3.5 Flash (Medium)"
  echo "Gemini 3.5 Flash (High)"
  echo "Gemini 3.5 Flash (Low)"
  echo "Gemini 3.1 Pro (Low)"
  echo "Gemini 3.1 Pro (High)"
  echo "Claude Sonnet 4.6 (Thinking)"
  echo "Claude Opus 4.6 (Thinking)"
  echo "GPT-OSS 120B (Medium)"
  exit 0
fi
if [ "$1" = "--model" ] && [ "$3" = "--print" ]; then echo "ORCHESTRATOR_OK"; exit 0; fi
echo "agy fake"
`);

writeExecutable("ollama", `#!/usr/bin/env bash
if [ "$1" = "--version" ]; then echo "ollama 0.9.0"; exit 0; fi
if [ "$1" = "--help" ]; then echo "ollama help"; exit 0; fi
if [ "$1" = "list" ]; then
  echo "NAME ID SIZE MODIFIED"
  echo "qwen3-coder:latest abc 10GB today"
  echo "deepseek-v4-pro:cloud xyz 0B today"
  echo "gemini-3-flash-preview:latest jkl - today"
  echo "gpt-oss:120b-cloud ghi 0B today"
  echo "gemma3:12b def 8GB today"
  exit 0
fi
if [ "$1" = "show" ]; then
  if [ "$2" = "gemini-3-flash-preview:latest" ]; then
    echo "  Model"
    echo "    Remote model    gemini-3-flash-preview"
    echo "    Remote URL      https://ollama.com:443"
    echo "  Capabilities"
    echo "    vision"
    echo "    tools"
    exit 0
  fi
  if [[ "$2" == *":cloud" || "$2" == *"-cloud" ]]; then
    echo "  Model"
    echo "    Remote model    $2"
    echo "    Remote URL      https://ollama.com:443"
    exit 0
  fi
  echo "  Model"
  echo "    architecture llama"
  echo "  Parameters"
  echo "    size 10B"
  exit 0
fi
`);

const opencodeConfigDir = path.join(fakeHome, ".config", "opencode");
fs.mkdirSync(opencodeConfigDir, { recursive: true });
fs.writeFileSync(path.join(opencodeConfigDir, "opencode.json"), JSON.stringify({
  provider: {
    openai: {
      credentialOne: "fixture-openai-credential-should-not-leak",
      models: ["gpt-5.5", "gpt-5.4-mini"],
    },
    anthropic: {
      credentialTwo: "fixture-anthropic-credential-should-not-leak",
      models: [{ model: "claude-sonnet-4.6", enabled: true }],
    },
  },
}, null, 2));

const env = {
  ...process.env,
  PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ""}`,
  AI_ORCHESTRATOR_CONFIG_DIR: configDir,
};

run("detect environment", () => {
  const result = nodeScript("skills/orchestrator-init/scripts/detect-environment.mjs", ["--home", fakeHome, "--config-dir", configDir, "--path", env.PATH, "--timestamp", "2026-01-01T00:00:00.000Z", "--json"], env);
  assert.equal(result.status, 0, result.stderr);
  const inventory = JSON.parse(result.stdout);
  assert.equal(inventory.detected_at, "2026-01-01T00:00:00.000Z");
  assert.equal(inventory.tools.codex.installed, true);
  assert.equal(inventory.tools.opencode.installed, true);
  assert.equal(inventory.tools.agy.installed, true);
  assert.equal(inventory.tools.ollama.installed, true);
  assert.ok(inventory.surfaces.ollama.detected_models.some((item) => item.model === "qwen3-coder:latest"));
  assert.ok(inventory.surfaces.ollama.detected_models.some((item) => item.model === "gemini-3-flash-preview:latest" && item.execution_mode === "cloud_cli" && item.remote_model === true));
  assert.ok(inventory.surfaces.agy.detected_models.some((item) => item.model === "gemini-3.5-flash-high" && item.display_name === "Gemini 3.5 Flash (High)"));
  assert.ok(inventory.surfaces.agy.detected_models.some((item) => item.model === "claude-opus-4.6-thinking" && item.provider === "anthropic"));
  assert.ok(inventory.surfaces.opencode.detected_models.some((item) => item.model === "gpt-5.5"));
  assert.ok(inventory.redactions.secrets_found >= 2);
  assert.doesNotMatch(JSON.stringify(inventory), /should-not-leak/);
});

run("write config dry run", () => {
  const result = nodeScript("skills/orchestrator-init/scripts/write-config.mjs", ["--config-dir", configDir, "--timestamp", "2026-01-01T00:00:00.000Z"], env);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /schema_version: 1/);
  assert.match(result.stdout, /initialized_at: "2026-01-01T00:00:00.000Z"/);
  assert.match(result.stdout, /task_defaults:[\s\S]*general: null[\s\S]*research: null[\s\S]*investigation: null[\s\S]*coding: null[\s\S]*local_private: null/);
  assert.match(result.stdout, /"ollama\/local\/qwen3-coder:latest":/);
  assert.match(result.stdout, /"ollama\/local\/deepseek-v4-pro:cloud":[\s\S]*execution_mode: "cloud_cli"/);
  assert.match(result.stdout, /"ollama\/local\/gemini-3-flash-preview:latest":[\s\S]*execution_mode: "cloud_cli"/);
  assert.match(result.stdout, /"ollama\/local\/gpt-oss:120b-cloud":[\s\S]*execution_mode: "cloud_cli"/);
  assert.match(result.stdout, /"agy\/google\/gemini-3.5-flash-high":[\s\S]*display_name: "Gemini 3.5 Flash \(High\)"[\s\S]*command: "agy --model \\"Gemini 3.5 Flash \(High\)\\" --print"[\s\S]*cost_tier: "premium"/);
  assert.match(result.stdout, /"agy\/google\/gemini-3.5-flash-low":[\s\S]*cost_tier: "cheap"/);
  assert.match(result.stdout, /"agy\/anthropic\/claude-opus-4.6-thinking":[\s\S]*cost_tier: "premium"/);
  assert.doesNotMatch(result.stdout.match(/"ollama\/local\/deepseek-v4-pro:cloud":[\s\S]*?(?=\n  "ollama\/|\ncustom_routes:)/)?.[0] || "", /private_context|local_work/);
  assert.doesNotMatch(result.stdout.match(/"ollama\/local\/gemini-3-flash-preview:latest":[\s\S]*?(?=\n  "ollama\/|\ncustom_routes:)/)?.[0] || "", /private_context|local_work/);
  assert.doesNotMatch(result.stdout.match(/"ollama\/local\/gpt-oss:120b-cloud":[\s\S]*?(?=\n  "ollama\/|\ncustom_routes:)/)?.[0] || "", /private_context|local_work/);
  assert.match(result.stdout, /enabled: false/);
  fs.writeFileSync(path.join(configDir, "config.yaml"), enableRoutes(result.stdout, ["opencode/openai/gpt-5.5", "ollama/local/qwen3-coder:latest"]));
});

run("delegate honors configured task defaults", () => {
  const base = fs.readFileSync(path.join(configDir, "config.yaml"), "utf8");
  const withDefaults = setTaskDefaults(base, {
    general: "ollama/local/qwen3-coder:latest",
    research: "opencode/openai/gpt-5.5",
    coding: "ollama/local/qwen3-coder:latest",
    local_private: "ollama/local/qwen3-coder:latest",
  });
  const defaultsConfig = path.join(configDir, "defaults.yaml");
  fs.writeFileSync(defaultsConfig, withDefaults);

  const research = nodeScript("skills/orchestrator-delegate/scripts/route-task.mjs", ["--config", defaultsConfig, "--task", "Research latest approaches and compare sources", "--json"], env);
  assert.equal(research.status, 0, research.stderr);
  const researchPlan = JSON.parse(research.stdout);
  assert.equal(researchPlan.selected_route, "opencode/openai/gpt-5.5");
  assert.ok(researchPlan.reasons.includes("configured default for this task type"));
});

run("write config dry-run wins over write", () => {
  const target = path.join(configDir, "dry-run-wins.yaml");
  const result = nodeScript("skills/orchestrator-init/scripts/write-config.mjs", ["--config-dir", configDir, "--output", target, "--write", "--dry-run", "--timestamp", "2026-01-01T00:00:00.000Z"], env);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /schema_version: 1/);
  assert.equal(fs.existsSync(target), false);
});

run("write config applies interview overrides", () => {
  const result = nodeScript("skills/orchestrator-init/scripts/write-config.mjs", [
    "--config-dir", configDir,
    "--enable-all",
    "--profile", "balanced",
    "--route-defaults", "general=codex/openai/gpt-5.5,document_analysis=agy/google/gemini-3.5-flash-high,local_private=codex/openai/gpt-5.5",
    "--timestamp", "2026-01-01T00:00:00.000Z",
  ], env);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /general: "codex\/openai\/gpt-5.5"/);
  assert.match(result.stdout, /document_analysis: "agy\/google\/gemini-3.5-flash-high"/);
  assert.match(result.stdout, /local_private: "codex\/openai\/gpt-5.5"/);
  assert.doesNotMatch(result.stdout, /enabled: false/);
});

run("delegate chooses local route for sensitive coding", () => {
  const result = nodeScript("skills/orchestrator-delegate/scripts/route-task.mjs", ["--config", path.join(configDir, "config.yaml"), "--task", "Fix code using customer PII logs locally", "--json"], env);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.match(plan.selected_route, /ollama\/local\/qwen3-coder/);
  assert.equal(plan.classification.sensitive, true);
});

run("delegate treats non-English sensitive terms as sensitive", () => {
  const result = nodeScript("skills/orchestrator-delegate/scripts/route-task.mjs", ["--config", path.join(configDir, "config.yaml"), "--task", "Corrigir bug usando dados pessoais do cliente em produção", "--json"], env);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.classification.sensitive, true);
  assert.match(plan.selected_route, /ollama\/local\/qwen3-coder/);
});

run("delegate positional parsing ignores option values", () => {
  const result = nodeScript("skills/orchestrator-delegate/scripts/route-task.mjs", ["--config", path.join(configDir, "config.yaml"), "--json", "Fix customer PII bug locally"], env);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.task, "Fix customer PII bug locally");
  assert.doesNotMatch(plan.task, /config\.yaml/);
});

run("swarm refuses one enabled route", () => {
  const oneRouteConfig = path.join(configDir, "one-route.yaml");
  fs.writeFileSync(oneRouteConfig, enableOnlyFirstRoute(fs.readFileSync(path.join(configDir, "config.yaml"), "utf8")));
  const result = nodeScript("skills/orchestrator-swarm/scripts/plan-swarm.mjs", ["--config", oneRouteConfig, "--task", "Validate this plan", "--json"], env);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /requires at least two/i);
});

run("swarm plans with two distinct routes", () => {
  const result = nodeScript("skills/orchestrator-swarm/scripts/plan-swarm.mjs", ["--config", path.join(configDir, "config.yaml"), "--task", "Validate this plan", "--json"], env);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.confirmation_required, true);
  assert.ok(plan.routes.length >= 2);
});

run("swarm positional parsing ignores option values", () => {
  const result = nodeScript("skills/orchestrator-swarm/scripts/plan-swarm.mjs", ["--config", path.join(configDir, "config.yaml"), "--json", "Validate this plan"], env);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.task, "Validate this plan");
});

run("create run directory", () => {
  const result = nodeScript("skills/orchestrator-swarm/scripts/create-run.mjs", ["--root", path.join(tmp, "runs"), "--task", "Compare agents"], env);
  assert.equal(result.status, 0, result.stderr);
  const runDir = result.stdout.trim();
  assert.ok(fs.existsSync(path.join(runDir, "run.yaml")));
  assert.ok(fs.existsSync(path.join(runDir, "prompts")));
});

run("install commands dry run does not write", () => {
  const target = path.join(tmp, "claude-commands");
  const result = nodeScript("skills/orchestrator-init/scripts/install-commands.mjs", ["--target", target], env);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /dry run/i);
  assert.equal(fs.existsSync(target), false);

  const dryRunWins = nodeScript("skills/orchestrator-init/scripts/install-commands.mjs", ["--target", target, "--write", "--dry-run"], env);
  assert.equal(dryRunWins.status, 0, dryRunWins.stderr);
  assert.match(dryRunWins.stdout, /dry run/i);
  assert.equal(fs.existsSync(target), false);
});

run("smoke test dry-run wins over write", () => {
  const inventoryPath = path.join(configDir, "inventory.json");
  const before = fs.readFileSync(inventoryPath, "utf8");
  const result = nodeScript("skills/orchestrator-init/scripts/smoke-test.mjs", ["--config-dir", configDir, "--confirmed", "--write", "--dry-run"], env);
  assert.equal(result.status, 0, result.stderr);
  const outputInventory = JSON.parse(result.stdout);
  assert.equal(outputInventory.tools.codex.smoke_test_ok, true);
  assert.equal(outputInventory.tools.agy.smoke_test_ok, true);
  assert.equal(fs.readFileSync(inventoryPath, "utf8"), before);
});

run("compare results writes comparison", () => {
  const runDir = path.join(tmp, "compare-run");
  const outputsDir = path.join(runDir, "outputs");
  fs.mkdirSync(outputsDir, { recursive: true });
  fs.writeFileSync(path.join(outputsDir, "route-a.md"), "Implemented fix. Tests passed. Evidence: commit abc.");
  fs.writeFileSync(path.join(outputsDir, "route-b.md"), "Some concerns. Tests failed. Risk: regression.");
  const result = nodeScript("skills/orchestrator-swarm/scripts/compare-results.mjs", ["--run-dir", runDir, "--mode", "worktree_competition"], env);
  assert.equal(result.status, 0, result.stderr);
  const comparison = fs.readFileSync(path.join(runDir, "comparison.md"), "utf8");
  assert.match(comparison, /Recommended route: route-a/);
  assert.match(comparison, /Do not apply/);
});

run("create worktrees refuses dirty checkout", () => {
  const repo = path.join(tmp, "dirty-repo");
  fs.mkdirSync(repo, { recursive: true });
  git(repo, ["init"]);
  fs.writeFileSync(path.join(repo, "README.md"), "clean\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "init"]);
  fs.writeFileSync(path.join(repo, "dirty.txt"), "dirty\n");
  const result = nodeScript("skills/orchestrator-swarm/scripts/create-worktrees.mjs", ["--run-id", "test-run", "--routes", "route-a,route-b", "--root", path.join(tmp, "worktrees")], env, repo);
  assert.equal(result.status, 4);
  assert.match(result.stderr, /dirty checkout/i);
});

run("create worktrees is dry-run by default and requires two routes", () => {
  const repo = path.join(tmp, "clean-repo");
  fs.mkdirSync(repo, { recursive: true });
  git(repo, ["init"]);
  fs.writeFileSync(path.join(repo, "README.md"), "clean\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "init"]);

  const oneRoute = nodeScript("skills/orchestrator-swarm/scripts/create-worktrees.mjs", ["--run-id", "test-run", "--routes", "route-a", "--root", path.join(tmp, "worktrees")], env, repo);
  assert.equal(oneRoute.status, 3);
  assert.match(oneRoute.stderr, /at least two/i);

  const dryRun = nodeScript("skills/orchestrator-swarm/scripts/create-worktrees.mjs", ["--run-id", "test-run", "--routes", "route-a,route-b", "--root", path.join(tmp, "worktrees")], env, repo);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  const parsed = JSON.parse(dryRun.stdout);
  assert.equal(parsed.dry_run, true);
  assert.equal(parsed.worktrees.length, 2);
  assert.equal(fs.existsSync(parsed.baseDir), false);

  const writeOnly = nodeScript("skills/orchestrator-swarm/scripts/create-worktrees.mjs", ["--run-id", "write-only", "--routes", "route-a,route-b", "--root", path.join(tmp, "worktrees"), "--write"], env, repo);
  assert.equal(writeOnly.status, 0, writeOnly.stderr);
  const writeOnlyParsed = JSON.parse(writeOnly.stdout);
  assert.equal(writeOnlyParsed.dry_run, true);
  assert.equal(fs.existsSync(writeOnlyParsed.baseDir), false);

  const confirmedOnly = nodeScript("skills/orchestrator-swarm/scripts/create-worktrees.mjs", ["--run-id", "confirmed-only", "--routes", "route-a,route-b", "--root", path.join(tmp, "worktrees"), "--confirmed"], env, repo);
  assert.equal(confirmedOnly.status, 0, confirmedOnly.stderr);
  const confirmedOnlyParsed = JSON.parse(confirmedOnly.stdout);
  assert.equal(confirmedOnlyParsed.dry_run, true);
  assert.equal(fs.existsSync(confirmedOnlyParsed.baseDir), false);

  const confirmedWrite = nodeScript("skills/orchestrator-swarm/scripts/create-worktrees.mjs", ["--run-id", "confirmed-write", "--routes", "route-a,route-b", "--root", path.join(tmp, "worktrees"), "--write", "--confirmed"], env, repo);
  assert.equal(confirmedWrite.status, 0, confirmedWrite.stderr);
  const confirmedWriteParsed = JSON.parse(confirmedWrite.stdout);
  assert.equal(confirmedWriteParsed.dry_run, false);
  assert.equal(confirmedWriteParsed.worktrees.length, 2);
  assert.ok(confirmedWriteParsed.worktrees.every((worktree) => worktree.ok && fs.existsSync(worktree.path)));

  const dryRunWins = nodeScript("skills/orchestrator-swarm/scripts/create-worktrees.mjs", ["--run-id", "dry-run-wins", "--routes", "route-a,route-b", "--root", path.join(tmp, "worktrees"), "--write", "--confirmed", "--dry-run"], env, repo);
  assert.equal(dryRunWins.status, 0, dryRunWins.stderr);
  const dryRunWinsParsed = JSON.parse(dryRunWins.stdout);
  assert.equal(dryRunWinsParsed.dry_run, true);
  assert.equal(fs.existsSync(dryRunWinsParsed.baseDir), false);
});

console.log("All tests passed");

function run(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function writeExecutable(name, content) {
  const filePath = path.join(fakeBin, name);
  fs.writeFileSync(filePath, content);
  fs.chmodSync(filePath, 0o755);
}

function nodeScript(relativePath, args, runEnv, cwd = repoRoot) {
  return spawnSync(process.execPath, [path.join(repoRoot, relativePath), ...args], {
    encoding: "utf8",
    env: runEnv,
    cwd,
  });
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function enableRoutes(yaml, routeIds) {
  const lines = yaml.split(/\r?\n/);
  let currentRoute = null;
  return lines.map((line) => {
    const routeMatch = line.match(/^  "([^"]+)":$/);
    if (routeMatch) currentRoute = routeMatch[1];
    if (currentRoute && line.trim() === "enabled: false" && routeIds.includes(currentRoute)) {
      return line.replace("enabled: false", "enabled: true");
    }
    return line;
  }).join("\n");
}

function enableOnlyFirstRoute(yaml) {
  let count = 0;
  return yaml.replace(/enabled: true/g, () => {
    count += 1;
    return count === 1 ? "enabled: true" : "enabled: false";
  });
}

function setTaskDefaults(yaml, defaults) {
  const lines = yaml.split(/\r?\n/);
  let inside = false;
  return lines.map((line) => {
    if (/^  task_defaults:$/.test(line)) {
      inside = true;
      return line;
    }
    if (inside && /^  [A-Za-z_]+:/.test(line)) inside = false;
    if (inside) {
      for (const [key, value] of Object.entries(defaults)) {
        if (line.trim() === `${key}: null`) return line.replace(`${key}: null`, `${key}: ${JSON.stringify(value)}`);
      }
    }
    return line;
  }).join("\n");
}
