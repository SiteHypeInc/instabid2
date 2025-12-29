//NEW SERVER.JS MON. 12-29 11AM

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const fs = require('fs');
const path = require('path');

const BLS_API_URL = '[https://api.bls.gov/publicAPI/v2/timeseries/data/';](https://api.bls.gov/publicAPI/v2/timeseries/data/';)
const NATIONAL_AVERAGE_WAGE = 33.50;
const TRADE_TYPES = ['general', 'roofing', 'hvac', 'electrical', 'plumbing', 'flooring', 'painting'];

const app = express();
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fetchBLSData() {
  try {
    console.log('📊 Fetching BLS construction wage data by state...');
    
    const stateFIPS = {
      '01': 'Alabama', '02': 'Alaska', '04': 'Arizona', '05': 'Arkansas',
      '06': 'California', '08': 'Colorado', '09': 'Connecticut', '10': 'Delaware',
      '11': 'District of Columbia', '12': 'Florida', '13': 'Georgia',
      '15': 'Hawaii', '16': 'Idaho', '17': 'Illinois', '18': 'Indiana',
      '19': 'Iowa', '20': 'Kansas', '21': 'Kentucky', '22': 'Louisiana',
      '23': 'Maine', '24': 'Maryland', '25': 'Massachusetts', '26': 'Michigan',
      '27': 'Minnesota', '28': 'Mississippi', '29': 'Missouri', '30': 'Montana',
      '31': 'Nebraska', '32': 'Nevada', '33': 'New Hampshire', '34': 'New Jersey',
      '35': 'New Mexico', '36': 'New York', '37': 'North Carolina', '38': 'North Dakota',
      '39': 'Ohio', '40': 'Oklahoma', '41': 'Oregon', '42': 'Pennsylvania',
      '44': 'Rhode Island', '45': 'South Carolina', '46': 'South Dakota',
      '47': 'Tennessee', '48': 'Texas', '49': 'Utah', '50': 'Vermont',
      '51': 'Virginia', '53': 'Washington', '54': 'West Virginia',
      '55': 'Wisconsin', '56': 'Wyoming'
    };

    const allSeries = Object.keys(stateFIPS).map(fips => 
      `SMU${fips}000002000000003`
    );

    console.log(`📊 Requesting ${allSeries.length} state construction wage series...`);

    let totalInserted = 0;
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 2;

    for (let i = 0; i < allSeries.length; i += 50) {
      const batch = allSeries.slice(i, i + 50);
      
      try {
        const response = await fetch(BLS_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            seriesid: batch,
            startyear: startYear.toString(),
            endyear: currentYear.toString(),
            registrationkey: process.env.BLS_API_KEY || ''
          })
        });

        const data = await response.json();
        
        console.log(`📊 Batch ${Math.floor(i/50) + 1}/${Math.ceil(allSeries.length/50)} status: ${data.status}`);

        if (data.status === 'REQUEST_SUCCEEDED' && data.Results?.series) {
          for (const series of data.Results.series) {
            const seriesId = series.seriesID;
            const stateFipsCode = seriesId.substring(3, 5);
            const stateName = stateFIPS[stateFipsCode];
            
            if (!stateName || !series.data || series.data.length === 0) continue;

            const latestData = series.data[0];
            const hourlyRate = parseFloat(latestData.value);
            
            if (isNaN(hourlyRate)) continue;

            const trades = TRADE_TYPES;
            
            for (const trade of trades) {
              await pool.query(`
                INSERT INTO bls_labor_rates (state_code, trade_type, hourly_rate, last_updated)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (state_code, trade_type) 
                DO UPDATE SET 
                  hourly_rate = EXCLUDED.hourly_rate,
                  last_updated = NOW()
              `, [stateName, trade, hourlyRate]);
              
              totalInserted++;
            }
          }
        }

        console.log(`✅ Batch ${Math.floor(i/50) + 1}: ${totalInserted} rates loaded`);
        
        if (i + 50 < allSeries.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        console.error(`❌ Error fetching batch ${Math.floor(i/50) + 1}:`, error.message);
      }
    }

    console.log(`✅ BLS data fetch complete: ${totalInserted} rates inserted`);
    
  } catch (error) {
    console.error('❌ Error in fetchBLSData:', error);
  }
}

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`DROP TABLE IF EXISTS contracts CASCADE`);
    await client.query(`DROP TABLE IF EXISTS estimates CASCADE`);
   
    await client.query(`
      CREATE TABLE IF NOT EXISTS estimates (
        id SERIAL PRIMARY KEY,
        trade VARCHAR(50) NOT NULL,
        customer_name VARCHAR(255),
        customer_email VARCHAR(255),
        customer_phone VARCHAR(50),
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(2),
        zip VARCHAR(10),
        square_feet INTEGER,
        material_cost DECIMAL(10,2),
        labor_cost DECIMAL(10,2),
        fixed_costs DECIMAL(10,2),
        total_cost DECIMAL(10,2),
        cost_index DECIMAL(5,2),
        msa VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pricing_cache (
        id SERIAL PRIMARY KEY,
        trade VARCHAR(50) NOT NULL,
        state VARCHAR(2) NOT NULL,
        msa VARCHAR(100),
        pricing_data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pricing_cache_trade_state 
      ON pricing_cache(trade, state)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS api_refresh_log (
        id SERIAL PRIMARY KEY,
        refresh_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        records_updated INTEGER,
        status VARCHAR(50)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS zip_metro_mapping (
        id SERIAL PRIMARY KEY,
        zip_code VARCHAR(50) NOT NULL,
        msa_name VARCHAR(100),
        state VARCHAR(2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_zip_metro_zip 
      ON zip_metro_mapping(zip_code)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bls_labor_rates (
        id SERIAL PRIMARY KEY,
        state_code VARCHAR(50) NOT NULL,
        trade_type VARCHAR(50) NOT NULL,
        hourly_rate DECIMAL(10,2) NOT NULL,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(state_code, trade_type)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS regional_cost_indices (
        id SERIAL PRIMARY KEY,
        msa_name VARCHAR(100) NOT NULL,
        state VARCHAR(2),
        cost_index DECIMAL(5,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS county_seats (
        id SERIAL PRIMARY KEY,
        county_name VARCHAR(255) NOT NULL,
        state VARCHAR(2) NOT NULL,
        zip_code VARCHAR(10) NOT NULL,
        metro_area VARCHAR(255),
        UNIQUE(county_name, state)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS metro_areas (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        cost_index DECIMAL(10,2) DEFAULT 1.0
      );
    `);

    console.log('✅ Database tables initialized');

    const countResult = await client.query('SELECT COUNT(*) FROM bls_labor_rates');
    const blsCount = parseInt(countResult.rows[0].count);

    console.log(`📊 Current BLS records: ${blsCount}`);

    if (blsCount === 0 && process.env.ENABLE_BLS_INITIAL_FETCH === 'true') {
      console.log('📊 BLS tables empty - fetching initial data...');
      setTimeout(() => fetchBLSData(), 2000);
    } else if (blsCount === 0) {
      console.log('⚠️ BLS table empty but auto-fetch disabled.');
    } else {
      console.log(`✅ BLS data already loaded: ${blsCount} rates`);
    }

    const dataLoader = require('./data-loader');
    await dataLoader.loadReferenceData(pool);

    const zipMappingPath = path.join(__dirname, 'data', 'zip-to-msa-compressed.json');
    if (fs.existsSync(zipMappingPath)) {
      const zipData = JSON.parse(fs.readFileSync(zipMappingPath, 'utf8'));
      await client.query('DELETE FROM zip_metro_mapping');
      
      const { rows } = await client.query('SELECT COUNT(*) FROM zip_metro_mapping');
      if (parseInt(rows[0].count) === 0) {
        console.log('📦 Loading ZIP to MSA mappings...');
        
        for (const [zip, msaData] of Object.entries(zipData.prefix_map)) {
          await client.query(
            'INSERT INTO zip_metro_mapping (zip_code, msa_name, state) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [zip, msaData.metro || null, msaData.state || null]
          );
        }
        
        console.log(`✅ Loaded ${Object.keys(zipData.prefix_map).length} ZIP mappings`);
      }
    }

  } catch (error) {
    console.error('❌ Database initialization error:', error);
  } finally {
    client.release();
  }
}

