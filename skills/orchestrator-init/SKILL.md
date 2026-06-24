---
name: orchestrator-init
description: "Set up Agent Orchestrator. Use when the user wants to initialize, configure, detect installed AI CLIs/models/harnesses, edit ~/.config/ai-orchestrator/config.yaml, install orchestrator commands/plugins, run smoke tests, or when delegate/swarm cannot run because config is missing."
---

# Orchestrator Init

Set up deterministic routing for Agent Orchestrator.

This skill creates and maintains:

```text
~/.config/ai-orchestrator/inventory.json
~/.config/ai-orchestrator/config.yaml
```

`inventory.json` is generated automatically. `config.yaml` is human-editable and requires confirmation before writing or changing.

## Workflow

1. Run passive detection:
   ```bash
   node skills/orchestrator-init/scripts/detect-environment.mjs
   ```
   If installed globally, resolve the script relative to this skill directory.

2. Review detected tools, harnesses, configured models, local models, and redactions.

3. Ask the user which detected harness/model routes to enable. When a harness has linked models, list them and ask whether to enable all or selected models.

4. Ask whether to run smoke tests. Smoke tests may consume model credits, so they require explicit confirmation:
   ```bash
   node skills/orchestrator-init/scripts/smoke-test.mjs --confirmed --write
   ```

5. Propose a config:
   ```bash
   node skills/orchestrator-init/scripts/write-config.mjs --dry-run
   ```

6. Ask before writing `config.yaml` or installing commands/plugins.

7. If the user approves installing Claude slash commands, preview first:
   ```bash
   node skills/orchestrator-init/scripts/install-commands.mjs
   ```
   Then write only after confirmation:
   ```bash
   node skills/orchestrator-init/scripts/install-commands.mjs --write
   ```

## Detection Rules

Detect both:

- CLI presence and help/version behavior.
- Local config files that reveal configured providers/models.

Never store secret values. It is acceptable to record that a secret-like field exists and was redacted.

## User Interview

Ask concise questions. Capture:

- Which routes are enabled.
- Which linked harness models are allowed.
- Cost tier corrections.
- Preferred profile: `balanced`, `cheap`, `best`, `local_only`.
- Privacy policy for code, logs, documents, production data, and personal/customer data.
- Whether to install harness commands/plugins.
- Whether to run smoke tests.

## Config Editing

For `/orchestrator:config`, read the current config, ask what to change, and write only after confirmation. Prefer preserving user comments/format where practical; if a script rewrites the config, show the proposed output first.

## Fallback Without Node

If Node is unavailable, do not fail silently. Tell the user Node is recommended because this package is installed via `npx skills`, then fall back to manual commands such as:

```bash
command -v claude && claude --help
command -v codex && codex --help
command -v opencode && opencode --help
command -v gemini && gemini --help
command -v qwen && qwen --help
command -v ollama && ollama list
```
