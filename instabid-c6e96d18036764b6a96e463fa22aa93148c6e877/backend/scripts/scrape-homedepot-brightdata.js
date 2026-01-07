const axios = require('axios');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const API_KEY = process.env.BRIGHTDATA_API_KEY;
const DATASET_ID = process.env.BRIGHTDATA_DATASET_ID;
const BASE_URL = 'https://api.brightdata.com/datasets/v3';

const DEFAULT_REGION = {
  name: 'National',
  zip: '00000'
};

async function triggerScrape(keyword) {
  const url = `${BASE_URL}/scrape?dataset_id=${DATASET_ID}&notify=false&include_errors=true&type=discover_new&discover_by=keyword`;
  
  try {
    const response = await axios.post(url, {
      input: [{ keyword: keyword }]
    }, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    return response.data.snapshot_id;
  } catch (error) {
    if (error.response) {
      console.error(`    ❌ Status ${error.response.status}: ${JSON.stringify(error.response.data)}`);
    } else {
      console.error(`    ❌ ${error.message}`);
    }
    return null;
  }
}

async function pollSnapshot(snapshotId) {
  const url = `${BASE_URL}/snapshot/${snapshotId}`;
  let attempts = 0;
  const maxAttempts = 30;
  
  while (attempts < maxAttempts) {
    try {
      const response = await axios.get(url, {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
      });
      
      if (response.data.status === 'ready') {
        return response.data;
      }
      
      console.log(`      ⏳ Waiting for snapshot... (${attempts + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      attempts++;
    } catch (error) {
      console.error(`      ❌ Poll failed: ${error.message}`);
      return null;
    }
  }
  
  console.error(`      ❌ Timeout after ${maxAttempts} attempts`);
  return null;
}

async function downloadResults(snapshotId) {
  const url = `${BASE_URL}/snapshot/${snapshotId}?format=json`;
  
  try {
    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    });
    return response.data;
  } catch (error) {
    console.error(`      ❌ Download failed: ${error.message}`);
    return null;
  }
}

async function cachePrice(sku, name, price, region) {
  const query = `
    INSERT INTO materials_cache (sku, name, price, region, last_updated)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (sku, region)
    DO UPDATE SET price = $3, name = $2, last_updated = NOW()
  `;
  
  try {
    await pool.query(query, [sku, name, price, region]);
  } catch (error) {
    console.error(`      ❌ Cache failed: ${error.message}`);
  }
}

async function scrapeAllMaterials() {
  console.log('🚀 SCRAPER STARTED');
  
   let materials;
  try {
    console.log('📂 Loading materials catalog...');
    const path = require('path');
    const materialsPath = path.join(__dirname, '../homedepot_materials.json');
    console.log('📂 Looking for materials at:', materialsPath);
    materials = JSON.parse(
      fs.readFileSync(materialsPath, 'utf8')
    );
    console.log(`✅ Loaded ${Object.keys(materials).length} categories`);
  } catch (error) {
  
  let totalCached = 0;
  
  for (const [category, items] of Object.entries(materials)) {
    console.log(`\n🔧 Scraping ${category.toUpperCase()}...\n`);
    
    for (const material of items) {
      console.log(`  📦 ${material.name}`);
      console.log(`    📍 ${DEFAULT_REGION.name}...`);
      
      const snapshotId = await triggerScrape(material.keyword);
      
      if (!snapshotId) {
        console.log(`      ⚠️ No snapshot ID`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }
      
      console.log(`      ✓ Snapshot ${snapshotId}`);
      
      const snapshot = await pollSnapshot(snapshotId);
      
      if (!snapshot) {
        console.log(`      ⚠️ Snapshot failed`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }
      
      const results = await downloadResults(snapshotId);
      
      if (!results || !Array.isArray(results) || results.length === 0) {
        console.log(`      ⚠️ No results`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }
      
      const product = results[0];
      const sku = product.item_id || material.keyword.substring(0, 20);
      const name = product.title || material.name;
      const price = parseFloat(product.final_price || product.initial_price || 0);
      
      if (price > 0) {
        await cachePrice(sku, name, price, DEFAULT_REGION.name);
        console.log(`      ✅ ${name} - $${price}`);
        totalCached++;
      } else {
        console.log(`      ⚠️ No valid price found`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  console.log(`\n🎉 Scraping complete! ${totalCached} prices cached.`);
}

module.exports = { scrapeAllMaterials };

if (require.main === module) {
  scrapeAllMaterials().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
