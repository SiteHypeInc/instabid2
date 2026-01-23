// ============================================
// MATERIAL LIST GENERATION - ALL 8 TRADES
// Add this to server.js after the estimate calculation logic
// ============================================

function generateMaterialList(trade, criteria, contractorId = null) {
  
  switch(trade.toLowerCase()) {
    
    // ============================================
    // 1. ROOFING
    // ============================================
    case 'roofing': {
      const {
        squareFeet,
        pitch = 'medium',
        tearoff = false,
        layers = 1,
        chimneys = 0,
        skylights = 0,
        valleys = 0,
        plywoodSheets = 0
      } = criteria;

      const pitchMultipliers = {
        'low': 1.0, 'medium': 1.1, 'steep': 1.2, 'very_steep': 1.3,
        '4/12': 1.05, '6/12': 1.12, '8/12': 1.20, '12/12': 1.40
      };
      const pitchMult = pitchMultipliers[pitch] || 1.1;
      const linearFeet = Math.sqrt(squareFeet) * 4;
      const adjustedSqft = squareFeet * pitchMult * 1.12; // 12% waste

      const materialList = [];

      // Shingles
      const bundles = Math.ceil(adjustedSqft / 33.3);
      materialList.push({
        item: 'Asphalt Shingles',
        quantity: bundles,
        unit: 'bundles',
        unitCost: 44.96,
        totalCost: bundles * 44.96,
        category: 'shingles'
      });

      // Underlayment
      const underlaymentRolls = Math.ceil(squareFeet / 400);
      materialList.push({
        item: 'Underlayment',
        quantity: underlaymentRolls,
        unit: 'rolls',
        unitCost: 45.00,
        totalCost: underlaymentRolls * 45.00,
        category: 'underlayment'
      });

      // Nails
      const nailBoxes = Math.ceil((squareFeet * 4) / 7500);
      materialList.push({
        item: 'Roofing Nails',
        quantity: nailBoxes,
        unit: 'boxes',
        unitCost: 85.00,
        totalCost: nailBoxes * 85.00,
        category: 'fasteners'
      });

      // Starter shingles
      materialList.push({
        item: 'Starter Shingles',
        quantity: Math.ceil(linearFeet),
        unit: 'linear ft',
        unitCost: 2.50,
        totalCost: linearFeet * 2.50,
        category: 'shingles'
      });

      // Ridge cap
      const ridgeFeet = linearFeet * 0.25;
      materialList.push({
        item: 'Ridge Cap',
        quantity: Math.ceil(ridgeFeet),
        unit: 'linear ft',
        unitCost: 3.00,
        totalCost: ridgeFeet * 3.00,
        category: 'shingles'
      });

      // Drip edge
      materialList.push({
        item: 'Drip Edge',
        quantity: Math.ceil(linearFeet),
        unit: 'linear ft',
        unitCost: 2.75,
        totalCost: linearFeet * 2.75,
        category: 'flashing'
      });

      // Ice & water shield
      const iceWaterFeet = (valleys * 20) + (linearFeet * 0.2);
      materialList.push({
        item: 'Ice & Water Shield',
        quantity: Math.ceil(iceWaterFeet),
        unit: 'linear ft',
        unitCost: 4.50,
        totalCost: iceWaterFeet * 4.50,
        category: 'underlayment'
      });

      // Ventilation
      const vents = Math.ceil(squareFeet / 150);
      materialList.push({
        item: 'Roof Vents',
        quantity: vents,
        unit: 'vents',
        unitCost: 25.00,
        totalCost: vents * 25.00,
        category: 'ventilation'
      });

      // OSB (tearoff only, user-specified)
      if (tearoff && plywoodSheets > 0) {
        materialList.push({
          item: 'OSB Sheathing',
          quantity: plywoodSheets,
          unit: 'sheets',
          unitCost: 28.00,
          totalCost: plywoodSheets * 28.00,
          category: 'sheathing'
        });
      }

      // Disposal (tearoff only)
      if (tearoff) {
        const dumpsterLoads = Math.ceil(squareFeet / 100) * layers;
        materialList.push({
          item: 'Disposal/Dumpster',
          quantity: dumpsterLoads,
          unit: 'loads',
          unitCost: 75.00,
          totalCost: dumpsterLoads * 75.00,
          category: 'disposal'
        });
      }

      // Labor hours
      let laborHours = squareFeet / 100 * 2; // Base: 2 hrs per 100 sqft
      laborHours *= pitchMult;
      if (tearoff) laborHours += squareFeet / 100 * 1.5;

      // Complexity multiplier (applied to total only)
      const complexityMult = Math.min(1.3, 1 + (chimneys * 0.05) + (skylights * 0.03) + (valleys * 0.04));

      const totalMaterialCost = materialList.reduce((sum, item) => sum + item.totalCost, 0);

      return {
        trade: 'roofing',
        totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
        laborHours: Math.round(laborHours * 100) / 100,
        complexityMultiplier: complexityMult,
        materialList
      };
    }

    // ============================================
    // 2. SIDING
    // ============================================
    case 'siding': {
      const {
        squareFeet,
        sidingType = 'vinyl',
        stories = 1,
        removal = false,
        windowCount = 0
      } = criteria;

      const wasteMultiplier = 1.12;
      const adjustedSqft = squareFeet * wasteMultiplier;
      const trim = Math.sqrt(squareFeet) * 4;

      const materialCosts = {
        'vinyl': 5.50,
        'fiber_cement': 9.50,
        'wood': 14.00,
        'metal': 8.00,
        'stucco': 11.00
      };

      const laborCosts = {
        'vinyl': 3.50,
        'fiber_cement': 5.50,
        'wood': 6.50,
        'metal': 4.50,
        'stucco': 7.50
      };

      const materialList = [];

      // Siding material
      const sidingCostPerSqft = materialCosts[sidingType] || 5.50;
      materialList.push({
        item: `${sidingType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Siding`,
        quantity: Math.ceil(adjustedSqft),
        unit: 'sqft',
        unitCost: sidingCostPerSqft,
        totalCost: adjustedSqft * sidingCostPerSqft,
        category: 'siding_material'
      });

      // House wrap
      materialList.push({
        item: 'House Wrap',
        quantity: squareFeet,
        unit: 'sqft',
        unitCost: 0.50,
        totalCost: squareFeet * 0.50,
        category: 'house_wrap'
      });

      // Trim & J-Channel
      materialList.push({
        item: 'Trim & J-Channel',
        quantity: Math.ceil(trim),
        unit: 'linear ft',
        unitCost: 5.50,
        totalCost: trim * 5.50,
        category: 'trim'
      });

      // Window wrapping
      if (windowCount > 0) {
        materialList.push({
          item: 'Window Trim & Wrapping',
          quantity: windowCount,
          unit: 'windows',
          unitCost: 55.00,
          totalCost: windowCount * 55.00,
          category: 'trim'
        });
      }

      // Fasteners kit
      materialList.push({
        item: 'Fasteners, Flashing & Caulk',
        quantity: 1,
        unit: 'kit',
        unitCost: 175.00,
        totalCost: 175.00,
        category: 'fasteners'
      });

      // Removal
      if (removal) {
        materialList.push({
          item: 'Old Siding Removal & Disposal',
          quantity: squareFeet,
          unit: 'sqft',
          unitCost: 1.75,
          totalCost: squareFeet * 1.75,
          category: 'removal'
        });
      }

      // Labor
      const laborRate = laborCosts[sidingType] || 3.50;
      let laborHours = (squareFeet * laborRate) / 45; // Assuming $45/hr
      if (stories >= 2) laborHours *= 1.25;
      if (stories >= 3) laborHours *= 1.5;
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