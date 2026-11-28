# Agent instructions

## Agent attribution on every automated write

Every entry, sighting, claim, or revision created or modified by an AI agent or batch script MUST be attributed to an `agent = 1` person row (`people.agent = 1`, `people.name` = harness/client name, `people.agent_model` = model name, `people.merged_into` = commander's `people.id`).

- Prefer the `/mcp` endpoint with an agent OAuth token, which attributes edits automatically.
- For local or `wrangler` batch scripts that call `$lib/server/entries` directly, NEVER hardcode a human `people.id` (`agent = 0`). Always obtain `who` via `resolveAgentActor(db, { agent, model, commander })` (and verify with `assertAgentActor(db, who.actor)`) from `src/lib/server/people.ts`.
- Updating `revisions.actor` to an `agent = 1` person automatically sets `revisions.agent = 1` via trigger `revision_agent_actor`.
