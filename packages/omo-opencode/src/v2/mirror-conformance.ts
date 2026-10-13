// Compile-time guard pinning the hand-mirror in types.ts against the
// official @opencode/plugin surface. Import-type only — this file must never
// be imported at runtime, and must NOT be renamed to *.test.ts (tsconfig
// excludes test-suffixed files from tsc, which would silently disable it).
// When the @opencode/plugin devDependency is bumped, `bun run typecheck`
// fails here first if hook names or payload contracts drifted.
import type { Plugin as OfficialPluginNamespace } from "@opencode/plugin"
import type { SessionHooks as OfficialSessionHooks } from "@opencode/plugin/promise/session"
import type {
  V2AgentEditor,
  V2AgentInfo,
  V2Cleanup,
  V2CommandEditor,
  V2Context,
  V2McpEditor,
  V2McpServerConfig,
  V2Registration,
  V2SessionCompactionEvent,
  V2SessionContextEvent,
  V2SessionHookName,
  V2SessionModelRequestEvent,
  V2SessionPromptEvent,
  V2SkillEditor,
  V2ToolAfterEvent,
  V2ToolDefinition,
  V2ToolEditor,
  V2ToolHookEvent,
} from "./types"

// L0: the dual export must satisfy both module shapes.
export type DualModuleShape = {
  id: string
  server: unknown
  setup: (ctx: V2Context) => Promise<V2Cleanup | void> | V2Cleanup | void
}

type OfficialContext = OfficialPluginNamespace.Context

type AssertOfficialPluginHasDefine = typeof OfficialPluginNamespace extends {
  define: (plugin: infer P) => infer R
}
  ? { defineInput: P; defineOutput: R }
  : never

export type OfficialDefineShape = AssertOfficialPluginHasDefine

// L1: session hook names we register must exist on the official spec.
export type OfficialHookName = keyof OfficialSessionHooks
export type RequiredHookNames =
  | "prompt"
  | "context"
  | "compaction"
  | "model.request"
export type HookNameCoverage = RequiredHookNames extends OfficialHookName ? true : never
export const hookNameCoverage: HookNameCoverage = true
export const mirrorHookNames: V2SessionHookName[] = [
  "prompt",
  "context",
  "compaction",
  "generate",
  "title",
  "model.request",
  "http.request",
  "http.response",
  "retry",
]

// L2: mirror payloads must accept the official payloads (official assignable
// to mirror). If the host adds required fields, these assignments fail.
export type ContextEventCompatibility = OfficialSessionHooks["context"] extends infer E
  ? E extends V2SessionContextEvent
    ? true
    : false
  : false

export type PromptEventCompatibility = OfficialSessionHooks["prompt"] extends infer E
  ? E extends V2SessionPromptEvent
    ? true
    : false
  : false

export type CompactionEventCompatibility = OfficialSessionHooks["compaction"] extends infer E
  ? E extends V2SessionCompactionEvent
    ? true
    : false
  : false

export type ModelRequestEventCompatibility = OfficialSessionHooks["model.request"] extends infer E
  ? E extends V2SessionModelRequestEvent
    ? true
    : false
  : false

export const promptEventCompatibility: PromptEventCompatibility = true
export const contextEventCompatibility: ContextEventCompatibility = true
export const compactionEventCompatibility: CompactionEventCompatibility = true
export const modelRequestEventCompatibility: ModelRequestEventCompatibility = true

// L3: domain contracts the bridge relies on.
export type AgentEditorCompatibility = {
  transform: OfficialContext["agent"]["transform"]
} extends {
  transform: (callback: (editor: V2AgentEditor) => void) => Promise<V2Registration>
}
  ? true
  : false

export type AgentInfoCompatibility = V2AgentInfo["permissions"] extends
  | Array<{ action: string; resource: string; effect: "allow" | "deny" | "ask" }>
  | undefined
  ? true
  : false

export type ToolEditorCompatibility = {
  transform: OfficialContext["tool"]["transform"]
  hook: OfficialContext["tool"]["hook"]
} extends {
  transform: (callback: (editor: V2ToolEditor) => void) => Promise<V2Registration>
  hook: (
    name: "execute.before" | "execute.after",
    callback: (event: never) => Promise<void> | void,
  ) => Promise<V2Registration>
}
  ? true
  : false

export type ToolDefinitionCompatibility = V2ToolDefinition extends {
  name: string
  description: string
}
  ? V2ToolHookEvent extends { tool: string; input: unknown }
    ? V2ToolAfterEvent extends { status: "completed" | "error" }
      ? true
      : false
    : false
  : false

export type CommandEditorCompatibility = {
  transform: OfficialContext["command"]["transform"]
} extends {
  transform: (callback: (editor: V2CommandEditor) => void) => Promise<V2Registration>
}
  ? true
  : false

export type McpCompatibility = NonNullable<OfficialContext["mcp"]> extends {
  transform: (callback: (editor: infer E) => void) => Promise<V2Registration>
}
  ? E extends V2McpEditor
    ? V2McpServerConfig extends { type: "remote" | "local" }
      ? true
      : false
    : false
  : false

export type SkillCompatibility = NonNullable<OfficialContext["skill"]> extends {
  transform: (callback: (editor: infer E) => void) => Promise<V2Registration>
}
  ? E extends V2SkillEditor
    ? true
    : false
  : false

export const agentInfoCompatibility: AgentInfoCompatibility = true
export const toolDefinitionCompatibility: ToolDefinitionCompatibility = true
