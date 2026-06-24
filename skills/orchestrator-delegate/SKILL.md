---
name: orchestrator-delegate
description: "Delegate one task to the best configured AI route. Use when the user asks to delegate, choose one AI/model/agent/harness for a task, route work, or decide which configured route should handle coding, review, research, OCR, local-private work, or background work."
---

# Orchestrator Delegate

Delegate one task to one best configured route.

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

2. Classify the task:
   - type
   - risk
   - modality
   - context size
   - privacy
   - cost/latency preference
   - needed capabilities

3. Select one route using configured strengths, capabilities, cost, privacy, and profile.

4. Confirm before executing when the selected route involves:
   - premium route
   - sensitive external data
   - cloud/background execution
   - file edits
   - destructive or long-running commands

5. If executing is not possible in the current harness, produce a delegation plan and copy-ready prompt for the selected route.

## Output

For planning-only:

```markdown
**Delegation Plan**
Task:
Selected route:
Why:
Confirmation required:
Prompt:
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
- Never claim a route was invoked unless it was actually invoked.
