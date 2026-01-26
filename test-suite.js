// ============================================
// INSTABID TRADE TESTER
// Runs 5 estimates per trade across different states
// ============================================

const fetch = require('node-fetch');
const API_BASE = 'https://roofbid-backend-production.up.railway.app';
const API_KEY = 'ib_74064730bb369effbc6bdfe50b5352e72180054351a5f3afb87839af29b029be';

// 5 test states for regional multiplier coverage
const TEST_STATES = ['TX', 'CA', 'NY', 'FL', 'OH'];

// Test data generators for each trade
const testData = {
  
  roofing: (state, index) => ({
    name: `Test Roofer ${index + 1}`,
    email: `test${index + 1}@rooftest.com`,
    phone: '555-555-5555',
    address: `${1000 + index} Test Street`,
    city: 'Test City',
    state: state,
    zip: '75001',
    squareFeet: [1800, 2200, 2800, 3500, 1500][index],
    roofPitch: ['low', 'medium', 'high', 'steep', 'medium'][index],
    stories: [1, 2, 2, 3, 1][index],
    roofingMaterial: ['asphalt', 'architectural', 'metal', 'tile', 'asphalt'][index],
    existingLayers: [1, 2, 1, 1, 2][index],
    skylights: [0, 1, 2, 0, 1][index],
    chimneys: [1, 0, 1, 2, 0][index]
  }),

  siding: (state, index) => ({
    name: `Test Siding ${index + 1}`,
    email: `test${index + 1}@sidingtest.com`,
    phone: '555-555-5555',
    address: `${2000 + index} Test Ave`,
    city: 'Test City',
    state: state,
    zip: '75001',
    squareFeet: [1200, 1800, 2400, 3000, 1500][index],
    stories: [1, 2, 2, 3, 1][index],
    sidingMaterial: ['vinyl', 'fiber_cement', 'wood', 'metal', 'vinyl'][index],
    removeSiding: ['yes', 'no', 'yes', 'yes', 'no'][index]
  }),

  electrical: (state, index) => ({
    name: `Test Electrical ${index + 1}`,
    email: `test${index + 1}@elecest.com`,
    phone: '555-555-5555',
    address: `${3000 + index} Test Blvd`,
    city: 'Test City',
    state: state,
    zip: '75001',
    squareFeet: [1500, 2000, 2500, 3000, 1800][index],
    serviceType: ['panel_upgrade', 'outlets', 'fixtures', 'ev_charger', 'panel_upgrade'][index],
    panelSize: ['100', '200', '200', '400', '200'][index],
    outletCount: [0, 10, 5, 0, 8][index],
    switchCount: [0, 5, 3, 0, 4][index],
    fixtureCount: [0, 3, 8, 0, 5][index],
    evCharger: ['no', 'no', 'no', 'yes', 'no'][index]
  }),

  painting: (state, index) => ({
    name: `Test Painting ${index + 1}`,
    email: `test${index + 1}@painttest.com`,
    phone: '555-555-5555',
    address: `${4000 + index} Test Lane`,
    city: 'Test City',
    state: state,
    zip: '75001',
    squareFeet: [1500, 2000, 2500, 3200, 1800][index],
    projectType: ['interior', 'exterior', 'both', 'interior', 'exterior'][index],
    rooms: [4, 6, 8, 5, 0][index],
    ceilings: ['yes', 'no', 'yes', 'yes', 'no'][index],
    trim: ['yes', 'yes', 'no', 'yes', 'yes'][index],
    doors: [4, 6, 8, 5, 2][index],
    windows: [6, 8, 12, 10, 6][index],
    exteriorSqft: [0, 0, 1800, 0, 2000][index],
    prepWork: ['minor', 'moderate', 'extensive', 'minor', 'moderate'][index],
    coats: [2, 2, 2, 1, 2][index]
  }),

  drywall: (state, index) => ({
    name: `Test Drywall ${index + 1}`,
    email: `test${index + 1}@drywalltest.com`,
    phone: '555-555-5555',
    address: `${5000 + index} Test Court`,
    city: 'Test City',
    state: state,
    zip: '75001',
    squareFeet: [500, 1000, 1500, 2000, 800][index],
    projectType: ['new_construction', 'repair', 'new_construction', 'addition', 'repair'][index],
    ceilingHeight: ['8', '9', '10', '12', '8'][index],
    finishLevel: ['3', '4', '5', '4', '3'][index],
    textureType: ['none', 'orange_peel', 'knockdown', 'none', 'popcorn'][index],
    repairSize: ['none', 'minor', 'none', 'none', 'moderate'][index]
  }),

  plumbing: (state, index) => ({
    name: `Test Plumbing ${index + 1}`,
    email: `test${index + 1}@plumbtest.com`,
    phone: '555-555-5555',
    address: `${6000 + index} Test Drive`,
    city: 'Test City',
    state: state,
    zip: '75001',
    squareFeet: [1500, 2000, 2500, 0, 0][index],
    serviceType: ['repipe', 'water_heater', 'fixture', 'general', 'water_heater'][index],
    stories: [1, 2, 2, 1, 1][index],
    bathrooms: [2, 3, 4, 2, 2][index],
    kitchens: [1, 1, 2, 1, 1][index],
    laundryRooms: [1, 1, 1, 0, 1][index],
    accessType: ['basement', 'crawlspace', 'slab', 'basement', 'basement'][index],
    heaterType: ['tank', 'tankless', 'tank', 'tank', 'tankless'][index],
    waterHeaterLocation: ['garage', 'basement', 'closet', 'garage', 'attic'][index],
    gasLineNeeded: ['no', 'yes', 'no', 'no', 'yes'][index],
    mainLineReplacement: ['no', 'no', 'yes', 'no', 'no'][index],
    garbageDisposal: ['no', 'no', 'no', 'yes', 'no'][index],
    iceMaker: ['no', 'no', 'no', 'yes', 'no'][index],
    waterSoftener: ['no', 'no', 'no', 'yes', 'no'][index],
    toiletCount: [0, 0, 2, 0, 0][index],
    sinkCount: [0, 0, 3, 0, 0][index],
    faucetCount: [0, 0, 2, 0, 0][index],
    tubShowerCount: [0, 0, 1, 0, 0][index]
  })
};

