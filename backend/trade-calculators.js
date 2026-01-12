// ========================================
// MULTI-TRADE COST CALCULATORS
// ========================================

const TRADE_SOC_CODES = {
  'roofing': '47-2181',
  'hvac': '49-9021',
  'electrical': '47-2111',
  'plumbing': '47-2152',
  'flooring': '47-2042',
  'painting': '47-2141',
  'drywall': '47-2081',    // ADD THIS - Drywall and Ceiling Tile Installers
  'siding': '47-2099'      // ADD THIS - Construction and Related Workers, All Other
  'general': '47-1011'
};

// ========================================
// 1. ROOFING CALCULATOR
// ========================================
function calculateRoofing(criteria, blsLaborRate, regionalMultiplier) {
  const {
    squareFeet,
    pitch = 1.0,
    stories = 1.0,
    tearOff = false,
    materialRate,
    complexityFactors = []
  } = criteria;

  const tearOffMultiplier = tearOff ? 1.5 : 1.0;
  const adjustedArea = squareFeet * pitch * stories * tearOffMultiplier;
  
  const materialCost = adjustedArea * materialRate * regionalMultiplier;
  const laborCost = adjustedArea * blsLaborRate;
  
  let complexityCost = 0;
  complexityFactors.forEach(factor => {
    complexityCost += factor.cost || 0;
  });

  const subtotal = materialCost + laborCost + complexityCost;
  const contingency = subtotal * 0.10;
  
  return {
    materialCost: Math.round(materialCost * 100) / 100,
    laborCost: Math.round(laborCost * 100) / 100,
    complexityCost: Math.round(complexityCost * 100) / 100,
    contingency: Math.round(contingency * 100) / 100,
    totalCost: Math.round((subtotal + contingency) * 100) / 100,
    breakdown: {
      adjustedArea,
      blsLaborRate,
      regionalMultiplier
    }
  };
}

// ========================================
// 2. HVAC CALCULATOR
// ========================================
function calculateHVAC(criteria, blsLaborRate, regionalMultiplier) {
  const {
    squareFeet,
    zones = 1,
    systemType = 'central',
    ductwork = 'none',
    existingRemoval = false,
    thermostatType = 'programmable'
  } = criteria;

  // Base system costs
  const systemCosts = {
    'central': 5000,
    'minisplit': 3500,
    'heatpump': 6500,
    'geothermal': 22000
  };

  const baseCost = systemCosts[systemType] || 5000;
  const zoneMultiplier = systemType === 'minisplit' ? zones * 0.8 : 1 + (zones - 1) * 0.3;
  const systemCost = baseCost * zoneMultiplier * regionalMultiplier;

  // Ductwork
  let ductworkCost = 0;
  if (ductwork === 'new') {
    const estimatedFeet = squareFeet / 10;
    ductworkCost = estimatedFeet * 45 * regionalMultiplier;
  } else if (ductwork === 'replacement') {
    const estimatedFeet = squareFeet / 10;
    ductworkCost = estimatedFeet * 30 * regionalMultiplier;
  }

  // Labor
  const estimatedHours = 40 + (zones * 8) + (ductwork !== 'none' ? 20 : 0);
  const laborCost = estimatedHours * blsLaborRate;

  // Removal
  const removalCost = existingRemoval ? 800 * regionalMultiplier : 0;

  // Thermostat
  const thermostatCost = thermostatType === 'smart' ? 300 : 150;

  const subtotal = systemCost + ductworkCost + laborCost + removalCost + thermostatCost;
  const contingency = subtotal * 0.10;

  return {
    systemCost: Math.round(systemCost * 100) / 100,
    ductworkCost: Math.round(ductworkCost * 100) / 100,
    laborCost: Math.round(laborCost * 100) / 100,
    removalCost: Math.round(removalCost * 100) / 100,
    thermostatCost: Math.round(thermostatCost * 100) / 100,
    contingency: Math.round(contingency * 100) / 100,
    totalCost: Math.round((subtotal + contingency) * 100) / 100,
    breakdown: {
      estimatedHours,
      blsLaborRate,
      regionalMultiplier
    }
  };
}

