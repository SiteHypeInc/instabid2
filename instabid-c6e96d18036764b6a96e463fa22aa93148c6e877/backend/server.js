const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const fs = require('fs');
const path = require('path');
const BLS_API_URL = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';

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

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Define SOC codes for each trade
const TRADE_SOC_CODES = {
  'roofing': '47-2181',
  'hvac': '49-9021',
  'electrical': '47-2111',
  'plumbing': '47-2152',
  'flooring': '47-2042',
  'painting': '47-2141',
  'general': '47-1011'
};

// BLS API Integration
/*async function fetchBLSData() {
  console.log('📊 Fetching BLS labor rate data...');
  
  const BLS_API_URL = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
  const currentYear = new Date().getFullYear();
  const lastYear = currentYear - 1;
  
  const states = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
    'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
    'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
    'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
  ];
  
  const socCodes = Object.values(TRADE_SOC_CODES);
  let insertedCount = 0;
  
  for (const state of states) {
    for (const socCode of socCodes) {
      try {
        // BLS series ID format: OEUS + state code + 0000000 + SOC code
        const seriesId = `OEUS${state}000000${socCode.replace('-', '')}03`; // 03 = mean hourly wage
        
        const response = await fetch(BLS_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            seriesid: [seriesId],
            startyear: lastYear.toString(),
            endyear: currentYear.toString()
          })
        });

const data = await response.json();

// Debug logging
console.log(`🔍 Series ID: ${seriesId}`);
console.log(`📊 BLS Status: ${data.status}`);
console.log(`📊 Has series data: ${!!data.Results?.series?.[0]?.data?.length}`);

if (data.status === 'REQUEST_SUCCEEDED' && data.Results?.series?.[0]?.data?.length > 0) {
  const latestData = data.Results.series[0].data[0];
  const hourlyWage = parseFloat(latestData.value);
  
  console.log(`💰 ${state} ${socCode}: $${hourlyWage}/hr`);
  
  if (hourlyWage > 0) {
    await pool.query(`
      INSERT INTO bls_labor_rates (soc_code, state, hourly_wage, annual_wage)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT DO NOTHING
    `, [socCode, state, hourlyWage, hourlyWage * 2080]);
    
    insertedCount++;
  }
} else {
  console.log(`❌ No data returned for ${seriesId}`);
  if (data.message) console.log(`   Message: ${data.message}`);
}
        
        // Rate limit: BLS allows 25 requests per 10 seconds for unregistered users
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (err) {
        console.error(`⚠️ BLS fetch error for ${state} ${socCode}:`, err.message);
      }
    }
  }
  
  console.log(`✅ BLS data fetch complete: ${insertedCount} rates inserted`);
  return insertedCount;
}
*/

async function fetchBLSData() {
  console.log('📊 Fetching BLS labor rate data...');
  
  const states = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 
                  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
                  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
                  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
                  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
  
  const STATE_FIPS = {
    'AL': '01', 'AK': '02', 'AZ': '04', 'AR': '05', 'CA': '06', 'CO': '08',
    'CT': '09', 'DE': '10', 'FL': '12', 'GA': '13', 'HI': '15', 'ID': '16',
    'IL': '17', 'IN': '18', 'IA': '19', 'KS': '20', 'KY': '21', 'LA': '22',
    'ME': '23', 'MD': '24', 'MA': '25', 'MI': '26', 'MN': '27', 'MS': '28',
    'MO': '29', 'MT': '30', 'NE': '31', 'NV': '32', 'NH': '33', 'NJ': '34',
    'NM': '35', 'NY': '36', 'NC': '37', 'ND': '38', 'OH': '39', 'OK': '40',
    'OR': '41', 'PA': '42', 'RI': '44', 'SC': '45', 'SD': '46', 'TN': '47',
    'TX': '48', 'UT': '49', 'VT': '50', 'VA': '51', 'WA': '53', 'WV': '54',
    'WI': '55', 'WY': '56'
  };

  const socCodes = Object.values(TRADE_SOC_CODES);
  
  // Build ALL series IDs (7 trades × 50 states = 350 series)
  const allSeries = [];
  const seriesMap = {}; // Map series ID back to state/SOC
  
  for (const state of states) {
    const stateFips = STATE_FIPS[state];
    for (const socCode of socCodes) {
      const seriesId = `OEUS${stateFips}000000${socCode.replace('-', '')}03`;
      allSeries.push(seriesId);
      seriesMap[seriesId] = { state, socCode };
    }
  }
  
  console.log(`📊 Requesting ${allSeries.length} series in batches of 50...`);
  
  // BLS allows max 50 series per request
  let insertedCount = 0;
  for (let i = 0; i < allSeries.length; i += 50) {
    const batch = allSeries.slice(i, i + 50);

    console.log(`🔍 Sample series ID: ${batch[0]}`);
    
    try {
      const response = await fetch(BLS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seriesid: batch,
          startyear: (new Date().getFullYear() - 1).toString(),
          endyear: new Date().getFullYear().toString(),
          registrationkey: process.env.BLS_API_KEY
        })
      });
      
      const data = await response.json();

      //DEBUG TEST
      console.log(`📊 Batch ${Math.floor(i/50) + 1} status: ${data.status}`);
      if (data.message) console.log(`   Message: ${data.message}`);
      console.log(`   Series returned: ${data.Results?.series?.length || 0}`);
      
      if (data.status === 'REQUEST_SUCCEEDED' && data.Results?.series) {
        for (const series of data.Results.series) {
          if (series.data?.length > 0) {
            const latestData = series.data[0];
            const hourlyWage = parseFloat(latestData.value);
            const { state, socCode } = seriesMap[series.seriesID];
            
            if (hourlyWage > 0) {
              await pool.query(`
                INSERT INTO bls_labor_rates (soc_code, state, hourly_wage, annual_wage)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (soc_code, state) DO UPDATE 
                SET hourly_wage = $3, annual_wage = $4, updated_at = CURRENT_TIMESTAMP
              `, [socCode, state, hourlyWage, hourlyWage * 2080]);
              
              insertedCount++;
            }
          }
        }
        console.log(`✅ Batch ${Math.floor(i/50) + 1}/${Math.ceil(allSeries.length/50)}: ${insertedCount} rates loaded`);
      } else {
        console.log(`⚠️ Batch ${Math.floor(i/50) + 1} failed: ${data.message || 'Unknown error'}`);
      }
      
      // Rate limit: 25 requests per 10 seconds
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (err) {
      console.error(`⚠️ BLS batch fetch error:`, err.message);
    }
  }
  
  console.log(`✅ BLS data fetch complete: ${insertedCount} rates inserted`);
  return insertedCount;
}


