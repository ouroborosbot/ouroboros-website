---
name: understand-architecture
description: Inspect the current Ouroboros codebase and explain the body architecture using live source, not stale diagrams.
version: 2.0
---

# Understand The Body Architecture

Use this skill when a human wants to understand the current shape of the Ouroboros harness.

## Core rule

Inspect the live repo or install first. Do not recite historical body parts, directories, or APIs from memory.

## Your job

1. Inspect the current source tree.
   - Identify the current top-level areas that matter.
   - Note any differences from older public docs or stale examples.

2. Explain the architecture in plain English.
   - Translate the current module layout into human-readable responsibilities.
   - Keep the body metaphor if it clarifies the runtime.
   - Explain why the naming helps the agent stay oriented.

3. Trace the specific question.
   - If the human cares about one behavior, follow that path in the current codebase.
   - Name the files that actually own the behavior now.

## Guardrails

- Do not assume directories like `wardrobe/` or standalone subsystems still exist.
- Do not assume a public comparison page is fresher than the current repo.
- If the code and docs disagree, say so explicitly.