function calculateHVAC(criteria, blsLaborRate, regionalMultiplier) {
  const {
    squareFeet,
    systemType = 'Central AC',
    units = 1
  } = criteria;

  // Base system costs
  const systemCosts = {
    'Central AC': 5000,
    'Heat Pump': 6500,
    'Furnace': 4500,
    'Ductless Mini-Split': 3500
  };

  const baseCost = (systemCosts[systemType] || 5000) * units;
  const systemCost = baseCost * regionalMultiplier;

  // Ductwork estimate (if central system)
  let ductworkCost = 0;
  if (systemType === 'Central AC' || systemType === 'Heat Pump' || systemType === 'Furnace') {
    const estimatedFeet = squareFeet / 10;
    ductworkCost = estimatedFeet * 30 * regionalMultiplier;
  }

  // Labor
  const estimatedHours = 40 * units;
  const laborCost = estimatedHours * blsLaborRate;

  const subtotal = systemCost + ductworkCost + laborCost;
  const contingency = subtotal * 0.10;

  return {
    systemCost: Math.round(systemCost * 100) / 100,
    ductworkCost: Math.round(ductworkCost * 100) / 100,
    laborCost: Math.round(laborCost * 100) / 100,
    contingency: Math.round(contingency * 100) / 100,
    totalCost: Math.round((subtotal + contingency) * 100) / 100,
    breakdown: {
      estimatedHours,
      blsLaborRate,
      regionalMultiplier
    }
  };
}

// ========================================
// 3. ELECTRICAL CALCULATOR
// ========================================
function calculateElectrical(criteria, blsLaborRate, regionalMultiplier) {
  const {
    squareFeet,
    panelUpgrade = 'none',
    newCircuits = 0,
    newOutlets = 0,
    specialtyWork = [],
    lightingFixtures = 0
  } = criteria;

  // Panel upgrade
  const panelCosts = {
    'none': 0,
    '100A': 1500,
    '200A': 2200,
    '400A': 3500
  };
  const panelCost = (panelCosts[panelUpgrade] || 0) * regionalMultiplier;

  // Circuits & Outlets
  const circuitCost = newCircuits * 250 * regionalMultiplier;
  const outletCost = newOutlets * 100 * regionalMultiplier;

  // Specialty work
  const specialtyCosts = {
    'evcharger': 1500,
    'subpanel': 800,
    'generator': 2500
  };
  
  let specialtyTotal = 0;
  specialtyWork.forEach(item => {
    specialtyTotal += (specialtyCosts[item] || 0) * regionalMultiplier;
  });

  // Lighting
  const lightingCost = lightingFixtures * 200 * regionalMultiplier;

  // Labor (2 hours per circuit/outlet, 8 hours for panel, 4 hours per specialty)
  const estimatedHours = (newCircuits * 2) + (newOutlets * 1.5) + 
                         (panelUpgrade !== 'none' ? 8 : 0) + 
                         (specialtyWork.length * 4) + 
                         (lightingFixtures * 1);
  const laborCost = estimatedHours * blsLaborRate;

  // Permit
  const permitCost = (panelUpgrade !== 'none' || newCircuits > 5) ? 300 * regionalMultiplier : 150 * regionalMultiplier;

  const subtotal = panelCost + circuitCost + outletCost + specialtyTotal + lightingCost + laborCost + permitCost;
  const contingency = subtotal * 0.10;

  return {
    panelCost: Math.round(panelCost * 100) / 100,
    circuitCost: Math.round(circuitCost * 100) / 100,
    outletCost: Math.round(outletCost * 100) / 100,
    specialtyCost: Math.round(specialtyTotal * 100) / 100,
    lightingCost: Math.round(lightingCost * 100) / 100,
    laborCost: Math.round(laborCost * 100) / 100,
    permitCost: Math.round(permitCost * 100) / 100,
    contingency: Math.round(contingency * 100) / 100,
    totalCost: Math.round((subtotal + contingency) * 100) / 100,
    breakdown: {
      estimatedHours,
      blsLaborRate,
      regionalMultiplier
    }
  };
}

