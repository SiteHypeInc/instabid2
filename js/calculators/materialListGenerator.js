// Material List Generator - Enhanced with MSA Regional Pricing
async function generateMaterialList(estimateId) {
  try {
    console.log(`📋 Generating material list for estimate #${estimateId}`);
    
    // Step 1: Fetch estimate data from Railway
    const response = await fetch(`https://roofbid-backend-production.up.railway.app/api/estimates/${estimateId}`);
    if (!response.ok) throw new Error('Failed to fetch estimate');
    
    const estimate = await response.json();
    console.log('✅ Estimate fetched:', estimate);
    
    // Step 2: Check if trade is supported
const supportedTrades = ['roofing', 'painting', 'hvac', 'electrical', 'plumbing', 'flooring', 'drywall', 'siding'];

if (!supportedTrades.includes(estimate.trade)) {
  alert(`Material lists are not yet available for ${estimate.trade} estimates.`);
  return;
}

    
    // Step 3: Parse trade details (project specifics)
    const projectDetails = typeof estimate.projectDetails === 'string' 
      ? JSON.parse(estimate.projectDetails) 
      : estimate.projectDetails || {};
    
    console.log('📦 Project details:', projectDetails);
    
    // Step 4: Fetch MSA regional cost index
    const msaData = await fetchMSACostIndex(estimate.zipCode);
    console.log('📍 MSA data:', msaData);
    
    // Step 5: Generate material list with regional pricing
    const materialListData = await generateMaterialListForTrade(
      estimate.trade, 
      projectDetails, 
      estimate,
      msaData
    );
    
    // Step 6: Display in dashboard (if container exists)
    displayMaterialList(materialListData, estimateId);


    
    // Step 7: Download CSV
    const filename = `material-list-${estimate.customerName.replace(/\s+/g, '-')}-${Date.now()}.csv`;
    downloadMaterialCSV(materialListData, filename);
    
    console.log('✅ Material list generation complete');
    
  } catch (error) {
    console.error('❌ Error generating material list:', error);
    alert('Failed to generate material list. Please try again.');
  }
}

async function fetchMSACostIndex(zipCode) {
  try {
    const response = await fetch(`https://roofbid-backend-production.up.railway.app/api/msa-lookup?zip=${zipCode}`);
    if (!response.ok) {
      console.warn('⚠️ MSA lookup failed, using national average');
      return { material_index: 1.00, labor_index: 1.00, msa_name: 'National Average' };
    }
    return await response.json();
  } catch (error) {
    console.error('❌ MSA lookup error:', error);
    return { material_index: 1.00, labor_index: 1.00, msa_name: 'National Average' };
  }
}

