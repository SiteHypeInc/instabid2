const { Pool } = require('pg');

class PricingCache {
  
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    this.initDatabase();
  }

  // Initialize database tables
  async initDatabase() {
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS pricing_cache (
          zip_code VARCHAR(5) PRIMARY KEY,
          county VARCHAR(100),
          state VARCHAR(2),
          metro VARCHAR(100),
          material_multiplier DECIMAL(4,2),
          labor_rate DECIMAL(4,2),
          permit_cost INTEGER,
          weather_factor DECIMAL(4,2),
          data_sources JSONB,
          quality_score INTEGER,
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_state ON pricing_cache(state);
        CREATE INDEX IF NOT EXISTS idx_metro ON pricing_cache(metro);
        CREATE INDEX IF NOT EXISTS idx_expires ON pricing_cache(expires_at);
      `);
      
      console.log('✅ Pricing cache database initialized');
    } catch (error) {
      console.error('❌ Database initialization error:', error);
    }
  }

  // Get pricing data for a ZIP
  async get(zipCode) {
    try {
      const result = await this.pool.query(
        'SELECT * FROM pricing_cache WHERE zip_code = $1 AND expires_at > NOW()',
        [zipCode]
      );
      
      if (result.rows.length > 0) {
        console.log(`✅ Cache HIT for ${zipCode}`);
        return result.rows[0];
      }
      
      console.log(`⚠️  Cache MISS for ${zipCode}`);
      return null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  // Store pricing data
  async set(zipCode, data, expiryDays = 14) {
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiryDays);
      
      await this.pool.query(`
        INSERT INTO pricing_cache (
          zip_code, county, state, metro,
          material_multiplier, labor_rate, permit_cost, weather_factor,
          data_sources, quality_score, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (zip_code) 
        DO UPDATE SET
          county = EXCLUDED.county,
          state = EXCLUDED.state,
          metro = EXCLUDED.metro,
          material_multiplier = EXCLUDED.material_multiplier,
          labor_rate = EXCLUDED.labor_rate,
          permit_cost = EXCLUDED.permit_cost,
          weather_factor = EXCLUDED.weather_factor,
          data_sources = EXCLUDED.data_sources,
          quality_score = EXCLUDED.quality_score,
          last_updated = CURRENT_TIMESTAMP,
          expires_at = EXCLUDED.expires_at
      `, [
        zipCode,
        data.county || null,
        data.state || null,
        data.metro || null,
        data.materialMultiplier || 1.0,
        data.laborRate || 2.5,
        data.permitCost || 200,
        data.weatherFactor || 0.15,
        JSON.stringify(data.dataSources || {}),
        data.qualityScore || 50,
        expiresAt
      ]);
      
      console.log(`✅ Cached pricing for ${zipCode} (expires: ${expiresAt.toLocaleDateString()})`);
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  // Get all ZIPs for a state
  async getByState(stateCode) {
    try {
      const result = await this.pool.query(
        'SELECT * FROM pricing_cache WHERE state = $1 AND expires_at > NOW()',
        [stateCode]
      );
      
      return result.rows;
    } catch (error) {
      console.error('Get by state error:', error);
      return [];
    }
  }

  // Get all ZIPs for a metro area
  async getByMetro(metroName) {
    try {
      const result = await this.pool.query(
        'SELECT * FROM pricing_cache WHERE metro = $1 AND expires_at > NOW()',
        [metroName]
      );
      
      return result.rows;
    } catch (error) {
      console.error('Get by metro error:', error);
      return [];
    }
  }

  // Clean expired entries
  async cleanExpired() {
    try {
      const result = await this.pool.query(
        'DELETE FROM pricing_cache WHERE expires_at < NOW()'
      );
      
      console.log(`🧹 Cleaned ${result.rowCount} expired cache entries`);
      return result.rowCount;
    } catch (error) {
      console.error('Clean expired error:', error);
      return 0;
    }
  }

  // Get cache statistics
  async getStats() {
    try {
      const result = await this.pool.query(`
        SELECT 
          COUNT(*) as total_entries,
          COUNT(CASE WHEN expires_at > NOW() THEN 1 END) as active_entries,
          COUNT(CASE WHEN expires_at < NOW() THEN 1 END) as expired_entries,
          AVG(quality_score) as avg_quality_score,
          COUNT(DISTINCT state) as states_covered,
          COUNT(DISTINCT metro) as metros_covered
        FROM pricing_cache
      `);
      
      return result.rows[0];
    } catch (error) {
      console.error('Get stats error:', error);
      return null;
    }
  }
}

module.exports = new PricingCache();
