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
echo "Review $OUT and judge PASS/FAIL per docs/audit/assumption-inventory.md."
