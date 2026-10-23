import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET() {
  try {
    const res = await pool.query(`
      SELECT 
        id, 
        spot_number, 
        block, 
        slot_number as number, 
        vehicle_type as category, 
        status, 
        reason 
      FROM spots 
      ORDER BY block ASC, slot_number ASC
    `);

    const formatted = res.rows.map((r: any) => ({
      id: r.spot_number,
      dbId: r.id,
      block: r.block,
      number: r.number,
      category: r.category,
      status: r.status,
      reason: r.reason,
    }));

    return NextResponse.json({ success: true, slots: formatted });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, status, category, reason } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Slot ID is required' }, { status: 400 });
    }

    const res = await pool.query(
      `UPDATE spots 
       SET status = COALESCE($1, status),
           vehicle_type = COALESCE($2, vehicle_type),
           reason = COALESCE($3, reason)
       WHERE spot_number = $4
       RETURNING *`,
      [status, category, reason, id]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Slot not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, slot: res.rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
