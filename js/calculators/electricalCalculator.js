// Enhanced Electrical Calculator
function calculateElectricalEnhanced(criteria) {
  const {
    serviceType = 'panel',       // panel, rewire, outlet, fixture, ev_charger
    amperage = 200,               // 100, 200, 400
    squareFeet = 0,               // For rewire jobs
    outletCount = 0,
    switchCount = 0,
    fixtureCount = 0,
    evCharger = false,
    homeAge = 'modern'            // old, modern, new
  } = criteria;

  let laborHours = 0;
  const materialList = [];

  // === PANEL UPGRADE ===
  if (serviceType === 'panel' || serviceType === 'panel_upgrade') {
    const panelCost = amperage === 100 ? 1800 : (amperage === 200 ? 2500 : 3500);
    
    materialList.push({
      item: `${amperage}A Electrical Panel`,
      quantity: 1,
      unit: 'panel',
      unitCost: panelCost,
      totalCost: panelCost,
      category: 'panels'
    });
    
    laborHours = amperage === 100 ? 8 : (amperage === 200 ? 10 : 14);
  }

  // === REWIRE ===
  if (serviceType === 'rewire' && squareFeet > 0) {
    const wireFeet = squareFeet * 4; // Rough estimate
    const wireCost = wireFeet * 0.75; // Romex pricing
    
    materialList.push({
      item: 'Romex Wire (14/2, 12/2)',
      quantity: wireFeet,
      unit: 'feet',
      unitCost: 0.75,
      totalCost: wireCost,
      category: 'wire'
    });
    
    laborHours = (squareFeet / 100) * 3;
    
    // Complexity for old homes
    if (homeAge === 'old') {
      laborHours *= 1.4;
    }
  }

  // === OUTLETS ===
  if (outletCount > 0) {
    materialList.push({
      item: 'Electrical Outlets',
      quantity: outletCount,
      unit: 'outlets',
      unitCost: 125,
      totalCost: outletCount * 125,
      category: 'outlets'
    });
    
    laborHours += outletCount * 0.75;
  }

  // === SWITCHES ===
  if (switchCount > 0) {
    materialList.push({
      item: 'Light Switches',
      quantity: switchCount,
      unit: 'switches',
      unitCost: 110,
      totalCost: switchCount * 110,
      category: 'switches'
    });
    
    laborHours += switchCount * 0.5;
  }

  // === LIGHT FIXTURES ===
  if (fixtureCount > 0) {
    materialList.push({
      item: 'Light Fixtures (installed)',
      quantity: fixtureCount,
      unit: 'fixtures',
      unitCost: 150,
      totalCost: fixtureCount * 150,
      category: 'fixtures'
    });
    
    laborHours += fixtureCount * 1.0;
  }

  // === EV CHARGER ===
  if (evCharger) {
    materialList.push({
      item: 'EV Charger (240V)',
      quantity: 1,
      unit: 'charger',
      unitCost: 1200,
      totalCost: 1200,
      category: 'fixtures'
    });
    
    laborHours += 4;
  }

  // === BREAKERS & MISC ===
  const breakersCost = 150;
  materialList.push({
    item: 'Breakers & Misc Supplies',
    quantity: 1,
    unit: 'set',
    unitCost: breakersCost,
    totalCost: breakersCost,
    category: 'breakers'
  });

  const totalMaterialCost = materialList.reduce((sum, item) => sum + item.totalCost, 0);

  return {
    totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
    laborHours: Math.round(laborHours * 100) / 100,
    materialList: materialList,
    breakdown: {
      serviceType,
      amperage,
      squareFeet,
      outletCount,
      switchCount,
      fixtureCount,
      evCharger
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculateElectricalEnhanced };
}
