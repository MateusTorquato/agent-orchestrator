#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_CONFIG = path.join(os.homedir(), ".config", "ai-orchestrator", "config.yaml");
const args = parseArgs(process.argv.slice(2));
const configPath = expandPath(args.config || DEFAULT_CONFIG);
const rulesPath = expandPath(args.rules || path.join(path.dirname(configPath), "routing-rules.yaml"));
const task = args.task || args.explain || args._.join(" ");

if (!fs.existsSync(configPath)) {
  console.error(`Orchestrator is not initialized. Missing config: ${configPath}`);
  console.error("Run /orchestrator:init first.");
  process.exit(2);
}

const config = readConfig(configPath);
const classification = classifyTask(task);
const routingRules = fs.existsSync(rulesPath) ? readConfig(rulesPath) : {};
const routes = collectRoutes(config).filter((route) => route.enabled !== false);

if (!routes.length) {
  console.error("No enabled routes found in config. Run /orchestrator:config or /orchestrator:init.");
  process.exit(3);
}

const currentRoute = detectCurrentRoute(config, args);
const currentRouteId = currentRoute?.id || null;
const allowCurrent = Boolean(args["allow-current"] || explicitlyAllowsCurrent(classification));
const rankedAll = routes
  .map((route) => ({ route, score: scoreRoute(route, classification, config, routingRules), reasons: routeReasons(route, classification, config, routingRules) }))
  .sort((a, b) => b.score - a.score);

const ranked = rankedAll.filter((item) => allowCurrent || item.route.id !== currentRouteId);
const selected = ranked[0] || rankedAll[0];
if (!selected) {
  console.error("No selectable routes found.");
  process.exit(4);
}
const confirmationRequired = needsConfirmation(selected.route, classification, config);
const bestOverall = rankedAll[0];
const currentRouteSuppressed = Boolean(currentRouteId && bestOverall?.route.id === currentRouteId && selected.route.id !== currentRouteId);
const swarmSuggestion = shouldSuggestSwarm(classification, routingRules)
  ? buildSwarmSuggestion(task, rankedAll, currentRouteId, allowCurrent)
  : null;

const plan = {
  task,
  classification,
  current_route: currentRoute,
  external_by_default: true,
  current_route_suppressed: currentRouteSuppressed,
  best_overall_route: bestOverall?.route.id || null,
  selected_route: selected.route.id,
  score: selected.score,
  reasons: selected.reasons,
  confirmation_required: confirmationRequired,
  prompt: buildPrompt(task, selected.route, classification),
  alternatives: ranked.filter((item) => item.route.id !== selected.route.id).slice(0, 4).map((item) => ({
    route: item.route.id,
    score: item.score,
    reasons: item.reasons,
  })),
  swarm_suggestion: swarmSuggestion,
  routing_rules_path: rulesPath,
};

if (args.json) {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
} else {
  console.log("Delegation Plan");
  console.log(`Task: ${task || "(not provided)"}`);
  console.log(`Selected route: ${plan.selected_route}`);
  if (plan.current_route?.id) console.log(`Current route: ${plan.current_route.id}`);
  if (plan.current_route_suppressed) console.log(`Note: best configured route is current, so delegate selected the best external route.`);
  console.log(`Why: ${plan.reasons.join("; ") || "best available configured route"}`);
  console.log(`Confirmation required: ${plan.confirmation_required ? "yes" : "no"}`);
  if (plan.alternatives.length) {
    console.log("Other viable routes:");
    for (const alt of plan.alternatives) console.log(`- ${alt.route} (${alt.score}): ${alt.reasons.join("; ")}`);
  }
  if (plan.swarm_suggestion) {
    console.log("\nSwarm suggestion:");
    console.log(`Mode: ${plan.swarm_suggestion.mode}`);
    for (const route of plan.swarm_suggestion.routes) console.log(`- ${route.route}: ${route.role}`);
    console.log("Not dispatched automatically.");
  }
  console.log("\nPrompt:");
  console.log(plan.prompt);
}

