#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), ".config", "ai-orchestrator");
const args = parseArgs(process.argv.slice(2));
const configDir = expandPath(args["config-dir"] || process.env.AI_ORCHESTRATOR_CONFIG_DIR || DEFAULT_CONFIG_DIR);
const outputPath = expandPath(args.output || path.join(configDir, "inventory.json"));
const homeDir = expandPath(args.home || os.homedir());
const pathEnv = args.path || process.env.PATH || "";
const timestamp = args.timestamp || process.env.AI_ORCHESTRATOR_TIMESTAMP || new Date().toISOString();

const TOOL_DETECTORS = [
  { id: "claude", command: "claude", surface: "claude_code" },
  { id: "codex", command: "codex", surface: "codex" },
  { id: "opencode", command: "opencode", surface: "opencode" },
  { id: "agy", command: "agy", surface: "agy" },
  { id: "gemini", command: "gemini", surface: "gemini" },
  { id: "qwen", command: "qwen", surface: "qwen" },
  { id: "ollama", command: "ollama", surface: "ollama" },
  { id: "gh", command: "gh", surface: "github" },
  { id: "aider", command: "aider", surface: "aider" },
  { id: "cursor", command: "cursor", surface: "cursor" },
  { id: "code", command: "code", surface: "vscode" },
  { id: "windsurf", command: "windsurf", surface: "windsurf" },
  { id: "docker", command: "docker", surface: "docker" },
  { id: "lmstudio", command: "lmstudio", surface: "lmstudio" },
  { id: "vllm", command: "vllm", surface: "vllm" },
  { id: "sglang", command: "sglang", surface: "sglang" },
  { id: "goose", command: "goose", surface: "goose" },
  { id: "crush", command: "crush", surface: "crush" },
  { id: "amp", command: "amp", surface: "amp" },
  { id: "warp", command: "warp", surface: "warp" },
];

const CONFIG_CANDIDATES = [
  { surface: "opencode", paths: ["~/.config/opencode/opencode.json", "~/.opencode.json", "~/.opencode/opencode.json"] },
  { surface: "codex", paths: ["~/.codex/config.toml", "~/.codex/config.json", "~/.config/codex/config.toml"] },
  { surface: "claude_code", paths: ["~/.claude/settings.json", "~/.claude/settings.local.json"] },
  { surface: "gemini", paths: ["~/.gemini/settings.json", "~/.config/gemini/settings.json"] },
  { surface: "qwen", paths: ["~/.qwen/config.json", "~/.config/qwen/config.json"] },
  { surface: "aider", paths: ["~/.aider.conf.yml", "~/.aider.model.settings.yml"] },
  { surface: "continue", paths: ["~/.continue/config.json", "~/.continue/config.yaml"] },
  { surface: "lmstudio", paths: ["~/.config/LM Studio/settings.json", "~/.cache/lm-studio/models.json"] },
];

const inventory = {
  schema_version: 1,
  detected_at: timestamp,
  tools: {},
  surfaces: {},
  redactions: {
    secrets_found: 0,
    redacted_fields: [],
  },
};

for (const detector of TOOL_DETECTORS) {
  const foundPath = which(detector.command, pathEnv);
  const tool = {
    command: detector.command,
    path: foundPath,
    installed: Boolean(foundPath),
    version: "unknown",
    help_ok: false,
    auth_ok: "unknown",
    smoke_test_ok: "not_run",
    config_files: [],
  };

  if (foundPath) {
    const version = runFirstOk(foundPath, [["--version"], ["version"], ["-v"]], 3000);
    tool.version = cleanOneLine(version.stdout || version.stderr || "unknown");
    const help = runCommand(foundPath, ["--help"], 3000);
    tool.help_ok = help.status === 0 || Boolean(help.stdout || help.stderr);
  }

  inventory.tools[detector.id] = tool;
  ensureSurface(detector.surface).installed = Boolean(foundPath);
  ensureSurface(detector.surface).command = detector.command;
  ensureSurface(detector.surface).path = foundPath;
}

for (const candidate of CONFIG_CANDIDATES) {
  const surface = ensureSurface(candidate.surface);
  surface.config_files = surface.config_files || [];
  surface.detected_models = surface.detected_models || [];

  for (const rawPath of candidate.paths) {
    const filePath = expandPath(rawPath, homeDir);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;

    const rel = abbreviateHome(filePath, homeDir);
    surface.config_files.push(rel);
    const parsed = readConfigFile(filePath);
    if (parsed.redactions.secrets_found) {
      inventory.redactions.secrets_found += parsed.redactions.secrets_found;
      inventory.redactions.redacted_fields.push(...parsed.redactions.redacted_fields.map((field) => `${rel}:${field}`));
    }
    const models = extractModels(parsed.value, parsed.text).sort((a, b) => `${a.provider}/${a.model}`.localeCompare(`${b.provider}/${b.model}`));
    for (const model of models) {
      surface.detected_models.push({
        provider: model.provider || inferProvider(model.model || model.name || ""),
        model: model.model || model.name,
        source: rel,
        enabled_in_source: model.enabled ?? true,
      });
    }
  }
}

