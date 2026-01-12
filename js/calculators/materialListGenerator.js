cat > js/calculators/materialListGenerator.js << 'EOF'
// Material List Generator - Combines calculations + matching + CSV
async function generateMaterialList(tradeType, criteria) {
  let materialList = [];

  switch(tradeType) {
    case 'roofing':
      if (typeof calculateRoofingEnhanced !== 'undefined') {
        const result = calculateRoofingEnhanced(criteria);
        materialList = result.materialList;
      }
      break;
    
    case 'hvac':
    case 'electrical':
    case 'plumbing':
    case 'flooring':
    case 'painting':
    case 'drywall':
    case 'siding':
      materialList = generateGenericMaterialList(tradeType, criteria);
      break;
    
    default:
      console.error('Unknown trade type:', tradeType);
      return null;
  }

  if (typeof enhanceMaterialListWithProducts !== 'undefined') {
    materialList = await enhanceMaterialListWithProducts(materialList);
  }

  return {
    tradeType,
    criteria,
    materials: materialList,
    summary: {
      totalItems: materialList.length,
      exactMatches: materialList.filter(m => m.storeMatch).length,
      estimatedItems: materialList.filter(m => !m.storeMatch).length,
      totalCost: materialList.reduce((sum, m) => sum + m.totalCost, 0)
    }
  };
}

function generateGenericMaterialList(tradeType, criteria) {
  return [
    {
      item: `${tradeType.charAt(0).toUpperCase() + tradeType.slice(1)} Materials`,
      quantity: 1,
      unit: 'lot',
      unitCost: 0,
      totalCost: 0,
      category: 'general',
      note: 'RS Means API integration pending'
    }
  ];
}

function generateMaterialCSV(materialListData) {
  const { tradeType, materials, summary } = materialListData;
  
  let csv = 'Material List\n';
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