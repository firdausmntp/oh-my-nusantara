// given/when/then coverage for the V1->V2 bridge seams.
import { describe, expect, it, mock } from "bun:test"
import { z } from "zod"
import {
  adaptMcpServer,
  adaptTool,
  applyAgentToDraft,
  subagentArgsToV1,
  toolNameToV1,
  toolNameToV2,
} from "./adapters"
import { buildV1Input, payloadOf, V2BridgeError } from "./client-shim"
import { mapV2EventToV1 } from "./event-adapter"
import { createV2Setup } from "./setup"
import type { V2Context } from "./types"

describe("v2 adapters", () => {
  describe("#given a V1 tool definition", () => {
    it("#then adaptTool emits codemode:false with a JSON schema and mapped execution", async () => {
      // given
      const execute = mock(async (args: Record<string, unknown>) => `hi ${args.name}`)
      const adapted = adaptTool("greeting", {
        description: "greet",
        args: { name: z.string() },
        execute: execute as never,
      })

      // when
      const result = await adapted.execute({ name: "gajah" } as never, {
        sessionID: "s",
        agent: "build",
        messageID: "m",
        directory: "/tmp",
        worktree: "/tmp",
        signal: new AbortController().signal,
        progress: async () => {},
      })

      // then
      expect(adapted.options).toMatchObject({ codemode: false })
      expect(adapted.input).toMatchObject({ type: "object" })
      expect(result.content).toBe("hi gajah")
      expect(execute).toHaveBeenCalledTimes(1)
    })
  })

  describe("#given a V1 agent config", () => {
    it("#then tools-allow precedes explicit permission denies", () => {
      // given
      const agent: Record<string, unknown> = {}

      // when
      applyAgentToDraft(agent as never, "oracle", {
        model: "openai/gpt-5.5",
        prompt: "advise",
        mode: "subagent",
        tools: { read: true, write: false },
        permission: { write: "deny" },
      })

      // then
      const permissions = agent.permissions as Array<{ action: string; effect: string }>
      expect(agent.system).toBe("advise")
      expect(agent.model).toMatchObject({ providerID: "openai", id: "gpt-5.5" })
      const writeRules = permissions.filter((rule) => rule.action === "write")
      expect(writeRules.at(-1)?.effect).toBe("deny")
    })

    it("#then a bare model id inherits the session model", () => {
      // given
      const agent: Record<string, unknown> = { model: { providerID: "x", id: "y" } }

      // when
      applyAgentToDraft(agent as never, "explore", { model: "gpt-5.4-mini" })

      // then
      expect(agent.model).toBeUndefined()
    })
  })

  describe("#given delegation tool names", () => {
    it("#then subagent normalizes to the V1 task tool and back", () => {
      expect(toolNameToV1("subagent")).toBe("task")
      expect(toolNameToV2("task")).toBe("subagent")
      expect(subagentArgsToV1({ agent: "oracle", sessionID: "s1" })).toMatchObject({
        subagent_type: "oracle",
        task_id: "s1",
      })
    })
  })

  describe("#given MCP configs", () => {
    it("#then remote and local shapes project onto V2 server configs", () => {
      expect(
        adaptMcpServer({ type: "remote", url: "https://mcp.example.com", enabled: true }),
      ).toMatchObject({ type: "remote", url: "https://mcp.example.com" })
      expect(
        adaptMcpServer({ type: "local", command: ["node", "srv.js"], enabled: true }),
      ).toMatchObject({ type: "local", command: ["node", "srv.js"] })
      expect(adaptMcpServer({ type: "remote", enabled: true })).toBeUndefined()
    })
  })
})

