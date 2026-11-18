/**
 * Printer integration point.
 *
 * The UI already calls `printTicket` (kiosk) and `printReceipt` (exit receipt,
 * paid-ticket reprint, admin reprint), awaits the result and shows `message`
 * in a toast. Replace the two function bodies below with your printer code
 * (e.g. a thermal printer SDK, a local print service, or ESC/POS over WebUSB).
 * Everything the slip needs is in the job payloads.
 */
import type { Category, DigitalProvider, Session, Slot } from '../store/types'
import { getState, quoteFor } from '../store/store'
import { slotLabel, txStatus } from '../store/logic'
import QR from 'qrcode'

export interface TicketPrintJob {
  ticketId: string
  /** Value to encode in the ticket QR (the exit terminal resolves it). */
  qrValue: string
  category: Category
  slotLabel: string
  entry: number
  facility: string
}

export interface ReceiptPrintJob {
  ticketId: string
  transactionId: string
  category: Category
  slotLabel: string
  entry: number
  exit: number
  minutes: number
  initial: number
  additional: number
  amount: number
  method: 'Cash' | 'Digital'
  provider?: DigitalProvider
  reference?: string
  tender: number
  change: number
  attendant: string
  rateVersion: string
  paidAt: number
  reprint: boolean
  lostTicketFee?: number
  /** Paid, Partially refunded, Refunded or Voided. */
  status: string
}

export type PrintResult = { ok: boolean; message: string }

const FACILITY = "Naga Smart Park · Naga City People's Mall"

export function ticketJob(session: Session, slot: Slot): TicketPrintJob {
  return { ticketId: session.ticketId, qrValue: session.ticketId, category: session.category, slotLabel: slotLabel(slot), entry: session.entry, facility: FACILITY }
}

export function receiptJob(session: Session, slot: Slot, reprint: boolean): ReceiptPrintJob {
  const p = session.payment!
  const tx = getState().transactions.find((x) => x.id === p.transactionId)
  const exit = session.exit!
  const q = quoteFor(session, exit)
  return {
    ticketId: session.ticketId,
    transactionId: p.transactionId,
    category: session.category,
    slotLabel: slotLabel(slot),
    entry: session.entry,
    exit,
    minutes: q.minutes,
    initial: q.initial,
    additional: q.additional,
    amount: p.amount,
    method: p.method,
    provider: p.provider,
    reference: p.reference,
    tender: p.tender,
    change: p.change,
    attendant: p.attendant,
    rateVersion: session.rateVersion,
    paidAt: p.paidAt,
    reprint,
    lostTicketFee: p.lostTicketFee,
    status: tx ? txStatus(tx) : 'Paid',
  }
}

const time = (value:number) => new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila'})
const money = (value:number) => `PHP ${value.toFixed(2)}`

async function preview(title:string,rows:[string,string][],qr?:string):Promise<PrintResult> {
  const popup=window.open('','_blank')
  if(!popup)return {ok:false,message:'Allow pop-ups to open the print preview.'}
  popup.opener=null
  const doc=popup.document
  doc.title=title
  const style=doc.createElement('style')
  style.textContent='body{font:14px Arial,sans-serif;color:#111;background:#fff;margin:24px auto;max-width:340px;padding:16px}h1{text-align:center;font-size:20px}p{text-align:center}dl{margin-top:24px}div.row{display:flex;justify-content:space-between;gap:12px;border-bottom:1px dashed #ccc;padding:9px 0}dt{flex-shrink:0}dd{margin:0;text-align:right;overflow-wrap:anywhere}img{display:block;margin:20px auto;width:224px;height:224px}button{display:block;width:100%;padding:14px;margin:24px 0;font-size:16px;cursor:pointer}@media print{button,.instructions{display:none}body{margin:0;max-width:72mm;padding:3mm;font-size:11px}img{width:52mm;height:52mm}@page{margin:8mm}}'
  doc.head.append(style)
  const heading=doc.createElement('h1');heading.textContent=title;doc.body.append(heading)
  const facility=doc.createElement('p');facility.textContent=FACILITY;doc.body.append(facility)
  if(qr) {const image=doc.createElement('img');image.alt='Parking ticket QR code';image.src=await QR.toDataURL(qr,{width:448,margin:2,errorCorrectionLevel:'M'});doc.body.append(image)}
  const list=doc.createElement('dl')
  for(const [label,value]of rows){const row=doc.createElement('div');row.className='row';const term=doc.createElement('dt');term.textContent=label;const detail=doc.createElement('dd');detail.textContent=value;row.append(term,detail);list.append(row)}
  doc.body.append(list)
  const button=doc.createElement('button');button.textContent='Print / Save as PDF';button.onclick=()=>popup.print();doc.body.append(button)
  const note=doc.createElement('p');note.className='instructions';note.textContent='Choose your printer or Save as PDF in the print dialog. Opening this preview does not confirm physical printing.';doc.body.append(note)
  return {ok:true,message:'Print preview opened. Choose Print / Save as PDF.'}
}

export async function printTicket(job:TicketPrintJob):Promise<PrintResult> {
  return preview('Parking entry ticket', [['Ticket',job.ticketId],['Vehicle',job.category],['Space',job.slotLabel],['Entered',time(job.entry)]],job.qrValue)
}

export async function printReceipt(job:ReceiptPrintJob):Promise<PrintResult> {
  return preview(job.reprint?'Parking receipt — REPRINT':'Parking receipt',[
    ['Receipt',job.transactionId],['Ticket',job.ticketId],['Status',job.status],['Vehicle',job.category],['Space',job.slotLabel],
    ['Entered',time(job.entry)],['Exited',time(job.exit)],['Duration',`${job.minutes} minutes`],['Parking',money(job.initial+job.additional)],
    ['Lost-ticket fee',money(job.lostTicketFee??0)],['Total recorded',money(job.amount)],['Method',job.provider??job.method],
    ...(job.reference?[['Reference',job.reference] as [string,string]]:[]),['Tender',money(job.tender)],['Change',money(job.change)],['Attendant',job.attendant],
  ])
}
