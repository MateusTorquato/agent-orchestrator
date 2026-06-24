# Agent Orchestrator

Agent Orchestrator is a multi-harness skill package for routing work across AI models, CLI agents, local models, and swarms.

It is designed around four skills:

- `orchestrator` - lightweight bootstrap and router.
- `orchestrator-init` - environment discovery, user interview, deterministic configuration.
- `orchestrator-delegate` - route one task to the best configured route.
- `orchestrator-swarm` - coordinate multiple distinct routes for review, competition, research, or worktree-based implementation.

The repository is intentionally English-only. Skills may recognize user intent in other languages, but all files, prompts, docs, scripts, and examples live in English.

## Status

Local development phase. Do not publish yet.

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

commands/
  claude/
    orchestrator.md
    orchestrator:init.md
    orchestrator:config.md
    orchestrator:delegate.md
    orchestrator:swarm.md

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

## Local Validation

List skills from the local checkout:

```bash
npx skills add ./agent-orchestrator --list
```

Run script tests:

```bash
node tests/run-tests.mjs
```

Run passive environment detection against your real machine:

```bash
node skills/orchestrator-init/scripts/detect-environment.mjs
```

Generate a proposed config from the inventory without writing it:

```bash
node skills/orchestrator-init/scripts/write-config.mjs
```

Write config only after reviewing the proposed output:

```bash
node skills/orchestrator-init/scripts/write-config.mjs --write
```

Smoke tests may consume model credits and require explicit confirmation:

```bash
node skills/orchestrator-init/scripts/smoke-test.mjs --confirmed --write
```

Preview Claude slash command installation:

```bash
node skills/orchestrator-init/scripts/install-commands.mjs
```

Install Claude slash commands only after review:

```bash
node skills/orchestrator-init/scripts/install-commands.mjs --write
```