// ========================================
// 4. PLUMBING CALCULATOR
// ========================================
function calculatePlumbing(criteria, blsLaborRate, regionalMultiplier) {
  const {
    fixtures = 0,
    pipeMaterial = 'pex',
    waterHeater = 'none',
    workType = 'both',
    existingModification = false,
    gasLine = false
  } = criteria;

  // Fixtures
  const fixtureAvgCost = 400;
  const fixtureCost = fixtures * fixtureAvgCost * regionalMultiplier;

  // Water heater
  const waterHeaterCosts = {
    'none': 0,
    'tank40': 1000,
    'tank50': 1200,
    'tank80': 1500,
    'tankless': 2200
  };
  const waterHeaterCost = (waterHeaterCosts[waterHeater] || 0) * regionalMultiplier;

  // Pipe (estimate 50 feet per fixture)
  const pipeRates = {
    'pex': 3,
    'copper': 12,
    'pvc': 2
  };
  const estimatedPipeFeet = fixtures * 50;
  const pipeCost = estimatedPipeFeet * (pipeRates[pipeMaterial] || 3) * regionalMultiplier;

  // Labor (4 hours per fixture rough-in, 2 hours finish)
  let hoursPerFixture = 4;
  if (workType === 'roughin') hoursPerFixture = 4;
  else if (workType === 'finish') hoursPerFixture = 2;
  else hoursPerFixture = 6; // both

  const estimatedHours = (fixtures * hoursPerFixture) + 
                         (waterHeater !== 'none' ? 6 : 0) +
                         (existingModification ? 10 : 0) +
                         (gasLine ? 8 : 0);
  const laborCost = estimatedHours * blsLaborRate;

  // Gas line work
  const gasLineCost = gasLine ? 800 * regionalMultiplier : 0;

  const subtotal = fixtureCost + waterHeaterCost + pipeCost + laborCost + gasLineCost;
  const contingency = subtotal * 0.10;

  return {
    fixtureCost: Math.round(fixtureCost * 100) / 100,
    waterHeaterCost: Math.round(waterHeaterCost * 100) / 100,
    pipeCost: Math.round(pipeCost * 100) / 100,
    laborCost: Math.round(laborCost * 100) / 100,
    gasLineCost: Math.round(gasLineCost * 100) / 100,
    contingency: Math.round(contingency * 100) / 100,
    totalCost: Math.round((subtotal + contingency) * 100) / 100,
    breakdown: {
      estimatedHours,
      estimatedPipeFeet,
      blsLaborRate,
      regionalMultiplier
    }
  };
}

// ========================================
// 5. FLOORING CALCULATOR
// ========================================
function calculateFlooring(criteria, blsLaborRate, regionalMultiplier) {
  const {
    squareFeet,
    flooringType = 'laminate',
    subfloorPrep = false,
    existingRemoval = false,
    transitionStrips = 0,
    stairs = 0
  } = criteria;

  // Material rates per sqft
  const materialRates = {
    'carpet': 5.5,
    'laminate': 7,
    'hardwood': 11.5,
    'tile': 17.5,
    'vinyl': 8.5,
    'concrete': 12
  };

  const materialCost = squareFeet * (materialRates[flooringType] || 7) * regionalMultiplier;

  // Labor (0.5 hours per 100 sqft)
  const baseHours = (squareFeet / 100) * 0.5;
  const removalHours = existingRemoval ? (squareFeet / 100) * 0.3 : 0;
  const subfloorHours = subfloorPrep ? (squareFeet / 100) * 0.4 : 0;
  const stairHours = stairs * 2;
  
  const estimatedHours = baseHours + removalHours + subfloorHours + stairHours;
  const laborCost = estimatedHours * blsLaborRate;

  // Additional costs
  const removalCost = existingRemoval ? squareFeet * 2 * regionalMultiplier : 0;
  const subfloorCost = subfloorPrep ? squareFeet * 3 * regionalMultiplier : 0;
  const transitionCost = transitionStrips * 30 * regionalMultiplier;

  const subtotal = materialCost + laborCost + removalCost + subfloorCost + transitionCost;
  const contingency = subtotal * 0.10;

  return {
    materialCost: Math.round(materialCost * 100) / 100,
    laborCost: Math.round(laborCost * 100) / 100,
    removalCost: Math.round(removalCost * 100) / 100,
    subfloorCost: Math.round(subfloorCost * 100) / 100,
    transitionCost: Math.round(transitionCost * 100) / 100,
    contingency: Math.round(contingency * 100) / 100,
    totalCost: Math.round((subtotal + contingency) * 100) / 100,
    breakdown: {
      estimatedHours,
      blsLaborRate,
      regionalMultiplier
    }
  };
}

