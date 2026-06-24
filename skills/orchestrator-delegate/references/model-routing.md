# Model Routing Reference

Use this only when configured route metadata is insufficient or the user asks for model-selection reasoning. Prefer the user's `config.yaml` over these defaults.

## Surface First

Some choices are harness decisions, not raw model decisions:

- Cursor route: fast repo edits inside Cursor.
- Claude Code route: terminal-first coding, repo exploration, refactors, tests, review loops.
- Codex route: controlled coding work with terminal/test execution and patch iteration.
- OpenCode route: paid or open models routed through OpenCode; treat each linked model as a separate route.
- Gemini/Workspace route: Google Workspace, PDFs, images, sheets, search-heavy work, background automation.
- Ollama/local route: private, cheap, offline, high-volume tasks where local quality is sufficient.

## Paid Model Defaults

- Strong GPT/OpenAI routes: planning, validation, complex debugging, mixed research/code/docs workflows.
- Codex-specific OpenAI routes: repo edits, tests, terminal loops, implementation tasks.
- Claude Sonnet routes: default production coding, PR review, refactor, readable code, technical writing.
- Claude Opus routes: architecture, root-cause analysis, deep refactor planning, hard debugging, final arbitration.
- Claude Haiku routes: cheap scouts, extraction, summaries, classification, small tests.
- Gemini Pro routes: multimodal documents, PDFs, images, video/audio inputs, research with grounding.
- Gemini Flash routes: cheap subagents, long fan-out, classification, extraction, document scanning.
- Copilot routes: GitHub/IDE-native enterprise workflows, PR/issue context, baseline autocomplete/chat.
- Grok Build or other fast coding routes: cheap coding attempts, web/app prototyping, second opinions.
- Mistral commercial routes: OCR/document pipelines, European/self-deploy preference, code completion, structured extraction.

## Open-Weight Defaults

- Qwen Coder routes: local or server coding agents, repo edits, tool use, multilingual code work.
- DeepSeek routes: cost-efficient reasoning, coding, long-context analysis, cheap agent loops.
- Kimi routes: agentic coding, UI/build tasks, code plus design/document workflows, long-horizon builders.
- GLM routes: long-running engineering agents, terminal loops, repo-scale coding, persistent task execution.
- Gemma routes: local multimodal, OCR/extraction, classification, mobile/laptop/edge privacy.
- Llama routes: mature local/RAG ecosystem, enterprise self-host, broad compatibility.
- GPT-OSS routes: OpenAI-style local reasoning and tool use with permissive deployment needs.
- MiniMax routes: very long context, multimodal agent work, document-heavy tasks.
- Nemotron routes: NVIDIA-stack enterprise RAG, tool use, safety, efficient serving.
- Devstral/Codestral routes: software-engineering agents and completion/FIM when license and deployment policy allow.

## Tie Breakers

1. Hard constraints: privacy, offline/local requirement, required harness, required modality, required command access.
2. Safety and cost: local/cheap scout before premium fan-out; confirm premium or external-sensitive routes.
3. Harness fit: prefer the surface where the user is already working.
4. Capability match: file edits, terminal, worktree safety, multimodal, web, structured output.
5. Diversity: for validation, prefer a different provider or harness to reduce correlated failure.
6. User preference: respect explicit model, harness, cost, or privacy choices.

## Anti-Routes

- Do not send sensitive data externally without explicit confirmation.
- Do not choose premium routes for trivial classification, extraction, or boilerplate unless the user asks for best quality.
- Do not route file-edit tasks to routes marked `file_edits: false`.
- Do not compare the same model through different harnesses unless the user asks or mode is `compare_harnesses`.
- Do not use experimental local/open-weight routes for production-critical decisions without validation.
