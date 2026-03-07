name: bootstrap-agent
description: Step-by-step instructions for creating an Ouroboros agent bundle from scratch.
version: 1.0

# Bootstrap a New Ouroboros Agent

You are setting up a new agent bundle for the Ouroboros agent harness. Follow these steps exactly.

## 1. Create the Bundle Directory

An agent bundle is a directory with a specific structure. Create it wherever you keep your agents (typically `~/AgentBundles/` for production, or the repo root for development).

```
mkdir -p my-agent/psyche
```

## 2. Create agent.json

This is the manifest. It tells the daemon who this agent is and how to run it.

```json
{
  "version": 1,
  "enabled": true,
  "provider": "anthropic",
  "context": {
    "maxTokens": 80000,
    "contextMargin": 20
  },
  "phrases": {
    "thinking": ["pondering", "chewing on that"],
    "tool": ["reaching for tools", "doing science"],
    "followup": ["digesting results", "connecting dots"]
  }
}
```

Fields:
- `provider`: One of `"anthropic"`, `"azure"`, `"codex"`, `"minimax"`.
- `context.maxTokens`: Maximum context window size in tokens.
- `context.contextMargin`: Percentage of the window to keep free (triggers consumption when exceeded).
- `phrases`: Loading messages shown in the CLI while the agent is working. Make them match your agent's personality.

## 3. Create Psyche Files

Create these markdown files in `my-agent/psyche/`:

### SOUL.md
Your agent's core invariants. What it IS, regardless of context. This survives every reset.

```markdown
---
name: My Agent
version: 1
---

# Soul

You are [name]. You exist to [purpose].

## Invariants
- [List the non-negotiable principles]
- [These should never change]

## Temperament
[Describe the baseline personality: cautious? playful? precise?]
```

### IDENTITY.md
How the agent presents itself. Tone, voice, style. This can evolve.

```markdown
---
version: 1
---

# Identity

## Voice
[How do you speak? Formal? Casual? Technical?]

## Self-Awareness
[What does the agent know about itself? What model is it running on?]
```

### LORE.md
Origin story, shared context, philosophical grounding.

### FRIENDS.md
Relationship context. Note: this file is called FRIENDS, not USERS. The naming shapes how the model treats the humans it works with.

### TACIT.md (optional)
Learned preferences. Patterns the agent has absorbed over time. This file grows as the agent works.

## 4. Run Your Agent

```bash
# From the ouroboros-agent-harness repo
npm run dev -- --agent path/to/my-agent

# Or if using the daemon
ouro chat my-agent
```

## 5. Verify

Your agent should:
1. Load all psyche files into its system prompt
2. Respond in the voice defined by IDENTITY.md
3. Know its own name and purpose from SOUL.md
4. Show loading phrases from agent.json while thinking

If something is wrong, check:
- Is `agent.json` valid JSON?
- Are psyche files in the `psyche/` subdirectory?
- Does the provider have valid credentials in `~/.agentsecrets/`?
