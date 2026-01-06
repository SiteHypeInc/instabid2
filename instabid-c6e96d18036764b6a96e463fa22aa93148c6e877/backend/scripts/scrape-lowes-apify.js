const axios = require('axios');
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const ACTOR_ID = '7SW9dfNMZnuwFv3JA';

const materials = JSON.parse(fs.readFileSync('./lowes_materials.json', 'utf8'));

// Regions for pricing
const regions = {
  'WY': '82801',
  'CA': '90210',
  'TX': '75001',
  'NY': '10001',
  'FL': '33101'
};

async function runApifyActor(query, zipCode) {
  try {
    // Start actor run
    const runResponse = await axios.post(
      `[https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_API_TOKEN}`,
      {
        query: query,
        limit: 1,  // Just get first result
        zipCode: zipCode
      },
      { timeout: 10000 }
    );

    const runId = runResponse.data.data.id;
    console.log(`    ⏳ Actor run started: ${runId}`);

    // Poll for completion
    let status = 'RUNNING';
    let attempts = 0;
    
    while (status === 'RUNNING' && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
      
      const statusResponse = await axios.get(
        `[https://api.apify.com/v2/acts/${ACTOR_ID}/runs/${runId}?token=${APIFY_API_TOKEN}`](https://api.apify.com/v2/acts/${ACTOR_ID}/runs/${runId}?token=${APIFY_API_TOKEN}`)
      );
      
      status = statusResponse.data.data.status;
      attempts++;
    }

    if (status !== 'SUCCEEDED') {
      console.log(`    ⚠️ Run ${status} after ${attempts * 2}s`);
      return null;
    }

    // Get results
    const resultsResponse = await axios.get(
      `[https://api.apify.com/v2/acts/${ACTOR_ID}/runs/${runId}/dataset/items?token=${APIFY_API_TOKEN}`](https://api.apify.com/v2/acts/${ACTOR_ID}/runs/${runId}/dataset/items?token=${APIFY_API_TOKEN}`)
    );

    const items = resultsResponse.data;
    
    if (items && items.length > 0) {
      const product = items[0];
      return {
        name: product.title || product.name,
        price: product.price || product.pricing?.value,
        itemId: product.itemId || product.productId,
        url: product.url
      };
    }

    return null;

  } catch (error) {
    console.error(`    ❌ Apify error:`, error.message);
    return null;
  }
}

async function scrapeAllMaterials() {
  let totalScraped = 0;
  
  for (const [trade, materialList] of Object.entries(materials)) {
    console.log(`\n🔧 Scraping ${trade.toUpperCase()}...`);
    
    for (const material of materialList) {
      console.log(`\n  📦 ${material.name}`);
      
      for (const [region, zipCode] of Object.entries(regions)) {
        console.log(`    📍 ${region} (${zipCode})...`);
        
        const result = await runApifyActor(material.search, zipCode);
        
        if (result && result.price) {
          // Insert into database
          await pool.query(`
            INSERT INTO materials_cache (
              sku, material_name, trade, category, region, price, unit, retailer, last_updated
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT (sku, region) DO UPDATE SET
              price = $6,
              material_name = $2,
              last_updated = NOW()
          `, [
            result.itemId || material.search.substring(0, 20), // Use itemId or truncated search as SKU
            result.name,
            trade,
            material.category,
            region,
            result.price,
            material.unit,
            'lowes'
          ]);
          
          console.log(`      ✅ $${result.price} - ${result.name}`);
          totalScraped++;
        } else {
          console.log(`      ⚠️ No price found`);
        }
        
        // Rate limit: 3 seconds between queries
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }
  
  console.log(`\n🎉 Scraping complete! ${totalScraped} prices cached.`);
  await pool.end();
}

scrapeAllMaterials().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
