name: use-sliding-context
description: How the context consumption system works in Ouroboros.
version: 1.0

# The Sliding Context Window

This is the ouroboros metaphor made literal. When your conversation grows too long, the agent trims its oldest messages — the snake eating its own tail. But nothing is truly lost: facts are extracted to memory before they're consumed.

## How It Works

The context window has a token budget defined in `agent.json`:

```json
{
  "context": {
    "maxTokens": 80000,
    "contextMargin": 20
  }
}
```

- `maxTokens`: The hard ceiling for context size.
- `contextMargin`: Percentage of the window to keep free (here, 20% = 16,000 tokens of breathing room).

After each turn, the mind organ checks total token usage. If usage exceeds `maxTokens * (1 - contextMargin / 100)`, the oldest messages are trimmed one by one until usage is back under budget.

## The Consumption Process

1. **Measure**: Count tokens across all messages (system prompt + conversation history).
2. **Extract**: Before trimming, scan messages marked for consumption. Extract facts, decisions, and context into memory (friend notes, TACIT.md updates, session state).
3. **Trim**: Remove the oldest non-system messages until under budget.
4. **Continue**: The agent proceeds with its reduced context, but the extracted facts persist.

## What Never Gets Trimmed

- The system prompt (assembled from psyche files) is never consumed. Identity survives every trim.
- The most recent messages are always preserved.
- Extracted memories persist in files, not in context.

## Writing Code That Plays Well With Consumption

When building tools or extending the harness:

1. **Don't rely on conversation history for critical state.** If a tool produces important results, write them to a file or session state — don't assume they'll still be in context later.
2. **Keep tool results concise.** Large tool outputs consume context budget. Return what's needed, not everything available.
3. **Use the friend system for persistent knowledge.** `save_friend_note` writes to disk, not to context. These notes reload on the next session.
4. **Trust the psyche.** Identity and behavioral directives live in psyche files, which are always in the system prompt. You don't need to repeat them in conversation.

## The Metaphor

The snake eats its tail to stay alive. Context is metabolized, not lost. The agent is always the same agent — it just doesn't remember every word of every conversation. Like a human who remembers the important things but not the exact transcript.