async function generateMaterialListForTrade(tradeType, projectDetails, estimate, msaData) {
  let materialList = [];

  switch(tradeType) {
  case 'roofing':
    if (typeof calculateRoofingEnhanced !== 'undefined') {
      console.log('🔧 Calling calculateRoofingEnhanced...');
      const criteria = {
        squareFeet: parseFloat(projectDetails.squareFeet || projectDetails.roofArea || 2000),
        pitch: projectDetails.pitch || projectDetails.roofPitch || 'medium',
        tearOff: projectDetails.tearOff === 'yes' || projectDetails.existingRoofType !== 'none',
        osbSqft: parseFloat(projectDetails.osbSqft || projectDetails.plywoodSqft || 0),
        layers: parseInt(projectDetails.layers || projectDetails.tearOffLayers || 1),
        chimneys: parseInt(projectDetails.chimneys || 0),
        skylights: parseInt(projectDetails.skylights || 0),
        valleys: parseInt(projectDetails.valleys || 0)
      };
      const result = calculateRoofingEnhanced(criteria);
      materialList = result.materialList || [];
    } else {
      console.warn('⚠️ calculateRoofingEnhanced not found');
      materialList = [];
    }
    break;
  
  case 'painting':
    if (typeof calculatePaintingEnhanced !== 'undefined') {
      console.log('🔧 Calling calculatePaintingEnhanced...');
      const criteria = {
        squareFeet: parseFloat(projectDetails.squareFeet || projectDetails.paintArea || 0),
        surface: projectDetails.surface || projectDetails.paintType || 'exterior',
        stories: parseInt(projectDetails.stories || 1),
        condition: projectDetails.condition || 'good',
        coats: parseInt(projectDetails.coats || 2),
        trim: parseFloat(projectDetails.trim || 0),
        doors: parseInt(projectDetails.doors || 0),
        primer: projectDetails.primer !== 'no'
      };
      const result = calculatePaintingEnhanced(criteria);
      materialList = result.materialList || [];
    } else {
      console.warn('⚠️ calculatePaintingEnhanced not found');
      materialList = [];
    }
    break;
  
  case 'hvac':
    if (typeof calculateHVACEnhanced !== 'undefined') {
      console.log('🔧 Calling calculateHVACEnhanced...');
      const criteria = {
        squareFeet: parseFloat(projectDetails.squareFeet || projectDetails.squareFootage || 0),
        systemType: projectDetails.systemType || 'furnace',
        efficiency: projectDetails.efficiency || 'standard',
        ductwork: projectDetails.ductwork || 'existing',
        stories: parseInt(projectDetails.stories || 1),
        zoneCount: parseInt(projectDetails.zones || 1),
        thermostats: parseInt(projectDetails.thermostats || 1)
      };
      const result = calculateHVACEnhanced(criteria);
      materialList = result.materialList || [];
    } else {
      console.warn('⚠️ calculateHVACEnhanced not found');
      materialList = [];
    }
    break;
  
  case 'electrical':
    if (typeof calculateElectricalEnhanced !== 'undefined') {
      console.log('🔧 Calling calculateElectricalEnhanced...');
      const criteria = {
        serviceType: projectDetails.serviceType || 'panel',
        amperage: parseInt(projectDetails.amperage || 200),
        squareFeet: parseFloat(projectDetails.squareFeet || 0),
        outletCount: parseInt(projectDetails.outletCount || 0),
        switchCount: parseInt(projectDetails.switchCount || 0),
        fixtureCount: parseInt(projectDetails.fixtureCount || 0),
        evCharger: projectDetails.evCharger === 'yes'
      };
      const result = calculateElectricalEnhanced(criteria);
      materialList = result.materialList || [];
    } else {
      console.warn('⚠️ calculateElectricalEnhanced not found');
      materialList = [];
    }
    break;
  
  case 'plumbing':
    if (typeof calculatePlumbingEnhanced !== 'undefined') {
      console.log('🔧 Calling calculatePlumbingEnhanced...');
      const criteria = {
        serviceType: projectDetails.serviceType || projectDetails.plumbingType || 'fixture',
        fixtureType: projectDetails.fixtureType || 'toilet',
        fixtureCount: parseInt(projectDetails.fixtureCount || 1),
        squareFeet: parseFloat(projectDetails.squareFeet || 0),
        pipeType: projectDetails.pipeType || 'PEX',
        waterHeaterType: projectDetails.waterHeaterType || 'tank',
        drainLength: parseFloat(projectDetails.drainLength || 0),
        sewerLength: parseFloat(projectDetails.sewerLength || 0)
      };
      const result = calculatePlumbingEnhanced(criteria);
      materialList = result.materialList || [];
    } else {
      console.warn('⚠️ calculatePlumbingEnhanced not found');
      materialList = [];
    }
    break;
  
  case 'flooring':
    if (typeof calculateFlooringEnhanced !== 'undefined') {
      console.log('🔧 Calling calculateFlooringEnhanced...');
      const criteria = {
        squareFeet: parseFloat(projectDetails.squareFeet || projectDetails.floorArea || 0),
        flooringType: projectDetails.flooringType || 'carpet',
        removal: projectDetails.removal === 'yes',
        subfloorRepair: projectDetails.subfloorRepair === 'yes',
        underlayment: projectDetails.underlayment !== 'no',
        baseboard: parseFloat(projectDetails.baseboard || 0),
        complexity: projectDetails.complexity || 'standard'
      };
      const result = calculateFlooringEnhanced(criteria);
      materialList = result.materialList || [];
    } else {
      console.warn('⚠️ calculateFlooringEnhanced not found');
      materialList = [];
    }
    break;
  
  case 'drywall':
    if (typeof calculateDrywallEnhanced !== 'undefined') {
      console.log('🔧 Calling calculateDrywallEnhanced...');
      const criteria = {
        squareFeet: parseFloat(projectDetails.squareFeet || 0),
        serviceType: projectDetails.serviceType || 'installation',
        sheetSize: projectDetails.sheetSize || '4x8',
        thickness: projectDetails.thickness || '1/2',
        finishLevel: projectDetails.finishLevel || 'smooth',
        ceilingHeight: parseInt(projectDetails.ceilingHeight || 8),
        repairSize: projectDetails.repairSize || 'small',
        removal: projectDetails.removal === 'yes'
      };
      const result = calculateDrywallEnhanced(criteria);
      materialList = result.materialList || [];
    } else {
      console.warn('⚠️ calculateDrywallEnhanced not found');
      materialList = [];
    }
    break;
  
  case 'siding':
    if (typeof calculateSidingEnhanced !== 'undefined') {
      console.log('🔧 Calling calculateSidingEnhanced...');
      const criteria = {
        squareFeet: parseFloat(projectDetails.squareFeet || 0),
        sidingType: projectDetails.sidingType || 'vinyl',
        stories: parseInt(projectDetails.stories || 1),
        removal: projectDetails.removal === 'yes',
        houseWrap: projectDetails.houseWrap !== 'no',
        trim: parseFloat(projectDetails.trim || 0),
        windowCount: parseInt(projectDetails.windowCount || 0)
      };
      const result = calculateSidingEnhanced(criteria);
      materialList = result.materialList || [];
    } else {
      console.warn('⚠️ calculateSidingEnhanced not found');
      materialList = [];
    }
    break;
  
  default:
    console.error('❌ Unknown trade type:', tradeType);
    return null;
}


  // Enhance with Supabase product data if available
  if (typeof enhanceMaterialListWithProducts !== 'undefined') {
    console.log('🔍 Enhancing with Supabase product matches...');
    materialList = await enhanceMaterialListWithProducts(materialList);
  }

  return {
    tradeType,
    customerName: estimate.customerName,
    address: estimate.address,
    city: estimate.city,
    state: estimate.state,
    zipCode: estimate.zipCode,
    msaName: msaData.msa_name,
    materialIndex: msaData.material_index,
    materials: materialList,
    summary: {
      totalItems: materialList.length,
      exactMatches: materialList.filter(m => m.storeMatch).length,
      estimatedItems: materialList.filter(m => !m.storeMatch).length,
      totalCost: materialList.reduce((sum, m) => sum + (m.totalCost || 0), 0),
      nationalCost: materialList.reduce((sum, m) => sum + (m.baseTotalCost || m.totalCost || 0), 0)
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
      quantity: Math.ceil(squares * 3),
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

function displayMaterialList(materialListData, estimateId) {
  // Find the material list button by ID
  const button = document.getElementById('generateMaterialListBtn');
  
  if (!button) {
    console.warn('⚠️ Material list button not found, skipping display');
    return;
  }
  
  // Find or create container right after the button
  let container = document.getElementById(`material-list-${estimateId}`);
  
  if (!container) {
    container = document.createElement('div');
    container.id = `material-list-${estimateId}`;
    container.className = 'material-list-container';
    
    // Insert right after the button
    button.insertAdjacentElement('afterend', container);
  }
  
  const { materials, summary, msaName, materialIndex } = materialListData;
  
  // Build HTML table
  let html = `
    <div class="material-list-header">
      <h3>📦 Material List</h3>
      <div class="msa-info">
        <strong>Region:</strong> ${msaName} 
        <span class="cost-multiplier">(${(materialIndex * 100).toFixed(0)}% of national avg)</span>
      </div>
    </div>
    
    <table class="material-list-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>Qty</th>
          <th>Unit</th>
          <th>Unit Cost</th>
          <th>Total</th>
          <th>Category</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  materials.forEach(item => {
    html += `
      <tr>
        <td><strong>${item.item}</strong></td>
        <td>${item.quantity}</td>
        <td>${item.unit}</td>
        <td>$${item.unitCost.toFixed(2)}</td>
        <td><strong>$${item.totalCost.toFixed(2)}</strong></td>
        <td><span class="category-badge">${item.category}</span></td>
      </tr>
    `;
  });
  
  html += `
      </tbody>
    </table>
    
    <div class="material-list-summary">
      <div class="summary-row">
        <span>Total Items:</span>
        <strong>${summary.totalItems}</strong>
      </div>
      <div class="summary-row">
        <span>National Avg Cost:</span>
        <strong>$${summary.nationalCost.toFixed(2)}</strong>
      </div>
      <div class="summary-row total">
        <span>Regional Total Cost:</span>
        <strong>$${summary.totalCost.toFixed(2)}</strong>
      </div>
    </div>
  `;
  
  container.innerHTML = html;
  
  // Add basic styling if not present
  if (!document.getElementById('material-list-styles')) {
    const style = document.createElement('style');
    style.id = 'material-list-styles';
    style.textContent = `
      .material-list-container {
        margin: 20px 0;
        padding: 20px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        border: 1px solid #e5e7eb;
      }
      .material-list-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 10px;
        border-bottom: 2px solid #e5e7eb;
      }
      .material-list-header h3 {
        margin: 0;
        color: #111827;
      }
      .msa-info {
        font-size: 14px;
        color: #6b7280;
      }
      .cost-multiplier {
        color: #2563eb;
        font-weight: 600;
      }
      .material-list-table {
        width: 100%;
        border-collapse: collapse;
      }
      .material-list-table th {
        background: #f3f4f6;
        padding: 12px;
        text-align: left;
        font-weight: 600;
        border-bottom: 2px solid #e5e7eb;
        color: #374151;
      }
      .material-list-table td {
        padding: 10px 12px;
        border-bottom: 1px solid #e5e7eb;
      }
      .material-list-table tbody tr:hover {
        background: #f9fafb;
      }
      .category-badge {
        display: inline-block;
        padding: 4px 8px;
        background: #dbeafe;
        color: #1e40af;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        text-transform: capitalize;
      }
      .material-list-summary {
        margin-top: 20px;
        padding: 15px;
        background: #f9fafb;
        border-radius: 6px;
      }
      .summary-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        color: #374151;
      }
      .summary-row.total {
        border-top: 2px solid #2563eb;
        margin-top: 10px;
        padding-top: 15px;
        font-size: 18px;
        color: #2563eb;
      }
    `;
    document.head.appendChild(style);
  }
  
  console.log('✅ Material list displayed on screen');
}

function displayMaterialList(materialListData, estimateId) {
  // Find the material list button
  const button = document.getElementById('generateMaterialListBtn');
  
  if (!button) {
    console.warn('⚠️ Material list button not found, skipping display');
    return;
  }
  
  // Find or create container right after the button
  let container = document.getElementById(`material-list-${estimateId}`);
  
  if (!container) {
    container = document.createElement('div');
    container.id = `material-list-${estimateId}`;
    container.className = 'material-list-container';
    
    // Insert right after the button's parent
    button.parentElement.insertAdjacentElement('afterend', container);
  }
  
  const { materials, summary, msaName, materialIndex } = materialListData;
  
  // Build HTML table
  let html = `
    <div class="material-list-header">
      <h3>📦 Material List</h3>
      <div class="msa-info">
        <strong>Region:</strong> ${msaName} 
        <span class="cost-multiplier">(${(materialIndex * 100).toFixed(0)}% of national avg)</span>
      </div>
    </div>
    
    <table class="material-list-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>Qty</th>
          <th>Unit</th>
          <th>Unit Cost</th>
          <th>Total</th>
          <th>Category</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  materials.forEach(item => {
    html += `
      <tr>
        <td><strong>${item.item}</strong></td>
        <td>${item.quantity}</td>
        <td>${item.unit}</td>
        <td>$${item.unitCost.toFixed(2)}</td>
        <td><strong>$${item.totalCost.toFixed(2)}</strong></td>
        <td><span class="category-badge">${item.category}</span></td>
      </tr>
    `;
  });
  
  html += `
      </tbody>
    </table>
    
    <div class="material-list-summary">
      <div class="summary-row">
        <span>Total Items:</span>
        <strong>${summary.totalItems}</strong>
      </div>
      <div class="summary-row">
        <span>National Avg Cost:</span>
        <strong>$${summary.nationalCost.toFixed(2)}</strong>
      </div>
      <div class="summary-row total">
        <span>Regional Total Cost:</span>
        <strong>$${summary.totalCost.toFixed(2)}</strong>
      </div>
    </div>
  `;
  
  container.innerHTML = html;
  
  // Add basic styling if not present
  if (!document.getElementById('material-list-styles')) {
    const style = document.createElement('style');
    style.id = 'material-list-styles';
    style.textContent = `
      .material-list-container {
        margin: 20px 0;
        padding: 20px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        border: 1px solid #e5e7eb;
      }
      .material-list-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 10px;
        border-bottom: 2px solid #e5e7eb;
      }
      .material-list-header h3 {
        margin: 0;
        color: #111827;
      }
      .msa-info {
        font-size: 14px;
        color: #6b7280;
      }
      .cost-multiplier {
        color: #2563eb;
        font-weight: 600;
      }
      .material-list-table {
        width: 100%;
        border-collapse: collapse;
      }
      .material-list-table th {
        background: #f3f4f6;
        padding: 12px;
        text-align: left;
        font-weight: 600;
        border-bottom: 2px solid #e5e7eb;
        color: #374151;
      }
      .material-list-table td {
        padding: 10px 12px;
        border-bottom: 1px solid #e5e7eb;
      }
      .material-list-table tbody tr:hover {
        background: #f9fafb;
      }
      .category-badge {
        display: inline-block;
        padding: 4px 8px;
        background: #dbeafe;
        color: #1e40af;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        text-transform: capitalize;
      }
      .material-list-summary {
        margin-top: 20px;
        padding: 15px;
        background: #f9fafb;
        border-radius: 6px;
      }
      .summary-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        color: #374151;
      }
      .summary-row.total {
        border-top: 2px solid #2563eb;
        margin-top: 10px;
        padding-top: 15px;
        font-size: 18px;
        color: #2563eb;
      }
    `;
    document.head.appendChild(style);
  }
  
  console.log('✅ Material list displayed on screen');
} 

function generateMaterialCSV(materialListData) {
  const { tradeType, customerName, address, city, state, zipCode, msaName, materialIndex, materials, summary } = materialListData;
  
  let csv = 'Material List - InstaBid\n';
  csv += `Customer: ${customerName}\n`;
  csv += `Address: ${address}, ${city}, ${state} ${zipCode}\n`;
  csv += `Trade: ${tradeType.toUpperCase()}\n`;
  csv += `Region: ${msaName} (${(materialIndex * 100).toFixed(0)}% of national average)\n`;
  csv += `Generated: ${new Date().toLocaleString()}\n\n`;
  csv += 'Item,Quantity,Unit,Unit Cost,Total Cost,Category,SKU,Brand\n';
  
  materials.forEach(material => {
    csv += `"${material.item}",${material.quantity},"${material.unit}",`;
    csv += `$${material.unitCost.toFixed(2)},$${material.totalCost.toFixed(2)},"${material.category}",`;
    csv += `"${material.sku || 'N/A'}","${material.brand || 'N/A'}"\n`;
  });
  
  csv += `\nSummary\n`;
  csv += `Total Items,${summary.totalItems}\n`;
  csv += `National Avg Cost,$${summary.nationalCost.toFixed(2)}\n`;
  csv += `Regional Total Cost,$${summary.totalCost.toFixed(2)}\n`;
  csv += `Regional Multiplier,${(materialIndex * 100).toFixed(0)}%\n`;
  
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
  
  console.log(`✅ CSV downloaded: ${filename}`);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateMaterialList, generateMaterialCSV, downloadMaterialCSV };
}