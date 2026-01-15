// Enhanced Flooring Calculator
function calculateFlooringEnhanced(criteria) {
  const {
    squareFeet,
    flooringType = 'carpet',     // carpet, vinyl, laminate, hardwood_eng, hardwood_solid, tile_ceramic, tile_porcelain
    removal = false,             // Remove old flooring?
    subfloorRepair = false,      // Repair subfloor?
    underlayment = true,         // Add underlayment?
    baseboard = 0,               // Linear feet of baseboard
    complexity = 'standard'      // standard, moderate, complex
  } = criteria;

  const wasteMultiplier = 1.10; // 10% waste
  const adjustedSqft = squareFeet * wasteMultiplier;

  // === FLOORING MATERIAL COSTS (per sqft) ===
  const materialCosts = {
    'carpet': 3.50,
    'vinyl': 4.00,
    'laminate': 4.50,
    'hardwood_eng': 8.00,
    'hardwood_solid': 12.00,
    'tile_ceramic': 6.00,
    'tile_porcelain': 8.50
  };

  const materialCostPerSqft = materialCosts[flooringType] || 4.00;
  const flooringCost = adjustedSqft * materialCostPerSqft;

  // === LABOR RATES (per sqft) ===
  const laborRates = {
    'carpet': 1.50,
    'vinyl': 2.00,
    'laminate': 2.00,
    'hardwood_eng': 4.00,
    'hardwood_solid': 4.00,
    'tile_ceramic': 5.00,
    'tile_porcelain': 5.00
  };

  let laborHoursPerSqft = (laborRates[flooringType] || 2.00) / 45; // Assuming $45/hr base
  let totalLaborHours = squareFeet * laborHoursPerSqft;

  // === COMPLEXITY MULTIPLIER ===
  const complexityMultipliers = {
    'standard': 1.0,
    'moderate': 1.2,  // Stairs, angles
    'complex': 1.5    // Patterns, intricate cuts
  };
  
  totalLaborHours *= complexityMultipliers[complexity] || 1.0;

  // === MATERIAL LIST ===
  const materialList = [
    {
      item: `${flooringType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Flooring`,
      quantity: Math.ceil(adjustedSqft),
      unit: 'sqft',
      unitCost: materialCostPerSqft,
      totalCost: flooringCost,
      category: 'flooring_material'
    }
  ];

  // === UNDERLAYMENT ===
  if (underlayment && flooringType !== 'carpet') {
    const underlaymentCost = squareFeet * 0.75;
    
    materialList.push({
      item: 'Underlayment',
      quantity: squareFeet,
      unit: 'sqft',
      unitCost: 0.75,
      totalCost: underlaymentCost,
      category: 'underlayment'
    });
  }

  // === REMOVAL ===
  if (removal) {
    const removalCost = squareFeet * 1.50;
    
    materialList.push({
      item: 'Old Flooring Removal',
      quantity: squareFeet,
      unit: 'sqft',
      unitCost: 1.50,
      totalCost: removalCost,
      category: 'removal'
    });
    
    totalLaborHours += squareFeet * 0.02; // Add removal labor
  }

  // === SUBFLOOR REPAIR ===
  if (subfloorRepair) {
    const subfloorCost = squareFeet * 0.3 * 3.00; // Assume 30% needs repair
    
    materialList.push({
      item: 'Subfloor Repair',
      quantity: Math.ceil(squareFeet * 0.3),
      unit: 'sqft',
      unitCost: 3.00,
      totalCost: subfloorCost,
      category: 'prep'
    });
    
    totalLaborHours += squareFeet * 0.01;
  }

  // === BASEBOARD ===
  if (baseboard > 0) {
    const baseboardCost = baseboard * 4.00;
    
    materialList.push({
      item: 'Baseboard Trim',
      quantity: baseboard,
      unit: 'linear feet',
      unitCost: 4.00,
      totalCost: baseboardCost,
      category: 'trim'
    });
    
    totalLaborHours += baseboard / 20; // 20 feet per hour
  }

  // === ADHESIVE/NAILS ===
  const adhesiveCost = 75;
  materialList.push({
    item: 'Adhesive/Fasteners',
    quantity: 1,
    unit: 'set',
    unitCost: adhesiveCost,
    totalCost: adhesiveCost,
    category: 'adhesive'
  });

  const totalMaterialCost = materialList.reduce((sum, item) => sum + item.totalCost, 0);

  return {
    totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
    laborHours: Math.round(totalLaborHours * 100) / 100,
    materialList: materialList,
    breakdown: {
      squareFeet,
      adjustedSqft: Math.ceil(adjustedSqft),
      flooringType,
      removal,
      subfloorRepair,
      complexity
    }
  };
}
