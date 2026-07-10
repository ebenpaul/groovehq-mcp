# GraphQL Schema Assumption Inventory (pre-gate)

Baseline: unmodified fork of `christiangenco/groove-mcp`.
Purpose: enumerate every place the code assumes a shape for the Groove v2
GraphQL schema, so the Step 0 introspection result can be checked 1:1 against
real assumptions **before** any rewrite. Nothing here is validated yet — the
Step 0 gate is BLOCKED (no `GROOVE_API_TOKEN`, `api.groovehq.com` egress
denied 403 by network policy). Schema is **not** inferred from source; this
only records what the code *expects*.

## HEADLINE — this is a REST v1 → GraphQL migration, not a GraphQL bug-fix

The conversation-read core does **not** run on GraphQL today. `index.ts`
wires `listConversations`, `getConversation`, and `listMessages` to
`ConversationTools`, which calls the **REST v1** `GrooveRestClient`
(`https://api.groovehq.com/v1`, `access_token` query param) and then runs
`convertTicketToConversation` to fake GraphQL-shaped objects. The entire
`queries.*` GraphQL layer is **dead code**:

- `queries.listConversations` / `queries.getConversation` — pre-written, never called.
- `MessageTools.listMessages` (GraphQL, `messages.ts:25`) — never called; the
  wired `listMessages` is the **REST** one on `ConversationTools`
  (`conversations.ts:160`).

**Consequence for this engagement:** the path currently serving results is
**Groove REST v1, which is no longer in active development** (deprecated). So
the deliverable is a **migration plan off deprecated REST v1 onto GraphQL**,
not a list of GraphQL query bugs. Every assumption below marked *(unused /
latent)* has **never executed against the live API** — it is *latent*, not
*live*. That reframes how the gate result is read:

> **A schema-clean PASS does not mean the tool works.** PASS only confirms the
> GraphQL schema matches the assumptions in this inventory. The code is still
> unwired — it keeps calling deprecated REST v1 until the migration
> (`rest-client.ts` deletion + `queries.*` wiring + ID unification) is done.
> PASS is the *green light to migrate*, not evidence of a working GraphQL path.

---

## CRITICAL — vendor lookup & channel overview (the rewrite depends on these)

### A1. Root query `conversations` exists as a filtered connection
- **File / symbol:** `src/utils/graphql-queries.ts:161` `queries.listConversations` *(unused)*
- **Assumes:** `conversations(first: Int, after: String, filter: ConversationFilter, orderBy: ConversationOrder)` returning `{ edges { node }, pageInfo { hasNextPage, endCursor } }`
- **Failure if wrong:** No `conversations` root field → the whole account-wide vendor-lookup / channel-overview rewrite is impossible on this path; would need an alternate entry (contact→conversations edge, or a search root).

### A2. `ConversationFilter.contactId` (vendor lookup)
- **File / symbol:** `graphql-queries.ts:166` (`$filter: ConversationFilter`); intent from `conversations.ts:10` `ListConversationsArgs.contactId` and `index.ts:69` inputSchema
- **Assumes:** `ConversationFilter` has a `contactId` field (type `ID`/`ID!`/list) usable to return all conversations for one contact.
- **Current reality:** `contactId` is accepted by the tool but **silently dropped** — `conversations.ts:90` never passes it anywhere (REST path has no such filter).
- **Failure if wrong / absent:** Vendor lookup cannot be done server-side across the account. Fallbacks: (a) a `contact { conversations }` edge if it exists, (b) client-side scan (does **not** scale — one page only). If the field exists under another name (`contact`, `contactIds`, `contactId` vs `authorId`), the filter builder must adapt.

### A3. `ConversationFilter.channelId` (channel overview)
- **File / symbol:** `conversations.ts:11` `channelId`; `index.ts:73`; `graphql-queries.ts:166`
- **Assumes:** `ConversationFilter` has `channelId` to scope conversations to one inbox.
- **Current reality:** REST path filters client-side on `ticket.mailbox_id` after stripping a fabricated `ch_` prefix (`conversations.ts:103-108`) — one page only.
- **Failure if wrong / absent:** Channel overview can't filter server-side. Watch for `channel`, `channelIds`, `mailboxId` naming.

