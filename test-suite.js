const API_URL = 'https://roofbid-backend-production.up.railway.app/api/estimate';
const API_KEY = 'ib_74064730bb369effbc6bdfe50b5352e72180054351a5f3afb87839af29b029be';

const tests = [
  { name: 'Roofing', data: { trade: 'roofing', squareFeet: '2000', material: 'architectural', stories: '1' }},
  { name: 'Siding', data: { trade: 'siding', squareFeet: '1500', sidingType: 'vinyl', stories: '1' }},
  { name: 'Electrical', data: { trade: 'electrical', serviceType: 'general', outletCount: '4' }},
  { name: 'Plumbing', data: { trade: 'plumbing', serviceType: 'fixture', toiletCount: '2' }},
  { name: 'Painting', data: { trade: 'painting', squareFeet: '2000', paintType: 'exterior', stories: '1', coats: '2' }},
  { name: 'Drywall', data: { trade: 'drywall', squareFeet: '500', projectType: 'new_construction', finishLevel: 'level_3_standard' }}
];

async function runTests() {
  console.log('🚀 INSTABID TRADE TESTER\n');
  
  for (const test of tests) {
    try {
      const body = JSON.stringify({
        api_key: API_KEY,
        customerName: 'Test',
        customerEmail: 'test@test.com',
        customerPhone: '555-555-5555',
        address: '123 Test St',
        city: 'Dallas',
        state: 'TX',
        zip: '75001',
        ...test.data
      });

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ ${test.name}: $${result.total?.toFixed(2)}`);
      } else {
        console.log(`❌ ${test.name}: ${result.error}`);
      }
    } catch (err) {
      console.log(`❌ ${test.name}: ${err.message}`);
    }
  }
}

runTests();
