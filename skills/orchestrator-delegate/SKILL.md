---
name: orchestrator-delegate
description: "Delegate one task to the best configured AI route. Use when the user asks to delegate, choose one AI/model/agent/harness for a task, route work, or decide which configured route should handle coding, review, research, OCR, local-private work, or background work."
---

# Orchestrator Delegate

Delegate one task to one best configured external route. Delegate is external-by-default: avoid routing back into the current harness unless the user explicitly asks for the current/default route or no viable external route exists.

## Preconditions

Require:

```text
~/.config/ai-orchestrator/config.yaml
```

If missing, stop and route to `orchestrator-init`. Do not guess a route unless the user explicitly asks for conceptual advice only.

## Workflow

1. Read config:
   ```bash
   node skills/orchestrator-delegate/scripts/route-task.mjs --explain "<task summary>"
   ```
   To inspect current-route detection:
   ```bash
   node skills/orchestrator-delegate/scripts/detect-current-route.mjs
   ```

2. Classify the task:
   - type
   - risk
   - modality
   - context size
   - privacy
   - cost/latency preference
   - needed capabilities

   If route choice is ambiguous or the user asks why one model/harness is better than another, read `references/model-routing.md`.

3. Select one route using configured strengths, capabilities, ordered `task_defaults`, routing rules, cost, privacy, and profile. Exclude the current route by default when detected.

   Use override when needed:
   ```bash
   node skills/orchestrator-delegate/scripts/route-task.mjs --current-route codex/openai/gpt-5.5 --explain "<task>"
   ```

4. Confirm before executing when the selected route involves:
   - premium route
   - sensitive external data
   - cloud/background execution
   - file edits
   - destructive or long-running commands

5. If the task is broad research, model comparison, validation, review council, or repo/codebase investigation, suggest a short `orchestrator-swarm` plan but do not dispatch it automatically.

6. If executing is not possible in the current harness, produce a delegation plan and copy-ready prompt for the selected route.

## Output

For planning-only:

```markdown
**Delegation Plan**
Task:
Selected route:
Why:
Confirmation required:
Prompt:
Other viable routes:
Swarm suggestion:
```

For executed work:

```markdown
Routed as:
Used:
Result:
Validation:
Risks:
```

## Routing Principles

- Choose the cheapest route that can reliably complete the task.
- Use premium routes for high-risk planning, execution, or validation only when justified.
- Prefer local routes for sensitive data.
- Treat same model through different harnesses as different routes.
- Detect and exclude the current route by default.
- Treat `task_defaults` as ordered preference lists, not single values.
- Read optional learned rules from `~/.config/ai-orchestrator/routing-rules.yaml`; never create or change that file without explicit user confirmation.
- Never claim a route was invoked unless it was actually invoked.
