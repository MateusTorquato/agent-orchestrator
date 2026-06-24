# Agent Orchestrator for Claude Code

Claude Code can use the skills directly when installed by the host skill system. The package also includes optional slash commands:

- `/orchestrator`
- `/orchestrator:init`
- `/orchestrator:config`
- `/orchestrator:delegate`
- `/orchestrator:swarm`

Preview command installation:

```bash
node skills/orchestrator-init/scripts/install-commands.mjs
```

Install commands after reviewing the preview:

```bash
node skills/orchestrator-init/scripts/install-commands.mjs --write
```

The Claude plugin metadata lives in `.claude-plugin/`. The bootstrap stays discreet: it tells the agent when the orchestrator is available, but it does not force routing unless the task calls for setup, delegation, swarm validation, or model/harness comparison.
