// End-to-end regression test for the REST v1 pagination + accounting fix.
//
// Drives the REAL compiled ConversationTools -> GrooveRestClient path with only
// the network boundary (global.fetch) mocked to emulate Groove v1. It is built
// to CATCH the accounting bug that a happy-path mock missed:
//   * `returned` must equal the actual accumulated record count, never
//     pages_fetched * per_page.
//   * the loop must STOP at the real end of data (next_page null / current_page
//     >= total_pages / empty page) and must NOT fetch page 4+ for the Tejas set.
//   * empty trailing pages must contribute ZERO to `returned`.
//   * the note must never show a negative remainder.
//
// Run:  npm run build && node scripts/smoke-pagination.test.mjs

import assert from 'node:assert';
import { ConversationTools } from '../dist/tools/conversations.js';

const TOKEN = 'test-token-abc';
const PER_PAGE = 50;
const TEJAS = 'artubing@tejastubular.com';
const QUIRKY = 'quirky@example.com'; // Groove over-reports pages / trailing empties

// --- synthetic datasets -----------------------------------------------------
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
const DATA = {
  [TEJAS]: makeTickets('tejas_', 102, TEJAS), // real Groove: next_page null at page 3
  [QUIRKY]: makeTickets('quirky_', 102, QUIRKY), // same data, but pagination lies (see below)
};

// --- request recorder + mock fetch -----------------------------------------
const requests = []; // { path, page, customer }
const servedIds = new Set(); // unique ticket ids actually handed to the client

globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url);
  const path = u.pathname;

  if (path === '/v1/tickets') {
    const customer = u.searchParams.get('customer') || '';
    const page = parseInt(u.searchParams.get('page') || '1', 10);
    const perPage = parseInt(u.searchParams.get('per_page') || '25', 10);
    requests.push({ path, page, customer, auth: options.headers?.Authorization, raw: url });

    const dataset = DATA[customer] || [];
    const total = dataset.length;
    const start = (page - 1) * perPage;
    const slice = dataset.slice(start, start + perPage);
    slice.forEach((t) => servedIds.add(t.id));

    // Pagination metadata policy:
    //  - TEJAS  = truthful Groove (total_pages=3, next_page null at page 3).
    //  - QUIRKY = adversarial: reports total_pages=5 and keeps next_page
    //             non-null through empty trailing pages 4-5. A correct loop must
    //             still stop (empty page) and must not let empties inflate counts.
    const truthfulPages = Math.max(1, Math.ceil(total / perPage));
    let total_pages, next_page;
    if (customer === QUIRKY) {
      total_pages = 5;
      next_page = page < 5 ? page + 1 : null;
    } else {
      total_pages = truthfulPages;
      next_page = page < truthfulPages ? page + 1 : null;
    }

    return jsonResponse({
      tickets: slice,
      meta: {
        pagination: {
          current_page: page,
          total_pages,
          total_count: total,
          next_page,
          previous_page: page > 1 ? page - 1 : null,
          per_page: perPage,
        },
      },
    });
  }

  const single = path.match(/^\/v1\/tickets\/([^/]+)$/);
  if (single) {
    requests.push({ path, raw: url });
    return jsonResponse({ ticket: { id: single[1], number: 1, title: 'One', state: 'opened' } });
  }
  const msgs = path.match(/^\/v1\/tickets\/([^/]+)\/messages$/);
  if (msgs) {
    requests.push({ path, raw: url });
    return jsonResponse({ messages: [{ id: 'm1', body: 'hi' }, { id: 'm2', body: 'there' }] });
  }
  throw new Error(`unexpected fetch: ${url}`);
};

function jsonResponse(obj) {
  return { ok: true, status: 200, json: async () => obj, text: async () => JSON.stringify(obj) };
}
const ticketListReqs = (customer) =>
  requests.filter((r) => r.path === '/v1/tickets' && r.customer === customer);

// ---------------------------------------------------------------------------
const tools = new ConversationTools(TOKEN);
let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failures++; console.log(`  ✗ ${name}\n      ${e.message}`); }
}

console.log('\n== 1. Tejas vendor lookup: COMPLETE and correctly COUNTED ==');
const full = await tools.listConversations({ customer: TEJAS });
const tejasReqs = ticketListReqs(TEJAS);
console.log(`  total_count=${full.pagination.total_count} returned=${full.pagination.returned} ` +
  `complete=${full.pagination.complete} pages_fetched=${full.pagination.pages_fetched}`);
