const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DEFAULT_REGION = 'National';

// Load your materials catalog
const materialsPath = path.join(__dirname, '../homedepot_materials.json');
const materials = JSON.parse(fs.readFileSync(materialsPath, 'utf8'));

// Flatten all materials into searchable array
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

console.log(`📚 Loaded ${allMaterials.length} materials from catalog\n`);

// Function to match product against catalog
function findMatchingMaterial(product) {
  if (product.error) return null;
  
  const price = parseFloat(product.final_price || product.initial_price || 0);
  if (price <= 0) return null;
  
  // Must be in roofing/building category
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
  
  // Try to match against each material in catalog
  for (const material of allMaterials) {
    const matches = material.keywordWords.filter(word => titleLower.includes(word)).length;
    const threshold = Math.max(2, Math.floor(material.keywordWords.length * 0.4));
    
    if (matches >= threshold) {
      return {
        material,
        product,
        matchScore: matches
      };
    }
  }
  
  return null;
}

// Function to insert into database
async function cachePrice(sku, name, price, region, category) {
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
    console.error(`      ❌ Cache failed: ${error.message}`);
    return null;
  }
}

// Main processing function
async function processSnapshotFiles(snapshotDir) {
  console.log('🔍 Scanning for JSON snapshot files...\n');
  
  // Find all JSON files in the directory
  const files = fs.readdirSync(snapshotDir)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(snapshotDir, f));
  
  if (files.length === 0) {
    console.error('❌ No JSON files found!');
    console.log(`   Looking in: ${snapshotDir}`);
    console.log('   Please specify the correct directory with snapshot files.');
    return;
  }
  
  console.log(`✅ Found ${files.length} JSON files\n`);
  
  let totalProcessed = 0;
  let totalMatched = 0;
  let totalCached = 0;
  const matchedProducts = [];
  
  for (const file of files) {
    const filename = path.basename(file);
    console.log(`📂 Processing: ${filename}`);
    
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      console.error(`   ❌ Failed to parse: ${error.message}`);
      continue;
    }
    
    if (!Array.isArray(data)) {
      console.log(`   ⚠️  Not an array, skipping`);
      continue;
    }
    
    console.log(`   📦 ${data.length} products in file`);
    totalProcessed += data.length;
    
    let fileMatches = 0;
    
    for (const product of data) {
      const match = findMatchingMaterial(product);
      
      if (match) {
        fileMatches++;
        totalMatched++;
        
        const sku = product.sku || product.product_id || match.material.keyword.substring(0, 20);
        const name = product.product_name || product.title || match.material.name;
        const price = parseFloat(product.final_price || product.initial_price);
        
        matchedProducts.push({
          file: filename,
          category: match.material.category,
          material: match.material.name,
          productName: name,
          price: price,
          sku: sku,
          matchScore: match.matchScore
        });
        
        const cached = await cachePrice(sku, name, price, DEFAULT_REGION, match.material.category);
        
        if (cached) {
          totalCached++;
          console.log(`   ✅ ${match.material.category} > ${match.material.name}`);
          console.log(`      ${name}`);
          console.log(`      $${price.toFixed(2)} | SKU: ${sku}`);
        }
      }
    }
    
    console.log(`   📊 Matched: ${fileMatches} products\n`);
  }
  
  // Summary report
  console.log('═══════════════════════════════════════════════════');
  console.log('📊 IMPORT SUMMARY');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Total products scanned:  ${totalProcessed}`);
  console.log(`Total matched:           ${totalMatched}`);
  console.log(`Total cached to DB:      ${totalCached}`);
  console.log('═══════════════════════════════════════════════════\n');
  
  // Breakdown by category
  const byCategory = {};
  matchedProducts.forEach(p => {
    if (!byCategory[p.category]) {
      byCategory[p.category] = [];
    }
    byCategory[p.category].push(p);
  });
  
  console.log('📦 BREAKDOWN BY CATEGORY:\n');
  for (const [category, products] of Object.entries(byCategory)) {
    console.log(`${category.toUpperCase()} (${products.length} products):`);
    products.forEach(p => {
      console.log(`  • ${p.material}: $${p.price.toFixed(2)} - ${p.productName.substring(0, 60)}`);
    });
    console.log('');
  }
  
  // Show what's still missing
  console.log('❓ MATERIALS NOT FOUND IN SNAPSHOTS:\n');
  const foundMaterials = new Set(matchedProducts.map(p => p.material));
  
  for (const [category, items] of Object.entries(materials)) {
    const missing = items.filter(item => !foundMaterials.has(item.name));
    if (missing.length > 0) {
      console.log(`${category.toUpperCase()}:`);
      missing.forEach(m => console.log(`  ⚠️  ${m.name} (keyword: ${m.keyword})`));
      console.log('');
    }
  }
  
  await pool.end();
}

// Run it
if (require.main === module) {
  const snapshotDir = process.argv[2] || './snapshots';
  
  console.log('🚀 BRIGHTDATA SNAPSHOT IMPORTER');
  console.log('═══════════════════════════════════════════════════\n');
  
  if (!fs.existsSync(snapshotDir)) {
    console.error(`❌ Directory not found: ${snapshotDir}`);
    console.log('\nUsage: node import-existing-snapshots.js [snapshot-directory]');
    console.log('Example: node import-existing-snapshots.js ./brightdata-snapshots');
    process.exit(1);
  }
  
  processSnapshotFiles(snapshotDir)
    .then(() => {
      console.log('✅ Import complete!');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { processSnapshotFiles };