function classifyTask(text) {
  const lower = String(text || "").toLowerCase();
  const sensitive = /secret|credential|password|token|api key|customer|client|user data|personal data|pii|gdpr|hipaa|production|prod\b|logs?|financial|contract|legal|health|healthcare|medical|hr|confidential|private|segredo|credencial|senha|token|chave de api|cliente|usuário|dados pessoais|produção|prod\b|financeiro|contrato|jurídico|legal|saúde|médico|confidencial|privado|secreto|contraseña|credencial|cliente|usuario|datos personales|producción|financiero|contrato|jurídico|salud|médico|confidencial|privado|secret|identifiant|mot de passe|client|données personnelles|production|financier|contrat|juridique|santé|médical|confidentiel|privé/.test(lower);
  const multimodal = /pdf|image|screenshot|audio|video|ocr|scan|table|spreadsheet|imagem|áudio|vídeo|tabela/.test(lower);
  const coding = /\b(code|repo|bug|test|tests|refactor|implement|typescript|python|api|commit|diff)\b|código|bug|teste|refator/.test(lower);
  const review = /review|validate|audit|security|\bpr\b|diff|revis|auditoria|segurança/.test(lower);
  const research = /research|source|compare|market|paper|latest|pesquis|fonte|compar/.test(lower);
  const broadInvestigation = /what (does|is)|explain|understand|map|overview|architecture|codebase|repo|base|investigate|research|pesquise|entenda|explique|arquitetura|repositório/.test(lower);
  const swarmIntent = /swarm|multiple agents|multiple ias|several models|compare models|review council|várias ias|varias ias|múltiplos agentes|multiplos agentes|comparar modelos/.test(lower);
  const fileEdits = /edit|change|fix|implement|refactor|write|modify|alter|corrigir|implementar|editar|alterar/.test(lower) && coding;
  const premiumIntent = /best|highest quality|don't economize|premium|melhor|não economize/.test(lower);
  const cheapIntent = /cheap|fast|low cost|barato|rápido|econom/.test(lower);
  const openSourceIntent = /open source|open-source|open weight|open-weight|oss|local model|ollama|código aberto|modelo aberto/.test(lower);
  return {
    type: coding ? (review ? "code_review" : "coding") : research ? "research" : multimodal ? "document_analysis" : "general",
    text: lower,
    sensitive,
    multimodal,
    coding,
    review,
    research,
    broad: broadInvestigation,
    swarm_intent: swarmIntent,
    file_edits: fileEdits,
    profile_hint: premiumIntent ? "best" : cheapIntent ? "cheap" : "balanced",
    open_source: openSourceIntent,
  };
}

function scoreRoute(route, classification, config, routingRules = {}) {
  let score = 0;
  const strengths = new Set(route.strengths || []);
  const routeHintScore = explicitRouteHintScore(route, classification);
  score += routeHintScore;
  score += defaultRouteScore(route, classification, config, routingRules);
  if (classification.coding && (strengths.has("coding") || strengths.has("debugging") || route.capabilities?.file_edits)) score += 30;
  if (classification.review && (strengths.has("validation") || strengths.has("code_review") || strengths.has("planning"))) score += 25;
  if (classification.research && (strengths.has("research") || strengths.has("planning") || route.capabilities?.web === true)) score += 20;
  if (classification.multimodal && (strengths.has("multimodal") || strengths.has("document_analysis") || route.capabilities?.multimodal === true)) score += 30;
  if (classification.sensitive && (route.cost_tier === "local" || strengths.has("private_context") || strengths.has("local_work"))) score += 40;
  if (classification.sensitive && route.cost_tier !== "local") score -= 25;
  if (classification.file_edits && route.capabilities?.file_edits === true) score += 25;
  if (classification.file_edits && route.capabilities?.file_edits === false) score -= 20;
  if (classification.profile_hint === "cheap" && ["local", "cheap"].includes(route.cost_tier)) score += 120;
  if (classification.profile_hint === "cheap" && route.cost_tier === "premium") score -= 40;
  if (classification.profile_hint === "best" && ["premium", "standard"].includes(route.cost_tier)) score += 15;
  if (classification.open_source && isOpenWeightRoute(route)) score += 100;
  if (classification.open_source && !isOpenWeightRoute(route)) score -= 25;
  if (route.enabled) score += 5;
  return score;
}

