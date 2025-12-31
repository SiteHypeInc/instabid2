require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ['https://instabid.info', 'http://instabid.info', 'https://www.instabid.info'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.options('*', cors());
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

/*async function initDatabase() {
  try {
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
}*/
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

// ========== TRADE CALCULATION FUNCTION (YOUR EXISTING LOGIC - UNTOUCHED) ==========
async function calculateTradeEstimate(trade, data, hourlyRate, state, msa) {
  console.log(`🔧 Starting estimate calculation for ${trade}`);
  console.log(`📍 Location: ${state}, ${msa}`);
  console.log(`💼 Base labor rate: $${hourlyRate}/hr`);

  let laborHours = 0;
  let materialCost = 0;
  let equipmentCost = 0;

  switch(trade.toLowerCase()) {
    case 'roofing':
      const roofArea = parseFloat(data.squareFeet || data.roofArea) || 0;
      const roofComplexity = data.roofComplexity || 'medium';
      const roofPitch = data.roofPitch || 'medium';
      const stories = parseInt(data.stories) || 1;
      const existingRoofType = data.existingRoofType || '';

      // Base hours per 100 sqft
      let baseHoursPer100 = 2.5;
      
      // Complexity adjustment
      if (roofComplexity === 'low') baseHoursPer100 *= 0.8;
      if (roofComplexity === 'high') baseHoursPer100 *= 1.4;
      
      // Pitch adjustment
      if (roofPitch === 'low') baseHoursPer100 *= 0.9;
      if (roofPitch === 'steep') baseHoursPer100 *= 1.3;
      
      // Story adjustment
      if (stories === 2) baseHoursPer100 *= 1.15;
      if (stories >= 3) baseHoursPer100 *= 1.3;

      laborHours = (roofArea / 100) * baseHoursPer100;

      // Material cost (asphalt shingles baseline)
      materialCost = roofArea * 3.50;

      // Tear-off cost if replacing
      if (existingRoofType !== '' && existingRoofType !== 'none') {
        laborHours += (roofArea / 100) * 1.2;
        materialCost += roofArea * 0.50; // Disposal
      }

      // Regional cost adjustment
      const highCostStates = ['CA', 'NY', 'MA', 'WA', 'CT'];
      if (highCostStates.includes(state)) {
        materialCost *= 1.35;
      }

      equipmentCost = 350; // Dumpster, safety equipment
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

      // Size adjustment
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

// ========== NEW: PDF GENERATION FUNCTION ==========
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
// ========== END NEW: PDF GENERATION ==========

// ========== NEW: EMAIL SENDING FUNCTION ==========
/*async function sendEstimateEmails(estimateData, pdfBuffer) {
  const tradeName = estimateData.trade.charAt(0).toUpperCase() + estimateData.trade.slice(1);

  // Email to customer
  const customerMailOptions = {
    from: process.env.FROM_EMAIL || 'instabidinc@gmail.com',
    to: estimateData.customerEmail,
    subject: `Your ${tradeName} Estimate`,
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
          <p>Please see the attached PDF for complete details.</p>
          <p style="margin-top: 30px; color: #666; font-size: 12px;">This estimate is valid for 30 days.</p>
        </div>
      </div>
    `,
    attachments: [{
      filename: `estimate-${estimateData.id}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }]
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
    attachments: [{
      filename: `estimate-${estimateData.id}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }]
  };

  // Send both emails
  await transporter.sendMail(customerMailOptions);
  console.log(`✅ Customer email sent to ${estimateData.customerEmail}`);
  
  await transporter.sendMail(contractorMailOptions);
  console.log(`✅ Contractor email sent to ${process.env.CONTRACTOR_EMAIL}`);
} */

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

  // Email to contractor (same changes)
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

// ========== END NEW: EMAIL SENDING ==========

// ========== NEW: MAIN ESTIMATE SUBMISSION ENDPOINT ==========

  app.post('/api/estimate', async (req, res) => {
  console.log('🔵 RAW REQUEST BODY:', JSON.stringify(req.body, null, 2));
  
  try {
    // 1. Extract and normalize field names
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

    // Use whichever field name was sent
    const finalCustomerName = customerName || customer_name || req.body.name;
    const finalCustomerEmail = customerEmail || customer_email || req.body.email;
    const finalCustomerPhone = customerPhone || customer_phone || req.body.phone || '';
    const finalPropertyAddress = propertyAddress || address || '';
    const finalZipCode = zipCode || zip || '';
    const finalCity = req.body.city || 'Unknown';
    const finalState = req.body.state || 'Unknown';
    const finalZip = req.body.zip || '';

    console.log(`📋 Customer: ${finalCustomerName}, Trade: ${trade}`);
    console.log(`📍 Location: ${city}, ${state} ${finalZipCode}`);

    // 2. Get labor rate for location
    const hourlyRate = await getHourlyRate(state, finalZipCode);
    console.log(`💼 Labor rate for ${state}: $${hourlyRate}/hr`);
    
    // 3. Calculate estimate using your existing function
    const estimate = await calculateTradeEstimate(
      trade,
      tradeSpecificFields,
      hourlyRate,
      state,
      finalZipCode
    );

    console.log(`💰 Estimate calculated: $${estimate.totalCost}`);

    // 4. Save to database
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

    // 5. Generate PDF
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

    // Generate Contract
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


    // 6. Send emails (customer + contractor)
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

    // 7. Return response
   /* res.json({
      success: true,
      estimateId,
      estimate: {
        totalCost: estimate.totalCost,
        laborCost: estimate.laborCost,
        materialCost: estimate.materialCost,
        equipmentCost: estimate.equipmentCost || 0,
        laborHours: estimate.laborHours,
        laborRate: estimate.laborRate
      }
    });*/
    // 7. Return response
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
  // Keep old format for compatibility
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

// Standalone PDF generation endpoint (for manual download)
app.post('/api/generate-pdf', async (req, res) => {
  try {
    const data = req.body;
    
    // Get labor rate
    const hourlyRate = await getHourlyRate(data.state, data.zip);
    
    // Calculate estimate
    const estimate = await calculateTradeEstimate(
      data.trade,
      data,
      hourlyRate,
      data.state,
      data.zip
    );
    
    // Generate PDF
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

// ========== CONTRACT GENERATION FUNCTION ==========
/*async function generateContract(estimateData) {
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
}*/

// Standalone Contract generation endpoint (for manual download)
app.post('/api/generate-contract', async (req, res) => {
  try {
    console.log('📝 Contract request received:', req.body);
    
    const data = req.body;
    
    // Get labor rate
    const hourlyRate = await getHourlyRate(data.state, data.zip);
    
    // Calculate estimate
    const estimate = await calculateTradeEstimate(
      data.trade,
      data,
      hourlyRate,
      data.state,
      data.zip
    );
    
    // Generate Contract
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

// ========== END CONTRACT GENERATION ==========


// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

