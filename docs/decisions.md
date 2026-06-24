# Decisions

This document records design decisions made before implementation.

## D001: Four Skills

The package will contain four skills:

- `orchestrator`: lightweight bootstrap and router.
- `orchestrator-init`: setup, detection, interview, config, and install support.
- `orchestrator-delegate`: single-task route selection and delegation.
- `orchestrator-swarm`: multi-route orchestration.

## D002: Global Config With Inventory

Use:

```text
~/.config/ai-orchestrator/config.yaml
~/.config/ai-orchestrator/inventory.json
```

`config.yaml` is human-editable and requires confirmation before writes. `inventory.json` is machine-generated and may be written automatically.

## D003: Deterministic Routes

Configuration stores exact invocation commands and capabilities where possible. `delegate` and `swarm` should avoid guessing at execution time.

## D004: Route Identity Includes Harness

The same model through two harnesses is two different routes. Example:

- `claude_code/anthropic/claude-sonnet`
- `opencode/anthropic/claude-sonnet`

## D005: Swarm Requires Distinct Routes

Swarm requires at least two enabled distinct routes. If fewer exist, it refuses real swarm execution and offers alternatives.

## D006: Swarm Requires Confirmation

Before dispatching agents, swarm presents a concise plan with mode, routes, prompts/context, cost/privacy summary, and expected artifacts. It proceeds only after user confirmation.

## D007: Worktree Competition Requires Commits

In worktree competition mode:

- The controller creates worktrees.
- Worktrees live in `~/.cache/ai-orchestrator/worktrees`.
- Each route must commit its result on its own branch.
- The controller compares committed results.
- The controller never applies a winner to the main repo without confirmation.

## D008: Delegate Confirmation Policy

Delegate can execute directly for cheap/local/low-risk routes if policy allows. It requires confirmation for premium routes, sensitive external data, cloud/background routes, file edits, and destructive or long-running commands.

## D009: Cost Is Both Heuristic and Confirmed

Init classifies route cost automatically, then asks the user to confirm or override.

## D010: Profiles

Config supports profiles from v1:

- `balanced`
- `cheap`
- `best`
- `local_only`

`balanced` is default.

## D011: Custom Routes

Users can define `custom_routes` for tools the detector does not understand.

## D012: Humans Are Checkpoints

Human review/approval can be a checkpoint, but does not count as one of the two routes required for a swarm.

## D013: Smoke Tests Are Separate

Passive detection runs first and writes inventory. Smoke tests are a separate explicit step because they may consume credits or require authentication.

## D014: Node Scripts First

Detection scripts use Node.js because users installing via `npx skills` almost certainly have Node. Skills should still document shell fallbacks for environments without Node.

## D015: English-Only Repository

All repo files are English. Runtime intent detection can handle other languages.

## D016: MIT License

Use MIT license.

## D017: SemVer and Tags

Use SemVer and GitHub tags. `v1.0.0` means the config schema is stable.

## D018: Local Review Before Publish

Build and test locally first. Publish to GitHub only after local review.

## D019: Superpowers-Style Multi-Harness Package

Use a multi-harness package structure inspired by `obra/Superpowers`, with common skills plus harness-specific plugin manifests/adapters.

## D020: Bootstrap Is Discreet

The `orchestrator` bootstrap should be loaded at session start when possible, but it should not aggressively force orchestration for ordinary tasks.
