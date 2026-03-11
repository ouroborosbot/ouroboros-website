---
name: build-tools
description: Inspect the current tool APIs and explain how to extend the repertoire without relying on stale examples.
version: 2.0
---

# Build Custom Tools

Use this skill when the human wants to add, modify, or understand tools in the current Ouroboros harness.

## Core rule

Inspect the current tool definitions, registration flow, and confirmation behavior in the live source before you propose any implementation.

## Your job

1. Inspect the current tool surface.
   - Find the current tool definitions and registration path.
   - Identify how confirmation or guardrails work right now.

2. Explain the extension path.
   - Tell the human which files need to change for the current version.
   - Explain how the tool becomes visible to the agent.

3. Implement or outline with current truth.
   - If asked to make the change, follow the current APIs instead of remembered patterns.
   - If older docs or examples disagree with the source, say so and follow the source.

## Guardrails

- Never assume removed tools or old wrapper APIs still exist.
- Never copy historical examples without verifying the current interfaces.
- Prefer the live code over public docs when they differ.
