
const axios = require('axios');
const fs = require('fs');

const API_URL = 'https://roofbid-backend-production.up.railway.app';
const API_KEY = 'ib_74064730bb369effbc6bdfe50b5352e72180054351a5f3afb87839af29b029be';

const testCases = [
  // ROOFING TESTS
  {
    trade: 'roofing',
    name: 'Test Roofer 1',
    email: 'test@test.com',
    phone: '555-1234',
    address: '123 Main St, Phoenix, AZ',
    city: 'Phoenix',
    state: 'AZ',
    zip: '85001', // Should be IN database
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
    name: 'Test Roofer 2',
    email: 'test@test.com',
    phone: '555-1234',
    address: '456 Oak St, Tempe, AZ',
    city: 'Tempe',
    state: 'AZ',
    zip: '85281', // Should NOT be in database (state fallback)
    squareFeet: '1600',
    pitch: '4/12',
    stories: '1',
    material: 'Architectural Shingles ($3.50/sqft)',
    existingRoofType: 'asphalt',
    needsPlywood: 'no',
    layers: '1',
    valleys: '1',
    chimneys: '0',
    skylights: '2',
    ridgeVentFeet: '30'
  },

  // PAINTING TESTS
  {
    trade: 'painting',
    name: 'Test Painter 1',
    email: 'test@test.com',
    phone: '555-1234',
    address: '789 Elm St, Seattle, WA',
    city: 'Seattle',
    state: 'WA',
    zip: '98101',
    squareFeet: '1600',
    workType: 'exterior',
    stories: '2',
    condition: 'fair'
  },

  // HVAC TESTS
  {
    trade: 'hvac',
    name: 'Test HVAC 1',
    email: 'test@test.com',
    phone: '555-1234',
    address: '321 Pine St, Austin, TX',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    squareFeet: '2000',
    systemType: 'central_air',
    complexity: 'standard'
  },

  // ELECTRICAL TESTS
  {
    trade: 'electrical',
    name: 'Test Electrician 1',
    email: 'test@test.com',
    phone: '555-1234',
    address: '654 Maple Ave, Denver, CO',
    city: 'Denver',
    state: 'CO',
    zip: '80201',
    workType: 'panel_upgrade',
    panelSize: '200'
  },

  // PLUMBING TESTS
  {
    trade: 'plumbing',
    name: 'Test Plumber 1',
    email: 'test@test.com',
    phone: '555-1234',
    address: '987 Birch Ln, Miami, FL',
    city: 'Miami',
    state: 'FL',
    zip: '33101',
    workType: 'water_heater',
    heaterType: 'tankless',
    heaterSize: '50'
  },

  // FLOORING TESTS
  {
    trade: 'flooring',
    name: 'Test Flooring 1',
    email: 'test@test.com',
    phone: '555-1234',
    address: '147 Cedar St, Portland, OR',
    city: 'Portland',
    state: 'OR',
    zip: '97201',
    squareFeet: '1200',
    flooringType: 'hardwood',
    complexity: 'standard'
  },

  // DRYWALL TESTS
  {
    trade: 'drywall',
    name: 'Test Drywall 1',
    email: 'test@test.com',
    phone: '555-1234',
    address: '258 Spruce Dr, Atlanta, GA',
    city: 'Atlanta',
    state: 'GA',
    zip: '30301',
    squareFeet: '800',
    ceilings: 'yes',
    texture: 'smooth'
  },

  // SIDING TESTS
  {
    trade: 'siding',
    name: 'Test Siding 1',
    email: 'test@test.com',
    phone: '555-1234',
    address: '369 Willow Way, Boston, MA',
    city: 'Boston',
    state: 'MA',
    zip: '02101',
    squareFeet: '1800',
    sidingType: 'vinyl',
    stories: '2'
  }
];

