import { loadEnvConfig } from '@next/env'
import { Pool } from 'pg'
import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { presentationFixture } from '../tests/reporting-fixture'
import { saveState } from '../server/repository'
import { credentials } from '../server/credentials'
import { buildReport, datePreset } from '../store/reporting'
import { reportRows, reportSections } from '../lib/report-export'
import { csvText } from '../lib/csv'
import { fmtPHP } from '../lib/format'

loadEnvConfig(process.cwd())
const require = createRequire(import.meta.url)
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const name = 'naga_rehearsal_' + randomUUID().replace(/-/g, '').slice(0, 12)
const source = new URL(process.env.DATABASE_URL!)
const managementUrl = new URL(source); managementUrl.pathname = '/postgres'
const testUrl = new URL(source); testUrl.pathname = '/' + name
const management = new Pool({connectionString: managementUrl.toString()})
const db = new Pool({connectionString: testUrl.toString()})
let server: ChildProcess | undefined, browser: any, created = false
const checks: string[] = []
const pass = (name: string) => {checks.push(name); console.log('PASS ' + name)}

async function main() {
  await management.query(`CREATE DATABASE ${name}`); created = true
  const state = presentationFixture()
  state.admin = {...credentials('7294'), failedAttempts: 0}
  const client = await db.connect()
  try {
    await client.query('BEGIN'); await client.query(readFileSync('server/schema.sql', 'utf8'))
    await saveState(client, null, state); await client.query('COMMIT')
  } finally {client.release()}
  server = spawn(process.execPath, ['scripts/rehearsal-server.cjs'], {
    env: {...process.env, DATABASE_URL: testUrl.toString()}, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']})
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Isolated report server did not start')), 60000)
    server!.stdout!.on('data', data => {if (String(data).includes('REHEARSAL_READY')) {clearTimeout(timer); resolve()}})
    server!.once('exit', () => {clearTimeout(timer); reject(Error('Isolated report server exited'))})
    server!.once('error', reject)
  })
  browser = await chromium.launch({headless: true, channel: 'chrome'})
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}})
  const errors: string[] = []; page.on('pageerror', (e: Error) => errors.push(e.message))
  await page.goto('http://127.0.0.1:3102/admin')
  for (const digit of '7294') await page.getByRole('button', {name: digit, exact: true}).click()
  await page.getByRole('heading', {name: 'Live occupancy', exact: true}).waitFor()
  await page.getByText('Completed sessions today', {exact: true}).waitFor()
  pass('Dashboard separates live occupancy and dated activity')
  await page.goto('http://127.0.0.1:3102/admin#/admin/reports')
  const start = page.getByLabel('Report start date'), end = page.getByLabel('Report end date')
  await start.waitFor(); assert.equal(await start.inputValue(), datePreset('today').from)
  for (const [button, preset] of [['Last 7 Days', 'week'], ['This Month', 'month']] as const) {
    await page.getByRole('button', {name: button, exact: true}).click()
    assert.equal(await start.inputValue(), datePreset(preset).from)
  }
  await start.fill('2026-11-09'); await end.fill('2026-11-09')
  const report = buildReport(state, '2026-11-09', '2026-11-09')
  assert.deepEqual(report.totals, {gross: 1332, voids: 10.1, refunds: 0.3, net: 1321.6})
  for (const [label, value] of [['Gross payments', 1332], ['Voided amount', 10.1], ['Refunded amount', 0.3], ['Net collected', 1321.6]] as const) {
    assert.ok((await page.getByText(label, {exact: true}).locator('..').innerText()).includes(fmtPHP(value, true)))
  }
  await page.getByRole('note').filter({hasText: '40 payment record(s)'}).waitFor()
  for (const group of [...report.byCategory, ...report.byAttendant]) {
    const label = 'category' in group ? group.category : group.attendant
    const row = page.locator('tbody tr').filter({has: page.getByText(label, {exact: true})})
    assert.ok((await row.innerText()).includes(fmtPHP(group.net, true)))
  }
  pass('Presets, totals, category/attendant reconciliation and estimated-time notice')
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', {name: 'Export CSV', exact: true}).click()
  const download = await downloadEvent
  const csv = readFileSync(await download.path(), 'utf8')
  for (const row of reportRows(report)) {
    if (row[0] === 'Generated at' || row[0] === 'As of (Asia/Manila)') continue
    assert.ok(csv.includes(csvText([row])), 'CSV missing row: ' + row[0])
  }
  const popupEvent = page.waitForEvent('popup')
  await page.getByRole('button', {name: 'Print / Save as PDF', exact: true}).click()
  const popup = await popupEvent; await popup.waitForLoadState()
  const tables = await popup.locator('table').evaluateAll((tables: HTMLTableElement[]) => tables.map(table => Array.from(table.rows).map(row => Array.from(row.cells).map(cell => cell.textContent))))
  const expected = reportSections(report).map(section => [section.headers, ...section.rows.map(row => row.map(String))])
  // The live timestamp is captured at the export click, independently of this test's clock.
  tables[tables.length - 1][1][1] = expected[expected.length - 1][1][1]
  assert.deepEqual(tables, expected)
  assert.equal(await popup.locator('nav,aside').count(), 0)
  mkdirSync('docs/reporting-evidence', {recursive: true})
  writeFileSync('docs/reporting-evidence/sample.csv', csv)
  await popup.pdf({path: 'docs/reporting-evidence/sample.pdf', preferCSSPageSize: true, printBackground: true})
  await page.screenshot({path: 'docs/reporting-evidence/screen.png', fullPage: true})
  const fixedText = await popup.locator('body').innerText()
  await db.query("UPDATE parking_payments SET data=jsonb_set(data,'{amount}','100.1') WHERE id='REPORT-000'")
  await page.getByText(fmtPHP(1411.6, true), {exact: true}).waitFor({timeout: 15000})
  assert.equal(await popup.locator('body').innerText(), fixedText)
  pass('CSV and print match screen; print remains fixed while polling updates the screen')
  await start.fill('2026-11-11')
  await page.getByRole('alert').filter({hasText: 'Choose valid dates'}).waitFor()
  assert.equal(await page.getByRole('button', {name: 'Export CSV', exact: true}).isDisabled(), true)
  assert.equal(await page.getByRole('button', {name: 'Print / Save as PDF', exact: true}).isDisabled(), true)
  await start.fill(''); await page.getByRole('alert').filter({hasText: 'Choose valid dates'}).waitFor()
  await start.fill('2025-01-01'); await end.fill('2025-01-01')
  assert.ok((await page.getByText('Net collected', {exact: true}).locator('..').innerText()).includes(fmtPHP(0, true)))
  pass('Invalid/reversed ranges block exports; empty periods display zero')
  await page.goto('http://127.0.0.1:3102/admin#/admin/transactions')
  await page.getByPlaceholder('Search ticket / transaction ID').fill('REPORT-002')
  await page.getByText('Estimated from checkout time', {exact: true}).first().waitFor()
  await page.getByText('Checkout time', {exact: true}).first().waitFor()
  const detailDownload = page.waitForEvent('download')
  await page.getByRole('button', {name: 'Export CSV', exact: true}).click()
  const detailed = readFileSync(await (await detailDownload).path(), 'utf8')
  assert.ok(detailed.includes('Payment time source')); assert.ok(detailed.includes('Estimated from checkout time'))
  assert.ok(detailed.includes('2026')); assert.deepEqual(errors, [])
  pass('History displays separate dated checkout/payment values and exports provenance without browser errors')
  writeFileSync('docs/reporting-results.json', JSON.stringify({executedAt: new Date().toISOString(), isolatedDatabase: true, checks, totals: report.totals, paymentRecords: report.paymentRecords, estimatedRecords: report.estimatedRecords}, null, 2) + '\n')
}

main().catch(error => {console.error(error); process.exitCode = 1}).finally(async () => {
  await browser?.close()
  if (server && server.exitCode === null) {const stopped = once(server, 'exit'); server.kill(); await stopped}
  await db.end()
  if (created) await management.query(`DROP DATABASE ${name} WITH (FORCE)`)
  await management.end()
})
