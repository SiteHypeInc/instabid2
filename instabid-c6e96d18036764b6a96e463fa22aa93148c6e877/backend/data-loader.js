/*const fs = require('fs');
const path = require('path');

class DataLoader {
  
  constructor() {
    this.counties = null;
    this.metros = null;
  }

  // Load county seat data
  async loadCounties() {
    if (this.counties) return this.counties;
    
    try {
      const filePath = path.join(__dirname, 'data/county-seats.json');
      
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(data);
        this.counties = parsed.counties;
        console.log(`✅ Loaded ${this.counties.length} county seats`);
      } else {
        console.error('❌ County data file not found at:', filePath);
        this.counties = [];
      }
      
      return this.counties;
    } catch (error) {
      console.error('Error loading counties:', error);
      return [];
    }
  }

  // Load metro area data
  async loadMetros() {
    if (this.metros) return this.metros;
    
    try {
      const filePath = path.join(__dirname, 'data/metro-areas.json');
      
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(data);
        this.metros = parsed.metros;
        console.log(`✅ Loaded ${Object.keys(this.metros).length} metro areas`);
      } else {
        console.error('❌ Metro data file not found at:', filePath);
        this.metros = {};
      }
      
      return this.metros;
    } catch (error) {
      console.error('Error loading metros:', error);
      return {};
    }
  }

  // Find nearest known pricing data for a ZIP
  async interpolateZIP(targetZip) {
    await this.loadCounties();
    
    if (!this.counties || this.counties.length === 0) {
      return null;
    }
    
    // Step 1: Find geographically close ZIPs (by 3-digit prefix matching)
    const targetPrefix = targetZip.substring(0, 3);
    
    const nearbyCounties = this.counties.filter(c => 
      c.zip.substring(0, 3) === targetPrefix
    );
    
    if (nearbyCounties.length > 0) {
      // Return the first match (closest by ZIP proximity)
      return nearbyCounties[0];
    }
    
    // Step 2: Fallback to same first 2 digits (regional match)
    const targetRegion = targetZip.substring(0, 2);
    const regionalCounties = this.counties.filter(c =>
      c.zip.substring(0, 2) === targetRegion
    );
    
    if (regionalCounties.length > 0) {
      return regionalCounties[0];
    }
    
    // Step 3: No match found
    return null;
  }

  // Get metro area for a ZIP
  async getMetroForZip(zipCode) {
    await this.loadCounties();
    await this.loadMetros();
    
    const county = this.counties?.find(c => c.zip === zipCode);
    
    if (county && county.metro) {
      return this.metros[county.metro] || null;
    }
    
    return null;
  }

  // Get all ZIPs that should be refreshed (all county seats)
  async getAllRefreshZips() {
    await this.loadCounties();
    
    if (!this.counties) {
      return [];
    }
    
    // Return all county seat ZIPs
    return this.counties.map(c => c.zip);
  }

  // Get county info for a ZIP
  async getCountyForZip(zipCode) {
    await this.loadCounties();
    
    return this.counties?.find(c => c.zip === zipCode) || null;
  }
}

  // NEW FUNCTION 12-25 - Insert reference data into database
  async loadReferenceData(pool) {
    try {
      // Load counties into database
      await this.loadCounties();
      
      if (this.counties && this.counties.length > 0) {
        for (const county of this.counties) {
          await pool.query(`
            INSERT INTO county_seats (county_name, state, zip_code, metro_area)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (county_name, state) DO NOTHING
          `, [county.county, county.state, county.zip, county.metro || null]);
        }
        console.log(`✅ Loaded ${this.counties.length} county seats into database`);
      }
      
      // Load metros into database
      await this.loadMetros();
      
      if (this.metros && Object.keys(this.metros).length > 0) {
        for (const [metroName, metroData] of Object.entries(this.metros)) {
          await pool.query(`
            INSERT INTO metro_areas (name, cost_index)
            VALUES ($1, $2)
            ON CONFLICT (name) DO NOTHING
          `, [metroName, metroData.cost_index || 1.0]);
        }
        console.log(`✅ Loaded ${Object.keys(this.metros).length} metro areas into database`);
      }
      
    } catch (error) {
      console.error('❌ Error loading reference data:', error);
    }
  }

module.exports = new DataLoader();*/

