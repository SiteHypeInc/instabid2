require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - PERMISSIVE CORS FOR NOW
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', '*');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.connect()
  .then(() => console.log('✅ Database connected'))
  .catch(err => console.error('❌ Database connection error:', err));

// ========== EMAIL SETUP ==========
const transporter = nodemailer.createTransport(sgTransport({
  auth: {
    api_key: process.env.SENDGRID_API_KEY
  }
}));

// Initialize database tables
async function initDatabase() {
  try {
    // Create labor_rates table
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

    // Insert baseline rates if empty
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

    // Drop and recreate estimates table
    await pool.query(`DROP TABLE IF EXISTS estimates`);
    
    await pool.query(`
      CREATE TABLE estimates (
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}

// ============================================
// BASE PRICING DATABASE (BLS + Market Research)
// Contractor overrides applied via dashboard
// ============================================
const DEFAULT_PRICING = {
  roofing: {
    // Pitch multipliers
    pitch_low: 1.0,
    pitch_med: 1.2,
    pitch_high: 1.4,
    pitch_steep: 1.8,
    // Story multipliers
    story_1: 1.0,
    story_2: 1.3,
    story_3: 1.6,
    // Material costs (per sqft)
    mat_asphalt: 2.5,
    mat_arch: 3.5,
    mat_metal: 5.0,
    mat_tile: 7.0,
    mat_slate: 12.0,
    // Fixed costs
    tearoff_cost: 1500,
    plywood_cost: 4.5,
    chimney_cost: 400,
    valley_cost: 8,
    skylight_cost: 300,
    ridge_cost: 10
  },
  
  hvac: {
    // Home size multipliers
    hvac_size_small: 0.9,
    hvac_size_med: 1.0,
    hvac_size_large: 1.2,
    hvac_size_xlarge: 1.4,
    // Unit costs
    hvac_furnace: 3500,
    hvac_ac: 4000,
    hvac_heatpump: 5500,
    hvac_minisplit: 2500,
    // Additional costs
    hvac_duct: 15,
    hvac_thermostat: 350,
    hvac_handler: 1200,
    // Complexity multipliers
    hvac_standard: 1.0,
    hvac_moderate: 1.2,
    hvac_complex: 1.5
  },
  
  electrical: {
    // Panel & service
    elec_panel_100: 1800,
    elec_panel_200: 2500,
    elec_subpanel: 1200,
    // Fixtures & devices
    elec_outlet: 125,
    elec_switch: 110,
    elec_fixture: 150,
    elec_fan: 200,
    elec_gfci: 175,
    // Specialty work
    elec_ev: 1200,
    elec_generator: 1500,
    elec_hottub: 800,
    // Labor rates
    elec_labor_std: 85,
    elec_labor_complex: 110
  },
  
  plumbing: {
    // Fixtures
    plumb_toilet: 350,
    plumb_sink: 400,
    plumb_shower: 1200,
    plumb_tub: 1500,
    plumb_dishwasher: 300,
    // Water systems
    plumb_heater_tank: 1800,
    plumb_heater_tankless: 3200,
    plumb_sump: 850,
    plumb_softener: 1400,
    // Pipes & drains
    plumb_pipe_repair: 45,
    plumb_pipe_replace: 75,
    plumb_drain: 250,
    plumb_sewer: 125,
    // Labor rates
    plumb_labor_std: 95,
    plumb_labor_emerg: 140
  },
  
  flooring: {
    // Material costs (per sqft)
    floor_carpet: 3.5,
    floor_vinyl: 4.0,
    floor_laminate: 4.5,
    floor_hardwood_eng: 8.0,
    floor_hardwood_solid: 12.0,
    floor_tile_ceramic: 6.0,
    floor_tile_porcelain: 8.5,
    // Installation labor (per sqft)
    floor_labor_carpet: 1.5,
    floor_labor_vinyl: 2.0,
    floor_labor_hardwood: 4.0,
    floor_labor_tile: 5.0,
    // Prep & extras
    floor_subfloor: 3.0,
    floor_removal: 1.5,
    floor_underlay: 0.75,
    floor_baseboard: 4.0,
    // Complexity multipliers
    floor_standard: 1.0,
    floor_moderate: 1.2,
    floor_complex: 1.5
  },
  
  painting: {
    // Interior rates (per sqft)
    paint_int_walls_1: 1.5,
    paint_int_walls_2: 2.5,
    paint_int_ceiling: 2.0,
    paint_int_trim: 1.75,
    paint_int_door: 75,
    paint_int_cabinet: 35,
    // Exterior rates (per sqft)
    paint_ext_siding_1: 2.0,
    paint_ext_siding_2: 3.5,
    paint_ext_trim: 2.5,
    paint_ext_deck: 2.25,
    paint_ext_fence: 3.0,
    // Prep & specialty
    paint_prep: 1.0,
    paint_primer: 0.75,
    paint_wallpaper: 1.5,
    paint_texture: 3.0,
    // Complexity multipliers
    paint_standard: 1.0,
    paint_moderate: 1.25,
    paint_complex: 1.5
  },
  
  regional: {
    // High-cost markets
    region_CA: 1.35,
    region_NY: 1.30,
    region_MA: 1.25,
    region_HI: 1.40,
    // Medium-cost markets
    region_WA: 1.15,
    region_OR: 1.10,
    region_CO: 1.10,
    region_IL: 1.08,
    region_VA: 1.05,
    // Low-cost markets
    region_TX: 0.95,
    region_FL: 0.95,
    region_GA: 0.90,
    region_OH: 0.92,
    region_TN: 0.88,
    region_AL: 0.85,
    // Default
    region_default: 1.00
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
  regional: {}
};

// ============================================
// PRICING HELPER FUNCTION
// Returns contractor override OR default value
// ============================================
function getPrice(trade, key) {
  // Check if contractor overrode this value
  if (configData[trade] && configData[trade][key] !== undefined) {
    console.log(`📝 Using contractor override: ${trade}.${key} = ${configData[trade][key]}`);
    return configData[trade][key];
  }
  
  // Fall back to default pricing
  return DEFAULT_PRICING[trade]?.[key];
}

initDatabase();

app.get('/', (req, res) => {
  res.json({ 
    status: 'InstaBid Backend Running',
    version: '2.0.0',
    endpoints: [
      '/api/estimate',
      '/api/calculate-estimate',
      '/api/send-estimate-email'
    ]
  });
});

// ========== LABOR RATE LOOKUP ==========
async function getHourlyRate(state, zipCode) {
  try {
    const result = await pool.query(
      'SELECT hourly_rate FROM labor_rates WHERE state = $1 AND (msa_name IS NULL OR zip_code = $2) ORDER BY msa_name DESC LIMIT 1',
      [state, zipCode]
    );
    
    if (result.rows.length > 0) {
      return parseFloat(result.rows[0].hourly_rate);
    }
    
    // Fallback to state average
    const stateResult = await pool.query(
      'SELECT AVG(hourly_rate) as avg_rate FROM labor_rates WHERE state = $1',
      [state]
    );
    
    return stateResult.rows.length > 0 ? parseFloat(stateResult.rows[0].avg_rate) : 45.00;
  } catch (error) {
    console.error('❌ Labor rate lookup error:', error);
    return 45.00; // National fallback
  }
}

// ========== TRADE CALCULATION FUNCTION ==========
async function calculateTradeEstimate(trade, data, hourlyRate, state, msa) {
  console.log(`🔧 Starting estimate calculation for ${trade}`);
  console.log(`📍 Location: ${state}, ${msa}`);
  console.log(`💼 Base labor rate: $${hourlyRate}/hr`);

  let laborHours = 0;
  let materialCost = 0;
  let equipmentCost = 0;

  switch(trade.toLowerCase()) {
    /*case 'roofing':
      const roofArea = parseFloat(data.squareFeet || data.roofArea) || 0;
      const roofComplexity = data.roofComplexity || 'medium';
      const roofPitch = data.roofPitch || 'medium';
      const stories = parseInt(data.stories) || 1;
      const existingRoofType = data.existingRoofType || '';

      let baseHoursPer100 = 2.5;
      
      if (roofComplexity === 'low') baseHoursPer100 *= 0.8;
      if (roofComplexity === 'high') baseHoursPer100 *= 1.4;
      
      if (roofPitch === 'low') baseHoursPer100 *= 0.9;
      if (roofPitch === 'steep') baseHoursPer100 *= 1.3;
      
      if (stories === 2) baseHoursPer100 *= 1.15;
      if (stories >= 3) baseHoursPer100 *= 1.3;

      laborHours = (roofArea / 100) * baseHoursPer100;
      materialCost = roofArea * 3.50;

      if (existingRoofType !== '' && existingRoofType !== 'none') {
        laborHours += (roofArea / 100) * 1.2;
        materialCost += roofArea * 0.50;
      }

      const highCostStates = ['CA', 'NY', 'MA', 'WA', 'CT'];
      if (highCostStates.includes(state)) {
        materialCost *= 1.35;
      }

      equipmentCost = 350;
      break;
      */

    case 'roofing':
  const roofArea = parseFloat(data.squareFeet || data.roofArea) || 0;
  const roofComplexity = data.roofComplexity || 'medium';
  const roofPitch = data.roofPitch || 'medium';
  const stories = data.stories || '1';
  const material = data.material || 'asphalt';
  const existingRoofType = data.existingRoofType || '';
  const tearOffLayers = parseInt(data.tearOffLayers) || 0;
  const plywoodSheets = parseInt(data.plywoodSheets) || 0;
  const chimneys = parseInt(data.chimneys) || 0;
  const valleys = parseInt(data.valleys) || 0;
  const skylights = parseInt(data.skylights) || 0;
  const ridgeVentFeet = parseInt(data.ridgeVentFeet) || 0;

  // Base labor calculation (keep your existing logic for now)
  let baseHoursPer100 = 2.5;
  
  if (roofComplexity === 'low') baseHoursPer100 *= 0.8;
  if (roofComplexity === 'high') baseHoursPer100 *= 1.4;
  
  // Pitch multiplier (uses contractor override or default)
  let pitchMultiplier = 1.0;
  switch(roofPitch) {
    case 'low': pitchMultiplier = getPrice('roofing', 'pitch_low'); break;
    case 'medium': pitchMultiplier = getPrice('roofing', 'pitch_med'); break;
    case 'high': pitchMultiplier = getPrice('roofing', 'pitch_high'); break;
    case 'steep': pitchMultiplier = getPrice('roofing', 'pitch_steep'); break;
  }
  
  // Story multiplier (uses contractor override or default)
  let storyMultiplier = 1.0;
  switch(stories) {
    case '1': storyMultiplier = getPrice('roofing', 'story_1'); break;
    case '2': storyMultiplier = getPrice('roofing', 'story_2'); break;
    case '3+': storyMultiplier = getPrice('roofing', 'story_3'); break;
    default: storyMultiplier = getPrice('roofing', 'story_1');
  }
  
  baseHoursPer100 *= pitchMultiplier * storyMultiplier;
  
  laborHours = (roofArea / 100) * baseHoursPer100;
  
  // Material cost (uses contractor override or default)
  let materialCostPerSqft = 0;
  switch(material) {
    case 'asphalt': materialCostPerSqft = getPrice('roofing', 'mat_asphalt'); break;
    case 'architectural': materialCostPerSqft = getPrice('roofing', 'mat_arch'); break;
    case 'metal': materialCostPerSqft = getPrice('roofing', 'mat_metal'); break;
    case 'tile': materialCostPerSqft = getPrice('roofing', 'mat_tile'); break;
    case 'slate': materialCostPerSqft = getPrice('roofing', 'mat_slate'); break;
    default: materialCostPerSqft = getPrice('roofing', 'mat_asphalt');
  }
  
  materialCost = roofArea * materialCostPerSqft;
  
  // Additional costs (all use contractor overrides or defaults)
  let additionalCosts = 0;
  
  if (tearOffLayers > 0) {
    additionalCosts += getPrice('roofing', 'tearoff_cost') * tearOffLayers;
    laborHours += (roofArea / 100) * 1.2;
  }
  
  if (plywoodSheets > 0) {
    additionalCosts += plywoodSheets * getPrice('roofing', 'plywood_cost');
  }
  
  if (chimneys > 0) {
    additionalCosts += getPrice('roofing', 'chimney_cost') * chimneys;
  }
  
  if (valleys > 0) {
    additionalCosts += valleys * getPrice('roofing', 'valley_cost');
  }
  
  if (skylights > 0) {
    additionalCosts += getPrice('roofing', 'skylight_cost') * skylights;
  }
  
  if (ridgeVentFeet > 0) {
    additionalCosts += ridgeVentFeet * getPrice('roofing', 'ridge_cost');
  }
  
  materialCost += additionalCosts;
  
  // Regional multiplier (uses contractor override or default)
  const regionalMultiplier = getPrice('regional', `region_${state}`) || getPrice('regional', 'region_default');
  materialCost *= regionalMultiplier;

  equipmentCost = 350;
  break;
      
    case 'hvac':
      const systemType = data.systemType || 'furnace';
      const squareFootage = parseFloat(data.squareFootage) || 0;
      const efficiency = data.efficiency || 'standard';

      if (systemType === 'furnace') {
        laborHours = 12;
        materialCost = 3500;
        if (efficiency === 'high') materialCost += 1200;
      } else if (systemType === 'ac') {
        laborHours = 10;
        materialCost = 4200;
        if (efficiency === 'high') materialCost += 1500;
      } else if (systemType === 'heatpump') {
        laborHours = 14;
        materialCost = 6500;
        if (efficiency === 'high') materialCost += 2000;
      }

      if (squareFootage > 2000) {
        materialCost *= 1.25;
        laborHours *= 1.15;
      }

      equipmentCost = 200;
      break;

    case 'electrical':
      const serviceType = data.serviceType || 'panel';
      const amperage = parseInt(data.amperage) || 200;

      if (serviceType === 'panel') {
        laborHours = amperage === 200 ? 8 : 10;
        materialCost = amperage === 200 ? 1200 : 1800;
      } else if (serviceType === 'rewire') {
        const sqft = parseFloat(data.squareFootage) || 0;
        laborHours = (sqft / 100) * 3;
        materialCost = sqft * 4.50;
      } else if (serviceType === 'outlet') {
        const outlets = parseInt(data.outletCount) || 1;
        laborHours = outlets * 0.75;
        materialCost = outlets * 45;
      }

      equipmentCost = 150;
      break;

    case 'plumbing':
      const plumbingType = data.plumbingType || 'fixture';

      if (plumbingType === 'fixture') {
        const fixtures = parseInt(data.fixtureCount) || 1;
        laborHours = fixtures * 3;
        materialCost = fixtures * 350;
      } else if (plumbingType === 'repipe') {
        const sqft = parseFloat(data.squareFootage) || 0;
        laborHours = (sqft / 100) * 4;
        materialCost = sqft * 6;
      } else if (plumbingType === 'waterheater') {
        laborHours = 6;
        materialCost = data.tankless === 'yes' ? 2200 : 900;
      }

      equipmentCost = 100;
      break;

    case 'flooring':
      const flooringType = data.flooringType || 'carpet';
      const floorArea = parseFloat(data.floorArea) || 0;

      if (flooringType === 'carpet') {
        laborHours = (floorArea / 100) * 2;
        materialCost = floorArea * 3.50;
      } else if (flooringType === 'hardwood') {
        laborHours = (floorArea / 100) * 4;
        materialCost = floorArea * 8;
      } else if (flooringType === 'tile') {
        laborHours = (floorArea / 100) * 5;
        materialCost = floorArea * 9;
      } else if (flooringType === 'vinyl') {
        laborHours = (floorArea / 100) * 2.5;
        materialCost = floorArea * 4.50;
      }

      equipmentCost = 100;
      break;

    case 'painting':
      const paintArea = parseFloat(data.paintArea) || 0;
      const paintType = data.paintType || 'interior';
      const coats = parseInt(data.coats) || 2;

      if (paintType === 'interior') {
        laborHours = (paintArea / 100) * 1.5 * coats;
        materialCost = (paintArea / 350) * 35 * coats;
      } else {
        laborHours = (paintArea / 100) * 2 * coats;
        materialCost = (paintArea / 300) * 45 * coats;
      }

      equipmentCost = 75;
      break;

    default:
      laborHours = 8;
      materialCost = 500;
      equipmentCost = 100;
  }

  const laborCost = laborHours * hourlyRate;
  const totalCost = laborCost + materialCost + equipmentCost;

  console.log(`✅ Calculation complete: $${totalCost.toFixed(2)}`);

  return {
    laborHours: parseFloat(laborHours.toFixed(2)),
    laborRate: hourlyRate,
    laborCost: parseFloat(laborCost.toFixed(2)),
    materialCost: parseFloat(materialCost.toFixed(2)),
    equipmentCost: parseFloat(equipmentCost.toFixed(2)),
    totalCost: parseFloat(totalCost.toFixed(2))
  };
}

// ========== PDF GENERATION FUNCTION ==========
async function generateEstimatePDF(estimateData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(24).fillColor('#2563eb').text('InstaBid Estimate', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#666').text(`Estimate #${estimateData.id}`, { align: 'center' });
      doc.moveDown(2);

      // Customer Info
      doc.fontSize(14).fillColor('#000').text('Customer Information', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      doc.text(`Name: ${estimateData.customerName}`);
      doc.text(`Email: ${estimateData.customerEmail}`);
      if (estimateData.customerPhone) doc.text(`Phone: ${estimateData.customerPhone}`);
      doc.text(`Address: ${estimateData.propertyAddress}, ${estimateData.city}, ${estimateData.state} ${estimateData.zipCode}`);
      doc.moveDown(2);

      // Service Details
      doc.fontSize(14).fillColor('#000').text('Service Details', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      const tradeName = estimateData.trade.charAt(0).toUpperCase() + estimateData.trade.slice(1);
      doc.text(`Service: ${tradeName}`);
      doc.moveDown(2);

      // Cost Breakdown
      doc.fontSize(14).fillColor('#000').text('Cost Breakdown', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      doc.text(`Labor: ${estimateData.laborHours} hours @ $${estimateData.laborRate}/hr = $${estimateData.laborCost.toLocaleString()}`);
      doc.text(`Materials: $${estimateData.materialCost.toLocaleString()}`);
      doc.text(`Equipment: $${estimateData.equipmentCost.toLocaleString()}`);
      doc.moveDown(1);

      // Total
      doc.fontSize(16).fillColor('#2563eb');
      doc.text(`TOTAL ESTIMATE: $${estimateData.totalCost.toLocaleString()}`, { align: 'right' });
      doc.moveDown(2);

      // Footer
      doc.fontSize(8).fillColor('#999');
      doc.text('This estimate is valid for 30 days. Final costs may vary based on site conditions.', { align: 'center' });

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
          <p>Please review both documents. To proceed, sign and return the contract with your 50% deposit.</p>
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

// ========== MAIN ESTIMATE SUBMISSION ENDPOINT ==========
app.post('/api/estimate', async (req, res) => {
  console.log('🔵 RAW REQUEST BODY:', JSON.stringify(req.body, null, 2));
  
  try {
    const {
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

    const finalCustomerName = customerName || customer_name || req.body.name;
    const finalCustomerEmail = customerEmail || customer_email || req.body.email;
    const finalCustomerPhone = customerPhone || customer_phone || req.body.phone || '';
    const finalPropertyAddress = propertyAddress || address || '';
    const finalZipCode = zipCode || zip || '';
    const finalCity = req.body.city || 'Unknown';
    const finalState = req.body.state || 'Unknown';

    console.log(`📋 Customer: ${finalCustomerName}, Trade: ${trade}`);
    console.log(`📍 Location: ${city}, ${state} ${finalZipCode}`);

    const hourlyRate = await getHourlyRate(state, finalZipCode);
    console.log(`💼 Labor rate for ${state}: $${hourlyRate}/hr`);
    
    const estimate = await calculateTradeEstimate(
      trade,
      tradeSpecificFields,
      hourlyRate,
      state,
      finalZipCode
    );

    console.log(`💰 Estimate calculated: $${estimate.totalCost}`);

    const insertQuery = `
      INSERT INTO estimates (
        customer_name, customer_email, customer_phone,
        property_address, city, state, zip_code,
        trade, trade_details,
        labor_hours, labor_rate, labor_cost,
        material_cost, equipment_cost, total_cost,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
      RETURNING id
    `;

    const values = [
      finalCustomerName,
      finalCustomerEmail,
      finalCustomerPhone,
      finalPropertyAddress,
      city,
      state,
      finalZipCode,
      trade,
      JSON.stringify(tradeSpecificFields),
      estimate.laborHours,
      estimate.laborRate,
      estimate.laborCost,
      estimate.materialCost,
      estimate.equipmentCost || 0,
      estimate.totalCost
    ];

    const result = await pool.query(insertQuery, values);
    const estimateId = result.rows[0].id;

    console.log(`✅ Estimate #${estimateId} saved to database`);

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
        ...estimate
      },
      pdfBuffer,
      contractBuffer
    );

    res.json({
      success: true,
      estimateId,
      lineItems: [
        { description: 'Labor', amount: estimate.laborCost },
        { description: 'Materials', amount: estimate.materialCost },
        { description: 'Equipment', amount: estimate.equipmentCost || 0 }
      ],
      subtotal: estimate.totalCost,
      tax: estimate.totalCost * 0.0825,
      total: estimate.totalCost * 1.0825,
      msa: finalCity + ', ' + finalState,
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
      error: error.message
    });
  }
});

// Standalone PDF generation endpoint
app.post('/api/generate-pdf', async (req, res) => {
  try {
    const data = req.body;
    
    const hourlyRate = await getHourlyRate(data.state, data.zip);
    
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
      ...estimate
    });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="estimate-${data.name.replace(/\s+/g, '-')}.pdf"`);
    res.send(pdfBuffer);
    
    console.log(`📄 PDF downloaded by ${data.name}`);
    
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
// DASHBOARD CONFIGURATION ENDPOINTS
// ============================================

/*let configData = {
    roofing: {
    pitch_low: 1.0, pitch_med: 1.2, pitch_high: 1.4, pitch_steep: 1.8,
    story_1: 1.0, story_2: 1.3, story_3: 1.6,
    mat_asphalt: 2.5, mat_arch: 3.5, mat_metal: 5.0, mat_tile: 7.0, mat_slate: 12.0,
    tearoff_cost: 1500, plywood_cost: 4.5, chimney_cost: 400, valley_cost: 8,
    skylight_cost: 300, ridge_cost: 10
  },
  hvac: {
    hvac_size_small: 0.9, hvac_size_med: 1.0, hvac_size_large: 1.2, hvac_size_xlarge: 1.4,
    hvac_furnace: 3500, hvac_ac: 4000, hvac_heatpump: 5500, hvac_minisplit: 2500,
    hvac_duct: 15, hvac_thermostat: 350, hvac_handler: 1200,
    hvac_standard: 1.0, hvac_moderate: 1.2, hvac_complex: 1.5
  },
  electrical: {
    elec_panel_100: 1800, elec_panel_200: 2500, elec_subpanel: 1200,
    elec_outlet: 125, elec_switch: 110, elec_fixture: 150, elec_fan: 200, elec_gfci: 175,
    elec_ev: 1200, elec_generator: 1500, elec_hottub: 800,
    elec_labor_std: 85, elec_labor_complex: 110
  },
  plumbing: {
    plumb_toilet: 350, plumb_sink: 400, plumb_shower: 1200, plumb_tub: 1500, plumb_dishwasher: 300,
    plumb_heater_tank: 1800, plumb_heater_tankless: 3200, plumb_sump: 850, plumb_softener: 1400,
    plumb_pipe_repair: 45, plumb_pipe_replace: 75, plumb_drain: 250, plumb_sewer: 125,
    plumb_labor_std: 95, plumb_labor_emerg: 140
  },
  flooring: {
    floor_carpet: 3.5, floor_vinyl: 4.0, floor_laminate: 4.5,
    floor_hardwood_eng: 8.0, floor_hardwood_solid: 12.0,
    floor_tile_ceramic: 6.0, floor_tile_porcelain: 8.5,
    floor_labor_carpet: 1.5, floor_labor_vinyl: 2.0, floor_labor_hardwood: 4.0, floor_labor_tile: 5.0,
    floor_subfloor: 3.0, floor_removal: 1.5, floor_underlay: 0.75, floor_baseboard: 4.0,
    floor_standard: 1.0, floor_moderate: 1.2, floor_complex: 1.5
  },
  painting: {
    paint_int_walls_1: 1.5, paint_int_walls_2: 2.5, paint_int_ceiling: 2.0,
    paint_int_trim: 1.75, paint_int_door: 75, paint_int_cabinet: 35,
    paint_ext_siding_1: 2.0, paint_ext_siding_2: 3.5, paint_ext_trim: 2.5,
    paint_ext_deck: 2.25, paint_ext_fence: 3.0,
    paint_prep: 1.0, paint_primer: 0.75, paint_wallpaper: 1.5, paint_texture: 3.0,
    paint_standard: 1.0, paint_moderate: 1.25, paint_complex: 1.5
  },
  regional: {
    region_CA: 1.35, region_NY: 1.30, region_MA: 1.25, region_HI: 1.40,
    region_WA: 1.15, region_OR: 1.10, region_CO: 1.10, region_IL: 1.08, region_VA: 1.05,
    region_TX: 0.95, region_FL: 0.95, region_GA: 0.90, region_OH: 0.92, region_TN: 0.88, region_AL: 0.85,
    region_default: 1.00
  }
};*/

  // ============================================
// DASHBOARD CONFIGURATION ENDPOINTS
// ============================================


/*app.get('/api/config/:section', (req, res) => {
  const section = req.params.section;
  res.json({
    success: true,
    config: configData[section] || {}
  });
});*/

// GET config for dashboard - merges defaults + overrides
app.get('/api/config/:section', (req, res) => {
  const section = req.params.section;
  
  if (!DEFAULT_PRICING[section]) {
    return res.status(404).json({ 
      success: false, 
      error: 'Section not found' 
    });
  }
  
  // Merge: defaults first, then contractor overrides
  const merged = {
    ...DEFAULT_PRICING[section],
    ...(configData[section] || {})
  };
  
  res.json({
    success: true,
    config: merged,
    overrides: Object.keys(configData[section] || {}),
    overrideCount: Object.keys(configData[section] || {}).length
  });
});

app.put('/api/config/:section', (req, res) => {
  const section = req.params.section;
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
  
  configData[section] = overrides;
  
  console.log(`✅ Contractor overrides for ${section}:`, overrides);
  console.log(`📊 Override count: ${Object.keys(overrides).length} of ${Object.keys(DEFAULT_PRICING[section]).length} values`);
  
  res.json({
    success: true,
    message: `${section} configuration updated`,
    overrideCount: Object.keys(overrides).length,
    totalFields: Object.keys(DEFAULT_PRICING[section]).length
  });
});

// ============================================
// END DASHBOARD ENDPOINTS
// ============================================


// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
