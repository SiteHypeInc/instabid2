// Enhanced Siding Calculator
function calculateSidingEnhanced(criteria) {
  const {
    squareFeet,
    sidingType = 'vinyl',        // vinyl, fiber_cement, wood, metal, stucco
    stories = 1,                 // 1, 2, 3+
    removal = false,             // Remove old siding?
    houseWrap = true,            // Add house wrap?
    trim = 0,                    // Linear feet of trim
    windowCount = 0,             // Windows to wrap
    condition = 'new'            // new, repair, replacement
  } = criteria;

  const wasteMultiplier = 1.12; // 12% waste
  const adjustedSqft = squareFeet * wasteMultiplier;

  // === SIDING MATERIAL COSTS (per sqft) ===
  const materialCosts = {
    'vinyl': 4.50,
    'fiber_cement': 8.00,
    'wood': 12.00,
    'metal': 6.50,
    'stucco': 9.00
  };

  const materialCostPerSqft = materialCosts[sidingType] || 4.50;
  const sidingCost = adjustedSqft * materialCostPerSqft;

  // === LABOR RATES (per sqft) ===
  const laborRates = {
    'vinyl': 3.00,
    'fiber_cement': 5.00,
    'wood': 6.00,
    'metal': 4.00,
    'stucco': 7.00
  };

  let laborHoursPerSqft = (laborRates[sidingType] || 3.00) / 45; // Assuming $45/hr base
  let totalLaborHours = squareFeet * laborHoursPerSqft;

  // === STORY MULTIPLIER ===
  const storyMultipliers = {
    1: 1.0,
    2: 1.2,
    3: 1.5
  };
  
  totalLaborHours *= storyMultipliers[stories] || 1.0;

  // === MATERIAL LIST ===
  const materialList = [
    {
      item: `${sidingType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Siding`,
      quantity: Math.ceil(adjustedSqft),
      unit: 'sqft',
      unitCost: materialCostPerSqft,
      totalCost: sidingCost,
      category: 'siding_material'
    }
  ];

  // === HOUSE WRAP ===
  if (houseWrap) {
    const wrapCost = squareFeet * 0.75;
    
    materialList.push({
      item: 'House Wrap',
      quantity: squareFeet,
      unit: 'sqft',
      unitCost: 0.75,
      totalCost: wrapCost,
      category: 'house_wrap'
    });
  }

  // === REMOVAL ===
  if (removal) {
    const removalCost = squareFeet * 1.50;
    
    materialList.push({
      item: 'Old Siding Removal',
      quantity: squareFeet,
      unit: 'sqft',
      unitCost: 1.50,
      totalCost: removalCost,
      category: 'removal'
    });
    
    totalLaborHours += squareFeet * 0.02; // Add removal labor
  }

  // === TRIM ===
  if (trim > 0) {
    const trimCost = trim * 4.00;
    
    materialList.push({
      item: 'Trim & J-Channel',
      quantity: trim,
      unit: 'linear feet',
      unitCost: 4.00,
      totalCost: trimCost,
      category: 'trim'
    });
    
    totalLaborHours += trim / 30; // 30 feet per hour
  }

  // === WINDOW WRAPPING ===
  if (windowCount > 0) {
    const windowCost = windowCount * 50;
    
    materialList.push({
      item: 'Window Trim/Wrapping',
      quantity: windowCount,
      unit: 'windows',
      unitCost: 50,
      totalCost: windowCost,
      category: 'trim'
    });
    
    totalLaborHours += windowCount * 0.5; // 30 min per window
  }

  // === FASTENERS & FLASHING ===
  const fastenersCost = 150;
  materialList.push({
    item: 'Fasteners & Flashing',
    quantity: 1,
    unit: 'set',
    unitCost: fastenersCost,
    totalCost: fastenersCost,
    category: 'fasteners'
  });

  const totalMaterialCost = materialList.reduce((sum, item) => sum + item.totalCost, 0);

  return {
    totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
    laborHours: Math.round(totalLaborHours * 100) / 100,
    materialList: materialList,
    breakdown: {
      squareFeet,
      adjustedSqft: Math.ceil(adjustedSqft),
      sidingType,
      stories,
      removal,
      houseWrap
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculateSidingEnhanced };
}