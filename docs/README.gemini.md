# Agent Orchestrator for Gemini

Gemini support is represented by:

- `gemini-extension.json`
- `GEMINI.md`

`GEMINI.md` is the context entrypoint. It points Gemini-style agents to the four skill directories and the same global config files used by other harnesses:

- `~/.config/ai-orchestrator/inventory.json`
- `~/.config/ai-orchestrator/config.yaml`

Use `orchestrator-init` first so Gemini routes only to tools and models that were detected and enabled by the user.
