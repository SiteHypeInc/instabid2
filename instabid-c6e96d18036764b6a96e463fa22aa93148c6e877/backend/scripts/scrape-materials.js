const axios = require('axios');
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;

const materialSkus = JSON.parse(fs.readFileSync('./material_skus.json', 'utf8'));

// Zip codes for regional pricing
const regions = {
  'WY': '82801',
  'CA': '90210',
  'TX': '75001',
  'NY': '10001',
  'FL': '33101'
};

async function scrapeHomeDepotPrice(sku, zipCode) {
  try {
    const url = `https://www.homedepot.com/p/${sku}`;
    
    // Use ScrapingBee API directly via axios
    const response = await axios.get('https://app.scrapingbee.com/api/v1/', {
      params: {
        api_key: SCRAPINGBEE_API_KEY,
        url: url,
        render_js: 'false',
        premium_proxy: 'true',
        country_code: 'us'
      },
      timeout: 30000
    });

    const html = response.data;
    
    // Extract price (adjust regex based on actual HTML structure)
    const priceMatch = html.match(/price["\s:]+(\d+\.\d{2})/i);
    const nameMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    
    if (priceMatch) {
      return {
        price: parseFloat(priceMatch[1]),
        name: nameMatch ? nameMatch[1].trim() : null
      };
    }
    
    return null;
  } catch (error) {
    console.error(`❌ Error scraping SKU ${sku}:`, error.message);
    return null;
  }
}

async function scrapeAllMaterials() {
  let callCount = 0;
  
  for (const [trade, materials] of Object.entries(materialSkus)) {
    console.log(`\n🔧 Scraping ${trade.toUpperCase()}...`);
    
    for (const material of materials) {
      for (const [region, zipCode] of Object.entries(regions)) {
        console.log(`  📍 ${material.name} - ${region}...`);
        
        const priceData = await scrapeHomeDepotPrice(material.sku, zipCode);
        callCount++;
        
        if (priceData) {
          await pool.query(`
            INSERT INTO materials_cache (sku, material_name, trade, category, region, price, unit, retailer)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (sku, region) DO UPDATE SET
              price = $6,
              last_updated = NOW()
          `, [
            material.sku,
            priceData.name || material.name,
            trade,
            material.category,
            region,
            priceData.price,
            material.unit,
            'homedepot'
          ]);
          
          console.log(`    ✅ $${priceData.price}`);
        } else {
          console.log(`    ⚠️ No price found`);
        }
        
        // Rate limit: 1 request per second
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  console.log(`\n🎉 Scraping complete! ${callCount} API calls used.`);
  await pool.end();
}

scrapeAllMaterials();
