//========================================
// INSTABID SERVER v3.0 - CALIBRATED PRICING
// Last Updated: January 2025
// ========================================

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: [
    'https://white-raven-264519.hostingersite.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));



// ========================================
// DATABASE CONNECTION
// ========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ========================================
// GLOBAL CACHE - STATE MULTIPLIERS
// Loaded once at startup from regional_multipliers table
// ========================================
let STATE_MULTIPLIERS_CACHE = {};

async function loadStateMultipliers() {
  try {
    const result = await pool.query('SELECT state_code, multiplier FROM regional_multipliers ORDER BY state_code');
    
    STATE_MULTIPLIERS_CACHE = {};
    result.rows.forEach(row => {
      STATE_MULTIPLIERS_CACHE[row.state_code] = parseFloat(row.multiplier);
    });
    
    console.log(`✅ Loaded ${result.rows.length} state multipliers from database`);
    console.log(`📊 Sample: CA=${STATE_MULTIPLIERS_CACHE['CA']}, TX=${STATE_MULTIPLIERS_CACHE['TX']}, NY=${STATE_MULTIPLIERS_CACHE['NY']}`);
    
    return true;
  } catch (error) {
    console.error('❌ Failed to load state multipliers:', error);
    console.log('⚠️  Using hardcoded fallback');
    
    // Safety fallback if DB fails
    STATE_MULTIPLIERS_CACHE = {
      'CA': 1.35, 'NY': 1.30, 'MA': 1.25, 'HI': 1.40, 'WA': 1.15,
      'OR': 1.10, 'CO': 1.10, 'IL': 1.08, 'VA': 1.05, 'TX': 0.95,
      'FL': 0.95, 'GA': 0.90, 'OH': 0.92, 'PA': 1.02, 'TN': 0.88,
      'AL': 0.85, 'AZ': 0.95, 'WY': 0.90, 'NJ': 1.28, 'MT': 0.92,
      'ID': 0.88, 'NV': 1.05, 'UT': 0.93, 'CT': 1.22, 'NM': 0.87,
      'ND': 0.95, 'SD': 0.89, 'NE': 0.91, 'RI': 1.18, 'KS': 0.90,
      'OK': 0.87, 'AR': 0.86, 'LA': 0.89, 'VT': 1.05, 'MS': 0.84,
      'KY': 0.88, 'WV': 0.86, 'SC': 0.88, 'NH': 1.08, 'NC': 0.92,
      'IN': 0.90, 'MI': 0.93, 'WI': 0.94, 'ME': 1.00, 'MN': 0.98,
      'IA': 0.91, 'MO': 0.89, 'DE': 1.05, 'MD': 1.12, 'DC': 1.25,
      'AK': 1.45
    };
    
    return false;
  }
}

// Connect to database and load pricing data
pool.connect()
  .then(() => {
    console.log('✅ Database connected');
    return loadStateMultipliers();
  })
  .then((success) => {
    if (success) {
      console.log('✅ Pricing data loaded and cached');
    } else {
      console.log('⚠️  Running with fallback values');
    }
  })
  .catch(err => {
    console.error('❌ Startup error:', err);
  });

// ========== EMAIL SETUP ==========
const transporter = nodemailer.createTransport(sgTransport({
  auth: {
    api_key: process.env.SENDGRID_API_KEY
  }
}));

// ========== AUTH MIDDLEWARE ==========
const requireAuth = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }
  
  try {
    const result = await pool.query(
      'SELECT id, company_name, subscription_status FROM contractors WHERE api_key = $1',
      [apiKey]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    
    if (result.rows[0].subscription_status !== 'active') {
      return res.status(403).json({ error: 'Subscription inactive' });
    }
    
    req.contractor = result.rows[0];
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// ========== ADMIN AUTH MIDDLEWARE ==========
const requireAdminKey = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'] || req.query.admin_key;
  
  if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Admin access required' });
  }
  
  next();
};

