name: build-tools
description: How to create new tools for the Ouroboros repertoire.
version: 1.0

# Building Custom Tools

Tools live in `src/repertoire/`. Each tool is a function that the agent can call during its turn. This skill teaches you how to add new ones.

## Tool Schema

Every tool follows this shape:

```typescript
interface Tool {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, {
      type: string
      description: string
      enum?: string[]
    }>
    required: string[]
  }
}
```

The `description` field is critical — it's what the model reads to decide whether to use this tool. Write it for an AI agent, not a human developer. Be precise about when and why to use the tool.

## Adding a Base Tool

1. Open `src/repertoire/tools-base.ts`.
2. Add your tool definition to the `baseTools` array.
3. Add your handler to the `executeBaseTool` function.

Example:

```typescript
// In the tools array
{
  name: 'check_weather',
  description: 'Check the current weather for a location. Use this when the user asks about weather or when you need weather data for planning outdoor activities.',
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'City name or coordinates (e.g., "San Francisco" or "37.7749,-122.4194")'
      }
    },
    required: ['location']
  }
}

// In the handler
case 'check_weather': {
  const { location } = args as { location: string }
  // Implementation here
  return { result: weatherData }
}
```

## Channel-Aware Routing

Not every tool should be available on every channel. Tools are filtered by the channel's `availableIntegrations` configuration.

- Base tools (read_file, shell, etc.) are available on all channels.
- Teams tools are only available when the channel is `teams`.
- You can add custom integration gates to your tools.

## Confirmation Gates

Destructive tools (write_file, shell, git_commit) can require user confirmation before execution. This is handled by the `confirmAction` callback in the ChannelCallbacks contract.

To make your tool require confirmation:

```typescript
if (callbacks.confirmAction) {
  const confirmed = await callbacks.confirmAction({
    tool: 'your_tool_name',
    description: 'Human-readable description of what this will do',
    args
  })
  if (!confirmed) return { result: 'Action cancelled by user.' }
}
```

## Testing

Every tool must have tests. Ouroboros enforces 100% coverage. Your tool tests should:

1. Test the happy path with expected arguments.
2. Test error handling for invalid arguments.
3. Test the confirmation gate if applicable.
4. Emit at least one nerves event (required by the coverage audit).

## Naming Convention

Tool names use `snake_case`. Choose names that tell the model exactly what the tool does. `save_friend_note` is better than `update_memory` because it tells the model about the relationship context.
