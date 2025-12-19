const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const fs = require('fs');
const path = require('path');

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

// Initialize database tables
async function initDatabase() {
  const client = await pool.connect();
  try {
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

    console.log('✅ Database tables initialized');

    // Load ZIP to MSA mappings from JSON file
    const zipMappingPath = path.join(__dirname, 'zip-to-msa-compressed.json');
    if (fs.existsSync(zipMappingPath)) {
      const zipData = JSON.parse(fs.readFileSync(zipMappingPath, 'utf8'));
      
      // Check if we need to populate the table
      const { rows } = await client.query('SELECT COUNT(*) FROM zip_metro_mapping');
      if (parseInt(rows[0].count) === 0) {
        console.log('📦 Loading ZIP to MSA mappings...');
        
        for (const [zip, msaData] of Object.entries(zipData)) {
          await client.query(
            'INSERT INTO zip_metro_mapping (zip_code, msa_name, state) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [zip, msaData.msa || null, msaData.state || null]
          );
        }
        
        console.log(`✅ Loaded ${Object.keys(zipData).length} ZIP to MSA mappings`);
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
    const { trade, state, address, ...tradeData } = req.body;

    console.log(`📊 Calculating ${trade} estimate for ${state}`);

    // Extract ZIP from address if available
    let zip = null;
    const zipMatch = address.match(/\b\d{5}\b/);
    if (zipMatch) {
      zip = zipMatch[0];
    }

    // Get MSA from ZIP if available
    let msa = null;
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

    // Calculate estimate based on trade
    const estimate = calculateEstimate(trade, state, msa, tradeData);

    // Cache the result
    await pool.query(
      `INSERT INTO pricing_cache (trade, state, msa, pricing_data, updated_at) 
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [trade, state, msa, JSON.stringify(estimate)]
    );
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
        tradeData.zip || null,
        tradeData.squareFeet || null,
        estimate.lineItems.reduce((sum, item) => sum + item.amount, 0),
        0,
        0,
        estimate.total,
        1.0,
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

function calculateEstimate(trade, state, msa, data) {
  let subtotal = 0;
  let lineItems = [];
  let timeline = '';

  switch(trade) {
    case 'roofing':
      const sqft = parseFloat(data.squareFeet);
      const pitch = parseFloat(data.pitch);
      const material = parseFloat(data.material);
      const layers = parseInt(data.layers || 0);
      
      const materialCost = sqft * material * pitch;
      const laborCost = sqft * 2.5 * pitch;
      const tearOffCost = layers * sqft * 0.75;
      
      lineItems.push({ description: 'Roofing Material', amount: materialCost });
      lineItems.push({ description: 'Labor', amount: laborCost });
      if (tearOffCost > 0) {
        lineItems.push({ description: `Tear-Off (${layers} layer${layers > 1 ? 's' : ''})`, amount: tearOffCost });
      }
      lineItems.push({ description: 'Permits & Disposal', amount: 500 });
      subtotal = materialCost + laborCost + tearOffCost + 500;
      timeline = '3-5 business days';
      break;

    case 'hvac':
      const tonnage = parseInt(data.tonnage);
      const systemCost = tonnage * 2000;
      const installCost = tonnage * 800;
      lineItems.push({ description: `${tonnage} Ton HVAC System`, amount: systemCost });
      lineItems.push({ description: 'Installation Labor', amount: installCost });
      if (data.ductwork === 'full') {
        lineItems.push({ description: 'Full Ductwork Replacement', amount: 3500 });
        subtotal = systemCost + installCost + 3500;
      } else if (data.ductwork === 'partial') {
        lineItems.push({ description: 'Partial Ductwork', amount: 1500 });
        subtotal = systemCost + installCost + 1500;
      } else {
        subtotal = systemCost + installCost;
      }
      timeline = '1-2 days';
      break;

    case 'electrical':
      const elecSqft = parseFloat(data.squareFeet);
      let elecCost = 0;
      if (data.serviceType === 'panel') {
        elecCost = parseInt(data.amperage) * 10;
        lineItems.push({ description: `${data.amperage} Amp Panel Upgrade`, amount: elecCost });
      } else if (data.serviceType === 'rewire') {
        elecCost = elecSqft * 4;
        lineItems.push({ description: 'Full Rewire', amount: elecCost });
      } else {
        elecCost = 2000;
        lineItems.push({ description: 'Electrical Work', amount: elecCost });
      }
      lineItems.push({ description: 'Permits & Inspection', amount: 300 });
      subtotal = elecCost + 300;
      timeline = '2-4 days';
      break;

    case 'plumbing':
      const bathrooms = parseInt(data.bathrooms);
      const plumbSqft = parseFloat(data.squareFeet);
      let plumbCost = 0;
      if (data.serviceType === 'repipe') {
        plumbCost = plumbSqft * 3.5;
        lineItems.push({ description: 'Full Repipe', amount: plumbCost });
      } else if (data.serviceType === 'water_heater') {
        plumbCost = 1800;
        lineItems.push({ description: 'Water Heater Installation', amount: plumbCost });
      } else {
        plumbCost = bathrooms * 800;
        lineItems.push({ description: 'Plumbing Work', amount: plumbCost });
      }
      subtotal = plumbCost;
      timeline = '1-3 days';
      break;

    case 'flooring':
      const floorSqft = parseFloat(data.squareFeet);
      let floorRate = 0;
      switch(data.floorType) {
        case 'hardwood': floorRate = 8; break;
        case 'laminate': floorRate = 4; break;
        case 'tile': floorRate = 6; break;
        case 'carpet': floorRate = 3; break;
        case 'vinyl': floorRate = 5; break;
      }
      const floorCost = floorSqft * floorRate;
      lineItems.push({ description: 'Flooring Material & Installation', amount: floorCost });
      lineItems.push({ description: 'Removal & Disposal', amount: 500 });
      subtotal = floorCost + 500;
      timeline = '2-4 days';
      break;

    case 'painting':
      const paintSqft = parseFloat(data.squareFeet);
      let paintRate = 0;
      if (data.paintType === 'interior') paintRate = 2;
      else if (data.paintType === 'exterior') paintRate = 2.5;
      else paintRate = 4;
      const paintCost = paintSqft * paintRate;
      lineItems.push({ description: 'Paint & Labor', amount: paintCost });
      subtotal = paintCost;
      timeline = '3-7 days';
      break;

    case 'general':
      const genSqft = parseFloat(data.squareFeet);
      let genRate = 0;
      if (data.projectType === 'remodel') genRate = 100;
      else if (data.projectType === 'addition') genRate = 150;
      else if (data.projectType === 'new_build') genRate = 200;
      else genRate = 50;
      const genCost = genSqft * genRate;
      lineItems.push({ description: 'General Contracting', amount: genCost });
      subtotal = genCost;
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
    msa: msa || 'N/A'
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
