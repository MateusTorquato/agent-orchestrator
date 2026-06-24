# Agent Orchestrator for Kimi Code

Kimi plugin metadata lives at `.kimi-plugin/plugin.json`.

The Kimi route should be treated as its own surface, even if it can call models also available through another harness. This matters for comparison: using the same model through Kimi and another CLI is only allowed by default in explicit `compare_harnesses` mode or when the user asks for it.

Recommended use:

- Use Kimi-native tools for Kimi routes.
- Use `orchestrator-init` to detect Kimi and any linked model candidates.
- Ask the user before enabling all models surfaced by the harness.
- Keep paid/premium fan-out behind confirmation.

If the task requires external harnesses, Kimi should produce the configured command or prompt unless the runtime exposes an execution tool for that route.
