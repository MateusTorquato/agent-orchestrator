#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), ".config", "ai-orchestrator");
const args = parseArgs(process.argv.slice(2));
const configDir = expandPath(args["config-dir"] || process.env.AI_ORCHESTRATOR_CONFIG_DIR || DEFAULT_CONFIG_DIR);
const inventoryPath = expandPath(args.inventory || path.join(configDir, "inventory.json"));
const outputPath = expandPath(args.output || path.join(configDir, "config.yaml"));
const write = Boolean(args.write && !args["dry-run"]);
const timestamp = args.timestamp || process.env.AI_ORCHESTRATOR_TIMESTAMP || new Date().toISOString();

if (!fs.existsSync(inventoryPath)) {
  console.error(`Inventory not found: ${inventoryPath}`);
  process.exit(1);
}

const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const config = buildConfig(inventory);
applyOverrides(config, args);
const yaml = toYaml(config);

if (write) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, yaml, "utf8");
  console.log(`Config written to ${outputPath}`);
} else {
  process.stdout.write(yaml);
}

function buildConfig(inventoryData) {
  const routes = {};
  for (const [surfaceName, surface] of Object.entries(inventoryData.surfaces || {}).sort(([a], [b]) => a.localeCompare(b))) {
    for (const model of [...(surface.detected_models || [])].sort((a, b) => `${a.provider}/${a.model}`.localeCompare(`${b.provider}/${b.model}`))) {
      const provider = model.provider || "unknown";
      const modelName = model.model;
      if (!modelName) continue;
      const routeId = `${surfaceName}/${provider}/${modelName}`.replace(/\s+/g, "-");
      const executionMode = classifyExecutionMode(surfaceName, modelName, model);
      const costTier = classifyCost(modelName, surfaceName, model);
      routes[routeId] = {
        enabled: false,
        surface: surfaceName,
        provider,
        model: modelName,
        ...(model.display_name ? { display_name: model.display_name } : {}),
        command: suggestCommand(surfaceName, modelName, model),
        execution_mode: executionMode,
        cost_tier: costTier,
        strengths: suggestStrengths(modelName, surfaceName, model),
        capabilities: suggestCapabilities(surfaceName, modelName, model),
        limits: {
          max_runtime_seconds: surfaceName === "ollama" ? 600 : 1800,
          max_parallel: costTier === "premium" ? 1 : 2,
          max_context: "unknown",
        },
        detected_from: model.source || "inventory",
      };
    }
  }

  return {
    schema_version: 1,
    orchestrator_version: "0.1.0",
    initialized_at: timestamp,
    defaults: {
      profile: "balanced",
      max_parallel_agents: 4,
      task_defaults: {
        general: [],
        research: [],
        investigation: [],
        coding: [],
        code_review: [],
        document_analysis: [],
        local_private: [],
      },
    },
    privacy: {
      external_apis_allowed: "ask",
      sensitive_data_policy: "local_first",
      allow_code_to_external_apis: "ask",
      allow_logs_to_external_apis: "ask",
      allow_documents_to_external_apis: "ask",
    },
    cost: {
      default_policy: "ask_before_paid_fanout",
      max_paid_parallel_agents: 2,
      max_premium_agents_per_swarm: 1,
      prefer_cheap_scouts: true,
      require_confirmation_for: ["premium_route", "paid_parallelism", "long_context", "repeated_retries"],
    },
    profiles: {
      balanced: {
        default: true,
        planner: "best_standard",
        executor: "best_for_task",
        validator: "strong_if_needed",
        cost_policy: "ask_before_premium",
      },
      cheap: {
        prefer: ["local", "cheap", "flash", "mini", "haiku"],
        max_premium_agents: 0,
      },
      best: {
        prefer: ["highest_quality"],
        max_premium_agents: 2,
        require_cost_summary: true,
      },
      local_only: {
        external_apis_allowed: false,
        prefer: ["local"],
      },
    },
    delegate: {
      confirmation: {
        always_for: ["premium_route", "sensitive_external", "cloud_background", "file_edits", "destructive_commands"],
        skip_for: ["local_readonly", "cheap_scout", "planning_only"],
      },
    },
    swarm: {
      max_parallel_agents: 4,
      max_total_agents: 8,
      default_mode: "specialist",
      require_min_distinct_routes: 2,
      allow_same_model_different_harness: false,
      require_compare_harnesses_mode_for_duplicates: true,
      cost_policy: "ask_before_paid_fanout",
      retries: {
        max_per_route: 1,
      },
      worktree_mode: {
        enabled: true,
        worktree_root: "~/.cache/ai-orchestrator/worktrees",
        require_clean_worktree: true,
        require_agent_commit: true,
        cleanup_policy: "ask",
      },
    },
    routes,
    custom_routes: {},
    commands: {
      installed: {
        claude: false,
        codex: false,
        cursor: false,
        opencode: false,
        agy: false,
        kimi: false,
        gemini: false,
      },
    },
  };
}