function routeReasons(route, classification, config, routingRules = {}) {
  const reasons = [];
  if (explicitRouteHintScore(route, classification) > 0) reasons.push("explicitly requested route/model/provider");
  if (defaultRouteIds(classification, config, routingRules).includes(route.id)) reasons.push("configured default for this task type");
  if (classification.sensitive && route.cost_tier === "local") reasons.push("local route for sensitive data");
  if (classification.file_edits && route.capabilities?.file_edits) reasons.push("supports file edits");
  if (classification.coding && route.strengths?.some((item) => ["coding", "debugging"].includes(item))) reasons.push("matches coding/debugging strengths");
  if (classification.multimodal && route.strengths?.some((item) => ["multimodal", "document_analysis"].includes(item))) reasons.push("matches multimodal/document strengths");
  if (route.cost_tier === "cheap") reasons.push("cheap route");
  if (route.cost_tier === "premium") reasons.push("premium quality route");
  if (classification.open_source && isOpenWeightRoute(route)) reasons.push("matches open-source/open-weight intent");
  return reasons;
}

function defaultRouteScore(route, classification, config, routingRules = {}) {
  const ids = defaultRouteIds(classification, config, routingRules);
  const index = ids.indexOf(route.id);
  if (index === -1) return 0;
  return Math.max(40, 130 - (index * 20));
}

function explicitRouteHintScore(route, classification) {
  const text = classification.text || "";
  const haystack = [
    route.id,
    route.surface,
    route.provider,
    route.model,
    route.display_name,
  ].filter(Boolean).join(" ").toLowerCase();
  const hints = [
    "deepseek",
    "qwen",
    "glm",
    "kimi",
    "gpt-oss",
    "minimax",
    "ministral",
    "mistral",
    "gemma",
    "gemini",
    "claude",
    "opus",
    "sonnet",
    "codex",
    "agy",
    "antigravity",
    "ollama",
  ];
  return hints.some((hint) => text.includes(hint) && haystack.includes(hint)) ? 220 : 0;
}

function isOpenWeightRoute(route) {
  const lower = [route.id, route.surface, route.provider, route.model, route.display_name].filter(Boolean).join(" ").toLowerCase();
  return /ollama|deepseek|qwen|glm|kimi|gpt-oss|minimax|ministral|mistral|gemma|llama/.test(lower);
}

function defaultRouteIds(classification, config, routingRules = {}) {
  const defaults = config.defaults?.task_defaults || {};
  const rulesDefaults = routingRules.task_defaults || {};
  const keys = [];
  if (classification.sensitive) keys.push("local_private");
  keys.push(classification.type);
  if (classification.research) keys.push("research");
  if (classification.coding && !classification.review) keys.push("coding");
  if (classification.review) keys.push("code_review");
  if (classification.multimodal) keys.push("document_analysis");
  keys.push("general");
  const out = [];
  for (const key of keys) {
    out.push(...asList(rulesDefaults[key]));
    out.push(...asList(defaults[key]));
  }
  return unique(out);
}

function needsConfirmation(route, classification) {
  if (route.cost_tier === "premium") return true;
  if (classification.sensitive && route.cost_tier !== "local") return true;
  if (route.execution_mode === "cloud_background") return true;
  if (classification.file_edits && route.capabilities?.file_edits) return true;
  return false;
}

function buildPrompt(taskText, route, classification) {
  return `You are receiving a task delegated by Agent Orchestrator.

Route: ${route.id}
Task type: ${classification.type}
Sensitive data: ${classification.sensitive ? "yes" : "no"}

Task:
${taskText}

Return:
- result
- evidence
- validation performed
- risks or blockers`;
}

function collectRoutes(config) {
  const routeObjects = [];
  for (const [id, route] of Object.entries(config.routes || {})) routeObjects.push({ id, ...route });
  for (const [id, route] of Object.entries(config.custom_routes || {})) routeObjects.push({ id, ...route, custom: true });
  return routeObjects;
}

function detectCurrentRoute(config, parsedArgs) {
  const override = parsedArgs["current-route"] || process.env.AI_ORCHESTRATOR_CURRENT_ROUTE;
  const routes = collectRoutes(config);
  if (override) {
    const route = routes.find((item) => item.id === override);
    return route ? { id: route.id, source: "override" } : { id: override, source: "override", unknown: true };
  }
  const surface = detectCurrentSurface();
  if (!surface) return null;
  const candidates = routes.filter((route) => route.surface === surface);
  if (!candidates.length) return { surface, source: "runtime", unknown: true };
  const defaultModel = defaultModelForSurface(surface);
  const preferred = candidates.find((route) => route.model === defaultModel) || candidates[0];
  return { id: preferred.id, surface, source: "runtime" };
}

