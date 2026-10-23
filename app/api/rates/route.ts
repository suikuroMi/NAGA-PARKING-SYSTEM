import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET() {
  try {
    const res = await pool.query('SELECT * FROM rates ORDER BY id ASC');
    const categories: Record<string, any> = {};
    let version = 'v2026.10.16';
    let grace = 0;

    for (const r of res.rows) {
      categories[r.vehicle_category] = {
        initial: parseFloat(r.initial_fee),
        initialMin: parseInt(r.initial_duration_mins, 10),
        incrementMin: parseInt(r.additional_increment_mins, 10),
        additional: parseFloat(r.additional_rate),
      };
      if (r.version) version = r.version;
      if (r.grace_period_mins !== undefined) grace = parseInt(r.grace_period_mins, 10);
    }

    return NextResponse.json({
      success: true,
      rates: {
        version,
        grace,
        categories,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  let client;
  try {
    const body = await request.json();
    const { categories, grace, version } = body;

    if (!categories) {
      return NextResponse.json({ success: false, error: 'Rates categories payload is required' }, { status: 400 });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    for (const [category, rate] of Object.entries(categories) as [string, any][]) {
      await client.query(
        `INSERT INTO rates (vehicle_category, initial_fee, initial_duration_mins, additional_increment_mins, additional_rate, grace_period_mins, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (vehicle_category) DO UPDATE SET
           initial_fee = EXCLUDED.initial_fee,
           initial_duration_mins = EXCLUDED.initial_duration_mins,
           additional_increment_mins = EXCLUDED.additional_increment_mins,
           additional_rate = EXCLUDED.additional_rate,
           grace_period_mins = EXCLUDED.grace_period_mins,
           version = EXCLUDED.version,
           effective_date = CURRENT_TIMESTAMP`,
        [
          category,
          rate.initial,
          rate.initialMin || 60,
          rate.incrementMin || 60,
          rate.additional,
          grace || 0,
          version || 'v2026.10.16',
        ]
      );
    }

    await client.query('COMMIT');
    return NextResponse.json({ success: true, message: 'Rates updated successfully' });
  } catch (err: any) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