if (inventory.tools.ollama?.installed) {
  const ollama = runCommand(inventory.tools.ollama.path, ["list"], 5000);
  const surface = ensureSurface("ollama");
  surface.detected_models = surface.detected_models || [];
  surface.ollama_list_ok = ollama.status === 0;
  if (ollama.status === 0) {
    for (const modelName of parseOllamaList(ollama.stdout).sort()) {
      const metadata = inspectOllamaModel(inventory.tools.ollama.path, modelName);
      surface.detected_models.push({
        provider: "local",
        model: modelName,
        source: "ollama list",
        enabled_in_source: true,
        ...metadata,
      });
    }
  }
}

if (inventory.tools.agy?.installed) {
  const agy = runCommand(inventory.tools.agy.path, ["models"], 10000);
  const surface = ensureSurface("agy");
  surface.detected_models = surface.detected_models || [];
  surface.models_ok = agy.status === 0;
  if (agy.status === 0) {
    for (const displayName of parseAgyModels(agy.stdout).sort()) {
      const parsed = parseAgyModel(displayName);
      surface.detected_models.push({
        provider: parsed.provider,
        model: parsed.slug,
        display_name: displayName,
        source: "agy models",
        enabled_in_source: true,
        execution_mode: "local_cli",
        cost_tier: parsed.cost_tier,
        tier: parsed.tier,
      });
    }
  }
}

for (const [toolId, tool] of Object.entries(inventory.tools)) {
  const surface = TOOL_DETECTORS.find((item) => item.id === toolId)?.surface;
  if (!surface) continue;
  tool.config_files = inventory.surfaces[surface]?.config_files || [];
}

for (const surface of Object.values(inventory.surfaces)) {
  if (surface.config_files) surface.config_files.sort();
  if (surface.detected_models) {
    surface.detected_models.sort((a, b) => `${a.provider}/${a.model}/${a.source}`.localeCompare(`${b.provider}/${b.model}/${b.source}`));
  }
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");

if (args.json) {
  process.stdout.write(JSON.stringify(inventory, null, 2));
} else {
  console.log(`Inventory written to ${outputPath}`);
  console.log(`Detected ${Object.values(inventory.tools).filter((tool) => tool.installed).length} installed tool(s).`);
  console.log(`Detected ${Object.values(inventory.surfaces).reduce((sum, surface) => sum + (surface.detected_models?.length || 0), 0)} configured/local model route candidate(s).`);
  if (inventory.redactions.secrets_found) {
    console.log(`Redacted ${inventory.redactions.secrets_found} secret-like field(s).`);
  }
}

function ensureSurface(name) {
  inventory.surfaces[name] = inventory.surfaces[name] || {
    installed: false,
    config_files: [],
    detected_models: [],
  };
  return inventory.surfaces[name];
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function expandPath(value, baseHome = os.homedir()) {
  if (!value) return value;
  if (value === "~") return baseHome;
  if (value.startsWith("~/")) return path.join(baseHome, value.slice(2));
  return path.resolve(value);
}

function abbreviateHome(value, baseHome = os.homedir()) {
  return value.startsWith(baseHome) ? `~${value.slice(baseHome.length)}` : value;
}

function which(command, envPath) {
  const pathParts = envPath.split(path.delimiter).filter(Boolean);
  const candidates = process.platform === "win32" ? [command, `${command}.cmd`, `${command}.exe`] : [command];
  for (const dir of pathParts) {
    for (const candidate of candidates) {
      const full = path.join(dir, candidate);
      try {
        fs.accessSync(full, fs.constants.X_OK);
        return full;
      } catch {
        // continue
      }
    }
  }
  return null;
}

function runCommand(command, argsToRun, timeout) {
  const result = spawnSync(command, argsToRun, {
    encoding: "utf8",
    timeout,
    env: process.env,
  });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error?.message,
  };
}

function runFirstOk(command, argSets, timeout) {
  let last = { stdout: "", stderr: "" };
  for (const argSet of argSets) {
    const result = runCommand(command, argSet, timeout);
    last = result;
    if (result.status === 0 && (result.stdout || result.stderr)) return result;
  }
  return last;
}

function cleanOneLine(value) {
  return String(value || "unknown").split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || "unknown";
}

function readConfigFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const redactions = { secrets_found: 0, redacted_fields: [] };
  let value = null;
  if (filePath.endsWith(".json")) {
    try {
      value = redactObject(JSON.parse(text), redactions);
    } catch {
      value = null;
    }
  }
  return { text: redactText(text, redactions), value, redactions };
}

