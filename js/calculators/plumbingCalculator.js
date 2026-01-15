// Enhanced Plumbing Calculator
function calculatePlumbingEnhanced(criteria) {
  const {
    serviceType = 'fixture',     // fixture, repipe, water_heater, drain, sewer
    fixtureType = 'toilet',      // toilet, sink, shower, tub, dishwasher
    fixtureCount = 1,
    squareFeet = 0,              // For repipe jobs
    pipeType = 'PEX',            // copper, PEX, PVC
    waterHeaterType = 'tank',    // tank, tankless
    drainLength = 0,             // Linear feet for drain work
    sewerLength = 0,             // Linear feet for sewer line
    homeAge = 'modern'           // old, modern, new
  } = criteria;

  let laborHours = 0;
  const materialList = [];

  // === FIXTURE INSTALLATION ===
  if (serviceType === 'fixture') {
    const fixtureCosts = {
      'toilet': 350,
      'sink': 400,
      'shower': 1200,
      'tub': 1500,
      'dishwasher': 300
    };
    
    const fixtureCost = (fixtureCosts[fixtureType] || 350) * fixtureCount;
    
    materialList.push({
      item: `${fixtureType.charAt(0).toUpperCase() + fixtureType.slice(1)} Installation`,
      quantity: fixtureCount,
      unit: 'fixtures',
      unitCost: fixtureCosts[fixtureType] || 350,
      totalCost: fixtureCost,
      category: 'fixtures'
    });
    
    // Labor hours per fixture type
    const laborPerFixture = {
      'toilet': 3,
      'sink': 2.5,
      'shower': 6,
      'tub': 8,
      'dishwasher': 2
    };
    
    laborHours = (laborPerFixture[fixtureType] || 3) * fixtureCount;
  }

  // === REPIPE ===
  if (serviceType === 'repipe' && squareFeet > 0) {
    const pipeFeet = squareFeet * 0.5; // Rough estimate
    
    const pipeCosts = {
      'PEX': 2.50,
      'copper': 4.50,
      'PVC': 1.50
    };
    
    const pipeCostPerFoot = pipeCosts[pipeType] || 2.50;
    const totalPipeCost = pipeFeet * pipeCostPerFoot;
    
    materialList.push({
      item: `${pipeType} Pipe`,
      quantity: Math.ceil(pipeFeet),
      unit: 'linear feet',
      unitCost: pipeCostPerFoot,
      totalCost: totalPipeCost,
      category: 'pipes'
    });
    
    // Fittings & valves
    const fittingsCost = totalPipeCost * 0.3;
    materialList.push({
      item: 'Fittings & Valves',
      quantity: 1,
      unit: 'set',
      unitCost: fittingsCost,
      totalCost: fittingsCost,
      category: 'fittings'
    });
    
    laborHours = (squareFeet / 100) * 4;
    
    if (homeAge === 'old') {
      laborHours *= 1.3; // Old homes harder to work in
    }
  }

  // === WATER HEATER ===
  if (serviceType === 'water_heater') {
    const heaterCost = waterHeaterType === 'tankless' ? 3200 : 1800;
    
    materialList.push({
      item: waterHeaterType === 'tankless' ? 'Tankless Water Heater' : 'Tank Water Heater',
      quantity: 1,
      unit: 'unit',
      unitCost: heaterCost,
      totalCost: heaterCost,
      category: 'water_heaters'
    });
    
    laborHours = waterHeaterType === 'tankless' ? 8 : 6;
  }

  // === DRAIN CLEANING ===
  if (serviceType === 'drain' && drainLength > 0) {
    const drainCost = 250; // Base drain cleaning
    
    materialList.push({
      item: 'Drain Cleaning',
      quantity: drainLength,
      unit: 'linear feet',
      unitCost: 250 / drainLength, // Average it out
      totalCost: drainCost,
      category: 'drains'
    });
    
    laborHours = 2;
  }

  // === SEWER LINE ===
  if (serviceType === 'sewer' && sewerLength > 0) {
    const sewerCostPerFoot = 125;
    const sewerCost = sewerLength * sewerCostPerFoot;
    
    materialList.push({
      item: 'Sewer Line Replacement',
      quantity: sewerLength,
      unit: 'linear feet',
      unitCost: sewerCostPerFoot,
      totalCost: sewerCost,
      category: 'drains'
    });
    
    laborHours = sewerLength / 10; // 10 feet per hour
  }

  // === MISC SUPPLIES ===
  const suppliesCost = 100;
  materialList.push({
    item: 'Misc Plumbing Supplies',
    quantity: 1,
    unit: 'set',
    unitCost: suppliesCost,
    totalCost: suppliesCost,
    category: 'supplies'
  });

  const totalMaterialCost = materialList.reduce((sum, item) => sum + item.totalCost, 0);

  return {
    totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
    laborHours: Math.round(laborHours * 100) / 100,
    materialList: materialList,
    breakdown: {
      serviceType,
      fixtureType,
      fixtureCount,
      squareFeet,
      pipeType,
      waterHeaterType
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculatePlumbingEnhanced };
}