// ============================================
// TEST RUNNER
// ============================================

async function runEstimate(trade, data) {
  try {
    const response = await fetch(`${API_BASE}/api/estimate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify({
        trade: trade,
        contractorId: 4, // Bill's Plumbing test contractor
        ...data
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }
    
    const result = await response.json();
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function runAllTests() {
  const trades = ['roofing', 'siding', 'electrical', 'painting', 'drywall', 'plumbing'];
  const results = {};
  
  console.log('🚀 INSTABID TRADE TESTER');
  console.log('========================\n');
  
  for (const trade of trades) {
    console.log(`\n📋 Testing ${trade.toUpperCase()}...`);
    console.log('-'.repeat(50));
    
    results[trade] = [];
    
    for (let i = 0; i < 5; i++) {
      const state = TEST_STATES[i];
      const data = testData[trade](state, i);
      
      console.log(`  Test ${i + 1}/5 (${state})...`);
      
      const result = await runEstimate(trade, data);
      
      if (result.success) {
        const est = result.data;
        console.log(`    ✅ $${est.totalCost?.toLocaleString() || est.total?.toLocaleString() || 'N/A'} | Materials: $${est.materialCost?.toLocaleString() || 'N/A'} | Labor: $${est.laborCost?.toLocaleString() || 'N/A'}`);
        results[trade].push({ state, success: true, estimate: est });
      } else {
        console.log(`    ❌ FAILED: ${result.error}`);
        results[trade].push({ state, success: false, error: result.error });
      }
      
      // Small delay to not hammer the server
      await new Promise(r => setTimeout(r, 200));
    }
    
    // Summary for trade
    const passed = results[trade].filter(r => r.success).length;
    console.log(`\n  ${trade.toUpperCase()} SUMMARY: ${passed}/5 passed`);
  }
  
  // Final summary
  console.log('\n\n' + '='.repeat(50));
  console.log('📊 FINAL RESULTS');
  console.log('='.repeat(50));
  
  let totalPassed = 0;
  let totalTests = 0;
  
  for (const trade of trades) {
    const passed = results[trade].filter(r => r.success).length;
    totalPassed += passed;
    totalTests += 5;
    const status = passed === 5 ? '✅' : passed > 0 ? '⚠️' : '❌';
    console.log(`${status} ${trade.padEnd(12)} ${passed}/5`);
  }
  
  console.log('-'.repeat(30));
  console.log(`TOTAL: ${totalPassed}/${totalTests} (${Math.round(totalPassed/totalTests*100)}%)`);
  
  return results;
}

// Run it!
runAllTests();