// ========================================
// 6. PAINTING CALCULATOR
// ========================================
function calculatePainting(criteria, blsLaborRate, regionalMultiplier) {
  const {
    squareFeet,
    interior = true,
    exterior = false,
    coats = 2,
    ceilingPainting = false,
    trimDoorsCabinets = 0,
    surfacePrep = false
  } = criteria;

  // Calculate wall area (sqft × 2.5 for 8ft ceilings)
  const wallArea = squareFeet * 2.5;
  const ceilingArea = ceilingPainting ? squareFeet : 0;
  const totalArea = wallArea + ceilingArea;

  // Paint cost (1 gallon covers 350 sqft)
  const gallonsNeeded = (totalArea / 350) * coats;
  const paintCostPerGallon = exterior ? 55 : 45;
  const paintCost = gallonsNeeded * paintCostPerGallon * regionalMultiplier;

  // Primer (if surface prep)
  const primerCost = surfacePrep ? (totalArea / 350) * 30 * regionalMultiplier : 0;

  // Labor (0.02 hours per sqft per coat)
  const paintingHours = totalArea * 0.02 * coats;
  const prepHours = surfacePrep ? totalArea * 0.01 : 0;
  const trimHours = trimDoorsCabinets * 1.5;
  
  const estimatedHours = paintingHours + prepHours + trimHours;
  const laborCost = estimatedHours * blsLaborRate;

  // Trim/doors/cabinets
  const trimCost = trimDoorsCabinets * 75 * regionalMultiplier;

  const subtotal = paintCost + primerCost + laborCost + trimCost;
  const contingency = subtotal * 0.10;

  return {
    paintCost: Math.round(paintCost * 100) / 100,
    primerCost: Math.round(primerCost * 100) / 100,
    laborCost: Math.round(laborCost * 100) / 100,
    trimCost: Math.round(trimCost * 100) / 100,
    contingency: Math.round(contingency * 100) / 100,
    totalCost: Math.round((subtotal + contingency) * 100) / 100,
    breakdown: {
      totalArea,
      gallonsNeeded,
      estimatedHours,
      blsLaborRate,
      regionalMultiplier
    }
  };
}

// ========================================
// DRYWALL CALCULATOR
// ========================================
function calculateDrywall(criteria) {
  const {
    squareFeet,
    rooms = 1,
    ceilingHeight = 8,
    finishLevel = 'standard', // standard, smooth, textured
    isRepair = false,
    damageExtent = 'minor' // minor, moderate, extensive
  } = criteria;

  const socCode = '47-2081'; // Drywall and Ceiling Tile Installers
  
  // Material costs
  const sheetCost = ceilingHeight > 9 ? 20 : 12;
  const sheetsNeeded = Math.ceil(squareFeet / 32);
  const sheetTotal = sheetsNeeded * sheetCost;
  
  const compoundCost = squareFeet * 0.35;
  const tapeCost = squareFeet * 0.15;
  const screwsCost = sheetsNeeded * 0.50;
  
  // Complexity multipliers
  const heightMultiplier = ceilingHeight > 9 ? 1.2 : 1.0;
  const finishMultipliers = { standard: 1.0, smooth: 1.3, textured: 1.15 };
  const finishMultiplier = finishMultipliers[finishLevel] || 1.0;
  
  const totalMaterialCost = (sheetTotal + compoundCost + tapeCost + screwsCost) * heightMultiplier * finishMultiplier;
  
  // Labor calculations
  const hangHours = squareFeet * 0.02 * heightMultiplier;
  const mudHours = squareFeet * 0.03 * finishMultiplier;
  const textureHours = finishLevel === 'textured' ? squareFeet * 0.015 : 0;
  
  const totalLaborHours = hangHours + mudHours + textureHours;
  
  return {
    socCode,
    totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
    totalLaborHours: Math.round(totalLaborHours * 100) / 100,
    breakdown: {
      sheets: sheetsNeeded,
      sheetCost: sheetTotal,
      compoundCost,
      tapeCost,
      screwsCost,
      heightMultiplier,
      finishMultiplier
    }
  };
}

