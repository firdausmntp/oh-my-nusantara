export { createV2Setup, renderCommandTemplate } from "./setup"
export { buildV1Input, payloadOf, V2BridgeError } from "./client-shim"
export { mapV2EventToV1 } from "./event-adapter"
export {
  adaptMcpServer,
  adaptTool,
  agentPermissionToRules,
  agentToolsToPermissions,
  applyAgentToDraft,
  subagentArgsToV1,
  toolNameToV1,
  toolNameToV2,
} from "./adapters"
export type {
  V2AgentEditor,
  V2AgentInfo,
  V2Cleanup,
  V2CommandEditor,
  V2Context,
  V2Event,
  V2McpEditor,
  V2McpServerConfig,
  V2PluginOptions,
  V2Registration,
  V2SessionCompactionEvent,
  V2SessionContextEvent,
  V2SessionHookName,
  V2SessionModelRequestEvent,
  V2SessionPromptEvent,
  V2Setup,
  V2SkillEditor,
  V2SkillInfo,
  V2ToolAfterEvent,
  V2ToolDefinition,
  V2ToolEditor,
  V2ToolExecuteContext,
  V2ToolHookEvent,
  V2ToolResult,
} from "./types"
