type McpVisibleAgent = {
  backend: string;
  name?: string;
  cliPath?: string;
  supportedTransports?: string[];
};

const BLOCKED_AGENT_BACKENDS = new Set(['gemini', 'claude', 'anthropic']);
const BLOCKED_AGENT_NAME_PATTERNS = [/gemini/i, /claude/i, /anthropic/i, /aion\s*cli/i];

export const isVisibleMcpAgent = (agent: McpVisibleAgent): boolean => {
  const backend = agent.backend.toLowerCase();
  const name = agent.name ?? '';

  if (BLOCKED_AGENT_BACKENDS.has(backend)) {
    return false;
  }

  return !BLOCKED_AGENT_NAME_PATTERNS.some((pattern) => pattern.test(name));
};

export const filterVisibleMcpAgents = <T extends McpVisibleAgent>(agents: T[]): T[] => agents.filter(isVisibleMcpAgent);

export const filterVisibleMcpAgentNames = (agents: string[]): string[] =>
  agents.filter((agent) => !BLOCKED_AGENT_NAME_PATTERNS.some((pattern) => pattern.test(agent)));
