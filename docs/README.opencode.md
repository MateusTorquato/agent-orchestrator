# Agent Orchestrator for OpenCode

Add Agent Orchestrator to the `plugin` array in `opencode.json`:

```json
{
  "plugin": ["agent-orchestrator@git+https://github.com/MateusTorquato/agent-orchestrator.git"]
}
```

For local development, point OpenCode at the checkout:

```json
{
  "plugin": ["/path/to/agent-orchestrator"]
}
```

The OpenCode entrypoint is `.opencode/plugins/agent-orchestrator.js`, also exposed as the package `main` in `package.json`.

After installation, run `orchestrator-init` before using `delegate` or `swarm`. The package should detect OpenCode as a harness and ask whether linked models should be enabled as OpenCode-specific routes.
