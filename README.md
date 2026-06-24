# Agent Orchestrator

Agent Orchestrator is a multi-harness skill package for routing work across AI models, CLI agents, local models, and swarms.

It is designed around four skills:

- `orchestrator` - lightweight bootstrap and router.
- `orchestrator-init` - environment discovery, user interview, deterministic configuration.
- `orchestrator-delegate` - route one task to the best configured route.
- `orchestrator-swarm` - coordinate multiple distinct routes for review, competition, research, or worktree-based implementation.

The repository is intentionally English-only. Skills may recognize user intent in other languages, but all files, prompts, docs, scripts, and examples live in English.

## Status

Design phase. Do not install or publish yet.

## Design Docs

- [Design](docs/design.md)
- [Decisions](docs/decisions.md)
- [Config Schema](docs/config-schema.md)

## Planned Install Shape

The package will follow a Superpowers-style multi-harness structure:

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

`npx skills` installation and harness-specific plugin installs will be validated after the design docs are reviewed.
