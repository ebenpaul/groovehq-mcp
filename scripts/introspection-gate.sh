#!/usr/bin/env bash
#
# Step 0 — GO/NO-GO introspection gate.
#
# Runs a LIVE introspection query against the Groove v2 GraphQL endpoint and
# saves the raw JSON so PASS/FAIL can be judged 1:1 against
# docs/audit/assumption-inventory.md. Does NOT infer the schema from source.
#
# Requires: GROOVE_API_TOKEN in the environment, and network egress to
# api.groovehq.com (blocked by policy in the web sandbox — run in a session
# whose environment allowlists that host, or run locally).
#
# Usage:  GROOVE_API_TOKEN=xxx ./scripts/introspection-gate.sh
# Output: writes ./introspection-result.json and prints a distilled summary.

set -euo pipefail

: "${GROOVE_API_TOKEN:?GROOVE_API_TOKEN is required}"
ENDPOINT="${GROOVE_API_URL:-https://api.groovehq.com/v2/graphql}"
OUT="introspection-result.json"

# The task's deepened query (3-level ofType so wrapped inputs keep their inner
# NAMED type) covering queryType.fields + ConversationFilter, EXTENDED with
# __type lookups for the named types the selection sets depend on
# (Conversation, Message, Contact, Channel) and the ConversationOrder input.
read -r -d '' QUERY <<'EOF' || true
query GateIntrospection {
  __schema {
    queryType {
      fields {
        name
        description
        type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
        args { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }
      }
    }
  }
  ConversationFilter: __type(name: "ConversationFilter") {
    inputFields {
      name
      description
      type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
    }
  }
  ConversationOrder: __type(name: "ConversationOrder") {
    kind
    inputFields { name type { kind name ofType { kind name } } }
    enumValues { name }
  }
  Conversation: __type(name: "Conversation") {
    fields { name type { kind name ofType { kind name ofType { kind name } } } }
  }
  Message: __type(name: "Message") {
    fields { name type { kind name ofType { kind name ofType { kind name } } } }
  }
  Contact: __type(name: "Contact") {
    fields { name }
  }
  Channel: __type(name: "Channel") {
    fields { name }
  }
  # A6 — likely Connection type names; if present, confirms edges/nodes/pageInfo
  # (cursor-connection shape). If null, read the real return type off the
  # root-field dump above and adjust.
  ConversationConnection: __type(name: "ConversationConnection") {
    fields { name }
  }
  ContactConnection: __type(name: "ContactConnection") {
    fields { name }
  }
  MessageConnection: __type(name: "MessageConnection") {
    fields { name }
  }
}
EOF

echo "→ POST $ENDPOINT" >&2
curl -sS -X POST "$ENDPOINT" \
  -H "Authorization: Bearer $GROOVE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data "$(jq -n --arg q "$QUERY" '{query:$q}')" \
  | jq . > "$OUT"

echo "→ raw result saved to $OUT" >&2
echo

# ---- distilled, inventory-aligned summary (best-effort; judge PASS/FAIL from $OUT) ----
echo "=== root query fields (looking for: conversations, conversation, messages, contacts, channels, any search*) ==="
jq -r '.data.__schema.queryType.fields[].name' "$OUT" \
  | grep -iE 'conversation|message|contact|channel|search|node' || true

echo
echo "=== conversations() args ==="
jq -r '.data.__schema.queryType.fields[] | select(.name=="conversations") | .args[] | "  \(.name): \(.type.ofType.name // .type.name)"' "$OUT" || true

echo
echo "=== messages() args (A5: does it take conversationId?) ==="
jq -r '.data.__schema.queryType.fields[] | select(.name=="messages") | .args[] | "  \(.name): \(.type.ofType.name // .type.name)"' "$OUT" || true

echo
echo "=== conversation() args (B2) ==="
jq -r '.data.__schema.queryType.fields[] | select(.name=="conversation") | .args[] | "  \(.name): \(.type.ofType.name // .type.name)"' "$OUT" || true

echo
echo "=== contacts() args (B3: does it take search?) ==="
jq -r '.data.__schema.queryType.fields[] | select(.name=="contacts") | .args[] | "  \(.name): \(.type.ofType.name // .type.name)"' "$OUT" || true

echo
echo "=== ConversationFilter input fields (A2 contactId, A3 channelId, A4 keyword/search, tag, state) ==="
jq -r '.data.ConversationFilter.inputFields // [] | .[] | "  \(.name): \(.type.ofType.name // .type.name // .type.kind)"' "$OUT" || true

echo
echo "=== ConversationOrder present? (B1) ==="
jq -r 'if .data.ConversationOrder == null then "  ABSENT" else "  present (kind \(.data.ConversationOrder.kind))" end' "$OUT" || true

echo
echo "=== Conversation type present + field count (C1) ==="
jq -r 'if .data.Conversation == null then "  ABSENT" else "  present, \(.data.Conversation.fields | length) fields" end' "$OUT" || true

echo
echo "=== A6: result shape — return type + cursor pagination for conversations/contacts/messages ==="
for f in conversations contacts messages; do
  # return type name (unwrap NON_NULL/LIST) and whether first/after args exist
  rt=$(jq -r --arg f "$f" '.data.__schema.queryType.fields[] | select(.name==$f) | .type | (.name // .ofType.name // .ofType.ofType.name // "?")' "$OUT")
  hasfirst=$(jq -r --arg f "$f" '[.data.__schema.queryType.fields[] | select(.name==$f) | .args[].name] | (index("first")!=null)' "$OUT")
  hasafter=$(jq -r --arg f "$f" '[.data.__schema.queryType.fields[] | select(.name==$f) | .args[].name] | (index("after")!=null)' "$OUT")
  echo "  $f -> returns: $rt   | first: $hasfirst  after: $hasafter"
done
echo "  (a *Connection return type + first/after args = cursor-connection, NOT array/per_page)"
echo "  ConversationConnection fields: $(jq -rc '.data.ConversationConnection.fields // "ABSENT" | if type=="array" then map(.name) else . end' "$OUT")"

echo
echo "Review $OUT and judge PASS/FAIL per docs/audit/assumption-inventory.md."
echo "NOTE: introspection PASS confirms SCHEMA only, not token read scope."
echo "      For read authorization, run:  $0 --read-check   (separate, post-gate)."

# ---- SEPARATE post-gate check: read authorization (NOT part of the gate) ----
# Introspection succeeds with almost any valid token regardless of data scopes.
# This opt-in step issues ONE real read to confirm the token can actually see
# conversations/contacts. Run only after a schema PASS, once egress is unblocked.
if [ "${1:-}" = "--read-check" ]; then
  echo
  echo "=== READ-AUTH CHECK (separate from gate) — conversations(first:1) & contacts(first:1) ==="
  RQ='query ReadAuth { conversations(first: 1) { edges { node { id } } } contacts(first: 1) { edges { node { id } } } }'
  curl -sS -X POST "$ENDPOINT" \
    -H "Authorization: Bearer $GROOVE_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data "$(jq -n --arg q "$RQ" '{query:$q}')" \
  | jq '{errors: (.errors // "none"), conversations: (.data.conversations.edges | length? // "n/a"), contacts: (.data.contacts.edges | length? // "n/a")}'
  echo "  errors=none with counts present => token has read scope. Any authorization error => scope gap (schema PASS still stands)."
fi
