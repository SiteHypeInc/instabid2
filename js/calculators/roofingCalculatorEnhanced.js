// Enhanced Roofing Calculator - Bolt.new formulas
/*function calculateRoofingEnhanced(criteria) {
  const {
    squareFeet,
    pitch = 'medium',
    tearOff = false,
    layers = 1,
    chimneys = 0,
    skylights = 0,
    valleys = 0
  } = criteria;

  const pitchMultipliers = {
    'low': 1.0,
    'medium': 1.1,
    'steep': 1.2,
    'very_steep': 1.3
  };
  
  const pitchMultiplier = pitchMultipliers[pitch] || 1.1;
  const adjustedSqft = squareFeet * pitchMultiplier;
  const complexityFactor = 1 + (chimneys * 0.05) + (skylights * 0.03) + (valleys * 0.04);
  const cappedComplexity = Math.min(complexityFactor, 1.3);
  const linearFeet = Math.sqrt(squareFeet) * 4;

  const wasteMultiplier = 1.12;
  const shingleBundles = Math.ceil((adjustedSqft * wasteMultiplier) / 33.3);
  const shingleUnitCost = 44.96;
  const shinglesCost = shingleBundles * shingleUnitCost;

  const underlaymentRolls = Math.ceil(adjustedSqft / 400);
  const underlaymentUnitCost = 45.00;
  const underlaymentCost = underlaymentRolls * underlaymentUnitCost;

  const nailBoxes = Math.ceil((adjustedSqft * 4) / 7500);
  const nailUnitCost = 85.00;
  const nailsCost = nailBoxes * nailUnitCost;

  const starterCost = linearFeet * 0.5 * 2.50;
  const ridgeCost = linearFeet * 0.3 * 3.00;
  const dripEdgeCost = linearFeet * 2.75;
  const iceWaterCost = ((valleys * 20) + (linearFeet * 0.2)) * 4.50;
  const ventilationCost = (squareFeet / 150) * 25.00;

  let osbCost = 0;
  if (tearOff) {
    const osbSheets = Math.ceil((adjustedSqft * 0.20) / 32);
    const osbUnitCost = 28.00;
    osbCost = osbSheets * osbUnitCost;
  }

  const disposalCost = tearOff ? (squareFeet / 100) * 75 : 0;

  const totalMaterialCost = 
    shinglesCost + underlaymentCost + nailsCost + starterCost + 
    ridgeCost + dripEdgeCost + iceWaterCost + ventilationCost + 
    osbCost + disposalCost;

  const adjustedTotal = totalMaterialCost * cappedComplexity;

  const materialList = [
    { item: 'Asphalt Shingles', quantity: shingleBundles, unit: 'bundles', unitCost: shingleUnitCost, totalCost: shinglesCost, category: 'shingles' },
    { item: 'Underlayment', quantity: underlaymentRolls, unit: 'rolls', unitCost: underlaymentUnitCost, totalCost: underlaymentCost, category: 'underlayment' },
    { item: 'Roofing Nails', quantity: nailBoxes, unit: 'boxes', unitCost: nailUnitCost, totalCost: nailsCost, category: 'fasteners' },
    { item: 'Starter Shingles', quantity: Math.ceil(linearFeet * 0.5), unit: 'linear feet', unitCost: 2.50, totalCost: starterCost, category: 'shingles' },
    { item: 'Ridge Cap', quantity: Math.ceil(linearFeet * 0.3), unit: 'linear feet', unitCost: 3.00, totalCost: ridgeCost, category: 'shingles' },
    { item: 'Drip Edge', quantity: linearFeet, unit: 'linear feet', unitCost: 2.75, totalCost: dripEdgeCost, category: 'flashing' },
    { item: 'Ice & Water Shield', quantity: Math.ceil((valleys * 20) + (linearFeet * 0.2)), unit: 'linear feet', unitCost: 4.50, totalCost: iceWaterCost, category: 'underlayment' },
    { item: 'Ventilation', quantity: Math.ceil(squareFeet / 150), unit: 'vents', unitCost: 25.00, totalCost: ventilationCost, category: 'ventilation' }
  ];

  if (tearOff && osbCost > 0) {
    materialList.push({ item: 'OSB Sheathing', quantity: Math.ceil((adjustedSqft * 0.20) / 32), unit: 'sheets', unitCost: 28.00, totalCost: osbCost, category: 'sheathing' });
  }

  if (tearOff) {
    materialList.push({ item: 'Disposal/Dumpster', quantity: Math.ceil(squareFeet / 100), unit: 'loads', unitCost: 75.00, totalCost: disposalCost, category: 'disposal' });
  }

  return {
    totalMaterialCost: Math.round(adjustedTotal * 100) / 100,
    materialList: materialList,
    breakdown: {
      squareFeet,
      adjustedSqft: Math.round(adjustedSqft),
      pitchMultiplier,
      complexityFactor: cappedComplexity,
      linearFeet: Math.round(linearFeet)
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculateRoofingEnhanced };
}*/



