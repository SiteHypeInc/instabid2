-- Drop existing tables if they exist
DROP TABLE IF EXISTS estimates CASCADE;
DROP TABLE IF EXISTS regional_pricing CASCADE;

-- Create regional_pricing table
CREATE TABLE regional_pricing (
  state_code VARCHAR(2) PRIMARY KEY,
  state_name VARCHAR(50) NOT NULL,
  labor_rate DECIMAL(10,2) NOT NULL,
  material_multiplier DECIMAL(4,2) NOT NULL
);

-- Insert all 50 states regional pricing data
INSERT INTO regional_pricing (state_code, state_name, labor_rate, material_multiplier) VALUES
('AL', 'Alabama', 42.00, 0.88),
('AK', 'Alaska', 68.00, 1.45),
('AZ', 'Arizona', 48.00, 1.05),
('AR', 'Arkansas', 41.00, 0.86),
('CA', 'California', 75.00, 1.35),
('CO', 'Colorado', 54.00, 1.12),
('CT', 'Connecticut', 65.00, 1.28),
('DE', 'Delaware', 52.00, 1.08),
('FL', 'Florida', 46.00, 1.02),
('GA', 'Georgia', 44.00, 0.92),
('HI', 'Hawaii', 72.00, 1.55),
('ID', 'Idaho', 45.00, 0.94),
('IL', 'Illinois', 58.00, 1.15),
('IN', 'Indiana', 46.00, 0.93),
('IA', 'Iowa', 48.00, 0.91),
('KS', 'Kansas', 46.00, 0.89),
('KY', 'Kentucky', 43.00, 0.87),
('LA', 'Louisiana', 44.00, 0.91),
('ME', 'Maine', 50.00, 1.10),
('MD', 'Maryland', 56.00, 1.18),
('MA', 'Massachusetts', 68.00, 1.32),
('MI', 'Michigan', 51.00, 0.98),
('MN', 'Minnesota', 55.00, 1.08),
('MS', 'Mississippi', 40.00, 0.84),
('MO', 'Missouri', 47.00, 0.90),
('MT', 'Montana', 48.00, 1.06),
('NE', 'Nebraska', 47.00, 0.92),
('NV', 'Nevada', 52.00, 1.12),
('NH', 'New Hampshire', 54.00, 1.15),
('NJ', 'New Jersey', 66.00, 1.30),
('NM', 'New Mexico', 44.00, 0.93),
('NY', 'New York', 70.00, 1.32),
('NC', 'North Carolina', 45.00, 0.94),
('ND', 'North Dakota', 50.00, 1.05),
('OH', 'Ohio', 49.00, 0.95),
('OK', 'Oklahoma', 43.00, 0.88),
('OR', 'Oregon', 57.00, 1.18),
('PA', 'Pennsylvania', 54.00, 1.05),
('RI', 'Rhode Island', 62.00, 1.25),
('SC', 'South Carolina', 43.00, 0.91),
('SD', 'South Dakota', 46.00, 0.93),
('TN', 'Tennessee', 44.00, 0.89),
('TX', 'Texas', 47.00, 0.95),
('UT', 'Utah', 49.00, 1.03),
('VT', 'Vermont', 53.00, 1.14),
('VA', 'Virginia', 51.00, 1.08),
('WA', 'Washington', 60.00, 1.22),
('WV', 'West Virginia', 42.00, 0.88),
('WI', 'Wisconsin', 52.00, 1.00),
('WY', 'Wyoming', 49.00, 1.06);

-- Create estimates table
CREATE TABLE estimates (
  id SERIAL PRIMARY KEY,
  client_name VARCHAR(255) NOT NULL,
  client_email VARCHAR(255) NOT NULL,
  client_phone VARCHAR(50),
  address TEXT NOT NULL,
  state VARCHAR(50) NOT NULL,
  square_feet INTEGER NOT NULL,
  material VARCHAR(100) NOT NULL,
  pitch VARCHAR(50),
  stories INTEGER,
  tear_off VARCHAR(50),
  valleys INTEGER DEFAULT 0,
  chimneys INTEGER DEFAULT 0,
  skylights INTEGER DEFAULT 0,
  material_cost DECIMAL(10,2) NOT NULL,
  labor_cost DECIMAL(10,2) NOT NULL,
  total_cost DECIMAL(10,2) NOT NULL,
  labor_rate DECIMAL(10,2),
  material_rate DECIMAL(10,2),
  estimated_hours DECIMAL(10,2),
  timeline_days INTEGER,
  photo_urls TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_estimates_state ON estimates(state);
CREATE INDEX idx_estimates_created_at ON estimates(created_at DESC);
CREATE INDEX idx_regional_pricing_state_name ON regional_pricing(state_name);
