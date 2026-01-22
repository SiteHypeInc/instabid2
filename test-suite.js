const axios = require('axios');
const fs = require('fs');

const API_URL = 'https://roofbid-backend-production.up.railway.app';
const API_KEY = 'ib_74064730bb369effbc6bdfe50b5352e72180054351a5f3afb87839af29b029be';

const testCases = [
  // ROOFING TESTS
  {
    trade: 'roofing',
    customerName: 'Test Roofer 1',
    customerEmail: 'test@test.com',
    customerPhone: '555-1234',
    address: '123 Main St',
    city: 'Phoenix',
    state: 'AZ',
    zipCode: '85001',
    squareFeet: '2000',
    pitch: '6/12',
    stories: '1',
    material: 'Architectural Shingles ($3.50/sqft)',
    existingRoofType: 'asphalt',
    needsPlywood: 'no',
    layers: '1',
    valleys: '2',
    chimneys: '1',
    skylights: '0',
    ridgeVentFeet: '40'
  },
  {
    trade: 'roofing',
    customerName: 'Cache Test - High Cost CA',
    customerEmail: 'test@test.com',
    customerPhone: '555-1234',
    address: '123 Test St',
    city: 'Los Angeles',
    state: 'CA',
    zipCode: '90001',
    squareFeet: '2000',
    pitch: '6/12',
    stories: '1',
    material: 'Architectural Shingles ($3.50/sqft)',
    existingRoofType: 'asphalt',
    needsPlywood: 'no',
    layers: '1',
    valleys: '2',
    chimneys: '1',
    skylights: '0',
    ridgeVentFeet: '40',
    _expectedMultiplier: 1.35
  },
  {
    trade: 'roofing',
    customerName: 'Cache Test - Low Cost TX',
    customerEmail: 'test@test.com',
    customerPhone: '555-1234',
    address: '456 Test St',
    city: 'Dallas',
    state: 'TX',
    zipCode: '75201',
    squareFeet: '2000',
    pitch: '6/12',
    stories: '1',
    material: 'Architectural Shingles ($3.50/sqft)',
    existingRoofType: 'asphalt',
    needsPlywood: 'no',
    layers: '1',
    valleys: '2',
    chimneys: '1',
    skylights: '0',
    ridgeVentFeet: '40',
    _expectedMultiplier: 1.05
  },
  {
    trade: 'roofing',
    customerName: 'Cache Test - Cheapest MS',
    customerEmail: 'test@test.com',
    customerPhone: '555-1234',
    address: '789 Test St',
    city: 'Jackson',
    state: 'MS',
    zipCode: '39201',
    squareFeet: '2000',
    pitch: '6/12',
    stories: '1',
    material: 'Architectural Shingles ($3.50/sqft)',
    existingRoofType: 'asphalt',
    needsPlywood: 'no',
    layers: '1',
    valleys: '2',
    chimneys: '1',
    skylights: '0',
    ridgeVentFeet: '40',
    _expectedMultiplier: 0.84
  },
  // PAINTING
  {
    trade: 'painting',
    customerName: 'Test Painter WA',
    customerEmail: 'test@test.com',
    customerPhone: '555-1234',
    address: '789 Elm St',
    city: 'Seattle',
    state: 'WA',
    zipCode: '98101',
    squareFeet: '1600',
    workType: 'exterior',
    stories: '2',
    condition: 'fair'
  },
  // HVAC
  {
    trade: 'hvac',
    customerName: 'Test HVAC TX',
    customerEmail: 'test@test.com',
    customerPhone: '555-1234',
    address: '321 Pine St',
    city: 'Austin',
    state: 'TX',
    zipCode: '78701',
    squareFeet: '2000',
    systemType: 'central_air',
    complexity: 'standard'
  },
  // ELECTRICAL
  {
    trade: 'electrical',
    customerName: 'Test Electrician CO',
    customerEmail: 'test@test.com',
    customerPhone: '555-1234',
    address: '654 Maple Ave',
    city: 'Denver',
    state: 'CO',
    zipCode: '80201',
    workType: 'panel_upgrade',
    panelSize: '200'
  },
  // PLUMBING
  {
    trade: 'plumbing',
    customerName: 'Test Plumber FL',
    customerEmail: 'test@test.com',
    customerPhone: '555-1234',
    address: '987 Birch Ln',
    city: 'Miami',
    state: 'FL',
    zipCode: '33101',
    workType: 'water_heater',
    heaterType: 'tankless',
    heaterSize: '50'
  },
  // FLOORING
  {
    trade: 'flooring',
    customerName: 'Test Flooring OR',
    customerEmail: 'test@test.com',
    customerPhone: '555-1234',
    address: '147 Cedar St',
    city: 'Portland',
    state: 'OR',
    zipCode: '97201',
    squareFeet: '1200',
    flooringType: 'hardwood',
    complexity: 'standard'
  },
  // DRYWALL
  {
    trade: 'drywall',
    customerName: 'Test Drywall GA',
    customerEmail: 'test@test.com',
    customerPhone: '555-1234',
    address: '258 Spruce Dr',
    city: 'Atlanta',
    state: 'GA',
    zipCode: '30301',
    squareFeet: '800',
    ceilings: 'yes',
    texture: 'smooth'
  },
  // SIDING
  {
    trade: 'siding',
    customerName: 'Test Siding MA',
    customerEmail: 'test@test.com',
    customerPhone: '555-1234',
    address: '369 Willow Way',
    city: 'Boston',
    state: 'MA',
    zipCode: '02101',
    squareFeet: '1800',
    sidingType: 'vinyl',
    stories: '2'
  }
];

