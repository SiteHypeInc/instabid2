// Enhanced Drywall Calculator
function calculateDrywallEnhanced(criteria) {
  const {
    squareFeet,
    serviceType = 'installation',  // installation, repair, finishing, texturing, removal
    sheetSize = '4x8',              // 4x8, 4x10, 4x12
    thickness = '1/2',              // 1/2", 5/8"
    finishLevel = 'smooth',         // smooth (Level 5), textured (Level 3)
    ceilingHeight = 8,              // 8, 9, 10+
    repairSize = 'small',           // small, moderate, extensive (for repairs)
    removal = false                 // Remove old drywall?
  } = criteria;

  const wasteMultiplier = 1.15; // 15% waste
  const adjustedSqft = squareFeet * wasteMultiplier;

  let laborHours = 0;
  const materialList = [];

  // === SHEET SIZE TO SQFT ===
  const sheetSizes = {
    '4x8': 32,
    '4x10': 40,
    '4x12': 48
  };
  
  const sqftPerSheet = sheetSizes[sheetSize] || 32;
  const sheetsNeeded = Math.ceil(adjustedSqft / sqftPerSheet);

  // === INSTALLATION ===
  if (serviceType === 'installation') {
    const sheetCost = thickness === '5/8' ? 18 : 15;
    const drywallCost = sheetsNeeded * sheetCost;
    
    materialList.push({
      item: `Drywall Sheets (${sheetSize}, ${thickness}")`,
      quantity: sheetsNeeded,
      unit: 'sheets',
      unitCost: sheetCost,
      totalCost: drywallCost,
      category: 'drywall_sheets'
    });

    // Joint compound
    const compoundBuckets = Math.ceil(adjustedSqft / 200); // 200 sqft per bucket
    const compoundCost = compoundBuckets * 18;
    
    materialList.push({
      item: 'Joint Compound',
      quantity: compoundBuckets,
      unit: 'buckets',
      unitCost: 18,
      totalCost: compoundCost,
      category: 'joint_compound'
    });

    // Tape
    const tapeRolls = Math.ceil(adjustedSqft / 300); // 300 sqft per roll
    const tapeCost = tapeRolls * 8;
    
    materialList.push({
      item: 'Drywall Tape',
      quantity: tapeRolls,
      unit: 'rolls',
      unitCost: 8,
      totalCost: tapeCost,
      category: 'tape'
    });

    // Screws
    const screwBoxes = Math.ceil(sheetsNeeded / 10); // 10 sheets per box
    const screwCost = screwBoxes * 12;
    
    materialList.push({
      item: 'Drywall Screws',
      quantity: screwBoxes,
      unit: 'boxes',
      unitCost: 12,
      totalCost: screwCost,
      category: 'fasteners'
    });

    // Corner beads
    const cornerBeads = Math.ceil(ceilingHeight * 4 / 8); // Rough estimate
    const cornerCost = cornerBeads * 5;
    
    materialList.push({
      item: 'Corner Beads',
      quantity: cornerBeads,
      unit: 'pieces',
      unitCost: 5,
      totalCost: cornerCost,
      category: 'trim'
    });

    // Labor calculation
    const hangRate = 0.02; // Hours per sqft to hang
    const tapeRate = 0.03; // Hours per sqft to tape/mud
    const textureRate = finishLevel === 'smooth' ? 0.015 : 0.01;
    
    laborHours = (squareFeet * hangRate) + (squareFeet * tapeRate) + (squareFeet * textureRate);
    
    // High ceiling multiplier
    if (ceilingHeight >= 10) {
      laborHours *= 1.2;
    }
    
    // Smooth finish (Level 5) takes longer
    if (finishLevel === 'smooth') {
      laborHours *= 1.3;
    }
  }

  // === REPAIR ===
  if (serviceType === 'repair') {
    const repairCosts = {
      'small': 75,      // Small holes
      'moderate': 200,  // Moderate damage
      'extensive': 500  // Extensive repair
    };
    
    const repairCost = repairCosts[repairSize] || 75;
    
    materialList.push({
      item: `Drywall Repair (${repairSize})`,
      quantity: 1,
      unit: 'repair',
      unitCost: repairCost,
      totalCost: repairCost,
      category: 'repair'
    });
    
    const repairLaborHours = {
      'small': 2,
      'moderate': 4,
      'extensive': 8
    };
    
    laborHours = repairLaborHours[repairSize] || 2;
  }

  // === FINISHING ONLY ===
  if (serviceType === 'finishing') {
    const compoundBuckets = Math.ceil(squareFeet / 200);
    const compoundCost = compoundBuckets * 18;
    
    materialList.push({
      item: 'Joint Compound',
      quantity: compoundBuckets,
      unit: 'buckets',
      unitCost: 18,
      totalCost: compoundCost,
      category: 'joint_compound'
    });
    
    laborHours = squareFeet * 0.03; // Tape/mud only
  }

  // === TEXTURING ===
  if (serviceType === 'texturing') {
    const textureCost = squareFeet * 0.75;
    
    materialList.push({
      item: 'Texture Material',
      quantity: squareFeet,
      unit: 'sqft',
      unitCost: 0.75,
      totalCost: textureCost,
      category: 'texture'
    });
    
    laborHours = squareFeet * 0.015;
  }

  // === REMOVAL ===
  if (removal) {
    const removalCost = squareFeet * 1.00;
    
    materialList.push({
      item: 'Drywall Removal & Disposal',
      quantity: squareFeet,
      unit: 'sqft',
      unitCost: 1.00,
      totalCost: removalCost,
      category: 'removal'
    });
    
    laborHours += squareFeet * 0.015;
  }

  const totalMaterialCost = materialList.reduce((sum, item) => sum + item.totalCost, 0);

  return {
    totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
    laborHours: Math.round(laborHours * 100) / 100,
    materialList: materialList,
    breakdown: {
      squareFeet,
      adjustedSqft: Math.ceil(adjustedSqft),
      sheetsNeeded,
      serviceType,
      finishLevel,
      ceilingHeight
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculateDrywallEnhanced };
}

