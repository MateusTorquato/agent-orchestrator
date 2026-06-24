# Agent Orchestrator for Codex

Use the local checkout during development:

```bash
npx skills add ./agent-orchestrator --list
```

From inside the repository:

```bash
npx skills add . --list
```

The package exposes four skills:

- `orchestrator` - discreet bootstrap and router.
- `orchestrator-init` - detects installed harnesses and writes inventory/config.
- `orchestrator-delegate` - routes one task to one configured route.
- `orchestrator-swarm` - plans and coordinates multiple routes.

Run setup detection:

```bash
node skills/orchestrator-init/scripts/detect-environment.mjs
```

Generate a proposed config without writing it:

```bash
node skills/orchestrator-init/scripts/write-config.mjs
```

Write config only after review:

```bash
node skills/orchestrator-init/scripts/write-config.mjs --write
```

The Codex plugin manifest lives at `.codex-plugin/plugin.json`. Publication is intentionally out of scope until the local package is reviewed.
