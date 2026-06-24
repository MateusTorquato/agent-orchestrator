import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let cachedBootstrap = undefined;

const stripFrontmatter = (content) => {
  const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return (match ? match[1] : content).trim();
};

const getBootstrapContent = () => {
  if (cachedBootstrap !== undefined) return cachedBootstrap;

  const skillPath = path.resolve(__dirname, '../../skills/orchestrator/SKILL.md');
  if (!fs.existsSync(skillPath)) {
    cachedBootstrap = null;
    return cachedBootstrap;
  }

  const content = stripFrontmatter(fs.readFileSync(skillPath, 'utf8'));
  cachedBootstrap = `<AGENT_ORCHESTRATOR_BOOTSTRAP>
You have Agent Orchestrator.

The orchestrator bootstrap is included below. Use it discreetly only for delegation, swarms, model routing, multi-agent comparison, setup/config, or worktree competition. Do not force it onto ordinary tasks.

${content}

OpenCode tool mapping:
- Use OpenCode's native skill tool to load orchestrator-init, orchestrator-delegate, or orchestrator-swarm.
- Use task/subagent tools only for OpenCode-native routes.
- For external harness routes, produce configured commands/prompts unless an execution tool is available.
</AGENT_ORCHESTRATOR_BOOTSTRAP>`;
  return cachedBootstrap;
};

export const AgentOrchestratorPlugin = async () => {
  const homeDir = os.homedir();
  const skillsDir = path.resolve(__dirname, '../../skills');
  const configDir = process.env.OPENCODE_CONFIG_DIR || path.join(homeDir, '.config/opencode');
  void configDir;

  return {
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      if (!config.skills.paths.includes(skillsDir)) {
        config.skills.paths.push(skillsDir);
      }
    },
    'experimental.chat.messages.transform': async (_input, output) => {
      const bootstrap = getBootstrapContent();
      if (!bootstrap || !output.messages.length) return;
      const firstUser = output.messages.find((m) => m.info.role === 'user');
      if (!firstUser || !firstUser.parts.length) return;
      if (firstUser.parts.some((p) => p.type === 'text' && p.text.includes('AGENT_ORCHESTRATOR_BOOTSTRAP'))) return;
      const ref = firstUser.parts[0];
      firstUser.parts.unshift({ ...ref, type: 'text', text: bootstrap });
    }
  };
};

export default AgentOrchestratorPlugin;
