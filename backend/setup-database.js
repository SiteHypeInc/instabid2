require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const setupDatabase = async () => {
  console.log('🔄 Checking database tables...');
  
  try {
    // Create pricing_cache table
    await pool.query(`
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
    `);
    console.log('✅ pricing_cache table ready');

    // Create indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_zip ON pricing_cache(zip_code);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_state ON pricing_cache(state_code);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_updated ON pricing_cache(last_updated);`);
    console.log('✅ Indexes created');

    // Create api_refresh_log table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS api_refresh_log (
        id SERIAL PRIMARY KEY,
        refresh_date TIMESTAMP DEFAULT NOW(),
        api_source VARCHAR(50),
        records_updated INTEGER,
        status VARCHAR(20),
        error_message TEXT,
        execution_time_ms INTEGER
      );
    `);
    console.log('✅ api_refresh_log table ready');

    // Create zip_metro_mapping table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS zip_metro_mapping (
        id SERIAL PRIMARY KEY,
        zip_code VARCHAR(10) UNIQUE NOT NULL,
        metro_area VARCHAR(100),
        metro_code VARCHAR(10),
        state_code VARCHAR(2),
        county VARCHAR(100)
      );
    `);
    console.log('✅ zip_metro_mapping table ready');

    console.log('🎉 Database setup complete!');
    
  } catch (error) {
    console.error('❌ Database setup error:', error.message);
    throw error;
  }
};

module.exports = setupDatabase;