initDatabase();

app.get('/', (req, res) => {
  res.json({ 
    status: 'InstaBid Backend Running',
    version: '2.0.0',
    endpoints: [
      '/api/calculate-estimate',
      '/api/send-estimate-email'
    ]
  });
});

async function calculateTradeEstimate(trade, data, hourlyRate, state, msa) {
  console.log(`🔧 Starting estimate calculation for ${trade}`);
  console.log(`📍 Location: ${state}, ${msa}`);
  console.log(`💼 Base labor rate: $${hourlyRate}/hr`);

  let subtotal = 0;
  let lineItems = [];
  let timeline = '';
  let materialCost = 0;
  let laborCost = 0;
  let fixedCosts = 0;

  const LABOR_HOURS_PER_SQFT = {
    'roofing': 0.02,
    'hvac': 0.015,
    'electrical': 0.025,
    'plumbing': 0.02,
    'flooring': 0.015,
    'painting': 0.01,
    'general': 0.05
  };

  // 1. GET REGIONAL MULTIPLIER
  const regionalResult = await pool.query(
    'SELECT multiplier, cost_tier FROM regional_multipliers WHERE state_code = $1',
    [state]
  );
  
  const regionalMultiplier = regionalResult.rows.length > 0 
    ? parseFloat(regionalResult.rows[0].multiplier) 
    : 1.0;
  
  const costTier = regionalResult.rows.length > 0 
    ? regionalResult.rows[0].cost_tier 
    : 'medium';

  console.log(`🗺️  Regional multiplier (${state}): ${regionalMultiplier}x [${costTier} cost]`);

  // 2. APPLY REGIONAL MULTIPLIER TO LABOR RATE
  const adjustedLaborRate = hourlyRate * regionalMultiplier;
  console.log(`💰 Adjusted labor rate: $${adjustedLaborRate.toFixed(2)}/hr`);

  // 3. GET SEASONAL MULTIPLIER
  const currentMonth = new Date().getMonth() + 1;
  const seasonalResult = await pool.query(
    `SELECT multiplier, description FROM seasonal_adjustments 
     WHERE trade = $1 
     AND is_active = true 
     AND $2 BETWEEN month_start AND month_end`,
    [trade, currentMonth]
  );

  const seasonalMultiplier = seasonalResult.rows.length > 0 
    ? parseFloat(seasonalResult.rows[0].multiplier) 
    : 1.0;
  
  const seasonalNote = seasonalResult.rows.length > 0 
    ? seasonalResult.rows[0].description 
    : 'Standard season';

  console.log(`📅 Seasonal multiplier (Month ${currentMonth}): ${seasonalMultiplier}x - ${seasonalNote}`);

  // 4. GET COMPLEXITY FACTORS
  const complexityResult = await pool.query(
    'SELECT * FROM complexity_factors WHERE trade = $1 AND is_active = true',
    [trade]
  );
  
  switch(trade) {
    case 'roofing': {
      const sqft = parseFloat(data.squareFeet);
      const pitchMatch = data.pitch.match(/^([\d.]+)/);
      const pitch = pitchMatch ? parseFloat(pitchMatch[1]) : 1.0;
      const materialMatch = data.material.match(/^([\d.]+)/);
      const materialCostPerSqFt = materialMatch ? parseFloat(materialMatch[1]) : 2.50;
      const layers = parseInt(data.layers) || 0;
      const chimneys = parseInt(data.chimneys) || 0;
      const valleys = parseInt(data.valleys) || 0;
      const stories = parseInt(data.stories) || 1;
      
      // NEW FIELDS
      const needsPlywood = data.needsPlywood === 'yes';
      const plywoodSqft = parseFloat(data.plywoodSqft) || 0;
      const existingRoofType = (data.existingRoofType && data.existingRoofType !== '') ? data.existingRoofType : 'asphalt';
      const skylights = parseInt(data.skylights) || 0;
      const ridgeVentFeet = parseFloat(data.ridgeVentFeet) || 0;
      
      console.log(`📐 Roofing calc: ${sqft}sqft, ${pitch}/12 pitch, ${stories} stories`);
      
      // MATERIAL COST
      materialCost = sqft * materialCostPerSqFt * regionalMultiplier;
      console.log(`🧱 Materials: ${sqft} × $${materialCostPerSqFt} × ${regionalMultiplier} = $${materialCost.toFixed(2)}`);
      
      // COMPLEXITY MULTIPLIER
      let complexityMultiplier = 1.0;
      
      if (pitch >= 9) {
        const steepFactor = complexityResult.rows.find(f => f.factor_key === 'steep_pitch');
        if (steepFactor) {
          complexityMultiplier *= parseFloat(steepFactor.multiplier);
          console.log(`⛰️  Steep pitch: ${steepFactor.multiplier}x`);
        }
      }
      
      if (stories >= 2) {
        const storyFactor = complexityResult.rows.find(f => f.factor_key === 'multi_story');
        if (storyFactor) {
          complexityMultiplier *= parseFloat(storyFactor.multiplier);
          console.log(`🏢 Multi-story: ${storyFactor.multiplier}x`);
        }
      }
      
      console.log(`✅ Complexity total: ${complexityMultiplier}x`);
      
      // LABOR CALCULATION
      let baseHoursPerSqft = 0.06;
      if (pitch >= 9) baseHoursPerSqft += 0.02;
      else if (pitch >= 6) baseHoursPerSqft += 0.01;
      
      const laborHours = sqft * baseHoursPerSqft * complexityMultiplier;
      laborCost = laborHours * adjustedLaborRate * seasonalMultiplier;
      
      console.log(`👷 Labor: ${sqft} × ${baseHoursPerSqft} × ${complexityMultiplier} = ${laborHours.toFixed(1)} hrs`);
      console.log(`💵 Labor cost: ${laborHours.toFixed(1)} × $${adjustedLaborRate.toFixed(2)} × ${seasonalMultiplier} = $${laborCost.toFixed(2)}`);
      
      // TEAR-OFF COST
      const tearOffRates = { 'asphalt': 0.50, 'tile': 0.85, 'metal': 0.65, 'wood_shake': 0.75 };
      const tearOffRate = tearOffRates[existingRoofType] || 0.50;
      const tearOffCost = layers * sqft * tearOffRate * regionalMultiplier;
      
      // PLYWOOD DECKING
      const plywoodCost = needsPlywood && plywoodSqft > 0 
        ? plywoodSqft * 3.50 * regionalMultiplier 
        : 0;
      
      // CHIMNEYS
      const chimneyFactor = complexityResult.rows.find(f => f.factor_key === 'chimney_flashing');
      const chimneyCost = chimneys > 0 && chimneyFactor 
        ? chimneys * parseFloat(chimneyFactor.fixed_cost) * regionalMultiplier 
        : 0;
      
      // VALLEYS
      const valleyFactor = complexityResult.rows.find(f => f.factor_key === 'valley_work');
      const valleyCost = valleys > 0 && valleyFactor 
        ? valleys * parseFloat(valleyFactor.fixed_cost) * regionalMultiplier 
        : 0;
      
      // SKYLIGHTS
      const skylightCost = skylights > 0 
        ? skylights * 300 * regionalMultiplier 
        : 0;
      
      // RIDGE VENTS
      const ridgeVentCost = ridgeVentFeet > 0 
        ? ridgeVentFeet * 10 * regionalMultiplier 
        : 0;
      
      // PERMITS
      const permitsCost = 500 * regionalMultiplier;
      
      // TOTALS
      fixedCosts = tearOffCost + plywoodCost + chimneyCost + valleyCost + skylightCost + ridgeVentCost + permitsCost;
      subtotal = materialCost + laborCost + fixedCosts;
      
      // LINE ITEMS
      lineItems.push({ description: 'Roofing Material', amount: materialCost });
      lineItems.push({ 
        description: `Labor (${laborHours.toFixed(1)} hours @ $${adjustedLaborRate.toFixed(2)}/hr)`, 
        amount: laborCost 
      });
      
      if (tearOffCost > 0) {
        const roofTypeName = existingRoofType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
        lineItems.push({ 
          description: `Tear-Off ${roofTypeName} (${layers} layer${layers > 1 ? 's' : ''})`, 
          amount: tearOffCost 
        });
      }
      
      if (plywoodCost > 0) {
        lineItems.push({ 
          description: `Plywood Decking Replacement (${plywoodSqft} sqft)`, 
          amount: plywoodCost 
        });
      }
      
      if (chimneyCost > 0) lineItems.push({ description: `Chimneys (${chimneys})`, amount: chimneyCost });
      if (valleyCost > 0) lineItems.push({ description: `Valleys (${valleys})`, amount: valleyCost });
      if (skylightCost > 0) lineItems.push({ description: `Skylights (${skylights})`, amount: skylightCost });
      if (ridgeVentCost > 0) lineItems.push({ description: `Ridge Vents (${ridgeVentFeet} ft)`, amount: ridgeVentCost });
      
      lineItems.push({ description: 'Permits & Disposal', amount: permitsCost });
      
      timeline = '3-5 business days';
      break;
    }

    case 'hvac': {
      const sqft = parseFloat(data.squareFeet) || 2000;
      const systemType = data.systemType || 'Central AC';
      const units = parseInt(data.units) || 1;
      
      const systemCosts = {
        'Central AC': 5000,
        'Heat Pump': 6500,
        'Furnace': 4500,
        'Ductless Mini-Split': 3500
      };
      
      const baseCost = (systemCosts[systemType] || 5000) * units;
      const systemCost = baseCost * regionalMultiplier;
      
      let ductworkCost = 0;
      if (systemType === 'Central AC' || systemType === 'Heat Pump' || systemType === 'Furnace') {
        const estimatedFeet = sqft / 10;
        ductworkCost = estimatedFeet * 30 * regionalMultiplier;
      }
      
      const estimatedHours = 40 * units * seasonalMultiplier;
      laborCost = estimatedHours * adjustedLaborRate;
      
      const permitCost = 300 * regionalMultiplier;
      
      materialCost = systemCost + ductworkCost;
      fixedCosts = permitCost;
      subtotal = materialCost + laborCost + fixedCosts;
      
      lineItems.push({
        description: `${systemType} System (${units} unit${units > 1 ? 's' : ''})`,
        amount: systemCost
      });
      
      if (ductworkCost > 0) {
        lineItems.push({
          description: `Ductwork (estimated ${Math.round(sqft / 10)} linear feet)`,
          amount: ductworkCost
        });
      }
      
      lineItems.push({
        description: `Labor (${estimatedHours.toFixed(1)} hours @ $${adjustedLaborRate.toFixed(2)}/hr)`,
        amount: laborCost
      });
      
      lineItems.push({
        description: 'Permits & Inspections',
        amount: permitCost
      });
      
      timeline = '5-7 business days';
      break;
    }

    case 'electrical': {
      const sqft = parseFloat(data.squareFeet) || 2000;
      const serviceType = data.serviceType || 'general';
      const amperage = parseInt(data.amperage) || 200;
      
      let elecLaborHours = 0;
      let elecMaterialCost = 0;
      
      if (serviceType === 'panel') {
        elecMaterialCost = (amperage / 200) * 2000 * regionalMultiplier;
        elecLaborHours = 8 + (amperage > 200 ? 4 : 0);
        lineItems.push({ 
          description: `${amperage}A Panel Upgrade`, 
          amount: elecMaterialCost 
        });
      } else if (serviceType === 'rewire') {
        elecMaterialCost = sqft * 2.5 * regionalMultiplier;
        elecLaborHours = sqft * LABOR_HOURS_PER_SQFT['electrical'];
        lineItems.push({ 
          description: `Full House Rewire (${sqft} sqft)`, 
          amount: elecMaterialCost 
        });
      } else {
        elecMaterialCost = 1500 * regionalMultiplier;
        elecLaborHours = 16;
        lineItems.push({ 
          description: 'Electrical Materials & Fixtures', 
          amount: elecMaterialCost 
        });
      }
      
      laborCost = elecLaborHours * adjustedLaborRate * seasonalMultiplier;
      const elecPermits = 350 * regionalMultiplier;
      
      materialCost = elecMaterialCost;
      fixedCosts = elecPermits;
      subtotal = materialCost + laborCost + fixedCosts;
      
      lineItems.push({ 
        description: `Labor (${elecLaborHours.toFixed(1)} hours @ $${adjustedLaborRate.toFixed(2)}/hr)`, 
        amount: laborCost 
      });
      lineItems.push({ 
        description: 'Permits & Inspection', 
        amount: elecPermits 
      });
      
      timeline = serviceType === 'rewire' ? '5-10 business days' : '2-4 business days';
      break;
    }

    case 'plumbing': {
      const bathrooms = parseInt(data.bathrooms) || 2;
      const serviceType = data.serviceType || 'general';
      const sqft = parseFloat(data.squareFeet) || 2000;
      
      let plumbLaborHours = 0;
      let plumbMaterialCost = 0;
      
      if (serviceType === 'repipe') {
        plumbMaterialCost = sqft * 3 * regionalMultiplier;
        plumbLaborHours = sqft * LABOR_HOURS_PER_SQFT['plumbing'];
        lineItems.push({ 
          description: `Whole House Repipe (${sqft} sqft)`, 
          amount: plumbMaterialCost 
        });
      } else if (serviceType === 'water_heater') {
        const heaterType = data.heaterType || 'tank';
        plumbMaterialCost = heaterType === 'tankless' ? 2500 : 1200;
        plumbMaterialCost *= regionalMultiplier;
        plumbLaborHours = heaterType === 'tankless' ? 8 : 5;
        lineItems.push({ 
          description: `${heaterType === 'tankless' ? 'Tankless' : 'Tank'} Water Heater`, 
          amount: plumbMaterialCost 
        });
      } else if (serviceType === 'fixture') {
        const fixtures = parseInt(data.fixtures) || 3;
        plumbMaterialCost = fixtures * 350 * regionalMultiplier;
        plumbLaborHours = fixtures * 2;
        lineItems.push({ 
          description: `Fixture Installation (${fixtures} fixtures)`, 
          amount: plumbMaterialCost 
        });
      } else {
        plumbMaterialCost = bathrooms * 600 * regionalMultiplier;
        plumbLaborHours = bathrooms * 12;
        lineItems.push({ 
          description: `Plumbing Work (${bathrooms} bathrooms)`, 
          amount: plumbMaterialCost 
        });
      }
      
      laborCost = plumbLaborHours * adjustedLaborRate * seasonalMultiplier;
      const plumbPermits = serviceType === 'repipe' ? 400 : 200;
      const permitCost = plumbPermits * regionalMultiplier;
      
      materialCost = plumbMaterialCost;
      fixedCosts = permitCost;
      subtotal = materialCost + laborCost + fixedCosts;
      
      lineItems.push({ 
        description: `Labor (${plumbLaborHours.toFixed(1)} hours @ $${adjustedLaborRate.toFixed(2)}/hr)`, 
        amount: laborCost 
      });
      lineItems.push({ 
        description: 'Permits & Inspection', 
        amount: permitCost 
      });
      
      timeline = serviceType === 'repipe' ? '5-7 business days' : '1-3 business days';
      break;
    }

    case 'flooring': {
      const sqft = parseFloat(data.squareFeet) || 1000;
      const floorType = data.floorType || 'laminate';
      
      const floorRates = {
        'hardwood': 8.0,
        'engineered_hardwood': 6.0,
        'laminate': 3.5,
        'tile': 5.5,
        'carpet': 3.0,
        'vinyl': 4.0,
        'lvp': 5.0
      };
      
      const materialRate = (floorRates[floorType] || 4.0) * regionalMultiplier;
      materialCost = sqft * materialRate;
      
      const floorLaborHours = sqft * LABOR_HOURS_PER_SQFT['flooring'];
      laborCost = floorLaborHours * adjustedLaborRate * seasonalMultiplier;
      
      const removalCost = data.needRemoval === 'yes' ? sqft * 1.5 * regionalMultiplier : 0;
      const underlaymentCost = sqft * 0.75 * regionalMultiplier;
      
      fixedCosts = removalCost + underlaymentCost;
      subtotal = materialCost + laborCost + fixedCosts;
      
      const floorTypeName = floorType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
      lineItems.push({ 
        description: `${floorTypeName} Flooring (${sqft} sqft @ $${materialRate.toFixed(2)}/sqft)`, 
        amount: materialCost 
      });
      lineItems.push({ 
        description: `Labor (${floorLaborHours.toFixed(1)} hours @ $${adjustedLaborRate.toFixed(2)}/hr)`, 
        amount: laborCost 
      });
      if (removalCost > 0) {
        lineItems.push({ 
          description: 'Old Flooring Removal & Disposal', 
          amount: removalCost 
        });
      }
      lineItems.push({ 
        description: 'Underlayment & Prep', 
        amount: underlaymentCost 
      });
      
      timeline = sqft < 500 ? '2-3 business days' : sqft < 1500 ? '3-5 business days' : '5-7 business days';
      break;
    }

    case 'painting': {
      const sqft = parseFloat(data.squareFeet) || 2000;
      const paintType = data.paintType || 'interior';
      const coats = parseInt(data.coats) || 2;
      const ceilings = data.includeCeilings === 'yes';
      const trim = data.includeTrim === 'yes';
      
      let paintMaterialRate = 0;
      let paintLaborRate = LABOR_HOURS_PER_SQFT['painting'];
      
      if (paintType === 'interior') {
        paintMaterialRate = 0.60;
      } else if (paintType === 'exterior') {
        paintMaterialRate = 0.85;
        paintLaborRate *= 1.3;
      } else {
        paintMaterialRate = 0.75;
        paintLaborRate *= 1.15;
      }
      
      materialCost = sqft * paintMaterialRate * coats * regionalMultiplier;
      
      let paintLaborHours = sqft * paintLaborRate * coats;
      if (ceilings) paintLaborHours += sqft * 0.005;
      if (trim) paintLaborHours += sqft * 0.003;
      
      laborCost = paintLaborHours * adjustedLaborRate * seasonalMultiplier;
      
      const prepCost = sqft * 0.30 * regionalMultiplier;
      fixedCosts = prepCost;
      subtotal = materialCost + laborCost + fixedCosts;
      
      const paintTypeName = paintType.charAt(0).toUpperCase() + paintType.slice(1);
      lineItems.push({ 
        description: `${paintTypeName} Paint & Materials (${coats} coat${coats > 1 ? 's' : ''})`, 
        amount: materialCost 
      });
      lineItems.push({ 
        description: `Labor (${paintLaborHours.toFixed(1)} hours @ $${adjustedLaborRate.toFixed(2)}/hr)`, 
        amount: laborCost 
      });
      lineItems.push({ 
        description: 'Surface Prep & Masking', 
        amount: prepCost 
      });
      
      timeline = sqft < 1000 ? '2-3 business days' : sqft < 2500 ? '3-5 business days' : '5-7 business days';
      break;
    }

    default: {
      console.log(`⚠️  Unknown trade type: ${trade}, using generic estimate`);
      materialCost = 2000 * regionalMultiplier;
      laborCost = 2000 * adjustedLaborRate / 35;
      subtotal = materialCost + laborCost;
      
      lineItems.push({ description: 'Materials', amount: materialCost });
      lineItems.push({ description: 'Labor', amount: laborCost });
      timeline = '3-5 business days';
      break;
    }
  }
  
  const tax = subtotal * 0.0825;
  const total = subtotal + tax;

  console.log(`✅ Estimate complete: $${total.toFixed(2)}`);

  return {
    success: true,
    lineItems,
    subtotal,
    tax,
    total,
    timeline,
    materialCost,
    laborCost,
    fixedCosts,
    appliedMultipliers: {
      regional: regionalMultiplier,
      seasonal: seasonalMultiplier,
      costTier: costTier,
      seasonalNote: seasonalNote
    }
  };
}

