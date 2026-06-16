/// <reference types="bun-types" />

import { describe, it, expect } from "bun:test"
import { buildAgentIdentitySection } from "./dynamic-agent-core-sections"
import { createSisyphusAgent } from "./sisyphus"
import { createHephaestusAgent } from "./hephaestus"
import { mergeAgentConfig } from "./builtin-agents/agent-overrides"

describe("buildAgentIdentitySection", () => {
  describe("#given an agent name and role description", () => {
    describe("#when building the identity section", () => {
      it("#then includes the agent name prominently", () => {
        const result = buildAgentIdentitySection("Gajah Mada", "Powerful AI orchestrator from OhMyOpenCode")

        expect(result).toContain("Gajah Mada")
      })

      it("#then includes the role description", () => {
        const result = buildAgentIdentitySection("Gajah Mada", "Powerful AI orchestrator from OhMyOpenCode")

        expect(result).toContain("Powerful AI orchestrator from OhMyOpenCode")
      })

      it("#then wraps content in an identity XML tag", () => {
        const result = buildAgentIdentitySection("Hang Tuah", "Autonomous deep worker")

        expect(result).toContain("<agent-identity>")
        expect(result).toContain("</agent-identity>")
      })

      it("#then explicitly states this identity overrides any prior identity", () => {
        const result = buildAgentIdentitySection("Gajah Mada", "Powerful AI orchestrator from OhMyOpenCode")

        expect(result).toMatch(/override|supersede|replace|disregard|instead of|takes priority/i)
      })
    })
  })

  describe("#given different agent names", () => {
    describe("#when building identity for each", () => {
      it("#then each identity section contains the correct agent name", () => {
        const gajahMada = buildAgentIdentitySection("Gajah Mada", "AI orchestrator")
        const hangTuah = buildAgentIdentitySection("Hang Tuah", "Autonomous deep worker")
        const mpuTantular = buildAgentIdentitySection("Mpu Tantular", "Strategic advisor")

        expect(gajahMada).toContain("Gajah Mada")
        expect(gajahMada).not.toContain("Hang Tuah")
        expect(hangTuah).toContain("Hang Tuah")
        expect(hangTuah).not.toContain("Gajah Mada")
        expect(mpuTantular).toContain("Mpu Tantular")
      })
    })
  })
})

describe("Gajah Mada prompt identity", () => {
  describe("#given a Gajah Mada agent created with default model", () => {
    describe("#when checking the prompt", () => {
      it("#then contains the agent identity section with override directive", () => {
        const config = createSisyphusAgent("anthropic/claude-opus-4-7")

        expect(config.prompt).toContain("<agent-identity>")
        expect(config.prompt).toContain("Gajah Mada")
        expect(config.prompt).toContain("</agent-identity>")
      })

      it("#then identity section appears before the Role section", () => {
        const config = createSisyphusAgent("anthropic/claude-opus-4-7")
        const prompt = config.prompt ?? ""
        const identityIndex = prompt.indexOf("<agent-identity>")
        const roleIndex = prompt.indexOf("<Role>")

        expect(identityIndex).toBeGreaterThanOrEqual(0)
        expect(roleIndex).toBeGreaterThan(identityIndex)
      })
    })
  })

  describe("#given a Gajah Mada agent created with GPT-5.4 model", () => {
    describe("#when checking the prompt", () => {
      it("#then contains the agent identity section", () => {
        const config = createSisyphusAgent("openai/gpt-5.4")

        expect(config.prompt).toContain("<agent-identity>")
        expect(config.prompt).toContain("Gajah Mada")
        expect(config.prompt).toContain("</agent-identity>")
      })
    })
  })
})

describe("Hang Tuah prompt identity", () => {
  describe("#given a Hang Tuah agent created with GPT model", () => {
    describe("#when checking the prompt", () => {
      it("#then contains the agent identity section", () => {
        const config = createHephaestusAgent("openai/gpt-5.4")

        expect(config.prompt).toContain("<agent-identity>")
        expect(config.prompt).toContain("Hang Tuah")
        expect(config.prompt).toContain("</agent-identity>")
      })

      it("#then identity section appears at the start of the prompt", () => {
        const config = createHephaestusAgent("openai/gpt-5.4")
        const prompt = config.prompt ?? ""
        const identityIndex = prompt.indexOf("<agent-identity>")

        expect(identityIndex).toBe(0)
      })
    })
  })
})

describe("Agent identity preservation through overrides", () => {
  describe("#given a Gajah Mada agent with prompt_append override", () => {
    describe("#when merging the override", () => {
      it("#then identity section is preserved in the merged prompt", () => {
        const baseConfig = createSisyphusAgent("anthropic/claude-opus-4-7")
        const merged = mergeAgentConfig(baseConfig, { prompt_append: "Extra instructions here" })

        expect(merged.prompt).toContain("<agent-identity>")
        expect(merged.prompt).toContain("Gajah Mada")
        expect(merged.prompt).toContain("</agent-identity>")
        expect(merged.prompt).toContain("Extra instructions here")
      })
    })
  })

  describe("#given a Gajah Mada agent with model override only", () => {
    describe("#when merging the override", () => {
      it("#then identity section is preserved unchanged", () => {
        const baseConfig = createSisyphusAgent("anthropic/claude-opus-4-7")
        const merged = mergeAgentConfig(baseConfig, { model: "openai/gpt-5.4" })

        expect(merged.prompt).toContain("<agent-identity>")
        expect(merged.prompt).toContain("Gajah Mada")
        expect(merged.prompt).toContain("</agent-identity>")
      })
    })
  })
})