function redactObject(input, redactions, pathParts = []) {
  if (Array.isArray(input)) return input.map((item, index) => redactObject(item, redactions, [...pathParts, String(index)]));
  if (!input || typeof input !== "object") return input;
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    const joined = [...pathParts, key].join(".");
    if (isSecretKey(key)) {
      out[key] = "<redacted>";
      redactions.secrets_found += 1;
      redactions.redacted_fields.push(joined);
    } else {
      out[key] = redactObject(value, redactions, [...pathParts, key]);
    }
  }
  return out;
}

function redactText(text, redactions) {
  return text.replace(/([A-Za-z0-9_.-]*(?:api[_-]?key|token|secret|password|credential|auth)[A-Za-z0-9_.-]*\s*[:=]\s*)(["']?)([^"'\n#]+)/gi, (_match, prefix, quote) => {
    redactions.secrets_found += 1;
    redactions.redacted_fields.push(prefix.trim().replace(/[:=]$/, ""));
    return `${prefix}${quote}<redacted>`;
  });
}

function isSecretKey(key) {
  return /api[_-]?key|token|secret|password|credential|auth/i.test(key);
}

function extractModels(value, text) {
  const found = new Map();
  const add = (model, provider, enabled = true) => {
    if (!model || typeof model !== "string") return;
    const cleaned = model.trim();
    if (!cleaned || cleaned === "<redacted>") return;
    const key = `${provider || inferProvider(cleaned)}/${cleaned}`;
    found.set(key, { provider: provider || inferProvider(cleaned), model: cleaned, enabled });
  };

  walk(value, (key, current, parent) => {
    if (typeof current === "string" && /model|models|defaultModel|modelID|modelName/i.test(key)) {
      add(current, parent?.provider || parent?.apiProvider || parent?.name);
    }
    if (Array.isArray(current) && /models/i.test(key)) {
      for (const item of current) {
        if (typeof item === "string") add(item, parent?.provider || parent?.name);
        if (item && typeof item === "object") add(item.model || item.name || item.id, item.provider || parent?.provider || parent?.name, item.enabled);
      }
    }
  });

  const modelRegexes = [
    /(?:model|default_model|defaultModel|modelName|modelID)\s*[:=]\s*["']?([A-Za-z0-9_.:/@+-]+)/g,
    /(?:openai|anthropic|google|gemini|deepseek|qwen|mistral|kimi|xai|ollama)[/:][A-Za-z0-9_.:@+-]+/gi,
  ];
  for (const regex of modelRegexes) {
    let match;
    while ((match = regex.exec(text))) {
      add(match[1] || match[0], inferProvider(match[1] || match[0]));
    }
  }

  return [...found.values()];
}

function walk(value, callback, parent = null, key = "") {
  if (!value || typeof value !== "object") return;
  callback(key, value, parent);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, callback, value, String(index)));
  } else {
    for (const [childKey, childValue] of Object.entries(value)) {
      callback(childKey, childValue, value);
      walk(childValue, callback, value, childKey);
    }
  }
}

function inferProvider(model) {
  const lower = String(model || "").toLowerCase();
  if (lower.includes("claude") || lower.includes("anthropic")) return "anthropic";
  if (lower.includes("gpt") || lower.includes("openai") || lower.includes("codex")) return "openai";
  if (lower.includes("gemini") || lower.includes("google")) return "google";
  if (lower.includes("deepseek")) return "deepseek";
  if (lower.includes("qwen")) return "qwen";
  if (lower.includes("mistral") || lower.includes("codestral") || lower.includes("devstral")) return "mistral";
  if (lower.includes("kimi")) return "moonshot";
  if (lower.includes("grok") || lower.includes("xai")) return "xai";
  if (lower.includes("llama") || lower.includes("gemma") || lower.includes("ollama")) return "local";
  return "unknown";
}

function parseOllamaList(stdout) {
  return stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function inspectOllamaModel(ollamaPath, modelName) {
  const show = runCommand(ollamaPath, ["show", modelName], 5000);
  const text = `${show.stdout}\n${show.stderr}`;
  const remote = isOllamaNamedCloud(modelName) || /Remote model|Remote URL/i.test(text);
  return {
    execution_mode: remote ? "cloud_cli" : "local_model",
    remote_model: remote,
    ollama_show_ok: show.status === 0,
  };
}

function isOllamaNamedCloud(modelName) {
  return /(^|[:_-])cloud$/i.test(String(modelName || ""));
}

function parseAgyModels(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^Usage\b|^Available subcommands:/i.test(line));
}

function parseAgyModel(displayName) {
  const tierMatch = displayName.match(/\(([^)]+)\)\s*$/);
  const tier = tierMatch?.[1] || "Default";
  const baseName = displayName.replace(/\s*\([^)]+\)\s*$/, "");
  const provider = inferProvider(baseName);
  const slug = `${baseName}-${tier}`.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "");
  const tierLower = tier.toLowerCase();
  const cost_tier = /high|opus|thinking|pro/.test(`${tierLower} ${baseName.toLowerCase()}`) ? "premium" : tierLower.includes("low") || baseName.toLowerCase().includes("flash") ? "cheap" : "standard";
  return { provider, slug, tier, cost_tier };
}
