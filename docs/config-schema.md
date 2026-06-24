# Config Schema

This is the initial human-readable schema for:

```text
~/.config/ai-orchestrator/config.yaml
```

The machine-generated inventory lives at:

```text
~/.config/ai-orchestrator/inventory.json
```

## Config Example

```yaml
schema_version: 1
orchestrator_version: "0.1.0"
initialized_at: "2026-06-24T00:00:00Z"

defaults:
  profile: balanced
  max_parallel_agents: 4
  task_defaults:
    general:
      - codex/openai/gpt-5.5
      - agy/anthropic/claude-sonnet-4.6-thinking
    research:
      - codex/openai/gpt-5.5
      - agy/google/gemini-3.1-pro-high
      - agy/anthropic/claude-sonnet-4.6-thinking
    investigation:
      - codex/openai/gpt-5.5
      - agy/anthropic/claude-sonnet-4.6-thinking
      - ollama/local/deepseek-v4-pro:cloud
    coding:
      - codex/openai/gpt-5.5
      - agy/anthropic/claude-sonnet-4.6-thinking
      - ollama/local/qwen3-coder:480b-cloud
    code_review:
      - codex/openai/gpt-5.5
      - agy/anthropic/claude-opus-4.6-thinking
      - ollama/local/deepseek-v4-pro:cloud
    document_analysis:
      - agy/google/gemini-3.5-flash-high
      - agy/google/gemini-3.1-pro-high
      - ollama/local/gemini-3-flash-preview:latest
    local_private:
      - codex/openai/gpt-5.5
      - agy/anthropic/claude-sonnet-4.6-thinking

privacy:
  external_apis_allowed: ask
  sensitive_data_policy: local_first
  allow_code_to_external_apis: ask
  allow_logs_to_external_apis: ask
  allow_documents_to_external_apis: ask

cost:
  default_policy: ask_before_paid_fanout
  max_paid_parallel_agents: 2
  max_premium_agents_per_swarm: 1
  prefer_cheap_scouts: true
  require_confirmation_for:
    - premium_route
    - paid_parallelism
    - long_context
    - repeated_retries

profiles:
  balanced:
    default: true
    planner: best_standard
    executor: best_for_task
    validator: strong_if_needed
    cost_policy: ask_before_premium
  cheap:
    prefer:
      - local
      - cheap
      - flash
      - mini
      - haiku
    max_premium_agents: 0
  best:
    prefer:
      - highest_quality
    max_premium_agents: 2
    require_cost_summary: true
  local_only:
    external_apis_allowed: false
    prefer:
      - local

delegate:
  confirmation:
    always_for:
      - premium_route
      - sensitive_external
      - cloud_background
      - file_edits
      - destructive_commands
    skip_for:
      - local_readonly
      - cheap_scout
      - planning_only

swarm:
  max_parallel_agents: 4
  max_total_agents: 8
  default_mode: specialist
  require_min_distinct_routes: 2
  allow_same_model_different_harness: false
  require_compare_harnesses_mode_for_duplicates: true
  cost_policy: ask_before_paid_fanout
  retries:
    max_per_route: 1
  worktree_mode:
    enabled: true
    worktree_root: "~/.cache/ai-orchestrator/worktrees"
    require_clean_worktree: true
    require_agent_commit: true
    cleanup_policy: ask

routes:
  codex/openai/gpt-5.5:
    enabled: true
    surface: codex
    provider: openai
    model: gpt-5.5
    command: "codex exec"
    execution_mode: local_cli
    cost_tier: premium
    strengths:
      - repo_editing
      - tests
      - complex_debugging
    capabilities:
      file_edits: true
      terminal: true
      worktree_safe: true
      background: false
      multimodal: unknown
      web: unknown
      structured_output: unknown
    limits:
      max_runtime_seconds: 1800
      max_parallel: 1
      max_context: unknown

  ollama/qwen3-coder:
    enabled: true
    surface: ollama
    provider: local
    model: qwen3-coder
    command: "ollama run qwen3-coder"
    execution_mode: local_model
    cost_tier: local
    strengths:
      - local_code
      - private_context
      - cheap_scout
    capabilities:
      file_edits: false
      terminal: false
      worktree_safe: false
      background: false
      multimodal: false
      web: false
      structured_output: unknown
    limits:
      max_runtime_seconds: 600
      max_parallel: 2
      max_context: unknown

  agy/google/gemini-3.5-flash-high:
    enabled: true
    surface: agy
    provider: google
    model: gemini-3.5-flash-high
    display_name: "Gemini 3.5 Flash (High)"
    command: "agy --model \"Gemini 3.5 Flash (High)\" --print"
    execution_mode: local_cli
    cost_tier: premium
    strengths:
      - document_analysis
      - multimodal
      - cheap_scout
    capabilities:
      file_edits: true
      terminal: true
      worktree_safe: true
      background: false
      multimodal: true
      web: unknown
      structured_output: unknown
    limits:
      max_runtime_seconds: 1800
      max_parallel: 1
      max_context: unknown

custom_routes:
  my-company/deploy-agent:
    enabled: false
    surface: custom_cli
    provider: internal
    model: internal-coder
    command: "company-agent run --model internal-coder"
    execution_mode: local_cli
    cost_tier: internal
    strengths:
      - deployment
      - infra
      - internal_docs
    capabilities:
      file_edits: true
      terminal: true
      worktree_safe: true
      background: false
      multimodal: false
      web: false
      structured_output: unknown

commands:
  installed:
    claude: false
    codex: false
    cursor: false
    opencode: false
    agy: false
    kimi: false
    gemini: false
```

## Inventory Shape

`inventory.json` is generated by `orchestrator-init`.

```json
{
  "schema_version": 1,
  "detected_at": "2026-06-24T00:00:00Z",
  "tools": {
    "codex": {
      "path": "/opt/homebrew/bin/codex",
      "installed": true,
      "version": "unknown",
      "help_ok": true,
      "auth_ok": "unknown",
      "smoke_test_ok": "not_run",
      "config_files": []
    }
  },
  "surfaces": {
    "opencode": {
      "installed": true,
      "config_files": [
        "~/.config/opencode/opencode.json"
      ],
      "detected_models": [
        {
          "provider": "openai",
          "model": "gpt-5.5",
          "source": "config",
          "enabled_in_source": true
        }
      ]
    }
  },
  "redactions": {
    "secrets_found": 0,
    "redacted_fields": []
  }
}
```

## Route Fields

Required:

- `enabled`
- `surface`
- `provider`
- `model`
- `command`
- `execution_mode`
- `cost_tier`
- `strengths`
- `capabilities`

Recommended:

- `limits`
- `user_notes`
- `detected_from`
- `last_smoke_test_at`

## Cost Tiers

Allowed values:

- `local`
- `cheap`
- `standard`
- `premium`
- `internal`
- `unknown`

## Execution Modes

Allowed values:

- `local_cli`
- `local_model`
- `cloud_cli`
- `cloud_background`
- `manual`
- `custom`

Ollama routes are `local_model` only when the model is actually local. Ollama model names ending in `:cloud` or `-cloud` must be treated as `cloud_cli`, not as private local routes.

## Capability Values

Capabilities may be `true`, `false`, or `unknown`. Unknown is preferred over guessing.
