#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
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

writeExecutable("ollama", `#!/usr/bin/env bash
if [ "$1" = "--version" ]; then echo "ollama 0.9.0"; exit 0; fi
if [ "$1" = "--help" ]; then echo "ollama help"; exit 0; fi
if [ "$1" = "list" ]; then
  echo "NAME ID SIZE MODIFIED"
  echo "qwen3-coder:latest abc 10GB today"
  echo "gemma3:12b def 8GB today"
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
  const result = nodeScript("skills/orchestrator-init/scripts/detect-environment.mjs", ["--home", fakeHome, "--config-dir", configDir, "--path", env.PATH, "--json"], env);
  assert.equal(result.status, 0, result.stderr);
  const inventory = JSON.parse(result.stdout);
  assert.equal(inventory.tools.codex.installed, true);
  assert.equal(inventory.tools.opencode.installed, true);
  assert.equal(inventory.tools.ollama.installed, true);
  assert.ok(inventory.surfaces.ollama.detected_models.some((item) => item.model === "qwen3-coder:latest"));
  assert.ok(inventory.surfaces.opencode.detected_models.some((item) => item.model === "gpt-5.5"));
  assert.ok(inventory.redactions.secrets_found >= 2);
  assert.doesNotMatch(JSON.stringify(inventory), /should-not-leak/);
});

run("write config dry run", () => {
  const result = nodeScript("skills/orchestrator-init/scripts/write-config.mjs", ["--config-dir", configDir], env);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /schema_version: 1/);
  assert.match(result.stdout, /"ollama\/local\/qwen3-coder:latest":/);
  assert.match(result.stdout, /enabled: false/);
  fs.writeFileSync(path.join(configDir, "config.yaml"), enableRoutes(result.stdout, ["opencode/openai/gpt-5.5", "ollama/local/qwen3-coder:latest"]));
});

run("delegate chooses local route for sensitive coding", () => {
  const result = nodeScript("skills/orchestrator-delegate/scripts/route-task.mjs", ["--config", path.join(configDir, "config.yaml"), "--task", "Fix code using customer PII logs locally", "--json"], env);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.match(plan.selected_route, /ollama\/local\/qwen3-coder/);
  assert.equal(plan.classification.sensitive, true);
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

run("create run directory", () => {
  const result = nodeScript("skills/orchestrator-swarm/scripts/create-run.mjs", ["--root", path.join(tmp, "runs"), "--task", "Compare agents"], env);
  assert.equal(result.status, 0, result.stderr);
  const runDir = result.stdout.trim();
  assert.ok(fs.existsSync(path.join(runDir, "run.yaml")));
  assert.ok(fs.existsSync(path.join(runDir, "prompts")));
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

function nodeScript(relativePath, args, runEnv) {
  return spawnSync(process.execPath, [path.join(repoRoot, relativePath), ...args], {
    encoding: "utf8",
    env: runEnv,
  });
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
