// Adapters projecting V1 tool/agent/MCP definitions onto V2 domains.
// All functions are pure data mappings except adaptToolExecute, which needs
// the V2 execute context at call time.
import { tool } from "@opencode-ai/plugin/tool"
import type { z } from "zod"
import { log } from "../shared/logger"
import type {
  V2AgentInfo,
  V2AgentPermission,
  V2McpServerConfig,
  V2ToolDefinition,
  V2ToolExecuteContext,
  V2ToolResult,
} from "./types"

export type V1ToolDefinition = {
  description: string
  args: Record<string, z.ZodTypeAny>
  execute: (
    args: Record<string, unknown>,
    context: {
      sessionID: string
      messageID: string
      agent: string
      directory: string
      worktree: string
      abort: AbortSignal
      metadata: (input: { title?: string; metadata?: Record<string, unknown> }) => void
      ask: (input: {
        permission: string
        patterns: string[]
        always: string[]
        metadata: Record<string, unknown>
      }) => Promise<void>
    },
  ) => Promise<string | { title?: string; output: string; metadata?: Record<string, unknown> }>
}

function schemaForTool(name: string, args: unknown): Record<string, unknown> {
  // Baseline: expose parameter NAMES even if conversion fails, so the model
  // still sees the shape.
  const namedProps: Record<string, unknown> = isRecord(args)
    ? Object.fromEntries(Object.keys(args).map((key) => [key, {}]))
    : {}
  try {
    if (!isRecord(args)) throw new Error("non-object args")
    // Convert each arg schema individually (the same pattern as
    // normalize-tool-arg-schemas.ts). Wrapping the whole shape in
    // z.object() and converting once throws `flattenRef: seen.ref`
    // because the V1 registry already attached a _zod.toJSONSchema
    // override to each schema, which confuses the whole-graph walker.
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    for (const [key, schema] of Object.entries(args)) {
      try {
        properties[key] = tool.schema.toJSONSchema(schema as never)
      } catch {
        properties[key] = {}
      }
      if (
        typeof (schema as { isOptional?: () => boolean }).isOptional ===
          "function" &&
        !(schema as { isOptional: () => boolean }).isOptional()
      ) {
        required.push(key)
      }
    }
    const jsonSchema: Record<string, unknown> = { type: "object", properties }
    if (required.length > 0) jsonSchema.required = required
    return jsonSchema
  } catch (error) {
    log("[v2-bridge] tool schema fallback to named params", {
      tool: name,
      error: error instanceof Error ? error.message : String(error),
    })
    return { type: "object", properties: namedProps }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function adaptTool(name: string, definition: V1ToolDefinition): V2ToolDefinition {
  const input = schemaForTool(name, definition.args)
  return {
    name,
    description: definition.description,
    input,
    // shortcut: codemode opt-out required on V2, otherwise the tool is
    // confined to the execute-tool JS runtime and model calls fail with
    // "Unknown tool". Additive field; older hosts ignore it.
    options: { codemode: false },
    execute: async (toolInput: never, context: V2ToolExecuteContext): Promise<V2ToolResult> => {
      const captured: { title?: string; metadata?: Record<string, unknown> } = {}
      const args = (toolInput ?? {}) as Record<string, unknown>
      const result = await definition.execute(args, {
        sessionID: context.sessionID,
        messageID: context.messageID,
        agent: context.agent,
        directory: context.directory,
        worktree: context.worktree,
        abort: context.signal,
        metadata: (input) => {
          if (input.title !== undefined) captured.title = input.title
          if (input.metadata !== undefined) captured.metadata = input.metadata
        },
        // shortcut: V2 execute contexts expose no ask channel; the host
        // enforces tool permission via agent rules instead. Log and continue
        // rather than failing skill loads that gate on ask.
        ask: async (input) => {
          log("[v2-bridge] tool ask() deferred to host permission rules", {
            tool: name,
            permission: input.permission,
          })
        },
      })
      if (typeof result === "string") {
        return { content: result, ...(captured.title ? { title: captured.title } : {}) }
      }
      return {
        content: result.output,
        ...(result.title ?? captured.title ? { title: result.title ?? captured.title } : {}),
        ...(result.metadata ?? captured.metadata
          ? { metadata: { ...captured.metadata, ...result.metadata } }
          : {}),
      }
    },
  }
}

type V1McpConfig = {
  type: "remote" | "local"
  url?: string
  headers?: Record<string, string>
  oauth?: false | Record<string, unknown>
  command?: string[]
  cwd?: string
  environment?: Record<string, string>
  env?: Record<string, string>
  [key: string]: unknown
}

export function adaptMcpServer(config: V1McpConfig): V2McpServerConfig | undefined {
  if (config.type === "remote") {
    if (typeof config.url !== "string") return undefined
    return {
      type: "remote",
      url: config.url,
      ...(config.headers ? { headers: config.headers } : {}),
      ...(config.oauth !== undefined ? { oauth: config.oauth as false } : {}),
    }
  }
  if (config.type === "local") {
    if (!Array.isArray(config.command)) return undefined
    return {
      type: "local",
      command: config.command as string[],
      ...(typeof config.cwd === "string" ? { cwd: config.cwd } : {}),
      ...((config.environment ?? config.env) ? { environment: (config.environment ?? config.env) as Record<string, string> } : {}),
    }
  }
  return undefined
}

export type V1AgentConfig = {
  model?: string
  temperature?: number
  top_p?: number
  prompt?: string
  tools?: Record<string, boolean>
  disable?: boolean
  description?: string
  mode?: "subagent" | "primary" | "all"
  color?: string
  maxSteps?: number
  permission?: Record<string, string | Record<string, string>>
  [key: string]: unknown
}

function parseModelRef(model: string): { providerID: string; id: string } | undefined {
  // V1 models are "provider/model"; bare ids inherit the session model.
  const slash = model.lastIndexOf("/")
  if (slash <= 0 || slash >= model.length - 1) return undefined
  return { providerID: model.slice(0, slash), id: model.slice(slash + 1) }
}

function normalizeToolNameForV2(toolName: string): string {
  // The V2 host serves delegation as `subagent`; our V1 name is `task`.
  if (toolName === "task") return "subagent"
  return toolName
}

export function agentToolsToPermissions(tools: Record<string, boolean>): V2AgentPermission[] {
  const permissions: V2AgentPermission[] = []
  for (const [toolName, allowed] of Object.entries(tools)) {
    permissions.push({
      action: normalizeToolNameForV2(toolName),
      resource: "*",
      effect: allowed ? "allow" : "deny",
    })
  }
  return permissions
}

export function agentPermissionToRules(
  permission: Record<string, string | Record<string, string>>,
): V2AgentPermission[] {
  const rules: V2AgentPermission[] = []
  for (const [action, value] of Object.entries(permission)) {
    if (typeof value === "string") {
      if (value === "allow" || value === "deny" || value === "ask") {
        rules.push({ action, resource: "*", effect: value })
      }
      continue
    }
    if (isRecord(value)) {
      for (const [resource, effect] of Object.entries(value)) {
        if (effect === "allow" || effect === "deny" || effect === "ask") {
          rules.push({ action, resource, effect })
        }
      }
    }
  }
  return rules
}

// Applies a V1 agent config onto a V2 agent editor entry in place. The V2
// AgentEditor has no add(); this relies on host update-as-upsert and must be
// verified live (`opencode debug agents`). Tools-allow entries are applied
// FIRST so explicit permission denies win under last-match-wins.
export function applyAgentToDraft(agent: V2AgentInfo, name: string, config: V1AgentConfig): void {
  if (config.disable === true) return
  agent.name = name
  if (typeof config.description === "string") agent.description = config.description
  if (config.mode === "subagent" || config.mode === "primary" || config.mode === "all") {
    agent.mode = config.mode
  }
  if (typeof config.prompt === "string") agent.system = config.prompt
  if (typeof config.model === "string") {
    const ref = parseModelRef(config.model)
    if (ref) {
      agent.model = ref
    } else {
      // shortcut: bare model ids cannot be resolved without the provider
      // inventory; inherit the session model instead of guessing.
      delete agent.model
    }
  }
  if (typeof config.temperature === "number") {
    agent.request = agent.request ?? { settings: {}, headers: {}, body: {} }
    agent.request.settings = { ...(agent.request.settings ?? {}), temperature: config.temperature }
  }
  if (typeof config.color === "string") agent.color = config.color
  if (typeof config.maxSteps === "number") agent.steps = config.maxSteps
  const permissions: V2AgentPermission[] = [...(agent.permissions ?? [])]
  if (config.tools && isRecord(config.tools)) {
    for (const rule of agentToolsToPermissions(config.tools as Record<string, boolean>)) {
      permissions.push(rule)
    }
  }
  if (config.permission && isRecord(config.permission)) {
    for (const rule of agentPermissionToRules(
      config.permission as Record<string, string | Record<string, string>>,
    )) {
      permissions.push(rule)
    }
  }
  if (permissions.length > 0) agent.permissions = permissions
}

// V1 tool.execute.before/after events use { tool, sessionID, callID } while V2
// uses { tool, sessionID, id }. The host delegation tool is `subagent`; ours
// is `task`. Both directions are normalized here.
export function toolNameToV1(toolName: string): string {
  return toolName.toLowerCase() === "subagent" ? "task" : toolName
}

export function toolNameToV2(toolName: string): string {
  return toolName === "task" ? "subagent" : toolName
}

export function subagentArgsToV1(args: unknown): Record<string, unknown> {
  if (!isRecord(args)) return {}
  const out: Record<string, unknown> = { ...args }
  if (typeof out.agent === "string" && out.subagent_type === undefined) {
    out.subagent_type = out.agent
    delete out.agent
  }
  const sessionID = out.sessionID
  if (typeof sessionID === "string" && out.task_id === undefined) {
    out.task_id = sessionID
  }
  return out
}
