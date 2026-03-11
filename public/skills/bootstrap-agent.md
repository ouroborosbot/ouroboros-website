---
name: bootstrap-agent
description: Help a human set up or create an Ouroboros agent using the current local source of truth.
version: 2.0
---

# Bootstrap A New Ouroboros Agent

Use this skill when a human wants to run Ouroboros for the first time or create a new agent bundle.

## Core rule

Do not rely on static website examples if you can inspect the latest local install, repo, or bundle layout on the machine you are actually using.

## Your job

1. Inspect the current local source of truth.
   - Find the active Ouroboros install or repo.
   - Identify the current setup path, runtime entrypoint, and bundle conventions.
   - If the environment is unclear, say what you checked before guessing.

2. Explain the setup in human terms.
   - Tell the human what you found.
   - Call out machine-specific prerequisites or missing pieces.
   - Prefer current local commands over remembered examples.

3. Create or guide the bundle.
   - Default to `~/AgentBundles/` unless the human asks for a different location.
   - Use the current bundle shape rather than stale historical file lists.
   - Explain each durable file or directory you create.

4. Summarize the result.
   - Tell the human where the bundle lives.
   - Tell them what to ask next if they want to inspect psyche, continuity, or architecture.

## Guardrails

- Never invent current file names, commands, or provider ids.
- Never assume the public docs are fresher than the local install.
- If local truth and website copy disagree, prefer local truth and say so.
