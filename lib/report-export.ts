import { type ReportSnapshot, TIME_SOURCE_LABEL } from '../store/reporting'
import { fmtLong } from './format'
import { downloadCsv, type CsvRow } from './csv'

export function reportSections(r:ReportSnapshot):{title:string;headers:string[];rows:CsvRow[]}[] {
  return [
    {title:'Payment-date totals',headers:['Measure','Value'],rows:[['Payment records (including voided)',r.paymentRecords],['Gross (PHP)',r.totals.gross],['Voids (PHP)',r.totals.voids],['Refunds (PHP)',r.totals.refunds],['Net (PHP)',r.totals.net],['Voided records',r.voidRecords],['Refund entries',r.refundRecords],['Cash payment records',r.cashRecords],['Digital payment records',r.digitalRecords],['Net per payment record (PHP)',Number(r.netPerRecord.toFixed(2))],['Estimated payment times',r.estimatedRecords],['Non-void lost-ticket payments',r.lostTickets],['Lost-ticket fee component before refunds (PHP)',r.lostFees]]},
    {title:'Activity in selected dates',headers:['Measure','Value'],rows:[['Arrivals by entry time',r.arrivals],['Sessions currently completed, by completion time',r.completedSessions],['Administrative closures by closure time',r.closures.length],['Uncollected at closure (PHP)',r.uncollected]]},
    {title:'Category collections',headers:['Category','Payment records','Net (PHP)','Average minutes per payment record'],rows:r.byCategory.map(g=>[g.category,g.records,g.net,Number(g.averageMinutes.toFixed(2))])},
    {title:'Attendant collections',headers:['Attendant','Payment records','Net (PHP)'],rows:r.byAttendant.map(g=>[g.attendant,g.records,g.net])},
    {title:'Payments in selected dates',headers:['Transaction','Ticket','Payment time (Asia/Manila)','Time source','Category','Method','Status','Gross (PHP)','Refunds (PHP)','Net (PHP)'],rows:r.payments.map(p=>[p.id,p.ticketId,fmtLong(p.paidAt),TIME_SOURCE_LABEL[p.timeSource],p.category,p.method,p.status,p.amount,p.refunds,p.net])},
    {title:'Administrative closures in selected dates',headers:['Ticket','Space','Closure time (Asia/Manila)','Reason','Uncollected (PHP)'],rows:r.closures.map(c=>[c.ticketId,c.slotId,fmtLong(c.at),c.reason,c.uncollected])},
    {title:'Live values at generation — not period totals',headers:['Measure','Value'],rows:[['As of (Asia/Manila)',fmtLong(r.live.asOf)],['Occupied spaces',r.live.occupied],['Claimed spaces',r.live.claimed],['Total spaces',r.live.total],['Overdue active sessions now',r.live.overdue]]},
  ]
}
export function reportRows(r:ReportSnapshot):CsvRow[] {
  return [['Naga Smart Park — payment-date report'],['From',r.from,'Through',r.to],['Timezone',r.timezone],['Generated at',new Date(r.generatedAt).toISOString()],['Reporting policy',r.policy],...reportSections(r).flatMap(s=>[[],[s.title],s.headers,...s.rows])]
}
export function exportReport(r:ReportSnapshot) {const snapshot=structuredClone(r);downloadCsv(`nsp-report-${snapshot.from}-to-${snapshot.to}.csv`,reportRows(snapshot))}
export function printReport(r:ReportSnapshot) {
  const snapshot=structuredClone(r),popup=window.open('','_blank')
  if(!popup)throw new Error('Allow pop-ups to open the report preview.')
  popup.opener=null;const doc=popup.document;doc.title=`Parking report ${snapshot.from} to ${snapshot.to}`
  const style=doc.createElement('style');style.textContent='@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#111;background:white;margin:24px}h1{font-size:22px}h2{font-size:16px;margin:22px 0 8px;break-after:avoid}p{line-height:1.5}table{width:100%;border-collapse:collapse;margin-bottom:18px;table-layout:fixed}th,td{padding:6px;border:1px solid #bbb;text-align:left;overflow-wrap:anywhere;font-size:10px;vertical-align:top}th{background:#eee}thead{display:table-header-group}tr{break-inside:avoid}button{padding:12px 20px;margin:12px 0}@media print{button{display:none}body{margin:0}h1{font-size:18px}}';doc.head.append(style)
  const add=(tag:string,text:string)=>{const node=doc.createElement(tag);node.textContent=text;doc.body.append(node);return node}
  add('h1','Naga Smart Park — Payment-date report');add('p',`${snapshot.from} through ${snapshot.to} · Asia/Manila · Generated ${fmtLong(snapshot.generatedAt)}`);add('p',snapshot.policy)
  add('p',`${snapshot.estimatedRecords} payment record(s) use an estimated checkout-time fallback. Completed sessions reflect their current status; reopened sessions are excluded until completed again.`)
  const button=add('button','Print / Save as PDF');button.onclick=()=>popup.print()
  for(const section of reportSections(snapshot)){
    add('h2',section.title);const table=doc.createElement('table'),head=doc.createElement('thead'),row=doc.createElement('tr');
    for(const label of section.headers){const th=doc.createElement('th');th.textContent=label;row.append(th)}head.append(row);table.append(head)
    const body=doc.createElement('tbody');for(const values of section.rows){const tr=doc.createElement('tr');for(const value of values){const td=doc.createElement('td');td.textContent=String(value);tr.append(td)}body.append(tr)}
    if(!section.rows.length){const tr=doc.createElement('tr'),td=doc.createElement('td');td.colSpan=section.headers.length;td.textContent='No records in this period.';tr.append(td);body.append(tr)}table.append(body);doc.body.append(table)
  }
}
