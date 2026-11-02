---
name: pharos-skill-chain
description: Feed live Chain MCP evidence into a threshold Skill in one request.
---

# SKILL + CHAIN MCP FLOW

Use this Skill with the official Pharos SkillEngine package in vendor/pharos-skill-engine. It follows the upstream generated-JavaScript interaction-script convention. This is a project extension, not an upstream runtime API.

1. Open the Pharos application and configure SKILL + CHAIN MCP FLOW, or prepare input JSON following shared/catalog.js and backend/src/modules/skill-chain.js.
2. From the Pharos repository root, run `npm run cli -- skill-chain path/to/input.json`.
3. Inspect the structured decision, observations, sources and errors. Never describe a failed or missing read as success.
4. Transactions are prepared only. Use the browser workspace for explicit authorization and wallet signing. Never request a private key or bypass receipt verification.
5. Run `npm test` to verify the Skill's isolated validation, core and failure tests. The Cxx acceptance mapping is in docs/acceptance.md.

Shared connections and persistence come from the Pharos application. For an actual Foundry read choose source.transport=skill. The composed flow obtains the inputs via the real Chain MCP connection and evaluates them in the same request.