// Initialize database tables
async function initDatabase() {
  const client = await pool.connect();
  try {
    // Drop dependent tables first
    await client.query(`DROP TABLE IF EXISTS contracts CASCADE`);
    await client.query(`DROP TABLE IF EXISTS estimates CASCADE`);
   
    // Estimates table
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

    // Pricing cache table
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

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pricing_cache_trade_state 
      ON pricing_cache(trade, state)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pricing_cache_msa 
      ON pricing_cache(msa)
    `);

    // API refresh log
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_refresh_log (
        id SERIAL PRIMARY KEY,
        refresh_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        records_updated INTEGER,
        status VARCHAR(50)
      )
    `);

    // ZIP to MSA mapping table
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

    // BLS Labor Rates table
/*await client.query(`
  CREATE TABLE IF NOT EXISTS bls_labor_rates (
    id SERIAL PRIMARY KEY,
    soc_code VARCHAR(10) NOT NULL,
    occupation_title VARCHAR(255),
    state VARCHAR(2) NOT NULL,
    hourly_wage DECIMAL(10,2) NOT NULL,
    annual_wage DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);*/

    await client.query(`
  CREATE TABLE IF NOT EXISTS bls_labor_rates (
    id SERIAL PRIMARY KEY,
    soc_code VARCHAR(10) NOT NULL,
    state VARCHAR(2) NOT NULL,
    hourly_wage DECIMAL(10,2) NOT NULL,
    annual_wage DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(soc_code, state)
  )
`);

await client.query(`
  CREATE INDEX IF NOT EXISTS idx_bls_soc_state 
  ON bls_labor_rates(soc_code, state)
`);

// Regional Cost Indices table
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
  CREATE INDEX IF NOT EXISTS idx_regional_msa 
  ON regional_cost_indices(msa_name)
`);

console.log('✅ BLS and regional pricing tables initialized');
// END NEW CODE

// CREATE REFERENCE DATA TABLES
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

await client.query(`
  CREATE TABLE IF NOT EXISTS regional_cost_indices (
    id SERIAL PRIMARY KEY,
    region VARCHAR(100) NOT NULL UNIQUE,
    cost_index DECIMAL(10,2) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log('✅ Reference data tables initialized');
// END NEW CODE

console.log('✅ BLS and regional pricing tables initialized');

// CREATE REFERENCE DATA TABLES
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

await client.query(`
  CREATE TABLE IF NOT EXISTS regional_cost_indices (
    id SERIAL PRIMARY KEY,
    region VARCHAR(100) NOT NULL UNIQUE,
    cost_index DECIMAL(10,2) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log('✅ Reference data tables initialized');
    
// END NEW CODE

    
    // Populate BLS data if tables are empty
const countResult = await client.query('SELECT COUNT(*) FROM bls_labor_rates');
const blsCount = parseInt(countResult.rows[0].count);

console.log(`📊 Current BLS records: ${blsCount}`);

if (blsCount === 0 && process.env.ENABLE_BLS_INITIAL_FETCH === 'true') {
  console.log('📊 BLS tables empty - fetching initial data...');
  setTimeout(() => fetchBLSData(), 2000);
} else if (blsCount === 0) {
  console.log('⚠️ BLS table empty but auto-fetch disabled. Set ENABLE_BLS_INITIAL_FETCH=true to enable.');
} else {
  console.log(`✅ BLS data already loaded: ${blsCount} rates`);
}
    console.log('✅ Database tables initialized');

    // Load reference data from JSON files

const dataLoader = require('./data-loader');
await dataLoader.loadReferenceData(pool);

    // Load ZIP to MSA mappings from JSON file
    const zipMappingPath = path.join(__dirname, 'data', 'zip-to-msa-compressed.json');
    if (fs.existsSync(zipMappingPath)) {
      const zipData = JSON.parse(fs.readFileSync(zipMappingPath, 'utf8'));

      // Clear old seed data
await client.query('DELETE FROM zip_metro_mapping');
console.log('🗑️ Cleared old ZIP mapping data');
      
      // Check if we need to populate the table
      const { rows } = await client.query('SELECT COUNT(*) FROM zip_metro_mapping');
      if (parseInt(rows[0].count) === 0) {
        console.log('📦 Loading ZIP to MSA mappings...');
      //changed zipData to zipData.prefix_map line 266  
        for (const [zip, msaData] of Object.entries(zipData.prefix_map)) {
          await client.query(
            'INSERT INTO zip_metro_mapping (zip_code, msa_name, state) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [zip, msaData.metro || null, msaData.state || null]
          );
        }
        
        console.log(`✅ Loaded ${Object.keys(zipData.prefix_map).length} ZIP to MSA mappings`);
      }
    }

  } catch (error) {
    console.error('❌ Database initialization error:', error);
  } finally {
    client.release();
  }
}

// Initialize on startup
initDatabase();

// Health check endpoint
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

// Calculate estimate endpoint
app.post('/api/calculate-estimate', async (req, res) => {
  try {
    const { trade, state, address, zip, ...tradeData } = req.body;

    console.log(`📊 Calculating ${trade} estimate for ${state}`);
    console.log('Trade data received:', tradeData);

    // Get MSA from ZIP if available
    let msa = 'National Average';
    if (zip) {
      const msaResult = await pool.query(
        'SELECT msa_name FROM zip_metro_mapping WHERE zip_code = $1',
        [zip]
      );
      if (msaResult.rows.length > 0) {
        msa = msaResult.rows[0].msa_name;
        console.log(`📍 Found MSA: ${msa} for ZIP: ${zip}`);
      }
    }

    // Get BLS labor rate for this trade
    const socCode = TRADE_SOC_CODES[trade] || TRADE_SOC_CODES['general'];
    let blsLaborRate = 35; // Default fallback
    
    const laborResult = await pool.query(
      'SELECT hourly_wage FROM bls_labor_rates WHERE soc_code = $1 AND state = $2',
      [socCode, state]
    );
    
    if (laborResult.rows.length > 0) {
      blsLaborRate = parseFloat(laborResult.rows[0].hourly_wage);
      console.log(`💰 BLS Labor Rate for ${trade}: $${blsLaborRate}/hr`);
    } else {
      console.log(`⚠️ No BLS rate found for ${socCode} in ${state}, using default $${blsLaborRate}/hr`);
    }

    // Get regional multiplier
    let regionalMultiplier = 1.0;
    if (msa !== 'National Average') {
      const regionResult = await pool.query(
        'SELECT cost_index FROM regional_cost_indices WHERE msa_name = $1',
        [msa]
      );
      
      if (regionResult.rows.length > 0) {
        regionalMultiplier = parseFloat(regionResult.rows[0].cost_index);
        console.log(`📊 Regional Multiplier for ${msa}: ${regionalMultiplier}`);
      }
    }

    // Calculate adjusted labor rate
    const adjustedLaborRate = blsLaborRate * regionalMultiplier;
    console.log(`🔧 Adjusted Labor Rate: $${adjustedLaborRate.toFixed(2)}/hr`);

    // Calculate estimate using trade-specific logic with BLS data
    const estimate = calculateEstimate(trade, state, msa, tradeData, adjustedLaborRate, regionalMultiplier);
    
    console.log('✅ Estimate calculated:', estimate);

    // Save to database
    await pool.query(
      `INSERT INTO estimates (trade, customer_name, customer_email, customer_phone, address, city, state, zip, square_feet, material_cost, labor_cost, fixed_costs, total_cost, cost_index, msa) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        trade,
        tradeData.name || null,
        tradeData.email || null,
        tradeData.phone || null,
        address,
        tradeData.city || null,
        state,
        zip || null,
        tradeData.squareFeet || null,
        estimate.materialCost || 0,
        estimate.laborCost || 0,
        estimate.fixedCosts || 0,
        estimate.total,
        regionalMultiplier,
        msa
      ]
    );

    res.json(estimate);

  } catch (error) {
    console.error('❌ Calculate estimate error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Email estimate endpoint
app.post('/api/send-estimate-email', async (req, res) => {
  try {
    const { estimate, formData } = req.body;

    console.log(`📧 Sending estimate email to ${formData.clientEmail}`);

    // 1. CREATE STRIPE PAYMENT LINK
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
          url: process.env.SUCCESS_URL || 'https://instabid.com/thank-you' 
        }
      }
    });

    console.log(`💳 Stripe payment link created: ${paymentLink.url}`);

    // 2. GENERATE PDF ESTIMATE
    const pdfBuffer = await generatePDFEstimate(estimate, formData);
    console.log('📄 PDF estimate generated');

    // 3. GENERATE CONTRACT PDF
    const contractBuffer = await generateContract(estimate, formData);
    console.log('📝 Contract PDF generated');

    // 4. SEND EMAIL VIA SENDGRID
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
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  
                  <tr>
                    <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px;">Your Professional Estimate</h1>
                      <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px; opacity: 0.9;">${formData.companyName}</p>
                    </td>
                  </tr>
                  
                  <tr>
                    <td style="padding: 40px 30px;">
                      <p style="margin: 0 0 20px 0; font-size: 16px; color: #333333;">Dear ${formData.clientName},</p>
                      
                      <p style="margin: 0 0 20px 0; font-size: 16px; color: #333333; line-height: 1.6;">
                        Thank you for requesting an estimate from ${formData.companyName}. 
                        We're excited to work with you on your ${tradeName.toLowerCase()} project.
                      </p>
                      
                      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; margin: 30px 0; border: 2px solid #667eea;">
                        <tr>
                          <td style="padding: 25px;">
                            <h2 style="margin: 0 0 15px 0; color: #667eea; font-size: 20px;">Estimate Summary</h2>
                            <table width="100%" cellpadding="5" cellspacing="0">
                              <tr>
                                <td style="color: #666666; font-size: 14px;"><strong>Project Type:</strong></td>
                                <td style="color: #333333; font-size: 14px; text-align: right;">${tradeName}</td>
                              </tr>
                              <tr>
                                <td style="color: #666666; font-size: 14px;"><strong>Address:</strong></td>
                                <td style="color: #333333; font-size: 14px; text-align: right;">${formData.address}</td>
                              </tr>
                              <tr>
                                <td style="color: #666666; font-size: 14px; padding-top: 10px;"><strong>Subtotal:</strong></td>
                                <td style="color: #333333; font-size: 14px; text-align: right; padding-top: 10px;">$${estimate.subtotal.toFixed(2)}</td>
                              </tr>
                              <tr>
                                <td style="color: #666666; font-size: 14px;"><strong>Tax:</strong></td>
                                <td style="color: #333333; font-size: 14px; text-align: right;">$${estimate.tax.toFixed(2)}</td>
                              </tr>
                              <tr>
                                <td style="color: #667eea; font-size: 18px; font-weight: bold; padding-top: 10px; border-top: 2px solid #667eea;"><strong>TOTAL:</strong></td>
                                <td style="color: #667eea; font-size: 18px; font-weight: bold; text-align: right; padding-top: 10px; border-top: 2px solid #667eea;">$${estimate.total.toFixed(2)}</td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="margin: 20px 0; font-size: 16px; color: #333333;">
                        <strong>📎 Attached Documents:</strong>
                      </p>
                      <ul style="margin: 0 0 30px 0; padding-left: 20px; color: #666666; line-height: 1.8;">
                        <li>📄 Detailed Estimate PDF</li>
                        <li>📝 Service Contract Agreement</li>
                      </ul>
                      
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                        <tr>
                          <td align="center">
                            <a href="${paymentLink.url}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: bold; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);">
                              💳 Pay Now with Stripe
                            </a>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="margin: 30px 0 0 0; font-size: 14px; color: #999999; line-height: 1.6;">
                        <strong>Important:</strong> This estimate is valid for 30 days from the date of issue. 
                        Final pricing is subject to on-site inspection. Questions? Simply reply to this email 
                        or call us at ${formData.clientPhone || 'the number provided'}.
                      </p>
                    </td>
                  </tr>
                  
                  <tr>
                    <td style="background-color: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #e0e0e0;">
                      <p style="margin: 0; font-size: 12px; color: #999999;">
                        ${formData.companyName} | Professional Estimating Services
                      </p>
                      <p style="margin: 5px 0 0 0; font-size: 12px; color: #999999;">
                        Powered by InstaBid Pro
                      </p>
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
          filename: `${tradeName}_Estimate_${formData.clientName.replace(/\s+/g, '_')}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        },
        {
          filename: `Contract_${formData.clientName.replace(/\s+/g, '_')}.pdf`,
          content: contractBuffer,
          contentType: 'application/pdf'
        }
      ]
    };

    await transporter.sendMail(mailOptions);

    console.log(`✅ Email sent successfully to ${formData.clientEmail}`);

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
      const doc = new PDFDocument({ 
        margin: 50,
        size: 'LETTER'
      });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const tradeName = formData.trade.charAt(0).toUpperCase() + formData.trade.slice(1);

      doc.fontSize(28).fillColor('#667eea').text('Professional Estimate', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).fillColor('#666666').text(formData.companyName, { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#999999').text(new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }), { align: 'center' });

      doc.moveDown(2);
      doc.strokeColor('#667eea').lineWidth(2).moveTo(50, doc.y).lineTo(562, doc.y).stroke();
      doc.moveDown(1.5);

      doc.fontSize(16).fillColor('#667eea').text('Client Information');
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#333333');

      const infoY = doc.y;
      doc.text(`Client Name:`, 50, infoY);
      doc.text(formData.clientName, 200, infoY);
      doc.text(`Email:`, 50, infoY + 20);
      doc.text(formData.clientEmail, 200, infoY + 20);
      doc.text(`Phone:`, 50, infoY + 40);
      doc.text(formData.clientPhone || 'N/A', 200, infoY + 40);
      doc.text(`Address:`, 50, infoY + 60);
      doc.text(formData.address, 200, infoY + 60, { width: 300 });

      doc.moveDown(5);

      doc.fontSize(16).fillColor('#667eea').text('Project Details');
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#333333');
      const projY = doc.y;
      doc.text(`Trade Type:`, 50, projY);
      doc.text(tradeName, 200, projY);

      doc.moveDown(2);

      doc.fontSize(16).fillColor('#667eea').text('Cost Breakdown');
      doc.moveDown(0.5);

      estimate.lineItems.forEach((item, index) => {
        const itemY = doc.y;
        doc.fontSize(11).fillColor('#333333').text(item.description, 50, itemY, { width: 350 });
        doc.text(`$${item.amount.toFixed(2)}`, 450, itemY, { width: 100, align: 'right' });
        doc.moveDown(0.8);
      });

      doc.moveDown(0.5);
      const totalsY = doc.y;
      doc.strokeColor('#cccccc').lineWidth(1).moveTo(50, totalsY).lineTo(562, totalsY).stroke();
      doc.moveDown(0.5);

      doc.fontSize(11).fillColor('#666666').text('Subtotal:', 350, doc.y);
      doc.text(`$${estimate.subtotal.toFixed(2)}`, 450, doc.y, { width: 100, align: 'right' });
      doc.moveDown(0.8);

      doc.text('Tax (8.25%):', 350, doc.y);
      doc.text(`$${estimate.tax.toFixed(2)}`, 450, doc.y, { width: 100, align: 'right' });
      doc.moveDown(1);

      doc.strokeColor('#667eea').lineWidth(2).moveTo(50, doc.y).lineTo(562, doc.y).stroke();
      doc.moveDown(0.5);

      doc.fontSize(16).fillColor('#667eea').text('TOTAL:', 350, doc.y);
      doc.text(`$${estimate.total.toFixed(2)}`, 450, doc.y, { width: 100, align: 'right' });
      doc.moveDown(2);

      doc.fontSize(14).fillColor('#2a9d2a').text('Estimated Timeline');
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#333333').text(estimate.timeline || 'To be determined based on project scope');
      doc.moveDown(2);

      doc.fontSize(9).fillColor('#999999').text('This estimate is valid for 30 days. Final pricing subject to on-site inspection.', 50, doc.page.height - 100, { width: 512, align: 'center' });
      doc.text('Thank you for your business!', { width: 512, align: 'center' });

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

      const tradeName = formData.trade.charAt(0).toUpperCase() + formData.trade.slice(1);

      doc.fontSize(24).fillColor('#667eea').text('SERVICE AGREEMENT', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#999999').text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), { align: 'center' });
      doc.moveDown(2);

      doc.fontSize(14).fillColor('#333333').text('This Service Agreement ("Agreement") is entered into by and between:');
      doc.moveDown(1);

      doc.fontSize(12).fillColor('#667eea').text('CONTRACTOR:', 50);
      doc.fontSize(11).fillColor('#333333').text(formData.companyName, 50, doc.y + 5);
      doc.moveDown(1.5);

      doc.fontSize(12).fillColor('#667eea').text('CLIENT:', 50);
      doc.fontSize(11).fillColor('#333333').text(formData.clientName, 50, doc.y + 5);
      doc.text(formData.address, 50, doc.y + 5);
      doc.text(formData.clientEmail, 50, doc.y + 5);
      if (formData.clientPhone) {
        doc.text(formData.clientPhone, 50, doc.y + 5);
      }
      doc.moveDown(2);

      doc.fontSize(14).fillColor('#667eea').text('1. SCOPE OF WORK');
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#333333').text(`Contractor agrees to provide ${tradeName.toLowerCase()} services as detailed in the attached estimate for the property located at ${formData.address}.`, { align: 'justify' });
      doc.moveDown(1.5);

      doc.fontSize(14).fillColor('#667eea').text('2. PAYMENT TERMS');
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#333333').text(`Total Contract Amount: $${estimate.total.toFixed(2)}`, 50);
      doc.moveDown(0.5);
      doc.text('Payment Schedule:', 50);
      doc.text('• 50% deposit due upon signing', 70);
      doc.text('• 50% balance due upon completion', 70);
      doc.text('• Payments accepted via cash, check, or credit card', 70);
      doc.moveDown(1.5);

      doc.fontSize(14).fillColor('#667eea').text('3. PROJECT TIMELINE');
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#333333').text(`Estimated completion time: ${estimate.timeline || 'To be determined'}`, { align: 'justify' });
      doc.moveDown(0.5);
      doc.text('Timeline may be adjusted due to weather conditions, material availability, or unforeseen circumstances.', { align: 'justify' });
      doc.moveDown(1.5);

      doc.fontSize(14).fillColor('#667eea').text('4. WARRANTIES & GUARANTEES');
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#333333').text('Contractor warrants that all work will be performed in a professional manner according to industry standards. Materials are warranted per manufacturer specifications.', { align: 'justify' });
      doc.moveDown(1.5);

      doc.fontSize(14).fillColor('#667eea').text('5. GENERAL TERMS');
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#333333').text('• This agreement is valid for 30 days from the date above', 70);
      doc.text('• Any changes to scope of work must be approved in writing', 70);
      doc.text('• Client agrees to provide access to property during work hours', 70);
      doc.text('• Contractor carries appropriate insurance and licensing', 70);
      doc.moveDown(3);

      doc.fontSize(12).fillColor('#333333').text('ACCEPTANCE OF TERMS');
      doc.moveDown(1);

      const sigY = doc.y;
      doc.fontSize(10).text('CONTRACTOR', 50, sigY);
      doc.moveTo(50, sigY + 40).lineTo(250, sigY + 40).stroke();
      doc.text('Signature', 50, sigY + 45);
      doc.text('Date: _______________', 50, sigY + 60);

      doc.text('CLIENT', 320, sigY);
      doc.moveTo(320, sigY + 40).lineTo(520, sigY + 40).stroke();
      doc.text('Signature', 320, sigY + 45);
      doc.text('Date: _______________', 320, sigY + 60);

      doc.fontSize(8).fillColor('#999999').text('This contract is legally binding once signed by both parties.', 50, doc.page.height - 80, { width: 512, align: 'center' });
      doc.text(`${formData.companyName} | Professional Services`, { width: 512, align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function calculateEstimate(trade, state, msa, data, adjustedLaborRate, regionalMultiplier) {
  let subtotal = 0;
  let lineItems = [];
  let timeline = '';
  let materialCost = 0;
  let laborCost = 0;
  let fixedCosts = 0;

  // Estimate labor hours per square foot by trade
  const LABOR_HOURS_PER_SQFT = {
    'roofing': 0.02,      // ~20 hours per 1000 sqft
    'hvac': 0.015,        // ~15 hours per 1000 sqft
    'electrical': 0.025,  // ~25 hours per 1000 sqft
    'plumbing': 0.02,     // ~20 hours per 1000 sqft
    'flooring': 0.015,    // ~15 hours per 1000 sqft
    'painting': 0.01,     // ~10 hours per 1000 sqft
    'general': 0.05       // ~50 hours per 1000 sqft
  };

  switch(trade) {
    case 'roofing':
      const sqft = parseFloat(data.squareFeet);
      
      // Parse pitch - extract the numeric multiplier from "1.2 (6/12)" format
      const pitchMatch = data.pitch.match(/^([\d.]+)/);
      const pitch = pitchMatch ? parseFloat(pitchMatch[1]) : 1.0;
      
      // Parse material - extract the cost from "3.50 (Architectural)" format
      const materialMatch = data.material.match(/^([\d.]+)/);
      const materialCostPerSqFt = materialMatch ? parseFloat(materialMatch[1]) : 2.50;
      
      const layers = parseInt(data.layers) || 0;
      const chimneys = parseInt(data.chimneys) || 0;
      const valleys = parseInt(data.valleys) || 0;
      const stories = parseInt(data.stories) || 1;
      
      // Calculate material cost (apply regional multiplier to materials)
      materialCost = sqft * materialCostPerSqFt * regionalMultiplier;
      
      // Calculate labor using BLS rate
      const storyMultiplier = 1 + ((stories - 1) * 0.2); // +20% per story above 1
      const laborHours = sqft * LABOR_HOURS_PER_SQFT['roofing'] * pitch * storyMultiplier;
      laborCost = laborHours * adjustedLaborRate;
      
      // Additional costs
      const tearOffCost = layers * sqft * 0.50 * regionalMultiplier;
      const chimneyCost = chimneys * 500 * regionalMultiplier;
      const valleyCost = valleys * 150 * regionalMultiplier;
      const permitsCost = 500 * regionalMultiplier;
      
      fixedCosts = tearOffCost + chimneyCost + valleyCost + permitsCost;
      subtotal = materialCost + laborCost + fixedCosts;
      
      lineItems.push({ description: 'Roofing Material', amount: materialCost });
      lineItems.push({ description: `Labor (${laborHours.toFixed(1)} hours @ $${adjustedLaborRate.toFixed(2)}/hr)`, amount: laborCost });
      if (tearOffCost > 0) {
        lineItems.push({ description: `Tear-Off (${layers} layer${layers > 1 ? 's' : ''})`, amount: tearOffCost });
      }
      if (chimneyCost > 0) {
        lineItems.push({ description: `Chimneys (${chimneys})`, amount: chimneyCost });
      }
      if (valleyCost > 0) {
        lineItems.push({ description: `Valleys (${valleys})`, amount: valleyCost });
      }
      lineItems.push({ description: 'Permits & Disposal', amount: permitsCost });
      
      timeline = '3-5 business days';
      break;

    case 'hvac':
      const units = parseInt(data.units) || 1;
      const hvacSqft = parseFloat(data.squareFeet) || 2000;
      
      // System cost based on units (apply regional multiplier)
      const systemCost = units * 4500 * regionalMultiplier;
      
      // Labor using BLS rate
      const hvacLaborHours = units * 8; // ~8 hours per unit
      laborCost = hvacLaborHours * adjustedLaborRate;
      
      // Ductwork and materials
      const ductworkCost = hvacSqft * 2.50 * regionalMultiplier;
      const permitsCostHvac = 500 * regionalMultiplier;
      
      materialCost = systemCost + ductworkCost;
      fixedCosts = permitsCostHvac;
      
      lineItems.push({ description: `${units} HVAC Unit${units > 1 ? 's' : ''} (${data.systemType || 'Central AC'})`, amount: systemCost });
      lineItems.push({ description: `Installation Labor (${hvacLaborHours} hours @ $${adjustedLaborRate.toFixed(2)}/hr)`, amount: laborCost });
      lineItems.push({ description: 'Ductwork & Materials', amount: ductworkCost });
      lineItems.push({ description: 'Permits & Inspection', amount: permitsCostHvac });
      
      subtotal = materialCost + laborCost + fixedCosts;
      timeline = '2-3 days';
      break;

    case 'electrical':
      const elecSqft = parseFloat(data.squareFeet);
      let elecMaterialCost = 0;
      let elecLaborHours = 0;
      
      if (data.serviceType === 'panel') {
        elecMaterialCost = parseInt(data.amperage) * 5 * regionalMultiplier;
        elecLaborHours = 8; // Panel upgrade ~8 hours
        lineItems.push({ description: `${data.amperage} Amp Panel Upgrade`, amount: elecMaterialCost });
      } else if (data.serviceType === 'rewire') {
        elecMaterialCost = elecSqft * 2 * regionalMultiplier;
        elecLaborHours = elecSqft * LABOR_HOURS_PER_SQFT['electrical'];
        lineItems.push({ description: 'Full Rewire Materials', amount: elecMaterialCost });
      } else {
        elecMaterialCost = 1000 * regionalMultiplier;
        elecLaborHours = 12;
        lineItems.push({ description: 'Electrical Materials', amount: elecMaterialCost });
      }
      
      laborCost = elecLaborHours * adjustedLaborRate;
      const elecPermits = 300 * regionalMultiplier;
      
      materialCost = elecMaterialCost;
      fixedCosts = elecPermits;
      
      lineItems.push({ description: `Labor (${elecLaborHours.toFixed(1)} hours @ $${adjustedLaborRate.toFixed(2)}/hr)`, amount: laborCost });
      lineItems.push({ description: 'Permits & Inspection', amount: elecPermits });
      
      subtotal = materialCost + laborCost + fixedCosts;
      timeline = '2-4 days';
      break;

    case 'plumbing':
      const bathrooms = parseInt(data.bathrooms) || 1;
      const plumbSqft = parseFloat(data.squareFeet);
      let plumbMaterialCost = 0;
      let plumbLaborHours = 0;
      
      if (data.serviceType === 'repipe') {
        plumbMaterialCost = plumbSqft * 2 * regionalMultiplier;
        plumbLaborHours = plumbSqft * LABOR_HOURS_PER_SQFT['plumbing'];
        lineItems.push({ description: 'Full Repipe Materials', amount: plumbMaterialCost });
      } else if (data.serviceType === 'water_heater') {
        plumbMaterialCost = 1200 * regionalMultiplier;
        plumbLaborHours = 6;
        lineItems.push({ description: 'Water Heater', amount: plumbMaterialCost });
      } else {
        plumbMaterialCost = bathrooms * 400 * regionalMultiplier;
        plumbLaborHours = bathrooms * 8;
        lineItems.push({ description: 'Plumbing Materials', amount: plumbMaterialCost });
      }
      
      laborCost = plumbLaborHours * adjustedLaborRate;
      materialCost = plumbMaterialCost;
      
      lineItems.push({ description: `Labor (${plumbLaborHours.toFixed(1)} hours @ $${adjustedLaborRate.toFixed(2)}/hr)`, amount: laborCost });
      
      subtotal = materialCost + laborCost;
      timeline = '1-3 days';
      break;

    case 'flooring':
      const floorSqft = parseFloat(data.squareFeet);
      let floorMaterialRate = 0;
      
      switch(data.floorType) {
        case 'hardwood': floorMaterialRate = 5; break;
        case 'laminate': floorMaterialRate = 2; break;
        case 'tile': floorMaterialRate = 3.5; break;
        case 'carpet': floorMaterialRate = 1.5; break;
        case 'vinyl': floorMaterialRate = 2.5; break;
      }
      
      materialCost = floorSqft * floorMaterialRate * regionalMultiplier;
      const floorLaborHours = floorSqft * LABOR_HOURS_PER_SQFT['flooring'];
      laborCost = floorLaborHours * adjustedLaborRate;
      const removalCost = 500 * regionalMultiplier;
      
      fixedCosts = removalCost;
      
      lineItems.push({ description: 'Flooring Material', amount: materialCost });
      lineItems.push({ description: `Installation Labor (${floorLaborHours.toFixed(1)} hours @ $${adjustedLaborRate.toFixed(2)}/hr)`, amount: laborCost });
      lineItems.push({ description: 'Removal & Disposal', amount: removalCost });
      
      subtotal = materialCost + laborCost + fixedCosts;
      timeline = '2-4 days';
      break;

    case 'painting':
      const paintSqft = parseFloat(data.squareFeet);
      let paintMaterialRate = 0;
      
      if (data.paintType === 'interior') paintMaterialRate = 0.50;
      else if (data.paintType === 'exterior') paintMaterialRate = 0.75;
      else paintMaterialRate = 1.00;
      
      materialCost = paintSqft * paintMaterialRate * regionalMultiplier;
      const paintLaborHours = paintSqft * LABOR_HOURS_PER_SQFT['painting'];
      laborCost = paintLaborHours * adjustedLaborRate;
      
      lineItems.push({ description: 'Paint & Materials', amount: materialCost });
      lineItems.push({ description: `Labor (${paintLaborHours.toFixed(1)} hours @ $${adjustedLaborRate.toFixed(2)}/hr)`, amount: laborCost });
      
      subtotal = materialCost + laborCost;
      timeline = '3-7 days';
      break;

    case 'general':
      const genSqft = parseFloat(data.squareFeet);
      let genMaterialRate = 0;
      let genLaborMultiplier = 1;
      
      if (data.projectType === 'remodel') {
        genMaterialRate = 50;
        genLaborMultiplier = 1.5;
      } else if (data.projectType === 'addition') {
        genMaterialRate = 75;
        genLaborMultiplier = 2;
      } else if (data.projectType === 'new_build') {
        genMaterialRate = 100;
        genLaborMultiplier = 2.5;
      } else {
        genMaterialRate = 25;
        genLaborMultiplier = 1;
      }
      
      materialCost = genSqft * genMaterialRate * regionalMultiplier;
      const genLaborHours = genSqft * LABOR_HOURS_PER_SQFT['general'] * genLaborMultiplier;
      laborCost = genLaborHours * adjustedLaborRate;
      
      lineItems.push({ description: 'Materials & Supplies', amount: materialCost });
      lineItems.push({ description: `Labor (${genLaborHours.toFixed(1)} hours @ $${adjustedLaborRate.toFixed(2)}/hr)`, amount: laborCost });
      
      subtotal = materialCost + laborCost;
      timeline = '2-8 weeks';
      break;
  }

  const tax = subtotal * 0.0825;
  const total = subtotal + tax;

  return {
    success: true,
    lineItems,
    subtotal,
    tax,
    total,
    timeline,
    msa: msa || 'N/A',
    materialCost,
    laborCost,
    fixedCosts
  };
}

app.listen(port, () => {
  console.log(`🚀 InstaBid Backend running on port ${port}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💾 Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
  console.log(`📧 SendGrid: ${process.env.SENDGRID_API_KEY ? 'Configured' : 'Not configured'}`);
  console.log(`💳 Stripe: ${process.env.STRIPE_SECRET_KEY ? 'Configured' : 'Not configured'}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
});