// Initialize database tables
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS labor_rates (
        id SERIAL PRIMARY KEY,
        state VARCHAR(2) NOT NULL,
        zip_code VARCHAR(10),
        msa_name VARCHAR(255),
        hourly_rate DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const rateCheck = await pool.query('SELECT COUNT(*) FROM labor_rates');
    if (parseInt(rateCheck.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO labor_rates (state, zip_code, hourly_rate) VALUES
        ('WA', '98407', 65.00),
        ('WA', NULL, 58.00),
        ('CA', NULL, 75.00),
        ('TX', NULL, 52.00),
        ('NY', NULL, 72.00)
      `);
    }

    await pool.query(`
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
        tax_rate DECIMAL(5,2),
        tax_amount DECIMAL(10,2),
        total_with_tax DECIMAL(10,2),
        photos JSONB,
        contractor_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
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
      
      CREATE INDEX IF NOT EXISTS idx_materials_trade_region ON materials_cache(trade, region);
      CREATE INDEX IF NOT EXISTS idx_materials_updated ON materials_cache(last_updated);
    `);

    await pool.query(`
      ALTER TABLE estimates 
      ADD COLUMN IF NOT EXISTS contractor_id INT
    `);
    
    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}

// ============================================
// 2024-2025 CALIBRATED PRICING CONSTANTS
// Based on: Bolt comparison, Home Depot research,
// John's real-world contractor feedback
// ============================================
const DEFAULT_PRICING = {
  roofing: {
    // Pitch multipliers (unchanged)
    pitch_low: 1.0,
    pitch_med: 1.15,
    pitch_high: 1.35,
    pitch_steep: 1.6,
    // Story multipliers (unchanged)
    story_1: 1.0,
    story_2: 1.25,
    story_3: 1.5,
    // Material costs per sqft - UPDATED 2024-2025
    mat_asphalt: 4.50,      // was 2.50
    mat_arch: 5.75,         // was 3.50
    mat_metal: 9.50,        // was 5.00
    mat_tile: 12.00,        // was 7.00
    mat_slate: 18.00,       // was 12.00
    // Fixed costs - UPDATED
    tearoff_cost: 2200,     // was 1500
    plywood_cost: 32,       // per sheet, was 4.5 (wrong unit)
    chimney_cost: 450,      // was 400
    valley_cost: 12,        // was 8
    skylight_cost: 400,     // was 300
    ridge_cost: 14,         // was 10
    // Additional materials
    underlayment_sqft: 0.45,
    drip_edge_lf: 2.75,
    ice_shield_lf: 4.50,
    starter_lf: 2.50,
    nails_box: 45,
    dumpster_fee: 650
  },
  
  hvac: {
    // Size multipliers (unchanged)
    hvac_size_small: 0.85,
    hvac_size_med: 1.0,
    hvac_size_large: 1.25,
    hvac_size_xlarge: 1.5,
    // Equipment costs - UPDATED 2024-2025
    hvac_furnace: 4200,     // was 3500
    hvac_ac: 5500,          // was 4000
    hvac_heatpump: 8000,    // was 5500
    hvac_minisplit: 3200,   // was 2500
    // Additional costs
    hvac_duct: 18,          // was 15
    hvac_thermostat: 250,   // was 350 (smart thermostats cheaper now)
    hvac_handler: 1500,     // was 1200
    // Complexity multipliers
    hvac_standard: 1.0,
    hvac_moderate: 1.25,
    hvac_complex: 1.5
  },
  
  electrical: {
    // Panel & service - UPDATED
    elec_panel_100: 2200,   // was 1800
    elec_panel_200: 3500,   // was 2500 (John said ~$10k total job)
    elec_panel_400: 5500,   // new
    elec_subpanel: 1500,    // was 1200
    // Fixtures & devices - UPDATED
    elec_outlet: 185,       // was 125
    elec_switch: 145,       // was 110
    elec_fixture: 200,      // was 150
    elec_fan: 275,          // was 200
    elec_gfci: 225,         // was 175
    // Specialty work - UPDATED
    elec_ev: 1800,          // was 1200
    elec_generator: 2200,   // was 1500
    elec_hottub: 1100,      // was 800
    // Labor rates
    elec_labor_std: 95,     // was 85
    elec_labor_complex: 125 // was 110
  },
  
  plumbing: {
    // Fixtures - UPDATED
    plumb_toilet: 425,      // was 350
    plumb_sink: 500,        // was 400
    plumb_shower: 1500,     // was 1200
    plumb_tub: 1800,        // was 1500
    plumb_dishwasher: 400,  // was 300
    // Water systems - UPDATED (John said $3k for tankless)
    plumb_heater_tank: 2400,      // was 1800
    plumb_heater_tankless: 1800,  // UNIT cost, was 3200 (included labor)
    plumb_sump: 1100,       // was 850
    plumb_softener: 1800,   // was 1400
    // Pipes & drains - UPDATED
    plumb_pipe_repair: 65,  // was 45
    plumb_pipe_replace: 95, // was 75
    plumb_drain: 325,       // was 250
    plumb_sewer: 165,       // was 125
    // Labor rates
    plumb_labor_std: 110,   // was 95
    plumb_labor_emerg: 165  // was 140
  },
  
  flooring: {
    // Material costs per sqft - UPDATED
    floor_carpet: 5.00,     // was 3.50
    floor_vinyl: 3.50,      // was 4.00 (LVP gotten cheaper)
    floor_laminate: 4.00,   // was 4.50
    floor_lvp: 4.50,        // new - luxury vinyl plank
    floor_hardwood_eng: 10.00,  // was 8.00
    floor_hardwood_solid: 14.00, // was 12.00
    floor_tile_ceramic: 7.50,   // was 6.00
    floor_tile_porcelain: 10.00, // was 8.50
    // Installation labor per sqft - UPDATED
    floor_labor_carpet: 2.00,    // was 1.50
    floor_labor_vinyl: 2.50,     // was 2.00
    floor_labor_hardwood: 5.00,  // was 4.00
    floor_labor_tile: 6.50,      // was 5.00
    // Prep & extras
    floor_subfloor: 4.00,   // was 3.00
    floor_removal: 2.00,    // was 1.50
    floor_underlay: 0.50,   // was 0.75
    floor_baseboard: 5.00,  // was 4.00
    // Complexity multipliers
    floor_standard: 1.0,
    floor_moderate: 1.2,
    floor_complex: 1.4
  },
  
  painting: {
    // Interior rates per sqft - UPDATED
    paint_int_walls_1: 2.00,  // was 1.50
    paint_int_walls_2: 3.25,  // was 2.50
    paint_int_ceiling: 2.75,  // was 2.00
    paint_int_trim: 2.50,     // was 1.75
    paint_int_door: 95,       // was 75
    paint_int_cabinet: 50,    // was 35
    // Exterior rates per sqft - UPDATED
    paint_ext_siding_1: 2.75, // was 2.00
    paint_ext_siding_2: 4.50, // was 3.50
    paint_ext_trim: 3.25,     // was 2.50
    paint_ext_deck: 3.00,     // was 2.25
    paint_ext_fence: 4.00,    // was 3.00
    // Prep & specialty
    paint_prep: 1.25,         // was 1.00
    paint_primer: 1.00,       // was 0.75
    paint_wallpaper: 2.00,    // was 1.50
    paint_texture: 4.00,      // was 3.00
    // Complexity multipliers
    paint_standard: 1.0,
    paint_moderate: 1.2,
    paint_complex: 1.4,
    // Paint costs per gallon
    paint_gallon_std: 45,
    paint_gallon_premium: 65,
    primer_gallon: 35
  },
  
  drywall: {
    // Materials - UPDATED
    drywall_sheet_half: 16,   // 1/2" 4x8, was ~15
    drywall_sheet_5_8: 20,    // 5/8" 4x8, was ~18
    joint_compound_bucket: 20, // 5 gal
    drywall_tape_roll: 8,
    corner_bead_8ft: 5,
    screws_box: 12,
    // Labor per sqft
    drywall_hang_labor: 1.50,
    drywall_tape_labor: 1.25,
    drywall_sand_labor: 0.75,
    // Finish levels
    finish_level_3: 1.0,      // standard
    finish_level_4: 1.2,      // smooth
    finish_level_5: 1.5       // glass smooth
  },
  
  siding: {
    // Material costs per sqft - UPDATED
    siding_vinyl: 5.50,       // was 4.50
    siding_fiber_cement: 9.50, // was 8.00
    siding_wood: 14.00,       // was 12.00
    siding_metal: 8.00,       // was 6.50
    siding_stucco: 11.00,     // was 9.00
    // Labor per sqft
    siding_labor_vinyl: 3.50,
    siding_labor_fiber: 5.50,
    siding_labor_wood: 6.50,
    siding_labor_metal: 4.50,
    siding_labor_stucco: 7.50,
    // Extras
    housewrap_roll: 175,
    j_channel_12ft: 12,
    corner_post: 35,
    soffit_sqft: 8,
    fascia_lf: 6
  }
};

// ============================================
// CONTRACTOR OVERRIDES
// ============================================
let configData = {
  roofing: {},
  hvac: {},
  electrical: {},
  plumbing: {},
  flooring: {},
  painting: {},
  drywall: {},
  siding: {},
  regional: {}
};

// ============================================
// PRICING HELPER FUNCTION
// ============================================
function getPrice(trade, key) {
  if (configData[trade] && configData[trade][key] !== undefined) {
    console.log(`📝 Using contractor override: ${trade}.${key} = ${configData[trade][key]}`);
    return configData[trade][key];
  }
  return DEFAULT_PRICING[trade]?.[key];
}

initDatabase();

// ========== LABOR RATE LOOKUP (unchanged) ==========
async function getHourlyRate(state, trade, contractorId = null) {
  const BLS_TO_CONTRACTOR_MULTIPLIER = 1.5;
  
  try {
    if (contractorId) {
      const override = await pool.query(
        'SELECT labor_rate_override FROM contractors WHERE id = $1',
        [contractorId]
      );
      
      if (override.rows.length > 0 && override.rows[0].labor_rate_override) {
        const rate = parseFloat(override.rows[0].labor_rate_override);
        console.log(`💼 Contractor hourly override: $${rate}/hr`);
        return rate;
      }
    }
    
    const result = await pool.query(
      'SELECT hourly_rate FROM bls_labor_rates WHERE state_code = $1 AND trade_type = $2',
      [state, trade]
    );

    if (result.rows.length > 0 && result.rows[0].hourly_rate) {
      const blsRate = parseFloat(result.rows[0].hourly_rate);
      const contractorRate = blsRate * BLS_TO_CONTRACTOR_MULTIPLIER;
      console.log(`💼 BLS $${blsRate}/hr × ${BLS_TO_CONTRACTOR_MULTIPLIER} = $${contractorRate}/hr`);
      return contractorRate;
    }

    console.log(`⚠️ No BLS rate for ${state} ${trade}, using state fallback`);
    const stateFallbacks = {
      'AL': 38, 'AK': 52, 'AZ': 42, 'AR': 36, 'CA': 58,
      'CO': 48, 'CT': 52, 'DE': 46, 'FL': 40, 'GA': 42,
      'HI': 54, 'ID': 40, 'IL': 50, 'IN': 42, 'IA': 44,
      'KS': 42, 'KY': 40, 'LA': 40, 'ME': 44, 'MD': 50,
      'MA': 56, 'MI': 46, 'MN': 50, 'MS': 36, 'MO': 44,
      'MT': 42, 'NE': 44, 'NV': 48, 'NH': 48, 'NJ': 54,
      'NM': 40, 'NY': 58, 'NC': 40, 'ND': 48, 'OH': 44,
      'OK': 38, 'OR': 50, 'PA': 48, 'RI': 52, 'SC': 38,
      'SD': 42, 'TN': 40, 'TX': 42, 'UT': 44, 'VT': 46,
      'VA': 46, 'WA': 52, 'WV': 40, 'WI': 46, 'WY': 44,
      'DC': 56, 'PR': 32
    };

    const baseRate = stateFallbacks[state] || 45;
    const contractorRate = baseRate * BLS_TO_CONTRACTOR_MULTIPLIER;
    console.log(`💼 Fallback $${baseRate}/hr × ${BLS_TO_CONTRACTOR_MULTIPLIER} = $${contractorRate}/hr`);
    return contractorRate;
    
  } catch (error) {
    console.error('❌ Labor rate lookup error:', error);
    const fallbackRate = 45 * BLS_TO_CONTRACTOR_MULTIPLIER;
    console.log(`⚠️ Using fallback: $${fallbackRate}/hr`);
    return fallbackRate;
  }
}

// ========== TRADE CALCULATION FUNCTION - CALIBRATED ==========
async function calculateTradeEstimate(trade, data, hourlyRate, state, msa, contractorId = null) {
  console.log(`🔧 Starting estimate calculation for ${trade}`);
  console.log(`📍 Location: ${state}, ${msa}`);
  console.log(`💼 Base labor rate: $${hourlyRate}/hr`);

  let contractorMarkup = 1.0;
  
  if (contractorId) {
    try {
      const contractorResult = await pool.query(
        'SELECT default_markup FROM contractors WHERE id = $1',
        [contractorId]
      );
      if (contractorResult.rows.length > 0 && contractorResult.rows[0].default_markup) {
        contractorMarkup = parseFloat(contractorResult.rows[0].default_markup);
        console.log(`📝 Contractor default_markup: ${contractorMarkup}x`);
      }
    } catch (error) {
      console.error('⚠️ Failed to load contractor pricing:', error);
    }
  }

  let laborHours = 0;
  let materialCost = 0;
  let equipmentCost = 0;

  const regionalMultiplier = STATE_MULTIPLIERS_CACHE[state] || 1.0;
  console.log(`📍 Regional multiplier for ${state}: ${regionalMultiplier}x`);

  switch(trade.toLowerCase()) {

    // ========== ROOFING - CALIBRATED ==========
    case 'roofing':
      const roofArea = parseFloat(data.squareFeet || data.roofArea) || 0;
      const roofComplexity = data.roofComplexity || 'medium';
      const roofPitch = data.roofPitch || 'medium';
      const stories = data.stories || '1';
      const material = data.material || 'architectural';
      const tearOffLayers = parseInt(data.tearOffLayers) || 1;
      const plywoodSheets = parseInt(data.plywoodSheets) || 0;
      const chimneys = parseInt(data.chimneys) || 0;
      const valleys = parseInt(data.valleys) || 0;
      const skylights = parseInt(data.skylights) || 0;
      const ridgeVentFeet = parseInt(data.ridgeVentFeet) || 0;

      // CALIBRATED: Base hours per 100 sqft (was 2.5, now 6.0 based on Bolt/John feedback)
      // This represents CREW hours, not man-hours
      let baseHoursPer100 = 6.0;
      
      // Complexity adjustments
      if (roofComplexity === 'low') baseHoursPer100 *= 0.85;
      if (roofComplexity === 'high') baseHoursPer100 *= 1.35;
      
      // Pitch multiplier
      let pitchMultiplier = 1.0;
      switch(roofPitch) {
        case 'low': pitchMultiplier = getPrice('roofing', 'pitch_low'); break;
        case 'medium': pitchMultiplier = getPrice('roofing', 'pitch_med'); break;
        case 'high': pitchMultiplier = getPrice('roofing', 'pitch_high'); break;
        case 'steep': pitchMultiplier = getPrice('roofing', 'pitch_steep'); break;
      }
      
      // Story multiplier
      let storyMultiplier = 1.0;
      switch(stories) {
        case '1': storyMultiplier = getPrice('roofing', 'story_1'); break;
        case '2': storyMultiplier = getPrice('roofing', 'story_2'); break;
        case '3+': storyMultiplier = getPrice('roofing', 'story_3'); break;
        default: storyMultiplier = getPrice('roofing', 'story_1');
      }
      
      // Calculate install labor hours
      let installHours = (roofArea / 100) * baseHoursPer100 * pitchMultiplier * storyMultiplier;
      
      // Tear-off labor (CALIBRATED: ~25 hours for 2000 sqft per John)
      let tearOffHours = 0;
      if (tearOffLayers > 0) {
        tearOffHours = (roofArea / 100) * 1.25 * tearOffLayers; // ~25 hrs for 2000 sqft
      }
      
      laborHours = installHours + tearOffHours;
      
      // Material costs per sqft
      let materialCostPerSqft = 0;
      switch(material) {
        case 'asphalt': 
        case '3tab':
          materialCostPerSqft = getPrice('roofing', 'mat_asphalt'); 
          break;
        case 'architectural': 
          materialCostPerSqft = getPrice('roofing', 'mat_arch'); 
          break;
        case 'metal': 
          materialCostPerSqft = getPrice('roofing', 'mat_metal'); 
          break;
        case 'tile': 
          materialCostPerSqft = getPrice('roofing', 'mat_tile'); 
          break;
        case 'slate': 
          materialCostPerSqft = getPrice('roofing', 'mat_slate'); 
          break;
        default: 
          materialCostPerSqft = getPrice('roofing', 'mat_arch');
      }
      
      // Base materials (shingles + underlayment + starter + ridge + nails)
      materialCost = roofArea * materialCostPerSqft;
      materialCost += roofArea * getPrice('roofing', 'underlayment_sqft'); // underlayment
      
      // Perimeter materials (drip edge, starter) - estimate perimeter
      const estimatedPerimeter = Math.sqrt(roofArea) * 4 * 1.2; // rough perimeter estimate
      materialCost += estimatedPerimeter * getPrice('roofing', 'drip_edge_lf');
      materialCost += estimatedPerimeter * 0.5 * getPrice('roofing', 'starter_lf'); // starter on eaves
      
      // Ridge (estimate ~15% of perimeter)
      const estimatedRidge = estimatedPerimeter * 0.15;
      materialCost += estimatedRidge * getPrice('roofing', 'ridge_cost');
      
      // Nails (1 box per 1000 sqft roughly)
      materialCost += Math.ceil(roofArea / 1000) * getPrice('roofing', 'nails_box');
      
      // Additional costs
      if (tearOffLayers > 0) {
        materialCost += getPrice('roofing', 'dumpster_fee') * tearOffLayers;
      }
      if (plywoodSheets > 0) {
        materialCost += plywoodSheets * getPrice('roofing', 'plywood_cost');
        laborHours += plywoodSheets * 0.25; // 15 min per sheet to install
      }
      if (chimneys > 0) {
        materialCost += getPrice('roofing', 'chimney_cost') * chimneys;
        laborHours += chimneys * 2; // 2 hours per chimney flashing
      }
      if (valleys > 0) {
        materialCost += valleys * 10 * getPrice('roofing', 'valley_cost'); // assume 10 lf per valley
        laborHours += valleys * 1; // 1 hour per valley
      }
      if (skylights > 0) {
        materialCost += getPrice('roofing', 'skylight_cost') * skylights;
        laborHours += skylights * 2; // 2 hours per skylight flashing
      }
      if (ridgeVentFeet > 0) {
        materialCost += ridgeVentFeet * getPrice('roofing', 'ridge_cost');
      }
      
      materialCost *= regionalMultiplier;
      equipmentCost = 450 + (stories === '2' ? 200 : 0) + (stories === '3+' ? 400 : 0);
      break;
      
    // ========== PAINTING - CALIBRATED ==========
    case 'painting':
      const paintSqft = parseFloat(data.squareFeet || data.paintArea) || 0;
      const paintSurface = (data.surface || data.paintType || 'exterior').toLowerCase();
      const paintStories = parseInt(data.stories) || 1;
      const paintCondition = data.condition || 'good';
      const paintCoats = parseInt(data.coats) || 2;
      const paintTrim = parseFloat(data.trim || data.trimFeet) || 0;
      const paintDoors = parseInt(data.doors) || 0;

      // Coverage and paint calculation
      const coveragePerGallon = paintSurface === 'exterior' ? 300 : 350;
      const gallonsNeeded = Math.ceil((paintSqft * paintCoats * 1.15) / coveragePerGallon);
      const paintUnitCost = paintSurface === 'exterior' 
        ? getPrice('painting', 'paint_gallon_premium') 
        : getPrice('painting', 'paint_gallon_std');
      const primerGallons = Math.ceil(gallonsNeeded * 0.4);
      const primerCost = primerGallons * getPrice('painting', 'primer_gallon');
      
      // Materials: paint + primer + supplies
      materialCost = (gallonsNeeded * paintUnitCost) + primerCost + 150; // supplies
      
      // Condition multipliers
      const conditionMultipliers = { 'good': 1.0, 'fair': 1.35, 'poor': 1.7 };
      const storyMultipliersPaint = { 1: 1.0, 2: 1.3, 3: 1.6 };
      
      // CALIBRATED: Labor hours (~1.5 hrs per gallon per coat is reasonable)
      laborHours = gallonsNeeded * 1.75 * paintCoats;
      laborHours *= (conditionMultipliers[paintCondition] || 1.0);
      if (paintSurface === 'exterior') {
        laborHours *= (storyMultipliersPaint[paintStories] || 1.0);
      }
      if (paintTrim > 0) laborHours += paintTrim / 40; // 40 lf per hour
      if (paintDoors > 0) laborHours += paintDoors * 1.0; // 1 hour per door

      materialCost *= regionalMultiplier;
      equipmentCost = paintSurface === 'exterior' ? 175 : 100;
      break;

    // ========== HVAC - CALIBRATED ==========
    case 'hvac':
      const hvacSqft = parseFloat(data.squareFootage || data.squareFeet) || 0;
      const systemType = (data.systemType || 'furnace').toLowerCase();
      const efficiency = (data.efficiency || 'standard').toLowerCase();
      const ductwork = (data.ductwork || 'existing').toLowerCase();
      const hvacStories = parseInt(data.stories) || 1;

      // Size multiplier based on sqft
      let sizeMultiplier = 1.0;
      if (hvacSqft < 1500) sizeMultiplier = getPrice('hvac', 'hvac_size_small');
      else if (hvacSqft <= 2500) sizeMultiplier = getPrice('hvac', 'hvac_size_med');
      else if (hvacSqft <= 4000) sizeMultiplier = getPrice('hvac', 'hvac_size_large');
      else sizeMultiplier = getPrice('hvac', 'hvac_size_xlarge');

      // Equipment and labor by system type - CALIBRATED LABOR HOURS
      let equipmentBaseCost = 0;
      switch(systemType) {
        case 'furnace': 
          equipmentBaseCost = efficiency === 'high' ? 5200 : getPrice('hvac', 'hvac_furnace'); 
          laborHours = 24; // was 12
          break;
        case 'ac': 
          equipmentBaseCost = efficiency === 'high' ? 7000 : getPrice('hvac', 'hvac_ac'); 
          laborHours = 20; // was 10
          break;
        case 'heatpump': 
          equipmentBaseCost = efficiency === 'high' ? 10000 : getPrice('hvac', 'hvac_heatpump'); 
          laborHours = 28; // was 14
          break;
        case 'minisplit': 
          equipmentBaseCost = getPrice('hvac', 'hvac_minisplit'); 
          laborHours = 14; // was 8
          break;
        case 'full':
        case 'complete':
          // Full system: furnace + AC
          equipmentBaseCost = getPrice('hvac', 'hvac_furnace') + getPrice('hvac', 'hvac_ac');
          if (efficiency === 'high') equipmentBaseCost *= 1.25;
          laborHours = 36; // full system install
          break;
        default: 
          equipmentBaseCost = getPrice('hvac', 'hvac_furnace'); 
          laborHours = 24;
      }

      // Materials: equipment + thermostat + misc supplies
      materialCost = (equipmentBaseCost * sizeMultiplier) + getPrice('hvac', 'hvac_thermostat') + 200;
      
      // Ductwork
      if (ductwork === 'new') {
        const ductFeet = Math.ceil(hvacSqft / 8);
        materialCost += ductFeet * getPrice('hvac', 'hvac_duct');
        laborHours += ductFeet / 15; // ~15 feet per hour
      } else if (ductwork === 'repair') {
        const ductFeet = Math.ceil(hvacSqft / 20);
        materialCost += ductFeet * 10;
        laborHours += ductFeet / 25;
      }

      // Multi-story adjustment
      if (hvacStories >= 2) laborHours *= 1.15;
      if (hvacStories >= 3) laborHours *= 1.1;
      
      materialCost *= regionalMultiplier;
      equipmentCost = 250;
      break;

    // ========== ELECTRICAL - CALIBRATED ==========
    case 'electrical':
      const elecServiceType = (data.serviceType || 'panel').toLowerCase();
      const amperage = parseInt(data.amperage) || 200;
      const elecSqft = parseFloat(data.squareFootage || data.squareFeet) || 0;
      const outletCount = parseInt(data.outletCount || data.outlets) || 0;
      const switchCount = parseInt(data.switchCount || data.switches) || 0;
      const fixtureCount = parseInt(data.fixtureCount || data.fixtures) || 0;
      const evCharger = data.evCharger === 'yes' || data.evCharger === true;

      // Panel work - CALIBRATED (John said ~$10k for 200 amp)
      if (elecServiceType === 'panel' || elecServiceType === 'panel_upgrade') {
        if (amperage <= 100) {
          materialCost = getPrice('electrical', 'elec_panel_100');
          laborHours = 12;
        } else if (amperage <= 200) {
          materialCost = getPrice('electrical', 'elec_panel_200');
          laborHours = 18; // was 10
        } else {
          materialCost = getPrice('electrical', 'elec_panel_400');
          laborHours = 24;
        }
        materialCost += 400; // breakers, wire, misc
      } else if (elecServiceType === 'rewire' && elecSqft > 0) {
        const wireFeet = elecSqft * 4;
        materialCost = wireFeet * 0.85 + 300;
        laborHours = (elecSqft / 100) * 4; // was 3
      } else {
        materialCost = 200;
        laborHours = 3;
      }

      // Outlets, switches, fixtures
      if (outletCount > 0) {
        materialCost += outletCount * getPrice('electrical', 'elec_outlet');
        laborHours += outletCount * 1.0; // was 0.75
      }
      if (switchCount > 0) {
        materialCost += switchCount * getPrice('electrical', 'elec_switch');
        laborHours += switchCount * 0.75; // was 0.5
      }
      if (fixtureCount > 0) {
        materialCost += fixtureCount * getPrice('electrical', 'elec_fixture');
        laborHours += fixtureCount * 1.25; // was 1.0
      }
      if (evCharger) {
        materialCost += getPrice('electrical', 'elec_ev');
        laborHours += 6; // was 4
      }

      materialCost *= regionalMultiplier;
      equipmentCost = 175;
      break;

    // ========== PLUMBING - CALIBRATED ==========
    case 'plumbing':
      const plumbServiceType = (data.plumbingType || data.serviceType || 'fixture').toLowerCase();
      const fixtureType = (data.fixtureType || 'toilet').toLowerCase();
      const plumbFixtureCount = parseInt(data.fixtureCount || data.fixtures) || 1;
      const plumbSqft = parseFloat(data.squareFootage || data.squareFeet) || 0;
      const waterHeaterType = (data.waterHeaterType || (data.tankless === 'yes' ? 'tankless' : 'tank')).toLowerCase();

      if (plumbServiceType === 'fixture') {
        const fixtureCosts = { 
          'toilet': getPrice('plumbing', 'plumb_toilet'), 
          'sink': getPrice('plumbing', 'plumb_sink'), 
          'shower': getPrice('plumbing', 'plumb_shower'), 
          'tub': getPrice('plumbing', 'plumb_tub'), 
          'dishwasher': getPrice('plumbing', 'plumb_dishwasher') 
        };
        const laborPerFixture = { 
          'toilet': 3.5,  // was 3
          'sink': 3,      // was 2.5
          'shower': 8,    // was 6
          'tub': 10,      // was 8
          'dishwasher': 2.5 // was 2
        };
        
        materialCost = (fixtureCosts[fixtureType] || 425) * plumbFixtureCount + 125;
        laborHours = (laborPerFixture[fixtureType] || 3.5) * plumbFixtureCount;
        
      } else if (plumbServiceType === 'repipe' && plumbSqft > 0) {
        const pipeFeet = plumbSqft * 0.5;
        materialCost = pipeFeet * 3.00 + 150; // was 2.50
        laborHours = (plumbSqft / 100) * 5; // was 4
        
      } else if (plumbServiceType === 'waterheater' || plumbServiceType === 'water_heater') {
        // CALIBRATED: John said tankless = $3k total
        if (waterHeaterType === 'tankless') {
          materialCost = getPrice('plumbing', 'plumb_heater_tankless') + 200; // unit + supplies
          laborHours = 12; // was 8
        } else {
          materialCost = getPrice('plumbing', 'plumb_heater_tank') + 150;
          laborHours = 8; // was 6
        }
      } else {
        materialCost = 400;
        laborHours = 4;
      }

      materialCost *= regionalMultiplier;
      equipmentCost = 125;
      break;

    // ========== FLOORING - CALIBRATED ==========
    case 'flooring':
      const floorArea = parseFloat(data.floorArea || data.squareFeet) || 0;
      const flooringType = (data.flooringType || 'carpet').toLowerCase();
      const removal = data.removal === 'yes' || data.removal === true;
      const baseboard = parseFloat(data.baseboard || data.baseboardFeet) || 0;

      const floorMaterialCosts = {
        'carpet': getPrice('flooring', 'floor_carpet'),
        'vinyl': getPrice('flooring', 'floor_vinyl'),
        'lvp': getPrice('flooring', 'floor_lvp'),
        'laminate': getPrice('flooring', 'floor_laminate'),
        'hardwood': getPrice('flooring', 'floor_hardwood_eng'),
        'hardwood_eng': getPrice('flooring', 'floor_hardwood_eng'),
        'hardwood_solid': getPrice('flooring', 'floor_hardwood_solid'),
        'tile': getPrice('flooring', 'floor_tile_ceramic'),
        'tile_ceramic': getPrice('flooring', 'floor_tile_ceramic'),
        'tile_porcelain': getPrice('flooring', 'floor_tile_porcelain')
      };
      
      const floorLaborRates = {
        'carpet': getPrice('flooring', 'floor_labor_carpet'),
        'vinyl': getPrice('flooring', 'floor_labor_vinyl'),
        'lvp': getPrice('flooring', 'floor_labor_vinyl'),
        'laminate': getPrice('flooring', 'floor_labor_vinyl'),
        'hardwood': getPrice('flooring', 'floor_labor_hardwood'),
        'hardwood_eng': getPrice('flooring', 'floor_labor_hardwood'),
        'hardwood_solid': getPrice('flooring', 'floor_labor_hardwood'),
        'tile': getPrice('flooring', 'floor_labor_tile'),
        'tile_ceramic': getPrice('flooring', 'floor_labor_tile'),
        'tile_porcelain': getPrice('flooring', 'floor_labor_tile')
      };

      // 10% waste factor
      const adjustedFloorArea = floorArea * 1.10;
      materialCost = adjustedFloorArea * (floorMaterialCosts[flooringType] || 4.50);
      materialCost += 100 + 125; // underlayment + supplies
      
      // Labor: rate per sqft / hourly rate = hours per sqft
      const laborRatePerSqft = floorLaborRates[flooringType] || 2.50;
      laborHours = floorArea * (laborRatePerSqft / hourlyRate) * hourlyRate / 50; // normalize to ~$50/hr baseline
      // Simplified: laborHours = floorArea * laborRatePerSqft / 50
      laborHours = floorArea * laborRatePerSqft / 50;
      
      if (removal) {
        materialCost += floorArea * getPrice('flooring', 'floor_removal');
        laborHours += floorArea * 0.025; // 25 sqft per hour removal
      }
      if (baseboard > 0) {
        materialCost += baseboard * getPrice('flooring', 'floor_baseboard');
        laborHours += baseboard / 25; // 25 lf per hour
      }

      materialCost *= regionalMultiplier;
      equipmentCost = 125;
      break;

    // ========== DRYWALL - CALIBRATED ==========
    case 'drywall':
      const drywallSqft = parseFloat(data.squareFeet || data.wallArea) || 0;
      const drywallServiceType = (data.serviceType || 'installation').toLowerCase();
      const finishLevel = (data.finishLevel || 'smooth').toLowerCase();
      const ceilingHeight = parseInt(data.ceilingHeight) || 8;

      if (drywallServiceType === 'installation') {
        const adjustedDrywallSqft = drywallSqft * 1.12; // 12% waste
        const sheetsNeeded = Math.ceil(adjustedDrywallSqft / 32);
        
        // Materials
        materialCost = (sheetsNeeded * getPrice('drywall', 'drywall_sheet_half')) +
                       (Math.ceil(sheetsNeeded / 4) * getPrice('drywall', 'joint_compound_bucket')) +
                       (Math.ceil(sheetsNeeded / 8) * getPrice('drywall', 'drywall_tape_roll')) +
                       (Math.ceil(sheetsNeeded / 15) * getPrice('drywall', 'corner_bead_8ft')) +
                       (Math.ceil(sheetsNeeded / 5) * getPrice('drywall', 'screws_box')) +
                       75; // misc supplies
        
        // Labor: hang + tape + sand
        const hangHours = drywallSqft * getPrice('drywall', 'drywall_hang_labor') / 50;
        const tapeHours = drywallSqft * getPrice('drywall', 'drywall_tape_labor') / 50;
        const sandHours = drywallSqft * getPrice('drywall', 'drywall_sand_labor') / 50;
        laborHours = hangHours + tapeHours + sandHours;
        
        // Finish level multiplier
        if (finishLevel === 'smooth' || finishLevel === 'level4') {
          laborHours *= getPrice('drywall', 'finish_level_4');
        } else if (finishLevel === 'level5') {
          laborHours *= getPrice('drywall', 'finish_level_5');
        }
        
        // Ceiling height adjustment
        if (ceilingHeight >= 10) laborHours *= 1.2;
        if (ceilingHeight >= 12) laborHours *= 1.15;
        
      } else if (drywallServiceType === 'repair') {
        materialCost = 175;
        laborHours = 4;
      } else {
        materialCost = 125;
        laborHours = 3;
      }

      materialCost *= regionalMultiplier;
      equipmentCost = 100;
      break;

    // ========== SIDING - CALIBRATED ==========
    case 'siding':
      const sidingSqft = parseFloat(data.squareFeet || data.sidingArea) || 0;
      const sidingType = (data.sidingType || 'vinyl').toLowerCase();
      const sidingStories = parseInt(data.stories) || 1;
      const sidingRemoval = data.removal === 'yes' || data.removal === true;
      const sidingTrim = parseFloat(data.trim || data.trimFeet) || 0;

      const sidingMaterialCosts = {
        'vinyl': getPrice('siding', 'siding_vinyl'),
        'fiber_cement': getPrice('siding', 'siding_fiber_cement'),
        'hardie': getPrice('siding', 'siding_fiber_cement'),
        'wood': getPrice('siding', 'siding_wood'),
        'metal': getPrice('siding', 'siding_metal'),
        'aluminum': getPrice('siding', 'siding_metal'),
        'stucco': getPrice('siding', 'siding_stucco')
      };
      
      const sidingLaborCosts = {
        'vinyl': getPrice('siding', 'siding_labor_vinyl'),
        'fiber_cement': getPrice('siding', 'siding_labor_fiber'),
        'hardie': getPrice('siding', 'siding_labor_fiber'),
        'wood': getPrice('siding', 'siding_labor_wood'),
        'metal': getPrice('siding', 'siding_labor_metal'),
        'aluminum': getPrice('siding', 'siding_labor_metal'),
        'stucco': getPrice('siding', 'siding_labor_stucco')
      };

      // 12% waste factor
      const adjustedSidingSqft = sidingSqft * 1.12;
      materialCost = adjustedSidingSqft * (sidingMaterialCosts[sidingType] || 5.50);
      materialCost += getPrice('siding', 'housewrap_roll') * Math.ceil(sidingSqft / 1350); // 1 roll per 1350 sqft
      materialCost += 200; // j-channel, corners, misc
      
      // Labor
      const sidingLaborRate = sidingLaborCosts[sidingType] || 3.50;
      laborHours = sidingSqft * sidingLaborRate / 50; // normalize to ~$50/hr
      
      // Story multiplier
      const sidingStoryMults = { 1: 1.0, 2: 1.25, 3: 1.5 };
      laborHours *= (sidingStoryMults[sidingStories] || 1.0);
      
      if (sidingRemoval) {
        materialCost += 450; // dumpster
        laborHours += sidingSqft * 0.02; // removal labor
      }
      if (sidingTrim > 0) {
        materialCost += sidingTrim * 5.50;
        laborHours += sidingTrim / 25;
      }

      materialCost *= regionalMultiplier;
      equipmentCost = 200 + (sidingStories >= 2 ? 150 : 0);
      break;

    // ========== DEFAULT ==========
    default:
      console.warn(`⚠️ Unknown trade: ${trade} - using generic calculation`);
      laborHours = 12;
      materialCost = 750;
      equipmentCost = 125;
  }

  // ============================================
  // FINAL CALCULATIONS
  // ============================================
  const laborCost = laborHours * hourlyRate;
  let totalCost = laborCost + materialCost + equipmentCost;

  // Apply contractor markup
  if (contractorMarkup && contractorMarkup !== 1.0) {
    const beforeMarkup = totalCost;
    totalCost = totalCost * contractorMarkup;
    console.log(`💰 Contractor markup applied: $${beforeMarkup.toFixed(2)} × ${contractorMarkup} = $${totalCost.toFixed(2)}`);
  }

  console.log(`✅ Calculation complete: $${totalCost.toFixed(2)}`);
  console.log(`   Labor: ${laborHours.toFixed(2)} hrs × $${hourlyRate}/hr = $${laborCost.toFixed(2)}`);
  console.log(`   Materials: $${materialCost.toFixed(2)}`);
  console.log(`   Equipment: $${equipmentCost.toFixed(2)}`);
  if (contractorMarkup !== 1.0) console.log(`   Markup: ${contractorMarkup}x`);

  return {
    laborHours: parseFloat(laborHours.toFixed(2)),
    laborRate: hourlyRate,
    laborCost: parseFloat(laborCost.toFixed(2)),
    materialCost: parseFloat(materialCost.toFixed(2)),
    equipmentCost: parseFloat(equipmentCost.toFixed(2)),
    totalCost: parseFloat(totalCost.toFixed(2)),
    contractorMarkup: contractorMarkup
  };
}

// ========== PDF GENERATION FUNCTION ==========
async function generateEstimatePDF(estimateData) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const branding = estimateData.contractorBranding;
      const primaryColor = branding?.primaryColor || '#2563eb';

      // ========== CONTRACTOR HEADER ==========
      if (branding) {
        // Try to add logo
        if (branding.logoUrl) {
          try {
            const axios = require('axios');
            const logoResponse = await axios.get(branding.logoUrl, { 
              responseType: 'arraybuffer',
              timeout: 5000 
            });
            const logoBuffer = Buffer.from(logoResponse.data, 'binary');
            doc.image(logoBuffer, 50, 50, { width: 120 });
            doc.moveDown(4);
          } catch (logoError) {
            console.error('Logo load failed:', logoError.message);
            // Fall back to text header
            doc.fontSize(24).fillColor(primaryColor).text(branding.companyName || 'Estimate', { align: 'center' });
            doc.moveDown(0.5);
          }
        } else {
          // No logo - use company name
          doc.fontSize(24).fillColor(primaryColor).text(branding.companyName || 'Estimate', { align: 'center' });
          doc.moveDown(0.5);
        }
        
        // Contractor contact info
        doc.fontSize(9).fillColor('#666');
        const contactParts = [];
        if (branding.phone) contactParts.push(branding.phone);
        if (branding.email) contactParts.push(branding.email);
        if (contactParts.length > 0) {
          doc.text(contactParts.join('  |  '), { align: 'center' });
        }
        if (branding.address || branding.city) {
          const addressParts = [];
          if (branding.address) addressParts.push(branding.address);
          if (branding.city) addressParts.push(branding.city);
          if (branding.state) addressParts.push(branding.state);
          if (branding.zip) addressParts.push(branding.zip);
          doc.text(addressParts.join(', '), { align: 'center' });
        }
        doc.moveDown(1);
      } else {
        // Default header
        doc.fontSize(24).fillColor(primaryColor).text('Estimate', { align: 'center' });
        doc.moveDown(0.5);
      }

      doc.fontSize(10).fillColor('#666').text(`Estimate #${estimateData.id}`, { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#999').text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
      doc.moveDown(2);
      // ========== END CONTRACTOR HEADER ==========

      // Customer Info
      doc.fontSize(14).fillColor(primaryColor).text('Customer Information', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#000');
      doc.text(`Name: ${estimateData.customerName}`);
      doc.text(`Email: ${estimateData.customerEmail}`);
      if (estimateData.customerPhone) doc.text(`Phone: ${estimateData.customerPhone}`);
      doc.text(`Address: ${estimateData.propertyAddress}, ${estimateData.city}, ${estimateData.state} ${estimateData.zipCode}`);
      doc.moveDown(2);

      // ========== SCOPE OF WORK SECTION ==========
      const tradeName = estimateData.trade.charAt(0).toUpperCase() + estimateData.trade.slice(1);
      doc.fontSize(14).fillColor(primaryColor).text(`${tradeName} Project Scope`, { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#000');
      
      const details = estimateData.tradeDetails || {};
      const scopeItems = [];
      
      // Common fields
      if (details.squareFeet) scopeItems.push(`${details.squareFeet} sq ft`);
      
      // Roofing fields
      if (details.pitch && details.pitch !== '') scopeItems.push(`Pitch: ${details.pitch}`);
      if (details.stories && details.stories !== '') scopeItems.push(`Stories: ${details.stories}`);
      if (details.material && details.material !== '') scopeItems.push(`Material: ${details.material}`);
      if (details.layers && details.layers !== '' && details.layers !== '0') scopeItems.push(`Tear-off layers: ${details.layers}`);
      if (details.chimneys && details.chimneys !== '' && details.chimneys !== '0') scopeItems.push(`Chimneys: ${details.chimneys}`);
      if (details.skylights && details.skylights !== '' && details.skylights !== '0') scopeItems.push(`Skylights: ${details.skylights}`);
      if (details.valleys && details.valleys !== '' && details.valleys !== '0') scopeItems.push(`Valleys: ${details.valleys}`);
      if (details.plywoodSqft && details.plywoodSqft !== '' && details.plywoodSqft !== '0') scopeItems.push(`Plywood replacement: ${details.plywoodSqft} sq ft`);
      if (details.ridgeVentFeet && details.ridgeVentFeet !== '' && details.ridgeVentFeet !== '0') scopeItems.push(`Ridge vent: ${details.ridgeVentFeet} linear ft`);
      if (details.existingRoofType && details.existingRoofType !== '') scopeItems.push(`Existing roof: ${details.existingRoofType}`);
      
      // HVAC fields
      if (details.systemType) scopeItems.push(`System type: ${details.systemType}`);
      if (details.units && details.units !== '0') scopeItems.push(`Units: ${details.units}`);
      if (details.ductwork) scopeItems.push(`Ductwork: ${details.ductwork}`);
      
      // Electrical fields
      if (details.panelUpgrade && details.panelUpgrade !== 'none') scopeItems.push(`Panel upgrade: ${details.panelUpgrade}`);
      if (details.outlets && details.outlets !== '0') scopeItems.push(`Outlets: ${details.outlets}`);
      if (details.switches && details.switches !== '0') scopeItems.push(`Switches: ${details.switches}`);
      if (details.fixtures && details.fixtures !== '0') scopeItems.push(`Fixtures: ${details.fixtures}`);
      
      // Plumbing fields
      if (details.fixtureCount && details.fixtureCount !== '0') scopeItems.push(`Fixtures: ${details.fixtureCount}`);
      if (details.waterHeaterType) scopeItems.push(`Water heater: ${details.waterHeaterType}`);
      if (details.pipeType) scopeItems.push(`Pipe material: ${details.pipeType}`);
      
      // Flooring fields
      if (details.flooringType) scopeItems.push(`Flooring type: ${details.flooringType}`);
      if (details.removal === 'yes') scopeItems.push(`Includes removal of existing flooring`);
      
      // Painting fields
      if (details.surface) scopeItems.push(`Surface: ${details.surface}`);
      if (details.coats && details.coats !== '0') scopeItems.push(`Coats: ${details.coats}`);
      if (details.condition) scopeItems.push(`Surface condition: ${details.condition}`);
      
      // Drywall fields
      if (details.finishLevel) scopeItems.push(`Finish level: ${details.finishLevel}`);
      if (details.ceilingHeight) scopeItems.push(`Ceiling height: ${details.ceilingHeight} ft`);
      
      // Siding fields
      if (details.sidingType) scopeItems.push(`Siding type: ${details.sidingType}`);
      
      // Print scope items as bullet points
      scopeItems.forEach(item => {
        doc.text(`  •  ${item}`);
      });
      
      if (scopeItems.length === 0) {
        doc.text(`  •  ${tradeName} services as discussed`);
      }
      
      doc.moveDown(2);
      // ========== END SCOPE OF WORK ==========

      // ========== 📸 CUSTOMER PHOTOS SECTION ==========
      if (estimateData.photos && estimateData.photos.length > 0) {
        doc.fontSize(14).fillColor(primaryColor).text(`Customer Photos (${estimateData.photos.length})`, { underline: true });
        doc.moveDown(0.5);

        const axios = require('axios');
        const photosPerRow = 2;
        const photoWidth = 220;
        const photoHeight = 165;
        const photoSpacing = 20;
        const startX = 50;
        let currentX = startX;
        let currentY = doc.y;

        for (let i = 0; i < estimateData.photos.length; i++) {
          try {
            const response = await axios.get(estimateData.photos[i], { 
              responseType: 'arraybuffer',
              timeout: 5000 
            });
            const imageBuffer = Buffer.from(response.data, 'binary');

            if (currentY + photoHeight > doc.page.height - 100) {
              doc.addPage();
              currentY = 50;
              currentX = startX;
            }

            doc.image(imageBuffer, currentX, currentY, {
              width: photoWidth,
              height: photoHeight,
              fit: [photoWidth, photoHeight],
              align: 'center',
              valign: 'center'
            });

            currentX += photoWidth + photoSpacing;
            
            if ((i + 1) % photosPerRow === 0) {
              currentX = startX;
              currentY += photoHeight + photoSpacing;
            }
          } catch (photoError) {
            console.error(`Failed to load photo ${i + 1}:`, photoError.message);
          }
        }

        doc.y = currentY + photoHeight + 30;
        doc.moveDown(1);
      }
      // ========== END PHOTOS SECTION ==========

      // ========== COST BREAKDOWN (Respects Display Settings) ==========
      const displaySettings = estimateData.displaySettings || { showLabor: true, showMaterials: true, showEquipment: true, showTotal: true };
      
      if (displaySettings.showLabor || displaySettings.showMaterials || displaySettings.showEquipment) {
        doc.fontSize(14).fillColor(primaryColor).text('Cost Breakdown', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor('#000');
        
        if (displaySettings.showLabor) {
          doc.text(`Labor: ${estimateData.laborHours} hours @ $${estimateData.laborRate}/hr = $${estimateData.laborCost.toLocaleString()}`);
        }
        if (displaySettings.showMaterials) {
          doc.text(`Materials: $${estimateData.materialCost.toLocaleString()}`);
        }
        if (displaySettings.showEquipment) {
          doc.text(`Equipment: $${estimateData.equipmentCost.toLocaleString()}`);
        }
        doc.moveDown(1);
      }
      // ========== END COST BREAKDOWN ==========

      // Total
      doc.fontSize(18).fillColor(primaryColor);
      doc.text(`TOTAL ESTIMATE: $${estimateData.totalCost.toLocaleString()}`, { align: 'right' });
      doc.moveDown(2);

      // ========== DISCLAIMER ==========
      doc.moveDown(1);
      doc.fontSize(8).fillColor('#888');
      doc.text(
        'ESTIMATE ONLY — Actual prices may vary ±10-15% depending on site conditions, material availability, and seasonal factors. Final pricing confirmed after on-site assessment. This estimate is valid for 30 days.',
        { align: 'center', width: 500 }
      );
      // ========== END DISCLAIMER ==========

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}



// ========== CONTRACT GENERATION FUNCTION ==========
async function generateContract(estimateData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).fillColor('#2563eb').text('SERVICE AGREEMENT', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#666').text(`Contract #${estimateData.id}`, { align: 'center' });
      doc.fontSize(10).fillColor('#666').text(new Date().toLocaleDateString(), { align: 'center' });
      doc.moveDown(2);

      // Parties
      doc.fontSize(12).fillColor('#000').text('PARTIES', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      doc.text('This agreement is entered into between:');
      doc.moveDown(0.5);
      doc.text(`CONTRACTOR: InstaBid Inc.`);
      doc.text(`Email: ${process.env.CONTRACTOR_EMAIL || 'john@sitehypedesigns.com'}`);
      doc.moveDown(0.5);
      doc.text(`CLIENT: ${estimateData.customerName}`);
      doc.text(`Address: ${estimateData.propertyAddress}, ${estimateData.city}, ${estimateData.state} ${estimateData.zipCode}`);
      doc.text(`Email: ${estimateData.customerEmail}`);
      if (estimateData.customerPhone) doc.text(`Phone: ${estimateData.customerPhone}`);
      doc.moveDown(2);

      // Scope of Work
      doc.fontSize(12).fillColor('#000').text('SCOPE OF WORK', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      const tradeName = estimateData.trade.charAt(0).toUpperCase() + estimateData.trade.slice(1);
      doc.text(`Contractor agrees to provide ${tradeName} services at the property address listed above.`);
      doc.moveDown(2);

      // Payment Terms
      doc.fontSize(12).fillColor('#000').text('PAYMENT TERMS', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      doc.text(`Total Contract Price: $${estimateData.totalCost.toLocaleString()}`);
      doc.moveDown(0.5);
      doc.text('Payment Schedule:');
      doc.text(`• Deposit (50%): $${(estimateData.totalCost * 0.5).toLocaleString()} - Due upon signing`);
      doc.text(`• Final Payment (50%): $${(estimateData.totalCost * 0.5).toLocaleString()} - Due upon completion`);
      doc.moveDown(2);

      // Terms & Conditions
      doc.fontSize(12).fillColor('#000').text('TERMS & CONDITIONS', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(9);
      
      const terms = [
        '1. TIMELINE: Work will commence within 14 days of deposit receipt. Estimated completion: ' + (Math.ceil(estimateData.laborHours / 8)) + ' business days.',
        '2. WARRANTY: All work is warranted for 1 year from completion date against defects in workmanship.',
        '3. PERMITS: Contractor will obtain all necessary permits. Costs included in estimate.',
        '4. CHANGES: Any changes to scope must be agreed upon in writing and may affect total cost.',
        '5. CANCELLATION: Client may cancel within 3 days of signing for full refund of deposit.',
        '6. LIABILITY: Contractor maintains liability insurance and workers compensation coverage.',
        '7. DISPUTES: Any disputes will be resolved through binding arbitration in contractor\'s jurisdiction.'
      ];

      terms.forEach(term => {
        doc.text(term, { align: 'left' });
        doc.moveDown(0.3);
      });

      doc.moveDown(2);

      // Signatures
      doc.fontSize(12).fillColor('#000').text('SIGNATURES', { underline: true });
      doc.moveDown(1);
      
      doc.fontSize(10);
      doc.text('CONTRACTOR: ________________________     Date: __________');
      doc.moveDown(2);
      doc.text('CLIENT: ________________________     Date: __________');
      doc.moveDown(2);
      
      doc.fontSize(8).fillColor('#999');
      doc.text('By signing, both parties agree to the terms outlined in this contract.', { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// ========== EMAIL SENDING FUNCTION ==========
async function sendEstimateEmails(estimateData, pdfBuffer, contractBuffer) {
  const tradeName = estimateData.trade.charAt(0).toUpperCase() + estimateData.trade.slice(1);

  // Email to customer
const customerMailOptions = {
  from: process.env.FROM_EMAIL || 'instabidinc@gmail.com',
  to: estimateData.customerEmail,
  subject: `Your ${tradeName} Estimate & Contract`,
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #2563eb; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0;">Your Estimate is Ready!</h1>
      </div>
      <div style="padding: 20px; background: #f9fafb;">
        <p>Hi ${estimateData.customerName},</p>
        <p>Thank you for requesting an estimate for your ${tradeName} project.</p>
        <div style="background: #dbeafe; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="font-size: 24px; font-weight: bold; color: #1e40af; margin: 0;">
            Total Estimate: $${estimateData.totalCost.toLocaleString()}
          </p>
        </div>
        <p><strong>Two documents are attached:</strong></p>
        <ul>
          <li>Detailed Estimate (PDF)</li>
          <li>Service Contract (PDF)</li>
        </ul>
        
        <!-- STRIPE PAYMENT BUTTON -->
        <div style="margin-top: 30px; padding: 20px; background: #f0f9ff; border-radius: 8px; text-align: center;">
          <h3 style="color: #0369a1; margin-bottom: 10px;">Ready to get started?</h3>
          <p style="margin-bottom: 20px; color: #666;">Secure your start date with a 30% deposit ($${(estimateData.totalCost * 0.30).toLocaleString()})</p>
          <a href="${process.env.BACKEND_URL || 'https://instabid-backend-production.up.railway.app'}/api/create-checkout-session-email?estimateId=${estimateData.id}" 
             style="display: inline-block; background: #6366f1; color: white; padding: 15px 40px; 
                    text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
            💳 Pay Deposit & Schedule Start Date
          </a>
        </div>
        
        <p style="margin-top: 30px; color: #666; font-size: 12px;">This estimate is valid for 30 days.</p>
      </div>
    </div>
  `,
  attachments: [
    {
      filename: `estimate-${estimateData.id}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    },
    {
      filename: `contract-${estimateData.id}.pdf`,
      content: contractBuffer,
      contentType: 'application/pdf'
    }
  ]
};
  
  // Email to contractor
  const contractorMailOptions = {
    from: process.env.FROM_EMAIL || 'instabidinc@gmail.com',
    to: process.env.CONTRACTOR_EMAIL || 'john@sitehypedesigns.com',
    subject: `New ${tradeName} Lead - ${estimateData.customerName} ($${estimateData.totalCost.toLocaleString()})`,
    html: `
      <h2>🔔 New Estimate Request</h2>
      <p><strong>Customer:</strong> ${estimateData.customerName}</p>
      <p><strong>Email:</strong> ${estimateData.customerEmail}</p>
      <p><strong>Phone:</strong> ${estimateData.customerPhone || 'Not provided'}</p>
      <p><strong>Address:</strong> ${estimateData.propertyAddress}, ${estimateData.city}, ${estimateData.state} ${estimateData.zipCode}</p>
      <hr>
      <p><strong>Service:</strong> ${tradeName}</p>
      <p><strong>Labor:</strong> ${estimateData.laborHours}hrs @ $${estimateData.laborRate}/hr = $${estimateData.laborCost.toLocaleString()}</p>
      <p><strong>Materials:</strong> $${estimateData.materialCost.toLocaleString()}</p>
      <p><strong>Equipment:</strong> $${estimateData.equipmentCost.toLocaleString()}</p>
      <p style="font-size: 18px; font-weight: bold; color: #2563eb;"><strong>TOTAL:</strong> $${estimateData.totalCost.toLocaleString()}</p>
    `,
    attachments: [
      {
        filename: `estimate-${estimateData.id}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      },
      {
        filename: `contract-${estimateData.id}.pdf`,
        content: contractBuffer,
        contentType: 'application/pdf'
      }
    ]
  };

  await transporter.sendMail(customerMailOptions);
  console.log(`✅ Customer email sent to ${estimateData.customerEmail}`);
  
  await transporter.sendMail(contractorMailOptions);
  console.log(`✅ Contractor email sent to ${process.env.CONTRACTOR_EMAIL}`);
}

// ========== MAIN ESTIMATE SUBMISSION ENDPOINT (PUBLIC - API key in widget) ==========
app.post('/api/estimate', async (req, res) => {
  console.log('🔵 RAW REQUEST BODY:', JSON.stringify(req.body, null, 2));
  
  try {
    const {
      api_key, // 👈 Hidden in embed script, NOT entered by customer
      customerName,
      customer_name,
      customerEmail,
      customer_email,
      customerPhone,
      customer_phone,
      propertyAddress,
      address,
      city,
      state,
      zipCode,
      zip,
      trade,
      ...tradeSpecificFields
    } = req.body;

    // Validate API key and check subscription status
    if (!api_key) {
      return res.status(503).json({
        success: false,
        error: 'Service temporarily unavailable. Please contact the contractor directly.',
        user_message: 'This estimate tool is currently unavailable. Please contact us directly for a quote.'
      });
    }

   const contractorResult = await pool.query(
  'SELECT id, company_name, email, subscription_status, estimate_display FROM contractors WHERE api_key = $1',
  [api_key]
);

    if (contractorResult.rows.length === 0) {
      return res.status(503).json({
        success: false,
        error: 'Invalid API key',
        user_message: 'This estimate tool is currently unavailable. Please contact us directly for a quote.'
      });
    }

    const contractor = contractorResult.rows[0];

    // Check subscription status
    if (contractor.subscription_status !== 'active') {
      console.log(`⚠️ Estimate blocked - Contractor ${contractor.id} subscription status: ${contractor.subscription_status}`);
      return res.status(503).json({
        success: false,
        error: 'Contractor subscription inactive',
        user_message: 'This estimate tool is currently unavailable. Please contact us directly for a quote.'
      });
    }

    const finalZipCode = zipCode || zip || '';
    const finalCity = city || 'Unknown';  // ← FIXED
    const finalState = state || 'Unknown';  // ← FIXED

   // ✅ ROBUST FALLBACK: ZIP → STATE → NATIONAL
let regionalMultiplier = 1.0;
let msa = 'National Average';

try {
  // Try ZIP lookup first
  const zipResult = await pool.query(
    'SELECT msa_name FROM zip_metro_mapping WHERE zip_code = $1', 
    [finalZipCode]
  );
  
  if (zipResult.rows && zipResult.rows.length > 0) {
    msa = zipResult.rows[0].msa_name;
    console.log(`✅ Found MSA for ZIP ${finalZipCode}: ${msa}`);
  } else {
    console.log(`⚠️ ZIP ${finalZipCode} not found - falling back to state average`);
    
    // Fallback to state-level multiplier from cache
    regionalMultiplier = STATE_MULTIPLIERS_CACHE[state] || 1.0;
    msa = `${state} State Average (${regionalMultiplier}x)`;
    console.log(`✅ Using cached state multiplier for ${state}: ${regionalMultiplier}x`);
  }
} catch (error) {
  console.error('❌ Regional lookup error:', error);
  console.log('⚠️ Using national average (1.0x)');
}

    const contractor_id = contractor.id;

    const finalCustomerName = customerName || customer_name || req.body.name;
    const finalCustomerEmail = customerEmail || customer_email || req.body.email;
    const finalCustomerPhone = customerPhone || customer_phone || req.body.phone || '';
    const finalPropertyAddress = propertyAddress || address || '';
    
    console.log(`📋 Customer: ${finalCustomerName}, Trade: ${trade}`);
    console.log(`📍 Location: ${city}, ${state} ${finalZipCode}`);
    console.log(`🔐 Contractor: ${contractor.company_name} (ID: ${contractor_id})`);

    const hourlyRate = await getHourlyRate(state, trade, contractor_id);
    console.log(`💼 Labor rate for ${state}: $${hourlyRate}/hr`);
    
    const estimate = await calculateTradeEstimate(
      trade,
      tradeSpecificFields,
      hourlyRate,
      state,
      finalZipCode,
      contractor_id 
    );

    console.log(`💰 Estimate calculated: $${estimate.totalCost}`);
    
    // Calculate tax values for database storage
const taxRate = 8.25;
const taxAmount = estimate.totalCost * 0.0825;
const totalWithTax = estimate.totalCost * 1.0825;

const insertQuery = `
      INSERT INTO estimates (
        contractor_id,
        customer_name, customer_email, customer_phone,
        property_address, city, state, zip_code,
        trade, trade_details,
        labor_hours, labor_rate, labor_cost,
        material_cost, equipment_cost, total_cost,
        tax_rate, tax_amount, total_with_tax,
        photos,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW())
      RETURNING id
    `;

    const values = [
  contractor_id,                                  // $1
  finalCustomerName,                              // $2
  finalCustomerEmail,                             // $3
  finalCustomerPhone,                             // $4
  finalPropertyAddress,                           // $5
  finalCity,                                      // $6
  finalState,                                     // $7
  finalZipCode,                                   // $8
  trade,                                          // $9
  JSON.stringify(tradeSpecificFields),            // $10
  estimate.laborHours,                            // $11
  estimate.laborRate,                             // $12
  estimate.laborCost,                             // $13
  estimate.materialCost,                          // $14
  estimate.equipmentCost || 0,                    // $15
  estimate.totalCost,                             // $16
  taxRate,                                        // $17
  taxAmount,                                      // $18
  totalWithTax,                                   // $19
  JSON.stringify(tradeSpecificFields.photos || []) // $20
];

    const result = await pool.query(insertQuery, values);
    const estimateId = result.rows[0].id;

    console.log(`✅ Estimate #${estimateId} saved to database for contractor ${contractor_id}`);
    
      const pdfBuffer = await generateEstimatePDF({
      id: estimateId,
      customerName: finalCustomerName,
      customerEmail: finalCustomerEmail,
      customerPhone: finalCustomerPhone,
      propertyAddress: finalPropertyAddress,
      city,
      state,
      zipCode: finalZipCode,
      trade,
      tradeDetails: tradeSpecificFields,
      photos: tradeSpecificFields.photos || [],
      laborHours: estimate.laborHours,
      laborRate: estimate.laborRate,
      laborCost: estimate.laborCost,
      materialCost: estimate.materialCost,
      equipmentCost: estimate.equipmentCost || 0,
      totalCost: estimate.totalCost
    });

    console.log(`📄 PDF generated for estimate #${estimateId}`);

    const contractBuffer = await generateContract({
      id: estimateId,
      customerName: finalCustomerName,
      customerEmail: finalCustomerEmail,
      customerPhone: finalCustomerPhone,
      propertyAddress: finalPropertyAddress,
      city,
      state,
      zipCode: finalZipCode,
      trade,
      laborHours: estimate.laborHours,
      laborRate: estimate.laborRate,
      laborCost: estimate.laborCost,
      materialCost: estimate.materialCost,
      equipmentCost: estimate.equipmentCost || 0,
      totalCost: estimate.totalCost
    });

    console.log(`📝 Contract generated for estimate #${estimateId}`);

    await sendEstimateEmails(
      {
        id: estimateId,
        customerName: finalCustomerName,
        customerEmail: finalCustomerEmail,
        customerPhone: finalCustomerPhone,
        propertyAddress: finalPropertyAddress,
        city,
        state,
        zipCode: finalZipCode,
        trade,
        photos: tradeSpecificFields.photos || [],
        ...estimate
      },
      pdfBuffer,
      contractBuffer
    );

     // Get display settings (default to total only if not set)
    const displaySettings = contractor.estimate_display || {
      showLabor: false,
      showMaterials: false,
      showEquipment: false,
      showTotal: true
    };

    // Build line items based on contractor's display preferences
    const lineItems = [];
    if (displaySettings.showLabor) {
      lineItems.push({ description: 'Labor', amount: estimate.laborCost });
    }
    if (displaySettings.showMaterials) {
      lineItems.push({ description: 'Materials', amount: estimate.materialCost });
    }
    if (displaySettings.showEquipment) {
      lineItems.push({ description: 'Equipment', amount: estimate.equipmentCost || 0 });
    }

    res.json({
      success: true,
      estimateId,
      lineItems,
      displaySettings, // Pass to frontend for PDF generation
      subtotal: estimate.totalCost,
      tax: estimate.totalCost * 0.0825,
      total: estimate.totalCost * 1.0825,
      msa: msa,
      timeline: Math.ceil(estimate.laborHours / 8) + ' days',
      estimate: {
        totalCost: estimate.totalCost,
        laborCost: estimate.laborCost,
        materialCost: estimate.materialCost,
        equipmentCost: estimate.equipmentCost || 0,
        laborHours: estimate.laborHours,
        laborRate: estimate.laborRate
      }
    });


  } catch (error) {
    console.error('❌ Estimate submission error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      user_message: 'An error occurred. Please try again or contact us directly.'
    });
  }
});

// GET all estimates
app.get('/api/estimates', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        contractor_id as "contractorId",
        customer_name as "customerName",
        customer_email as "customerEmail",
        customer_phone as "customerPhone",
        property_address as "address",
        city,
        state,
        zip_code as "zipCode",
        trade,
        material_cost as "materialsCost",
        labor_cost as "laborCost",
        total_cost as "totalCost",
        tax_rate as "taxRate",
        tax_amount as "taxAmount",
        total_with_tax as "totalWithTax",
        created_at as "createdAt"
      FROM estimates 
      ORDER BY created_at DESC
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching estimates:', error);
    res.status(500).json({ error: 'Failed to fetch estimates' });
  }
});

// GET single estimate by ID
app.get('/api/estimates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        id,
        contractor_id as "contractorId",
        customer_name as "customerName",
        customer_email as "customerEmail",
        customer_phone as "customerPhone",
        property_address as "address",
        city,
        state,
        zip_code as "zipCode",
        trade,
        material_cost as "materialsCost",
        labor_cost as "laborCost",
        total_cost as "totalCost",
        tax_rate as "taxRate",
        tax_amount as "taxAmount",
        total_with_tax as "totalWithTax",
        trade_details as "projectDetails",
        photos,
        created_at as "createdAt"
      FROM estimates 
      WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Estimate not found' });
    }
    
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('Error fetching estimate:', error);
    res.status(500).json({ error: 'Failed to fetch estimate' });
  }
});

// MSA Lookup endpoint for material list generator
app.get('/api/msa-lookup', async (req, res) => {
  const { zip, state } = req.query;
  
  if (!zip) {
    return res.json({ 
      material_index: 1.00, 
      labor_index: 1.00, 
      msa_name: 'National Average' 
    });
  }
  
  try {
    // Try ZIP lookup first
    const zipResult = await pool.query(
      'SELECT msa_name, state FROM zip_metro_mapping WHERE zip_code = $1',
      [zip]
    );
    
    if (zipResult.rows.length > 0) {
      const msaName = zipResult.rows[0].msa_name;
      const msaState = zipResult.rows[0].state;
      
      // Get regional multiplier from cache
      const multiplier = STATE_MULTIPLIERS_CACHE[msaState] || 1.00;
      
      console.log(`✅ Found MSA for ZIP ${zip}: ${msaName} (${msaState}) - multiplier: ${multiplier}x`);
      
      return res.json({
        msa_name: msaName,
        material_index: multiplier,
        labor_index: multiplier
      });
    }
    
    // ZIP not found - use state multiplier if provided
    if (state) {
      const multiplier = STATE_MULTIPLIERS_CACHE[state] || 1.00;
      
      console.log(`⚠️ No MSA found for ZIP ${zip} - using ${state} state multiplier: ${multiplier}x`);
      
      return res.json({ 
        material_index: multiplier, 
        labor_index: multiplier, 
        msa_name: `${state} State Average` 
      });
    }
    
    // No ZIP or state - return national average
    console.log(`⚠️ No MSA or state found for ZIP ${zip} - using national average`);
    
    return res.json({ 
      material_index: 1.00, 
      labor_index: 1.00, 
      msa_name: 'National Average' 
    });
    
  } catch (error) {
    console.error('❌ MSA lookup error:', error);
    
    return res.json({ 
      material_index: 1.00, 
      labor_index: 1.00, 
      msa_name: 'National Average' 
    });
  }
});



// Standalone PDF generation endpoint
app.post('/api/generate-pdf', async (req, res) => {
  try {
    const data = req.body;
    
    console.log('📸 Received photos in request:', data.photos);
    console.log('📸 Photo count:', data.photos?.length || 0);
    
    // Get contractor display settings
    let displaySettings = { showLabor: false, showMaterials: false, showEquipment: false, showTotal: true };
    
    if (data.api_key) {
      const contractorResult = await pool.query(
        'SELECT id, estimate_display FROM contractors WHERE api_key = $1',
        [data.api_key]
      );
      
      if (contractorResult.rows.length > 0 && contractorResult.rows[0].estimate_display) {
        displaySettings = contractorResult.rows[0].estimate_display;
        console.log('📋 Using contractor display settings:', displaySettings);
      }
    }
    
    const hourlyRate = await getHourlyRate(data.state, data.trade);
    
    const estimate = await calculateTradeEstimate(
      data.trade,
      data,
      hourlyRate,
      data.state,
      data.zip
    );
    
    const pdfBuffer = await generateEstimatePDF({
      id: 'DRAFT',
      customerName: data.name,
      customerEmail: data.email,
      customerPhone: data.phone || '',
      propertyAddress: data.address,
      city: data.city,
      state: data.state,
      zipCode: data.zip,
      trade: data.trade,
      tradeDetails: data,
      photos: data.photos || [],
      displaySettings: displaySettings,
      ...estimate
    });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="estimate-${data.name.replace(/\s+/g, '-')}.pdf"`);
    res.send(pdfBuffer);
    
    console.log(`📄 PDF downloaded by ${data.name} with ${data.photos?.length || 0} photos`);
    
  } catch (error) {
    console.error('❌ PDF generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Standalone Contract generation endpoint
app.post('/api/generate-contract', async (req, res) => {
  try {
    console.log('📝 Contract request received:', req.body);
    
    const data = req.body;
    
    const hourlyRate = await getHourlyRate(data.state, data.zip);
    
    const estimate = await calculateTradeEstimate(
      data.trade,
      data,
      hourlyRate,
      data.state,
      data.zip
    );
    
    const contractBuffer = await generateContract({
      id: 'DRAFT',
      customerName: data.name,
      customerEmail: data.email,
      customerPhone: data.phone || '',
      propertyAddress: data.address,
      city: data.city,
      state: data.state,
      zipCode: data.zip,
      trade: data.trade,
      ...estimate
    });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="contract-${data.name.replace(/\s+/g, '-')}.pdf"`);
    res.send(contractBuffer);
    
    console.log(`✅ Contract downloaded by ${data.name}`);
    
  } catch (error) {
    console.error('❌ Contract generation error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ============================================
// DASHBOARD CONFIG (PROTECTED)
// ============================================

// GET config for dashboard - merges defaults + overrides
app.get('/api/config/:section', requireAuth, (req, res) => {
  const section = req.params.section;
  const contractor_id = req.contractor.contractor_id;
  
  if (!DEFAULT_PRICING[section]) {
    return res.status(404).json({ 
      success: false, 
      error: 'Section not found' 
    });
  }
  
  // Merge: defaults first, then contractor overrides
  const contractorOverrides = configData[contractor_id]?.[section] || {};
  const merged = {
    ...DEFAULT_PRICING[section],
    ...contractorOverrides
  };
  
  res.json({
    success: true,
    config: merged,
    overrides: Object.keys(contractorOverrides),
    overrideCount: Object.keys(contractorOverrides).length
  });
});

app.put('/api/config/:section', requireAuth, (req, res) => {
  const section = req.params.section;
  const contractor_id = req.contractor.contractor_id;
  const { config } = req.body;
  
  if (!config) {
    return res.status(400).json({ 
      success: false, 
      error: 'No config provided' 
    });
  }
  
  if (!DEFAULT_PRICING[section]) {
    return res.status(404).json({ 
      success: false, 
      error: 'Section not found' 
    });
  }
  
  // Only store overrides (values different from defaults)
  const overrides = {};
  Object.keys(config).forEach(key => {
    const value = parseFloat(config[key]);
    const defaultValue = DEFAULT_PRICING[section][key];
    
    if (!isNaN(value) && value !== defaultValue) {
      overrides[key] = value;
    }
  });
  
  // Initialize contractor config if needed
  if (!configData[contractor_id]) {
    configData[contractor_id] = {};
  }
  
  configData[contractor_id][section] = overrides;
  
  console.log(`✅ Contractor ${contractor_id} overrides for ${section}:`, overrides);
  
  res.json({
    success: true,
    message: `${section} configuration updated`,
    overrideCount: Object.keys(overrides).length,
    totalFields: Object.keys(DEFAULT_PRICING[section]).length
  });
});

// ============================================
// ADMIN PRICING ROUTES - /api/admin/pricing
// ============================================

// GET all state multipliers
app.get('/api/admin/pricing/states', requireAdminKey, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, state_code, cost_tier, multiplier, notes, updated_at 
      FROM regional_multipliers 
      ORDER BY state_code ASC
    `);

    
    res.json({
      success: true,
      states: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching state multipliers:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch state multipliers' });
  }
});

// POST update state multipliers (batch)
app.post('/api/admin/pricing/states', requireAdminKey, async (req, res) => {
  const { changes } = req.body;
  
  if (!changes || Object.keys(changes).length === 0) {
    return res.status(400).json({ success: false, error: 'No changes provided' });
  }
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const updates = [];
    for (const [stateCode, change] of Object.entries(changes)) {
      const newTier = change.new >= 1.15 ? 'high' : (change.new >= 0.95 ? 'medium' : 'low');
      
      await client.query(`
        UPDATE regional_multipliers 
        SET multiplier = $1, cost_tier = $2, updated_at = NOW() 
        WHERE state_code = $3
      `, [change.new, newTier, stateCode]);
      
      updates.push({ state: stateCode, old: change.old, new: change.new, tier: newTier });
    }
    
    await client.query('COMMIT');
    
    // Refresh the in-memory cache
    await loadStateMultipliers();
    
    console.log(`✅ Admin updated ${updates.length} state multipliers:`, updates);
    
    res.json({
      success: true,
      message: `Updated ${updates.length} state multiplier(s)`,
      updates
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating state multipliers:', error);
    res.status(500).json({ success: false, error: 'Failed to update state multipliers' });
  } finally {
    client.release();
  }
});

// ============================================
// STRIPE INTEGRATION
// ============================================
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Create checkout session (PUBLIC - customer-facing)
app.post('/api/create-checkout-session', async (req, res) => {
  const { estimateId } = req.body;

  try {
    const result = await pool.query(
      'SELECT * FROM estimates WHERE id = $1',
      [estimateId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Estimate not found' });
    }

    const estimate = result.rows[0];
    const totalAmount = parseFloat(estimate.total_cost);
    const depositAmount = Math.round(totalAmount * 0.30 * 100); // 30% in cents

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${estimate.trade} Project Deposit`,
            description: `30% deposit for estimate #${estimateId} - ${estimate.customer_name}`,
          },
          unit_amount: depositAmount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/schedule?session_id={CHECKOUT_SESSION_ID}&estimate_id=${estimateId}`,
      cancel_url: `${process.env.FRONTEND_URL}/?cancelled=true`,
      metadata: {
        estimate_id: estimateId,
        contractor_id: estimate.contractor_id,
        deposit_amount: (depositAmount / 100).toFixed(2),
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('❌ Stripe checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Email link version - redirects to Stripe checkout (PUBLIC)
app.get('/api/create-checkout-session-email', async (req, res) => {
  const { estimateId } = req.query;

  try {
    const result = await pool.query(
      'SELECT * FROM estimates WHERE id = $1',
      [estimateId]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('Estimate not found');
    }

    const estimate = result.rows[0];
    const totalAmount = parseFloat(estimate.total_cost);
    const depositAmount = Math.round(totalAmount * 0.30 * 100);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${estimate.trade} Project Deposit`,
            description: `30% deposit for estimate #${estimateId} - ${estimate.customer_name}`,
          },
          unit_amount: depositAmount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/schedule?session_id={CHECKOUT_SESSION_ID}&estimate_id=${estimateId}`,
      cancel_url: `${process.env.FRONTEND_URL}/?cancelled=true`,
      metadata: {
        estimate_id: estimateId,
        contractor_id: estimate.contractor_id,
        deposit_amount: (depositAmount / 100).toFixed(2),
      },
    });

    // Redirect to Stripe checkout
    res.redirect(session.url);
  } catch (error) {
    console.error('❌ Stripe checkout error:', error);
    res.status(500).send('Failed to create checkout session');
  }
});

// Stripe webhook (PUBLIC - called by Stripe)
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('⚠️ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { estimate_id, contractor_id, deposit_amount } = session.metadata;

    await pool.query(
      `INSERT INTO scheduled_jobs 
       (estimate_id, contractor_id, payment_status, deposit_amount, stripe_session_id, stripe_payment_intent)
       VALUES ($1, $2, 'deposit_paid', $3, $4, $5)`,
      [estimate_id, contractor_id, deposit_amount, session.id, session.payment_intent]
    );

    console.log(`✅ Deposit received for estimate #${estimate_id}`);
  }

  res.json({ received: true });
});

// Update contractor tax rate (PROTECTED)
app.post('/api/update-tax-rate', requireAuth, async (req, res) => {
  const { taxRate } = req.body;
  const contractor_id = req.contractor.contractor_id;

  try {
    await pool.query(
      'UPDATE contractors SET tax_rate = $1 WHERE id = $2',
      [taxRate, contractor_id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error updating tax rate:', error);
    res.status(500).json({ error: 'Failed to update tax rate' });
  }
});

// ============================================
// SCHEDULING & AVAILABILITY
// ============================================

// Verify Stripe payment session (PUBLIC - customer-facing)
app.get('/api/verify-payment', async (req, res) => {
  const { session_id } = req.query;

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    res.json({
      success: true,
      amount_paid: session.amount_total / 100,
      customer_email: session.customer_details?.email,
      metadata: session.metadata
    });
  } catch (error) {
    console.error('❌ Payment verification error:', error);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

// Get estimate details by ID (PUBLIC - customer-facing)
app.get('/api/estimate/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM estimates WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Estimate not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error fetching estimate:', error);
    res.status(500).json({ error: 'Failed to fetch estimate' });
  }
});

// Get contractor availability (PUBLIC - customer-facing, but filtered by contractor)
app.get('/api/availability', async (req, res) => {
  const { contractor_id } = req.query;

  if (!contractor_id) {
    return res.status(400).json({ error: 'contractor_id required' });
  }

  try {
    // Get dates from scheduled_jobs (customer bookings)
    const jobsResult = await pool.query(
      'SELECT start_date FROM scheduled_jobs WHERE contractor_id = $1 AND status != $2',
      [contractor_id, 'cancelled']
    );

    // Get dates from contractor_availability (Google Calendar blocks)
    const blocksResult = await pool.query(
      'SELECT date FROM contractor_availability WHERE contractor_id = $1 AND is_available = false AND date >= CURRENT_DATE',
      [contractor_id]
    );

    // Combine and deduplicate
    const jobDates = jobsResult.rows.map(row => new Date(row.start_date).toISOString().split('T')[0]);
    const blockDates = blocksResult.rows.map(row => new Date(row.date).toISOString().split('T')[0]);
    const allBlockedDates = [...new Set([...jobDates, ...blockDates])];

    res.json({
      contractor_id: contractor_id,
      available_dates: allBlockedDates  // Frontend expects blocked dates here
    });
  } catch (error) {
    console.error('❌ Error fetching availability:', error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

// Book a start date (PUBLIC - customer-facing after payment)
app.post('/api/book-date', async (req, res) => {
  const { estimate_id, start_date, contractor_id } = req.body;

  if (!estimate_id || !start_date || !contractor_id) {
    return res.status(400).json({ error: 'estimate_id, start_date, and contractor_id required' });
  }

  try {
    // Check if date is already booked
    const existingBooking = await pool.query(
      'SELECT * FROM scheduled_jobs WHERE contractor_id = $1 AND start_date = $2 AND status != $3',
      [contractor_id, start_date, 'cancelled']
    );

    if (existingBooking.rows.length > 0) {
      return res.status(400).json({ error: 'Date already booked' });
    }

    // Get estimate details (verify it belongs to this contractor)
    const estimateResult = await pool.query(
      'SELECT * FROM estimates WHERE id = $1 AND contractor_id = $2',
      [estimate_id, contractor_id]
    );

    if (estimateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Estimate not found or unauthorized' });
    }

    const estimate = estimateResult.rows[0];

    // Create scheduled job
    const insertResult = await pool.query(
      `INSERT INTO scheduled_jobs 
       (estimate_id, contractor_id, customer_name, customer_email, trade, start_date, status, total_amount, deposit_paid)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        estimate_id,
        contractor_id,
        estimate.customer_name,
        estimate.customer_email,
        estimate.trade,
        start_date,
        'scheduled',
        estimate.total_cost,
        (parseFloat(estimate.total_cost) * 0.30).toFixed(2)
      ]
    );

    const job = insertResult.rows[0];

    console.log(`✅ Job scheduled for ${start_date} - Estimate #${estimate_id} - Contractor ${contractor_id}`);

    // Write to Google Calendar if connected
    try {
      const contractorResult = await pool.query(
        'SELECT google_refresh_token FROM contractors WHERE id = $1',
        [contractor_id]
      );

      if (contractorResult.rows.length > 0 && contractorResult.rows[0].google_refresh_token) {
        oauth2Client.setCredentials({
          refresh_token: contractorResult.rows[0].google_refresh_token
        });

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const event = {
          summary: `${estimate.trade.toUpperCase()} - ${estimate.customer_name}`,
          description: `InstaBid Job\nEstimate #${estimate_id}\nCustomer: ${estimate.customer_name}\nEmail: ${estimate.customer_email}\nTotal: $${estimate.total_cost}`,
          start: {
            date: start_date,
            timeZone: 'America/Los_Angeles'
          },
          end: {
            date: start_date,
            timeZone: 'America/Los_Angeles'
          },
          colorId: '9' // Blue color for customer jobs
        };

        const calendarEvent = await calendar.events.insert({
          calendarId: 'primary',
          resource: event
        });

        // Save Google Calendar event ID to scheduled_jobs
        await pool.query(
          'UPDATE scheduled_jobs SET google_event_id = $1 WHERE id = $2',
          [calendarEvent.data.id, job.id]
        );

        console.log(`✅ Added to Google Calendar: ${calendarEvent.data.htmlLink}`);
      }
    } catch (calError) {
      console.error('⚠️ Failed to add to Google Calendar (job still saved):', calError.message);
    }

    // TODO: Send confirmation email to customer & contractor

    res.json({
      success: true,
      job: job
    });
  } catch (error) {
    console.error('❌ Error booking date:', error);
    res.status(500).json({ error: 'Failed to book date' });
  }
});

// ============================================
// GOOGLE CALENDAR INTEGRATION (PROTECTED)
// ============================================
const { google } = require('googleapis');

// OAuth2 client setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || `${process.env.BACKEND_URL}/api/google/callback`
);

// 1. Get OAuth URL (PROTECTED)
app.get('/api/google/auth-url', requireAuth, (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar.readonly',
            'https://www.googleapis.com/auth/calendar.events'],
    prompt: 'consent',
    state: req.contractor.contractor_id.toString() // Pass contractor ID through OAuth flow
  });
  
  res.json({ auth_url: authUrl });
});

// 2. OAuth callback (PUBLIC - Google redirects here)
app.get('/api/google/callback', async (req, res) => {
  const { code, state } = req.query;
  const contractor_id = parseInt(state) || 1; // Get contractor ID from state
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    // Store BOTH access_token and refresh_token in database
    await pool.query(
      `UPDATE contractors 
       SET google_access_token = $1,
           google_refresh_token = $2, 
           google_calendar_id = 'primary',
           last_calendar_sync = NOW()
       WHERE id = $3`,
      [tokens.access_token, tokens.refresh_token, contractor_id]
    );
    
    console.log(`✅ Google Calendar connected for contractor ${contractor_id}`);
    
    // Close popup window
    res.send('<script>window.close();</script>');
  } catch (error) {
    console.error('❌ OAuth callback error:', error);
    res.status(500).send('Authorization failed');
  }
});

// 3. Check connection status (PROTECTED)
app.get('/api/google/status', requireAuth, async (req, res) => {
  const contractor_id = req.contractor.contractor_id;
  
  try {
    const result = await pool.query(
      'SELECT google_refresh_token, google_calendar_id, last_calendar_sync FROM contractors WHERE id = $1',
      [contractor_id]
    );
    
    if (result.rows.length === 0 || !result.rows[0].google_refresh_token) {
      return res.json({ connected: false });
    }
    
    const contractor = result.rows[0];
    
    // Get blocked dates
    const blockedDates = await pool.query(
      'SELECT DISTINCT start_date FROM scheduled_jobs WHERE contractor_id = $1 AND status != $2',
      [contractor_id, 'cancelled']
    );
    
    res.json({
      connected: true,
      email: req.contractor.email,
      last_sync: contractor.last_calendar_sync,
      blocked_dates: blockedDates.rows.map(r => r.start_date)
    });
  } catch (error) {
    console.error('❌ Status check error:', error);
    res.status(500).json({ connected: false });
  }
});

// 4. Sync calendar (PROTECTED)
app.post('/api/google/sync', requireAuth, async (req, res) => {
  const contractor_id = req.contractor.contractor_id;
  
  try {
    const result = await pool.query(
      'SELECT google_refresh_token FROM contractors WHERE id = $1',
      [contractor_id]
    );
    
    if (result.rows.length === 0 || !result.rows[0].google_refresh_token) {
      return res.status(401).json({ success: false, error: 'Calendar not connected' });
    }
    
    oauth2Client.setCredentials({
      refresh_token: result.rows[0].google_refresh_token
    });
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    
    const events = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime'
    });
    
    const busyDates = events.data.items
      .filter(event => event.start.date || event.start.dateTime)
      .map(event => {
        const dateStr = event.start.date || event.start.dateTime.split('T')[0];
        return dateStr;
      });
    
    const uniqueDates = [...new Set(busyDates)];
    
    // Clear old Google Calendar blocks (keep customer bookings in scheduled_jobs)
    await pool.query(
      'DELETE FROM contractor_availability WHERE contractor_id = $1 AND source = $2',
      [contractor_id, 'google_calendar']
    );
    
    // Insert new blocked dates
    for (const date of uniqueDates) {
      await pool.query(
        `INSERT INTO contractor_availability (contractor_id, date, is_available, source)
         VALUES ($1, $2, false, 'google_calendar')
         ON CONFLICT (contractor_id, date) DO UPDATE SET is_available = false, source = 'google_calendar'`,
        [contractor_id, date]
      );
    }
    
    await pool.query(
      'UPDATE contractors SET last_calendar_sync = NOW() WHERE id = $1',
      [contractor_id]
    );
    
    console.log(`✅ Calendar synced for contractor ${contractor_id}: ${uniqueDates.length} blocked dates`);
    
    res.json({
      success: true,
      blocked_dates: uniqueDates,
      count: uniqueDates.length
    });
  } catch (error) {
    console.error('❌ Calendar sync error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 5. Disconnect calendar (PROTECTED)
app.post('/api/google/disconnect', requireAuth, async (req, res) => {
  const contractor_id = req.contractor.contractor_id;
  
  try {
    await pool.query(
      `UPDATE contractors 
       SET google_refresh_token = NULL, 
           google_calendar_id = NULL,
           last_calendar_sync = NULL
       WHERE id = $1`,
      [contractor_id]
    );
    
    console.log(`✅ Google Calendar disconnected for contractor ${contractor_id}`);
    
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Disconnect error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// CONTRACTOR REGISTRATION & AUTH (PUBLIC)
// ============================================

// Register new contractor (PUBLIC - after Stripe payment)
app.post('/api/register', async (req, res) => {
  const { email, password, company_name, phone, stripe_session_id } = req.body;
  
  try {
    // Validate required fields
    if (!email || !password || !company_name) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email, password, and company name are required' 
      });
    }
    
    // Check if email already exists
    const existingUser = await pool.query(
      'SELECT id FROM contractors WHERE email = $1',
      [email]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ 
        success: false, 
        error: 'Email already registered' 
      });
    }
    
    // Hash password
    const password_hash = await bcrypt.hash(password, 10);
    
    // Generate unique API key
    const api_key = 'ib_' + crypto.randomBytes(32).toString('hex');
    
    // Create contractor account
    const result = await pool.query(
      `INSERT INTO contractors 
       (name, email, password_hash, company_name, phone, api_key, subscription_status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW())
       RETURNING id, email, company_name, api_key`,
      [company_name, email, password_hash, company_name, phone, api_key]
    );
    
    const contractor = result.rows[0];
    
    console.log('✅ New contractor registered:', contractor.email);
    
    res.json({
      success: true,
      contractor_id: contractor.id,
      email: contractor.email,
      company_name: contractor.company_name,
      api_key: contractor.api_key
    });
    
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Registration failed: ' + error.message 
    });
  }
});

// Login endpoint (PUBLIC)
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    // Find contractor by email
    const result = await pool.query(
      'SELECT id, email, password_hash, company_name, subscription_status FROM contractors WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid email or password' 
      });
    }
    
    const contractor = result.rows[0];
    
    // Verify password
    const passwordMatch = await bcrypt.compare(password, contractor.password_hash);
    
    if (!passwordMatch) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid email or password' 
      });
    }
    
    // Generate session token
    const session_token = crypto.randomBytes(32).toString('hex');
    const expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    
    // Save session
    await pool.query(
      'INSERT INTO contractor_sessions (contractor_id, session_token, expires_at) VALUES ($1, $2, $3)',
      [contractor.id, session_token, expires_at]
    );
    
    console.log('✅ Contractor logged in:', contractor.email);
    
    res.json({
      success: true,
      session_token: session_token,
      contractor_id: contractor.id,
      email: contractor.email,
      company_name: contractor.company_name
    });
    
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Login failed: ' + error.message 
    });
  }
});


