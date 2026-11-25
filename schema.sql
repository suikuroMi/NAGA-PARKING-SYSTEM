-- Naga Smart Park Database Schema

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

-- Seed Rates
INSERT INTO rates (vehicle_category, initial_fee, initial_duration_mins, additional_increment_mins, additional_rate, grace_period_mins, version)
VALUES
    ('Motorcycle', 20.00, 60, 60, 10.00, 0, 'v2026.10.16'),
    ('Car', 40.00, 60, 60, 20.00, 0, 'v2026.10.16'),
    ('Van', 50.00, 60, 60, 25.00, 0, 'v2026.10.16'),
    ('Other', 60.00, 60, 60, 30.00, 0, 'v2026.10.16')
ON CONFLICT (vehicle_category) DO NOTHING;

-- Seed Attendants
INSERT INTO attendants (id, name, email, lane, status)
VALUES
    ('ATT-001', 'Maria Santos', 'maria.santos@nsp.gov', 'Lane A', 'Active'),
    ('ATT-002', 'Joel Reyes', 'joel.reyes@nsp.gov', 'Lane B', 'On break'),
    ('ATT-003', 'Ana Cruz', 'ana.cruz@nsp.gov', 'Lane A', 'Offline'),
    ('ATT-004', 'Mark Dela Cruz', 'mark.dela.cruz@nsp.gov', 'Lane B', 'Pending')
ON CONFLICT (id) DO NOTHING;

-- Seed Settings
INSERT INTO settings (id, facility_name, operating_hours, support_phone, currency)
VALUES (1, 'Naga City People''s Mall', '24/7 Operations', '+63 54 473 1234', 'PHP')
ON CONFLICT (id) DO NOTHING;
