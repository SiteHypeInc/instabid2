// Enhanced HVAC Calculator
function calculateHVACEnhanced(criteria) {
  const {
    squareFeet,
    systemType = 'furnace',      // furnace, ac, heatpump, minisplit
    efficiency = 'standard',      // standard, high
    ductwork = 'existing',        // existing, new, repair
    stories = 1,                  // 1, 2, 3+
    zoneCount = 1,                // Number of zones
    thermostats = 1               // Number of thermostats
  } = criteria;

  // === SIZE MULTIPLIER ===
  let sizeMultiplier = 1.0;
  if (squareFeet < 1500) sizeMultiplier = 0.9;
  else if (squareFeet >= 1500 && squareFeet <= 2500) sizeMultiplier = 1.0;
  else if (squareFeet > 2500 && squareFeet <= 4000) sizeMultiplier = 1.2;
  else sizeMultiplier = 1.4;

  // === EQUIPMENT COSTS ===
  let equipmentCost = 0;
  let equipmentName = '';
  
  switch(systemType) {
    case 'furnace':
      equipmentCost = efficiency === 'high' ? 4500 : 3500;
      equipmentName = efficiency === 'high' ? 'High-Efficiency Furnace' : 'Standard Furnace';
      break;
    case 'ac':
      equipmentCost = efficiency === 'high' ? 5500 : 4000;
      equipmentName = efficiency === 'high' ? 'High-Efficiency AC Unit' : 'Central AC Unit';
      break;
    case 'heatpump':
      equipmentCost = efficiency === 'high' ? 7500 : 5500;
      equipmentName = efficiency === 'high' ? 'High-Efficiency Heat Pump' : 'Heat Pump';
      break;
    case 'minisplit':
      equipmentCost = 2500 * zoneCount;
      equipmentName = `Mini-Split System (${zoneCount} zones)`;
      break;
  }
  
  equipmentCost *= sizeMultiplier;

  // === DUCTWORK ===
  let ductworkCost = 0;
  let ductworkFeet = 0;
  
  if (ductwork === 'new') {
    ductworkFeet = Math.ceil(squareFeet / 10); // Rough estimate
    ductworkCost = ductworkFeet * 15; // $15 per linear foot
  } else if (ductwork === 'repair') {
    ductworkFeet = Math.ceil(squareFeet / 20);
    ductworkCost = ductworkFeet * 8; // Repair cheaper than new
  }

  // === THERMOSTATS ===
  const thermostatCost = thermostats * 350;

  // === REFRIGERANT ===
  const refrigerantCost = systemType !== 'furnace' ? 250 : 0;

  // === FILTERS & MISC ===
  const filtersCost = 50;
  const miscSupplies = 150;

  // === LABOR HOURS ===
  let laborHours = 0;
  
  switch(systemType) {
    case 'furnace':
      laborHours = 12;
      break;
    case 'ac':
      laborHours = 10;
      break;
    case 'heatpump':
      laborHours = 14;
      break;
    case 'minisplit':
      laborHours = 8 * zoneCount;
      break;
  }
  
  // Add ductwork labor
  if (ductwork === 'new') {
    laborHours += ductworkFeet / 20; // 20 feet per hour
  } else if (ductwork === 'repair') {
    laborHours += ductworkFeet / 30;
  }
  
  // Story multiplier
  if (stories >= 2) laborHours *= 1.2;
  if (stories >= 3) laborHours *= 1.4;

  // === MATERIAL LIST ===
  const materialList = [
    {
      item: equipmentName,
      quantity: 1,
      unit: 'unit',
      unitCost: equipmentCost,
      totalCost: equipmentCost,
      category: 'hvac_units'
    }
  ];

  if (ductworkCost > 0) {
    materialList.push({
      item: ductwork === 'new' ? 'New Ductwork' : 'Ductwork Repair',
      quantity: ductworkFeet,
      unit: 'linear feet',
      unitCost: ductwork === 'new' ? 15 : 8,
      totalCost: ductworkCost,
      category: 'ductwork'
    });
  }

  materialList.push({
    item: 'Smart Thermostat',
    quantity: thermostats,
    unit: 'units',
    unitCost: 350,
    totalCost: thermostatCost,
    category: 'thermostats'
  });

  if (refrigerantCost > 0) {
    materialList.push({
      item: 'Refrigerant',
      quantity: 1,
      unit: 'charge',
      unitCost: 250,
      totalCost: refrigerantCost,
      category: 'refrigerant'
    });
  }

  materialList.push({
    item: 'Filters & Supplies',
    quantity: 1,
    unit: 'set',
    unitCost: filtersCost + miscSupplies,
    totalCost: filtersCost + miscSupplies,
    category: 'filters'
  });

  const totalMaterialCost = materialList.reduce((sum, item) => sum + item.totalCost, 0);

  return {
    totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
    laborHours: Math.round(laborHours * 100) / 100,
    materialList: materialList,
    breakdown: {
      squareFeet,
      systemType,
      efficiency,
      ductwork,
      stories,
      sizeMultiplier
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculateHVACEnhanced };
}