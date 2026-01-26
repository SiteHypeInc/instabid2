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
    // 3. PLUMBING
    // ============================================
    case 'plumbing': {
      const {
        serviceType = 'fixture',
        fixtureType = 'toilet',
        fixtureCount = 1,
        squareFeet = 0,
        pipeType = 'PEX',
        waterHeaterType = 'tank',
        drainLength = 0,
        sewerLength = 0,
        homeAge = 'modern'
      } = criteria;

      let laborHours = 0;
      const materialList = [];

      // Fixtures
      if (serviceType === 'fixture') {
        const fixtureCosts = {
          'toilet': 350, 'sink': 400, 'shower': 1200, 'tub': 1500, 'dishwasher': 300
        };
        const laborPerFixture = {
          'toilet': 3, 'sink': 2.5, 'shower': 6, 'tub': 8, 'dishwasher': 2
        };

        materialList.push({
          item: `${fixtureType.charAt(0).toUpperCase() + fixtureType.slice(1)} Installation`,
          quantity: fixtureCount,
          unit: 'fixtures',
          unitCost: fixtureCosts[fixtureType] || 350,
          totalCost: (fixtureCosts[fixtureType] || 350) * fixtureCount,
          category: 'fixtures'
        });

        laborHours = (laborPerFixture[fixtureType] || 3) * fixtureCount;
      }

      // Repipe
      if (serviceType === 'repipe' && squareFeet > 0) {
        const pipeFeet = squareFeet * 0.5;
        const pipeCosts = { 'PEX': 2.50, 'copper': 4.50, 'PVC': 1.50 };
        const pipeCostPerFoot = pipeCosts[pipeType] || 2.50;

        materialList.push({
          item: `${pipeType} Pipe`,
          quantity: Math.ceil(pipeFeet),
          unit: 'linear feet',
          unitCost: pipeCostPerFoot,
          totalCost: pipeFeet * pipeCostPerFoot,
          category: 'pipes'
        });

        const fittingsCost = pipeFeet * pipeCostPerFoot * 0.3;
        materialList.push({
          item: 'Fittings & Valves',
          quantity: 1,
          unit: 'set',
          unitCost: fittingsCost,
          totalCost: fittingsCost,
          category: 'fittings'
        });

        laborHours = (squareFeet / 100) * 4;
        if (homeAge === 'old') laborHours *= 1.3;
      }

      // Water heater
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

      // Drain
      if (serviceType === 'drain' && drainLength > 0) {
        materialList.push({
          item: 'Drain Cleaning',
          quantity: drainLength,
          unit: 'linear feet',
          unitCost: 250 / drainLength,
          totalCost: 250,
          category: 'drains'
        });
        laborHours = 2;
      }

      // Sewer
      if (serviceType === 'sewer' && sewerLength > 0) {
        materialList.push({
          item: 'Sewer Line Replacement',
          quantity: sewerLength,
          unit: 'linear feet',
          unitCost: 125,
          totalCost: sewerLength * 125,
          category: 'drains'
        });
        laborHours = sewerLength / 10;
      }

      // Misc supplies
      materialList.push({
        item: 'Misc Plumbing Supplies',
        quantity: 1,
        unit: 'set',
        unitCost: 100,
        totalCost: 100,
        category: 'supplies'
      });

      const totalMaterialCost = materialList.reduce((sum, item) => sum + item.totalCost, 0);

      return {
        trade: 'plumbing',
        totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
        laborHours: Math.round(laborHours * 100) / 100,
        materialList
      };
    }

    // ============================================
    // 4. PAINTING
    // ============================================
    case 'painting': {
      const {
        squareFeet,
        surface = 'exterior',
        stories = 1,
        condition = 'good',
        coats = 2,
        trim = 0,
        doors = 0,
        ceilings = false,
        primer = true
      } = criteria;

      const coveragePerGallon = surface === 'exterior' ? 300 : 350;
      const wasteMultiplier = 1.15;
      const gallonsNeeded = Math.ceil((squareFeet * coats * wasteMultiplier) / coveragePerGallon);
      const primerGallons = primer ? Math.ceil(gallonsNeeded * 0.5) : 0;

      const paintUnitCost = surface === 'exterior' ? 45.00 : 38.00;
      const materialList = [];

      // Paint
      materialList.push({
        item: `${surface === 'exterior' ? 'Exterior' : 'Interior'} Paint`,
        quantity: gallonsNeeded,
        unit: 'gallons',
        unitCost: paintUnitCost,
        totalCost: gallonsNeeded * paintUnitCost,
        category: 'paint'
      });

      // Primer
      if (primer) {
        materialList.push({
          item: 'Primer',
          quantity: primerGallons,
          unit: 'gallons',
          unitCost: 35.00,
          totalCost: primerGallons * 35.00,
          category: 'paint'
        });
      }

      // Supplies
      materialList.push({
        item: 'Brushes & Rollers',
        quantity: 1,
        unit: 'set',
        unitCost: 75,
        totalCost: 75,
        category: 'supplies'
      });

      materialList.push({
        item: 'Drop Cloths & Tape',
        quantity: 1,
        unit: 'set',
        unitCost: 50,
        totalCost: 50,
        category: 'supplies'
      });

      // Labor
      const conditionMult = { 'good': 1.0, 'fair': 1.3, 'poor': 1.6 };
      const storyMult = { 1: 1.0, 2: 1.3, 3: 1.6 };

      let laborHours = gallonsNeeded * 1.5 * coats;
      laborHours *= conditionMult[condition] || 1.0;
      if (surface === 'exterior') laborHours *= storyMult[stories] || 1.0;
      if (primer) laborHours += gallonsNeeded * 0.5;
      if (trim > 0) laborHours += trim / 50;
      if (doors > 0) laborHours += doors * 0.75;
      if (ceilings && surface === 'interior') {
        const ceilingGallons = Math.ceil((squareFeet * wasteMultiplier) / coveragePerGallon);
        laborHours += ceilingGallons * 1.2;
      }

      const totalMaterialCost = materialList.reduce((sum, item) => sum + item.totalCost, 0);

      return {
        trade: 'painting',
        totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
        laborHours: Math.round(laborHours * 100) / 100,
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
      const {
        serviceType = 'panel',
        amperage = 200,
        squareFeet = 0,
        outletCount = 0,
        switchCount = 0,
        fixtureCount = 0,
        evCharger = false,
        homeAge = 'modern'
      } = criteria;

      let laborHours = 0;
      const materialList = [];

      // Panel
      if (serviceType === 'panel' || serviceType === 'panel_upgrade') {
        const panelCosts = { 100: 1800, 200: 2500, 400: 3500 };
        const panelLabor = { 100: 8, 200: 10, 400: 14 };

        materialList.push({
          item: `${amperage}A Electrical Panel`,
          quantity: 1,
          unit: 'panel',
          unitCost: panelCosts[amperage] || 2500,
          totalCost: panelCosts[amperage] || 2500,
          category: 'panels'
        });

        laborHours = panelLabor[amperage] || 10;
      }

      // Rewire
      if (serviceType === 'rewire' && squareFeet > 0) {
        const wireFeet = squareFeet * 4;
        materialList.push({
          item: 'Romex Wire (14/2, 12/2)',
          quantity: wireFeet,
          unit: 'feet',
          unitCost: 0.75,
          totalCost: wireFeet * 0.75,
          category: 'wire'
        });

        laborHours = (squareFeet / 100) * 3;
        if (homeAge === 'old') laborHours *= 1.4;
      }

      // Outlets
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

      // Switches
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

      // Fixtures
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

      // EV Charger
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

      // Breakers & misc
      materialList.push({
        item: 'Breakers & Misc Supplies',
        quantity: 1,
        unit: 'set',
        unitCost: 150,
        totalCost: 150,
        category: 'breakers'
      });

      const totalMaterialCost = materialList.reduce((sum, item) => sum + item.totalCost, 0);

      return {
        trade: 'electrical',
        totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
        laborHours: Math.round(laborHours * 100) / 100,
        materialList
      };
    }

    // ============================================
    // 8. DRYWALL
    // ============================================
    case 'drywall': {
      const {
        squareFeet,
        serviceType = 'installation',
        sheetSize = '4x8',
        thickness = '1/2',
        finishLevel = 'smooth',
        ceilingHeight = 8,
        repairSize = 'small',
        removal = false
      } = criteria;

      const wasteMultiplier = 1.15;
      const adjustedSqft = squareFeet * wasteMultiplier;
      const sheetSizes = { '4x8': 32, '4x10': 40, '4x12': 48 };
      const sqftPerSheet = sheetSizes[sheetSize] || 32;
      const sheetsNeeded = Math.ceil(adjustedSqft / sqftPerSheet);

      let laborHours = 0;
      const materialList = [];

      // Installation
      if (serviceType === 'installation') {
        const sheetCost = thickness === '5/8' ? 18 : 15;

        materialList.push({
          item: `Drywall Sheets (${sheetSize}, ${thickness}")`,
          quantity: sheetsNeeded,
          unit: 'sheets',
          unitCost: sheetCost,
          totalCost: sheetsNeeded * sheetCost,
          category: 'drywall_sheets'
        });

        // Joint compound
        const compoundBuckets = Math.ceil(adjustedSqft / 200);
        materialList.push({
          item: 'Joint Compound',
          quantity: compoundBuckets,
          unit: 'buckets',
          unitCost: 18,
          totalCost: compoundBuckets * 18,
          category: 'joint_compound'
        });

        // Tape
        const tapeRolls = Math.ceil(adjustedSqft / 300);
        materialList.push({
          item: 'Drywall Tape',
          quantity: tapeRolls,
          unit: 'rolls',
          unitCost: 8,
          totalCost: tapeRolls * 8,
          category: 'tape'
        });

        // Screws
        const screwBoxes = Math.ceil(sheetsNeeded / 10);
        materialList.push({
          item: 'Drywall Screws',
          quantity: screwBoxes,
          unit: 'boxes',
          unitCost: 12,
          totalCost: screwBoxes * 12,
          category: 'fasteners'
        });

        // Corner beads
        const cornerBeads = Math.ceil(ceilingHeight * 4 / 8);
        materialList.push({
          item: 'Corner Beads',
          quantity: cornerBeads,
          unit: 'pieces',
          unitCost: 5,
          totalCost: cornerBeads * 5,
          category: 'trim'
        });

        // Labor
        laborHours = (squareFeet * 0.02) + (squareFeet * 0.03) + (squareFeet * (finishLevel === 'smooth' ? 0.015 : 0.01));
        if (ceilingHeight >= 10) laborHours *= 1.2;
        if (finishLevel === 'smooth') laborHours *= 1.3;
      }

      // Repair
      if (serviceType === 'repair') {
        const repairCosts = { 'small': 75, 'moderate': 200, 'extensive': 500 };
        const repairLabor = { 'small': 2, 'moderate': 4, 'extensive': 8 };

        materialList.push({
          item: `Drywall Repair (${repairSize})`,
          quantity: 1,
          unit: 'repair',
          unitCost: repairCosts[repairSize] || 75,
          totalCost: repairCosts[repairSize] || 75,
          category: 'repair'
        });

        laborHours = repairLabor[repairSize] || 2;
      }

      // Finishing only
      if (serviceType === 'finishing') {
        const compoundBuckets = Math.ceil(squareFeet / 200);
        materialList.push({
          item: 'Joint Compound',
          quantity: compoundBuckets,
          unit: 'buckets',
          unitCost: 18,
          totalCost: compoundBuckets * 18,
          category: 'joint_compound'
        });
        laborHours = squareFeet * 0.03;
      }

      // Texturing
      if (serviceType === 'texturing') {
        materialList.push({
          item: 'Texture Material',
          quantity: squareFeet,
          unit: 'sqft',
          unitCost: 0.75,
          totalCost: squareFeet * 0.75,
          category: 'texture'
        });
        laborHours = squareFeet * 0.015;
      }

      // Removal
      if (removal) {
        materialList.push({
          item: 'Drywall Removal & Disposal',
          quantity: squareFeet,
          unit: 'sqft',
          unitCost: 1.00,
          totalCost: squareFeet * 1.00,
          category: 'removal'
        });
        laborHours += squareFeet * 0.015;
      }

      const totalMaterialCost = materialList.reduce((sum, item) => sum + item.totalCost, 0);

      return {
        trade: 'drywall',
        totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
        laborHours: Math.round(laborHours * 100) / 100,
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