# Agent Orchestrator Design

## Goal

Agent Orchestrator routes work across AI models, harnesses, CLI agents, local models, and multi-agent swarms. It should help a user decide not just "which model is best", but which execution route is best for a task under real constraints: cost, privacy, tools, context, harness, modality, and risk.

The system has four skills:

- `orchestrator`: lightweight bootstrap and router.
- `orchestrator-init`: setup, environment discovery, user interview, config generation, and command/plugin installation support.
- `orchestrator-delegate`: delegate a single task to one best route.
- `orchestrator-swarm`: coordinate multiple distinct routes for validation, research, competitive solving, or worktree-based implementation.

## Non-Goals

The v1 system will not:

- Query remote provider APIs to list models.
- Estimate billing through provider APIs.
- Purchase, enable, or subscribe to paid models.
- Automatically merge a swarm winner into the main repo.
- Run destructive shell commands without explicit confirmation.
- Perform full secret scanning beyond redaction heuristics.
- Guarantee full support for every harness-specific marketplace.
- Provide a GUI configuration app.

## Core Concepts

### Route

A route is not just a model. A route is:

```text
surface + provider + model + command + capabilities + policy
```

The same model through different surfaces is treated as different routes:

- `claude_code/anthropic/claude-sonnet`
- `opencode/anthropic/claude-sonnet`
- `cursor/anthropic/claude-sonnet`

Harnesses differ in file context, tools, patching behavior, permissions, logs, cost controls, background execution, and UX. The orchestrator should preserve that distinction.

### Surface

A surface is the product or harness used to run an AI route:

- Claude Code
- Codex
- OpenCode
- Cursor
- Kimi
- Gemini CLI
- GitHub Copilot
- Ollama
- LM Studio
- vLLM
- custom CLIs

### Delegate

`orchestrator-delegate` chooses one route for one task. It may execute directly only when the route is cheap/local/low-risk and the configured policy allows it.

It must confirm first when:

- The selected route is premium or expensive.
- Sensitive data would be sent to an external API.
- The route is cloud/background.
- Files will be edited.
- Long-running or destructive commands may run.

### Swarm

`orchestrator-swarm` coordinates multiple distinct routes. Swarm is cross-route orchestration by default, not just native subagents inside one harness.

Swarm requires at least two enabled distinct routes. If only one route is configured, it should refuse to run a real swarm and offer:

- run `orchestrator-delegate` instead;
- run a degraded native-subagent workflow if the current harness supports it;
- run `orchestrator-init` to add more routes.

Before dispatching, `orchestrator-swarm` must present a concise plan and get user confirmation.

## Swarm Modes

### Specialist

Different routes receive different roles:

- scout
- planner
- executor
- validator
- security reviewer
- performance reviewer
- regression hunter

Use for reviews, large investigations, research, and staged implementation.

### Competitive

Multiple routes independently solve the same problem. The controller compares results with a scorecard.

Use for hard bugs, architecture alternatives, creative implementation, and model comparison.

### Worktree Competition

Each route receives an isolated git worktree and must create its own commit. The controller compares commits and evidence.

Rules:

- The controller creates worktrees, not the agents.
- Worktrees live under `~/.cache/ai-orchestrator/worktrees/`.
- Each route works on a branch named `orchestrator/<run-id>/<route-id>`.
- Each agent must commit its result.
- The controller never applies a winner to the main repo without explicit user confirmation.

### Compare Harnesses

Allows the same model through different surfaces in the same swarm, for example:

- Claude Sonnet via Claude Code
- Claude Sonnet via OpenCode
- Claude Sonnet via Cursor

This mode is opt-in. By default, swarms should diversify models and surfaces to reduce correlated failures.

### Review Council

Multiple independent reviewers evaluate a plan, diff, result, or decision. Use safe roles such as `skeptic`, `critic`, `validator`, and `security_reviewer`; avoid instructing any route to act maliciously.

## Setup and Configuration