async function runTests() {
  const results = [];
  let passed = 0;
  let failed = 0;

  console.log('🧪 INSTABID AUTOMATED TEST SUITE\n');
  console.log(`Testing ${testCases.length} scenarios across 8 trades\n`);
  console.log('='.repeat(80) + '\n');

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const testNum = i + 1;

    console.log(`TEST ${testNum}/${testCases.length}: ${testCase.trade.toUpperCase()} - ${testCase.city}, ${testCase.state}`);

    try {
      const response = await axios.post(`${API_URL}/api/estimate`, {
        api_key: API_KEY,
        ...testCase
      });

      const data = response.data;
      const estimate = data.estimate; // 👈 KEY FIX: nested under estimate

      // Validation checks
      const checks = {
        success: data.success === true,
        hasEstimateId: !!data.estimateId,
        hasValidTotal: estimate && estimate.totalCost > 0,
        hasLaborCost: estimate && estimate.laborCost > 0,
        hasMaterialCost: estimate && estimate.materialCost > 0,
        hasLaborHours: estimate && estimate.laborHours > 0
      };

      const allPassed = Object.values(checks).every(v => v === true);

      if (allPassed) {
        console.log(`   ✅ PASSED`);
        console.log(`      Total: $${estimate.totalCost.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
        console.log(`      Labor: ${estimate.laborHours} hrs @ $${estimate.laborRate}/hr = $${estimate.laborCost.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
        console.log(`      Materials: $${estimate.materialCost.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
        console.log(`      Timeline: ${data.timeline}`);
        passed++;
      } else {
        console.log(`   ❌ FAILED`);
        Object.entries(checks).forEach(([key, value]) => {
          if (!value) console.log(`      - ${key}: FAILED`);
        });
        failed++;
      }

      results.push({
        testNum,
        trade: testCase.trade,
        location: `${testCase.city}, ${testCase.state}`,
        status: allPassed ? 'PASSED' : 'FAILED',
        total: estimate?.totalCost,
        labor: estimate?.laborCost,
        materials: estimate?.materialCost,
        hours: estimate?.laborHours,
        rate: estimate?.laborRate,
        timeline: data.timeline
      });

    } catch (error) {
      console.log(`   ❌ ERROR: ${error.response?.data?.error || error.message}`);
      failed++;

      results.push({
        testNum,
        trade: testCase.trade,
        location: `${testCase.city}, ${testCase.state}`,
        status: 'ERROR',
        error: error.response?.data?.error || error.message
      });
    }

    console.log('');
  }

  // Summary
  console.log('='.repeat(80));
  console.log('\n📊 TEST SUMMARY\n');
  console.log(`   ✅ Passed: ${passed}/${testCases.length}`);
  console.log(`   ❌ Failed: ${failed}/${testCases.length}`);
  console.log(`   📈 Success Rate: ${((passed/testCases.length)*100).toFixed(1)}%\n`);

  // Price comparison table
  console.log('='.repeat(80));
  console.log('\n💰 PRICE COMPARISON (Same 2000 sqft roof across states)\n');
  
  const roofingTests = results.filter(r => r.trade === 'roofing' && r.total);
  roofingTests.sort((a, b) => b.total - a.total);
  
  roofingTests.forEach(r => {
    const bar = '█'.repeat(Math.round(r.total / 500));
    console.log(`   ${r.location.padEnd(20)} $${r.total.toLocaleString('en-US', {minimumFractionDigits: 2}).padStart(12)} ${bar}`);
  });

  console.log('\n');

  // Write results to file
  const timestamp = new Date().toISOString();
  let output = `INSTABID TEST RESULTS - ${timestamp}\n`;
  output += `${'='.repeat(80)}\n\n`;
  output += `SUMMARY: ${passed}/${testCases.length} passed (${((passed/testCases.length)*100).toFixed(1)}%)\n\n`;
  output += `${'='.repeat(80)}\n\n`;

  results.forEach(r => {
    output += `${r.status} | ${r.trade.toUpperCase().padEnd(12)} | ${r.location.padEnd(20)}`;
    if (r.total) {
      output += ` | $${r.total.toLocaleString('en-US', {minimumFractionDigits: 2})} | ${r.hours}hrs @ $${r.rate}/hr`;
    }
    if (r.error) {
      output += ` | ERROR: ${r.error}`;
    }
    output += '\n';
  });

  fs.writeFileSync('test-results.txt', output);
  console.log('📄 Results saved to test-results.txt\n');
}

runTests().catch(console.error);