#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), ".config", "ai-orchestrator");
const args = parseArgs(process.argv.slice(2));
const configDir = expandPath(args["config-dir"] || process.env.AI_ORCHESTRATOR_CONFIG_DIR || DEFAULT_CONFIG_DIR);
const inventoryPath = expandPath(args.inventory || path.join(configDir, "inventory.json"));
const outputPath = expandPath(args.output || path.join(configDir, "config.yaml"));
const write = Boolean(args.write);
const timestamp = args.timestamp || process.env.AI_ORCHESTRATOR_TIMESTAMP || new Date().toISOString();

if (!fs.existsSync(inventoryPath)) {
  console.error(`Inventory not found: ${inventoryPath}`);
  process.exit(1);
}

const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const config = buildConfig(inventory);
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
      routes[routeId] = {
        enabled: false,
        surface: surfaceName,
        provider,
        model: modelName,
        command: suggestCommand(surfaceName, modelName),
        execution_mode: surfaceName === "ollama" ? "local_model" : "local_cli",
        cost_tier: classifyCost(modelName, surfaceName),
        strengths: suggestStrengths(modelName, surfaceName),
        capabilities: suggestCapabilities(surfaceName, modelName),
        limits: {
          max_runtime_seconds: surfaceName === "ollama" ? 600 : 1800,
          max_parallel: classifyCost(modelName, surfaceName) === "premium" ? 1 : 2,
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
        kimi: false,
        gemini: false,
      },
    },
  };
}

function suggestCommand(surface, model) {
  if (surface === "ollama") return `ollama run ${model}`;
  if (surface === "codex") return "codex exec";
  if (surface === "claude_code") return "claude";
  if (surface === "opencode") return "opencode run";
  if (surface === "gemini") return "gemini";
  if (surface === "qwen") return "qwen";
  if (surface === "github") return "gh";
  return surface;
}

function classifyCost(model, surface) {
  const lower = `${surface}/${model}`.toLowerCase();
  if (surface === "ollama" || lower.includes("local")) return "local";
  if (/opus|flagship|max|pro|long-context|thinking/.test(lower)) return "premium";
  if (/mini|flash|haiku|small|lite|nano|fast/.test(lower)) return "cheap";
  return "standard";
}

function suggestStrengths(model, surface) {
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
  if (/ollama|local|gemma|llama|qwen/.test(lower)) {
    strengths.add("private_context");
    strengths.add("local_work");
  }
  if (/mini|flash|haiku|small|lite|nano|fast/.test(lower)) {
    strengths.add("cheap_scout");
  }
  return [...strengths].length ? [...strengths] : ["general"];
}

function suggestCapabilities(surface, model) {
  const lower = `${surface}/${model}`.toLowerCase();
  const cliCanEdit = ["codex", "claude_code", "opencode", "cursor", "qwen", "aider"].includes(surface);
  return {
    file_edits: cliCanEdit,
    terminal: cliCanEdit,
    worktree_safe: cliCanEdit,
    background: ["github", "gemini_spark"].includes(surface),
    multimodal: /gemini|vision|vl|multimodal|gemma|mistral/.test(lower) ? true : "unknown",
    web: ["codex", "opencode", "gemini", "github"].includes(surface) ? "unknown" : false,
    structured_output: "unknown",
  };
}

function toYaml(value, indent = 0) {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return "[]\n";
    return value.map((item) => `${pad}- ${formatYamlValue(item, indent + 2)}`).join("");
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) return "{}\n";
    return entries.map(([key, item]) => {
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
