---
description: Agent Orchestrator router for init, config, delegate, and swarm workflows.
---

# Agent Orchestrator

Use the `orchestrator` skill.

Route based on `$ARGUMENTS`:

- setup, init, detect, configure, config -> `orchestrator-init`
- delegate, choose one model/agent/harness -> `orchestrator-delegate`
- swarm, multiple agents, compare models, worktree competition -> `orchestrator-swarm`

If no specific intent is provided, explain the four entry points briefly and ask what the user wants to do.

## Arguments

`$ARGUMENTS`
