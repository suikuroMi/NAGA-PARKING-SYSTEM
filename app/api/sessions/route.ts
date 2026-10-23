import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status');

  try {
    let query = `
      SELECT 
        s.id,
        s.ticket_id as "ticketId",
        s.vehicle_category as category,
        s.time_in,
        s.time_out,
        s.status,
        sp.spot_number as "slotId",
        t.transaction_id,
        t.amount_due,
        t.amount_paid,
        t.payment_method,
        t.attendant_name
      FROM sessions s
      LEFT JOIN spots sp ON s.spot_id = sp.id
      LEFT JOIN transactions t ON t.session_id = s.id
    `;

    const params: any[] = [];
    if (statusFilter) {
      query += ` WHERE s.status = $1`;
      params.push(statusFilter);
    }

    query += ` ORDER BY s.time_in DESC LIMIT 200`;

    const res = await pool.query(query, params);

    const formatted = res.rows.map((r: any) => ({
      ticketId: r.ticketId,
      category: r.category,
      slotId: r.slotId,
      entry: new Date(r.time_in).getTime(),
      exit: r.time_out ? new Date(r.time_out).getTime() : undefined,
      status: r.status,
      payment: r.amount_paid
        ? {
            amount: parseFloat(r.amount_due || r.amount_paid),
            tender: parseFloat(r.amount_paid),
            method: r.payment_method || 'Cash',
            attendant: r.attendant_name || 'Maria Santos',
            transactionId: r.transaction_id,
          }
        : undefined,
    }));

    return NextResponse.json({ success: true, sessions: formatted });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
