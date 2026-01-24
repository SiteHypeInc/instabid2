// ========== INSTABID FULL SYSTEM DIAGNOSTIC ==========
// Save as: diagnostic.js
// Run: node diagnostic.js

const fs = require('fs');

console.log('🔍 INSTABID FULL SYSTEM DIAGNOSTIC');
console.log('='.repeat(60));
console.log('Generated:', new Date().toLocaleString());
console.log('='.repeat(60));

// Files to scan
const files = {
  backend: ['server.js', 'materialListGenerator.js'],
  frontend: [] // Add your dashboard/form files if local
};

// ========== 1. FIND ALL CALCULATION SOURCES ==========
console.log('\n\n📊 SECTION 1: ALL CALCULATION FUNCTIONS\n');

const calcFunctions = {};

files.backend.forEach(file => {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach((line, i) => {
      // Find function definitions
      if (line.match(/function\s+(calculate|generate|compute)/i) ||
          line.match(/const\s+(calculate|generate|compute)\w+\s*=/i) ||
          line.match(/async\s+function\s+(calculate|generate|compute)/i)) {
        
        const match = line.match(/(calculate|generate|compute)\w+/i);
        if (match) {
          const funcName = match[0];
          if (!calcFunctions[funcName]) {
            calcFunctions[funcName] = [];
          }
          calcFunctions[funcName].push({
            file: file,
            line: i + 1,
            code: line.trim().substring(0, 80)
          });
        }
      }
    });
  } else {
    console.log(`   ⚠️ File not found: ${file}`);
  }
});

Object.keys(calcFunctions).sort().forEach(func => {
  console.log(`\n   📌 ${func}()`);
  calcFunctions[func].forEach(loc => {
    console.log(`      └─ ${loc.file}:${loc.line}`);
  });
});

// ========== 2. FIND PRICING CONSTANTS ==========
console.log('\n\n💰 SECTION 2: PRICING CONSTANTS & VALUES\n');

const pricingPatterns = [
  { name: 'Shingle price', pattern: /shingle.*?(\d+\.?\d*)/gi },
  { name: 'Labor rate', pattern: /labor.*?rate.*?(\d+\.?\d*)/gi },
  { name: 'Underlayment', pattern: /underlayment.*?(\d+\.?\d*)/gi },
  { name: 'Disposal', pattern: /disposal.*?(\d+\.?\d*)/gi },
  { name: 'Per sqft', pattern: /(\d+\.?\d*)\s*\/?\s*sq\s*ft/gi },
  { name: 'Per hour', pattern: /(\d+\.?\d*)\s*\/?\s*h(ou)?r/gi },
];

files.backend.forEach(file => {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    
    console.log(`\n   📁 ${file}:`);
    
    pricingPatterns.forEach(({ name, pattern }) => {
      const matches = [...content.matchAll(pattern)];
      if (matches.length > 0) {
        const values = [...new Set(matches.map(m => m[1]))];
        console.log(`      ${name}: ${values.join(', ')}`);
      }
    });
  }
});

// ========== 3. TRACE DATA FLOW FOR ESTIMATES ==========
console.log('\n\n🔄 SECTION 3: ESTIMATE DATA FLOW\n');

