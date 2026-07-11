// End-to-end smoke test for the REST v1 pagination fix.
//
// Drives the REAL compiled ConversationTools -> GrooveRestClient code path with
// only the network boundary (global.fetch) mocked to emulate Groove v1. Proves:
//   1. listConversations returns ALL 102 conversations for the Tejas vendor
//      (the bug returned 6 and called it complete).
//   2. The contact filter is pushed SERVER-SIDE as `customer=` (no client scan).
//   3. Auth is an Authorization: Bearer header — never an access_token query param.
//   4. Truncation (maxResults) is labeled: complete=false, truncated=true, total_count shown.
//   5. Unsupported filters (channelId) are reported, not silently approximated.
//   6. getConversation / listMessages drill on BARE integer ids (no cnv_).
//
// Run:  npm run build && node scripts/smoke-pagination.test.mjs

import assert from 'node:assert';
import { ConversationTools } from '../dist/tools/conversations.js';

const TEJAS = 'artubing@tejastubular.com';
const TEJAS_TOTAL = 102;
const PER_PAGE = 50;
const TOKEN = 'test-token-abc';

// Synthetic Groove account: 102 tickets for Tejas, plus noise for other customers.
function makeTickets(prefix, n, customerEmail) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i + 1}`,
    number: i + 1,
    title: `Invoice ${100000 + i} from ${prefix}`,
    state: 'opened',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    links: { customer: { id: 999, href: `https://x/customers/${customerEmail}` } },
    mailbox_id: 7,
    mailbox: 'Support',
  }));
}
const TEJAS_TICKETS = makeTickets('tejas_', TEJAS_TOTAL, TEJAS);

const calls = [];
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, headers: options.headers || {} });
  const u = new URL(url);
  const path = u.pathname;

  // ---- GET /tickets (list, paginated, server-side filtered) ----
  if (path === '/v1/tickets') {
    const customer = u.searchParams.get('customer');
    const page = parseInt(u.searchParams.get('page') || '1', 10);
    const perPage = parseInt(u.searchParams.get('per_page') || '25', 10);

    // Server-side filter emulation: only Tejas tickets when customer matches.
    const dataset = customer === TEJAS ? TEJAS_TICKETS : [];
    const total = dataset.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const start = (page - 1) * perPage;
    const slice = dataset.slice(start, start + perPage);

    return jsonResponse({
      tickets: slice,
      meta: {
        pagination: {
          current_page: page,
          total_pages: totalPages,
          total_count: total,
          next_page: page < totalPages ? page + 1 : null,
          previous_page: page > 1 ? page - 1 : null,
          per_page: perPage,
        },
      },
    });
  }

  // ---- GET /tickets/:id (drill-down) ----
  const single = path.match(/^\/v1\/tickets\/([^/]+)$/);
  if (single) {
    return jsonResponse({ ticket: { id: single[1], number: 1, title: 'One', state: 'opened' } });
  }
  // ---- GET /tickets/:id/messages ----
  const msgs = path.match(/^\/v1\/tickets\/([^/]+)\/messages$/);
  if (msgs) {
    return jsonResponse({ messages: [{ id: 'm1', body: 'hi' }, { id: 'm2', body: 'there' }] });
  }
  throw new Error(`unexpected fetch: ${url}`);
};

function jsonResponse(obj) {
  return { ok: true, status: 200, json: async () => obj, text: async () => JSON.stringify(obj) };
}

// ---------------------------------------------------------------------------
const tools = new ConversationTools(TOKEN);
let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failures++; console.log(`  ✗ ${name}\n      ${e.message}`); }
}

console.log('\n== 1. Tejas vendor lookup returns the COMPLETE set ==');
const full = await tools.listConversations({ customer: TEJAS });
console.log(`  total_count=${full.pagination.total_count} returned=${full.pagination.returned} ` +
  `complete=${full.pagination.complete} pages=${full.pagination.pages_fetched}`);
console.log(`  note: ${full.pagination.note}`);
check('returns 102 conversations (not 6)', () => assert.strictEqual(full.conversations.length, 102));
check('total_count is 102', () => assert.strictEqual(full.pagination.total_count, 102));
check('complete === true', () => assert.strictEqual(full.pagination.complete, true));
check('truncated === false', () => assert.strictEqual(full.pagination.truncated, false));
check('fetched 3 pages (50+50+2)', () => assert.strictEqual(full.pagination.pages_fetched, 3));

console.log('\n== 2. Filter pushed SERVER-SIDE (customer=), no client scan ==');
const listCalls = calls.filter((c) => new URL(c.url).pathname === '/v1/tickets');
check('every /tickets call carried customer=' + TEJAS, () =>
  assert.ok(listCalls.every((c) => new URL(c.url).searchParams.get('customer') === TEJAS)));
check('per_page respected at max 50', () =>
  assert.ok(listCalls.every((c) => new URL(c.url).searchParams.get('per_page') === '50')));

console.log('\n== 3. Auth via Authorization: Bearer header, NOT query param ==');
check('Authorization: Bearer header present', () =>
  assert.strictEqual(calls[0].headers.Authorization, `Bearer ${TOKEN}`));
check('no access_token query param on any call', () =>
  assert.ok(calls.every((c) => !new URL(c.url).searchParams.has('access_token'))));
check('token never appears in any URL', () =>
  assert.ok(calls.every((c) => !c.url.includes(TOKEN))));

console.log('\n== 4. Truncation is labeled, never silent ==');
const capped = await tools.listConversations({ customer: TEJAS, maxResults: 10 });
console.log(`  returned=${capped.pagination.returned} complete=${capped.pagination.complete} ` +
  `truncated=${capped.pagination.truncated}`);
console.log(`  note: ${capped.pagination.note}`);
check('returns exactly 10', () => assert.strictEqual(capped.conversations.length, 10));
check('complete === false', () => assert.strictEqual(capped.pagination.complete, false));
check('truncated === true', () => assert.strictEqual(capped.pagination.truncated, true));
check('total_count still 102', () => assert.strictEqual(capped.pagination.total_count, 102));
check('note warns about the gap', () => assert.ok(/92 more|of 102/.test(capped.pagination.note)));

console.log('\n== 5. Unsupported filter reported, not approximated ==');
const withChannel = await tools.listConversations({ customer: TEJAS, channelId: 'ch_7' });
check('unsupportedFilters lists channelId', () =>
  assert.ok(withChannel.unsupportedFilters?.some((f) => f.startsWith('channelId='))));
check('still returns full 102 (channel NOT silently filtered)', () =>
  assert.strictEqual(withChannel.conversations.length, 102));

console.log('\n== 6. Drill-down on BARE integer ids (no cnv_) ==');
const conv = await tools.getConversation('6079');
check('getConversation uses bare id in URL', () =>
  assert.ok(calls.some((c) => new URL(c.url).pathname === '/v1/tickets/6079')));
check('conversation id is bare (no cnv_ prefix)', () => assert.ok(!String(conv.id).startsWith('cnv_')));
const msgs = await tools.listMessages('6079');
check('listMessages hits /tickets/6079/messages', () =>
  assert.ok(calls.some((c) => new URL(c.url).pathname === '/v1/tickets/6079/messages')));
check('listMessages returns messages', () => assert.strictEqual(msgs.length, 2));

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