// ============================================
// SESSION VERIFICATION MIDDLEWARE
// ============================================

function verifySession(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({ success: false, error: 'No session token provided' });
  }
  
  // Query sessions table to verify token is valid
  pool.query(
    'SELECT contractor_id FROM contractor_sessions WHERE session_token = $1 AND expires_at > NOW()',
    [token],
    (err, result) => {
      if (err || result.rows.length === 0) {
        return res.status(401).json({ success: false, error: 'Invalid or expired session' });
      }
      
      req.contractor_id = result.rows[0].contractor_id;
      next();
    }
  );
}

// ============================================
// COMPANY SETTINGS ENDPOINTS (PROTECTED)
// ============================================

// GET contractor profile data
app.get('/api/contractors/:id', verifySession, async (req, res) => {
  const { id } = req.params;
  
  // Security: Ensure contractor can only access their own data
  if (parseInt(id) !== req.contractor_id) {
    return res.status(403).json({ success: false, error: 'Unauthorized access' });
  }
  
  try {
    const result = await pool.query(
      'SELECT * FROM contractors WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Contractor not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error fetching contractor:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch contractor data' });
  }
});

// UPDATE contractor profile data
app.put('/api/contractors/:id', verifySession, async (req, res) => {
  const { id } = req.params;
  
  // Security: Ensure contractor can only update their own data
  if (parseInt(id) !== req.contractor_id) {
    return res.status(403).json({ success: false, error: 'Unauthorized access' });
  }
  
  const {
    company_name, phone, email, address, city, state, zip,
    license_number, primary_color, secondary_color, accent_color,
    tax_rate, default_markup, logo_url
  } = req.body;
  
  try {
    const result = await pool.query(`
      UPDATE contractors SET
        company_name = COALESCE($1, company_name),
        phone = COALESCE($2, phone),
        email = COALESCE($3, email),
        address = $4,
        city = $5,
        state = $6,
        zip = $7,
        license_number = $8,
        primary_color = COALESCE($9, primary_color),
        secondary_color = COALESCE($10, secondary_color),
        accent_color = COALESCE($11, accent_color),
        tax_rate = $12,
        default_markup = $13,
        logo_url = $14,
        updated_at = NOW()
      WHERE id = $15
      RETURNING *
    `, [
      company_name, phone, email, address, city, state, zip,
      license_number, primary_color, secondary_color, accent_color,
      tax_rate, default_markup, logo_url, id
    ]);
    
    console.log('✅ Contractor profile updated:', result.rows[0].email);
    
    res.json({ success: true, contractor: result.rows[0] });
  } catch (error) {
    console.error('❌ Error updating contractor:', error);
    res.status(500).json({ success: false, error: 'Failed to update contractor data' });
  }
});


