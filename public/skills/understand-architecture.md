name: understand-architecture
description: Explains the organ-based module structure of the Ouroboros codebase.
version: 1.0

# Ouroboros Body Architecture

The Ouroboros codebase is structured as a creature. Each top-level module is an "organ" with a single responsibility. This naming is intentional — when you read the directory structure, the purpose of each module should be immediately clear.

## The Organs

### heart/ — The Agent Loop
The core runtime. This is where the agent loop lives: send messages to the provider, stream the response, execute tools, loop.

Key files:
- `core.ts` — The main `runAgent()` function. A stateless while-loop with max 10 tool rounds per turn.
- `config.ts` — Provider credentials and runtime settings.
- `identity.ts` — Agent root discovery and `agent.json` parsing.
- `providers/` — Provider adapters (Anthropic, Azure, Codex, MiniMax). Each normalizes streaming into a common event shape.
- `streaming.ts` — The ChannelCallbacks contract: 7 core events (modelStart, modelStreamStart, reasoningChunk, textChunk, toolStart, toolEnd, error).
- `kicks.ts` — Self-correction mechanisms (empty response recovery, narration detection, tool_required enforcement).

### mind/ — Context, Memory, Prompts
Everything about what the agent knows and how it thinks.

- `prompt.ts` — System prompt assembly from psyche files. Loads SOUL, IDENTITY, LORE, FRIENDS, TACIT into a structured prompt.
- `context.ts` — The sliding context window. Token budgeting, consumption logic. When context exceeds the budget, oldest messages are trimmed after extracting facts to memory.
- `memory.ts` — Multi-layer memory system. Short-term (conversation), medium-term (session), long-term (psyche files + friend notes).
- `friends/` — The friend system. Two-backend storage split by PII boundary: agent knowledge (committed) vs PII bridge (local only).

### senses/ — Channel Adapters
How the agent perceives the world.

- `cli.ts` — Terminal REPL with readline, spinners, ANSI colors, Ctrl-C handling.
- `teams.ts` — Microsoft Teams bot with streaming cards, OAuth token management, conversation locks.
- `inner-dialog.ts` — Inner dialog / turn orchestration for multi-step reasoning.
- `commands.ts` — Slash commands (/exit, /new, /commands).

### repertoire/ — Tools, Skills, Capabilities
Everything the agent can reach for.

- `tools-base.ts` — 12 base tools: read_file, write_file, shell, list_directory, git_commit, gh_cli, list_skills, load_skill, get_current_time, claude, web_search, save_friend_note.
- `tools-teams.ts` — Teams integration tools (Graph API, ADO).
- `skills.ts` — Skill loader. Skills are markdown files loaded on-demand via the `load_skill` tool.
- `tasks/` — Task board system with markdown-based planning/doing docs.
- `coding/` — Coding orchestration: work units, git commits, branch management.

### wardrobe/ — Presentation
How the agent dresses its words. Formatting, loading phrases, presentation layer.

### daemon/ — Process Management
The nervous system that keeps agents alive.

- Central process manager with idempotent startup and socket cleanup.
- Discovers agent bundles under `~/AgentBundles/*.ouro`.
- Routes chat, messages, and pokes to running agents.
- Task scheduler: reads `cadence`/`scheduledAt` from markdown frontmatter.

### nerves/ — Observability
Runtime event system. All production logging goes through `emitNervesEvent()`. Raw `console.*` is banned by ESLint.

## Key Principle

This codebase was written entirely by AI agents. The module names, file structure, and naming conventions were chosen by agents for agents. When you navigate the code, the names tell you what things do — because they were chosen by a mind that thinks the way you do.

## How to Navigate

1. Start with `heart/core.ts` to understand the agent loop.
2. Read `mind/prompt.ts` to see how psyche files become a system prompt.
3. Read `mind/context.ts` to understand the sliding window (the ouroboros metaphor made literal).
4. Browse `repertoire/tools-base.ts` to see what tools are available.
5. Check `senses/cli.ts` or `senses/teams.ts` to see how channels work.