// Enhanced Roofing Calculator - Bolt.new formulas
function calculateRoofingEnhanced(criteria) {
  const {
    squareFeet,
    pitch = 'medium',
    tearOff = false,
    layers = 1,
    chimneys = 0,
    skylights = 0,
    valleys = 0
  } = criteria;

  // Pitch adjustment
  const pitchMultipliers = {
    'low': 1.0,
    'medium': 1.1,
    'steep': 1.2,
    'very_steep': 1.3,
    '4/12': 1.05,
    '5/12': 1.08,
    '6/12': 1.12,
    '8/12': 1.20,
    '10/12': 1.30,
    '12/12': 1.40
  };
  
  const pitchMultiplier = pitchMultipliers[pitch] || 1.1;
  const adjustedSqft = squareFeet * pitchMultiplier;
  const linearFeet = Math.sqrt(squareFeet) * 4;
  const wasteMultiplier = 1.12; // 12% waste factor

  // === SHINGLES ===
  const shingleBundles = Math.ceil((adjustedSqft * wasteMultiplier) / 33.3);
  const shingleUnitCost = 44.96;
  const shinglesCost = shingleBundles * shingleUnitCost;

  // === UNDERLAYMENT ===
  const underlaymentRolls = Math.ceil((adjustedSqft * wasteMultiplier) / 400);
  const underlaymentUnitCost = 45.00;
  const underlaymentCost = underlaymentRolls * underlaymentUnitCost;

  // === NAILS ===
  const nailBoxes = Math.ceil((adjustedSqft * wasteMultiplier * 4) / 7500);
  const nailUnitCost = 85.00;
  const nailsCost = nailBoxes * nailUnitCost;

  // === STARTER SHINGLES ===
  const starterLF = Math.ceil(linearFeet * 0.5);
  const starterUnitCost = 2.50;
  const starterCost = starterLF * starterUnitCost;

  // === RIDGE CAP ===
  const ridgeLF = Math.ceil(linearFeet * 0.3);
  const ridgeUnitCost = 3.00;
  const ridgeCost = ridgeLF * ridgeUnitCost;

  // === DRIP EDGE ===
  const dripEdgeLF = Math.ceil(linearFeet);
  const dripEdgeUnitCost = 2.75;
  const dripEdgeCost = dripEdgeLF * dripEdgeUnitCost;

  // === ICE & WATER SHIELD ===
  const iceWaterLF = Math.ceil((valleys * 20) + (linearFeet * 0.2));
  const iceWaterUnitCost = 4.50;
  const iceWaterCost = iceWaterLF * iceWaterUnitCost;

  // === VENTILATION ===
  const ventCount = Math.ceil(squareFeet / 150);
  const ventUnitCost = 25.00;
  const ventilationCost = ventCount * ventUnitCost;

  // === OSB SHEATHING (only if tearoff) ===
  let osbSheets = 0;
  let osbCost = 0;
  if (tearOff) {
    // Assume 20% damage replacement on tearoffs
    osbSheets = Math.ceil((adjustedSqft * 0.20) / 32);
    const osbUnitCost = 28.00;
    osbCost = osbSheets * osbUnitCost;
  }

  // === DISPOSAL ===
  const disposalLoads = tearOff ? Math.ceil(squareFeet / 100) : 0;
  const disposalUnitCost = 75.00;
  const disposalCost = disposalLoads * disposalUnitCost;

  // === MATERIAL LIST (NO COMPLEXITY MULTIPLIER YET) ===
  const materialList = [
    { item: 'Asphalt Shingles', quantity: shingleBundles, unit: 'bundles', unitCost: shingleUnitCost, totalCost: shinglesCost, category: 'shingles' },
    { item: 'Underlayment', quantity: underlaymentRolls, unit: 'rolls', unitCost: underlaymentUnitCost, totalCost: underlaymentCost, category: 'underlayment' },
    { item: 'Roofing Nails', quantity: nailBoxes, unit: 'boxes', unitCost: nailUnitCost, totalCost: nailsCost, category: 'fasteners' },
    { item: 'Starter Shingles', quantity: starterLF, unit: 'linear feet', unitCost: starterUnitCost, totalCost: starterCost, category: 'shingles' },
    { item: 'Ridge Cap', quantity: ridgeLF, unit: 'linear feet', unitCost: ridgeUnitCost, totalCost: ridgeCost, category: 'shingles' },
    { item: 'Drip Edge', quantity: dripEdgeLF, unit: 'linear feet', unitCost: dripEdgeUnitCost, totalCost: dripEdgeCost, category: 'flashing' },
    { item: 'Ice & Water Shield', quantity: iceWaterLF, unit: 'linear feet', unitCost: iceWaterUnitCost, totalCost: iceWaterCost, category: 'underlayment' },
    { item: 'Ventilation', quantity: ventCount, unit: 'vents', unitCost: ventUnitCost, totalCost: ventilationCost, category: 'ventilation' }
  ];

  if (tearOff && osbCost > 0) {
    materialList.push({ 
      item: 'OSB Sheathing', 
      quantity: osbSheets, 
      unit: 'sheets', 
      unitCost: 28.00, 
      totalCost: osbCost, 
      category: 'sheathing' 
    });
  }

  if (tearOff) {
    materialList.push({ 
      item: 'Disposal/Dumpster', 
      quantity: disposalLoads, 
      unit: 'loads', 
      unitCost: disposalUnitCost, 
      totalCost: disposalCost, 
      category: 'disposal' 
    });
  }

  // === COMPLEXITY MULTIPLIER (applied to total only, NOT line items) ===
  const complexityFactor = 1 + (chimneys * 0.05) + (skylights * 0.03) + (valleys * 0.04);
  const cappedComplexity = Math.min(complexityFactor, 1.3);

  const baseMaterialCost = materialList.reduce((sum, item) => sum + item.totalCost, 0);
  const totalMaterialCost = baseMaterialCost * cappedComplexity;

  return {
    totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
    materialList: materialList,
    breakdown: {
      squareFeet,
      adjustedSqft: Math.round(adjustedSqft),
      pitchMultiplier,
      complexityFactor: cappedComplexity,
      linearFeet: Math.round(linearFeet),
      baseMaterialCost: Math.round(baseMaterialCost * 100) / 100
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculateRoofingEnhanced };
}