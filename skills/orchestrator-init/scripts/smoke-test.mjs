#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), ".config", "ai-orchestrator");
const args = parseArgs(process.argv.slice(2));
const configDir = expandPath(args["config-dir"] || process.env.AI_ORCHESTRATOR_CONFIG_DIR || DEFAULT_CONFIG_DIR);
const inventoryPath = expandPath(args.inventory || path.join(configDir, "inventory.json"));
const write = Boolean(args.write && !args["dry-run"]);

if (!fs.existsSync(inventoryPath)) {
  console.error(`Inventory not found: ${inventoryPath}`);
  process.exit(1);
}

const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const prompt = "Reply with exactly: ORCHESTRATOR_OK";

for (const [toolName, tool] of Object.entries(inventory.tools || {})) {
  if (!tool.installed || !tool.path) continue;
  const command = smokeCommand(toolName, tool.path, prompt);
  if (!command) {
    tool.smoke_test_ok = "unsupported";
    continue;
  }
  if (!args.confirmed) {
    tool.smoke_test_ok = "not_run_requires_confirmation";
    continue;
  }
  const result = spawnSync(command.command, command.args, {
    encoding: "utf8",
    timeout: 30000,
  });
  const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
  tool.smoke_test_ok = combined.includes("ORCHESTRATOR_OK") ? true : false;
  tool.smoke_test_status = result.status;
}

if (write) {
  fs.writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  console.log(`Inventory updated: ${inventoryPath}`);
} else {
  process.stdout.write(JSON.stringify(inventory, null, 2));
}

function smokeCommand(toolName, executable, text) {
  if (toolName === "ollama") return null;
  if (toolName === "claude") return { command: executable, args: ["-p", text] };
  if (toolName === "codex") return { command: executable, args: ["exec", text] };
  if (toolName === "gemini") return { command: executable, args: ["-p", text] };
  if (toolName === "qwen") return { command: executable, args: ["-p", text] };
  if (toolName === "opencode") return { command: executable, args: ["run", text] };
  if (toolName === "agy") return { command: executable, args: ["--model", "Gemini 3.5 Flash (Low)", "--print", text] };
  return null;
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