// TEST SCRAPER - Single material only (SAFE)
/*app.get('/api/test-scraper-single', requireAuth, async (req, res) => {
  console.log('🧪 SINGLE MATERIAL TEST STARTED');
  res.json({ 
    message: 'Testing single material - check Railway logs',
    note: 'This will only scrape ONE material to test accuracy'
  });
  
  setImmediate(async () => {
    try {
      const { scrapeAllMaterials } = require('./scripts/scrape-homedepot-brightdata');
      await scrapeAllMaterials(true); // TEST MODE = true
      console.log('🧪 Single material test finished!');
    } catch (error) {
      console.error('🧪 TEST ERROR:', error.message);
      console.error(error.stack);
    }
  });
});

// FULL SCRAPER - All materials (USE WITH CAUTION)
app.get('/api/run-full-scraper', requireAuth, async (req, res) => {
  console.log('🚀 FULL SCRAPER STARTED');
  res.json({ 
    message: 'Full scraper started - check Railway logs',
    warning: 'This will scrape ALL materials and may use significant BrightData credits'
  });
  
  setImmediate(async () => {
    try {
      const { scrapeAllMaterials } = require('./scripts/scrape-homedepot-brightdata');
      await scrapeAllMaterials(false); // FULL MODE
      console.log('🚀 Full scraper finished!');
    } catch (error) {
      console.error('🚀 SCRAPER ERROR:', error.message);
      console.error(error.stack);
    }
  });
});*/