function detectCurrentSurface() {
  const env = process.env;
  if (env.CODEX_THREAD_ID || env.CODEX_CI || env.Codex) return "codex";
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
  try {
    const ppid = process.ppid;
    const result = spawnSync("ps", ["-o", "comm=,args=", "-p", String(ppid)], { encoding: "utf8", timeout: 1000 });
    return `${result.stdout || ""} ${result.stderr || ""}`;
  } catch {
    return "";
  }
}

function defaultModelForSurface(surface) {
  if (surface === "codex") return "gpt-5.5";
  return null;
}

function explicitlyAllowsCurrent(classification) {
  return /use current|current route|same route|use codex|use claude|usar atual|rota atual|mesma rota/.test(classification.text || "");
}

function shouldSuggestSwarm(classification, routingRules = {}) {
  if (classification.swarm_intent) return true;
  if (routingRules.suggest_swarm_for?.some((pattern) => new RegExp(pattern, "i").test(classification.text || ""))) return true;
  if (classification.file_edits) return false;
  if (classification.review || classification.research) return true;
  return classification.broad && (classification.coding || classification.type === "general");
}

function buildSwarmSuggestion(taskText, rankedRoutes, currentRouteId, allowCurrent) {
  const usable = rankedRoutes
    .filter((item) => allowCurrent || item.route.id !== currentRouteId)
    .filter((item) => item.score > 0);
  const selected = diversifyRoutes(usable).slice(0, 3);
  return {
    mode: "specialist",
    reason: "task benefits from independent research/validation and synthesis",
    task: taskText,
    routes: selected.map((item, index) => ({
      route: item.route.id,
      role: ["codebase/domain interpretation", "research/document synthesis", "cheap independent scout"][index] || "reviewer",
      score: item.score,
    })),
    dispatch: "not_automatic",
  };
}

function diversifyRoutes(items) {
  const seenFamilies = new Set();
  const out = [];
  for (const item of items) {
    const family = routeFamily(item.route);
    if (seenFamilies.has(family)) continue;
    seenFamilies.add(family);
    out.push(item);
  }
  for (const item of items) {
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

function routeFamily(route) {
  const lower = [route.provider, route.model, route.display_name].filter(Boolean).join(" ").toLowerCase();
  if (/claude|anthropic|opus|sonnet/.test(lower)) return "claude";
  if (/gemini|google/.test(lower)) return "gemini";
  if (/deepseek/.test(lower)) return "deepseek";
  if (/qwen/.test(lower)) return "qwen";
  if (/glm/.test(lower)) return "glm";
  if (/gpt-oss|openai|gpt/.test(lower)) return "openai";
  if (/kimi/.test(lower)) return "kimi";
  if (/minimax/.test(lower)) return "minimax";
  return `${route.provider}/${route.model}`;
}

function asList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value) return [value];
  return [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function readConfig(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  if (filePath.endsWith(".json")) return JSON.parse(text);
  return parseSimpleYaml(text);
}

function parseArgs(argv) {
  const out = { _: [] };
  const booleanFlags = new Set(["json"]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (booleanFlags.has(key)) {
      out[key] = true;
      continue;
    }
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
  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const indent = raw.match(/^ */)[0].length;
    const line = raw.trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].value;
    if (line.startsWith("- ")) {
      if (!Array.isArray(parent)) continue;
      parent.push(parseScalar(line.slice(2).trim()));
      continue;
    }
    const idx = findKeySeparator(line);
    if (idx === -1) continue;
    const key = unquote(line.slice(0, idx).trim());
    const rest = line.slice(idx + 1).trim();
    if (!rest) {
      const nextLine = nextMeaningfulLine(lines, raw);
      const value = nextLine?.trim().startsWith("- ") ? [] : {};
      parent[key] = value;
      stack.push({ indent, value });
    } else {
      parent[key] = parseScalar(rest);
    }
  }
  return root;
}

function nextMeaningfulLine(lines, currentRaw) {
  const index = lines.indexOf(currentRaw);
  for (let i = index + 1; i < lines.length; i += 1) {
    if (lines[i].trim() && !lines[i].trim().startsWith("#")) return lines[i];
  }
  return null;
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