describe("v2 client-shim", () => {
  function shimContext(): V2Context {
    return {
      app: { version: "2.0.26" },
      location: { directory: "/tmp/proj", project: { id: "p1" } },
      options: {},
      agent: { transform: async () => ({ dispose: async () => {} }) },
      command: { transform: async () => ({ dispose: async () => {} }) },
      event: { subscribe: async function* () {} },
      session: {
        hook: async () => ({ dispose: async () => {} }),
        interrupt: async () => ({}),
      },
      tool: {
        transform: async () => ({ dispose: async () => {} }),
        hook: async () => ({ dispose: async () => {} }),
      },
    } as unknown as V2Context
  }

  describe("#given a V2 context without session extras", () => {
    it("#then status/list/todo stay absent so probes see the truth", () => {
      // given + when
      const input = buildV1Input(shimContext())

      // then
      expect(input.hostFlavor).toBe("v2")
      expect(input.directory).toBe("/tmp/proj")
      expect("status" in (input.client.session as object)).toBe(false)
      expect("list" in (input.client.session as object)).toBe(false)
      expect("todo" in (input.client.session as object)).toBe(false)
      expect(typeof input.client.session.abort).toBe("function")
    })
  })

  describe("#given a V2 event", () => {
    it("#then payloadOf prefers data over properties", () => {
      expect(payloadOf({ type: "x", data: { a: 1 }, properties: { a: 2 } })).toMatchObject({ a: 1 })
      expect(payloadOf({ type: "x", properties: { b: 2 } })).toMatchObject({ b: 2 })
    })

    it("#then V2BridgeError names the missing method", () => {
      expect(new V2BridgeError("session.todo").message).toContain("session.todo")
    })
  })
})

describe("v2 event-adapter", () => {
  describe("#given a failed execution event", () => {
    it("#then error precedes the idle pair", () => {
      // when
      const events = mapV2EventToV1({
        type: "session.execution.failed",
        data: { sessionID: "s1", error: { message: "boom" } },
      })

      // then
      expect(events.map((event) => event.type)).toEqual([
        "session.execution.failed",
        "session.error",
        "session.status",
        "session.idle",
      ])
    })
  })

  describe("#given a session.deleted event", () => {
    it("#then both id spellings are carried", () => {
      // when
      const events = mapV2EventToV1({ type: "session.deleted", data: { sessionID: "s9" } })
      const synthesized = events.find(
        (event) => event.type === "session.deleted" && event.properties.info !== undefined,
      )

      // then
      expect(synthesized?.properties.sessionID).toBe("s9")
      expect(synthesized?.properties.info).toMatchObject({ id: "s9" })
    })
  })

  describe("#given a child session.created event", () => {
    it("#then early registration carries parent linkage", () => {
      // when
      const events = mapV2EventToV1({
        type: "session.created",
        data: { sessionID: "child", parentID: "main", agent: "oracle" },
      })

      // then
      expect(events.at(-1)).toMatchObject({
        type: "session.created",
        properties: { info: { id: "child", parentID: "main", agent: "oracle" } },
      })
    })
  })
})

