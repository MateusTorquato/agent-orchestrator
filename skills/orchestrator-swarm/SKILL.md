---
name: orchestrator-swarm
description: "Coordinate multiple distinct AI routes. Use when the user asks for a swarm, multiple agents, multiple IAs, parallel validation, model comparison, review council, competitive solving, or worktree competition where each agent solves the same task in isolated branches."
---

# Orchestrator Swarm

Coordinate two or more distinct AI routes.

## Preconditions

Require:

```text
~/.config/ai-orchestrator/config.yaml
```

Swarm requires at least two enabled distinct routes. If fewer than two exist, stop and offer:

- run `orchestrator-delegate` instead;
- run a degraded native-subagent workflow if available;
- run `orchestrator-init` to add routes.

## Confirmation Gate

Before dispatching any route, present a concise plan and ask for confirmation.

Include:

- mode
- routes
- what each route will receive
- cost/privacy summary
- artifacts
- validation/comparison method
- worktree paths if applicable

## Modes

### Specialist

Assign different roles to distinct routes: scout, planner, executor, validator, security reviewer, performance reviewer, regression hunter.

### Competitive

Multiple routes independently solve the same task. Compare outputs with a scorecard.

### Worktree Competition

Multiple routes solve the same code task in isolated git worktrees.

Rules:

- Controller creates worktrees.
- Worktrees live under `~/.cache/ai-orchestrator/worktrees`.
- Each route gets its own branch.
- Each route must commit its result.
- Controller compares committed results.
- Nothing is applied to the main repo without user confirmation.

Preview worktree creation first:

```bash
node skills/orchestrator-swarm/scripts/create-worktrees.mjs --run-id <run-id> --routes route-a,route-b
```

Create worktrees only after explicit user approval:

```bash
node skills/orchestrator-swarm/scripts/create-worktrees.mjs --run-id <run-id> --routes route-a,route-b --write --confirmed
```

### Compare Harnesses

Allow the same model through different harnesses only when the mode is explicitly `compare_harnesses` or the user asks for it.

### Review Council

Use independent reviewers to evaluate a plan, diff, result, or decision. Prefer safe roles: skeptic, critic, validator, security reviewer.

## Workflow

1. Read config and enabled routes.
2. Classify task and choose mode.
3. Create a run directory:
   ```text
   .orchestrator/runs/<timestamp>-<slug>/
   ```
4. Build the concise confirmation plan.
5. After confirmation, dispatch routes or produce route-specific prompts if direct execution is not available.
6. Collect outputs.
7. Retry failed/invalid routes at most once when retry is appropriate.
8. Score results.
9. Write `comparison.md`.
10. Ask before applying any winning implementation.

When outputs are saved in the run directory, the controller may use:

```bash
node skills/orchestrator-swarm/scripts/compare-results.mjs --run-dir .orchestrator/runs/<run-id> --mode <mode>
```

## Scorecards

Use mode-specific scorecards:

- Worktree competition: correctness, tests passed, minimality, maintainability, risk.
- Review council: severity, evidence quality, false-positive risk, actionability.
- Research: source quality, recency, coverage, contradiction handling, clarity.

## Red Lines

- Do not dispatch swarm with fewer than two distinct routes.
- Do not run paid fan-out without confirmation.
- Do not send sensitive data externally without confirmation.
- Do not apply a winner to the main repo automatically.
- Do not instruct routes to behave maliciously.