function applyOverrides(config, parsedArgs) {
  if (parsedArgs["enable-all"]) {
    for (const route of Object.values(config.routes || {})) route.enabled = true;
  }

  if (parsedArgs.profile) {
    config.defaults.profile = parsedArgs.profile;
    for (const [name, profile] of Object.entries(config.profiles || {})) {
      if (typeof profile === "object" && profile) profile.default = name === parsedArgs.profile;
    }
  }

  if (parsedArgs["route-defaults"]) {
    for (const item of String(parsedArgs["route-defaults"]).split(",")) {
      const [key, ...valueParts] = item.split("=");
      const value = valueParts.join("=").trim();
      if (!key?.trim() || !value) continue;
      if (!Object.hasOwn(config.defaults.task_defaults, key.trim())) continue;
      config.defaults.task_defaults[key.trim()] = value.split("|").map((item) => item.trim()).filter(Boolean);
    }
  }
}

function suggestCommand(surface, model, modelRecord = {}) {
  if (surface === "ollama") return `ollama run ${model}`;
  if (surface === "agy") return `agy --model ${JSON.stringify(modelRecord.display_name || model)} --print`;
  if (surface === "codex") return "codex exec";
  if (surface === "claude_code") return "claude";
  if (surface === "opencode") return "opencode run";
  if (surface === "gemini") return "gemini";
  if (surface === "qwen") return "qwen";
  if (surface === "github") return "gh";
  return surface;
}

function classifyExecutionMode(surface, model, modelRecord = {}) {
  if (modelRecord.execution_mode) return modelRecord.execution_mode;
  if (surface === "ollama") return isOllamaCloudModel(model) ? "cloud_cli" : "local_model";
  return "local_cli";
}

function classifyCost(model, surface, modelRecord = {}) {
  if (modelRecord.cost_tier) return modelRecord.cost_tier;
  const lower = `${surface}/${model}`.toLowerCase();
  if (surface === "ollama" && !isOllamaCloudModel(model, modelRecord)) return "local";
  if (lower.includes("local") && !isOllamaCloudModel(model, modelRecord)) return "local";
  if (/opus|flagship|max|pro|long-context|thinking|high/.test(lower)) return "premium";
  if (/mini|flash|haiku|small|lite|nano|fast/.test(lower)) return "cheap";
  return "standard";
}

function suggestStrengths(model, surface, modelRecord = {}) {
  const lower = `${surface}/${model}`.toLowerCase();
  const strengths = new Set();
  if (/codex|coder|code|qwen|devstral|codestral|claude|gpt|glm|deepseek/.test(lower)) {
    strengths.add("coding");
    strengths.add("debugging");
  }
  if (/opus|pro|gpt|claude|glm|deepseek|reason|thinking/.test(lower)) {
    strengths.add("planning");
    strengths.add("validation");
  }
  if (/gemini|mistral|ocr|vision|vl|multimodal|gemma/.test(lower)) {
    strengths.add("document_analysis");
    strengths.add("multimodal");
  }
  if ((/ollama|local|gemma|llama|qwen/.test(lower)) && !isOllamaCloudModel(model, modelRecord)) {
    strengths.add("private_context");
    strengths.add("local_work");
  }
  if (/mini|flash|haiku|small|lite|nano|fast/.test(lower)) {
    strengths.add("cheap_scout");
  }
  return [...strengths].length ? [...strengths] : ["general"];
}

function isOllamaCloudModel(model, modelRecord = {}) {
  if (modelRecord.execution_mode === "cloud_cli" || modelRecord.remote_model === true) return true;
  return /(^|[:_-])cloud$/i.test(String(model || ""));
}

function suggestCapabilities(surface, model) {
  const lower = `${surface}/${model}`.toLowerCase();
  const cliCanEdit = ["codex", "claude_code", "opencode", "cursor", "qwen", "aider", "agy"].includes(surface);
  return {
    file_edits: cliCanEdit,
    terminal: cliCanEdit,
    worktree_safe: cliCanEdit,
    background: ["github", "gemini_spark"].includes(surface),
    multimodal: /gemini|vision|vl|multimodal|gemma|mistral/.test(lower) ? true : "unknown",
    web: ["codex", "opencode", "gemini", "github", "agy"].includes(surface) ? "unknown" : false,
    structured_output: "unknown",
  };
}

function toYaml(value, indent = 0) {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return `${pad}[]\n`;
    return value.map((item) => `${pad}- ${formatYamlValue(item, indent + 2)}`).join("");
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) return "{}\n";
    return entries.map(([key, item]) => {
      if (Array.isArray(item) && !item.length) return `${pad}${quoteKey(key)}: []\n`;
      if (item && typeof item === "object") {
        const rendered = toYaml(item, indent + 2);
        return `${pad}${quoteKey(key)}:\n${rendered}`;
      }
      return `${pad}${quoteKey(key)}: ${formatScalar(item)}\n`;
    }).join("");
  }
  return `${formatScalar(value)}\n`;
}

function formatYamlValue(value, indent) {
  if (value && typeof value === "object") return `\n${toYaml(value, indent)}`;
  return `${formatScalar(value)}\n`;
}

function quoteKey(key) {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}

function formatScalar(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (value === null) return "null";
  return JSON.stringify(String(value));
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

function expandPath(value) {
  if (!value) return value;
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return path.resolve(value);
}
