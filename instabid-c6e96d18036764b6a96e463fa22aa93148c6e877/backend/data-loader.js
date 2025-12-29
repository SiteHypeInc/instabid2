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

module.exports = new DataLoader(); */

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

  // Insert reference data into database
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

  // NEW - Load expanded trade field definitions into database
  async loadTradeFieldDefinitions(pool) {
    try {
      console.log('📊 Loading expanded trade field definitions...');

      // Create table if not exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS trade_field_definitions (
          id SERIAL PRIMARY KEY,
          trade VARCHAR(50) NOT NULL,
          field_key VARCHAR(100) NOT NULL,
          field_label VARCHAR(255) NOT NULL,
          field_type VARCHAR(50) NOT NULL,
          field_options JSONB,
          is_required BOOLEAN DEFAULT false,
          display_order INTEGER DEFAULT 0,
          pricing_impact JSONB,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(trade, field_key)
        );
      `);

      // ROOFING FIELDS
      const roofingFields = [
        { trade: 'roofing', field_key: 'squareFeet', field_label: 'Square Feet', field_type: 'number', is_required: true, display_order: 1 },
        { trade: 'roofing', field_key: 'pitch', field_label: 'Roof Pitch', field_type: 'select', field_options: ['3/12', '4/12', '5/12', '6/12', '7/12', '8/12', '9/12', '10/12', '11/12', '12/12+'], is_required: true, display_order: 2 },
        { trade: 'roofing', field_key: 'material', field_label: 'Roofing Material', field_type: 'select', field_options: ['Asphalt Shingles ($2.50/sqft)', 'Architectural Shingles ($3.50/sqft)', 'Metal ($5.00/sqft)', 'Tile ($7.00/sqft)', 'Wood Shake ($6.00/sqft)'], is_required: true, display_order: 3 },
        { trade: 'roofing', field_key: 'stories', field_label: 'Number of Stories', field_type: 'number', is_required: true, display_order: 4 },
        { trade: 'roofing', field_key: 'layers', field_label: 'Existing Layers to Remove', field_type: 'number', display_order: 5 },
        { trade: 'roofing', field_key: 'chimneys', field_label: 'Number of Chimneys', field_type: 'number', display_order: 6 },
        { trade: 'roofing', field_key: 'valleys', field_label: 'Number of Valleys', field_type: 'number', display_order: 7 },
        { trade: 'roofing', field_key: 'needsPlywood', field_label: 'Needs Plywood Replacement?', field_type: 'radio', field_options: ['yes', 'no'], display_order: 8 },
        { trade: 'roofing', field_key: 'plywoodSqft', field_label: 'Plywood Square Feet', field_type: 'number', display_order: 9 },
        { trade: 'roofing', field_key: 'existingRoofType', field_label: 'Existing Roof Type', field_type: 'select', field_options: ['asphalt', 'tile', 'metal', 'wood_shake'], display_order: 10 },
        { trade: 'roofing', field_key: 'skylights', field_label: 'Number of Skylights', field_type: 'number', display_order: 11 },
        { trade: 'roofing', field_key: 'ridgeVentFeet', field_label: 'Ridge Vent (Linear Feet)', field_type: 'number', display_order: 12 }
      ];

      // HVAC FIELDS - EXPANDED
      const hvacFields = [
        { trade: 'hvac', field_key: 'squareFeet', field_label: 'Square Feet', field_type: 'number', is_required: true, display_order: 1 },
        { trade: 'hvac', field_key: 'systemType', field_label: 'System Type', field_type: 'select', field_options: ['Central AC', 'Heat Pump', 'Furnace', 'Ductless Mini-Split', 'Boiler'], is_required: true, display_order: 2 },
        { trade: 'hvac', field_key: 'units', field_label: 'Number of Units', field_type: 'number', is_required: true, display_order: 3 },
        { trade: 'hvac', field_key: 'stories', field_label: 'Number of Stories', field_type: 'number', is_required: true, display_order: 4 },
        { trade: 'hvac', field_key: 'registers', field_label: 'Number of Registers (Supply/Return)', field_type: 'number', display_order: 5, pricing_impact: { type: 'per_unit', cost: 200 } },
        { trade: 'hvac', field_key: 'accessType', field_label: 'Access Type', field_type: 'select', field_options: ['basement', 'crawlspace', 'attic', 'slab'], display_order: 6, pricing_impact: { type: 'multiplier', values: { basement: 1.0, crawlspace: 1.2, attic: 1.15, slab: 1.3 } } },
        { trade: 'hvac', field_key: 'existingDucts', field_label: 'Existing Ductwork', field_type: 'select', field_options: ['yes', 'no', 'partial'], display_order: 7 },
        { trade: 'hvac', field_key: 'zoning', field_label: 'Zoning', field_type: 'select', field_options: ['single', 'multi'], display_order: 8 },
        { trade: 'hvac', field_key: 'tonnage', field_label: 'Tonnage', field_type: 'select', field_options: ['1.5', '2', '2.5', '3', '3.5', '4', '5'], display_order: 9 },
        { trade: 'hvac', field_key: 'efficiency', field_label: 'Efficiency Rating', field_type: 'select', field_options: ['standard_14', 'high_16_20', 'premium_20plus'], display_order: 10 },
        { trade: 'hvac', field_key: 'gasLineNeeded', field_label: 'Gas Line Needed?', field_type: 'radio', field_options: ['yes', 'no'], display_order: 11, pricing_impact: { type: 'fixed', cost: 1000 } },
        { trade: 'hvac', field_key: 'electricalUpgrade', field_label: 'Electrical Upgrade Needed?', field_type: 'radio', field_options: ['yes', 'no'], display_order: 12, pricing_impact: { type: 'fixed', cost: 1500 } }
      ];

      // ELECTRICAL FIELDS - EXPANDED
      const electricalFields = [
        { trade: 'electrical', field_key: 'squareFeet', field_label: 'Square Feet', field_type: 'number', is_required: true, display_order: 1 },
        { trade: 'electrical', field_key: 'serviceType', field_label: 'Service Type', field_type: 'select', field_options: ['panel', 'rewire', 'general'], is_required: true, display_order: 2 },
        { trade: 'electrical', field_key: 'stories', field_label: 'Number of Stories', field_type: 'number', is_required: true, display_order: 3 },
        { trade: 'electrical', field_key: 'amperage', field_label: 'Panel Amperage', field_type: 'select', field_options: ['100', '150', '200', '400'], display_order: 4 },
        { trade: 'electrical', field_key: 'receptacles', field_label: 'Number of Receptacles (Outlets)', field_type: 'number', display_order: 5, pricing_impact: { type: 'per_unit', cost: 125 } },
        { trade: 'electrical', field_key: 'switches', field_label: 'Number of Switches', field_type: 'number', display_order: 6, pricing_impact: { type: 'per_unit', cost: 75 } },
        { trade: 'electrical', field_key: 'lightFixtures', field_label: 'Number of Light Fixtures', field_type: 'number', display_order: 7, pricing_impact: { type: 'per_unit', cost: 200 } },
        { trade: 'electrical', field_key: 'accessType', field_label: 'Access Type', field_type: 'select', field_options: ['basement', 'crawlspace', 'attic', 'slab'], display_order: 8, pricing_impact: { type: 'multiplier', values: { basement: 1.0, crawlspace: 1.2, attic: 1.15, slab: 1.3 } } },
        { trade: 'electrical', field_key: 'knobAndTube', field_label: 'Knob & Tube Wiring?', field_type: 'radio', field_options: ['yes', 'no'], display_order: 9, pricing_impact: { type: 'multiplier', value: 1.5 } },
        { trade: 'electrical', field_key: 'aluminumWiring', field_label: 'Aluminum Wiring?', field_type: 'radio', field_options: ['yes', 'no'], display_order: 10, pricing_impact: { type: 'multiplier', value: 1.3 } },
        { trade: 'electrical', field_key: 'arcFaultBreakers', field_label: 'Arc-Fault Breakers Required?', field_type: 'radio', field_options: ['yes', 'no'], display_order: 11 },
        { trade: 'electrical', field_key: 'gfciOutlets', field_label: 'Number of GFCI Outlets', field_type: 'number', display_order: 12, pricing_impact: { type: 'per_unit', cost: 45 } },
        { trade: 'electrical', field_key: 'ceilingFans', field_label: 'Number of Ceiling Fans', field_type: 'number', display_order: 13, pricing_impact: { type: 'per_unit', cost: 300 } },
        { trade: 'electrical', field_key: 'smartHome', field_label: 'Smart Home Integration?', field_type: 'radio', field_options: ['yes', 'no'], display_order: 14, pricing_impact: { type: 'multiplier', value: 1.2 } }
      ];

      // PLUMBING FIELDS - EXPANDED
      const plumbingFields = [
        { trade: 'plumbing', field_key: 'squareFeet', field_label: 'Square Feet', field_type: 'number', display_order: 1 },
        { trade: 'plumbing', field_key: 'serviceType', field_label: 'Service Type', field_type: 'select', field_options: ['repipe', 'water_heater', 'fixture', 'general'], is_required: true, display_order: 2 },
        { trade: 'plumbing', field_key: 'stories', field_label: 'Number of Stories', field_type: 'number', is_required: true, display_order: 3 },
        { trade: 'plumbing', field_key: 'bathrooms', field_label: 'Number of Bathrooms', field_type: 'number', is_required: true, display_order: 4 },
        { trade: 'plumbing', field_key: 'accessType', field_label: 'Access Type', field_type: 'select', field_options: ['basement', 'crawlspace', 'slab'], display_order: 5, pricing_impact: { type: 'multiplier', values: { basement: 1.0, crawlspace: 1.2, slab: 1.4 } } },
        { trade: 'plumbing', field_key: 'kitchens', field_label: 'Number of Kitchens', field_type: 'number', display_order: 6 },
        { trade: 'plumbing', field_key: 'laundryRooms', field_label: 'Number of Laundry Rooms', field_type: 'number', display_order: 7 },
        { trade: 'plumbing', field_key: 'heaterType', field_label: 'Water Heater Type', field_type: 'select', field_options: ['tank', 'tankless'], display_order: 8 },
        { trade: 'plumbing', field_key: 'waterHeaterLocation', field_label: 'Water Heater Location', field_type: 'select', field_options: ['garage', 'basement', 'attic', 'closet'], display_order: 9, pricing_impact: { type: 'multiplier', values: { garage: 1.0, basement: 1.0, attic: 1.2, closet: 1.1 } } },
        { trade: 'plumbing', field_key: 'gasLineNeeded', field_label: 'Gas Line Needed?', field_type: 'radio', field_options: ['yes', 'no'], display_order: 10, pricing_impact: { type: 'fixed', cost: 1000 } },
        { trade: 'plumbing', field_key: 'sewerLineType', field_label: 'Sewer Line Type', field_type: 'select', field_options: ['city', 'septic'], display_order: 11 },
        { trade: 'plumbing', field_key: 'mainLineReplacement', field_label: 'Main Line Replacement?', field_type: 'radio', field_options: ['yes', 'no'], display_order: 12, pricing_impact: { type: 'fixed', cost: 3500 } },
        { trade: 'plumbing', field_key: 'garbageDisposal', field_label: 'Garbage Disposal?', field_type: 'radio', field_options: ['yes', 'no'], display_order: 13, pricing_impact: { type: 'fixed', cost: 325 } },
        { trade: 'plumbing', field_key: 'iceMaker', field_label: 'Ice Maker Line?', field_type: 'radio', field_options: ['yes', 'no'], display_order: 14, pricing_impact: { type: 'fixed', cost: 275 } },
        { trade: 'plumbing', field_key: 'waterSoftener', field_label: 'Water Softener?', field_type: 'radio', field_options: ['yes', 'no'], display_order: 15, pricing_impact: { type: 'fixed', cost: 1500 } },
        { trade: 'plumbing', field_key: 'fixtures', field_label: 'Number of Fixtures', field_type: 'number', display_order: 16, pricing_impact: { type: 'per_unit', cost: 350 } }
      ];

      // FLOORING FIELDS - EXPANDED
      const flooringFields = [
        { trade: 'flooring', field_key: 'squareFeet', field_label: 'Square Feet', field_type: 'number', is_required: true, display_order: 1 },
        { trade: 'flooring', field_key: 'floorType', field_label: 'Flooring Type', field_type: 'select', field_options: ['hardwood', 'engineered_hardwood', 'laminate', 'tile', 'carpet', 'vinyl', 'lvp'], is_required: true, display_order: 2 },
        { trade: 'flooring', field_key: 'stories', field_label: 'Number of Stories', field_type: 'number', is_required: true, display_order: 3 },
        { trade: 'flooring', field_key: 'rooms', field_label: 'Number of Rooms', field_type: 'number', display_order: 4 },
        { trade: 'flooring', field_key: 'needRemoval', field_label: 'Remove Existing Flooring?', field_type: 'radio', field_options: ['yes', 'no'], display_order: 5 },
        { trade: 'flooring', field_key: 'stairs', field_label: 'Include Stairs?', field_type: 'radio', field_options: ['yes', 'no'], display_order: 6 },
        { trade: 'flooring', field_key: 'stairSteps', field_label: 'Number of Stair Steps', field_type: 'number', display_order: 7, pricing_impact: { type: 'per_unit', cost: 75 } },
        { trade: 'flooring', field_key: 'subfloorCondition', field_label: 'Subfloor Condition', field_type: 'select', field_options: ['good', 'needs_repair', 'needs_replacement'], display_order: 8 },
        { trade: 'flooring', field_key: 'moistureIssues', field_label: 'Moisture Issues?', field_type: 'radio', field_options: ['yes', 'no'], display_order: 9, pricing_impact: { type: 'fixed', cost: 1250 } },
        { trade: 'flooring', field_key: 'transitionStrips', field_label: 'Number of Transition Strips', field_type: 'number', display_order: 10, pricing_impact: { type: 'per_unit', cost: 50 } },
        { trade: 'flooring', field_key: 'baseboardRemoval', field_label: 'Remove/Reinstall Baseboard?', field_type: 'radio', field_options: ['yes', 'no'], display_order: 11 },
        { trade: 'flooring', field_key: 'floorHeating', field_label: 'Radiant Floor Heating?', field_type: 'radio', field_options: ['yes', 'no'], display_order: 12, pricing_impact: { type: 'per_sqft', cost: 15 } }
      ];

      // PAINTING FIELDS - EXPANDED
      const paintingFields = [
        { trade: 'painting', field_key: 'squareFeet', field_label: 'Square Feet', field_type: 'number', is_required: true, display_order: 1 },
        { trade: 'painting', field_key: 'paintType', field_label: 'Paint Type', field_type: 'select', field_options: ['interior', 'exterior', 'both'], is_required: true, display_order: 2 },
        { trade: 'painting', field_key: 'stories', field_label: 'Number of Stories', field_type: 'number', is_required: true, display_order: 3 },
        { trade: 'painting', field_key: 'coats', field_label: 'Number of Coats', field_type: 'select', field_options: ['1', '2', '3'], display_order: 4 },
        { trade: 'painting', field_key: 'rooms', field_label: 'Number of Rooms', field_type: 'number', display_order: 5 },
        { trade: 'painting', field_key: 'includeCeilings', field_label: 'Include Ceilings?', field_type: 'radio', field_options: ['yes', 'no'], display_order: 6 },
        { trade: 'painting', field_key: 'includeTrim', field_label: 'Include Trim?', field_type: 'radio', field_options: ['yes', 'no'], display_order: 7 },
        { trade: 'painting', field_key: 'doorCount', field_label: 'Number of Doors', field_type: 'number', display_order: 8 },
        { trade: 'painting', field_key: 'windowCount', field_label: 'Number of Windows', field_type: 'number', display_order: 9 },
        { trade: 'painting', field_key: 'sidingType', field_label: 'Siding Type (Exterior)', field_type: 'select', field_options: ['wood', 'vinyl', 'brick', 'stucco', 'hardie', 'metal'], display_order: 10 },
        { trade: 'painting', field_key: 'sidingCondition', field_label: 'Siding Condition', field_type: 'select', field_options: ['excellent', 'good', 'fair', 'poor', 'needs_repair'], display_order: 11 },
        { trade: 'painting', field_key: 'cabinetPainting', field_label: 'Paint Cabinets?', field_type: 'radio', field_options: ['yes', 'no'], display_order: 12 },
        { trade: 'painting', field_key: 'cabinetCount', field_label: 'Number of Cabinet Faces', field_type: 'number', display_order: 13, pricing_impact: { type: 'per_unit', cost: 100 } },
        { trade: 'painting', field_key: 'wallCondition', field_label: 'Wall Condition', field_type: 'select', field_options: ['smooth', 'textured', 'damaged'], display_order: 14 },
        { trade: 'painting', field_key: 'patchingNeeded', field_label: 'Patching Needed', field_type: 'select', field_options: ['none', 'minor', 'moderate', 'extensive'], display_order: 15 },
        { trade: 'painting', field_key: 'powerWashing', field_label: 'Power Washing (Exterior)?', field_type: 'radio', field_options: ['yes', 'no'], display_order: 16, pricing_impact: { type: 'per_sqft', cost: 0.55 } },
        { trade: 'painting', field_key: 'leadPaint', field_label: 'Lead Paint Present (Pre-1978)?', field_type: 'radio', field_options: ['yes', 'no', 'unknown'], display_order: 17, pricing_impact: { type: 'per_sqft', cost: 11 } },
        { trade: 'painting', field_key: 'colorChangeDramatic', field_label: 'Dramatic Color Change?', field_type: 'radio', field_options: ['yes', 'no'], display_order: 18 }
      ];

      // Combine all fields
      const allFields = [
        ...roofingFields,
        ...hvacFields,
        ...electricalFields,
        ...plumbingFields,
        ...flooringFields,
        ...paintingFields
      ];

      // Insert fields
      for (const field of allFields) {
        await pool.query(`
          INSERT INTO trade_field_definitions 
          (trade, field_key, field_label, field_type, field_options, is_required, display_order, pricing_impact)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (trade, field_key) DO UPDATE SET
            field_label = EXCLUDED.field_label,
            field_type = EXCLUDED.field_type,
            field_options = EXCLUDED.field_options,
            is_required = EXCLUDED.is_required,
            display_order = EXCLUDED.display_order,
            pricing_impact = EXCLUDED.pricing_impact
        `, [
          field.trade,
          field.field_key,
          field.field_label,
          field.field_type,
          JSON.stringify(field.field_options || []),
          field.is_required || false,
          field.display_order,
          JSON.stringify(field.pricing_impact || {})
        ]);
      }

      console.log(`✅ Loaded ${allFields.length} expanded trade field definitions`);

    } catch (error) {
      console.error('❌ Error loading trade field definitions:', error);
    }
  }
}

module.exports = new DataLoader();