console.log(`  requested pages: [${tejasReqs.map((r) => r.page).join(', ')}]`);
console.log(`  note: ${full.pagination.note}`);
check('returned === 102 (actual records)', () => assert.strictEqual(full.pagination.returned, 102));
check('conversations array length === 102', () => assert.strictEqual(full.conversations.length, 102));
check('returned === unique records the mock served', () =>
  assert.strictEqual(full.pagination.returned, servedIds.size));
check('returned is NOT pages_fetched * per_page (the bug)', () =>
  assert.notStrictEqual(full.pagination.returned, full.pagination.pages_fetched * PER_PAGE));
check('total_count === 102', () => assert.strictEqual(full.pagination.total_count, 102));
check('complete === true', () => assert.strictEqual(full.pagination.complete, true));
check('truncated === false', () => assert.strictEqual(full.pagination.truncated, false));
check('pages_fetched === 3', () => assert.strictEqual(full.pagination.pages_fetched, 3));

console.log('\n== 2. Loop STOPS at end of data — zero requests for page 4+ ==');
check('exactly pages 1,2,3 requested', () =>
  assert.deepStrictEqual(tejasReqs.map((r) => r.page), [1, 2, 3]));
check('NO request for page >= 4', () =>
  assert.strictEqual(tejasReqs.filter((r) => r.page >= 4).length, 0));

console.log('\n== 3. Note never shows a negative remainder ==');
check('no negative number in note', () => assert.ok(!/-\d/.test(full.pagination.note)));

console.log('\n== 4. Adversarial pagination: empty trailing pages contribute 0, loop still terminates ==');
// QUIRKY reports total_pages=5 with non-null next_page through empty pages 4-5.
const quirky = await tools.listConversations({ customer: QUIRKY });
const quirkyReqs = ticketListReqs(QUIRKY);
console.log(`  returned=${quirky.pagination.returned} complete=${quirky.pagination.complete} ` +
  `pages_fetched=${quirky.pagination.pages_fetched} requested=[${quirkyReqs.map((r) => r.page).join(', ')}]`);
check('returned === 102 despite empty trailing pages', () =>
  assert.strictEqual(quirky.pagination.returned, 102));
check('empty pages added 0 (returned !== pages_fetched * per_page)', () =>
  assert.notStrictEqual(quirky.pagination.returned, quirky.pagination.pages_fetched * PER_PAGE));
check('loop terminated (did not run to a large ceiling)', () =>
  assert.ok(quirky.pagination.pages_fetched <= 4));
check('stopped at/after first empty page — no page 5+ requested', () =>
  assert.strictEqual(quirkyReqs.filter((r) => r.page >= 5).length, 0));
check('complete === true (102 === total_count)', () =>
  assert.strictEqual(quirky.pagination.complete, true));
check('returned <= total_count invariant holds', () =>
  assert.ok(quirky.pagination.returned <= quirky.pagination.total_count));

console.log('\n== 5. Truncation (maxResults) is labeled, never silent ==');
const capped = await tools.listConversations({ customer: TEJAS, maxResults: 10 });
console.log(`  returned=${capped.pagination.returned} complete=${capped.pagination.complete} ` +
  `truncated=${capped.pagination.truncated}`);
check('returns exactly 10', () => assert.strictEqual(capped.conversations.length, 10));
check('complete === false', () => assert.strictEqual(capped.pagination.complete, false));
check('truncated === true', () => assert.strictEqual(capped.pagination.truncated, true));
check('total_count still 102', () => assert.strictEqual(capped.pagination.total_count, 102));
check('note warns about the gap, no negative', () =>
  assert.ok(/92 more/.test(capped.pagination.note) && !/-\d/.test(capped.pagination.note)));

console.log('\n== 6. Auth via Authorization: Bearer header, never query param ==');
check('Authorization: Bearer header present', () =>
  assert.strictEqual(tejasReqs[0].auth, `Bearer ${TOKEN}`));
check('no access_token query param on any request', () =>
  assert.ok(requests.every((r) => !new URL(r.raw).searchParams.has('access_token'))));

console.log('\n== 7. Server-side filter + bare-id drill-down ==');
check('every /tickets call carried customer=', () =>
  assert.ok(tejasReqs.every((r) => r.customer === TEJAS)));
const conv = await tools.getConversation('6079');
check('getConversation hits /v1/tickets/6079 (bare id)', () =>
  assert.ok(requests.some((r) => r.path === '/v1/tickets/6079')));
check('conversation id has no cnv_ prefix', () => assert.ok(!String(conv.id).startsWith('cnv_')));
const m = await tools.listMessages('6079');
check('listMessages returns messages', () => assert.strictEqual(m.length, 2));

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
