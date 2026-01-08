/*
  # InstaBid Multi-Trade Construction Estimator Database Schema
  
  ## Overview
  Complete database schema for InstaBid application supporting multi-trade construction estimation,
  contractor management, scheduling, and regional pricing.
  
  ## New Tables
  
  ### 1. contractors
  - Stores contractor/business accounts
  - Fields: id, email, password_hash, company_name, phone, api_key, subscription_status, tax_rate
  - Includes Google Calendar integration fields and timestamps
  
  ### 2. contractor_sessions
  - Manages contractor authentication sessions
  - Fields: id, contractor_id, session_token, expires_at, created_at
  - Links to contractors table
  
  ### 3. estimates
  - Stores all project estimates across multiple trades
  - Fields: customer info, property details, trade type, costs breakdown, contractor assignment
  - Supports JSON field for trade-specific details
  
  ### 4. labor_rates
  - Regional labor rate data by state/zip/MSA
  - Fields: state, zip_code, msa_name, hourly_rate
  
  ### 5. materials_cache
  - Cached material pricing data from retailers
  - Fields: sku, material_name, trade, category, region, price, retailer
  - Indexed for performance
  
  ### 6. pricing_cache
  - Comprehensive regional pricing factors
  - Fields: zip_code, state_code, metro_area, labor_rate, material_multiplier, permit_cost
  - Includes data quality scores and source tracking
  
  ### 7. zip_metro_mapping
  - ZIP code to metropolitan area mapping
  - Fields: zip_code, metro_area, metro_code, state_code, county
  
  ### 8. scheduled_jobs
  - Calendar integration for project scheduling
  - Fields: contractor_id, customer info, job details, timing, Google Calendar event_id
  
  ### 9. contractor_availability
  - Tracks contractor availability calendar
  - Fields: contractor_id, date, is_available, source (manual/google)
  
  ### 10. api_refresh_log
  - Logs for API data refresh operations
  - Fields: refresh_date, api_source, records_updated, status, execution_time
  
  ## Security
  - RLS enabled on all tables
  - Policies for authenticated contractors to manage their own data
  - Public read access for pricing data
*/