### A4. `ConversationFilter` keyword / search field (invoice-number search)
- **File / symbol:** none yet — this is the *new* `searchConversations` tool the task wants to add **iff** such a field exists.
- **Assumes (to be confirmed):** some `ConversationFilter` member like `keywords` / `search` / `q` / `text`, **or** a top-level conversation/message search root query.
- **Failure if wrong / absent:** No server-side invoice-number search over conversations; the `searchConversations` tool is not added (or is backed by a top-level search root if one exists). This is a capability discovery, not a regression.

### A5. `messages(conversationId:)` takes the **same** id `conversations`/`conversation` returns (ID unification — Step 0 question d)
- **File / symbol:** `graphql-queries.ts:196-210` `queries.listMessages` + `messages.ts:25` *(both unused/dead)*; wired path is REST `conversations.ts:160`
- **Assumes:** root field `messages(conversationId: ID!, first, after)` and that the `ID` equals the `node.id` returned by `conversations`/`conversation`.
- **Current reality (the break):** the REST path fabricates `id: cnv_<ticketId>` (`conversations.ts:44`) which is **not** a GraphQL node id, then strips `cnv_` again to hit REST (`conversations.ts:162`). GraphQL-id drilling never happens.
- **Failure if wrong:** If `messages` uses a different arg name, or the conversation id is not accepted by `messages`, conversation→messages drilling stays broken after the rewire. **This is the single most important thing the gate confirms.**

### A6. Result shape — Cursor Connection vs REST array, and cursor vs `per_page` pagination
- **File / symbol (REST-era assumptions, live today):**
  - `rest-client.ts:53-57` `listTickets` — pages with `per_page=${limit}` and returns a bare **array** (`response.tickets`).
  - `rest-client.ts:59-62` `getTicketMessages` — returns a bare **array** (`response.messages`).
  - `conversations.ts:90-112` `listConversations` — returns `Conversation[]`, filters client-side, caps with `limit`; **no cursor**, single page.
  - `conversations.ts:160-171` `listMessages` — array + `messages.slice(0, limit)`; **no cursor**.
  - `index.ts` `listConversations` inputSchema — exposes only `limit`, **no `after`** cursor (contrast `listMessages`/`listContacts`, which already thread `after`).