app.post('/api/calculate-estimate', async (req, res) => {
  try {
    const { trade, state, zip, address, ...tradeData } = req.body;

    console.log(`📊 Calculate estimate request for ${trade} in ${state}`);

    const laborResult = await pool.query(
      'SELECT hourly_rate FROM bls_labor_rates WHERE state_code = $1 AND trade_type = $2',
      [state, trade]
    );

    const hourlyRate = laborResult.rows.length > 0 
      ? parseFloat(laborResult.rows[0].hourly_rate) 
      : NATIONAL_AVERAGE_WAGE;

    const dataSource = laborResult.rows.length > 0 ? 'database' : 'national_average';

    console.log(`💼 Labor rate for ${trade} in ${state}: $${hourlyRate}/hr (source: ${dataSource})`);

    let msa = 'National Average';
    if (zip) {
      const msaResult = await pool.query(
        'SELECT msa_name FROM zip_metro_mapping WHERE zip_code = $1',
        [zip]
      );
      if (msaResult.rows.length > 0) {
        msa = msaResult.rows[0].msa_name;
      }
    }

    const estimate = await calculateTradeEstimate(trade, tradeData, hourlyRate, state, msa);

    res.json({
      success: true,
      lineItems: estimate.lineItems,
      subtotal: estimate.subtotal,
      tax: estimate.tax,
      total: estimate.total,
      timeline: estimate.timeline,
      msa: msa,
      laborRate: hourlyRate,
      dataSource: dataSource,
      appliedMultipliers: estimate.appliedMultipliers,
      materialCost: estimate.materialCost,
      laborCost: estimate.laborCost,
      fixedCosts: estimate.fixedCosts
    });

  } catch (error) {
    console.error('❌ Calculate estimate error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to calculate estimate',
      details: error.message 
    });
  }
});

