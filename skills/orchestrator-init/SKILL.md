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

3. Prefer doing the interview in Plan mode when the current agent/runtime supports selectable questions. After detection, explain that Plan mode is recommended because the user can pick routes and defaults from options instead of typing YAML by hand. Make clear that Plan mode is not required.

   If the current session is not in Plan mode, pause before the interview and ask the user to switch to Plan mode if they want the recommended setup experience. Tell them to type `continue` after switching modes, or type `continue in text mode` to proceed with numbered questions in the current chat. Do not block if the user explicitly chooses text mode.

4. Ask the user which detected harness/model routes to enable. When a harness has linked models, list them and ask whether to enable all or selected models.

5. Ask for default routes by task category:
   - generalist
   - research
   - investigation/debugging
   - coding/implementation
   - review/validation
   - document/multimodal
   - local/private-sensitive work

6. Ask whether to run smoke tests. Smoke tests may consume model credits, so they require explicit confirmation:
   ```bash
   node skills/orchestrator-init/scripts/smoke-test.mjs --confirmed --write
   ```

7. Propose a config:
   ```bash
   node skills/orchestrator-init/scripts/write-config.mjs --dry-run
   ```
   When interview choices are known, pass deterministic overrides instead of editing YAML by hand:
   ```bash
   node skills/orchestrator-init/scripts/write-config.mjs --dry-run --enable-all --profile balanced --route-defaults general=codex/openai/gpt-5.5,document_analysis=agy/google/gemini-3.5-flash-high
   ```

8. Ask before writing `config.yaml` or installing commands/plugins.

9. If the user approves installing Claude slash commands, preview first:
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
- Harness-specific model lists such as `agy models`.
- Ollama model metadata via `ollama show <model>`, because Ollama can expose remote models without a `:cloud` or `-cloud` suffix.

Never store secret values. It is acceptable to record that a secret-like field exists and was redacted.

Treat harnesses as separate routes even when they expose the same underlying model. For example, Gemini through `agy`/Antigravity, Gemini CLI, and Ollama Remote Model are different routes with different tools, permissions, billing, and reliability characteristics.

## User Interview

Ask concise questions. Capture:

- Which routes are enabled.
- Which linked harness models are allowed.
- Cost tier corrections.
- Preferred profile: `balanced`, `cheap`, `best`, `local_only`.
- Default route for generalist work.
- Default route for research.
- Default route for investigation/debugging.
- Default route for coding/implementation.
- Default route for review/validation.
- Default route for document/multimodal tasks.
- Default route for local/private-sensitive tasks.
- Privacy policy for code, logs, documents, production data, and personal/customer data.
- Whether the user has or wants to use Ollama Cloud credits/subscription.
- Whether the user wants to include `agy`/Antigravity routes when detected.
- What to do when no true local/private model is detected.
- Whether to install harness commands/plugins.
- Whether to run smoke tests.

### Plan Mode Interview

When selectable questions are available, ask in small batches after detection:

1. **Enabled routes**: let the user select which detected routes should be enabled. Recommended first option: a balanced set with one strong coding route, one cheap scout, one local/private route if available, and one document/multimodal route if available.
2. **Default generalist route**: ask which enabled route should handle broad tasks.
3. **Default research route**: ask which route should handle source-heavy research.
4. **Default investigation route**: ask which route should handle debugging/root-cause analysis.
5. **Default coding route**: ask which route should implement code changes.
6. **Default review route**: ask which route should validate plans, PRs, diffs, and results.
7. **Default document route**: ask which route should handle PDFs, images, OCR, spreadsheets, and multimodal work.
8. **Default private route**: ask which route should handle secrets, production logs, customer data, contracts, finance, health, HR, or equivalent sensitive terms in the user's language.
9. **Cost/privacy policy**: confirm profile and paid fan-out behavior.
10. **Write config**: show the proposed config summary and ask before writing.

Do not ask all questions at once. Use the previous answer to narrow the next options.

### Text Mode Continuation

If the user chooses not to switch to Plan mode, continue in normal chat with numbered options. Keep each question small and default to a recommended option first.

## Config Editing

For `/orchestrator:config`, read the current config, ask what to change, and write only after confirmation. Prefer preserving user comments/format where practical; if a script rewrites the config, show the proposed output first.

## Fallback Without Node

If Node is unavailable, do not fail silently. Tell the user Node is recommended because this package is installed via `npx skills`, then fall back to manual commands such as:

```bash
command -v claude && claude --help
command -v codex && codex --help
command -v opencode && opencode --help
command -v agy && agy --help && agy models
command -v gemini && gemini --help
command -v qwen && qwen --help
command -v ollama && ollama list
```