`orchestrator-init` creates two files:

```text
~/.config/ai-orchestrator/config.yaml
~/.config/ai-orchestrator/inventory.json
```

`inventory.json` is generated automatically from environment detection and may be overwritten. It records raw detected capabilities, paths, versions, config files, local models, and smoke-test results.

`config.yaml` is human-editable and deterministic. The init flow must ask before writing or changing it.

`orchestrator-init` should:

1. Run passive environment detection.
2. Write `inventory.json`.
3. Prefer Plan mode or selectable questions for the interview when the runtime supports it.
4. Interview the user about detected surfaces, models, task defaults, privacy, cost, and preferences.
5. Ask whether to run smoke tests, because they may consume model credits.
6. Update inventory with smoke-test results.
7. Propose a `config.yaml`.
8. Ask before writing the config or installing commands/plugins.

Task defaults should include at least: generalist, research, investigation, coding, review, document/multimodal, and local/private-sensitive work.

## Detection Strategy

Detect both:

- CLI presence and version/help output.
- Local configuration that reveals configured providers/models.

Detection should include as many surfaces as practical. v1 should attempt broad detection, but gracefully mark unknown or unsupported tools.

Examples:

- `claude`
- `codex`
- `opencode`
- `gemini`
- `qwen`
- `ollama`
- `gh` and GitHub Copilot capabilities
- `aider`
- `cursor`
- `code`
- `windsurf`
- `docker`
- `lmstudio`
- `vllm`
- `sglang`
- custom routes added by the user

Detection must redact secrets. It may record that a key exists, but never store the key value.

## Cost Policy

Cost is classified by both automatic heuristic and user confirmation.

Heuristic examples:

- `opus`, `pro`, `max`, `flagship`, `thinking`, `long-context`: premium.
- `sonnet`, `medium`, standard GPT-class routes: standard or premium depending on provider/surface.
- `mini`, `flash`, `haiku`, `small`, `lite`, `nano`, local routes: cheap/local.

The user may override cost tiers in config.

Default policy:

- Use cheap scouts first.
- Use premium models for planner/validator or high-risk tasks.
- Ask before paid fan-out.
- Never run many premium routes in parallel without explicit confirmation.

## Privacy Policy

Default privacy is conservative:

- External APIs are `ask`.
- Sensitive data policy is `local_first`.
- Sending code, logs, documents, production data, credentials, or personal data externally requires confirmation unless config explicitly allows it.

Sensitivity detection must be language-aware:

```text
Treat data as sensitive when the user mentions secrets, credentials, tokens, API keys, customer/client/user data, production systems, logs, PII, financial data, contracts, legal documents, healthcare data, HR data, or equivalent terms in the user's language.
```

Examples in non-English languages are guidance, not a closed list.

## Run History

Swarm creates a run directory by default:

```text
.orchestrator/runs/<timestamp>-<slug>/
  run.yaml
  prompts/
  outputs/
  logs/
  comparison.md
```

Worktree mode records external worktree paths under the run metadata.

The repo may add `.orchestrator/runs/` to `.gitignore` after user confirmation. Some teams may want to commit comparison reports, so this should not be forced.

## Multi-Harness Packaging

Follow a Superpowers-style repository layout:

```text
skills/
  orchestrator/
  orchestrator-init/
  orchestrator-delegate/
  orchestrator-swarm/

.claude-plugin/
.codex-plugin/
.cursor-plugin/
.kimi-plugin/
.opencode/
.pi/
gemini-extension.json
GEMINI.md
```

`orchestrator` should be a lightweight bootstrap loaded at session start where the harness supports it. The bootstrap should be discreet: it should not force orchestration for ordinary coding tasks. It should activate only when the user asks for delegation, swarms, model routing, multi-agent comparison, setup/config, or when explicit orchestration is clearly beneficial.

## Language

All repository files are English-only. The skills may recognize user intent in other languages, but the implementation, docs, prompts, and examples should be written in English.
