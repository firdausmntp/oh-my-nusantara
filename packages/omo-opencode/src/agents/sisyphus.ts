import type { AgentPromptMetadata } from "./types";

export const SISYPHUS_PROMPT_METADATA: AgentPromptMetadata = {
  category: "utility",
  cost: "EXPENSIVE",
  promptAlias: "Gajah Mada",
  triggers: [],
};

export { createSisyphusAgent } from "./sisyphus-agent-factory";
