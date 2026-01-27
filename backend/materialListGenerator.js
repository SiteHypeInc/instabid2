// ============================================
// MATERIAL LIST GENERATION - ALL 8 TRADES
// Add this to server.js after the estimate calculation logic
// ============================================

function generateMaterialList(trade, criteria, contractorId = null, pricingConfig = {}) {
  
  switch(trade.toLowerCase()) {
    
   
    case 'roofing': {
  let materialList = [];
  
  // Helper to get contractor price or default
  const getPrice = (key, defaultValue) => {
    return pricingConfig.roofing?.[key] ?? defaultValue;
  };
  
  const squareFeet = parseFloat(criteria.squareFeet) || 2000;
  const layers = parseInt(criteria.layers) || 1;
  const chimneys = parseInt(criteria.chimneys) || 0;
  const skylights = parseInt(criteria.skylights) || 0;
  const valleys = parseInt(criteria.valleys) || 0;
  const plywoodSqft = parseFloat(criteria.plywoodSqft) || 0;
  const existingRoofType = criteria.existingRoofType || 'asphalt';
  const pitch = criteria.pitch || '6/12';
  const ridgeVentFeet = parseFloat(criteria.ridgeVentFeet) || 0;

  // Pitch multipliers
  const pitchMultipliers = {
    '3/12': 1.0, '4/12': 1.0, '5/12': 1.05,
    '6/12': 1.1, '7/12': 1.15, '8/12': 1.2,
    '9/12': 1.3, '10/12': 1.4, '11/12': 1.5, '12/12+': 1.6
  };
  const pitchMult = pitchMultipliers[pitch] || 1.1;

  // Waste multiplier
  const waste = 1.10; // 10% waste

  // Perimeter estimate (for starter, drip edge, etc.)
  const perimeter = Math.sqrt(squareFeet) * 4;
  const ridgeLength = Math.sqrt(squareFeet) / 2;

  // === SHINGLES ===
// Determine material type from criteria
const materialType = (criteria.material || '').toLowerCase();
let shingleCostPerBundle = getPrice('mat_arch', 44.96); // default to architectural
let shingleCalcMethod = 'bundle'; // bundle or sqft

if (materialType.includes('3-tab') || materialType.includes('asphalt')) {
  shingleCostPerBundle = getPrice('mat_asphalt', 40.00);
  shingleCalcMethod = 'bundle';
} else if (materialType.includes('architectural')) {
  shingleCostPerBundle = getPrice('mat_arch', 44.96);
  shingleCalcMethod = 'bundle';
} else if (materialType.includes('metal')) {
  shingleCostPerBundle = getPrice('mat_metal', 9.50);
  shingleCalcMethod = 'sqft';
} else if (materialType.includes('tile')) {
  shingleCostPerBundle = getPrice('mat_tile', 12.00);
  shingleCalcMethod = 'sqft';
} else if (materialType.includes('wood') || materialType.includes('shake')) {
  shingleCostPerBundle = getPrice('mat_wood_shake', 14.00);
  shingleCalcMethod = 'sqft';
}

// Calculate shingles cost
let shinglesCost, shinglesQty, shinglesUnit;

if (shingleCalcMethod === 'bundle') {
  // 3 bundles per square (100 sqft), with 10% waste
  const squares = squareFeet / 100;
  shinglesQty = Math.ceil(squares * 3 * waste);
  shinglesUnit = 'bundles';
  shinglesCost = shinglesQty * shingleCostPerBundle;
} else {
  // Per sqft pricing (metal, tile, wood shake)
  shinglesQty = Math.ceil(squareFeet * waste);
  shinglesUnit = 'sqft';
  shinglesCost = shinglesQty * shingleCostPerBundle;
}

materialList.push({
  item: materialType.includes('metal') ? 'Metal Roofing' : 
        materialType.includes('tile') ? 'Tile Roofing' :
        materialType.includes('wood') || materialType.includes('shake') ? 'Wood Shake' :
        'Architectural Shingles',
  quantity: shinglesQty,
  unit: shinglesUnit,
  unitCost: shingleCostPerBundle,
  totalCost: shinglesCost,
  category: 'shingles'
});

  // === UNDERLAYMENT ===
  // 1 roll covers 400 sqft
  const underlaymentRolls = Math.ceil(squareFeet / 400);
  materialList.push({
    item: 'Underlayment',
    quantity: underlaymentRolls,
    unit: 'rolls',
    unitCost: getPrice('underlayment_roll', 45.00),
    totalCost: underlaymentRolls * getPrice('underlayment_roll', 45.00),
    category: 'underlayment'
  });

  // === ROOFING NAILS ===
  // 1 box per 1000 sqft
  const nailBoxes = Math.ceil(squareFeet / 1000);
  materialList.push({
    item: 'Roofing Nails',
    quantity: nailBoxes,
    unit: 'boxes',
    unitCost: getPrice('nails_box', 85.00),
    totalCost: nailBoxes * getPrice('nails_box', 85.00),
    category: 'fasteners'
  });

  // === STARTER SHINGLES ===
  materialList.push({
    item: 'Starter Shingles',
    quantity: Math.ceil(perimeter),
    unit: 'linear ft',
    unitCost: getPrice('starter_lf', 2.50),
    totalCost: Math.ceil(perimeter) * getPrice('starter_lf', 2.50),
    category: 'shingles'
  });

  // === RIDGE CAP ===
  materialList.push({
    item: 'Ridge Cap',
    quantity: Math.ceil(ridgeLength),
    unit: 'linear ft',
    unitCost: getPrice('ridge_lf', 3.00),
    totalCost: Math.ceil(ridgeLength) * getPrice('ridge_lf', 3.00),
    category: 'shingles'
  });

  // === DRIP EDGE ===
  materialList.push({
    item: 'Drip Edge',
    quantity: Math.ceil(perimeter),
    unit: 'linear ft',
    unitCost: getPrice('drip_edge_lf', 2.75),
    totalCost: Math.ceil(perimeter) * getPrice('drip_edge_lf', 2.75),   
    category: 'flashing'
  });

  // === ICE & WATER SHIELD ===
  // Typically 2 rows at eaves (6ft width) × perimeter/2
  const iceWaterLF = Math.ceil(perimeter * 0.4);
  materialList.push({
    item: 'Ice & Water Shield',
    quantity: iceWaterLF,
    unit: 'linear ft',
    unitCost: getPrice('ice_shield_lf', 4.50),
    totalCost: iceWaterLF * getPrice('ice_shield_lf', 4.50),
    category: 'underlayment'
  });

  // === ROOF VENTS ===
  // 1 vent per 150 sqft of attic space
  const ventsNeeded = Math.ceil(squareFeet / 150);
  materialList.push({
    item: 'Roof Vents',
    quantity: ventsNeeded,
    unit: 'vents',
    unitCost: getPrice('vent_unit', 25.00),
totalCost: ventsNeeded * getPrice('vent_unit', 25.00),
    category: 'ventilation'
  });

  // === RIDGE VENT (if specified) ===
  if (ridgeVentFeet > 0) {
    materialList.push({
      item: 'Ridge Vent',
      quantity: Math.ceil(ridgeVentFeet),
      unit: 'linear ft',
      unitCost: getPrice('ridge_vent_lf', 5.50),
totalCost: Math.ceil(ridgeVentFeet) * getPrice('ridge_vent_lf', 5.50),
      category: 'ventilation'
    });
  }

  // === OSB/PLYWOOD SHEATHING ===
  if (plywoodSqft > 0) {
    // 1 sheet = 32 sqft, with 10% waste
    const sheetsNeeded = Math.ceil((plywoodSqft / 32) * waste);
    materialList.push({
      item: 'OSB Sheathing',
      quantity: sheetsNeeded,
      unit: 'sheets',
      unitCost: getPrice('osb_sheet', 28.00),
totalCost: sheetsNeeded * getPrice('osb_sheet', 28.00),
      category: 'sheathing'
    });
  }

 // === DISPOSAL ===
const disposalRates = {
  'asphalt': getPrice('disposal_asphalt_sqft', 0.40),
  'wood_shake': getPrice('disposal_wood_sqft', 0.40),
  'metal': getPrice('disposal_metal_sqft', 0.50),
  'tile': getPrice('disposal_tile_sqft', 0.75)
};
const disposalRate = disposalRates[existingRoofType] || getPrice('disposal_asphalt_sqft', 0.40);
const disposalCost = squareFeet * layers * disposalRate;

materialList.push({
  item: 'Disposal/Dumpster',
  quantity: layers,
  unit: 'layer(s)',
  unitCost: squareFeet * disposalRate,
  totalCost: disposalCost,
  category: 'disposal'
});

  // === CHIMNEY FLASHING ===
  if (chimneys > 0) {
    materialList.push({
      item: 'Chimney Flashing Kit',
      quantity: chimneys,
      unit: 'kits',
      unitCost: getPrice('chimney_flash', 125.00),
totalCost: chimneys * getPrice('chimney_flash', 125.00),
      category: 'flashing'
    });
  }

  // === SKYLIGHT FLASHING ===
  if (skylights > 0) {
    materialList.push({
      item: 'Skylight Flashing Kit',
      quantity: skylights,
      unit: 'kits',
     unitCost: getPrice('skylight_flash', 85.00),
totalCost: skylights * getPrice('skylight_flash', 85.00),
      category: 'flashing'
    });
  }

  // === VALLEY FLASHING ===
  if (valleys > 0) {
    // Assume 10 linear ft per valley
    const valleyLF = valleys * 10;
    materialList.push({
      item: 'Valley Flashing',
      quantity: valleyLF,
      unit: 'linear ft',
      unitCost: getPrice('valley_lf', 6.00),
totalCost: valleyLF * getPrice('valley_lf', 6.00),
      category: 'flashing'
    });
  }

  // === CALCULATE TOTALS ===
  const totalMaterialCost = materialList.reduce((sum, item) => sum + item.totalCost, 0);

  // === LABOR HOURS ===
  // Base: 0.04 hrs/sqft
  let laborHours = squareFeet * 0.04;
  
  // Pitch multiplier
  laborHours *= pitchMult;
  
  // Details
  laborHours += chimneys * 3;
  laborHours += skylights * 2;

  return {
    trade: 'roofing',
    totalMaterialCost: totalMaterialCost,
    laborHours: Math.round(laborHours * 10) / 10, // Round to 1 decimal
    materialList: materialList,
    complexityMultiplier: pitchMult
  };
}

// ============================================
// 2. SIDING
// ============================================
case 'siding': {
  let {
    squareFeet,
    sidingType = 'vinyl',
    stories = 1,
    removal,
    needsRemoval,
    windowCount = 0,
    doorCount = 0,
    trimLinearFeet
  } = criteria;

  // Helper to get contractor price or default
  const getPrice = (key, defaultValue) => {
    return pricingConfig.siding?.[key] ?? defaultValue;
  };

  // Normalize siding type from form
  if (sidingType === 'wood_cedar') sidingType = 'wood';
  if (sidingType === 'metal_aluminum') sidingType = 'metal';
  
  // Handle removal field from form
  removal = removal || needsRemoval === 'yes';

  const wasteMultiplier = 1.12;
  const adjustedSqft = squareFeet * wasteMultiplier;
  const trim = trimLinearFeet || Math.sqrt(squareFeet) * 4;

  const materialCosts = {
    'vinyl': getPrice('siding_vinyl', 5.50),
    'fiber_cement': getPrice('siding_fiber_cement', 9.50),
    'wood': getPrice('siding_wood', 14.00),
    'metal': getPrice('siding_metal', 8.00),
    'stucco': getPrice('siding_stucco', 11.00)
  };

  const laborRates = {
    'vinyl': getPrice('siding_labor_vinyl', 3.50),
    'fiber_cement': getPrice('siding_labor_fiber', 5.50),
    'wood': getPrice('siding_labor_wood', 6.50),
    'metal': getPrice('siding_labor_metal', 4.50),
    'stucco': getPrice('siding_labor_stucco', 7.50)
  };

  const materialList = [];

  // Siding material
  const sidingCostPerSqft = materialCosts[sidingType] || getPrice('siding_vinyl', 5.50);
  materialList.push({
    item: `${sidingType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Siding`,
    quantity: Math.ceil(adjustedSqft),
    unit: 'sqft',
    unitCost: sidingCostPerSqft,
    totalCost: adjustedSqft * sidingCostPerSqft,
    category: 'siding_material'
  });

  // House wrap (roll covers ~1000 sqft)
  const houseWrapRollCost = getPrice('housewrap_roll', 175);
  const houseWrapRolls = Math.ceil(squareFeet / 1000);
  materialList.push({
    item: 'House Wrap',
    quantity: houseWrapRolls,
    unit: 'rolls',
    unitCost: houseWrapRollCost,
    totalCost: houseWrapRolls * houseWrapRollCost,
    category: 'house_wrap'
  });

  // J-Channel (12ft pieces)
  const jChannelCost = getPrice('j_channel_12ft', 12);
  const jChannelPieces = Math.ceil(trim / 12);
  materialList.push({
    item: 'J-Channel',
    quantity: jChannelPieces,
    unit: 'pieces (12ft)',
    unitCost: jChannelCost,
    totalCost: jChannelPieces * jChannelCost,
    category: 'trim'
  });

  // Corner posts (estimate 4 outside + 2 inside for typical house)
  const cornerPostCost = getPrice('corner_post', 35);
  const cornerPosts = stories <= 1 ? 6 : stories * 6;
  materialList.push({
    item: 'Corner Posts',
    quantity: cornerPosts,
    unit: 'posts',
    unitCost: cornerPostCost,
    totalCost: cornerPosts * cornerPostCost,
    category: 'trim'
  });

  // Window wrapping
  if (windowCount > 0) {
    const windowTrimCost = getPrice('window_trim_each', 55.00);
    materialList.push({
      item: 'Window Trim & Wrapping',
      quantity: windowCount,
      unit: 'windows',
      unitCost: windowTrimCost,
      totalCost: windowCount * windowTrimCost,
      category: 'trim'
    });
  }

  // Door wrapping
  if (doorCount > 0) {
    const doorTrimCost = getPrice('door_trim_each', 75.00);
    materialList.push({
      item: 'Door Trim & Wrapping',
      quantity: doorCount,
      unit: 'doors',
      unitCost: doorTrimCost,
      totalCost: doorCount * doorTrimCost,
      category: 'trim'
    });
  }

  // Soffit (estimate perimeter × 1.5ft width)
  const perimeter = Math.sqrt(squareFeet) * 4;
  const soffitSqft = perimeter * 1.5;
  const soffitCost = getPrice('soffit_sqft', 8);
  materialList.push({
    item: 'Soffit',
    quantity: Math.ceil(soffitSqft),
    unit: 'sqft',
    unitCost: soffitCost,
    totalCost: soffitSqft * soffitCost,
    category: 'soffit'
  });

  // Fascia
  const fasciaCost = getPrice('fascia_lf', 6);
  materialList.push({
    item: 'Fascia',
    quantity: Math.ceil(perimeter),
    unit: 'linear ft',
    unitCost: fasciaCost,
    totalCost: perimeter * fasciaCost,
    category: 'fascia'
  });

  // Fasteners kit
  const fastenerKitCost = getPrice('fastener_kit', 175.00);
  materialList.push({
    item: 'Fasteners, Flashing & Caulk',
    quantity: 1,
    unit: 'kit',
    unitCost: fastenerKitCost,
    totalCost: fastenerKitCost,
    category: 'fasteners'
  });

  // Removal
  if (removal) {
    const removalCost = getPrice('removal_sqft', 1.75);
    materialList.push({
      item: 'Old Siding Removal & Disposal',
      quantity: squareFeet,
      unit: 'sqft',
      unitCost: removalCost,
      totalCost: squareFeet * removalCost,
      category: 'removal'
    });
  }

  // Labor
  const laborRate = laborRates[sidingType] || getPrice('siding_labor_vinyl', 3.50);
  const laborHourlyRate = getPrice('labor_hourly', 45);
  let laborHours = (squareFeet * laborRate) / laborHourlyRate;
  
  // Story multipliers
  if (stories >= 3) laborHours *= 1.5;
  else if (stories >= 2) laborHours *= 1.25;
  
  if (removal) laborHours += squareFeet * 0.02;

  const totalMaterialCost = materialList.reduce((sum, item) => sum + item.totalCost, 0);

  return {
    trade: 'siding',
    totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
    laborHours: Math.round(laborHours * 100) / 100,
    materialList
  };
}
    // ============================================
// PLUMBING - SYNCED WITH SERVER.JS
// ============================================
case 'plumbing': {
  const {
    serviceType = 'general',
    squareFeet = 0,
    stories = 1,
    bathrooms = 1,
    kitchens = 1,
    laundryRooms = 0,
    accessType = 'basement',
    heaterType = 'tank',
    waterHeaterLocation = 'garage',
    gasLineNeeded = 'no',
    mainLineReplacement = 'no',
    garbageDisposal = 'no',
    iceMaker = 'no',
    waterSoftener = 'no',
    toiletCount = 0,
    sinkCount = 0,
    faucetCount = 0,
    tubShowerCount = 0
  } = criteria;

  const materialList = [];
  let laborHours = 0;
  const laborRate = 95; // default

  // Access multiplier
  const accessMultipliers = { 'basement': 1.0, 'crawlspace': 1.15, 'slab': 1.35 };
  const accessMult = accessMultipliers[accessType] || 1.0;
  
  // Location multiplier
  const locationMultipliers = { 'garage': 1.0, 'basement': 1.0, 'closet': 1.1, 'attic': 1.25 };
  const locationMult = locationMultipliers[waterHeaterLocation] || 1.0;

  // ========== REPIPE ==========
  if (serviceType === 'repipe' && squareFeet > 0) {
    const basePipeFeet = squareFeet * 0.5;
    const fixturePipeFeet = (bathrooms * 25) + (kitchens * 30) + (laundryRooms * 15);
    const totalPipeFeet = Math.ceil(basePipeFeet + fixturePipeFeet);
    
    materialList.push({
      item: 'PEX Pipe',
      quantity: totalPipeFeet,
      unit: 'linear feet',
      unitCost: 2.50,
      totalCost: totalPipeFeet * 2.50,
      category: 'Pipe'
    });
    
    const fittingsCost = totalPipeFeet * 2.50 * 0.30;
    materialList.push({
      item: 'Fittings & Connectors',
      quantity: 1,
      unit: 'set',
      unitCost: fittingsCost,
      totalCost: fittingsCost,
      category: 'Pipe'
    });
    
    const valveCount = (bathrooms * 2) + (kitchens * 2) + laundryRooms;
    materialList.push({
      item: 'Shutoff Valves',
      quantity: valveCount,
      unit: 'valves',
      unitCost: 25,
      totalCost: valveCount * 25,
      category: 'Pipe'
    });
    
    laborHours = (squareFeet / 100) * 5;
    if (stories >= 2) laborHours *= 1.2;
    if (stories >= 3) laborHours *= 1.15;
    laborHours *= accessMult;
    
    if (mainLineReplacement === 'yes') {
      materialList.push({
        item: 'Main Line Replacement',
        quantity: 1,
        unit: 'job',
        unitCost: 1200,
        totalCost: 1200,
        category: 'Main Line'
      });
      laborHours += 8;
    }
  }
  
  // ========== WATER HEATER ==========
  else if (serviceType === 'water_heater') {
    let heaterCost, heaterName;
    
    if (heaterType === 'tankless') {
      if (gasLineNeeded === 'yes') {
        heaterCost = 3500;
        heaterName = 'Tankless Water Heater (Gas)';
        laborHours = 10;
      } else {
        heaterCost = 2200;
        heaterName = 'Tankless Water Heater (Electric)';
        laborHours = 8;
      }
    } else {
      heaterCost = 1600;
      heaterName = 'Tank Water Heater (50 gal)';
      laborHours = 6;
    }
    
    materialList.push({
      item: heaterName,
      quantity: 1,
      unit: 'unit',
      unitCost: heaterCost,
      totalCost: heaterCost,
      category: 'Water Heater'
    });
    
    materialList.push({
      item: 'Installation Supplies (flex lines, fittings)',
      quantity: 1,
      unit: 'set',
      unitCost: 150,
      totalCost: 150,
      category: 'Water Heater'
    });
    
    laborHours *= locationMult;
    
    if (gasLineNeeded === 'yes') {
      materialList.push({
        item: 'Gas Line Installation',
        quantity: 1,
        unit: 'job',
        unitCost: 500,
        totalCost: 500,
        category: 'Gas'
      });
      laborHours += 4;
    }
  }
  
  // ========== FIXTURE ==========
  else if (serviceType === 'fixture') {
    if (toiletCount > 0) {
      materialList.push({
        item: 'Toilet Installation',
        quantity: toiletCount,
        unit: 'fixtures',
        unitCost: 375,
        totalCost: 375 * toiletCount,
        category: 'Fixtures'
      });
      laborHours += 2.5 * toiletCount;
    }
    
    if (sinkCount > 0) {
      materialList.push({
        item: 'Sink Installation',
        quantity: sinkCount,
        unit: 'fixtures',
        unitCost: 450,
        totalCost: 450 * sinkCount,
        category: 'Fixtures'
      });
      laborHours += 3 * sinkCount;
    }
    
    if (faucetCount > 0) {
      materialList.push({
        item: 'Faucet Installation',
        quantity: faucetCount,
        unit: 'fixtures',
        unitCost: 262,
        totalCost: 262 * faucetCount,
        category: 'Fixtures'
      });
      laborHours += 1.5 * faucetCount;
    }
    
    if (tubShowerCount > 0) {
      materialList.push({
        item: 'Tub/Shower Installation',
        quantity: tubShowerCount,
        unit: 'fixtures',
        unitCost: 1200,
        totalCost: 1200 * tubShowerCount,
        category: 'Fixtures'
      });
      laborHours += 6 * tubShowerCount;
    }
    
    laborHours *= accessMult;
    laborHours = Math.max(laborHours, 2);
  }
  
  // ========== GENERAL ==========
  else {
    materialList.push({
      item: 'Service Call',
      quantity: 1,
      unit: 'visit',
      unitCost: 95,
      totalCost: 95,
      category: 'Service'
    });
    laborHours = 2;
    
    if (garbageDisposal === 'yes') {
      materialList.push({
        item: 'Garbage Disposal Installation',
        quantity: 1,
        unit: 'unit',
        unitCost: 325,
        totalCost: 325,
        category: 'Add-ons'
      });
      laborHours += 1.5;
    }
    
    if (iceMaker === 'yes') {
      materialList.push({
        item: 'Ice Maker Line Installation',
        quantity: 1,
        unit: 'line',
        unitCost: 150,
        totalCost: 150,
        category: 'Add-ons'
      });
      laborHours += 1;
    }
    
    if (waterSoftener === 'yes') {
      materialList.push({
        item: 'Water Softener Installation',
        quantity: 1,
        unit: 'unit',
        unitCost: 1800,
        totalCost: 1800,
        category: 'Add-ons'
      });
      laborHours += 4;
    }
    
    if (mainLineReplacement === 'yes') {
      materialList.push({
        item: 'Main Line Replacement',
        quantity: 1,
        unit: 'job',
        unitCost: 1200,
        totalCost: 1200,
        category: 'Main Line'
      });
      laborHours += 8;
    }
    
    if (gasLineNeeded === 'yes') {
      materialList.push({
        item: 'Gas Line Installation',
        quantity: 1,
        unit: 'job',
        unitCost: 500,
        totalCost: 500,
        category: 'Gas'
      });
      laborHours += 4;
    }
  }
  
  // Labor line item
  materialList.push({
    item: `Plumbing Labor (${accessType} access)`,
    quantity: Math.round(laborHours * 10) / 10,
    unit: 'hours',
    unitCost: laborRate,
    totalCost: Math.round(laborHours * laborRate * 100) / 100,
    category: 'Labor'
  });

  const totalMaterialCost = materialList.reduce((sum, item) => sum + item.totalCost, 0);

  return {
    trade: 'plumbing',
    totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
    laborHours: Math.round(laborHours * 10) / 10,
    materialList
  };
}

   // ============================================
// PAINTING - SYNCED WITH FORM & SERVER.JS
// ============================================
case 'painting': {
  const {
    squareFeet = 0,
    paintType = 'exterior',
    stories = 1,
    coats = 2,
    rooms = 1,
    includeCeilings = 'no',
    trimLinearFeet = 0,
    doorCount = 0,
    windowCount = 0,
    sidingCondition = 'good',
    powerWashing = 'no',
    wallCondition = 'smooth',
    patchingNeeded = 'none',
    leadPaint = 'no',
    colorChangeDramatic = 'no'
  } = criteria;

  const materialList = [];
  let laborHours = 0;
  
  const coatMultiplier = { 1: 1.0, 2: 1.5, 3: 2.0 }[parseInt(coats)] || 1.5;
  const storyMultiplier = { 1: 1.0, 2: 1.15, 3: 1.35, 4: 1.5 }[parseInt(stories)] || 1.0;
  
  const getConditionMultiplier = (condition) => {
    const mult = { 'excellent': 0.9, 'good': 1.0, 'smooth': 1.0, 'fair': 1.15, 'textured': 1.1, 'poor': 1.25, 'damaged': 1.35, 'needs_repair': 1.4 };
    return mult[condition] || 1.0;
  };
  
  const pType = paintType.toLowerCase();
  const sqft = parseFloat(squareFeet) || 0;
  
  // ===== INTERIOR =====
  if (pType === 'interior' || pType === 'both') {
    const intSqft = pType === 'both' ? sqft * 0.5 : sqft;
    const intCost = intSqft * 4.50 * coatMultiplier; // paint_interior_sqft default
    
    materialList.push({
      item: `Interior Wall Paint (${coats} coat${coats > 1 ? 's' : ''})`,
      quantity: intSqft,
      unit: 'sqft',
      unitCost: 4.50 * coatMultiplier,
      totalCost: intCost,
      category: 'Interior'
    });
    
    laborHours += (intSqft / 200) * getConditionMultiplier(wallCondition);
    
    // Ceilings
    if (includeCeilings === 'yes') {
      const ceilSqft = intSqft * 0.9;
      const ceilCost = ceilSqft * 1.25 * coatMultiplier;
      
      materialList.push({
        item: `Ceiling Paint (${coats} coat${coats > 1 ? 's' : ''})`,
        quantity: Math.round(ceilSqft),
        unit: 'sqft',
        unitCost: 1.25 * coatMultiplier,
        totalCost: ceilCost,
        category: 'Interior'
      });
      
      laborHours += ceilSqft / 250;
    }
  }
  
  // ===== EXTERIOR =====
  if (pType === 'exterior' || pType === 'both') {
    const extSqft = pType === 'both' ? sqft * 0.5 : sqft;
    const extCost = extSqft * 3.50 * coatMultiplier * storyMultiplier;
    
    materialList.push({
      item: `Exterior Paint (${coats} coat${coats > 1 ? 's' : ''}, ${stories} stor${stories > 1 ? 'ies' : 'y'})`,
      quantity: extSqft,
      unit: 'sqft',
      unitCost: 3.50 * coatMultiplier * storyMultiplier,
      totalCost: extCost,
      category: 'Exterior'
    });
    
    laborHours += (extSqft / 150) * storyMultiplier * getConditionMultiplier(sidingCondition);
    
    // Power washing
    if (powerWashing === 'yes') {
      const pwCost = extSqft * 0.25;
      materialList.push({
        item: 'Power Washing',
        quantity: extSqft,
        unit: 'sqft',
        unitCost: 0.25,
        totalCost: pwCost,
        category: 'Prep'
      });
      laborHours += extSqft / 500;
    }
  }
  
  // ===== PATCHING =====
  const patchPricing = { 'minor': 150, 'moderate': 350, 'extensive': 750 };
  const patchLabor = { 'minor': 2, 'moderate': 4, 'extensive': 8 };
  
  if (patchingNeeded !== 'none' && patchPricing[patchingNeeded]) {
    materialList.push({
      item: `Wall Patching (${patchingNeeded})`,
      quantity: 1,
      unit: 'job',
      unitCost: patchPricing[patchingNeeded],
      totalCost: patchPricing[patchingNeeded],
      category: 'Prep'
    });
    laborHours += patchLabor[patchingNeeded];
  }
  
  // ===== TRIM =====
  const trimLF = parseFloat(trimLinearFeet) || 0;
  if (trimLF > 0) {
    materialList.push({
      item: 'Trim Painting',
      quantity: trimLF,
      unit: 'linear ft',
      unitCost: 1.50,
      totalCost: trimLF * 1.50,
      category: 'Trim & Detail'
    });
    laborHours += trimLF / 30;
  }
  
  // ===== DOORS =====
  const doors = parseInt(doorCount) || 0;
  if (doors > 0) {
    materialList.push({
      item: 'Door Painting',
      quantity: doors,
      unit: 'doors',
      unitCost: 75,
      totalCost: doors * 75,
      category: 'Trim & Detail'
    });
    laborHours += doors * 0.75;
  }
  
  // ===== WINDOWS =====
  const windows = parseInt(windowCount) || 0;
  if (windows > 0) {
    materialList.push({
      item: 'Window Trim (Standard Style)',
      quantity: windows,
      unit: 'windows',
      unitCost: 50,
      totalCost: windows * 50,
      category: 'Trim & Detail'
    });
    laborHours += windows * 0.5;
  }
  
  // ===== PRIMER (dramatic color change) =====
  if (colorChangeDramatic === 'yes') {
    const primerCost = sqft * 0.50;
    materialList.push({
      item: 'Extra Primer (Dramatic Color Change)',
      quantity: sqft,
      unit: 'sqft',
      unitCost: 0.50,
      totalCost: primerCost,
      category: 'Prep'
    });
    laborHours += sqft / 300;
  }
  
  // ===== LEAD PAINT =====
  if (leadPaint === 'yes') {
    materialList.push({
      item: 'Lead Paint Abatement Protocol',
      quantity: 1,
      unit: 'job',
      unitCost: 500,
      totalCost: 500,
      category: 'Specialty'
    });
    laborHours += 8;
  }
  
  // ===== LABOR =====
  laborHours = Math.max(laborHours, 4); // 4 hour minimum
  
  materialList.push({
    item: `Labor (${pType}${parseInt(stories) > 1 ? ', ' + stories + ' stories' : ''})`,
    quantity: Math.round(laborHours * 10) / 10,
    unit: 'hours',
    unitCost: 65,
    totalCost: laborHours * 65,
    category: 'Labor'
  });
  
  const totalMaterialCost = materialList.reduce((sum, item) => sum + item.totalCost, 0);
  
  return {
    trade: 'painting',
    totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
    laborHours: Math.round(laborHours * 10) / 10,
    materialList
  };
}

    // ============================================
    // 5. HVAC
    // ============================================
    case 'hvac': {
      const {
        squareFeet,
        systemType = 'furnace',
        efficiency = 'standard',
        ductwork = 'existing',
        stories = 1,
        zoneCount = 1,
        thermostats = 1
      } = criteria;

      // Size multiplier
      let sizeMult = 1.0;
      if (squareFeet < 1500) sizeMult = 0.9;
      else if (squareFeet <= 2500) sizeMult = 1.0;
      else if (squareFeet <= 4000) sizeMult = 1.2;
      else sizeMult = 1.4;

      const materialList = [];

      // Equipment
      const equipmentPrices = {
        'furnace': { standard: 3500, high: 4500 },
        'ac': { standard: 4000, high: 5500 },
        'heatpump': { standard: 5500, high: 7500 },
        'minisplit': { standard: 2500, high: 2500 }
      };

      const equipmentNames = {
        'furnace': { standard: 'Standard Furnace', high: 'High-Efficiency Furnace' },
        'ac': { standard: 'Central AC Unit', high: 'High-Efficiency AC Unit' },
        'heatpump': { standard: 'Heat Pump', high: 'High-Efficiency Heat Pump' },
        'minisplit': { standard: 'Mini-Split System', high: 'Mini-Split System' }
      };

      let equipmentCost = equipmentPrices[systemType]?.[efficiency] || 3500;
      if (systemType === 'minisplit') equipmentCost *= zoneCount;
      equipmentCost *= sizeMult;

      const equipmentName = systemType === 'minisplit' 
        ? `Mini-Split System (${zoneCount} zones)` 
        : equipmentNames[systemType]?.[efficiency] || 'HVAC Unit';

      materialList.push({
        item: equipmentName,
        quantity: 1,
        unit: 'unit',
        unitCost: equipmentCost,
        totalCost: equipmentCost,
        category: 'hvac_units'
      });

      // Ductwork
      let ductworkFeet = 0;
      if (ductwork === 'new') {
        ductworkFeet = Math.ceil(squareFeet / 10);
        materialList.push({
          item: 'New Ductwork',
          quantity: ductworkFeet,
          unit: 'linear feet',
          unitCost: 15,
          totalCost: ductworkFeet * 15,
          category: 'ductwork'
        });
      } else if (ductwork === 'repair') {
        ductworkFeet = Math.ceil(squareFeet / 20);
        materialList.push({
          item: 'Ductwork Repair',
          quantity: ductworkFeet,
          unit: 'linear feet',
          unitCost: 8,
          totalCost: ductworkFeet * 8,
          category: 'ductwork'
        });
      }

      // Thermostats
      materialList.push({
        item: 'Smart Thermostat',
        quantity: thermostats,
        unit: 'units',
        unitCost: 350,
        totalCost: thermostats * 350,
        category: 'thermostats'
      });

      // Refrigerant
      if (systemType !== 'furnace') {
        materialList.push({
          item: 'Refrigerant',
          quantity: 1,
          unit: 'charge',
          unitCost: 250,
          totalCost: 250,
          category: 'refrigerant'
        });
      }

      // Filters & supplies
      materialList.push({
        item: 'Filters & Supplies',
        quantity: 1,
        unit: 'set',
        unitCost: 200,
        totalCost: 200,
        category: 'filters'
      });

      // Labor
      const baseLaborHours = { 'furnace': 12, 'ac': 10, 'heatpump': 14, 'minisplit': 8 };
      let laborHours = baseLaborHours[systemType] || 10;
      if (systemType === 'minisplit') laborHours *= zoneCount;
      if (ductwork === 'new') laborHours += ductworkFeet / 20;
      if (ductwork === 'repair') laborHours += ductworkFeet / 30;
      if (stories >= 2) laborHours *= 1.2;
      if (stories >= 3) laborHours *= 1.4;

      const totalMaterialCost = materialList.reduce((sum, item) => sum + item.totalCost, 0);

      return {
        trade: 'hvac',
        totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
        laborHours: Math.round(laborHours * 100) / 100,
        materialList
      };
    }

    // ============================================
    // 6. FLOORING
    // ============================================
    case 'flooring': {
      const {
        squareFeet,
        flooringType = 'carpet',
        removal = false,
        subfloorRepair = false,
        underlayment = true,
        baseboard = 0,
        complexity = 'standard'
      } = criteria;

      const wasteMultiplier = 1.10;
      const adjustedSqft = squareFeet * wasteMultiplier;

      const materialCosts = {
        'carpet': 3.50, 'vinyl': 4.00, 'laminate': 4.50,
        'hardwood_eng': 8.00, 'hardwood_solid': 12.00,
        'tile_ceramic': 6.00, 'tile_porcelain': 8.50
      };

      const laborRates = {
        'carpet': 1.50, 'vinyl': 2.00, 'laminate': 2.00,
        'hardwood_eng': 4.00, 'hardwood_solid': 4.00,
        'tile_ceramic': 5.00, 'tile_porcelain': 5.00
      };

      const materialList = [];

      // Flooring
      const costPerSqft = materialCosts[flooringType] || 4.00;
      materialList.push({
        item: `${flooringType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Flooring`,
        quantity: Math.ceil(adjustedSqft),
        unit: 'sqft',
        unitCost: costPerSqft,
        totalCost: adjustedSqft * costPerSqft,
        category: 'flooring_material'
      });

      // Underlayment
      if (underlayment && flooringType !== 'carpet') {
        materialList.push({
          item: 'Underlayment',
          quantity: squareFeet,
          unit: 'sqft',
          unitCost: 0.75,
          totalCost: squareFeet * 0.75,
          category: 'underlayment'
        });
      }

      // Removal
      if (removal) {
        materialList.push({
          item: 'Old Flooring Removal',
          quantity: squareFeet,
          unit: 'sqft',
          unitCost: 1.50,
          totalCost: squareFeet * 1.50,
          category: 'removal'
        });
      }

      // Subfloor repair
      if (subfloorRepair) {
        const repairSqft = Math.ceil(squareFeet * 0.3);
        materialList.push({
          item: 'Subfloor Repair',
          quantity: repairSqft,
          unit: 'sqft',
          unitCost: 3.00,
          totalCost: repairSqft * 3.00,
          category: 'prep'
        });
      }

      // Baseboard
      if (baseboard > 0) {
        materialList.push({
          item: 'Baseboard Trim',
          quantity: baseboard,
          unit: 'linear feet',
          unitCost: 4.00,
          totalCost: baseboard * 4.00,
          category: 'trim'
        });
      }

      // Adhesive
      materialList.push({
        item: 'Adhesive/Fasteners',
        quantity: 1,
        unit: 'set',
        unitCost: 75,
        totalCost: 75,
        category: 'adhesive'
      });

      // Labor
      const complexityMult = { 'standard': 1.0, 'moderate': 1.2, 'complex': 1.5 };
      const laborRate = laborRates[flooringType] || 2.00;
      let laborHours = (squareFeet * laborRate) / 45;
      laborHours *= complexityMult[complexity] || 1.0;
      if (removal) laborHours += squareFeet * 0.02;
      if (subfloorRepair) laborHours += squareFeet * 0.01;
      if (baseboard > 0) laborHours += baseboard / 20;

      const totalMaterialCost = materialList.reduce((sum, item) => sum + item.totalCost, 0);

      return {
        trade: 'flooring',
        totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
        laborHours: Math.round(laborHours * 100) / 100,
        materialList
      };
    }
       // ============================================
    // 7. ELECTRICAL
    // ============================================

  case 'electrical': {
    let materials = [];
  // Helper to get contractor price or default
  const getPrice = (key, defaultValue) => {
    return pricingConfig.electrical?.[key] ?? defaultValue;
  };

  const serviceType = criteria.serviceType || 'general';
  const amperage = criteria.amperage || '200';
  const squareFootage = parseFloat(criteria.squareFootage) || 0;
  const homeAge = criteria.homeAge || '1990+';
  const stories = parseInt(criteria.stories) || 1;
  const outletCount = parseInt(criteria.outletCount) || 0;
  const gfciCount = parseInt(criteria.gfciCount) || 0;
  const switchCount = parseInt(criteria.switchCount) || 0;
  const dimmerCount = parseInt(criteria.dimmerCount) || 0;
  const fixtureCount = parseInt(criteria.fixtureCount) || 0;
  const recessedCount = parseInt(criteria.recessedCount) || 0;
  const ceilingFanCount = parseInt(criteria.ceilingFanCount) || 0;
  const circuits20a = parseInt(criteria.circuits20a) || 0;
  const circuits30a = parseInt(criteria.circuits30a) || 0;
  const circuits50a = parseInt(criteria.circuits50a) || 0;
  const evCharger = criteria.evCharger;
  const permit = criteria.permit;

  const laborRate = getPrice('elec_labor_rate', 75);
  const wireLF = getPrice('elec_wire_lf', 1.00);
  const avgRunPerDevice = 25;

  // Age multiplier
  let ageMultiplier = 1.0;
  if (homeAge === 'pre-1960') ageMultiplier = 2.0;
  else if (homeAge === '1960-1990') ageMultiplier = 1.25;

  // Story multiplier
  let storyMultiplier = 1.0;
  if (stories >= 3) storyMultiplier = 1.35;
  else if (stories === 2) storyMultiplier = 1.15;

  const complexityMultiplier = ageMultiplier * storyMultiplier;
  let totalLaborHours = 0;

  // Panel pricing
  const panelCosts = {
    '100': getPrice('elec_panel_100', 450),
    '200': getPrice('elec_panel_200', 550),
    '400': getPrice('elec_panel_400', 1200)
  };
  const panelMisc = { '100': 200, '200': 250, '400': 400 };
  const panelLabor = { '100': 8, '200': 10, '400': 16 };

  // PANEL UPGRADE
  if (serviceType === 'panel') {
    const panelHours = panelLabor[amperage];
    totalLaborHours += panelHours;
    materials.push({
      item: `${amperage}A Panel Upgrade`,
      quantity: 1,
      unit: 'each',
      unitCost: panelCosts[amperage],
      totalCost: panelCosts[amperage],
      category: 'Panel'
    });
    materials.push({
      item: 'Breakers, Connectors & Misc',
      quantity: 1,
      unit: 'lot',
      unitCost: panelMisc[amperage],
      totalCost: panelMisc[amperage],
      category: 'Panel'
    });
  }

  // FULL REWIRE
  if (serviceType === 'rewire') {
    const rewireSqft = getPrice('elec_rewire_sqft', 11.50);
    const rewireTotal = squareFootage * rewireSqft;
    const rewireHours = (squareFootage / 100) * 4;
    totalLaborHours += rewireHours + panelLabor[amperage];

    materials.push({
      item: `Full Rewire (${squareFootage} sqft)`,
      quantity: squareFootage,
      unit: 'sqft',
      unitCost: rewireSqft,
      totalCost: rewireTotal,
      category: 'Rewire'
    });
    materials.push({
      item: `${amperage}A Panel`,
      quantity: 1,
      unit: 'each',
      unitCost: panelCosts[amperage],
      totalCost: panelCosts[amperage],
      category: 'Panel'
    });
    materials.push({
      item: 'Breakers, Connectors & Misc',
      quantity: 1,
      unit: 'lot',
      unitCost: panelMisc[amperage],
      totalCost: panelMisc[amperage],
      category: 'Panel'
    });
  }

  // CIRCUITS / GENERAL - Itemized
  if (serviceType === 'circuits' || serviceType === 'general') {

    // Ceiling Fans (customer provided - install labor only)
    if (ceilingFanCount > 0) {
      const ceilingFanInstall = getPrice('elec_ceiling_fan_install', 200);
      const fanHardware = 15;
      const fanWire = avgRunPerDevice * wireLF;
      const fanTotal = ceilingFanCount * (ceilingFanInstall + fanHardware + fanWire);
      totalLaborHours += ceilingFanCount * (ceilingFanInstall / laborRate);
      materials.push({
        item: 'Ceiling Fan Install (labor + hardware + wire)',
        quantity: ceilingFanCount,
        unit: 'each',
        unitCost: ceilingFanInstall + fanHardware + fanWire,
        totalCost: fanTotal,
        category: 'Lighting'
      });
    }
    
    // Standard Outlets
    if (outletCount > 0) {
      const outletPrice = getPrice('elec_outlet', 12);
      const wirePerOutlet = avgRunPerDevice * wireLF;
      const outletTotal = outletCount * (outletPrice + wirePerOutlet);
      totalLaborHours += outletCount * 0.75;
      materials.push({
        item: 'Standard Outlets (w/ wire)',
        quantity: outletCount,
        unit: 'each',
        unitCost: outletPrice + wirePerOutlet,
        totalCost: outletTotal,
        category: 'Outlets'
      });
    }

    // GFCI Outlets
    if (gfciCount > 0) {
      const gfciPrice = getPrice('elec_outlet_gfci', 35);
      const wirePerGfci = avgRunPerDevice * wireLF;
      const gfciTotal = gfciCount * (gfciPrice + wirePerGfci);
      totalLaborHours += gfciCount * 1.0;
      materials.push({
        item: 'GFCI Outlets (w/ wire)',
        quantity: gfciCount,
        unit: 'each',
        unitCost: gfciPrice + wirePerGfci,
        totalCost: gfciTotal,
        category: 'Outlets'
      });
    }

    // Standard Switches
    if (switchCount > 0) {
      const switchPrice = getPrice('elec_switch', 10);
      const wirePerSwitch = avgRunPerDevice * wireLF;
      const switchTotal = switchCount * (switchPrice + wirePerSwitch);
      totalLaborHours += switchCount * 0.5;
      materials.push({
        item: 'Standard Switches (w/ wire)',
        quantity: switchCount,
        unit: 'each',
        unitCost: switchPrice + wirePerSwitch,
        totalCost: switchTotal,
        category: 'Switches'
      });
    }

    // Dimmer Switches
    if (dimmerCount > 0) {
      const dimmerPrice = getPrice('elec_switch_dimmer', 50);
      const wirePerDimmer = avgRunPerDevice * wireLF;
      const dimmerTotal = dimmerCount * (dimmerPrice + wirePerDimmer);
      totalLaborHours += dimmerCount * 0.75;
      materials.push({
        item: 'Dimmer Switches (w/ wire)',
        quantity: dimmerCount,
        unit: 'each',
        unitCost: dimmerPrice + wirePerDimmer,
        totalCost: dimmerTotal,
        category: 'Switches'
      });
    }

    // Light Fixtures (customer provided - install labor only)
    if (fixtureCount > 0) {
      const lightInstall = getPrice('elec_light_install', 35);
      const hardwareCost = 15;
      const fixtureTotal = fixtureCount * (lightInstall + hardwareCost);
      totalLaborHours += fixtureCount * (lightInstall / laborRate);
      materials.push({
        item: 'Light Fixture Install (labor + hardware)',
        quantity: fixtureCount,
        unit: 'each',
        unitCost: lightInstall + hardwareCost,
        totalCost: fixtureTotal,
        category: 'Lighting'
      });
    }

    // Recessed Lights
    if (recessedCount > 0) {
      const recessedPrice = getPrice('elec_recessed', 55);
      const recessedTotal = recessedCount * recessedPrice;
      totalLaborHours += recessedCount * 1.5;
      materials.push({
        item: 'Recessed Lights',
        quantity: recessedCount,
        unit: 'each',
        unitCost: recessedPrice,
        totalCost: recessedTotal,
        category: 'Lighting'
      });
    }

    // 20A Circuits
    if (circuits20a > 0) {
      const circuit20Price = getPrice('elec_circuit_20a', 95);
      const circuit20Total = circuits20a * circuit20Price;
      totalLaborHours += circuits20a * 2.0;
      materials.push({
        item: '20A Dedicated Circuit',
        quantity: circuits20a,
        unit: 'each',
        unitCost: circuit20Price,
        totalCost: circuit20Total,
        category: 'Circuits'
      });
    }

    // 30A Circuits
    if (circuits30a > 0) {
      const circuit30Price = getPrice('elec_circuit_30a', 130);
      const circuit30Total = circuits30a * circuit30Price;
      totalLaborHours += circuits30a * 2.5;
      materials.push({
        item: '30A Dedicated Circuit',
        quantity: circuits30a,
        unit: 'each',
        unitCost: circuit30Price,
        totalCost: circuit30Total,
        category: 'Circuits'
      });
    }

    // 50A Circuits
    if (circuits50a > 0) {
      const circuit50Price = getPrice('elec_circuit_50a', 185);
      const circuit50Total = circuits50a * circuit50Price;
      totalLaborHours += circuits50a * 3.0;
      materials.push({
        item: '50A Dedicated Circuit',
        quantity: circuits50a,
        unit: 'each',
        unitCost: circuit50Price,
        totalCost: circuit50Total,
        category: 'Circuits'
      });
    }
  }

  // EV Charger
  if (evCharger === 'yes') {
    const evPrice = getPrice('elec_ev_charger', 350);
    const evWireRun = 100;
    totalLaborHours += 4;
    materials.push({
      item: 'EV Charger Install + Wire Run',
      quantity: 1,
      unit: 'each',
      unitCost: evPrice + evWireRun,
      totalCost: evPrice + evWireRun,
      category: 'Specialty'
    });
  }

  // Permit
  if (permit === 'yes' || permit !== 'no') {
    const permitPrice = getPrice('elec_permit', 200);
    materials.push({
      item: 'Electrical Permit',
      quantity: 1,
      unit: 'each',
      unitCost: permitPrice,
      totalCost: permitPrice,
      category: 'Permit'
    });
  }

  // Equipment & Consumables
  materials.push({
    item: 'Equipment & Consumables',
    quantity: 1,
    unit: 'lot',
    unitCost: 150,
    totalCost: 150,
    category: 'Equipment'
  });

  // Apply complexity multiplier to labor
  totalLaborHours *= complexityMultiplier;
  if (totalLaborHours < 2) totalLaborHours = 2;

  // Add labor line
  const laborCost = totalLaborHours * laborRate;
  materials.push({
    item: `Labor (${homeAge} home, ${stories}-story)`,
    quantity: Math.round(totalLaborHours * 100) / 100,
    unit: 'hours',
    unitCost: laborRate,
    totalCost: Math.round(laborCost * 100) / 100,
    category: 'Labor'
  });

  break;
}

    // ============================================
// DRYWALL - SYNCED WITH FORM & SERVER.JS
// ============================================
case 'drywall': {
  const {
    squareFeet = 0,
    projectType = 'new_construction',
    rooms = 1,
    ceilingHeight = '8ft',
    finishLevel = 'level_3_standard',
    textureType = 'none',
    damageExtent = 'minor'
  } = criteria;

  const materialList = [];
  let laborHours = 0;
  
  const sqft = parseFloat(squareFeet) || 0;
  const roomCount = parseInt(rooms) || 1;
  const ceilHeight = parseInt(ceilingHeight) || 8;
  const pType = projectType.toLowerCase();
  const fLevel = finishLevel.toLowerCase();
  const tType = textureType.toLowerCase();
  const damage = damageExtent.toLowerCase();
  
  // Pricing defaults (should match dashboard)
  const prices = {
    sheet_half: 12.00,
    joint_compound: 18.00,
    tape: 8.00,
    screws: 12.00,
    corner_bead: 5.00,
    labor_rate: 55.00,
    hang_sqft: 0.75,
    tape_sqft: 0.65,
    sand_sqft: 0.35,
    finish_3: 1.0,
    finish_4: 1.25,
    finish_5: 1.50,
    texture_orange_peel: 0.80,
    texture_knockdown: 1.00,
    texture_popcorn: 0.65,
    ceiling_10: 1.15,
    ceiling_12: 1.30,
    repair_minor: 175,
    repair_moderate: 400,
    repair_extensive: 900
  };
  
  // ===== NEW CONSTRUCTION =====
  if (pType === 'new_construction') {
    const wasteMultiplier = 1.12;
    const adjustedSqft = sqft * wasteMultiplier;
    const sheetsNeeded = Math.ceil(adjustedSqft / 32);
    
    // Drywall sheets
    materialList.push({
      item: 'Drywall Sheets (4x8, 1/2")',
      quantity: sheetsNeeded,
      unit: 'sheets',
      unitCost: prices.sheet_half,
      totalCost: sheetsNeeded * prices.sheet_half,
      category: 'Materials'
    });
    
    // Joint compound
    const compoundBuckets = Math.ceil(sheetsNeeded / 4);
    materialList.push({
      item: 'Joint Compound',
      quantity: compoundBuckets,
      unit: 'buckets',
      unitCost: prices.joint_compound,
      totalCost: compoundBuckets * prices.joint_compound,
      category: 'Materials'
    });
    
    // Tape
    const tapeRolls = Math.ceil(sheetsNeeded / 8);
    materialList.push({
      item: 'Drywall Tape',
      quantity: tapeRolls,
      unit: 'rolls',
      unitCost: prices.tape,
      totalCost: tapeRolls * prices.tape,
      category: 'Materials'
    });
    
    // Screws
    const screwBoxes = Math.ceil(sheetsNeeded / 5);
    materialList.push({
      item: 'Drywall Screws',
      quantity: screwBoxes,
      unit: 'boxes',
      unitCost: prices.screws,
      totalCost: screwBoxes * prices.screws,
      category: 'Materials'
    });
    
    // Corner beads
    const cornerBeads = Math.ceil(roomCount * 4);
    materialList.push({
      item: 'Corner Beads (8ft)',
      quantity: cornerBeads,
      unit: 'pieces',
      unitCost: prices.corner_bead,
      totalCost: cornerBeads * prices.corner_bead,
      category: 'Materials'
    });
    
    // Calculate labor
    let laborCost = sqft * (prices.hang_sqft + prices.tape_sqft + prices.sand_sqft);
    
    // Finish level multiplier
    let finishMult = prices.finish_3;
    let finishLabel = 'Level 3 Standard';
    if (fLevel === 'level_4_smooth') {
      finishMult = prices.finish_4;
      finishLabel = 'Level 4 Smooth';
    } else if (fLevel === 'level_5_glass') {
      finishMult = prices.finish_5;
      finishLabel = 'Level 5 Glass';
    }
    laborCost *= finishMult;
    
    // Ceiling height multiplier
    let heightLabel = '';
    if (ceilHeight >= 12) {
      laborCost *= prices.ceiling_12;
      heightLabel = ', 12ft+ ceilings';
    } else if (ceilHeight >= 10) {
      laborCost *= prices.ceiling_10;
      heightLabel = ', 10ft ceilings';
    }
    
    laborHours = laborCost / prices.labor_rate;
    
    // Texture
    if (tType !== 'none') {
      let textureCost = 0;
      let textureLabel = '';
      
      if (tType === 'orange_peel') {
        textureCost = sqft * prices.texture_orange_peel;
        textureLabel = 'Orange Peel';
      } else if (tType === 'knockdown') {
        textureCost = sqft * prices.texture_knockdown;
        textureLabel = 'Knockdown';
      } else if (tType === 'popcorn') {
        textureCost = sqft * prices.texture_popcorn;
        textureLabel = 'Popcorn';
      }
      
      materialList.push({
        item: `${textureLabel} Texture`,
        quantity: sqft,
        unit: 'sqft',
        unitCost: textureCost / sqft,
        totalCost: textureCost,
        category: 'Texture'
      });
      
      laborHours += textureCost / prices.labor_rate;
    }
    
    // Labor line item
    materialList.push({
      item: `Installation Labor (${finishLabel}${heightLabel})`,
      quantity: Math.round(laborHours * 10) / 10,
      unit: 'hours',
      unitCost: prices.labor_rate,
      totalCost: laborHours * prices.labor_rate,
      category: 'Labor'
    });
    
  // ===== REPAIR =====
  } else if (pType === 'repair') {
    let repairCost = prices.repair_minor;
    let repairLabel = 'Minor';
    
    if (damage === 'moderate') {
      repairCost = prices.repair_moderate;
      repairLabel = 'Moderate';
    } else if (damage === 'extensive') {
      repairCost = prices.repair_extensive;
      repairLabel = 'Extensive';
    }
    
    materialList.push({
      item: `Drywall Repair - ${repairLabel}`,
      quantity: 1,
      unit: 'job',
      unitCost: repairCost,
      totalCost: repairCost,
      category: 'Repair'
    });
    
    laborHours = (repairCost * 0.7) / prices.labor_rate;
    
    // Texture matching for repairs
    if (tType !== 'none') {
      const repairSqft = Math.min(sqft, 100);
      let textureCost = 0;
      let textureLabel = '';
      
      if (tType === 'orange_peel') {
        textureCost = repairSqft * prices.texture_orange_peel;
        textureLabel = 'Orange Peel';
      } else if (tType === 'knockdown') {
        textureCost = repairSqft * prices.texture_knockdown;
        textureLabel = 'Knockdown';
      } else if (tType === 'popcorn') {
        textureCost = repairSqft * prices.texture_popcorn;
        textureLabel = 'Popcorn';
      }
      
      materialList.push({
        item: `${textureLabel} Texture Match`,
        quantity: repairSqft,
        unit: 'sqft',
        unitCost: textureCost / repairSqft,
        totalCost: textureCost,
        category: 'Texture'
      });
      
      laborHours += textureCost / prices.labor_rate;
    }
  }
  
  const totalMaterialCost = materialList.reduce((sum, item) => sum + item.totalCost, 0);
  
  return {
    trade: 'drywall',
    totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
    laborHours: Math.round(laborHours * 10) / 10,
    materialList
  };
}

 default:
      return {
        trade: trade,
        totalMaterialCost: 0,
        laborHours: 0,
        materialList: [],
        error: `Unknown trade: ${trade}`
      };
  }
}


// Export for use in server.js
module.exports = { generateMaterialList };