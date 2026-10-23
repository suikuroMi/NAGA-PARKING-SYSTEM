import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function POST(request: Request) {
  let client;
  try {
    const body = await request.json();
    // Accept either vehicle_type or category to bridge the naming mismatch
    const vehicleType = body.vehicle_type || body.category;

    if (!vehicleType) {
      return NextResponse.json({ success: false, error: 'Vehicle type or category is required.' }, { status: 400 });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    // 1. Find an available spot for this vehicle type (ordered by block & slot_number)
    const spotRes = await client.query(
      `SELECT id, spot_number, block, slot_number, vehicle_type 
       FROM spots 
       WHERE vehicle_type = $1 AND status = 'available' 
       ORDER BY block ASC, slot_number ASC 
       LIMIT 1 FOR UPDATE`,
      [vehicleType]
    );

    if (spotRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ success: false, error: `Parking full for category: ${vehicleType}` }, { status: 400 });
    }

    const spot = spotRes.rows[0];

    // 2. Get rates for this vehicle category
    const rateRes = await client.query(
      `SELECT * FROM rates WHERE vehicle_category = $1 LIMIT 1`,
      [vehicleType]
    );

    if (rateRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ success: false, error: `Rate configuration not found for category: ${vehicleType}` }, { status: 400 });
    }

    const rate = rateRes.rows[0];

    // 3. Generate ticket and QR code (Naga format)
    const timestamp = Date.now();
    const seq = Math.floor(1000 + Math.random() * 9000);
    const ticket_id = `NSP-26-${seq}`;
    const qr_code = `QR-${ticket_id}`;

    // 4. Create active session
    const sessionRes = await client.query(
      `INSERT INTO sessions (spot_id, rate_id, ticket_id, qr_code, vehicle_category, status, time_in) 
       VALUES ($1, $2, $3, $4, $5, 'active', CURRENT_TIMESTAMP) 
       RETURNING id, time_in`,
      [spot.id, rate.id, ticket_id, qr_code, vehicleType]
    );

    // 5. Update spot status to occupied
    await client.query(
      `UPDATE spots SET status = 'occupied', reason = 'Active-session lock' WHERE id = $1`,
      [spot.id]
    );

    await client.query('COMMIT');

    const entryTime = new Date(sessionRes.rows[0].time_in).getTime();

    return NextResponse.json({
      success: true,
      ticket: {
        ticket_id,
        qr_code,
      },
      spot_number: spot.spot_number,
      session: {
        id: sessionRes.rows[0].id,
        ticketId: ticket_id,
        category: vehicleType,
        slotId: spot.spot_number,
        entry: entryTime,
        rateVersion: rate.version || 'v2026.10.16',
        rate: {
          initial: parseFloat(rate.initial_fee),
          initialMin: parseInt(rate.initial_duration_mins, 10),
          incrementMin: parseInt(rate.additional_increment_mins, 10),
          additional: parseFloat(rate.additional_rate),
        },
        grace: parseInt(rate.grace_period_mins || '0', 10),
        status: 'active',
      },
      spot: {
        id: spot.spot_number,
        block: spot.block,
        number: spot.slot_number,
        category: spot.vehicle_type,
        status: 'occupied',
      },
    });
  } catch (err: any) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    return NextResponse.json({ success: false, error: err.message || 'Database error occurred' }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
