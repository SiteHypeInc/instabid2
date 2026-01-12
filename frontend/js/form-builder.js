// frontend/js/form-builder.js

class FormBuilder {
  constructor(schema) {
    this.schema = schema;
    this.currentTrade = null;
  }

  // Build the trade selector dropdown
  buildTradeSelector(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Container ${containerId} not found`);
      return;
    }

    const selectHTML = `
      <div class="form-group">
        <label for="tradeType">Select Trade Type *</label>
        <select id="tradeType" name="tradeType" required>
          <option value="">-- Choose a Trade --</option>
          ${Object.keys(this.schema).map(tradeKey => {
            const trade = this.schema[tradeKey];
            return `<option value="${tradeKey}">${trade.displayName}</option>`;
          }).join('')}
        </select>
      </div>
    `;

    container.innerHTML = selectHTML;

    // Add event listener for trade selection
    document.getElementById('tradeType').addEventListener('change', (e) => {
      this.currentTrade = e.target.value;
      if (this.currentTrade) {
        this.buildTradeForm('tradeFieldsContainer', this.currentTrade);
      } else {
        document.getElementById('tradeFieldsContainer').innerHTML = '';
      }
    });
  }

  // Build the dynamic form fields based on selected trade
  buildTradeForm(containerId, tradeType) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Container ${containerId} not found`);
      return;
    }

    const trade = this.schema[tradeType];
    if (!trade) {
      console.error(`Trade type ${tradeType} not found in schema`);
      return;
    }

    let formHTML = `<h3>${trade.displayName} Project Details</h3>`;

    trade.fields.forEach(field => {
      formHTML += this.buildField(field);
    });

    container.innerHTML = formHTML;
  }

  // Build individual field HTML based on field type
  buildField(field) {
    const required = field.required ? 'required' : '';
    const label = `<label for="${field.name}">${field.label}${field.required ? ' *' : ''}</label>`;

    switch (field.type) {
      case 'number':
        return `
          <div class="form-group">
            ${label}
            <input 
              type="number" 
              id="${field.name}" 
              name="${field.name}" 
              ${required}
              ${field.min !== undefined ? `min="${field.min}"` : ''}
              ${field.max !== undefined ? `max="${field.max}"` : ''}
              ${field.placeholder ? `placeholder="${field.placeholder}"` : ''}
              ${field.default !== undefined ? `value="${field.default}"` : ''}
            />
          </div>
        `;

      case 'select':
        return `
          <div class="form-group">
            ${label}
            <select id="${field.name}" name="${field.name}" ${required}>
              <option value="">-- Select --</option>
              ${field.options.map(opt => 
                `<option value="${opt.value}">${opt.label}</option>`
              ).join('')}
            </select>
          </div>
        `;

      case 'boolean':
        return `
          <div class="form-group checkbox-group">
            <label>
              <input 
                type="checkbox" 
                id="${field.name}" 
                name="${field.name}" 
                value="true"
              />
              ${field.label}${field.required ? ' *' : ''}
            </label>
          </div>
        `;

      case 'multiselect':
        return `
          <div class="form-group multiselect-group">
            ${label}
            <div class="multiselect-options" id="${field.name}_options">
              ${field.options.map(opt => `
                <label class="multiselect-option">
                  <input 
                    type="checkbox" 
                    name="${field.name}" 
                    value="${opt.value}"
                    data-cost="${opt.cost || 0}"
                  />
                  ${opt.label}
                </label>
              `).join('')}
            </div>
          </div>
        `;

      default:
        return `
          <div class="form-group">
            ${label}
            <input 
              type="text" 
              id="${field.name}" 
              name="${field.name}" 
              ${required}
              ${field.placeholder ? `placeholder="${field.placeholder}"` : ''}
            />
          </div>
        `;
    }
  }

  // Collect all form data
  collectFormData() {
    if (!this.currentTrade) {
      throw new Error('No trade selected');
    }

    const trade = this.schema[this.currentTrade];
    const formData = { tradeType: this.currentTrade };

    trade.fields.forEach(field => {
      const element = document.getElementById(field.name);

      if (field.type === 'multiselect') {
        // Handle multiselect checkboxes
        const checkboxes = document.querySelectorAll(`input[name="${field.name}"]:checked`);
        formData[field.name] = Array.from(checkboxes).map(cb => ({
          value: cb.value,
          cost: parseFloat(cb.dataset.cost || 0)
        }));
      } else if (field.type === 'boolean') {
        // Handle boolean checkbox
        formData[field.name] = element.checked;
      } else if (field.type === 'number') {
        // Handle number inputs
        formData[field.name] = element.value ? parseFloat(element.value) : null;
      } else if (field.type === 'select') {
        // Handle select dropdowns - convert to number if value is numeric
        const value = element.value;
        formData[field.name] = isNaN(value) ? value : parseFloat(value);
      } else {
        // Handle text inputs
        formData[field.name] = element.value;
      }
    });

    return formData;
  }

  // Validate form data
  validateForm() {
    if (!this.currentTrade) {
      return { valid: false, errors: ['Please select a trade type'] };
    }

    const trade = this.schema[this.currentTrade];
    const errors = [];

    trade.fields.forEach(field => {
      if (field.required) {
        const element = document.getElementById(field.name);
        
        if (field.type === 'multiselect') {
          // Multiselect validation handled differently
          return;
        } else if (field.type === 'boolean') {
          // Boolean fields don't need validation typically
          return;
        } else if (!element.value || element.value === '') {
          errors.push(`${field.label} is required`);
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormBuilder;
}
