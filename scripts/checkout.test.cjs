const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadCheckout({ amount = 40, missing = false } = {}) {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('SELECT')) return { rows: missing ? [] : [{
        id: 1, spot_id: 1, ticket_id: 'NSP-TEST', spot_number: 'A01',
        vehicle_category: 'Car', time_in: new Date(Date.now() - 30 * 60000),
        initial_fee: amount, initial_duration_mins: 60,
        additional_increment_mins: 60, additional_rate: 20, grace_period_mins: 0,
      }] };
      if (sql.includes('INSERT INTO transactions')) return { rows: [{
        transaction_id: params[2], created_at: new Date(),
      }] };
      return { rows: [] };
    },
    release() { calls.push({ sql: 'RELEASE' }); },
  };
  function load(relative) {
    const filename = path.resolve(__dirname, '..', relative);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    const requireLocal = (id) => {
      if (id === '@/lib/db') return { pool: { connect: async () => client } };
      if (id === 'next/server') return { NextResponse: { json: (body, init) => Response.json(body, init) } };
      if (id === '@/store/logic') return load('store/logic.ts');
      if (id === '../lib/format') return load('lib/format.ts');
      return require(id);
    };
    vm.runInNewContext(code, { exports, require: requireLocal, Date, Response, URL, console });
    return exports;
  }
  return { route: load('app/api/checkout/route.ts'), calls };
}

test('checkout commits server amounts only after locking the session', async () => {
  const { route, calls } = loadCheckout();
  const response = await route.PUT(new Request('http://local/api/checkout', {
    method: 'PUT', body: JSON.stringify({ ticket_id: 'NSP-TEST', amount_paid: 100 }),
  }));
  const data = await response.json();
  assert.equal(data.transaction.amount, 40);
  assert.equal(data.transaction.change, 60);
  assert.equal(calls[0].sql, 'BEGIN');
  assert.match(calls[1].sql, /FOR UPDATE OF s/);
  assert.ok(calls.some(({sql}) => sql === 'COMMIT'));
  assert.equal(calls.at(-1).sql, 'RELEASE');
});

for (const amount of [10, 'not-a-number']) {
  test(`checkout rejects invalid tender ${amount} without releasing the space`, async () => {
    const { route, calls } = loadCheckout();
    const response = await route.PUT(new Request('http://local/api/checkout', {
      method: 'PUT', body: JSON.stringify({ ticket_id: 'NSP-TEST', amount_paid: amount }),
    }));
    assert.equal(response.status, 400);
    assert.ok(calls.some(({sql}) => sql === 'ROLLBACK'));
    assert.ok(!calls.some(({sql}) => sql.includes('UPDATE spots')));
  });
}

test('a completed or missing session cannot be charged again', async () => {
  const { route, calls } = loadCheckout({ missing: true });
  const response = await route.PUT(new Request('http://local/api/checkout', {
    method: 'PUT', body: JSON.stringify({ ticket_id: 'NSP-TEST', amount_paid: 100 }),
  }));
  assert.equal(response.status, 404);
  assert.ok(calls.some(({sql}) => sql === 'ROLLBACK'));
  assert.ok(!calls.some(({sql}) => sql.includes('INSERT INTO transactions')));
});
