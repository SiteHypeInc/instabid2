//========================================
// INSTABID SERVER v3.0 - CALIBRATED PRICING
// Last Updated: January 2025
// ========================================

require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');
const PDFDocument = require('pdfkit');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { generateMaterialList } = require('./materialListGenerator');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - CORS with credentials support
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://white-raven-264519.hostingersite.com',
    'http://localhost:3000'
  ];
  
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Admin API Key authentication middleware
function requireAdminKey(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No API key provided' });
  }
  
  const apiKey = authHeader.split(' ')[1];
  const validKey = 'ib_74064730bb369effbc6bdfe50b5352e72180054351a5f3afb87839af29b029be';
  
  if (apiKey !== validKey) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  
  next();
}

// Session authentication middleware
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No session token provided' });
  }
  
  const sessionToken = authHeader.split(' ')[1];
  
  try {
    const result = await pool.query(
      `SELECT cs.contractor_id, c.company_name, c.email 
       FROM contractor_sessions cs
       JOIN contractors c ON cs.contractor_id = c.id
       WHERE cs.session_token = $1 AND cs.expires_at > NOW()`,
      [sessionToken]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    
    // Attach contractor info to request
    req.contractor = result.rows[0];
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}


app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));




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
// Synced with Dashboard Pricing Keys
// Last Updated: Jan 26, 2025
// ============================================
const DEFAULT_PRICING = {
  
  // ========== ROOFING (32 keys) ==========
  roofing: {
    // Pitch multipliers
    roof_pitch_low: 1.0,        // 0-4:12
    roof_pitch_medium: 1.15,    // 5-7:12
    roof_pitch_high: 1.35,      // 8-10:12
    roof_pitch_steep: 1.6,      // 11+:12
    // Story multipliers
    roof_story_1: 1.0,
    roof_story_2: 1.25,
    roof_story_3: 1.5,
    // Material costs per sqft
    roof_mat_asphalt_3tab: 4.50,
    roof_mat_architectural: 5.75,
    roof_mat_metal_standing: 9.50,
    roof_mat_metal_corrugated: 7.50,
    roof_mat_tile_clay: 12.00,
    roof_mat_tile_concrete: 10.00,
    roof_mat_slate: 18.00,
    roof_mat_wood_shake: 14.00,
    // Labor per square (100 sqft)
    roof_labor_rate: 75,
    roof_labor_per_square: 150,
    // Fixed costs
    roof_tearoff_layer: 125,    // per square per layer
    roof_plywood_sheet: 32,
    roof_dumpster: 650,
    // Linear foot items
    roof_drip_edge_lf: 2.75,
    roof_ice_shield_lf: 4.50,
    roof_starter_lf: 2.50,
    roof_ridge_cap_lf: 14,
    roof_valley_lf: 12,
    // Extras
    roof_underlayment_sqft: 0.45,
    roof_chimney_flash: 450,
    roof_skylight_flash: 400,
    roof_vent_pipe: 45,
    roof_ridge_vent_lf: 8,
    roof_nails_box: 45,
    // Permit
    roof_permit: 350
  },

  // ========== SIDING (21 keys) ==========
  siding: {
    // Material costs per sqft
    siding_vinyl: 5.50,
    siding_fiber_cement: 9.50,
    siding_wood_cedar: 14.00,
    siding_wood_pine: 10.00,
    siding_metal_aluminum: 8.00,
    siding_metal_steel: 9.00,
    siding_stucco: 11.00,
    siding_brick_veneer: 18.00,
    siding_stone_veneer: 22.00,
    // Labor per sqft
    siding_labor_rate: 65,
    siding_labor_vinyl: 3.50,
    siding_labor_fiber: 5.50,
    siding_labor_wood: 6.50,
    siding_labor_metal: 4.50,
    siding_labor_stucco: 7.50,
    // Extras & trim
    siding_housewrap_roll: 175,
    siding_j_channel_12ft: 12,
    siding_corner_post: 35,
    siding_soffit_sqft: 8,
    siding_fascia_lf: 6,
    // Story multiplier
    siding_story_2: 1.2,
    siding_story_3: 1.4
  },

  // ========== ELECTRICAL (20 keys) ==========
  electrical: {
    // Labor rates
    elec_labor_rate: 95,
    elec_labor_complex: 125,
    // Panel & service
    elec_panel_100: 2200,
    elec_panel_200: 3500,
    elec_panel_400: 5500,
    elec_subpanel_60: 1200,
    elec_subpanel_100: 1500,
    // Fixtures & devices
    elec_outlet_standard: 185,
    elec_outlet_gfci: 225,
    elec_outlet_240v: 350,
    elec_switch_standard: 145,
    elec_switch_dimmer: 185,
    elec_switch_smart: 250,
    elec_fixture_standard: 200,
    elec_fixture_recessed: 175,
    elec_ceiling_fan: 275,
    // Specialty
    elec_ev_charger_l2: 1800,
    elec_generator_hookup: 2200,
    elec_hot_tub: 1100,
    // Wire per foot
    elec_wire_14_2: 0.85,
    elec_wire_12_2: 1.10,
    elec_wire_10_2: 1.75
  },

  // ========== PAINTING (13 keys) ==========
  painting: {
    // Labor
    paint_labor_rate: 65,
    // Per sqft rates
    paint_interior_sqft: 4.50,
    paint_exterior_sqft: 3.50,
    paint_ceiling_sqft: 1.25,
    // Per unit rates
    paint_trim_lf: 1.50,
    paint_door: 75,
    paint_window: 50,
    // Prep work
    paint_power_wash_sqft: 0.25,
    paint_patch_minor: 150,
    paint_patch_moderate: 350,
    paint_patch_extensive: 750,
    // Specialty
    paint_lead_abatement: 500,
    paint_primer_coat: 0.50   // dramatic color change per sqft
  },

  // ========== DRYWALL (19 keys) ==========
  drywall: {
    // Labor
    drywall_labor_rate: 55,
    drywall_hang_sqft: 0.75,
    drywall_tape_sqft: 0.65,
    drywall_sand_sqft: 0.35,
    // Materials
    drywall_sheet_half: 12,      // 1/2" 4x8 sheet
    drywall_sheet_5_8: 18,       // 5/8" fire-rated
    drywall_joint_compound: 18,  // 5 gal bucket
    drywall_tape: 8,             // roll
    drywall_screws: 12,          // box
    drywall_corner_bead: 5,      // 8ft piece
    // Finish level multipliers
    drywall_finish_level_3: 1.0,   // standard
    drywall_finish_level_4: 1.25,  // smooth
    drywall_finish_level_5: 1.5,   // glass smooth
    // Texture per sqft
    drywall_texture_none: 0,
    drywall_texture_orange_peel: 0.80,
    drywall_texture_knockdown: 1.00,
    drywall_texture_popcorn: 0.65,
    // Ceiling height multipliers
    drywall_ceiling_10ft: 1.15,
    drywall_ceiling_12ft: 1.30,
    // Repair flat rates
    drywall_repair_minor: 175,
    drywall_repair_moderate: 400,
    drywall_repair_extensive: 900
  },

  // ========== PLUMBING (28 keys) ==========
  plumbing: {
    // Labor rates
    plumb_labor_rate: 95,
    plumb_labor_emergency: 175,
    plumb_service_call: 95,
    // Fixture installs (labor + basic materials)
    plumb_toilet: 375,
    plumb_sink_bath: 350,
    plumb_sink_kitchen: 550,
    plumb_faucet_bath: 225,
    plumb_faucet_kitchen: 300,
    plumb_shower_valve: 450,
    plumb_tub: 1200,
    plumb_dishwasher: 200,
    plumb_garbage_disposal: 325,
    plumb_ice_maker: 150,
    // Water heaters (installed)
    plumb_heater_tank_40: 1200,
    plumb_heater_tank_50: 1600,
    plumb_heater_tankless_gas: 3500,
    plumb_heater_tankless_elec: 2200,
    // Water systems
    plumb_water_softener: 1800,
    plumb_sump_pump: 650,
    // Repipe per linear foot
    plumb_repipe_pex_lf: 2.50,
    plumb_repipe_copper_lf: 4.50,
    // Big jobs
    plumb_main_line: 1200,
    plumb_gas_line_new: 500,
    // Access type multipliers
    plumb_access_basement: 1.0,
    plumb_access_crawlspace: 1.15,
    plumb_access_slab: 1.35,
    // Water heater location multipliers
    plumb_location_garage: 1.0,
    plumb_location_basement: 1.0,
    plumb_location_closet: 1.1,
    plumb_location_attic: 1.25
  },

  // ========== HVAC (parked - defaults only) ==========
  hvac: {
    hvac_labor_rate: 85,
    hvac_furnace_gas: 4200,
    hvac_furnace_electric: 3200,
    hvac_ac_unit: 5500,
    hvac_heat_pump: 8000,
    hvac_mini_split: 3200,
    hvac_ductwork_lf: 18,
    hvac_thermostat_standard: 150,
    hvac_thermostat_smart: 250,
    hvac_air_handler: 1500,
    hvac_size_small: 0.85,
    hvac_size_medium: 1.0,
    hvac_size_large: 1.25,
    hvac_size_xlarge: 1.5
  },

  // ========== FLOORING (parked - defaults only) ==========
  flooring: {
    floor_labor_rate: 55,
    floor_carpet_sqft: 5.00,
    floor_vinyl_sqft: 3.50,
    floor_lvp_sqft: 4.50,
    floor_laminate_sqft: 4.00,
    floor_hardwood_eng_sqft: 10.00,
    floor_hardwood_solid_sqft: 14.00,
    floor_tile_ceramic_sqft: 7.50,
    floor_tile_porcelain_sqft: 10.00,
    floor_removal_sqft: 2.00,
    floor_subfloor_sqft: 4.00,
    floor_underlayment_sqft: 0.50,
    floor_baseboard_lf: 5.00,
    floor_transition_piece: 25
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
async function calculateTradeEstimate(trade, data, hourlyRate, state, msa, contractorId = null, regionalMultiplier = null) {
  console.log(`🔧 Starting estimate calculation for ${trade}`);
  console.log(`📍 Location: ${state}, ${msa}`);
  console.log(`💼 Base labor rate: $${hourlyRate}/hr`);

  // Use passed multiplier, or look up from cache as fallback
  if (!regionalMultiplier) {
    regionalMultiplier = STATE_MULTIPLIERS_CACHE[state] || 1.0;
  }
  console.log(`📍 Regional multiplier for ${state}: ${regionalMultiplier}x`);


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
      
   // ========== PAINTING - SYNCED WITH FORM & DASHBOARD ==========
  case 'painting':{
  const paintSqft = parseFloat(data.squareFeet) || 0;
  const paintType = (data.paintType || 'exterior').toLowerCase();
  const stories = parseInt(data.stories) || 1;
  const coats = parseInt(data.coats) || 2;
  const rooms = parseInt(data.rooms) || 1;
  
  // Boolean/option fields
  const includeCeilings = data.includeCeilings === 'yes';
  const trimLinearFeet = parseFloat(data.trimLinearFeet) || 0;
  const doorCount = parseInt(data.doorCount) || 0;
  const windowCount = parseInt(data.windowCount) || 0;
  
  // Exterior specific
  const sidingCondition = (data.sidingCondition || 'good').toLowerCase();
  const powerWashing = data.powerWashing === 'yes';
  
  // Interior specific
  const wallCondition = (data.wallCondition || 'smooth').toLowerCase();
  const patchingNeeded = (data.patchingNeeded || 'none').toLowerCase();
  
  // Specialty
  const leadPaint = (data.leadPaint || 'no').toLowerCase();
  const colorChangeDramatic = data.colorChangeDramatic === 'yes';
  
  // Initialize costs
  let interiorCost = 0;
  let exteriorCost = 0;
  let laborHours = 0;
  
  // Multipliers
  const coatMultiplier = { 1: 1.0, 2: 1.5, 3: 2.0 }[coats] || 1.5;
  const storyMultiplier = { 1: 1.0, 2: 1.15, 3: 1.35, 4: 1.5 }[stories] || 1.0;
  
  // Condition multiplier (affects labor)
  const getConditionMultiplier = (condition) => {
    const mult = { 'excellent': 0.9, 'good': 1.0, 'smooth': 1.0, 'fair': 1.15, 'textured': 1.1, 'poor': 1.25, 'damaged': 1.35, 'needs_repair': 1.4 };
    return mult[condition] || 1.0;
  };
  
  // ===== INTERIOR CALCULATION =====
  if (paintType === 'interior' || paintType === 'both') {
    const intSqft = paintType === 'both' ? paintSqft * 0.5 : paintSqft;
    
    // Walls
    interiorCost += intSqft * getPrice('painting', 'paint_interior_sqft') * coatMultiplier;
    laborHours += intSqft / 200; // 200 sqft/hr base
    
    // Ceilings
    if (includeCeilings) {
      const ceilingSqft = intSqft * 0.9; // ~90% of floor area
      interiorCost += ceilingSqft * getPrice('painting', 'paint_ceiling_sqft') * coatMultiplier;
      laborHours += ceilingSqft / 250; // 250 sqft/hr for ceilings
    }
    
    // Condition multiplier on labor
    laborHours *= getConditionMultiplier(wallCondition);
    
    // Patching
    if (patchingNeeded === 'minor') {
      interiorCost += getPrice('painting', 'paint_patch_minor');
      laborHours += 2;
    } else if (patchingNeeded === 'moderate') {
      interiorCost += getPrice('painting', 'paint_patch_moderate');
      laborHours += 4;
    } else if (patchingNeeded === 'extensive') {
      interiorCost += getPrice('painting', 'paint_patch_extensive');
      laborHours += 8;
    }
  }
  
  // ===== EXTERIOR CALCULATION =====
  if (paintType === 'exterior' || paintType === 'both') {
    const extSqft = paintType === 'both' ? paintSqft * 0.5 : paintSqft;
    
    // Siding
    exteriorCost += extSqft * getPrice('painting', 'paint_exterior_sqft') * coatMultiplier * storyMultiplier;
    laborHours += (extSqft / 150) * storyMultiplier; // 150 sqft/hr, slower for stories
    
    // Condition multiplier
    laborHours *= getConditionMultiplier(sidingCondition);
    
    // Power washing
    if (powerWashing) {
      exteriorCost += extSqft * getPrice('painting', 'paint_power_wash_sqft');
      laborHours += extSqft / 500; // 500 sqft/hr
    }
  }
  
  // ===== TRIM, DOORS, WINDOWS =====
  if (trimLinearFeet > 0) {
    interiorCost += trimLinearFeet * getPrice('painting', 'paint_trim_lf');
    laborHours += trimLinearFeet / 30; // 30 LF/hr
  }
  
  if (doorCount > 0) {
    interiorCost += doorCount * getPrice('painting', 'paint_door');
    laborHours += doorCount * 0.75; // 45 min per door
  }
  
  if (windowCount > 0) {
    interiorCost += windowCount * getPrice('painting', 'paint_window');
    laborHours += windowCount * 0.5; // 30 min per window (standard style)
  }
  
  // ===== SPECIALTY =====
  // Dramatic color change (extra primer)
  if (colorChangeDramatic) {
    const totalSqft = paintType === 'both' ? paintSqft : paintSqft;
    interiorCost += totalSqft * getPrice('painting', 'paint_primer_coat');
    laborHours += totalSqft / 300; // primer goes faster
  }
  
  // Lead paint
  if (leadPaint === 'yes') {
    interiorCost += getPrice('painting', 'paint_lead_abatement');
    laborHours += 8; // extra time for protocols
  }
  
  // ===== FINAL CALCULATIONS =====
  materialCost = (interiorCost + exteriorCost) * regionalMultiplier;
  
  // Minimum 4 hours
  laborHours = Math.max(laborHours, 4);
  
  // Equipment
  equipmentCost = paintType === 'exterior' || paintType === 'both' ? 175 : 100;
  
  break;
}


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

case 'electrical': {
  const contractor = null;
  // Helper for electrical pricing (legacy 3-arg pattern)
  const getPrice = (key, contractor, defaultValue) => defaultValue;
  const serviceType = data.serviceType || 'general';
  const amperage = data.amperage || '200';
  const squareFootage = parseFloat(data.squareFootage) || 0;
  const homeAge = data.homeAge || '1990+';
  const stories = parseInt(data.stories) || 1;
  const outletCount = parseInt(data.outletCount) || 0;
  const gfciCount = parseInt(data.gfciCount) || 0;
  const switchCount = parseInt(data.switchCount) || 0;
  const dimmerCount = parseInt(data.dimmerCount) || 0;
  const fixtureCount = parseInt(data.fixtureCount) || 0;
  const ceilingFanCount = parseInt(data.ceilingFanCount) || 0;
  const ceilingFanInstall = getPrice('elec_ceiling_fan_install', contractor, 200);
  const recessedCount = parseInt(data.recessedCount) || 0;
  const circuits20a = parseInt(data.circuits20a) || 0;
  const circuits30a = parseInt(data.circuits30a) || 0;
  const circuits50a = parseInt(data.circuits50a) || 0;
  const evCharger = data.evCharger;
  const permit = data.permit;

  // Get labor rate - contractor override or default
  const laborRate = getPrice('elec_labor_rate', contractor, 75);

  // Age multiplier
  let ageMultiplier = 1.0;
  if (homeAge === 'pre-1960') ageMultiplier = 2.0;
  else if (homeAge === '1960-1990') ageMultiplier = 1.25;

  // Story multiplier
  let storyMultiplier = 1.0;
  if (stories >= 3) storyMultiplier = 1.35;
  else if (stories === 2) storyMultiplier = 1.15;

  const complexityMultiplier = ageMultiplier * storyMultiplier;

  let materialCost = 0;
  let laborHours = 0;
  let equipmentCost = 150; // Base equipment/consumables

  // Panel costs
  const panelCosts = {
    '100': getPrice('elec_panel_100', contractor, 450),
    '200': getPrice('elec_panel_200', contractor, 550),
    '400': getPrice('elec_panel_400', contractor, 1200)
  };
  const panelMisc = { '100': 200, '200': 250, '400': 400 };

  // Service type calculations
  if (serviceType === 'panel') {
    materialCost += panelCosts[amperage] + panelMisc[amperage];
    laborHours += amperage === '400' ? 16 : amperage === '200' ? 10 : 8;
  }

  if (serviceType === 'rewire') {
    // Use all-in rewire rate
    const rewireSqft = getPrice('elec_rewire_sqft', contractor, 11.50);
    materialCost += squareFootage * rewireSqft;
    laborHours += (squareFootage / 100) * 4; // 4 hrs per 100 sqft base
    // Add panel for rewire
    materialCost += panelCosts[amperage] + panelMisc[amperage];
    laborHours += amperage === '400' ? 16 : amperage === '200' ? 10 : 8;
  }

  if (serviceType === 'circuits' || serviceType === 'general') {
    // Wire cost per device (estimated run length)
    const wireLF = getPrice('elec_wire_lf', contractor, 1.00);
    const avgRunPerDevice = 25; // 25 LF average run
    
    // Outlets
    materialCost += outletCount * (getPrice('elec_outlet', contractor, 12) + (avgRunPerDevice * wireLF));
    laborHours += outletCount * 0.75;

    // GFCI
    materialCost += gfciCount * (getPrice('elec_outlet_gfci', contractor, 35) + (avgRunPerDevice * wireLF));
    laborHours += gfciCount * 1.0;

    // Switches
    materialCost += switchCount * (getPrice('elec_switch', contractor, 10) + (avgRunPerDevice * wireLF));
    laborHours += switchCount * 0.5;

    // Dimmers
    materialCost += dimmerCount * (getPrice('elec_switch_dimmer', contractor, 50) + (avgRunPerDevice * wireLF));
    laborHours += dimmerCount * 0.75;

    // Light fixtures (customer provided - labor only)
    const lightInstall = getPrice('elec_light_install', contractor, 35);
    materialCost += fixtureCount * 15; // Hardware/boxes only
    laborHours += fixtureCount * (lightInstall / laborRate); // Convert $ to hours

    // Recessed lights
    materialCost += recessedCount * getPrice('elec_recessed', contractor, 55);
    laborHours += recessedCount * 1.5;

    // Ceiling Fans (customer provided - labor only)
    materialCost += ceilingFanCount * (15 + (avgRunPerDevice * wireLF)); // Hardware + wire
    laborHours += ceilingFanCount * (ceilingFanInstall / laborRate);

    // Dedicated circuits
    materialCost += circuits20a * getPrice('elec_circuit_20a', contractor, 95);
    laborHours += circuits20a * 2.0;

    materialCost += circuits30a * getPrice('elec_circuit_30a', contractor, 130);
    laborHours += circuits30a * 2.5;

    materialCost += circuits50a * getPrice('elec_circuit_50a', contractor, 185);
    laborHours += circuits50a * 3.0;
  }

  // EV Charger
  if (evCharger === 'yes') {
    materialCost += getPrice('elec_ev_charger', contractor, 350) + 100; // +100 wire run
    laborHours += 4;
  }

  // Permit
  if (permit === 'yes' || permit !== 'no') {
    materialCost += getPrice('elec_permit', contractor, 200);
  }

  // Apply complexity multiplier to labor
  laborHours *= complexityMultiplier;

  // Minimum service call
  if (laborHours < 2) laborHours = 2;

  // Apply regional multiplier
  materialCost *= regionalMultiplier;

  const laborCost = laborHours * laborRate;
  const totalCost = materialCost + laborCost + equipmentCost;

  return {
    trade: 'electrical',
    serviceType,
    materials: Math.round(materialCost * 100) / 100,
    labor: Math.round(laborCost * 100) / 100,
    laborHours: Math.round(laborHours * 100) / 100,
    laborRate,
    equipment: equipmentCost,
    total: Math.round(totalCost * 100) / 100,
    regionalMultiplier,
    complexityMultiplier
  };
}


    // ========== PLUMBING - CALIBRATED ==========
    // ========== PLUMBING - CALIBRATED ==========
case 'plumbing':
  const plumbServiceType = (data.plumbingType || data.serviceType || data.workType || 'fixture').toLowerCase();
  const fixtureType = (data.fixtureType || 'toilet').toLowerCase();
  const plumbFixtureCount = parseInt(data.fixtureCount || data.fixtures) || 1;
  const plumbSqft = parseFloat(data.squareFootage || data.squareFeet) || 0;
  const waterHeaterType = (data.waterHeaterType || data.heaterType || (data.tankless === 'yes' ? 'tankless' : 'tank')).toLowerCase();

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

    // ========== DRYWALL - SYNCED WITH FORM & DASHBOARD ==========
case 'drywall':{ 
  const drywallSqft = parseFloat(data.squareFeet) || 0;
  const projectType = (data.projectType || 'new_construction').toLowerCase();
  const rooms = parseInt(data.rooms) || 1;
  const ceilingHeightRaw = data.ceilingHeight || '8ft';
  const ceilingHeight = parseInt(ceilingHeightRaw) || 8;
  const finishLevel = (data.finishLevel || 'level_3_standard').toLowerCase();
  const textureType = (data.textureType || 'none').toLowerCase();
  const damageExtent = (data.damageExtent || 'minor').toLowerCase();
  
  // ===== NEW CONSTRUCTION / INSTALLATION =====
  if (projectType === 'new_construction') {
    const wasteMultiplier = 1.12; // 12% waste
    const adjustedSqft = drywallSqft * wasteMultiplier;
    const sheetsNeeded = Math.ceil(adjustedSqft / 32); // 4x8 sheets
    
    // Materials
    const sheetCost = sheetsNeeded * getPrice('drywall', 'drywall_sheet_half');
    const compoundBuckets = Math.ceil(sheetsNeeded / 4);
    const compoundCost = compoundBuckets * getPrice('drywall', 'drywall_joint_compound');
    const tapeRolls = Math.ceil(sheetsNeeded / 8);
    const tapeCost = tapeRolls * getPrice('drywall', 'drywall_tape');
    const screwBoxes = Math.ceil(sheetsNeeded / 5);
    const screwCost = screwBoxes * getPrice('drywall', 'drywall_screws');
    const cornerBeads = Math.ceil(rooms * 4); // ~4 corners per room
    const cornerCost = cornerBeads * getPrice('drywall', 'drywall_corner_bead');
    
    materialCost = sheetCost + compoundCost + tapeCost + screwCost + cornerCost + 75; // misc supplies
    
    // Labor: hang + tape + sand (per sqft rates)
    const hangLabor = drywallSqft * getPrice('drywall', 'drywall_hang_sqft');
    const tapeLabor = drywallSqft * getPrice('drywall', 'drywall_tape_sqft');
    const sandLabor = drywallSqft * getPrice('drywall', 'drywall_sand_sqft');
    let laborCost = hangLabor + tapeLabor + sandLabor;
    
    // Finish level multiplier
    let finishMultiplier = getPrice('drywall', 'drywall_finish_level_3');
    if (finishLevel === 'level_4_smooth') {
      finishMultiplier = getPrice('drywall', 'drywall_finish_level_4');
    } else if (finishLevel === 'level_5_glass') {
      finishMultiplier = getPrice('drywall', 'drywall_finish_level_5');
    }
    laborCost *= finishMultiplier;
    
    // Ceiling height multiplier
    if (ceilingHeight >= 12) {
      laborCost *= getPrice('drywall', 'drywall_ceiling_12ft');
    } else if (ceilingHeight >= 10) {
      laborCost *= getPrice('drywall', 'drywall_ceiling_10ft');
    }
    
    // Texture cost (per sqft add-on)
    let textureCost = 0;
    if (textureType === 'orange_peel') {
      textureCost = drywallSqft * getPrice('drywall', 'drywall_texture_orange_peel');
    } else if (textureType === 'knockdown') {
      textureCost = drywallSqft * getPrice('drywall', 'drywall_texture_knockdown');
    } else if (textureType === 'popcorn') {
      textureCost = drywallSqft * getPrice('drywall', 'drywall_texture_popcorn');
    }
    
    // Convert labor cost to hours for consistency
    const laborRate = getPrice('drywall', 'drywall_labor_rate');
    laborHours = (laborCost + textureCost) / laborRate;
    
    // Add texture material cost
    materialCost += textureCost * 0.3; // ~30% of texture cost is material
    
  // ===== REPAIR =====
  } else if (projectType === 'repair') {
    if (damageExtent === 'minor') {
      materialCost = getPrice('drywall', 'drywall_repair_minor') * 0.3; // 30% materials
      laborHours = getPrice('drywall', 'drywall_repair_minor') * 0.7 / getPrice('drywall', 'drywall_labor_rate');
    } else if (damageExtent === 'moderate') {
      materialCost = getPrice('drywall', 'drywall_repair_moderate') * 0.3;
      laborHours = getPrice('drywall', 'drywall_repair_moderate') * 0.7 / getPrice('drywall', 'drywall_labor_rate');
    } else if (damageExtent === 'extensive') {
      materialCost = getPrice('drywall', 'drywall_repair_extensive') * 0.3;
      laborHours = getPrice('drywall', 'drywall_repair_extensive') * 0.7 / getPrice('drywall', 'drywall_labor_rate');
    } else {
      materialCost = 175 * 0.3;
      laborHours = 3;
    }
    
    // Still apply texture if selected for repair
    if (textureType !== 'none') {
      let textureCost = 0;
      const repairSqft = Math.min(drywallSqft, 100); // Cap texture calc for repairs
      if (textureType === 'orange_peel') {
        textureCost = repairSqft * getPrice('drywall', 'drywall_texture_orange_peel');
      } else if (textureType === 'knockdown') {
        textureCost = repairSqft * getPrice('drywall', 'drywall_texture_knockdown');
      } else if (textureType === 'popcorn') {
        textureCost = repairSqft * getPrice('drywall', 'drywall_texture_popcorn');
      }
      materialCost += textureCost * 0.3;
      laborHours += textureCost * 0.7 / getPrice('drywall', 'drywall_labor_rate');
    }
  }
  
  materialCost *= regionalMultiplier;
  equipmentCost = 100; // lifts, scaffolding, sanders
  
  break;
}



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
      api_key,
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
  'SELECT id, company_name, email, subscription_status, estimate_display, tax_rate, pricing_config FROM contractors WHERE api_key = $1',
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
    const finalCity = city || 'Unknown';
    const finalState = state || 'Unknown';

   // ✅ ROBUST FALLBACK: ZIP → STATE → NATIONAL
let regionalMultiplier = 1.0;
let msa = 'National Average';

try {
  const zipResult = await pool.query(
    'SELECT msa_name FROM zip_metro_mapping WHERE zip_code = $1', 
    [finalZipCode]
  );
  
  if (zipResult.rows && zipResult.rows.length > 0) {
    msa = zipResult.rows[0].msa_name;
    console.log(`✅ Found MSA for ZIP ${finalZipCode}: ${msa}`);
  } else {
    console.log(`⚠️ ZIP ${finalZipCode} not found - falling back to state average`);
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
  contractor_id,
  regionalMultiplier
);

    console.log(`💰 Estimate calculated: $${estimate.totalCost}`);

    // Save contractor pricing config
app.post('/api/contractor/pricing', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const session = await pool.query(
      'SELECT contractor_id FROM sessions WHERE token = $1',
      [token]
    );

    if (session.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }

    const contractorId = session.rows[0].contractor_id;
    const { trade, config } = req.body;

    // Get existing config
    const existing = await pool.query(
      'SELECT pricing_config FROM contractors WHERE id = $1',
      [contractorId]
    );

    let pricingConfig = existing.rows[0]?.pricing_config || {};
    pricingConfig[trade] = config;

    // Save updated config
    await pool.query(
      'UPDATE contractors SET pricing_config = $1 WHERE id = $2',
      [JSON.stringify(pricingConfig), contractorId]
    );

    console.log(`✅ Pricing config saved for contractor ${contractorId}, trade: ${trade}`);

    res.json({ success: true, message: `${trade} pricing saved` });

  } catch (error) {
    console.error('❌ Error saving pricing config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get contractor pricing config
app.get('/api/contractor/pricing', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const session = await pool.query(
      'SELECT contractor_id FROM sessions WHERE token = $1',
      [token]
    );

    if (session.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
    }

    const contractorId = session.rows[0].contractor_id;

    const result = await pool.query(
      'SELECT pricing_config FROM contractors WHERE id = $1',
      [contractorId]
    );

    res.json({ 
      success: true, 
      pricing_config: result.rows[0]?.pricing_config || {} 
    });

  } catch (error) {
    console.error('❌ Error fetching pricing config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

    // ✅ NEW: Generate material list

// Load contractor's custom pricing from contractor_pricing table
let pricingConfig = {};
try {
  const pricingResult = await pool.query(
    'SELECT trade, pricing_key, value FROM contractor_pricing WHERE contractor_id = $1',
    [contractor_id]
  );
  
  pricingResult.rows.forEach(row => {
    if (!pricingConfig[row.trade]) {
      pricingConfig[row.trade] = {};
    }
    pricingConfig[row.trade][row.pricing_key] = parseFloat(row.value);
  });
  
  console.log(`💰 Loaded ${pricingResult.rows.length} custom prices for contractor ${contractor_id}`);
} catch (err) {
  console.error('⚠️ Error loading contractor pricing:', err);
}

const materialListResult = generateMaterialList(trade, tradeSpecificFields, contractor_id, pricingConfig);
    
console.log(`📦 Material list generated: ${materialListResult.materialList.length} items`);
    
    // ✅ OVERRIDE - Use material list as single source of truth
    estimate.materialCost = materialListResult.totalMaterialCost;
    estimate.laborHours = materialListResult.laborHours;
    estimate.laborCost = materialListResult.laborHours * hourlyRate;
    estimate.equipmentCost = 0;

    // Markup on MATERIALS ONLY (labor already includes overhead)
    const materialMarkup = estimate.materialCost * 0.20;
    estimate.totalCost = estimate.materialCost + materialMarkup + estimate.laborCost + estimate.equipmentCost;

    console.log(`✅ OVERRIDE applied:`);
    console.log(`   Materials: $${estimate.materialCost.toFixed(2)} + 20% markup = $${(estimate.materialCost + materialMarkup).toFixed(2)}`);
    console.log(`   Labor: ${estimate.laborHours} hrs × $${hourlyRate} = $${estimate.laborCost.toFixed(2)}`);
    console.log(`   Total (pre-tax): $${estimate.totalCost.toFixed(2)}`);

    const taxRate = parseFloat(contractor.tax_rate) || 8.25;
    const taxAmount = estimate.totalCost * (taxRate / 100);
    const totalWithTax = estimate.totalCost * (1 + taxRate / 100);

    
   

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
        material_list,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW())
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
      JSON.stringify(tradeSpecificFields.photos || []), // $20
      JSON.stringify(materialListResult)              // $21 ← NEW
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
  displaySettings,
  subtotal: estimate.totalCost,
  taxRate: taxRate,
  tax: taxAmount,
  total: totalWithTax,
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
        labor_hours as "laborHours",
        total_cost as "totalCost",
        tax_rate as "taxRate",
        tax_amount as "taxAmount",
        total_with_tax as "totalWithTax",
        trade_details as "projectDetails",
        photos,
        material_list,
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

// GET material list for an estimate
app.get('/api/estimates/:id/material-list', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT id, trade, material_list, created_at FROM estimates WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Estimate not found' });
    }
    
    const estimate = result.rows[0];
    
    // If no material list stored yet, generate it on the fly
    if (!estimate.material_list) {
      return res.status(404).json({ 
        error: 'Material list not available for this estimate',
        hint: 'This estimate was created before material list generation was implemented'
      });
    }
    
    res.json({
      estimateId: estimate.id,
      trade: estimate.trade,
      materialList: estimate.material_list,
      createdAt: estimate.created_at
    });
    
  } catch (error) {
    console.error('Error fetching material list:', error);
    res.status(500).json({ error: 'Failed to fetch material list' });
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

  // ============================================
// CONTRACTOR PRICING ENDPOINTS
// ============================================

// GET - Load contractor's pricing overrides
app.get('/api/contractor/pricing', verifySession, async (req, res) => {
  try {
    const contractorId = req.contractor_id;
    
    const result = await pool.query(
      'SELECT trade, pricing_key, value FROM contractor_pricing WHERE contractor_id = $1',
      [contractorId]
    );
    
    // Organize by trade
    const pricing = {};
    result.rows.forEach(row => {
      if (!pricing[row.trade]) {
        pricing[row.trade] = {};
      }
      pricing[row.trade][row.pricing_key] = parseFloat(row.value);
    });
    
    console.log(`📊 Loaded ${result.rows.length} pricing overrides for contractor ${contractorId}`);
    res.json({ success: true, pricing });
    
  } catch (error) {
    console.error('❌ Failed to load contractor pricing:', error);
    res.status(500).json({ success: false, error: 'Failed to load pricing' });
  }
});

// POST - Save contractor's pricing overrides
app.post('/api/contractor/pricing', verifySession, async (req, res) => {
  try {
    const contractorId = req.contractor.contractor_id;

    const { trade, pricing } = req.body;
    
    if (!trade || !pricing || typeof pricing !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing trade or pricing data' });
    }
    
    let savedCount = 0;
    
    for (const [key, value] of Object.entries(pricing)) {
      if (value !== null && value !== undefined && value !== '') {
        await pool.query(`
          INSERT INTO contractor_pricing (contractor_id, trade, pricing_key, value, updated_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (contractor_id, trade, pricing_key)
          DO UPDATE SET value = $4, updated_at = NOW()
        `, [contractorId, trade, key, parseFloat(value)]);
        savedCount++;
      }
    }
    
    console.log(`💾 Saved ${savedCount} pricing values for contractor ${contractorId} - ${trade}`);
    res.json({ success: true, saved: savedCount });

    console.log('contractorId:', contractorId);

    
  } catch (error) {
    console.error('❌ Failed to save contractor pricing:', error);
    res.status(500).json({ success: false, error: 'Failed to save pricing' });
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
// CONTRACTOR PRICING ENDPOINTS
// ============================================

// GET - Load contractor's pricing overrides
app.get('/api/contractor/pricing', verifySession, async (req, res) => {
  try {
    const contractorId = req.contractor_id;
    
    const result = await pool.query(
      'SELECT trade, pricing_key, value FROM contractor_pricing WHERE contractor_id = $1',
      [contractorId]
    );
    
    // Organize by trade
    const pricing = {};
    result.rows.forEach(row => {
      if (!pricing[row.trade]) {
        pricing[row.trade] = {};
      }
      pricing[row.trade][row.pricing_key] = parseFloat(row.value);
    });
    
    console.log(`📊 Loaded ${result.rows.length} pricing overrides for contractor ${contractorId}`);
    res.json({ success: true, pricing });
    
  } catch (error) {
    console.error('❌ Failed to load contractor pricing:', error);
    res.status(500).json({ success: false, error: 'Failed to load pricing' });
  }
});

// POST - Save contractor's pricing overrides
app.post('/api/contractor/pricing', verifySession, async (req, res) => {
  try {
    const contractorId = req.contractor_id;
    const { trade, pricing } = req.body;
    
    if (!trade || !pricing || typeof pricing !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing trade or pricing data' });
    }
    
    let savedCount = 0;
    
    for (const [key, value] of Object.entries(pricing)) {
      if (value !== null && value !== undefined && value !== '') {
        await pool.query(`
          INSERT INTO contractor_pricing (contractor_id, trade, pricing_key, value, updated_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (contractor_id, trade, pricing_key)
          DO UPDATE SET value = $4, updated_at = NOW()
        `, [contractorId, trade, key, parseFloat(value)]);
        savedCount++;
      }
    }
    
    console.log(`💾 Saved ${savedCount} pricing values for contractor ${contractorId} - ${trade}`);
    res.json({ success: true, saved: savedCount });
    
  } catch (error) {
    console.error('❌ Failed to save contractor pricing:', error);
    res.status(500).json({ success: false, error: 'Failed to save pricing' });
  }
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

/// Register new contractor (PUBLIC - after Stripe payment)
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
      'SELECT id, email, password_hash, company_name, subscription_status, api_key FROM contractors WHERE email = $1',
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
      company_name: contractor.company_name,
      api_key: contractor.api_key
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