app.post('/api/send-estimate-email', async (req, res) => {
  try {
    const { estimate, formData } = req.body;

    console.log(`📧 Sending estimate email to ${formData.clientEmail}`);

    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${formData.trade} Estimate - ${formData.clientName}`,
            description: `Project at ${formData.address}`
          },
          unit_amount: Math.round(estimate.total * 100)
        },
        quantity: 1
      }],
      after_completion: {
        type: 'redirect',
        redirect: { 
          url: process.env.SUCCESS_URL || '[https://instabid.com/thank-you'](https://instabid.com/thank-you')
        }
      }
    });

    console.log(`💳 Stripe payment link created: ${paymentLink.url}`);

    const pdfBuffer = await generatePDFEstimate(estimate, formData);
    const contractBuffer = await generateContract(estimate, formData);

    const transporter = nodemailer.createTransport(sgTransport({
      auth: { 
        api_key: process.env.SENDGRID_API_KEY 
      }
    }));

    const tradeName = formData.trade.charAt(0).toUpperCase() + formData.trade.slice(1);

    const mailOptions = {
      from: process.env.FROM_EMAIL || 'estimates@instabid.com',
      to: formData.clientEmail,
      subject: `Your ${tradeName} Estimate - ${formData.companyName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px;">
                  <tr>
                    <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                      <h1 style="margin: 0; color: #ffffff;">Your Professional Estimate</h1>
                      <p style="margin: 10px 0 0 0; color: #ffffff;">${formData.companyName}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px 30px;">
                      <p>Dear ${formData.clientName},</p>
                      <p>Thank you for requesting an estimate. We're excited to work with you on your ${tradeName.toLowerCase()} project.</p>
                      
                      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; margin: 30px 0; border: 2px solid #667eea;">
                        <tr>
                          <td style="padding: 25px;">
                            <h2 style="margin: 0 0 15px 0; color: #667eea;">Estimate Summary</h2>
                            <table width="100%">
                              <tr>
                                <td><strong>Project Type:</strong></td>
                                <td align="right">${tradeName}</td>
                              </tr>
                              <tr>
                                <td><strong>Address:</strong></td>
                                <td align="right">${formData.address}</td>
                              </tr>
                              <tr>
                                <td><strong>Subtotal:</strong></td>
                                <td align="right">$${estimate.subtotal.toFixed(2)}</td>
                              </tr>
                              <tr>
                                <td><strong>Tax:</strong></td>
                                <td align="right">$${estimate.tax.toFixed(2)}</td>
                              </tr>
                              <tr>
                                <td style="font-size: 18px; color: #667eea;"><strong>TOTAL:</strong></td>
                                <td align="right" style="font-size: 18px; color: #667eea;"><strong>$${estimate.total.toFixed(2)}</strong></td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                      
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                        <tr>
                          <td align="center">
                            <a href="${paymentLink.url}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px;">
                              💳 Pay Now with Stripe
                            </a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      attachments: [
        {
          filename: `${tradeName}_Estimate.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        },
        {
          filename: `Contract.pdf`,
          content: contractBuffer,
          contentType: 'application/pdf'
        }
      ]
    };

    await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: 'Email sent successfully',
      paymentLink: paymentLink.url
    });

  } catch (error) {
    console.error('❌ Email sending error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

function generatePDFEstimate(estimate, formData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const tradeName = formData.trade.charAt(0).toUpperCase() + formData.trade.slice(1);

      doc.fontSize(28).fillColor('#667eea').text('Professional Estimate', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).fillColor('#666666').text(formData.companyName, { align: 'center' });
      doc.moveDown(2);

      doc.fontSize(16).fillColor('#667eea').text('Client Information');
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#333333');
      doc.text(`Client Name: ${formData.clientName}`);
      doc.text(`Email: ${formData.clientEmail}`);
      doc.text(`Phone: ${formData.clientPhone || 'N/A'}`);
      doc.text(`Address: ${formData.address}`);
      doc.moveDown(2);

      doc.fontSize(16).fillColor('#667eea').text('Cost Breakdown');
      doc.moveDown(0.5);

      estimate.lineItems.forEach((item) => {
        doc.fontSize(11).fillColor('#333333').text(`${item.description}: $${item.amount.toFixed(2)}`);
        doc.moveDown(0.5);
      });

      doc.moveDown(1);
      doc.fontSize(14).fillColor('#667eea').text(`TOTAL: $${estimate.total.toFixed(2)}`);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function generateContract(estimate, formData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      doc.fontSize(24).fillColor('#667eea').text('SERVICE AGREEMENT', { align: 'center' });
      doc.moveDown(2);

      doc.fontSize(12).fillColor('#333333').text(`Contractor: ${formData.companyName}`);
      doc.text(`Client: ${formData.clientName}`);
      doc.text(`Address: ${formData.address}`);
      doc.moveDown(2);

      doc.fontSize(14).text('SCOPE OF WORK');
      doc.fontSize(11).text(`${formData.trade} services as detailed in estimate.`);
      doc.moveDown(1);

      doc.fontSize(14).text('PAYMENT TERMS');
      doc.fontSize(11).text(`Total: $${estimate.total.toFixed(2)}`);
      doc.text('50% deposit due upon signing');
      doc.text('50% balance due upon completion');

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

app.listen(port, () => {
  console.log(`🚀 InstaBid Backend running on port ${port}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
});