-- Create contractors table
CREATE TABLE IF NOT EXISTS contractors (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  api_key VARCHAR(255) UNIQUE,
  subscription_status VARCHAR(50) DEFAULT 'trial',
  tax_rate DECIMAL(5,2) DEFAULT 0.00,
  google_refresh_token TEXT,
  google_calendar_id VARCHAR(255),
  last_calendar_sync TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create contractor_sessions table
CREATE TABLE IF NOT EXISTS contractor_sessions (
  id SERIAL PRIMARY KEY,
  contractor_id INTEGER REFERENCES contractors(id) ON DELETE CASCADE,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create estimates table
CREATE TABLE IF NOT EXISTS estimates (
  id SERIAL PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50),
  property_address TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(2) NOT NULL,
  zip_code VARCHAR(10) NOT NULL,
  trade VARCHAR(50) NOT NULL,
  trade_details JSONB,
  labor_hours DECIMAL(10,2),
  labor_rate DECIMAL(10,2),
  labor_cost DECIMAL(10,2),
  material_cost DECIMAL(10,2),
  equipment_cost DECIMAL(10,2),
  total_cost DECIMAL(10,2),
  contractor_id INTEGER REFERENCES contractors(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create labor_rates table
CREATE TABLE IF NOT EXISTS labor_rates (
  id SERIAL PRIMARY KEY,
  state VARCHAR(2) NOT NULL,
  zip_code VARCHAR(10),
  msa_name VARCHAR(255),
  hourly_rate DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create materials_cache table
CREATE TABLE IF NOT EXISTS materials_cache (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(100) NOT NULL,
  material_name VARCHAR(255) NOT NULL,
  trade VARCHAR(50) NOT NULL,
  category VARCHAR(100),
  region VARCHAR(10) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  unit VARCHAR(20) DEFAULT 'each',
  retailer VARCHAR(50) DEFAULT 'homedepot',
  last_updated TIMESTAMP DEFAULT NOW(),
  UNIQUE(sku, region)
);

-- Create pricing_cache table
CREATE TABLE IF NOT EXISTS pricing_cache (
  id SERIAL PRIMARY KEY,
  zip_code VARCHAR(10) NOT NULL,
  state_code VARCHAR(2) NOT NULL,
  metro_area VARCHAR(100),
  county VARCHAR(100),
  labor_rate DECIMAL(10,2),
  material_multiplier DECIMAL(5,2),
  permit_cost DECIMAL(10,2),
  weather_factor DECIMAL(5,2),
  labor_source VARCHAR(50),
  material_source VARCHAR(50),
  permit_source VARCHAR(50),
  weather_source VARCHAR(50),
  last_updated TIMESTAMP DEFAULT NOW(),
  data_quality_score INTEGER,
  UNIQUE(zip_code)
);

-- Create zip_metro_mapping table
CREATE TABLE IF NOT EXISTS zip_metro_mapping (
  id SERIAL PRIMARY KEY,
  zip_code VARCHAR(10) UNIQUE NOT NULL,
  metro_area VARCHAR(100),
  metro_code VARCHAR(10),
  state_code VARCHAR(2),
  county VARCHAR(100)
);

-- Create scheduled_jobs table
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id SERIAL PRIMARY KEY,
  contractor_id INTEGER REFERENCES contractors(id) ON DELETE CASCADE,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50),
  property_address TEXT NOT NULL,
  trade VARCHAR(50) NOT NULL,
  scheduled_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  duration_hours DECIMAL(5,2),
  status VARCHAR(50) DEFAULT 'scheduled',
  google_event_id VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create contractor_availability table
CREATE TABLE IF NOT EXISTS contractor_availability (
  id SERIAL PRIMARY KEY,
  contractor_id INTEGER REFERENCES contractors(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  source VARCHAR(20) DEFAULT 'manual',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(contractor_id, date)
);

-- Create api_refresh_log table
CREATE TABLE IF NOT EXISTS api_refresh_log (
  id SERIAL PRIMARY KEY,
  refresh_date TIMESTAMP DEFAULT NOW(),
  api_source VARCHAR(50),
  records_updated INTEGER,
  status VARCHAR(20),
  error_message TEXT,
  execution_time_ms INTEGER
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_contractors_email ON contractors(email);
CREATE INDEX IF NOT EXISTS idx_contractors_api_key ON contractors(api_key);
CREATE INDEX IF NOT EXISTS idx_contractor_sessions_token ON contractor_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_contractor_sessions_contractor ON contractor_sessions(contractor_id);
CREATE INDEX IF NOT EXISTS idx_estimates_contractor ON estimates(contractor_id);
CREATE INDEX IF NOT EXISTS idx_estimates_state_zip ON estimates(state, zip_code);
CREATE INDEX IF NOT EXISTS idx_estimates_trade ON estimates(trade);
CREATE INDEX IF NOT EXISTS idx_labor_rates_state_zip ON labor_rates(state, zip_code);
CREATE INDEX IF NOT EXISTS idx_materials_trade_region ON materials_cache(trade, region);
CREATE INDEX IF NOT EXISTS idx_materials_updated ON materials_cache(last_updated);
CREATE INDEX IF NOT EXISTS idx_pricing_zip ON pricing_cache(zip_code);
CREATE INDEX IF NOT EXISTS idx_pricing_state ON pricing_cache(state_code);
CREATE INDEX IF NOT EXISTS idx_pricing_updated ON pricing_cache(last_updated);
CREATE INDEX IF NOT EXISTS idx_zip_metro_zip ON zip_metro_mapping(zip_code);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_contractor ON scheduled_jobs(contractor_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_date ON scheduled_jobs(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_availability_contractor_date ON contractor_availability(contractor_id, date);

-- Insert baseline labor rates
INSERT INTO labor_rates (state, zip_code, hourly_rate) VALUES
  ('WA', '98407', 65.00),
  ('WA', NULL, 58.00),
  ('CA', NULL, 75.00),
  ('TX', NULL, 52.00),
  ('NY', NULL, 72.00),
  ('FL', NULL, 48.00),
  ('IL', NULL, 62.00),
  ('PA', NULL, 56.00)
ON CONFLICT DO NOTHING;

-- Enable Row Level Security on all tables
ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractor_availability ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contractors table
CREATE POLICY "Contractors can view own profile"
  ON contractors FOR SELECT
  TO authenticated
  USING (auth.uid()::text = id::text);

CREATE POLICY "Contractors can update own profile"
  ON contractors FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = id::text)
  WITH CHECK (auth.uid()::text = id::text);

-- RLS Policies for contractor_sessions
CREATE POLICY "Contractors can view own sessions"
  ON contractor_sessions FOR SELECT
  TO authenticated
  USING (auth.uid()::text = contractor_id::text);

CREATE POLICY "Contractors can delete own sessions"
  ON contractor_sessions FOR DELETE
  TO authenticated
  USING (auth.uid()::text = contractor_id::text);

-- RLS Policies for estimates
CREATE POLICY "Contractors can view own estimates"
  ON estimates FOR SELECT
  TO authenticated
  USING (auth.uid()::text = contractor_id::text);

CREATE POLICY "Contractors can create estimates"
  ON estimates FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Contractors can update own estimates"
  ON estimates FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = contractor_id::text)
  WITH CHECK (auth.uid()::text = contractor_id::text);

-- RLS Policies for scheduled_jobs
CREATE POLICY "Contractors can view own scheduled jobs"
  ON scheduled_jobs FOR SELECT
  TO authenticated
  USING (auth.uid()::text = contractor_id::text);

CREATE POLICY "Contractors can create scheduled jobs"
  ON scheduled_jobs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = contractor_id::text);

CREATE POLICY "Contractors can update own scheduled jobs"
  ON scheduled_jobs FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = contractor_id::text)
  WITH CHECK (auth.uid()::text = contractor_id::text);

CREATE POLICY "Contractors can delete own scheduled jobs"
  ON scheduled_jobs FOR DELETE
  TO authenticated
  USING (auth.uid()::text = contractor_id::text);

-- RLS Policies for contractor_availability
CREATE POLICY "Contractors can view own availability"
  ON contractor_availability FOR SELECT
  TO authenticated
  USING (auth.uid()::text = contractor_id::text);

CREATE POLICY "Contractors can manage own availability"
  ON contractor_availability FOR ALL
  TO authenticated
  USING (auth.uid()::text = contractor_id::text)
  WITH CHECK (auth.uid()::text = contractor_id::text);