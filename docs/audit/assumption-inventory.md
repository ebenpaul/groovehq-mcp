# GraphQL Schema Assumption Inventory (pre-gate)

Baseline: unmodified fork of `christiangenco/groove-mcp`.
Purpose: enumerate every place the code assumes a shape for the Groove v2
GraphQL schema, so the Step 0 introspection result can be checked 1:1 against
real assumptions **before** any rewrite. Nothing here is validated yet — the
Step 0 gate is BLOCKED (no `GROOVE_API_TOKEN`, `api.groovehq.com` egress
denied 403 by network policy). Schema is **not** inferred from source; this
only records what the code *expects*.

## Architectural context (why this matters)

The conversation-read core does **not** run on GraphQL today. `index.ts`
wires `listConversations`, `getConversation`, and `listMessages` to
`ConversationTools`, which calls the **REST v1** `GrooveRestClient` and then
runs `convertTicketToConversation` to fake GraphQL-shaped objects. The
GraphQL queries `queries.listConversations` / `queries.getConversation` are
pre-written but **dead code**. Likewise `MessageTools.listMessages`
(GraphQL) is dead — the wired `listMessages` is the REST one on
`ConversationTools`. So every assumption below marked *(unused)* has **never
executed against the live API** and is exactly what the gate must confirm
before the rewire.

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
`Contact`, and `Channel`, so PASS/FAIL maps 1:1 to this inventory.