- **Assumes (GraphQL target, per Cursor Connections spec):** `conversations` (and `contacts`, `messages`) return a **`*Connection`** with `{ edges { node } / nodes, pageInfo { hasNextPage, endCursor } }` and paginate via `first` / `after` cursors — **not** arrays, **not** `page` / `per_page`. The pre-written `queries.*` already assume this connection shape (`graphql-queries.ts:175-184`), but the wired REST code assumes arrays.
- **Failure if wrong:** two directions —
  - If GraphQL returns a Connection (expected) but code keeps REST-array handling, `response.conversations.edges` is `undefined` → runtime crash on migration.
  - The bigger AP-research failure: the REST-era `limit`/single-page model **cannot sweep the account**. Vendor lookup and channel overview require looping `first`/`after` until `pageInfo.hasNextPage` is false; a one-page result silently under-reports (looks complete, isn't). Any migration that ports `limit` → `first` without a cursor loop reproduces the "one page only" defect on GraphQL.
- **Gate mapping:** the gate reports each root field's **return type** (is it a `*Connection`?) and whether that type exposes `edges`/`nodes`/`pageInfo`, and whether `first`/`after` args exist — 1:1, same as every other row.

---

## HIGH — types referenced by the pre-written queries

### B1. Input type `ConversationOrder`
- **File / symbol:** `graphql-queries.ts:167` `$orderBy: ConversationOrder`
- **Assumes:** a named input/enum `ConversationOrder` exists.
- **Failure if wrong / absent:** query fails validation on an unknown type; `orderBy` must be renamed or dropped.

### B2. Root query `conversation(id: ID!)`
- **File / symbol:** `graphql-queries.ts:188-194` `queries.getConversation` *(unused)*
- **Assumes:** singular root field `conversation(id: ID!)`.
- **Failure if wrong / absent:** `getConversation` rewire must use `node(id:) { ... on Conversation }` instead.

### B3. `contacts(search: String)` connection (vendor-lookup entry point)
- **File / symbol:** `graphql-queries.ts:212-226` `queries.listContacts`; `contacts.ts:33` *(live — used today)*
- **Assumes:** `contacts(first, after, search: String)` connection; `search` matches vendor name/email → yields the `contactId` that feeds A2.
- **Failure if wrong / absent:** vendor→contactId resolution (smoke-test step 1) fails; no way to seed the vendor lookup.

### B4. `channels(first: Int) { nodes { ... } }`
- **File / symbol:** `channels.ts:26-48` `listChannels`; `getChannel` uses `node(id: ID!) { ... on Channel }` *(live)*
- **Assumes:** `channels` connection exposing `nodes`; Channel fields `type, conversationCount, color, state, senderName` (`channels.ts:4-17`).
- **Failure if wrong:** channel enumeration for the overview breaks; field-name mismatch → validation error.

---

## MEDIUM — selection-set field names (validation-error risk, not logic)

### C1. `Conversation` selection set (`CONVERSATION_FIELDS`)
- **File / symbol:** `graphql-queries.ts:1-57`
- **Assumes:** `number, state, subject, createdAt, updatedAt, stateUpdatedAt, assigned{agent{...},team{...},at}, contact{...}, counts{messages,notes,interactions,attachments,stateChanges}, tags{nodes{id,name}}, snoozed{by{id,email},until}, starred, channel{id,name,type,color}`.
- **Failure if wrong:** any mismatched field name → whole `conversations`/`conversation` query 400s. (The task's queryType-only dump won't validate these nested names — see "residual gaps".)

### C2. `Message` selection set + author union (`MESSAGE_FIELDS`)
- **File / symbol:** `graphql-queries.ts:59-90`
- **Assumes:** `body, bodyPlainText, type, author { ... on Contact | ... on Agent }, attachments{...}`. Note `types/groove.ts:51` declares `Message.conversationId` but it is **not** selected — harmless.
- **Failure if wrong:** `messages` query 400s.

### C3. `Contact` selection set (`CONTACT_FIELDS`)
- **File / symbol:** `graphql-queries.ts:92-109` — `contactType, conversationCount, companies{nodes{id,name}}`, etc.
- **Failure if wrong:** `contacts`/`contact` query 400s (this path is live today, so lower risk).

---

## OUT OF SCOPE for the gate (to be deleted, not validated)

Write mutations to be stripped for the read-only server — no need to introspect:
`mutations.sendMessage`, `mutations.createNote`, `mutations.createContact`,
`mutations.updateContact` (`graphql-queries.ts:293-338`); tool handlers
`sendMessage`, `createNote`, `createContact`, `updateContact`,
`createConversation`, `updateConversation`, `closeConversation`
(`index.ts` + `conversations.ts`/`messages.ts`/`contacts.ts`).
`src/rest-client.ts` and `convertTicketToConversation` are to be deleted
entirely.

## Residual gaps the deepened gate query does NOT fully close

The task's deepened query introspects `queryType.fields` (+3-level `ofType`)
and `ConversationFilter.inputFields`. That authoritatively answers A1–A5,
B2–B4 (root-field args), and A2–A4/B-filter fields. It does **not** validate:
- C1/C2/C3 nested selection-set field names (needs `__type(name:"Conversation")`, `"Message"`, `"Contact")`).
- B1 `ConversationOrder` input fields (needs `__type(name:"ConversationOrder")`).
- Whether a **top-level** conversation/message search root exists (visible in the `queryType.fields` dump — scan for `search*`).

`scripts/introspection-gate.sh` therefore runs the task's exact query **plus**
targeted `__type` lookups for `Conversation`, `Message`, `ConversationOrder`,
`Contact`, and `Channel`, plus each root field's **return type** (A6
connection shape), so PASS/FAIL maps 1:1 to this inventory.

## Post-gate caveat — introspection PASS ≠ read authorization (separate check)

`__schema`/`__type` introspection succeeds with **almost any syntactically
valid token**, regardless of that token's data scopes. So a gate PASS confirms
only that the live **schema** matches this inventory — **not** that the token
can actually read conversations, contacts, or messages. Read authorization is
a **distinct check**: a single real `conversations(first: 1) { edges { node {
id } } }` (and one `contacts(first: 1)`) query, run **once the env is
unblocked**, confirms the token's scopes return data rather than an
authorization error. This is deliberately **not** run by the introspection
gate; it belongs to the smoke test (Step 6) and to the "is my token read-only
scoped?" question (Step 7). Treat a schema PASS with an unknown-scope token as
*schema-verified, read-unverified*.
