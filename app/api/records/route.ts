import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET() {
  try {
    // 1. Fetch all spots
    const spotsRes = await pool.query(`
      SELECT 
        id, 
        spot_number, 
        block, 
        slot_number, 
        vehicle_type as category, 
        status, 
        reason 
      FROM spots 
      ORDER BY block ASC, slot_number ASC
    `);

    const spots = spotsRes.rows;
    const totalSlots = spots.length;
    const occupiedSlots = spots.filter((s: any) => s.status === 'occupied').length;
    const reservedSlots = spots.filter((s: any) => s.status === 'reserved').length;
    const unavailableSlots = spots.filter((s: any) => s.status === 'unavailable').length;
    const freeSlots = totalSlots - occupiedSlots - reservedSlots - unavailableSlots;

    // 2. Count total vehicles entered
    const sessionsRes = await pool.query('SELECT COUNT(*) as total FROM sessions');
    const totalVehiclesEntered = parseInt(sessionsRes.rows[0]?.total || '0', 10);

    // 3. Active sessions count
    const activeRes = await pool.query("SELECT COUNT(*) as active FROM sessions WHERE status = 'active'");
    const activeSessionsCount = parseInt(activeRes.rows[0]?.active || '0', 10);

    // 4. Completed sessions count
    const completedRes = await pool.query("SELECT COUNT(*) as completed FROM sessions WHERE status = 'completed'");
    const completedCount = parseInt(completedRes.rows[0]?.completed || '0', 10);

    // 5. Total revenue
    const revenueRes = await pool.query('SELECT COALESCE(SUM(amount_paid), 0) as total_revenue FROM transactions');
    const totalRevenue = parseFloat(revenueRes.rows[0]?.total_revenue || '0').toFixed(2);

    // 6. Payments / transactions list
    const paymentsRes = await pool.query(`
      SELECT 
        t.id,
        t.transaction_id,
        t.ticket_id,
        t.amount_due,
        t.amount_paid,
        t.change_amount,
        t.payment_method,
        t.attendant_name,
        t.duration_mins,
        t.created_at,
        s.vehicle_category,
        sp.spot_number
      FROM transactions t
      LEFT JOIN sessions s ON t.session_id = s.id
      LEFT JOIN spots sp ON s.spot_id = sp.id
      ORDER BY t.created_at DESC
      LIMIT 100
    `);

    // 7. Active sessions detail
    const activeSessionsRes = await pool.query(`
      SELECT 
        s.id,
        s.ticket_id as "ticketId",
        s.vehicle_category as category,
        s.time_in,
        s.status,
        sp.spot_number as "slotId",
        r.initial_fee,
        r.initial_duration_mins,
        r.additional_increment_mins,
        r.additional_rate
      FROM sessions s
      JOIN spots sp ON s.spot_id = sp.id
      JOIN rates r ON s.rate_id = r.id
      WHERE s.status = 'active'
      ORDER BY s.time_in DESC
    `);

    return NextResponse.json({
      success: true,
      stats: {
        totalSlots,
        freeSlots,
        occupiedSlots,
        reservedSlots,
        unavailableSlots,
        totalVehiclesEntered,
        activeSessions: activeSessionsCount,
        completedSessions: completedCount,
        totalRevenue,
      },
      spots: spots.map((s: any) => ({
        id: s.spot_number,
        block: s.block,
        number: s.slot_number,
        category: s.category,
        status: s.status,
        reason: s.reason,
      })),
      payments: paymentsRes.rows,
      activeSessions: activeSessionsRes.rows.map((s: any) => ({
        id: s.ticketId,
        ticketId: s.ticketId,
        category: s.category,
        slotId: s.slotId,
        entry: new Date(s.time_in).getTime(),
        status: s.status,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
