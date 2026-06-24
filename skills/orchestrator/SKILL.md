---
name: orchestrator
description: "Lightweight Agent Orchestrator bootstrap and router. Use when the user asks for delegation, swarms, model routing, multi-agent comparison, AI/model choice, orchestrator setup/config, or worktree competition. Also use when the user asks slash-command style requests such as /orchestrator, /orchestrator:init, /orchestrator:config, /orchestrator:delegate, or /orchestrator:swarm."
---

# Agent Orchestrator

Agent Orchestrator routes work across AI models, CLI harnesses, local models, and swarms.

Use this skill discreetly. Do not force orchestration onto ordinary coding tasks. Activate it when the user asks to delegate, swarm, compare agents/models, configure available agents, run worktree competitions, or choose which AI should do a task.

## Router

Choose the target skill:

| User intent | Use |
| --- | --- |
| Setup, detect installed CLIs/models, edit config, install harness commands/plugins | `orchestrator-init` |
| Choose one best route for a task | `orchestrator-delegate` |
| Coordinate 2+ distinct routes, compare results, validate with multiple AIs, or run worktree competition | `orchestrator-swarm` |

## Config Gate

`orchestrator-delegate` and `orchestrator-swarm` require:

```text
~/.config/ai-orchestrator/config.yaml
```

If the config is missing, route to `orchestrator-init` first. Do not continue with ad hoc model guesses unless the user explicitly asks for a conceptual plan only.

## Slash Command Mapping

When a user invokes a slash-style command:

- `/orchestrator` -> this skill.
- `/orchestrator:init` -> `orchestrator-init`.
- `/orchestrator:config` -> `orchestrator-init` in config editing mode.
- `/orchestrator:delegate` -> `orchestrator-delegate`.
- `/orchestrator:swarm` -> `orchestrator-swarm`.

## Principles

- A route is `surface + provider + model + command + capabilities + policy`.
- Treat the same model through different harnesses as different routes.
- Use `delegate` for one route.
- Use `swarm` for two or more distinct routes.
- Prefer local/private routes when data may be sensitive.
- Ask before paid fan-out, premium routes, cloud/background agents, external handling of sensitive data, file edits, or destructive commands.
