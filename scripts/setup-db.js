// scripts/setup-db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/naga_smart_park',
});

async function setup() {
  const client = await pool.connect();
  try {
    console.log('Connecting to PostgreSQL database...');
    await client.query('BEGIN');

    // 1. Create tables
    console.log('Creating tables...');
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

    // 2. Seed Rates
    console.log('Seeding rates...');
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

    // 3. Seed 60 Parking Spots (Block A: Motorcycle 1-20, Block B: Car 1-20, Block C: Van 1-10 & Other 11-20)
    console.log('Seeding spots...');
    for (let i = 1; i <= 20; i++) {
      const numStr = String(i).padStart(2, '0');
      // Block A
      await client.query(`
        INSERT INTO spots (spot_number, block, slot_number, vehicle_type, status, reason)
        VALUES ($1, 'A', $2, 'Motorcycle', 'available', 'Eligible for assignment')
        ON CONFLICT (spot_number) DO NOTHING;
      `, [`A${numStr}`, i]);

      // Block B
      await client.query(`
        INSERT INTO spots (spot_number, block, slot_number, vehicle_type, status, reason)
        VALUES ($1, 'B', $2, 'Car', 'available', 'Eligible for assignment')
        ON CONFLICT (spot_number) DO NOTHING;
      `, [`B${numStr}`, i]);

      // Block C
      const catC = i <= 10 ? 'Van' : 'Other';
      await client.query(`
        INSERT INTO spots (spot_number, block, slot_number, vehicle_type, status, reason)
        VALUES ($1, 'C', $2, $3, 'available', 'Eligible for assignment')
        ON CONFLICT (spot_number) DO NOTHING;
      `, [`C${numStr}`, i, catC]);
    }

    // 4. Seed Attendants
    console.log('Seeding attendants...');
    const attendants = [
      ['ATT-001', 'Maria Santos', 'maria.santos@nsp.gov', 'Lane A', 'Active'],
      ['ATT-002', 'Joel Reyes', 'joel.reyes@nsp.gov', 'Lane B', 'On break'],
      ['ATT-003', 'Ana Cruz', 'ana.cruz@nsp.gov', 'Lane A', 'Offline'],
      ['ATT-004', 'Mark Dela Cruz', 'mark.dela.cruz@nsp.gov', 'Lane B', 'Pending'],
    ];

    for (const a of attendants) {
      await client.query(`
        INSERT INTO attendants (id, name, email, lane, status)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO NOTHING;
      `, a);
    }

    await client.query('COMMIT');
    console.log('✅ Naga Smart Park database setup completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Database setup error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

setup();
