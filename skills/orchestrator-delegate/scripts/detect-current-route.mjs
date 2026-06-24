#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_CONFIG = path.join(os.homedir(), ".config", "ai-orchestrator", "config.yaml");
const args = parseArgs(process.argv.slice(2));
const configPath = expandPath(args.config || DEFAULT_CONFIG);

if (!fs.existsSync(configPath)) {
  console.error(`Orchestrator is not initialized. Missing config: ${configPath}`);
  process.exit(2);
}

const config = readConfig(configPath);
const detected = detectCurrentRoute(config, args);
process.stdout.write(`${JSON.stringify(detected || { id: null, source: "unknown" }, null, 2)}\n`);

function detectCurrentRoute(config, parsedArgs) {
  const override = parsedArgs["current-route"] || process.env.AI_ORCHESTRATOR_CURRENT_ROUTE;
  const routes = collectRoutes(config);
  if (override) {
    const route = routes.find((item) => item.id === override);
    return route ? { id: route.id, surface: route.surface, source: "override" } : { id: override, source: "override", unknown: true };
  }
  const surface = detectCurrentSurface();
  if (!surface) return null;
  const candidates = routes.filter((route) => route.surface === surface);
  if (!candidates.length) return { id: null, surface, source: "runtime", unknown: true };
  const defaultModel = surface === "codex" ? "gpt-5.5" : null;
  const preferred = candidates.find((route) => route.model === defaultModel) || candidates[0];
  return { id: preferred.id, surface, source: "runtime" };
}

function detectCurrentSurface() {
  const env = process.env;
  if (env.CODEX_THREAD_ID || env.CODEX_CI) return "codex";
  if (env.CLAUDECODE || env.CLAUDE_CODE || env.CLAUDE_SESSION_ID) return "claude_code";
  if (env.OPENCODE || env.OPENCODE_SESSION_ID) return "opencode";
  if (env.AGY_SESSION_ID || env.ANTIGRAVITY || env.GEMINI_ANTIGRAVITY) return "agy";
  const parent = process.env.AI_ORCHESTRATOR_PARENT_PROCESS || getParentCommand();
  if (/\bcodex\b/i.test(parent)) return "codex";
  if (/\bclaude\b/i.test(parent)) return "claude_code";
  if (/\bopencode\b/i.test(parent)) return "opencode";
  if (/\bagy\b|antigravity/i.test(parent)) return "agy";
  return null;
}

function getParentCommand() {
  const result = spawnSync("ps", ["-o", "comm=,args=", "-p", String(process.ppid)], { encoding: "utf8", timeout: 1000 });
  return `${result.stdout || ""} ${result.stderr || ""}`;
}

function collectRoutes(config) {
  const out = [];
  for (const [id, route] of Object.entries(config.routes || {})) out.push({ id, ...route });
  for (const [id, route] of Object.entries(config.custom_routes || {})) out.push({ id, ...route, custom: true });
  return out;
}

function readConfig(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return filePath.endsWith(".json") ? JSON.parse(text) : parseSimpleYaml(text);
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
  for (const raw of text.split(/\r?\n/)) {
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
      const value = {};
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
    if ((char === '"' || char === "'") && line[i - 1] !== "\\") quote = quote === char ? null : quote || char;
    if (char === ":" && !quote) return i;
  }
  return -1;
}
