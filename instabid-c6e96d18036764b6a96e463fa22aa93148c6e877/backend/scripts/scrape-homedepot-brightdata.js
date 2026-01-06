const axios = require('axios');
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const API_KEY = process.env.BRIGHTDATA_API_KEY;
const DATASET_ID = process.env.BRIGHTDATA_DATASET_ID;
const BASE_URL = '[https://api.brightdata.com/datasets/v3';](https://api.brightdata.com/datasets/v3';)

// Region ZIP codes
const regions = {
  'WY': '82801',
  'CA': '90210',
  'TX': '75001',
  'NY': '10001',
  'FL': '33101'
};

// Load materials (we'll convert from lowes_materials.json)
const materials = JSON.parse(fs.readFileSync('./homedepot_materials.json', 'utf8'));

/*async function triggerScrape(keyword, zipcode) {
  const url = `${BASE_URL}/trigger?dataset_id=${DATASET_ID}&format=json`;
  
  try {
    const response = await axios.post(url, [{
      keyword: keyword,
      zipcode: zipcode
    }], {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    return response.data.snapshot_id;
  } catch (error) {
    console.error(`    ❌ Trigger failed: ${error.response?.data?.message || error.message}`);
    return null;
  }
}*/

async function triggerScrape(keyword, zipcode) {
  const url = `${BASE_URL}/scrape?dataset_id=${DATASET_ID}&notify=false&include_errors=true&type=discover_new&discover_by=keyword`;
  
  try {
    const response = await axios.post(url, {
      input: [{
        keyword: keyword,
        zipcode: zipcode
      }]
    }, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    return response.data.snapshot_id;
  } catch (error) {
    console.error(`    ❌ Trigger failed: ${error.response?.data?.message || error.message}`);
    return null;
  }
}

async function pollSnapshot(snapshotId, maxWait = 120) {
  const url = `${BASE_URL}/snapshot/${snapshotId}`;
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait * 1000) {
    try {
      const response = await axios.get(url, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
      });
      
      const status = response.data.status;
      
      if (status === 'ready') {
        return true;
      } else if (status === 'failed') {
        console.error(`    ❌ Snapshot failed`);
        return false;
      }
      
      // Still running, wait 5 seconds
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      console.error(`    ❌ Poll error: ${error.message}`);
      return false;
    }
  }
  
  console.error(`    ❌ Timeout after ${maxWait}s`);
  return false;
}

async function downloadResults(snapshotId) {
  const url = `${BASE_URL}/snapshot/${snapshotId}?format=json`;
  
  try {
    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    });
    
    return response.data;
  } catch (error) {
    console.error(`    ❌ Download failed: ${error.message}`);
    return null;
  }
}

async function scrapeProduct(keyword, region, zipcode, trade, category, unit) {
  console.log(`    📍 ${region} (${zipcode})...`);
  
  // Step 1: Trigger scrape
  const snapshotId = await triggerScrape(keyword, zipcode);
  if (!snapshotId) {
    console.log(`      ⚠️ No snapshot ID`);
    return;
  }
  
  console.log(`      ⏳ Waiting for snapshot ${snapshotId}...`);

  
  
  // Step 2: Poll until ready
  const ready = await pollSnapshot(snapshotId, 120);
  if (!ready) {
    console.log(`      ⚠️ Snapshot not ready`);
    return;
  }
  
  // Step 3: Download results
  const results = await downloadResults(snapshotId);
  if (!results || results.length === 0) {
    console.log(`      ⚠️ No results`);
    return;
  }
  
  // Step 4: Parse first result
  const product = results[0];
  
  // Field names may vary - adjust based on actual response
  const name = product.product_name || product.name || product.title;
  const sku = product.sku || product.model_number || product.store_sku;
  const price = product.price || product.current_price;
  const available = product.availability || product.in_stock;
  
  if (!price) {
    console.log(`      ⚠️ No price in response`);
    return;
  }

  // Step 5: Insert into database
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
    sku || keyword.substring(0, 20),
    name,
    trade,
    category,
    region,
    parseFloat(price),
    unit,
    'homedepot'
  ]);
  
  console.log(`      ✅ ${name} - $${price}`);
}

async function scrapeAllMaterials() {
  let totalScraped = 0;
  
  for (const [trade, materialList] of Object.entries(materials)) {
    console.log(`\n🔧 Scraping ${trade.toUpperCase()}...`);
    
    for (const material of materialList) {
      console.log(`\n  📦 ${material.name}`);
      
      for (const [region, zipcode] of Object.entries(regions)) {
        try {
          await scrapeProduct(
            material.search,
            region,
            zipcode,
            trade,
            material.category,
            material.unit
          );
          totalScraped++;
        } catch (error) {
          console.error(`    ❌ Error: ${error.message}`);
        }
        
        // Rate limiting - wait 3 seconds between requests
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
