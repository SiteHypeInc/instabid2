// ========== INSTABID CURRENT STATE DIAGNOSTIC ==========
// Save as: diagnostic-current.js
// Run: node diagnostic-current.js

const fs = require('fs');

console.log('🔍 WHAT IS CURRENTLY RUNNING (AS-IS)');
console.log('='.repeat(60));

// Load the actual materialListGenerator
const { generateMaterialList } = require('./materialListGenerator');

// Test input - YOUR old house
const testInput = {
  squareFeet: '2000',
  pitch: '6/12',
  material: 'Architectural Shingles ($3.50/sqft)',
  layers: '1',
  chimneys: '1',
  skylights: '0',
  valleys: '0',
  needsPlywood: 'yes',
  plywoodSqft: '2000',
  existingRoofType: 'asphalt',
  ridgeVentFeet: '40',
  stories: '1'
};

console.log('\n📋 TEST INPUT (Your old house):');
console.log(JSON.stringify(testInput, null, 2));

// Run the ACTUAL current function
console.log('\n' + '='.repeat(60));
console.log('📦 CURRENT generateMaterialList() OUTPUT:');
console.log('='.repeat(60));

const result = generateMaterialList('roofing', testInput, 3);

console.log('\n📊 Material List:');
console.log('-'.repeat(50));
result.materialList.forEach(item => {
  console.log(`${item.item.padEnd(25)} ${String(item.quantity).padStart(6)} ${item.unit.padEnd(12)} $${item.unitCost.toFixed(2).padStart(8)} = $${item.totalCost.toFixed(2)}`);
});
console.log('-'.repeat(50));
console.log(`TOTAL MATERIALS: $${result.totalMaterialCost.toFixed(2)}`);
console.log(`LABOR HOURS: ${result.laborHours}`);

// Now calculate estimate both ways
console.log('\n' + '='.repeat(60));
console.log('💰 ESTIMATE CALCULATIONS:');
console.log('='.repeat(60));

const hourlyRate = 75.33; // WA rate from your logs
const laborCost = result.laborHours * hourlyRate;

console.log('\n❌ CURRENT (markup on total):');
const subtotal1 = result.totalMaterialCost + laborCost;
const markup1 = subtotal1 * 0.20;
const total1 = (subtotal1 + markup1) * 1.0825;
console.log(`   Materials:     $${result.totalMaterialCost.toFixed(2)}`);
console.log(`   Labor:         ${result.laborHours} hrs × $${hourlyRate} = $${laborCost.toFixed(2)}`);
console.log(`   Subtotal:      $${subtotal1.toFixed(2)}`);
console.log(`   Markup 20%:    $${markup1.toFixed(2)} (on materials + labor)`);
console.log(`   Tax 8.25%:     $${((subtotal1 + markup1) * 0.0825).toFixed(2)}`);
console.log(`   TOTAL:         $${total1.toFixed(2)}`);

console.log('\n✅ CORRECT (markup on materials only):');
const materialMarkup = result.totalMaterialCost * 0.20;
const subtotal2 = result.totalMaterialCost + materialMarkup + laborCost;
const total2 = subtotal2 * 1.0825;
console.log(`   Materials:     $${result.totalMaterialCost.toFixed(2)}`);
console.log(`   Mat Markup 20%: $${materialMarkup.toFixed(2)} (materials only)`);
console.log(`   Labor:         ${result.laborHours} hrs × $${hourlyRate} = $${laborCost.toFixed(2)}`);
console.log(`   Subtotal:      $${subtotal2.toFixed(2)}`);
console.log(`   Tax 8.25%:     $${(subtotal2 * 0.0825).toFixed(2)}`);
console.log(`   TOTAL:         $${total2.toFixed(2)}`);

// What it SHOULD be with correct labor
console.log('\n✅ TARGET (correct labor + markup on materials only):');
const correctLaborHours = 90; // Your number
const correctLaborCost = correctLaborHours * hourlyRate;
const correctMaterialMarkup = result.totalMaterialCost * 0.20;
const correctSubtotal = result.totalMaterialCost + correctMaterialMarkup + correctLaborCost;
const correctTotal = correctSubtotal * 1.0825;
console.log(`   Materials:     $${result.totalMaterialCost.toFixed(2)}`);
console.log(`   Mat Markup 20%: $${correctMaterialMarkup.toFixed(2)}`);
console.log(`   Labor:         ${correctLaborHours} hrs × $${hourlyRate} = $${correctLaborCost.toFixed(2)}`);
console.log(`   Subtotal:      $${correctSubtotal.toFixed(2)}`);
console.log(`   Tax 8.25%:     $${(correctSubtotal * 0.0825).toFixed(2)}`);
console.log(`   TOTAL:         $${correctTotal.toFixed(2)}`);

console.log('\n' + '='.repeat(60));
console.log('🎯 TARGET RANGE: $14,000 - $18,000');
console.log('='.repeat(60));