// IMPORT EXISTING BRIGHTDATA SNAPSHOTS
// OPTIONS preflight for import-snapshots
// OPTIONS preflight for import-snapshots
app.options('/api/import-snapshots', (req, res) => {
  const allowedOrigins = [
    'https://white-raven-264519.hostingersite.com',
    'http://localhost:3000'
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});
app.post('/api/import-snapshots', requireAuth, async (req, res) => {
  console.log('📂 SNAPSHOT IMPORT STARTED');
  
  const { snapshotData } = req.body;
  
  if (!snapshotData || !Array.isArray(snapshotData)) {
    return res.status(400).json({ 
      error: 'Missing snapshotData array in request body',
      example: 'Send POST with { "snapshotData": [array of products] }'
    });
  }
  
  console.log(`📦 Received ${snapshotData.length} products to process`);
  
  res.json({ 
    message: `Processing ${snapshotData.length} products - check logs for results`,
    note: 'Import running in background'
  });
  
  setImmediate(async () => {
    try {
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      
      const DEFAULT_REGION = 'National';
      
      // Load materials catalog
      const fs = require('fs');
      const path = require('path');
      const materialsPath = path.join(__dirname, 'homedepot_materials.json');
      const materials = JSON.parse(fs.readFileSync(materialsPath, 'utf8'));
      
      // Flatten materials
      const allMaterials = [];
      for (const [category, items] of Object.entries(materials)) {
        items.forEach(item => {
          allMaterials.push({
            ...item,
            category,
            keywordWords: item.keyword.toLowerCase().split(' ').filter(w => w.length > 2)
          });
        });
      }
      
      console.log(`📚 Loaded ${allMaterials.length} materials from catalog`);
      
      // Matching function
      function findMatchingMaterial(product) {
        if (product.error) return null;
        
        const price = parseFloat(product.final_price || product.initial_price || 0);
        if (price <= 0) return null;
        
        const category = (product.category?.name || '').toLowerCase();
        const rootCategory = (product.root_category?.name || '').toLowerCase();
        
        const isRelevant = category.includes('roof') || 
                          category.includes('shingle') ||
                          category.includes('hvac') ||
                          category.includes('plumbing') ||
                          category.includes('electrical') ||
                          rootCategory.includes('building');
        
        if (!isRelevant) return null;
        
        const titleLower = (product.product_name || product.title || '').toLowerCase();
        
        for (const material of allMaterials) {
          const matches = material.keywordWords.filter(word => titleLower.includes(word)).length;
          const threshold = Math.max(2, Math.floor(material.keywordWords.length * 0.4));
          
          if (matches >= threshold) {
            return { material, product, matchScore: matches };
          }
        }
        
        return null;
      }
      
      // Cache function
      async function cachePrice(sku, name, price, region) {
        const query = `
          INSERT INTO materials_cache (sku, name, price, region, last_updated)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (sku, region)
          DO UPDATE SET price = $3, name = $2, last_updated = NOW()
          RETURNING *
        `;
        
        try {
          const result = await pool.query(query, [sku, name, price, region]);
          return result.rows[0];
        } catch (error) {
          console.error(`❌ Cache failed: ${error.message}`);
          return null;
        }
      }
      
      // Process products
      let totalMatched = 0;
      let totalCached = 0;
      const matchedProducts = [];
      
      console.log('\n🔍 Processing products...\n');
      
      for (const product of snapshotData) {
        const match = findMatchingMaterial(product);
        
        if (match) {
          totalMatched++;
          
          const sku = product.sku || product.product_id || match.material.keyword.substring(0, 20);
          const name = product.product_name || product.title || match.material.name;
          const price = parseFloat(product.final_price || product.initial_price);
          
          matchedProducts.push({
            category: match.material.category,
            material: match.material.name,
            productName: name,
            price: price,
            sku: sku
          });
          
          const cached = await cachePrice(sku, name, price, DEFAULT_REGION);
          
          if (cached) {
            totalCached++;
            console.log(`✅ ${match.material.category} > ${match.material.name}`);
            console.log(`   ${name}`);
            console.log(`   $${price.toFixed(2)} | SKU: ${sku}\n`);
          }
        }
      }
      
      // Summary
      console.log('═══════════════════════════════════════════════════');
      console.log('📊 IMPORT SUMMARY');
      console.log('═══════════════════════════════════════════════════');
      console.log(`Total products scanned:  ${snapshotData.length}`);
      console.log(`Total matched:           ${totalMatched}`);
      console.log(`Total cached to DB:      ${totalCached}`);
      console.log('═══════════════════════════════════════════════════\n');
      
      // Breakdown by category
      const byCategory = {};
      matchedProducts.forEach(p => {
        if (!byCategory[p.category]) byCategory[p.category] = [];
        byCategory[p.category].push(p);
      });
      
      console.log('📦 BREAKDOWN BY CATEGORY:\n');
      for (const [category, products] of Object.entries(byCategory)) {
        console.log(`${category.toUpperCase()} (${products.length} products):`);
        products.forEach(p => {
          console.log(`  • ${p.material}: $${p.price.toFixed(2)}`);
        });
        console.log('');
      }
      
      // What's missing
      console.log('❓ MATERIALS NOT FOUND:\n');
      const foundMaterials = new Set(matchedProducts.map(p => p.material));
      
      for (const [category, items] of Object.entries(materials)) {
        const missing = items.filter(item => !foundMaterials.has(item.name));
        if (missing.length > 0) {
          console.log(`${category.toUpperCase()}:`);
          missing.forEach(m => console.log(`  ⚠️  ${m.name}`));
          console.log('');
        }
      }
      
      await pool.end();
      console.log('✅ Import complete!');
      
    } catch (error) {
      console.error('❌ IMPORT ERROR:', error.message);
      console.error(error.stack);
    }
  });
});

// TEST: Supabase connection
app.get('/api/test-supabase', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = $1', ['public']);
    const contractors = await pool.query('SELECT id, company_name, contact_email FROM contractors LIMIT 1');
    
    res.json({
      status: 'connected',
      public_tables: result.rows[0].table_count,
      sample_contractor: contractors.rows[0] || 'no contractors yet'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// MSA Cost Index Lookup
// MSA Cost Index Lookup
app.get('/api/msa-lookup', async (req, res) => {
  const { zip } = req.query;
  
  console.log(`🔍 MSA lookup requested for ZIP: ${zip}`);
  
  if (!zip) {
    return res.status(400).json({ error: 'ZIP code required' });
  }
  
  try {
    // Test connection first
    console.log('📊 Testing database connection...');
    await pool.query('SELECT NOW()');
    console.log('✅ Database connected');
    
    // Query zip_metro table
    console.log(`🔎 Querying zip_metro for ZIP ${zip}...`);
    const result = await pool.query(`
      SELECT 
        metro_code as msa_code,
        metro_name as msa_name,
        material_multiplier as material_index,
        labor_multiplier as labor_index
      FROM zip_metro
      WHERE zip_code = $1
      LIMIT 1
    `, [zip]);
    
    console.log(`📦 Query returned ${result.rows.length} rows`);
    
    if (result.rows.length === 0) {
      console.log(`⚠️ No MSA data found for ZIP ${zip}, using national average`);
      return res.json({
        msa_code: '00000',
        msa_name: 'National Average',
        material_index: 1.00,
        labor_index: 1.00
      });
    }
    
    console.log(`✅ MSA data found: ${result.rows[0].msa_name}`);
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('❌ MSA lookup error:', error.message);
    console.error('📋 Error details:', error);
    
    return res.json({
      msa_code: '00000',
      msa_name: 'National Average',
      material_index: 1.00,
      labor_index: 1.00
    });
  }
});


// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});