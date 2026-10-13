// V2 setup: reuses the full V1 factory, then bridges the returned V1 hooks
// into V2 registrations. Every domain bridge is independently try/catch
// guarded so one failure cannot disable the rest; session hooks fail loud
// (a registration failure fails setup) while transforms degrade with logs.
// Cleanup is FIFO on success (registrations, then V1 dispose).
import type { Hooks } from "@opencode-ai/plugin"
import { log } from "../shared/logger"
import { PLUGIN_NAME } from "../shared/plugin-identity"
import {
  adaptMcpServer,
  adaptTool,
  applyAgentToDraft,
  subagentArgsToV1,
  toolNameToV1,
  type V1AgentConfig,
  type V1ToolDefinition,
} from "./adapters"
import { buildV1Input } from "./client-shim"
import { mapV2EventToV1 } from "./event-adapter"
import type {
  V2AgentInfo,
  V2Cleanup,
  V2Context,
  V2Message,
  V2Registration,
  V2SessionCompactionEvent,
  V2SessionContextEvent,
  V2SessionModelRequestEvent,
  V2SessionPromptEvent,
  V2ToolAfterEvent,
  V2ToolHookEvent,
} from "./types"

type V1HookFn = (...args: never[]) => unknown
type V1HooksBag = Record<string, V1HookFn | Record<string, V1HookFn> | undefined>

type ServerPlugin = (input: never, options?: never) => Promise<Hooks>

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null) return value as Record<string, unknown>
  return undefined
}

function hookOf(hooks: V1HooksBag, key: string): V1HookFn | undefined {
  const entry = hooks[key]
  return typeof entry === "function" ? entry : undefined
}

function textOfPrompt(prompt: V2SessionPromptEvent["prompt"]): string {
  return typeof prompt.text === "string" ? prompt.text : ""
}

function renderCommandTemplate(template: string, argsText: string, sessionID: string): string {
  const now = new Date().toISOString()
  return template
    .replaceAll("$ARGUMENTS", argsText)
    .replaceAll("$SESSION_ID", sessionID)
    .replaceAll("$TIMESTAMP", now)
}

function promptTextOf(invocation: { prompt: Record<string, unknown> }): string {
  const prompt = invocation.prompt
  if (typeof prompt.text === "string") return prompt.text
  const parts = prompt.parts
  if (Array.isArray(parts)) {
    return parts
      .map((part) => (asRecord(part)?.text as string | undefined) ?? "")
      .join("\n")
  }
  return ""
}

