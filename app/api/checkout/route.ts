import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get('ticket_id');

  if (!rawId || rawId === 'undefined') {
    return NextResponse.json({ success: false, status: 'invalid', error: 'Ticket ID is required' }, { status: 400 });
  }

  // Normalize query: trim whitespace and handle QR- prefixes
  const ticketId = rawId.trim();
  const strippedId = ticketId.replace(/^QR-/, '');

  try {
    const query = `
      SELECT 
        s.id,
        s.ticket_id,
        s.qr_code,
        s.spot_id,
        s.rate_id,
        s.vehicle_category,
        s.time_in,
        s.time_out,
        s.status,
        sp.spot_number,
        sp.block,
        sp.slot_number,
        r.initial_fee,
        r.initial_duration_mins,
        r.additional_increment_mins,
        r.additional_rate,
        r.grace_period_mins,
        r.version as rate_version
      FROM sessions s
      JOIN spots sp ON s.spot_id = sp.id
      JOIN rates r ON s.rate_id = r.id
      WHERE s.ticket_id = $1 OR s.ticket_id = $2 OR s.qr_code = $1 OR s.qr_code = $2
      ORDER BY s.id DESC
      LIMIT 1
    `;
    const result = await pool.query(query, [ticketId, strippedId]);

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, status: 'invalid', error: 'Active ticket not found' }, { status: 404 });
    }

    const session = result.rows[0];

    // If ticket was already completed / paid
    if (session.status === 'completed') {
      return NextResponse.json({
        success: true,
        status: 'paid',
        error: 'Ticket already paid and completed',
        session: {
          id: session.id,
          ticketId: session.ticket_id,
          slotId: session.spot_number,
          category: session.vehicle_category,
          entry: new Date(session.time_in).getTime(),
          exit: session.time_out ? new Date(session.time_out).getTime() : Date.now(),
          status: 'completed',
        },
      });
    }

    // Compute fee for active session
    const timeIn = new Date(session.time_in);
    const timeOut = new Date();
    const durationMins = Math.max(1, Math.ceil((timeOut.getTime() - timeIn.getTime()) / (1000 * 60)));
    const initialDuration = parseInt(session.initial_duration_mins, 10);
    const incrementMins = parseInt(session.additional_increment_mins, 10);
    const initialFee = parseFloat(session.initial_fee);
    const additionalRate = parseFloat(session.additional_rate);
    const graceMins = parseInt(session.grace_period_mins || '0', 10);

    let amountDue = initialFee;
    let extraMins = 0;
    let increments = 0;

    if (durationMins > initialDuration) {
      extraMins = durationMins - initialDuration;
      increments = Math.ceil(extraMins / incrementMins);
      amountDue += increments * additionalRate;
    }

    const quote = {
      minutes: durationMins,
      initialFee,
      additionalFee: increments * additionalRate,
      increments,
      total: amountDue,
      amount_due: amountDue.toFixed(2),
    };

    return NextResponse.json({
      success: true,
      status: 'found',
      session: {
        id: session.id,
        ticketId: session.ticket_id,
        qrCode: session.qr_code,
        slotId: session.spot_number,
        category: session.vehicle_category,
        entry: timeIn.getTime(),
        rateVersion: session.rate_version,
        rate: {
          initial: initialFee,
          initialMin: initialDuration,
          incrementMin: incrementMins,
          additional: additionalRate,
        },
        grace: graceMins,
        status: 'active',
      },
      quote,
      // Backward compatibility fields for smart_parking_system components
      id: session.id,
      ticket_id: session.ticket_id,
      spot_number: session.spot_number,
      vehicle_category: session.vehicle_category,
      time_in: session.time_in,
      duration_mins: durationMins,
      amount_due: amountDue.toFixed(2),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, status: 'error', error: err.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  let client;
  try {
    const body = await request.json();
    // Accept either session_id or ticket_id
    const sessionId = body.session_id;
    const ticketId = body.ticket_id;
    const amountPaid = body.amount_paid !== undefined ? parseFloat(body.amount_paid) : (body.tender !== undefined ? parseFloat(body.tender) : null);
    const paymentMethod = body.payment_method || body.method || 'Cash';
    const attendantName = body.attendant_name || body.attendant || 'Maria Santos';

    if (!sessionId && !ticketId) {
      return NextResponse.json({ success: false, error: 'Session ID or Ticket ID is required' }, { status: 400 });
    }

    client = await pool.connect();

    const sessionQuery = `
      SELECT 
        s.*, 
        sp.spot_number, 
        r.initial_fee, 
        r.initial_duration_mins, 
        r.additional_increment_mins, 
        r.additional_rate
      FROM sessions s
      JOIN spots sp ON s.spot_id = sp.id
      JOIN rates r ON s.rate_id = r.id
      WHERE (s.id = $1 OR s.ticket_id = $2 OR s.ticket_id = $3) AND s.status = 'active'
    `;
    const sessionResult = await client.query(sessionQuery, [sessionId || -1, ticketId || '', (ticketId || '').replace(/^QR-/, '')]);

    if (sessionResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Active session not found' }, { status: 404 });
    }

    const session = sessionResult.rows[0];
    const timeIn = new Date(session.time_in);
    const timeOut = new Date();
    const diffMins = Math.max(1, Math.ceil((timeOut.getTime() - timeIn.getTime()) / (1000 * 60)));
    const initialDuration = parseInt(session.initial_duration_mins, 10);
    const incrementMins = parseInt(session.additional_increment_mins, 10);
    const initialFee = parseFloat(session.initial_fee);
    const additionalRate = parseFloat(session.additional_rate);

    let amountDue = initialFee;
    if (diffMins > initialDuration) {
      const extraMins = diffMins - initialDuration;
      const increments = Math.ceil(extraMins / incrementMins);
      amountDue += increments * additionalRate;
    }

    const paid = amountPaid !== null ? amountPaid : amountDue;
    const change = Math.max(0, paid - amountDue);
    const transactionId = `TXN-${Math.floor(100000 + Math.random() * 900000)}`;

    await client.query('BEGIN');

    // 1. Mark session completed
    await client.query(
      `UPDATE sessions SET time_out = CURRENT_TIMESTAMP, status = 'completed' WHERE id = $1`,
      [session.id]
    );

    // 2. Free parking spot
    await client.query(
      `UPDATE spots SET status = 'available', reason = 'Eligible for assignment' WHERE id = $1`,
      [session.spot_id]
    );

    // 3. Record transaction
    const txResult = await client.query(
      `INSERT INTO transactions 
        (session_id, ticket_id, transaction_id, amount_due, amount_paid, change_amount, payment_method, attendant_name, duration_mins)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [session.id, session.ticket_id, transactionId, amountDue, paid, change, paymentMethod, attendantName, diffMins]
    );

    await client.query('COMMIT');

    const tx = txResult.rows[0];

    return NextResponse.json({
      success: true,
      transaction: {
        id: tx.transaction_id,
        transactionId: tx.transaction_id,
        ticketId: session.ticket_id,
        category: session.vehicle_category,
        slotId: session.spot_number,
        entry: timeIn.getTime(),
        exit: timeOut.getTime(),
        minutes: diffMins,
        amount: amountDue,
        amount_due: amountDue,
        amount_paid: paid,
        change,
        change_amount: change.toFixed(2),
        method: paymentMethod,
        payment_method: paymentMethod,
        tender: paid,
        attendant: attendantName,
        attendant_name: attendantName,
        created_at: tx.created_at,
      },
      amount_due: amountDue,
      change_amount: change.toFixed(2),
    });
  } catch (err: any) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
