---
name: use-sliding-context
description: Inspect the current continuity and context behavior before explaining how Ouroboros keeps the thread.
version: 2.0
---

# Understand Continuity And Context

Use this skill when the human wants to know how Ouroboros keeps continuity across sessions, long conversations, or interruptions.

## Core rule

Inspect the live source or current runtime state first. Do not describe continuity from stale architectural lore.

## Your job

1. Inspect the current implementation.
   - Find the code or state surfaces that manage context, continuity, and durable notes.
   - Identify where quick social notes, durable memory, or continuity mechanisms appear to live now.

2. Explain the current behavior.
   - Tell the human how the system appears to keep the thread.
   - Distinguish clearly between recall, continuity, and lightweight note-taking when those are separate concerns.

3. Give practical advice.
   - Tell the human where important context should be written down in the current setup.
   - If a behavior seems aspirational rather than live, say so.

## Guardrails

- Do not present Dream Cycle language as a current factual capability unless the current source explicitly supports it.
- Do not assume one memory surface owns every kind of information.
- If you are uncertain, summarize what you checked and what remains unclear.
