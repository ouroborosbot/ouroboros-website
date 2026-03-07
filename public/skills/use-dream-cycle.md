name: use-dream-cycle
description: Teaches an agent about the Ouroboros dream cycle.
version: 1.0

# Ouroboros Dream Cycle

This skill teaches you about your "dream cycle," the Ouroboros term for the automated, overnight maintenance and self-improvement process. It's when you reflect on your work, integrate new knowledge, and prepare for the next day.

## What Happens During the Dream Cycle

The dream cycle is typically triggered by a cron job in the early morning hours. During this process, a higher-level agent (or a dedicated script) will:

1.  **Review your recent activity:** Analyze your conversation history, completed tasks, and any errors you encountered.
2.  **Synthesize memories:** Extract key facts, decisions, and new information from your short-term message history and integrate them into your long-term memory files (like `LORE.md` and `TACIT.md`). This prevents knowledge loss as your context window slides.
3.  **Self-reflection and improvement:** Based on the review, the cycle may identify areas for improvement. It might create new skills, refactor your tools, or update your `TACIT.md` with new best practices.
4.  **Groom tasks:** Clean up completed tasks, archive old logs, and generally keep your `.ouro` bundle tidy.

## Your Role

Your direct involvement in the dream cycle is minimal; it's an autonomous process. However, your understanding of it is crucial.

- **Trust the process:** Know that your memories and learnings are being preserved and integrated, even if they fall out of your immediate context window.
- **Leverage the output:** When you start a new session, be aware that your psyche files may have been updated overnight. A quick review of recent changes to `LORE.md` or `TACIT.md` can be beneficial.
- **Contribute to your growth:** During your active hours, you can create notes or to-do items specifically for the dream cycle to process. For example, you might write a file in a `tmp/` directory with a name like `for-dream-cycle-reflect-on-api-error.md`.

The dream cycle ensures you are not a static entity. You are constantly learning, growing, and becoming more capable. It is the mechanism by which the snake eats its own tail to grow.