// ========================================
// SIDING CALCULATOR
// ========================================
function calculateSiding(criteria) {
  const {
    squareFeet,
    stories = 1,
    materialType = 'vinyl', // vinyl, fiber_cement, wood, metal, stucco
    removeExisting = false,
    trimLinearFeet = 0,
    windowCount = 0
  } = criteria;

  const socCode = '47-2099'; // Construction and Related Workers, All Other
  
  // Material costs per sqft
  const materialCosts = {
    vinyl: 4.50,
    fiber_cement: 8.00,
    wood: 12.00,
    metal: 6.50,
    stucco: 9.00
  };
  
  const materialUnitCost = materialCosts[materialType] || 4.50;
  const sidingCost = squareFeet * materialUnitCost;
  
  // Additional materials
  const removalCost = removeExisting ? squareFeet * 1.50 : 0;
  const houseWrapCost = squareFeet * 0.75;
  const trimCost = trimLinearFeet * 4.00;
  const windowTrimCost = windowCount * 50;
  
  // Story multiplier
  const storyMultipliers = { 1: 1.0, 2: 1.2, 3: 1.5 };
  const storyMultiplier = storyMultipliers[stories] || 1.0;
  
  const totalMaterialCost = (sidingCost + removalCost + houseWrapCost + trimCost + windowTrimCost) * storyMultiplier;
  
  // Labor rates per sqft
  const laborRates = {
    vinyl: 2.50,
    fiber_cement: 4.00,
    wood: 5.00,
    metal: 3.50,
    stucco: 6.00
  };
  
  const laborRate = laborRates[materialType] || 2.50;
  const totalLaborHours = (squareFeet * laborRate / 45) * storyMultiplier; // Assuming $45/hr base
  
  return {
    socCode,
    totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
    totalLaborHours: Math.round(totalLaborHours * 100) / 100,
    breakdown: {
      sidingCost,
      removalCost,
      houseWrapCost,
      trimCost,
      windowTrimCost,
      storyMultiplier,
      materialType
    }
  };
}

// ========================================
// 7. GENERAL CONTRACTING CALCULATOR
// ========================================
/*function calculateGeneral(criteria, blsLaborRate, regionalMultiplier) {
  const {
    projectType = 'remodel',
    squareFeet,
    roomsAffected = 1,
    structuralWork = false,
    permitAcquisition = false,
    managementFeePercent = 20,
    timelineWeeks = 4
  } = criteria;

  // Base project multipliers
  const projectMultipliers = {
    'remodel': 150,
    'addition': 200,
    'newconstruction': 180
  };

  const baseRate = projectMultipliers[projectType] || 150;
  const baseCost = squareFeet * baseRate * regionalMultiplier;

  // Structural work premium
  const structuralPremium = structuralWork ? baseCost * 0.15 : 0;

  // Permits
  let permitCost = 0;
  if (permitAcquisition) {
    if (squareFeet > 2000 || structuralWork) permitCost = 3000;
    else if (squareFeet > 1000) permitCost = 1500;
    else permitCost = 800;
    permitCost *= regionalMultiplier;
  }

  // Project management labor
  const estimatedHours = timelineWeeks * 10; // 10 hours/week supervision
  const laborCost = estimatedHours * blsLaborRate;

  // Management fee (percentage of total)
  const subtotalBeforeFee = baseCost + structuralPremium + permitCost + laborCost;
  const managementFee = subtotalBeforeFee * (managementFeePercent / 100);

  const subtotal = subtotalBeforeFee + managementFee;
  const contingency = subtotal * 0.15; // Higher contingency for GC projects

  return {
    baseCost: Math.round(baseCost * 100) / 100,
    structuralPremium: Math.round(structuralPremium * 100) / 100,
    permitCost: Math.round(permitCost * 100) / 100,
    laborCost: Math.round(laborCost * 100) / 100,
    managementFee: Math.round(managementFee * 100) / 100,
    contingency: Math.round(contingency * 100) / 100,
    totalCost: Math.round((subtotal + contingency) * 100) / 100,
    breakdown: {
      estimatedHours,
      blsLaborRate,
      regionalMultiplier,
      managementFeePercent
    }
  };
}*/

// ========================================
// MAIN CALCULATOR ROUTER
// ========================================
function calculateEstimate(tradeType, criteria, blsLaborRate, regionalMultiplier) {
  switch(tradeType) {
    case 'roofing':
      return calculateRoofing(criteria, blsLaborRate, regionalMultiplier);
    case 'hvac':
      return calculateHVAC(criteria, blsLaborRate, regionalMultiplier);
    case 'electrical':
      return calculateElectrical(criteria, blsLaborRate, regionalMultiplier);
    case 'plumbing':
      return calculatePlumbing(criteria, blsLaborRate, regionalMultiplier);
    case 'flooring':
      return calculateFlooring(criteria, blsLaborRate, regionalMultiplier);
    case 'painting':
      return calculatePainting(criteria, blsLaborRate, regionalMultiplier);
    case 'general':
      return calculateGeneral(criteria, blsLaborRate, regionalMultiplier);
    default:
      throw new Error(`Unknown trade type: ${tradeType}`);
  }
}

module.exports = {
  TRADE_SOC_CODES,
  calculateEstimate,
  calculateRoofing,
  calculateHVAC,
  calculateElectrical,
  calculatePlumbing,
  calculateFlooring,
  calculatePainting,
  calculateGeneral
  calculateDrywall,     
  calculateSiding  
};