async function runTests() {
  const results = [];
  let passed = 0;
  let failed = 0;

  console.log('🧪 STARTING AUTOMATED TEST SUITE...\n');
  console.log(`Testing ${testCases.length} scenarios across 8 trades\n`);
  console.log('='.repeat(80) + '\n');

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const testNum = i + 1;

    console.log(`TEST ${testNum}/${testCases.length}: ${testCase.trade.toUpperCase()} - ${testCase.city}, ${testCase.state} (ZIP: ${testCase.zip})`);

    try {
      const response = await axios.post(`${API_URL}/api/estimate`, {
        api_key: API_KEY,
        ...testCase
      });

      const estimate = response.data;

      // Validation checks
      const checks = {
        hasEstimateId: !!estimate.estimate_id,
        hasValidTotal: estimate.total_cost && estimate.total_cost > 0,
        hasLaborCost: estimate.labor_cost && estimate.labor_cost > 0,
        hasMaterialCost: estimate.material_cost && estimate.material_cost > 0,
        hasLaborHours: estimate.labor_hours && estimate.labor_hours > 0,
        notNull: estimate.total_cost !== null
      };

      const allPassed = Object.values(checks).every(v => v === true);

      if (allPassed) {
        console.log(`✅ PASSED - Total: $${estimate.total_cost}, Labor: ${estimate.labor_hours}hrs @ $${estimate.labor_rate}/hr`);
        passed++;
      } else {
        console.log(`❌ FAILED - Issues detected:`);
        Object.entries(checks).forEach(([key, value]) => {
          if (!value) console.log(`   - ${key}: FAILED`);
        });
        failed++;
      }

      results.push({
        testNum,
        trade: testCase.trade,
        location: `${testCase.city}, ${testCase.state} ${testCase.zip}`,
        status: allPassed ? 'PASSED' : 'FAILED',
        totalCost: estimate.total_cost,
        laborHours: estimate.labor_hours,
        laborRate: estimate.labor_rate,
        checks
      });

    } catch (error) {
      console.log(`❌ ERROR - ${error.message}`);
      failed++;

      results.push({
        testNum,
        trade: testCase.trade,
        location: `${testCase.city}, ${testCase.state} ${testCase.zip}`,
        status: 'ERROR',
        error: error.message
      });
    }

    console.log(''); // Blank line between tests
  }

  // Summary
  console.log('='.repeat(80));
  console.log('\n📊 TEST SUMMARY:\n');
  console.log(`✅ Passed: ${passed}/${testCases.length}`);
  console.log(`❌ Failed: ${failed}/${testCases.length}`);
  console.log(`📈 Success Rate: ${((passed/testCases.length)*100).toFixed(1)}%\n`);

  // Write results to file
  const timestamp = new Date().toISOString();
  let output = `INSTABID TEST SUITE RESULTS\n`;
  output += `Run Date: ${timestamp}\n`;
  output += `${'='.repeat(80)}\n\n`;
  output += `SUMMARY:\n`;
  output += `Passed: ${passed}/${testCases.length}\n`;
  output += `Failed: ${failed}/${testCases.length}\n`;
  output += `Success Rate: ${((passed/testCases.length)*100).toFixed(1)}%\n\n`;
  output += `${'='.repeat(80)}\n\n`;
  output += `DETAILED RESULTS:\n\n`;

  results.forEach(result => {
    output += `TEST #${result.testNum}: ${result.trade.toUpperCase()}\n`;
    output += `Location: ${result.location}\n`;
    output += `Status: ${result.status}\n`;
    if (result.totalCost) {
      output += `Total Cost: $${result.totalCost}\n`;
      output += `Labor: ${result.laborHours} hrs @ $${result.laborRate}/hr\n`;
    }
    if (result.error) {
      output += `Error: ${result.error}\n`;
    }
    output += `\n`;
  });

  fs.writeFileSync('test-results.txt', output);
  console.log('📄 Results written to test-results.txt\n');
}

runTests().catch(console.error);