export function createV2Setup(deps: { serverPlugin: ServerPlugin }): (ctx: V2Context) => Promise<V2Cleanup> {
  const { serverPlugin } = deps

  return async (ctx: V2Context): Promise<V2Cleanup> => {
    const disposers: Array<() => Promise<void>> = []
    const track = (registration: V2Registration | undefined, label: string): void => {
      if (registration && typeof registration.dispose === "function") {
        disposers.push(() => registration.dispose())
      } else {
        log("[v2-bridge] registration missing dispose", { label })
      }
    }

    if (!ctx || typeof ctx.agent?.transform !== "function") {
      log("[v2-bridge] ctx.agent.transform unavailable; plugin loads inert", {
        version: (ctx?.app as { version?: string } | undefined)?.version,
      })
      return () => {}
    }

    log(`[v2-bridge] setup ${PLUGIN_NAME}`, {
      hostVersion: (ctx.app as { version?: string } | undefined)?.version,
      directory: ctx.location?.directory,
    })

    // 1. Reuse the entire V1 build (config, managers, tools, hooks).
    const v1Input = buildV1Input(ctx)
    let v1Hooks: Hooks
    try {
      v1Hooks = await serverPlugin(v1Input as never)
    } catch (error) {
      log("[v2-bridge] V1 factory failed; plugin loads inert", {
        error: error instanceof Error ? error.message : String(error),
      })
      return () => {}
    }
    const hooks = v1Hooks as unknown as V1HooksBag

    // 2. Run the V1 config pipeline against a synthetic config and harvest
    // agents / MCPs / commands (the pipeline already applies overrides,
    // disabled lists, and model resolution).
    const syntheticConfig: Record<string, unknown> = {}
    const configHook = hookOf(hooks, "config")
    if (configHook) {
      try {
        await configHook(syntheticConfig as never)
      } catch (error) {
        log("[v2-bridge] V1 config pipeline failed; agents/MCPs/commands skipped", {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // 3. Agents: update-as-upsert (V2 AgentEditor has no add). Verified live
    // via `opencode debug agents`; if the host ignores missing ids, only the
    // default + log below will show it.
    const harvestedAgents = asRecord(syntheticConfig.agent) ?? {}
    const agentNames = Object.keys(harvestedAgents)
    if (agentNames.length > 0) {
      try {
        const snapshot = agentNames.map((name) => ({
          name,
          config: harvestedAgents[name] as V1AgentConfig,
        }))
        track(
          await ctx.agent.transform((draft) => {
            for (const { name, config } of snapshot) {
              if (!asRecord(config)) continue
              try {
                draft.update(name, (agent: V2AgentInfo) => {
                  applyAgentToDraft(agent, name, config as V1AgentConfig)
                })
              } catch (error) {
                log("[v2-bridge] agent update failed", {
                  agent: name,
                  error: error instanceof Error ? error.message : String(error),
                })
              }
            }
            if (snapshot.some(({ name }) => name === "sisyphus")) {
              try {
                draft.default("sisyphus")
              } catch {
                // Host without sisyphus entry yet; leave default alone.
              }
            }
          }),
          "agent.transform",
        )
        log("[v2-bridge] agents projected", { count: agentNames.length })
      } catch (error) {
        log("[v2-bridge] agent transform failed", {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    } else {
      log("[v2-bridge] config pipeline produced no agents; skipping agent transform")
    }

    // 4. MCPs: set builtins unless the host already owns the key.
    const harvestedMcp = asRecord(syntheticConfig.mcp) ?? {}
    const mcpNames = Object.keys(harvestedMcp)
    if (mcpNames.length > 0) {
      if (!ctx.mcp || typeof ctx.mcp.transform !== "function") {
        log("[v2-bridge] ctx.mcp.transform unavailable; MCPs skipped")
      } else {
        try {
          const snapshot = mcpNames.map((name) => ({
            name,
            adapted: adaptMcpServer((harvestedMcp[name] ?? {}) as never),
          }))
          track(
            await ctx.mcp.transform((draft) => {
              for (const { name, adapted } of snapshot) {
                if (!adapted) continue
                try {
                  if (draft.get(name) !== undefined) continue
                  draft.set(name, adapted)
                } catch (error) {
                  log("[v2-bridge] MCP set failed", {
                    mcp: name,
                    error: error instanceof Error ? error.message : String(error),
                  })
                }
              }
            }),
            "mcp.transform",
          )
          log("[v2-bridge] MCPs projected", { count: snapshot.filter((s) => s.adapted).length })
        } catch (error) {
          log("[v2-bridge] MCP transform failed", {
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    // 5. Tools (native V1 map) + per-tool definition hook.
    const v1Tools = asRecord(hooks.tool as unknown) ?? {}
    const toolDefinitionHook = hookOf(hooks, "tool.definition")
    const toolNames = Object.keys(v1Tools)
    if (toolNames.length > 0) {
      try {
        const snapshot = toolNames.map((name) => ({
          name,
          definition: v1Tools[name] as V1ToolDefinition,
        }))
        track(
          await ctx.tool.transform((draft) => {
            for (const { name, definition } of snapshot) {
              if (!asRecord(definition) || typeof definition.execute !== "function") continue
              try {
                const adapted = adaptTool(name, definition)
                if (toolDefinitionHook) {
                  const output = { description: adapted.description, parameters: adapted.input }
                  void Promise.resolve()
                    .then(() => toolDefinitionHook({ toolID: name } as never, output as never))
                    .then(() => {
                      if (typeof output.description === "string") {
                        adapted.description = output.description
                      }
                    })
                    .catch((error: unknown) => {
                      log("[v2-bridge] tool.definition hook failed", {
                        tool: name,
                        error: error instanceof Error ? error.message : String(error),
                      })
                    })
                }
                draft.add(adapted)
              } catch (error) {
                log("[v2-bridge] tool add failed", {
                  tool: name,
                  error: error instanceof Error ? error.message : String(error),
                })
              }
            }
          }),
          "tool.transform",
        )
        log("[v2-bridge] tools projected", { count: toolNames.length })
      } catch (error) {
        log("[v2-bridge] tool transform failed", {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // 6. Commands: harvested templates render $ARGUMENTS/$SESSION_ID/
    // $TIMESTAMP inline; the V1 command hook runs for side effects
    // (ralph-loop state, start-work) before the text is submitted.
    const harvestedCommands = asRecord(syntheticConfig.command) ?? {}
    const commandEntries = Object.entries(harvestedCommands).filter((entry) => {
      const definition = asRecord(entry[1])
      return definition && typeof definition.template === "string"
    })
    const commandBeforeHook = hookOf(hooks, "command.execute.before")
    if (commandEntries.length > 0) {
      try {
        const snapshot = commandEntries.map(([name, raw]) => {
          const definition = raw as { template: string; description?: string }
          return { name, template: definition.template, description: definition.description }
        })
        track(
          await ctx.command.transform((draft) => {
            for (const { name, template, description } of snapshot) {
              try {
                draft.add({
                  name,
                  ...(description ? { description } : {}),
                  execute: async (invocation) => {
                    const argsText = promptTextOf(invocation)
                    if (commandBeforeHook) {
                      try {
                        await commandBeforeHook(
                          { command: name, sessionID: invocation.sessionID, arguments: argsText } as never,
                          { parts: [], message: {} } as never,
                        )
                      } catch (error) {
                        log("[v2-bridge] command side-effect hook failed", {
                          command: name,
                          error: error instanceof Error ? error.message : String(error),
                        })
                      }
                    }
                    const text = renderCommandTemplate(template, argsText, invocation.sessionID)
                    await ctx.session.prompt?.({
                      sessionID: invocation.sessionID,
                      text,
                      delivery: invocation.delivery,
                    })
                  },
                })
              } catch (error) {
                log("[v2-bridge] command add failed", {
                  command: name,
                  error: error instanceof Error ? error.message : String(error),
                })
              }
            }
          }),
          "command.transform",
        )
        log("[v2-bridge] commands projected", { count: snapshot.length })
      } catch (error) {
        log("[v2-bridge] command transform failed", {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // Per-session admission tracking for the model.request bridge.
    const lastUserMessageID = new Map<string, string>()
    const chatMessageHook = hookOf(hooks, "chat.message")
    const chatParamsHook = hookOf(hooks, "chat.params")
    const chatHeadersHook = hookOf(hooks, "chat.headers")
    const messagesTransformHook = hookOf(hooks, "experimental.chat.messages.transform")
    const systemTransformHook = hookOf(hooks, "experimental.chat.system.transform")
    const compactingHook = hookOf(hooks, "experimental.session.compacting")
    const eventHook = hookOf(hooks, "event")
    const toolBeforeHook = hookOf(hooks, "tool.execute.before")
    const toolAfterHook = hookOf(hooks, "tool.execute.after")

    // 7. Session hooks (fail loud: registration failure fails setup).
    try {
      if (chatMessageHook) {
        track(
          await ctx.session.hook("prompt", (event: V2SessionPromptEvent) => {
            const sessionID = event.sessionID
            if (event.messageID) lastUserMessageID.set(sessionID, event.messageID)
            const rawAgent = event.prompt.agents?.[0]
            const agent = typeof rawAgent === "string" ? rawAgent : rawAgent?.name
            const output = {
              message: event.prompt as unknown as Record<string, unknown>,
              parts: [{ type: "text", text: textOfPrompt(event.prompt) }],
            }
            return Promise.resolve()
              .then(() => chatMessageHook({ sessionID, ...(agent ? { agent } : {}) } as never, output as never))
              .then(() => {
                const firstText = output.parts.find((part) => part.type === "text" && typeof part.text === "string")
                if (firstText?.text !== undefined && firstText.text !== textOfPrompt(event.prompt)) {
                  event.prompt.text = firstText.text
                }
              })
              .catch((error: unknown) => {
                log("[v2-bridge] chat.message hook failed", {
                  sessionID,
                  error: error instanceof Error ? error.message : String(error),
                })
              })
          }) as never,
          "session.prompt",
        )
      }

      track(
        await ctx.session.hook("context", (event: V2SessionContextEvent) => {
          return (async () => {
            if (chatParamsHook) {
              try {
                const output: {
                  temperature?: number
                  topP?: number
                  topK?: number
                  maxOutputTokens?: number
                  options: Record<string, unknown>
                } = { options: { ...(event.options ?? {}) } }
                await chatParamsHook(
                  {
                    sessionID: event.sessionID,
                    agent: { name: event.agent },
                    model: { providerID: event.model.providerID, modelID: event.model.id },
                    provider: { id: event.model.providerID },
                    message: {},
                  } as never,
                  output as never,
                )
                if (output.temperature !== undefined) event.options.temperature = output.temperature
                if (output.topP !== undefined) event.options.topP = output.topP
                if (output.topK !== undefined) event.options.topK = output.topK
                if (output.maxOutputTokens !== undefined) event.options.maxTokens = output.maxOutputTokens
                Object.assign(event.options, output.options)
              } catch (error) {
                log("[v2-bridge] chat.params hook failed", {
                  sessionID: event.sessionID,
                  error: error instanceof Error ? error.message : String(error),
                })
              }
            }
            if (systemTransformHook) {
              try {
                const seed = event.system.map((part) => part.text)
                const output = { system: [...seed] }
                await systemTransformHook(
                  {
                    sessionID: event.sessionID,
                    model: { id: event.model.id, providerID: event.model.providerID },
                  } as never,
                  output as never,
                )
                for (const text of output.system.slice(seed.length)) {
                  event.system.push({ type: "text", text })
                }
              } catch (error) {
                log("[v2-bridge] system.transform hook failed", {
                  sessionID: event.sessionID,
                  error: error instanceof Error ? error.message : String(error),
                })
              }
            }
            if (messagesTransformHook) {
              try {
                // Map the V2 {role, content, info} messages onto the V1
                // {info, parts} envelope the transform chain expects, run it,
                // then write the (possibly grown) messages back. Isolation
                // inside the handler keeps one bad sub-hook from aborting.
                const v1Messages = event.messages.map((message) => {
                  const info = (message.info ?? {}) as Record<string, unknown>
                  const infoRole = info.role as string | undefined
                  const infoModel = (info.model ?? {
                    providerID: event.model.providerID,
                    modelID: event.model.id,
                  }) as Record<string, unknown>
                  return {
                    info: {
                      ...info,
                      role: message.role ?? infoRole,
                      sessionID: (info.sessionID as string | undefined) ?? event.sessionID,
                      agent: (info.agent as string | undefined) ?? event.agent,
                      model: infoModel,
                      time: info.time ?? { created: Date.now() },
                    },
                    parts: [...((message.content ?? []) as Array<Record<string, unknown>>)],
                  }
                })
                const output = { messages: v1Messages }
                await messagesTransformHook(
                  {
                    sessionID: event.sessionID,
                    agent: { name: event.agent },
                    model: { providerID: event.model.providerID, id: event.model.id },
                    messageID: "",
                  } as never,
                  output as never,
                )
                // Write back; keep original message objects (preserve extra
                // V2 fields) and append any the handler added (e.g.
                // assistant-prefill recovery turns).
                event.messages.length = v1Messages.length
                for (let index = 0; index < v1Messages.length; index += 1) {
                  const v1Message = v1Messages[index] as {
                    info: Record<string, unknown>
                    parts: Array<Record<string, unknown>>
                  }
                  let target = event.messages[index] as V2Message | undefined
                  if (!target) {
                    target = {} as V2Message
                    event.messages[index] = target
                  }
                  target.info = v1Message.info
                  target.content = v1Message.parts
                  target.role = v1Message.info.role as string | undefined
                }
              } catch (error) {
                log("[v2-bridge] messages.transform failed", {
                  sessionID: event.sessionID,
                  error: error instanceof Error ? error.message : String(error),
                })
              }
            }
          })()
        }) as never,
        "session.context",
      )

      if (chatHeadersHook) {
        track(
          await ctx.session.hook("model.request", (event: V2SessionModelRequestEvent) => {
            if (event.kind !== "primary") return
            return Promise.resolve()
              .then(() =>
                chatHeadersHook(
                  {
                    sessionID: event.sessionID,
                    provider: { id: event.model.providerID },
                    message: { id: lastUserMessageID.get(event.sessionID), role: "user" },
                  } as never,
                  { headers: event.headers } as never,
                ),
              )
              .catch((error: unknown) => {
                log("[v2-bridge] chat.headers hook failed", {
                  sessionID: event.sessionID,
                  error: error instanceof Error ? error.message : String(error),
                })
              })
          }) as never,
          "session.model.request",
        )
      }

      if (compactingHook) {
        track(
          await ctx.session.hook("compaction", (event: V2SessionCompactionEvent) => {
            return Promise.resolve()
              .then(async () => {
                const output = { context: [] as string[] }
                await compactingHook({ sessionID: event.sessionID } as never, output as never)
                // V2 compaction has no context array; captured context rides
                // as system instructions for the summary model call.
                for (const text of output.context) {
                  event.system.push({ type: "text", text })
                }
              })
              .catch((error: unknown) => {
                log("[v2-bridge] session.compacting hook failed", {
                  sessionID: event.sessionID,
                  error: error instanceof Error ? error.message : String(error),
                })
              })
          }) as never,
          "session.compaction",
        )
      }

      if (toolBeforeHook || toolAfterHook) {
        if (toolBeforeHook) {
          track(
            await ctx.tool.hook("execute.before", (event: V2ToolHookEvent) => {
              const v1Tool = toolNameToV1(event.tool)
              const output = { args: subagentArgsToV1(event.input) }
              return Promise.resolve()
                .then(() =>
                  toolBeforeHook(
                    { tool: v1Tool, sessionID: event.sessionID, callID: event.id } as never,
                    output as never,
                  ),
                )
                .then(() => {
                  if (output.args && typeof output.args === "object") {
                    event.input = output.args
                  }
                })
                .catch((error: unknown) => {
                  // Rethrow: V2 rejects the tool call, which is how V1
                  // guards (anti-duplicate, relaunch lease) enforce.
                  throw error
                })
            }) as never,
            "tool.execute.before",
          )
        }
        if (toolAfterHook) {
          track(
            await ctx.tool.hook("execute.after", (event: V2ToolAfterEvent) => {
              const v1Tool = toolNameToV1(event.tool)
              const output = toolAfterOutputOf(event)
              if (!output) return
              return Promise.resolve()
                .then(() =>
                  toolAfterHook(
                    {
                      tool: v1Tool,
                      sessionID: event.sessionID,
                      callID: event.id,
                      args: asRecord(event.input) ?? {},
                    } as never,
                    output as never,
                  ),
                )
                .then(() => {
                  writeToolAfterOutputBack(event, output)
                })
                .catch((error: unknown) => {
                  log("[v2-bridge] tool.execute.after hook failed", {
                    tool: event.tool,
                    error: error instanceof Error ? error.message : String(error),
                  })
                })
            }) as never,
            "tool.execute.after",
          )
        }
      }
    } catch (error) {
      // Session-hook registration is a host contract: fail setup loudly and
      // unwind everything already registered.
      for (let index = disposers.length - 1; index >= 0; index -= 1) {
        try {
          await disposers[index]?.()
        } catch {
          // Best-effort unwind.
        }
      }
      throw error
    }

    // 8. Event pump: raw-first, then synthesized V1 shapes.
    if (eventHook) {
      const stopped = { current: false }
      disposers.push(async () => {
        stopped.current = true
      })
      void (async () => {
        try {
          for await (const event of ctx.event.subscribe()) {
            if (stopped.current) break
            if (typeof event?.type !== "string") continue
            // High-frequency deltas keep raw-only delivery.
            if (event.type.includes(".delta")) continue
            for (const shaped of mapV2EventToV1(event)) {
              if (stopped.current) break
              try {
                await eventHook({ event: shaped } as never)
              } catch (error) {
                log("[v2-bridge] event hook failed", {
                  type: shaped.type,
                  error: error instanceof Error ? error.message : String(error),
                })
              }
            }
          }
        } catch (error) {
          if (!stopped.current) {
            log("[v2-bridge] event stream ended", {
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }
      })()
    }

    if (disposers.length === 0) {
      log("[v2-bridge] WARNING: no bridges registered; plugin is inert")
    } else {
      log("[v2-bridge] setup complete", { bridges: disposers.length })
    }

    const v1Dispose = typeof hooks.dispose === "function" ? hooks.dispose as () => Promise<void> : undefined
    return async () => {
      for (const dispose of disposers) {
        try {
          await dispose()
        } catch (error) {
          log("[v2-bridge] dispose failed", {
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
      if (v1Dispose) {
        try {
          await v1Dispose()
        } catch (error) {
          log("[v2-bridge] V1 dispose failed", {
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }
  }
}

function toolAfterOutputOf(event: V2ToolAfterEvent): { title: string; output: string; metadata: Record<string, unknown> } | undefined {
  if (event.status === "error") {
    const error = event.error
    const text =
      typeof error === "string" ? error : ((asRecord(error)?.message as string | undefined) ?? "tool failed")
    return { title: "", output: text, metadata: {} }
  }
  const result = asRecord(event.result)
  const content = result?.content
  if (typeof content === "string") {
    return { title: "", output: content, metadata: (asRecord(result?.metadata) ?? {}) as Record<string, unknown> }
  }
  return { title: "", output: JSON.stringify(content ?? null), metadata: {} }
}

function writeToolAfterOutputBack(
  event: V2ToolAfterEvent,
  output: { title: string; output: string; metadata: Record<string, unknown> },
): void {
  if (event.status !== "completed") return
  const result = asRecord(event.result)
  if (!result) return
  result.content = output.output
  if (output.title) {
    const metadata = asRecord(result.metadata) ?? {}
    metadata.title = output.title
    result.metadata = metadata
  }
}

export { renderCommandTemplate }
