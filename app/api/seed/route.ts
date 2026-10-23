import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function POST() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create tables if not exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS rates (
          id SERIAL PRIMARY KEY,
          vehicle_category VARCHAR(50) UNIQUE NOT NULL,
          initial_fee DECIMAL(10,2) NOT NULL,
          initial_duration_mins INT NOT NULL,
          additional_increment_mins INT NOT NULL,
          additional_rate DECIMAL(10,2) NOT NULL,
          grace_period_mins INT DEFAULT 0,
          version VARCHAR(50) DEFAULT 'v2026.10.16',
          effective_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS spots (
          id SERIAL PRIMARY KEY,
          spot_number VARCHAR(20) UNIQUE NOT NULL,
          block VARCHAR(10) NOT NULL,
          slot_number INT NOT NULL,
          vehicle_type VARCHAR(50) NOT NULL,
          status VARCHAR(20) DEFAULT 'available',
          reason TEXT DEFAULT 'Eligible for assignment'
      );

      CREATE TABLE IF NOT EXISTS sessions (
          id SERIAL PRIMARY KEY,
          spot_id INT REFERENCES spots(id),
          rate_id INT REFERENCES rates(id),
          ticket_id VARCHAR(50) UNIQUE NOT NULL,
          qr_code VARCHAR(100) UNIQUE NOT NULL,
          vehicle_category VARCHAR(50) NOT NULL,
          time_in TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          time_out TIMESTAMP,
          status VARCHAR(20) DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS transactions (
          id SERIAL PRIMARY KEY,
          session_id INT REFERENCES sessions(id),
          ticket_id VARCHAR(50) NOT NULL,
          transaction_id VARCHAR(50) UNIQUE NOT NULL,
          amount_due DECIMAL(10,2) NOT NULL,
          amount_paid DECIMAL(10,2) NOT NULL,
          change_amount DECIMAL(10,2) NOT NULL,
          payment_method VARCHAR(50) NOT NULL,
          attendant_name VARCHAR(100),
          duration_mins INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS attendants (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          email VARCHAR(100),
          lane VARCHAR(50),
          status VARCHAR(50) DEFAULT 'Active',
          last_access TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
          id SERIAL PRIMARY KEY,
          facility_name VARCHAR(100) DEFAULT 'Naga City People''s Mall',
          operating_hours VARCHAR(100) DEFAULT '24/7 Operations',
          support_phone VARCHAR(50) DEFAULT '+63 54 473 1234',
          currency VARCHAR(10) DEFAULT 'PHP',
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Insert or update default rates
    const rates = [
      ['Motorcycle', 20.00, 60, 60, 10.00, 0, 'v2026.10.16'],
      ['Car', 40.00, 60, 60, 20.00, 0, 'v2026.10.16'],
      ['Van', 50.00, 60, 60, 25.00, 0, 'v2026.10.16'],
      ['Other', 60.00, 60, 60, 30.00, 0, 'v2026.10.16'],
    ];

    for (const r of rates) {
      await client.query(`
        INSERT INTO rates (vehicle_category, initial_fee, initial_duration_mins, additional_increment_mins, additional_rate, grace_period_mins, version)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (vehicle_category) DO UPDATE SET
          initial_fee = EXCLUDED.initial_fee,
          initial_duration_mins = EXCLUDED.initial_duration_mins,
          additional_increment_mins = EXCLUDED.additional_increment_mins,
          additional_rate = EXCLUDED.additional_rate;
      `, r);
    }

    // 3. Seed 60 Spots
    for (let i = 1; i <= 20; i++) {
      const numStr = String(i).padStart(2, '0');
      await client.query(`
        INSERT INTO spots (spot_number, block, slot_number, vehicle_type, status, reason)
        VALUES ($1, 'A', $2, 'Motorcycle', 'available', 'Eligible for assignment')
        ON CONFLICT (spot_number) DO NOTHING;
      `, [`A${numStr}`, i]);

      await client.query(`
        INSERT INTO spots (spot_number, block, slot_number, vehicle_type, status, reason)
        VALUES ($1, 'B', $2, 'Car', 'available', 'Eligible for assignment')
        ON CONFLICT (spot_number) DO NOTHING;
      `, [`B${numStr}`, i]);

      const catC = i <= 10 ? 'Van' : 'Other';
      await client.query(`
        INSERT INTO spots (spot_number, block, slot_number, vehicle_type, status, reason)
        VALUES ($1, 'C', $2, $3, 'available', 'Eligible for assignment')
        ON CONFLICT (spot_number) DO NOTHING;
      `, [`C${numStr}`, i, catC]);
    }

    await client.query('COMMIT');
    return NextResponse.json({ success: true, message: 'Database seeded successfully' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}
