# Invoice-number search — constraint & options (P3: documented, NOT implemented)

## The core AP use case
Find the conversation(s) referencing a given invoice number (e.g. `336205`).
In practice the invoice number appears in the ticket **title**, e.g.
`"Invoice 336205 from Tejas Tubular"`.

## The constraint
**Groove REST v1 `GET /tickets` has no keyword / full-text / title-search
parameter.** Its documented, reachable filters are `customer`, `assignee`,
`state`, `folder`, `page`, `per_page` (max 50). None matches on title or body.
So there is no server-side "search tickets for 336205" call available on the
path our token can reach.

The account holds ~5,946 tickets. A naive "search" would page all ~120 pages
(50/page) and substring-match titles client-side. **We must not build that** —
it is slow, hammers the API on every lookup, and is exactly the kind of
full-scan the pagination fix was meant to make honest, not to invite.

## Options (bring a decision back before implementing)

### Option A — scope by `customer`, then match titles within that set *(recommended when the vendor is known)*
AP lookups usually know the vendor. `listConversations({ customer })` already
returns *all* of that vendor's conversations server-side (verified: 102 for
Tejas across 3 pages). Matching the invoice number against titles **within that
bounded set** is cheap and complete. Flow: resolve vendor → `customer` filter →
title-match on the returned page set.
- Pros: bounded, complete, no account-wide scan, reuses the fixed pagination.
- Cons: needs the vendor/contact up front; won't find an invoice whose vendor
  is unknown.

### Option B — confirm whether Groove exposes a search endpoint we can reach
Groove has historically offered a search surface (v1 `/search` and/or a v2
GraphQL search). Neither is confirmed reachable for this token yet.
- Next step: introspect/probe for a search field or `/v1/search` with the real
  token (the introspection gate can be extended). If one exists and is scoped,
  it replaces the client-side title match entirely.
- Pros: true search, vendor-independent. Cons: unconfirmed availability/scope.

### Option C — local index (only if A and B are insufficient)
Periodically page all tickets once, build a local title/number index, and query
that. Heavier; introduces staleness and storage. Last resort.

## Recommendation
Ship **Option A** first (it covers the common "known vendor" case with zero new
API risk), and run the **Option B** probe to see if a real search endpoint is
reachable. Do **not** implement an account-wide client-side scan. No search tool
is added until this is decided.
