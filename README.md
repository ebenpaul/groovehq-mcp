# Groove MCP Server (read-only, AP research)

A Model Context Protocol (MCP) server for researching accounts-payable chatter
in Groove HQ — look up a vendor's conversations, drill into messages, and get
per-channel context.

## How it works — data sources (important)

This fork does **not** read conversations over GraphQL. Live introspection with
a real admin token proved the **v2 GraphQL conversation surface is not
accessible to our token**: there are no `conversations` / `conversation` /
`messages` root query fields, and the `Conversation` / `Message` /
`ConversationFilter` types do not exist for this credential. Groove **REST v1**
(`GET /v1/tickets`) does return real data, so it is the only reachable path to
conversation data.

| Domain | API used | Notes |
| --- | --- | --- |
| Conversations, messages | **Groove REST v1** (`/v1/tickets…`) | Server-side filtered + fully paged. |
| Contacts | Groove GraphQL v2 (`contacts`) | Reachable for this token. |
| Agents / channels / KB | Groove GraphQL v2 | May be unavailable depending on token scope; AP-only tokens may not see these. |

The GraphQL conversation/message queries that shipped upstream were **dead
code** and have been removed (the GraphQL client is retained only for the
`contacts` path). See `docs/audit/assumption-inventory.md` for the full trail.

Authentication uses an `Authorization: Bearer <token>` header — the token is
never placed in a URL/query string.

## Installation

Get your `GROOVE_API_TOKEN` from
`https://YOUR_SUBDOMAIN.groovehq.com/settings/developer/api`.

Then add the server (local build):

```bash
npm install && npm run build
claude mcp add groove-mcp node ~/path/to/groovehq-mcp/dist/index.js -s user \
  --env GROOVE_API_TOKEN=your_groove_api_token_here
```

`GROOVE_API_URL` (GraphQL endpoint, used only for the contacts path) defaults to
`https://api.groovehq.com/v2/graphql`. The REST v1 base is
`https://api.groovehq.com/v1`.

## Available Tools

### Conversations (REST v1)

- **listConversations** — vendor/account conversation lookup, filtered
  **server-side** and **paged to completion**. Returns:

  ```jsonc
  {
    "pagination": {
      "total_count": 102,   // Groove's true total for this query
      "returned": 102,      // how many are in this response
      "complete": true,     // returned === total_count (nothing hidden)
      "truncated": false,   // true only if capped by maxResults
      "pages_fetched": 3,
      "per_page": 50,
      "note": "Complete: all 102 matching conversation(s) returned."
    },
    "filtersApplied": { "customer": "artubing@tejastubular.com" },
    "conversations": [ /* … */ ]
  }
  ```

  **Always check `pagination.complete` / `total_count`.** If `complete` is
  `false`, the result is a partial set and must not be treated as exhaustive.

  Parameters (each pushed to Groove v1 — no client-side filtering):

  - `customer` — vendor email **or** Groove contact id (Groove v1 `customer`). The
    correct way to get *all* of a vendor's conversations.
  - `contactId` — back-compat alias for `customer`.
  - `state` — `unread | opened | closed | snoozed` (v1 `state`).
  - `assignee` — assignee email/id (v1 `assignee`).
  - `folder` — folder id (v1 `folder`).
  - `maxResults` — explicit cap on total results. **Omit to return every match.**
  - `channelId`, `tagIds` — **not** supported by Groove v1 `/tickets`; if
    supplied they are **not** applied and are reported under
    `unsupportedFilters` (never silently approximated).

- **getConversation** — one conversation by **bare** ticket id (`id`, required).
- **listMessages** — messages for a conversation by **bare** ticket id
  (`conversationId`, required; optional `limit`).

> Write operations (`createConversation`, `updateConversation`,
> `closeConversation`, `sendMessage`, `createNote`, `createContact`,
> `updateContact`) are still registered from upstream but are out of scope for
> this read-only server and should be stripped in a follow-up; several are
> non-functional against this token.

### Contacts (GraphQL v2)

- **listContacts** — `search`, `limit`, `after`.
- **getContact** — `id` (required).

### Agents / Knowledge Base (GraphQL v2, scope-dependent)

- **listAgents**, **getAgent**, **getAvailableAgents**, **searchKbArticles** —
  may return authorization errors on AP-scoped tokens (surface not guaranteed).

## Known constraint — invoice-number search is not yet built

The core AP use case is finding a conversation by invoice number. **Groove v1
`/tickets` has no keyword/full-text search parameter.** Invoice numbers live in
ticket *titles* (e.g. `"Invoice 336205 from Tejas Tubular"`), so search must be
done differently. See `docs/audit/search-constraint.md` for the options
(scope-by-`customer`-then-match-titles vs. a dedicated Groove search endpoint) —
**by design this is documented, not implemented**, pending a design decision.

## Development

```bash
npm run build        # tsc
npm run typecheck    # tsc --noEmit
node scripts/smoke-pagination.test.mjs   # e2e pagination smoke test (mocked network)
```

## Project Structure

```
├── src/
│   ├── index.ts           # MCP server entry point + tool wiring
│   ├── rest-client.ts     # Groove REST v1 client (conversations/tickets) — Bearer auth
│   ├── groove-client.ts   # GraphQL v2 client wrapper (contacts path)
│   ├── tools/
│   │   ├── conversations.ts  # REST v1: server-side filter + full pagination
│   │   ├── messages.ts       # message tools
│   │   ├── contacts.ts       # GraphQL v2
│   │   ├── channels.ts
│   │   └── agents.ts
│   ├── resources/kb-articles.ts
│   ├── types/groove.ts
│   └── utils/graphql-queries.ts  # GraphQL (contacts + legacy write mutations)
├── scripts/
│   ├── introspection-gate.sh       # Step 0 schema gate (needs a scoped token)
│   └── smoke-pagination.test.mjs   # e2e pagination proof
├── docs/audit/            # assumption inventory, decisions, constraints
└── dist/                  # compiled output
```

## License

MIT (fork of `christiangenco/groove-mcp`).
