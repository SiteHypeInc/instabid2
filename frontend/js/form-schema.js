// frontend/js/form-schema.js
const TRADE_FORM_SCHEMA = {
  /*"roofing": {
    "displayName": "Roofing",
    "fields": [
      {
        "name": "squareFeet",
        "label": "Square Footage",
        "type": "number",
        "required": true,
        "min": 100,
        "placeholder": "e.g., 2000"
      },
      {
        "name": "pitch",
        "label": "Roof Pitch",
        "type": "select",
        "required": true,
        "options": [
          { "value": 1.0, "label": "Low (4/12 or less)" },
          { "value": 1.2, "label": "Medium (5/12 to 8/12)" },
          { "value": 1.5, "label": "Steep (9/12 or more)" }
        ]
      },
      {
        "name": "stories",
        "label": "Number of Stories",
        "type": "select",
        "required": true,
        "options": [
          { "value": 1.0, "label": "1 Story" },
          { "value": 1.15, "label": "2 Stories" },
          { "value": 1.3, "label": "3+ Stories" }
        ]
      },
      {
        "name": "tearOff",
        "label": "Tear-Off Required?",
        "type": "boolean",
        "required": true
      },
      {
        "name": "materialRate",
        "label": "Material Rate ($/sqft)",
        "type": "number",
        "required": true,
        "min": 1,
        "placeholder": "e.g., 4.50"
      },
      {
        "name": "complexityFactors",
        "label": "Complexity Factors",
        "type": "multiselect",
        "options": [
          { "value": "valleys", "label": "Valleys (+$800)", "cost": 800 },
          { "value": "chimneys", "label": "Chimneys (+$600)", "cost": 600 },
          { "value": "skylights", "label": "Skylights (+$1200)", "cost": 1200 }
        ]
      }
    ]
  },*/

  "roofing": {
  "displayName": "Roofing",
  "fields": [
    {
      "name": "squareFeet",
      "label": "Square Footage",
      "type": "number",
      "required": true,
      "min": 100,
      "placeholder": "e.g., 2000"
    },
    {
      "name": "pitch",
      "label": "Roof Pitch",
      "type": "select",
      "required": true,
      "options": [
        { "value": "1.0", "label": "Low (4/12 or less)" },
        { "value": "1.2", "label": "Medium (5/12 to 8/12)" },
        { "value": "1.5", "label": "Steep (9/12 or more)" }
      ]
    },
    {
  "name": "material",
  "label": "Roofing Material",
  "type": "select",
  "required": true,
  "options": [
    { "value": "", "label": "Select..." },
    { "value": "asphalt", "label": "Asphalt Shingles" },
    { "value": "architectural", "label": "Architectural Shingles" },
    { "value": "metal", "label": "Metal" },
    { "value": "tile", "label": "Tile" },
    { "value": "wood_shake", "label": "Wood Shake" }
  ]
},
    {
      "name": "stories",
      "label": "Number of Stories",
      "type": "select",
      "required": true,
      "options": [
        { "value": "1", "label": "1 Story" },
        { "value": "2", "label": "2 Stories" },
        { "value": "3", "label": "3+ Stories" }
      ]
    },
    {
      "name": "layers",
      "label": "Layers to Remove",
      "type": "select",
      "required": true,
      "options": [
        { "value": "0", "label": "New Construction (0)" },
        { "value": "1", "label": "1 Layer" },
        { "value": "2", "label": "2 Layers" },
        { "value": "3", "label": "3+ Layers" }
      ]
    },
    {
      "name": "chimneys",
      "label": "Number of Chimneys",
      "type": "number",
      "required": false,
      "min": 0,
      "placeholder": "0"
    },
    {
      "name": "valleys",
      "label": "Number of Valleys",
      "type": "number",
      "required": true,
      "min": 0,
      "placeholder": "0"
    }
  ]
},

  
  "hvac": {
    "displayName": "HVAC",
    "fields": [
      {
        "name": "squareFeet",
        "label": "Square Footage",
        "type": "number",
        "required": true,
        "min": 100
      },
      {
        "name": "zones",
        "label": "Number of Zones",
        "type": "number",
        "required": true,
        "min": 1,
        "max": 10
      },
      {
        "name": "systemType",
        "label": "System Type",
        "type": "select",
        "required": true,
        "options": [
          { "value": "central", "label": "Central Air" },
          { "value": "minisplit", "label": "Mini-Split" },
          { "value": "heatpump", "label": "Heat Pump" },
          { "value": "geothermal", "label": "Geothermal" }
        ]
      },
      {
        "name": "ductwork",
        "label": "Ductwork",
        "type": "select",
        "required": true,
        "options": [
          { "value": "none", "label": "No Ductwork" },
          { "value": "new", "label": "New Ductwork" },
          { "value": "replacement", "label": "Replace Existing" }
        ]
      },
      {
        "name": "existingRemoval",
        "label": "Remove Existing System?",
        "type": "boolean",
        "required": true
      },
      {
        "name": "thermostatType",
        "label": "Thermostat Type",
        "type": "select",
        "required": true,
        "options": [
          { "value": "programmable", "label": "Programmable" },
          { "value": "smart", "label": "Smart Thermostat" }
        ]
      }
    ]
  },
  "electrical": {
    "displayName": "Electrical",
    "fields": [
      {
        "name": "squareFeet",
        "label": "Square Footage",
        "type": "number",
        "required": true,
        "min": 100
      },
      {
        "name": "panelUpgrade",
        "label": "Panel Upgrade",
        "type": "select",
        "required": true,
        "options": [
          { "value": "none", "label": "No Upgrade" },
          { "value": "100A", "label": "100 Amp Panel" },
          { "value": "200A", "label": "200 Amp Panel" },
          { "value": "400A", "label": "400 Amp Panel" }
        ]
      },
      {
        "name": "newCircuits",
        "label": "New Circuits",
        "type": "number",
        "required": true,
        "min": 0
      },
      {
        "name": "newOutlets",
        "label": "New Outlets/Switches",
        "type": "number",
        "required": true,
        "min": 0
      },
      {
        "name": "specialtyWork",
        "label": "Specialty Work",
        "type": "multiselect",
        "options": [
          { "value": "evcharger", "label": "EV Charger" },
          { "value": "subpanel", "label": "Sub-Panel" },
          { "value": "generator", "label": "Generator Hookup" }
        ]
      },
      {
        "name": "lightingFixtures",
        "label": "Lighting Fixtures",
        "type": "number",
        "required": true,
        "min": 0
      }
    ]
  },
  "plumbing": {
    "displayName": "Plumbing",
    "fields": [
      {
        "name": "fixtures",
        "label": "Number of Fixtures",
        "type": "number",
        "required": true,
        "min": 1
      },
      {
        "name": "pipeMaterial",
        "label": "Pipe Material",
        "type": "select",
        "required": true,
        "options": [
          { "value": "pex", "label": "PEX" },
          { "value": "copper", "label": "Copper" },
          { "value": "pvc", "label": "PVC" }
        ]
      },
      {
        "name": "waterHeater",
        "label": "Water Heater",
        "type": "select",
        "required": true,
        "options": [
          { "value": "none", "label": "None" },
          { "value": "tank40", "label": "Tank 40gal" },
          { "value": "tank50", "label": "Tank 50gal" },
          { "value": "tank80", "label": "Tank 80gal" },
          { "value": "tankless", "label": "Tankless" }
        ]
      },
      {
        "name": "workType",
        "label": "Work Type",
        "type": "select",
        "required": true,
        "options": [
          { "value": "roughin", "label": "Rough-In Only" },
          { "value": "finish", "label": "Finish Only" },
          { "value": "both", "label": "Both" }
        ]
      },
      {
        "name": "existingModification",
        "label": "Modify Existing System?",
        "type": "boolean",
        "required": true
      },
      {
        "name": "gasLine",
        "label": "Gas Line Work?",
        "type": "boolean",
        "required": true
      }
    ]
  },
  "flooring": {
    "displayName": "Flooring",
    "fields": [
      {
        "name": "squareFeet",
        "label": "Square Footage",
        "type": "number",
        "required": true,
        "min": 100
      },
      {
        "name": "flooringType",
        "label": "Flooring Type",
        "type": "select",
        "required": true,
        "options": [
          { "value": "carpet", "label": "Carpet" },
          { "value": "laminate", "label": "Laminate" },
          { "value": "hardwood", "label": "Hardwood" },
          { "value": "tile", "label": "Tile" },
          { "value": "vinyl", "label": "Luxury Vinyl" },
          { "value": "concrete", "label": "Polished Concrete" }
        ]
      },
      {
        "name": "subfloorPrep",
        "label": "Subfloor Prep Needed?",
        "type": "boolean",
        "required": true
      },
      {
        "name": "existingRemoval",
        "label": "Remove Existing Floor?",
        "type": "boolean",
        "required": true
      },
      {
        "name": "transitionStrips",
        "label": "Transition Strips (linear feet)",
        "type": "number",
        "required": true,
        "min": 0
      },
      {
        "name": "stairs",
        "label": "Number of Stairs",
        "type": "number",
        "required": true,
        "min": 0
      }
    ]
  },
  "painting": {
    "displayName": "Painting",
    "fields": [
      {
        "name": "squareFeet",
        "label": "Square Footage (floor area)",
        "type": "number",
        "required": true,
        "min": 100
      },
      {
        "name": "interior",
        "label": "Interior Painting?",
        "type": "boolean",
        "required": true
      },
      {
        "name": "exterior",
        "label": "Exterior Painting?",
        "type": "boolean",
        "required": true
      },
      {
        "name": "coats",
        "label": "Number of Coats",
        "type": "select",
        "required": true,
        "options": [
          { "value": 1, "label": "1 Coat" },
          { "value": 2, "label": "2 Coats" },
          { "value": 3, "label": "3 Coats" }
        ]
      },
      {
        "name": "ceilingPainting",
        "label": "Paint Ceilings?",
        "type": "boolean",
        "required": true
      },
      {
        "name": "trimDoorsCabinets",
        "label": "Trim/Doors/Cabinets (count)",
        "type": "number",
        "required": true,
        "min": 0
      },
      {
        "name": "surfacePrep",
        "label": "Surface Prep (patching/sanding)?",
        "type": "boolean",
        "required": true
      }
    ]
  },
  "general": {
    "displayName": "General Contracting",
    "fields": [
      {
        "name": "projectType",
        "label": "Project Type",
        "type": "select",
        "required": true,
        "options": [
          { "value": "remodel", "label": "Remodel" },
          { "value": "addition", "label": "Addition" },
          { "value": "newconstruction", "label": "New Construction" }
        ]
      },
      {
        "name": "squareFeet",
        "label": "Square Footage",
        "type": "number",
        "required": true,
        "min": 100
      },
      {
        "name": "roomsAffected",
        "label": "Rooms Affected",
        "type": "number",
        "required": true,
        "min": 1
      },
      {
        "name": "structuralWork",
        "label": "Structural Work Required?",
        "type": "boolean",
        "required": true
      },
      {
        "name": "permitAcquisition",
        "label": "Permit Acquisition?",
        "type": "boolean",
        "required": true
      },
      {
        "name": "managementFeePercent",
        "label": "Management Fee (%)",
        "type": "number",
        "required": true,
        "min": 10,
        "max": 30,
        "default": 20
      },
      {
        "name": "timelineWeeks",
        "label": "Timeline (weeks)",
        "type": "number",
        "required": true,
        "min": 1
      }
    ]
  }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TRADE_FORM_SCHEMA;
}