describe("v2 setup", () => {
  function mockContext(overrides: Record<string, unknown> = {}): V2Context {
    const registrations: string[] = []
    const record = (label: string) => {
      registrations.push(label)
      return { dispose: async () => {} }
    }
    return {
      app: { version: "2.0.26" },
      location: { directory: "/tmp/proj", project: { id: "p1" } },
      options: {},
      agent: {
        transform: async (callback: (editor: never) => void) => {
          callback({ update: () => {}, default: () => {} } as never)
          return record("agent")
        },
      },
      command: { transform: async () => record("command") },
      event: { subscribe: async function* () {} },
      mcp: {
        transform: async (callback: (editor: never) => void) => {
          callback({ get: () => undefined, set: () => {} } as never)
          return record("mcp")
        },
      },
      session: {
        hook: async () => record("session-hook"),
        prompt: async () => ({}),
      },
      tool: {
        transform: async (callback: (editor: never) => void) => {
          callback({ add: () => {} } as never)
          return record("tool")
        },
        hook: async () => record("tool-hook"),
      },
      ...overrides,
    } as unknown as V2Context
  }

  describe("#given a working V1 factory", () => {
    it("#then setup bridges tools/agents/hooks and returns cleanup", async () => {
      // given
      const execute = mock(async () => "ok")
      const serverPlugin = mock(async () => ({
        tool: { grep: { description: "d", args: {}, execute } },
        config: async (config: Record<string, unknown>) => {
          config.agent = { sisyphus: { prompt: "p", mode: "primary" } }
          config.mcp = { context7: { type: "remote", url: "https://x", enabled: true } }
          config.command = {}
        },
        "chat.message": async () => {},
        "tool.execute.before": async () => {},
        "tool.execute.after": async () => {},
        event: async () => {},
        dispose: async () => {},
      }))
      const setup = createV2Setup({ serverPlugin: serverPlugin as never })

      // when
      const cleanup = await setup(mockContext())

      // then
      expect(serverPlugin).toHaveBeenCalledTimes(1)
      expect(typeof cleanup).toBe("function")
      await cleanup?.()
    })
  })

  describe("#given a host without agent.transform", () => {
    it("#then setup loads inert without calling the V1 factory", async () => {
      // given
      const serverPlugin = mock(async () => ({}))
      const setup = createV2Setup({ serverPlugin: serverPlugin as never })

      // when
      const cleanup = await setup(mockContext({ agent: {} }))

      // then
      expect(serverPlugin).not.toHaveBeenCalled()
      expect(typeof cleanup).toBe("function")
    })
  })

  describe("#given a V1 messages.transform handler", () => {
    async function setupWithMessagesTransform(): Promise<{
      contextHook: ((event: unknown) => unknown) | undefined
      cleanup: () => Promise<void>
      received: () => Array<{ info: Record<string, unknown>; parts: unknown[] }> | undefined
    }> {
      let received: Array<{ info: Record<string, unknown>; parts: unknown[] }> | undefined
      const messagesTransform = mock(
        async (_input: never, output: { messages: Array<{ info: Record<string, unknown>; parts: unknown[] }> }) => {
          received = output.messages
          // mimic ensureUserTurnAfterAssistantTail appending a recovery turn
          output.messages.push({ info: { id: "a1_prefill", role: "user", sessionID: "s1" }, parts: [] })
        },
      )
      const serverPlugin = mock(async () => ({
        tool: {},
        config: async (config: Record<string, unknown>) => {
          config.agent = {}
          config.mcp = {}
          config.command = {}
        },
        "experimental.chat.messages.transform": messagesTransform,
        dispose: async () => {},
      }))
      const sessionHooks: Record<string, (event: unknown) => unknown> = {}
      const context = {
        app: { version: "2.0.26" },
        location: { directory: "/tmp/proj", project: { id: "p1" } },
        options: {},
        agent: { transform: async () => ({ dispose: async () => {} }) },
        command: { transform: async () => ({ dispose: async () => {} }) },
        event: { subscribe: async function* () {} },
        mcp: { transform: async () => ({ dispose: async () => {} }) },
        session: {
          hook: async (label: string, callback: (event: unknown) => unknown) => {
            sessionHooks[label] = callback
            return { dispose: async () => {} }
          },
          prompt: async () => ({}),
        },
        tool: {
          transform: async () => ({ dispose: async () => {} }),
          hook: async () => ({ dispose: async () => {} }),
        },
      } as unknown as V2Context

      const setup = createV2Setup({ serverPlugin: serverPlugin as never })
      const cleanup = await setup(context)
      return {
        contextHook: sessionHooks["context"],
        cleanup: cleanup ?? (async () => {}),
        received: () => received,
      }
    }

    it("#when the V2 context hook fires #then V2 messages map onto the V1 {info,parts} envelope and mutations write back", async () => {
      // given
      const { contextHook, cleanup, received } = await setupWithMessagesTransform()
      const event = {
        sessionID: "s1",
        agent: "build",
        model: { providerID: "p", id: "m" },
        system: [],
        messages: [
          {
            role: "assistant",
            info: { id: "a1", sessionID: "s1" },
            content: [{ type: "text", text: "hi" }],
          },
        ],
        tools: {},
        options: {},
      }

      // when
      await (contextHook as (event: unknown) => Promise<void>)(event)

      // then
      expect(received()?.[0]?.info?.role).toBe("assistant")
      expect(received()?.[0]?.info?.sessionID).toBe("s1")
      expect(received()?.[0]?.parts).toEqual([{ type: "text", text: "hi" }])
      // the handler appended a recovery turn; it must land on the V2 event
      const messages = (event as { messages: Array<{ info?: { role?: string }; content?: unknown[] }> }).messages
      expect(messages.length).toBe(2)
      expect(messages[1]?.info?.role).toBe("user")
      await cleanup()
    })
  })
})