if (fs.existsSync('server.js')) {
  const content = fs.readFileSync('server.js', 'utf8');
  
  // Find POST /api/estimate endpoint
  const estimateEndpoint = content.match(/app\.(post|get)\s*\(\s*['"`]\/api\/estimate/gi);
  if (estimateEndpoint) {
    console.log('   ✅ POST /api/estimate endpoint found');
  }
  
  // Find what functions it calls
  console.log('\n   📍 Functions called in estimate flow:');
  
  const flowFunctions = [
    'calculateTradeEstimate',
    'generateMaterialList',
    'calculateRoofing',
    'getHourlyRate',
    'calculateLabor'
  ];
  
  flowFunctions.forEach(func => {
    const regex = new RegExp(`${func}\\s*\\(`, 'g');
    const matches = [...content.matchAll(regex)];
    if (matches.length > 0) {
      console.log(`      └─ ${func}() called ${matches.length}x`);
      
      // Find where results are used
      const assignmentRegex = new RegExp(`(\\w+)\\s*=\\s*(await\\s+)?${func}`, 'g');
      const assignments = [...content.matchAll(assignmentRegex)];
      assignments.forEach(a => {
        console.log(`         └─ Result stored in: ${a[1]}`);
      });
    }
  });
}

// ========== 4. FIND DUPLICATE CALCULATIONS ==========
console.log('\n\n⚠️ SECTION 4: POTENTIAL DUPLICATE CALCULATIONS\n');

const allContent = files.backend
  .filter(f => fs.existsSync(f))
  .map(f => ({ file: f, content: fs.readFileSync(f, 'utf8') }));

const laborCalcPatterns = [
  /laborHours\s*=\s*[^;]+/g,
  /labor_hours\s*=\s*[^;]+/g,
  /hours\s*=\s*squareFeet\s*\*\s*[\d.]+/g,
];

console.log('   🔍 Labor hour calculations found:\n');

allContent.forEach(({ file, content }) => {
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    laborCalcPatterns.forEach(pattern => {
      if (line.match(pattern)) {
        console.log(`   ${file}:${i + 1}`);
        console.log(`   └─ ${line.trim().substring(0, 70)}...\n`);
      }
    });
  });
});

// ========== 5. MATERIAL LIST COMPARISON ==========
console.log('\n\n📦 SECTION 5: MATERIAL LIST SOURCES\n');

const materialListSources = [];

allContent.forEach(({ file, content }) => {
  // Find materialList array definitions
  const matches = content.matchAll(/materialList\s*[=:]\s*\[/g);
  for (const match of matches) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    materialListSources.push({ file, line: lineNum });
  }
  
  // Find materialList.push
  const pushMatches = content.matchAll(/materialList\.push\s*\(/g);
  for (const match of pushMatches) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    const lineContent = content.split('\n')[lineNum - 1];
    if (lineContent.includes('item')) {
      console.log(`   ${file}:${lineNum} - ${lineContent.trim().substring(0, 60)}...`);
    }
  }
});

// ========== 6. TEST ROOFING CALCULATION ==========
console.log('\n\n🧪 SECTION 6: TEST ROOFING CALCULATION\n');

const testRoof = {
  squareFeet: 2000,
  pitch: '6/12',
  layers: 1,
  chimneys: 1,
  skylights: 0,
  plywoodSqft: 2000,
  existingRoofType: 'asphalt'
};

console.log('   Test Input:');
console.log('   ' + JSON.stringify(testRoof, null, 2).replace(/\n/g, '\n   '));

// Correct calculation
const pitchMultipliers = {
  '3/12': 1.0, '4/12': 1.0, '5/12': 1.05,
  '6/12': 1.1, '7/12': 1.15, '8/12': 1.2,
  '9/12': 1.3, '10/12': 1.4, '11/12': 1.5, '12/12+': 1.6
};

const pitchMult = pitchMultipliers[testRoof.pitch] || 1.1;
const baseLabor = testRoof.squareFeet * 0.035;
const resheetLabor = testRoof.plywoodSqft > 0 ? testRoof.plywoodSqft * 0.01 : 0;
const detailLabor = (testRoof.chimneys * 3) + (testRoof.skylights * 2);
const totalLabor = (baseLabor + resheetLabor) * pitchMult + detailLabor;

console.log('\n   ✅ CORRECT Calculation:');
console.log(`      Base labor: ${testRoof.squareFeet} × 0.035 = ${baseLabor} hrs`);
console.log(`      Re-sheet:   ${testRoof.plywoodSqft} × 0.01 = ${resheetLabor} hrs`);
console.log(`      Subtotal:   ${baseLabor + resheetLabor} hrs`);
console.log(`      Pitch mult: × ${pitchMult} = ${((baseLabor + resheetLabor) * pitchMult).toFixed(1)} hrs`);
console.log(`      Details:    + ${detailLabor} hrs (chimneys/skylights)`);
console.log(`      ─────────────────────────`);
console.log(`      TOTAL:      ${totalLabor.toFixed(1)} labor hours`);

// Materials estimate
const materialCost = 8753; // From your correct material list
const laborRate = 75;
const laborCost = totalLabor * laborRate;
const subtotal = materialCost + laborCost;
const markup = subtotal * 0.20;
const tax = (subtotal + markup) * 0.0825;
const total = subtotal + markup + tax;

console.log('\n   💰 CORRECT Estimate:');
console.log(`      Materials:  $${materialCost.toLocaleString()}`);
console.log(`      Labor:      ${totalLabor.toFixed(1)} hrs × $${laborRate} = $${laborCost.toLocaleString()}`);
console.log(`      Subtotal:   $${subtotal.toLocaleString()}`);
console.log(`      Markup 20%: $${markup.toLocaleString()}`);
console.log(`      Tax 8.25%:  $${tax.toFixed(2)}`);
console.log(`      ─────────────────────────`);
console.log(`      TOTAL:      $${total.toFixed(2)}`);

// ========== 7. RECOMMENDATIONS ==========
console.log('\n\n🔧 SECTION 7: RECOMMENDED FIXES\n');

console.log('   1. ❌ calculateTradeEstimate() - OLD, wrong numbers');
console.log('      → Keep for now but OVERRIDE its output\n');

console.log('   2. ✅ generateMaterialList() - NEW, correct numbers');
console.log('      → Use this as source of truth\n');

console.log('   3. 🔗 In POST /api/estimate, after generateMaterialList():');
console.log('      ┌─────────────────────────────────────────────────────┐');
console.log('      │ estimate.materialCost = materialListResult.totalMaterialCost;');
console.log('      │ estimate.laborHours = materialListResult.laborHours;');
console.log('      │ estimate.laborCost = materialListResult.laborHours * hourlyRate;');
console.log('      │ estimate.totalCost = estimate.materialCost + estimate.laborCost;');
console.log('      └─────────────────────────────────────────────────────┘\n');

console.log('   4. 📊 Dashboard should READ from DB material_list column');
console.log('      → NOT recalculate with calculateRoofingEnhanced()\n');

console.log('='.repeat(60));
console.log('END DIAGNOSTIC');
console.log('='.repeat(60));