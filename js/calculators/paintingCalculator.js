// Enhanced Painting Calculator
function calculatePaintingEnhanced(criteria) {
  const {
    squareFeet,
    surface = 'exterior',     // interior/exterior
    stories = 1,              // 1, 2, 3+
    condition = 'good',       // good/fair/poor
    coats = 2,                // 1 or 2
    trim = 0,                 // linear feet
    doors = 0,                // number of doors
    ceilings = false,         // paint ceilings? (interior only)
    primer = true             // need primer?
  } = criteria;

  // === PAINT CALCULATION ===
  const coveragePerGallon = surface === 'exterior' ? 300 : 350; // sqft per gallon
  const wasteMultiplier = 1.15; // 15% waste
  
  const gallonsNeeded = Math.ceil((squareFeet * coats * wasteMultiplier) / coveragePerGallon);
  const primerGallons = primer ? Math.ceil(gallonsNeeded * 0.5) : 0;

  // === MATERIAL COSTS ===
  const paintUnitCost = surface === 'exterior' ? 45.00 : 38.00;
  const primerUnitCost = 35.00;
  
  const paintCost = gallonsNeeded * paintUnitCost;
  const primerCost = primerGallons * primerUnitCost;

  // === SUPPLIES ===
  const brushesRollers = 75; // Base supplies cost
  const dropClothsTape = 50;
  const suppliesCost = brushesRollers + dropClothsTape;

  // === LABOR HOURS ===
  // Base: 350 sqft per gallon, 1.5 hours per gallon coverage
  let laborHoursPerGallon = 1.5;
  
  // Condition multiplier
  const conditionMultipliers = {
    'good': 1.0,
    'fair': 1.3,    // More prep work
    'poor': 1.6     // Extensive prep/repair
  };
  
  // Story multiplier (exterior only)
  const storyMultipliers = {
    1: 1.0,
    2: 1.3,
    3: 1.6
  };
  
  let totalLaborHours = gallonsNeeded * laborHoursPerGallon * coats;
  totalLaborHours *= conditionMultipliers[condition] || 1.0;
  
  if (surface === 'exterior') {
    totalLaborHours *= storyMultipliers[stories] || 1.0;
  }
  
  // ADD PREP TIME
  if (primer) {
    totalLaborHours += gallonsNeeded * 0.5; // Priming time
  }
  
  // ADD TRIM
  if (trim > 0) {
    totalLaborHours += (trim / 50) * 1.0; // 50 linear ft per hour
  }
  
  // ADD DOORS
  if (doors > 0) {
    totalLaborHours += doors * 0.75; // 45 min per door
  }
  
  // ADD CEILINGS (interior only)
  if (ceilings && surface === 'interior') {
    const ceilingGallons = Math.ceil((squareFeet * wasteMultiplier) / coveragePerGallon);
    totalLaborHours += ceilingGallons * 1.2; // Slower work
  }

  // === MATERIAL LIST ===
  const materialList = [
    {
      item: `${surface === 'exterior' ? 'Exterior' : 'Interior'} Paint`,
      quantity: gallonsNeeded,
      unit: 'gallons',
      unitCost: paintUnitCost,
      totalCost: paintCost,
      category: 'paint'
    }
  ];

  if (primer) {
    materialList.push({
      item: 'Primer',
      quantity: primerGallons,
      unit: 'gallons',
      unitCost: primerUnitCost,
      totalCost: primerCost,
      category: 'paint'
    });
  }

  materialList.push({
    item: 'Brushes & Rollers',
    quantity: 1,
    unit: 'set',
    unitCost: brushesRollers,
    totalCost: brushesRollers,
    category: 'supplies'
  });

  materialList.push({
    item: 'Drop Cloths & Tape',
    quantity: 1,
    unit: 'set',
    unitCost: dropClothsTape,
    totalCost: dropClothsTape,
    category: 'supplies'
  });

  const totalMaterialCost = materialList.reduce((sum, item) => sum + item.totalCost, 0);

  return {
    totalMaterialCost: Math.round(totalMaterialCost * 100) / 100,
    laborHours: Math.round(totalLaborHours * 100) / 100,
    materialList: materialList,
    breakdown: {
      squareFeet,
      surface,
      coats,
      condition,
      stories,
      gallonsNeeded,
      primerGallons
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculatePaintingEnhanced };
}