const fs = require('fs');
const path = require('path');

class DataLoader {
  
  constructor() {
    this.counties = null;
    this.metros = null;
  }

  // Load county seat data
  async loadCounties() {
    if (this.counties) return this.counties;
    
    try {
      const filePath = path.join(__dirname, 'data/county-seats.json');
      
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(data);
        this.counties = parsed.counties;
        console.log(`✅ Loaded ${this.counties.length} county seats`);
      } else {
        console.error('❌ County data file not found at:', filePath);
        this.counties = [];
      }
      
      return this.counties;
    } catch (error) {
      console.error('Error loading counties:', error);
      return [];
    }
  }

  // Load metro area data
  async loadMetros() {
    if (this.metros) return this.metros;
    
    try {
      const filePath = path.join(__dirname, 'data/metro-areas.json');
      
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(data);
        this.metros = parsed.metros;
        console.log(`✅ Loaded ${Object.keys(this.metros).length} metro areas`);
      } else {
        console.error('❌ Metro data file not found at:', filePath);
        this.metros = {};
      }
      
      return this.metros;
    } catch (error) {
      console.error('Error loading metros:', error);
      return {};
    }
  }

  // Find nearest known pricing data for a ZIP
  async interpolateZIP(targetZip) {
    await this.loadCounties();
    
    if (!this.counties || this.counties.length === 0) {
      return null;
    }
    
    // Step 1: Find geographically close ZIPs (by 3-digit prefix matching)
    const targetPrefix = targetZip.substring(0, 3);
    
    const nearbyCounties = this.counties.filter(c => 
      c.zip.substring(0, 3) === targetPrefix
    );
    
    if (nearbyCounties.length > 0) {
      // Return the first match (closest by ZIP proximity)
      return nearbyCounties[0];
    }
    
    // Step 2: Fallback to same first 2 digits (regional match)
    const targetRegion = targetZip.substring(0, 2);
    const regionalCounties = this.counties.filter(c =>
      c.zip.substring(0, 2) === targetRegion
    );
    
    if (regionalCounties.length > 0) {
      return regionalCounties[0];
    }
    
    // Step 3: No match found
    return null;
  }

  // Get metro area for a ZIP
  async getMetroForZip(zipCode) {
    await this.loadCounties();
    await this.loadMetros();
    
    const county = this.counties?.find(c => c.zip === zipCode);
    
    if (county && county.metro) {
      return this.metros[county.metro] || null;
    }
    
    return null;
  }

  // Get all ZIPs that should be refreshed (all county seats)
  async getAllRefreshZips() {
    await this.loadCounties();
    
    if (!this.counties) {
      return [];
    }
    
    // Return all county seat ZIPs
    return this.counties.map(c => c.zip);
  }

  // Get county info for a ZIP
  async getCountyForZip(zipCode) {
    await this.loadCounties();
    
    return this.counties?.find(c => c.zip === zipCode) || null;
  }

  // NEW FUNCTION 12-25 - Insert reference data into database
  async loadReferenceData(pool) {
    try {
      // Load counties into database
      await this.loadCounties();
      
      if (this.counties && this.counties.length > 0) {
        for (const county of this.counties) {
          await pool.query(`
            INSERT INTO county_seats (county_name, state, zip_code, metro_area)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (county_name, state) DO NOTHING
          `, [county.county, county.state, county.zip, county.metro || null]);
        }
        console.log(`✅ Loaded ${this.counties.length} county seats into database`);
      }
      
      // Load metros into database
      await this.loadMetros();
      
      if (this.metros && Object.keys(this.metros).length > 0) {
        for (const [metroName, metroData] of Object.entries(this.metros)) {
          await pool.query(`
            INSERT INTO metro_areas (name, cost_index)
            VALUES ($1, $2)
            ON CONFLICT (name) DO NOTHING
          `, [metroName, metroData.cost_index || 1.0]);
        }
        console.log(`✅ Loaded ${Object.keys(this.metros).length} metro areas into database`);
      }
      
    } catch (error) {
      console.error('❌ Error loading reference data:', error);
    }
  }
}

module.exports = new DataLoader();
