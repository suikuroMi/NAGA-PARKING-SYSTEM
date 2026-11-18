import { useState } from 'react'
import AdminLayout from './AdminLayout'
import { Badge, Button, Card, CardHead, toast } from '../components/ui'
import { Stat } from './widgets'
import { useNow, useStore } from '../store/store'
import { buildReport, datePreset, dayRange, localDate } from '../store/reporting'
import { fmtLong, fmtPHP } from '../lib/format'
import { exportReport, printReport } from '../lib/report-export'

export default function ReportsPage() {
  const state=useStore(s=>s),now=useNow(),[from,setFrom]=useState(localDate()),[to,setTo]=useState(localDate())
  const [preset,setPreset]=useState('today')
  const dates=preset==='custom'?{from,to}:datePreset(preset as 'today'|'week'|'month',now)
  let error='';try{dayRange(dates.from,dates.to)}catch(e){error=(e as Error).message}
  const report=error?null:buildReport(state,dates.from,dates.to,now)
  const setCustom=(field:'from'|'to',value:string)=>{setFrom(dates.from);setTo(dates.to);if(field==='from')setFrom(value);else setTo(value);setPreset('custom')}
  return <AdminLayout active="reports" title="Reports and analytics" sub="Payment-date report · Asia/Manila" right={<div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={!report} onClick={()=>{if(report)exportReport(report)}}>Export CSV</Button><Button disabled={!report} onClick={()=>{if(report){try{printReport(report)}catch(e){toast((e as Error).message,'warn')}}}}>Print / Save as PDF</Button></div>}>
    <Card className="mb-5 p-5">
      <div className="mb-4 flex flex-wrap gap-2">{[['today','Today'],['week','Last 7 Days'],['month','This Month'],['custom','Custom']].map(([key,label])=><button key={key} aria-pressed={preset===key} onClick={()=>{if(key==='custom'){setFrom(dates.from);setTo(dates.to)}setPreset(key)}} className={`rounded-lg border px-4 py-2 text-sm ${preset===key?'border-brand bg-brand-50 text-brand':'border-line'}`}>{label}</button>)}</div>
      <div className="flex flex-wrap gap-4"><label>From<input aria-label="Report start date" type="date" value={dates.from} onChange={e=>setCustom('from',e.target.value)} className="mt-2 block rounded-lg border border-line p-2" /></label><label>Through<input aria-label="Report end date" type="date" value={dates.to} onChange={e=>setCustom('to',e.target.value)} className="mt-2 block rounded-lg border border-line p-2" /></label></div>
      {error&&<p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
      {report&&<><p className="mt-3 text-sm text-muted">{report.policy}</p><p className="mt-2 text-xs text-muted">Generated {fmtLong(report.generatedAt)} · Asia/Manila</p>{report.estimatedRecords>0&&<p role="note" className="mt-3 rounded-lg bg-warn-50 p-3 text-sm text-warn">{report.estimatedRecords} payment record(s) use estimated checkout times because their exact payment times are unavailable.</p>}</>}
    </Card>
    {report&&<>
      <h2 className="mb-3 text-lg">Selected period: {report.from} through {report.to}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Gross payments',report.totals.gross],['Voided amount',report.totals.voids],['Refunded amount',report.totals.refunds],['Net collected',report.totals.net]].map(([label,value])=><Stat key={String(label)} label={String(label)} value={fmtPHP(Number(value),true)} note="Selected payments · current corrections" />)}</div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Payment records" value={report.paymentRecords} note={`Includes ${report.voidRecords} voided records`} /><Stat label="Net per payment record" value={fmtPHP(report.netPerRecord,true)} note="Net ÷ all selected payment records" /><Stat label="Cash / digital records" value={`${report.cashRecords} / ${report.digitalRecords}`} note="Includes voided records" /><Stat label="Completed parking sessions" value={report.completedSessions} note="Current completed status · by completion time" /></div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-5"><CardHead title="Category collections" sub="Payment records including voids · net after current corrections" /><p className="mt-3 text-xs text-muted sm:hidden">Swipe the table to see all columns.</p><div className="overflow-x-auto"><table className="mt-4 w-full min-w-[440px] text-left text-sm [&_th]:pr-4 [&_th]:pb-3 [&_td]:pr-4"><thead><tr><th>Category</th><th>Records</th><th>Net PHP</th><th>Avg minutes / record</th></tr></thead><tbody>{report.byCategory.map(g=><tr key={g.category} className="border-t border-line"><td className="py-3">{g.category}</td><td>{g.records}</td><td>{fmtPHP(g.net,true)}</td><td>{g.averageMinutes.toFixed(2)}</td></tr>)}</tbody></table></div></Card>
        <Card className="p-5"><CardHead title="Attendant collections" sub="Selected payment records · net after current corrections" /><table className="mt-4 w-full text-left text-sm"><thead><tr><th>Attendant</th><th>Records</th><th>Net PHP</th></tr></thead><tbody>{report.byAttendant.map(g=><tr key={g.attendant} className="border-t border-line"><td className="py-3">{g.attendant}</td><td>{g.records}</td><td>{fmtPHP(g.net,true)}</td></tr>)}{!report.byAttendant.length&&<tr><td colSpan={3} className="py-4 text-muted">No payments in this period.</td></tr>}</tbody></table></Card>
      </div>
      <Card className="mt-5 p-5"><CardHead title="Activity and exceptions in selected dates" sub="Arrivals use entry time; closures use closure time; corrections belong to selected payments." /><div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">{[['Arrivals',report.arrivals],['Administrative closures',report.closures.length],['Uncollected at closure',fmtPHP(report.uncollected,true)],['Refund entries',report.refundRecords],['Non-void lost-ticket payments',report.lostTickets],['Lost-fee component before refunds',fmtPHP(report.lostFees,true)]].map(([label,value])=><div key={String(label)}><div className="text-xs text-muted">{label}</div><div className="mt-2 text-xl">{value}</div></div>)}</div><p className="mt-4 text-xs text-muted">Completed-session counts reflect current status. Reopened sessions are excluded until completed again; a financial void alone does not reopen a session.</p></Card>
      <Card className="mt-5 p-5"><CardHead title="Live occupancy — not selected-period totals" sub={`As of ${fmtLong(report.live.asOf)} · Asia/Manila`} right={<Badge>Live</Badge>} /><p className="mt-4">{report.live.occupied} occupied · {report.live.claimed} claimed · {report.live.total} total spaces · {report.live.overdue} overdue active sessions now</p></Card>
    </>}
  </AdminLayout>
}
