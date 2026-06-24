import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(extensionDir, "../..");
const skillsDir = resolve(packageRoot, "skills");
const bootstrapSkillPath = resolve(skillsDir, "orchestrator", "SKILL.md");

let cachedBootstrap: string | null | undefined;

export default function agentOrchestratorPiExtension(pi: ExtensionAPI) {
  let injectBootstrap = true;

  pi.on("resources_discover", async () => ({
    skillPaths: [skillsDir],
  }));

  pi.on("session_start", async () => {
    injectBootstrap = true;
  });

  pi.on("context", async (event) => {
    if (!injectBootstrap) return;
    if (event.messages.some(messageContainsBootstrap)) return;
    const bootstrap = getBootstrapContent();
    if (!bootstrap) return;
    return {
      messages: [
        {
          role: "user" as const,
          content: [{ type: "text" as const, text: bootstrap }],
          timestamp: Date.now(),
        },
        ...event.messages,
      ],
    };
  });
}

function getBootstrapContent(): string | null {
  if (cachedBootstrap !== undefined) return cachedBootstrap;
  try {
    const skillContent = readFileSync(bootstrapSkillPath, "utf8");
    cachedBootstrap = `<AGENT_ORCHESTRATOR_BOOTSTRAP>
You have Agent Orchestrator. Use it discreetly for delegation, swarms, model routing, setup/config, multi-agent comparison, and worktree competition.

${stripFrontmatter(skillContent)}
</AGENT_ORCHESTRATOR_BOOTSTRAP>`;
    return cachedBootstrap;
  } catch {
    cachedBootstrap = null;
    return null;
  }
}

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return (match ? match[1] : content).trim();
}

function messageContainsBootstrap(message: unknown): boolean {
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content.includes("AGENT_ORCHESTRATOR_BOOTSTRAP");
  if (!Array.isArray(content)) return false;
  return content.some((part) => {
    return part && typeof part === "object" && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string" && (part as { text: string }).text.includes("AGENT_ORCHESTRATOR_BOOTSTRAP");
  });
}
