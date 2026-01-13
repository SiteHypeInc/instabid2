// Material List Generator - Fetches estimate, generates materials, downloads CSV
async function generateMaterialList(estimateId) {
  try {
    // Step 1: Fetch estimate data from Railway
    const response = await fetch(`https://roofbid-backend-production.up.railway.app/api/estimates/${estimateId}`);
    if (!response.ok) throw new Error('Failed to fetch estimate');
    
    const estimate = await response.json();
    
    // Step 2: Check if trade is supported
    if (estimate.trade !== 'roofing') {
      alert(`Material lists are currently only available for roofing estimates.\n\nThis is a ${estimate.trade} estimate.`);
      return;
    }
    
    // Step 3: Parse trade details (project specifics)
    const projectDetails = typeof estimate.projectDetails === 'string' 
      ? JSON.parse(estimate.projectDetails) 
      : estimate.projectDetails || {};
    
    // Step 4: Generate material list
    const materialListData = await generateMaterialListForTrade(estimate.trade, projectDetails, estimate);
    
    // Step 5: Download CSV
    const filename = `material-list-${estimate.customerName.replace(/\s+/g, '-')}-${Date.now()}.csv`;
    downloadMaterialCSV(materialListData, filename);
    
  } catch (error) {
    console.error('Error generating material list:', error);
    alert('Failed to generate material list. Please try again.');
  }
}

async function generateMaterialListForTrade(tradeType, projectDetails, estimate) {
  let materialList = [];

  switch(tradeType) {
    case 'roofing':
      if (typeof calculateRoofingEnhanced !== 'undefined') {
        const result = calculateRoofingEnhanced(projectDetails);
        materialList = result.materialList || [];
      } else {
        // Fallback: basic material list from estimate data
        materialList = generateBasicRoofingList(estimate, projectDetails);
      }
      break;
    
    case 'hvac':
    case 'electrical':
    case 'plumbing':
    case 'flooring':
    case 'painting':
    case 'drywall':
    case 'siding':
      materialList = generateGenericMaterialList(tradeType, estimate);
      break;
    
    default:
      console.error('Unknown trade type:', tradeType);
      return null;
  }

  // Enhance with Supabase product data if available
  if (typeof enhanceMaterialListWithProducts !== 'undefined') {
    materialList = await enhanceMaterialListWithProducts(materialList);
  }

  return {
    tradeType,
    customerName: estimate.customerName,
    address: estimate.address,
    materials: materialList,
    summary: {
      totalItems: materialList.length,
      exactMatches: materialList.filter(m => m.storeMatch).length,
      estimatedItems: materialList.filter(m => !m.storeMatch).length,
      totalCost: materialList.reduce((sum, m) => sum + (m.totalCost || 0), 0)
    }
  };
}

function generateBasicRoofingList(estimate, projectDetails) {
  // Basic fallback if calculator not loaded
  const sqft = projectDetails.roofArea || projectDetails.squareFeet || 2000;
  const squares = sqft / 100;
  
  return [
    {
      item: 'Roofing Shingles',
      quantity: Math.ceil(squares * 3), // 3 bundles per square
      unit: 'bundle',
      unitCost: 35,
      totalCost: Math.ceil(squares * 3) * 35,
      category: 'shingles'
    },
    {
      item: 'Roofing Nails',
      quantity: Math.ceil(squares * 2),
      unit: 'lb',
      unitCost: 8,
      totalCost: Math.ceil(squares * 2) * 8,
      category: 'fasteners'
    },
    {
      item: 'Underlayment',
      quantity: Math.ceil(squares * 1.1),
      unit: 'roll',
      unitCost: 45,
      totalCost: Math.ceil(squares * 1.1) * 45,
      category: 'underlayment'
    }
  ];
}

function generateGenericMaterialList(tradeType, estimate) {
  return [
    {
      item: `${tradeType.charAt(0).toUpperCase() + tradeType.slice(1)} Materials`,
      quantity: 1,
      unit: 'lot',
      unitCost: estimate.materialsCost || 0,
      totalCost: estimate.materialsCost || 0,
      category: 'general',
      note: 'Detailed material breakdown coming soon'
    }
  ];
}

function generateMaterialCSV(materialListData) {
  const { tradeType, customerName, address, materials, summary } = materialListData;
  
  let csv = 'Material List\n';
  csv += `Customer: ${customerName}\n`;
  csv += `Address: ${address}\n`;
  csv += `Trade: ${tradeType.toUpperCase()}\n`;
  csv += `Generated: ${new Date().toLocaleString()}\n\n`;
  csv += 'Item,Quantity,Unit,SKU,Brand,Unit Cost,Total Cost,Match Type\n';
  
  materials.forEach(material => {
    csv += `"${material.item}",${material.quantity},"${material.unit}","${material.sku || 'N/A'}","${material.brand || 'N/A'}",`;
    csv += `$${material.retailPrice || material.unitCost},$${material.totalCost.toFixed(2)},"${material.storeMatch ? 'Exact Match' : 'Estimate'}"\n`;
  });
  
  csv += `\nSummary\n`;
  csv += `Total Items,${summary.totalItems}\n`;
  csv += `Exact Matches,${summary.exactMatches}\n`;
  csv += `Estimated Items,${summary.estimatedItems}\n`;
  csv += `Total Cost,$${summary.totalCost.toFixed(2)}\n`;
  
  return csv;
}

function downloadMaterialCSV(materialListData, filename) {
  const csv = generateMaterialCSV(materialListData);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `material-list-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateMaterialList, generateMaterialCSV, downloadMaterialCSV };
}