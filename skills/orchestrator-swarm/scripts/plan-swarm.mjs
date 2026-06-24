#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_CONFIG = path.join(os.homedir(), ".config", "ai-orchestrator", "config.yaml");
const args = parseArgs(process.argv.slice(2));
const configPath = expandPath(args.config || DEFAULT_CONFIG);
const task = args.task || process.argv.slice(2).filter((arg) => !arg.startsWith("--")).join(" ");
const mode = args.mode || "specialist";

if (!fs.existsSync(configPath)) {
  console.error(`Orchestrator is not initialized. Missing config: ${configPath}`);
  console.error("Run /orchestrator:init first.");
  process.exit(2);
}

const config = readConfig(configPath);
const routes = collectRoutes(config).filter((route) => route.enabled !== false);
const distinctRoutes = dedupeRoutes(routes, mode);

if (distinctRoutes.length < 2) {
  console.error("Swarm requires at least two enabled distinct routes.");
  console.error("Run /orchestrator:init or /orchestrator:config to add routes, or use /orchestrator:delegate instead.");
  process.exit(3);
}

const selected = selectRoutes(distinctRoutes, mode, Number(args.count || Math.min(config.swarm?.max_parallel_agents || 4, distinctRoutes.length)));
const runId = buildRunId(task);
const plan = {
  mode,
  run_id: runId,
  task,
  routes: selected.map((route, index) => ({
    id: route.id,
    role: roleFor(mode, index),
    cost_tier: route.cost_tier,
    execution_mode: route.execution_mode,
    receives: ["task summary", "success criteria", "allowed context", "output contract"],
  })),
  confirmation_required: true,
  cost_privacy_summary: summarizeCostPrivacy(selected),
  artifacts: mode === "worktree_competition"
    ? ["per-route branch", "per-route commit", ".orchestrator/runs/<run-id>/comparison.md"]
    : [".orchestrator/runs/<run-id>/prompts", ".orchestrator/runs/<run-id>/outputs", ".orchestrator/runs/<run-id>/comparison.md"],
};

if (args.json) {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
} else {
  console.log("Swarm Plan");
  console.log(`Mode: ${plan.mode}`);
  console.log(`Run: ${plan.run_id}`);
  console.log(`Task: ${plan.task || "(not provided)"}`);
  console.log("Routes:");
  for (const route of plan.routes) {
    console.log(`- ${route.id}: ${route.role} (${route.cost_tier}, ${route.execution_mode})`);
  }
  console.log(`Cost/privacy: ${plan.cost_privacy_summary}`);
  console.log("Proceed? Confirmation required before dispatch.");
}

function collectRoutes(config) {
  const routeObjects = [];
  for (const [id, route] of Object.entries(config.routes || {})) routeObjects.push({ id, ...route });
  for (const [id, route] of Object.entries(config.custom_routes || {})) routeObjects.push({ id, ...route, custom: true });
  return routeObjects;
}

function dedupeRoutes(routes, selectedMode) {
  if (selectedMode === "compare_harnesses") return routes;
  const seenModels = new Set();
  const out = [];
  for (const route of routes) {
    const modelKey = `${route.provider}/${route.model}`;
    if (seenModels.has(modelKey)) continue;
    seenModels.add(modelKey);
    out.push(route);
  }
  return out;
}

function selectRoutes(routes, selectedMode, count) {
  const sorted = [...routes].sort((a, b) => tierWeight(a.cost_tier) - tierWeight(b.cost_tier));
  if (selectedMode === "best") return [...routes].sort((a, b) => tierWeight(b.cost_tier) - tierWeight(a.cost_tier)).slice(0, count);
  return sorted.slice(0, count);
}

function tierWeight(tier) {
  return { local: 0, cheap: 1, standard: 2, internal: 2, premium: 3, unknown: 2 }[tier] ?? 2;
}

function roleFor(selectedMode, index) {
  if (selectedMode === "specialist") return ["scout", "planner", "executor", "validator"][index] || "reviewer";
  if (selectedMode === "review_council") return ["skeptic", "critic", "validator", "security_reviewer"][index] || "reviewer";
  return "competitor";
}

function summarizeCostPrivacy(routes) {
  const premium = routes.filter((route) => route.cost_tier === "premium").length;
  const external = routes.filter((route) => !["local", "local_model"].includes(route.execution_mode) && route.cost_tier !== "local").length;
  return `${premium} premium route(s), ${external} non-local route(s). Paid fan-out and sensitive external data require confirmation.`;
}

function buildRunId(input) {
  const slug = String(input || "swarm").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "swarm";
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
  return `${stamp}-${slug}`;
}

function readConfig(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  if (filePath.endsWith(".json")) return JSON.parse(text);
  return parseSimpleYaml(text);
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

function parseSimpleYaml(text) {
  const root = {};
  const stack = [{ indent: -1, value: root }];
  const lines = text.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const raw = lines[lineIndex];
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const indent = raw.match(/^ */)[0].length;
    const line = raw.trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].value;
    if (line.startsWith("- ")) {
      if (Array.isArray(parent)) parent.push(parseScalar(line.slice(2).trim()));
      continue;
    }
    const idx = findKeySeparator(line);
    if (idx === -1) continue;
    const key = unquote(line.slice(0, idx).trim());
    const rest = line.slice(idx + 1).trim();
    if (!rest) {
      const next = lines.slice(lineIndex + 1).find((candidate) => candidate.trim() && !candidate.trim().startsWith("#"));
      const value = next?.trim().startsWith("- ") ? [] : {};
      parent[key] = value;
      stack.push({ indent, value });
    } else {
      parent[key] = parseScalar(rest);
    }
  }
  return root;
}

function parseScalar(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (value === "[]") return [];
  if (value === "{}") return {};
  return unquote(value);
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}

function findKeySeparator(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if ((char === '"' || char === "'") && line[i - 1] !== "\\") {
      quote = quote === char ? null : quote || char;
    }
    if (char === ":" && !quote) return i;
  }
  return -1;
}
