# Installing Agent Orchestrator for OpenCode

Add Agent Orchestrator to the `plugin` array in your `opencode.json`:

```json
{
  "plugin": ["agent-orchestrator@git+https://github.com/MateusTorquato/agent-orchestrator.git"]
}
```

Restart OpenCode. The plugin registers the skills directory and injects a discreet bootstrap that points users to `orchestrator-init`, `orchestrator-delegate`, and `orchestrator-swarm` when relevant.

If installed from a local checkout during development, point OpenCode at the package path:

```json
{
  "plugin": ["/path/to/agent-orchestrator"]
}
```
