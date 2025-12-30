// frontend/js/app.js

let estimateData = {};
let uploadedPhotos = [];
let map, marker, geocoder;
let formBuilder;

// Initialize Google Maps
function initMap() {
    const defaultCenter = { lat: 32.7767, lng: -96.7970 };
    
    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 20,
        center: defaultCenter,
        mapTypeId: 'satellite',
        tilt: 0,
        disableDefaultUI: true,
        zoomControl: true
    });
    
    marker = new google.maps.Marker({
        map: map,
        position: defaultCenter,
        draggable: false
    });
    
    geocoder = new google.maps.Geocoder();
}

window.initMap = initMap;

// Geocode address and show on map
function showAerialView(address) {
    if (!geocoder || !address || address.length < 10) return;
    
    geocoder.geocode({ address: address }, (results, status) => {
        if (status === 'OK' && results[0]) {
            const location = results[0].geometry.location;
            map.setCenter(location);
            map.setZoom(20);
            marker.setPosition(location);
            document.getElementById('aerialViewContainer').classList.add('active');
        }
    });
}

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    // Initialize FormBuilder with schema
    formBuilder = new FormBuilder(TRADE_FORM_SCHEMA);
    formBuilder.buildTradeSelector('tradeSelectorContainer');
    
    // Address aerial view
    document.getElementById('address').addEventListener('input', function() {
        if (this.value.length > 15) showAerialView(this.value);
    });
    
    document.getElementById('address').addEventListener('blur', function() {
        if (this.value.length > 10) showAerialView(this.value);
    });
    
    // Photo upload handlers
    const photoUploadArea = document.getElementById('photoUploadArea');
    const photoInput = document.getElementById('photoInput');
    
    photoUploadArea.addEventListener('click', () => photoInput.click());
    photoInput.addEventListener('change', (e) => handleFiles(e.target.files));
    
    photoUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        photoUploadArea.classList.add('drag-over');
    });
    
    photoUploadArea.addEventListener('dragleave', () => {
        photoUploadArea.classList.remove('drag-over');
    });
    
    photoUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        photoUploadArea.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });
    
    // Form submission
    document.getElementById('demoForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Validate form
        const validation = formBuilder.validateForm();
        if (!validation.valid) {
            alert('Please fix the following errors:\\n' + validation.errors.join('\\n'));
            return;
        }
        
        // Collect trade-specific data
        const tradeData = formBuilder.collectFormData();
        
        // Collect client info
        const clientData = {
            companyName: document.getElementById('companyName').value,
            clientName: document.getElementById('clientName').value,
            clientEmail: document.getElementById('clientEmail').value,
            clientPhone: document.getElementById('clientPhone').value,
            address: document.getElementById('address').value,
            state: document.getElementById('state').value
        };
   
        
        // Merge data
        const requestData = { ...tradeData, ...clientData };
        
        console.log('📤 Sending request:', requestData);
        
        try {
            const response = await fetch('https://roofbid-backend-production.up.railway.app/api/estimate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server returned ${response.status}: ${errorText}`);
            }
            
            const result = await response.json();
            console.log('✅ Result received:', result);
            
            estimateData = {
                ...clientData,
                ...result,
                photos: uploadedPhotos,
                tradeType: tradeData.trade
            };
            
            displayEstimate();
            
        } catch (error) {
            console.error('💥 Error:', error);
            alert('Failed to generate estimate: ' + error.message);
        }
    });
});

function handleFiles(files) {
    Array.from(files).forEach(file => {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                uploadedPhotos.push({data: e.target.result, name: file.name});
                updatePhotoPreview();
            };
            reader.readAsDataURL(file);
        }
    });
}

function updatePhotoPreview() {
    const preview = document.getElementById('photoPreview');
    preview.innerHTML = '';
    uploadedPhotos.forEach((photo, i) => {
        const div = document.createElement('div');
        div.className = 'photo-preview-item';
        div.innerHTML = `
            ${photo.name}
            ×
            
Photo ${i + 1}

        `;
        preview.appendChild(div);
    });
    
    document.getElementById('photoCount').innerHTML = uploadedPhotos.length > 0 
        ? `📷 ${uploadedPhotos.length} Photo${uploadedPhotos.length > 1 ? 's' : ''}` 
        : '';
}

function removePhoto(index) {
    uploadedPhotos.splice(index, 1);
    updatePhotoPreview();
}

function displayEstimate() {
    document.getElementById('placeholder').style.display = 'none';
    document.getElementById('estimateOutput').classList.add('active');
    
    document.getElementById('estimateDate').textContent = 'Generated: ' + new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    
    // Display photos if any
    if (estimateData.photos && estimateData.photos.length > 0) {
        const gallery = document.getElementById('photoGallery');
        gallery.innerHTML = '';
        estimateData.photos.forEach(photo => {
            const img = document.createElement('img');
            img.src = photo.data;
            gallery.appendChild(img);
        });
        document.getElementById('projectPhotosSection').style.display = 'block';
    }
    
    // Project info
    document.getElementById('projectInfo').innerHTML = `
        
Client:${estimateData.clientName}

        
Email:${estimateData.clientEmail}

        
Phone:${estimateData.clientPhone || 'N/A'}

        
Address:${estimateData.address}

        
Trade:${estimateData.tradeType || 'N/A'}

    `;
    
    // Cost breakdown from backend lineItems
    let html = '';
    if (estimateData.lineItems && estimateData.lineItems.length > 0) {
        estimateData.lineItems.forEach(item => {
            html += `
${item.description}$${item.amount.toFixed(2)}
`;
        });
    }
    
    html += `
        
Subtotal$${(estimateData.subtotal || 0).toFixed(2)}

        
Tax (8.25%)$${(estimateData.tax || 0).toFixed(2)}

        
TOTAL$${(estimateData.total || 0).toFixed(2)}

    `;
    document.getElementById('lineItems').innerHTML = html;
    
    // Timeline
    document.getElementById('timelineContent').innerHTML = `
        
Estimated Duration: ${estimateData.timeline || 'TBD'}

    `;
}

// Download PDF Estimate
async function downloadPDF() {
    if (!estimateData || !estimateData.total) {
        alert('❌ Please generate an estimate first!');
        return;
    }
    
    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Generating PDF...';
    btn.disabled = true;
    
    try {
        const payload = {
            estimate: {
                lineItems: estimateData.lineItems || [],
                subtotal: estimateData.subtotal || 0,
                tax: estimateData.tax || 0,
                total: estimateData.total || 0,
                timeline: estimateData.timeline || 'TBD'
            },
            formData: {
                trade: estimateData.tradeType || 'general',
                clientName: estimateData.clientName,
                clientEmail: estimateData.clientEmail,
                clientPhone: estimateData.clientPhone || '',
                address: estimateData.address,
                companyName: estimateData.companyName
            }
        };
        
        const response = await fetch('https://roofbid-backend-production.up.railway.app/api/send-estimate-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error('Failed to generate PDF');
        
        const result = await response.json();
        
        if (result.success) {
            alert('✅ PDF generated and emailed! Check ' + estimateData.clientEmail);
        } else {
            throw new Error(result.error || 'Unknown error');
        }
        
    } catch (error) {
        console.error('💥 PDF error:', error);
        alert('❌ Failed to generate PDF: ' + error.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Download Contract
async function downloadContract() {
    if (!estimateData || !estimateData.total) {
        alert('❌ Please generate an estimate first!');
        return;
    }
    
    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Generating Contract...';
    btn.disabled = true;
    
    try {
        const payload = {
            estimate: {
                lineItems: estimateData.lineItems || [],
                subtotal: estimateData.subtotal || 0,
                tax: estimateData.tax || 0,
                total: estimateData.total || 0,
                timeline: estimateData.timeline || 'TBD'
            },
            formData: {
                trade: estimateData.tradeType || 'general',
                clientName: estimateData.clientName,
                clientEmail: estimateData.clientEmail,
                clientPhone: estimateData.clientPhone || '',
                address: estimateData.address,
                companyName: estimateData.companyName
            }
        };
        
        const response = await fetch('https://roofbid-backend-production.up.railway.app/api/send-estimate-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error('Failed to generate contract');
        
        const result = await response.json();
        
        if (result.success) {
            alert('✅ Contract generated and emailed! Check ' + estimateData.clientEmail);
        } else {
            throw new Error(result.error || 'Unknown error');
        }
        
    } catch (error) {
        console.error('💥 Contract error:', error);
        alert('❌ Failed to generate contract: ' + error.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Email Estimate
async function emailEstimate() {
    if (!estimateData || !estimateData.total) {
        alert('❌ Please generate an estimate first!');
        return;
    }
    
    if (!estimateData.clientEmail || !estimateData.clientEmail.includes('@')) {
        alert('❌ Please enter a valid client email address');
        return;
    }
    
    const emailBtn = event.target;
    const originalText = emailBtn.innerHTML;
    emailBtn.innerHTML = '⏳ Sending...';
    emailBtn.disabled = true;
    
    try {
        const payload = {
            estimate: {
                lineItems: estimateData.lineItems || [],
                subtotal: estimateData.subtotal || 0,
                tax: estimateData.tax || 0,
                total: estimateData.total || 0,
                timeline: estimateData.timeline || 'TBD'
            },
            formData: {
                trade: estimateData.tradeType || 'general',
                clientName: estimateData.clientName,
                clientEmail: estimateData.clientEmail,
                clientPhone: estimateData.clientPhone || '',
                address: estimateData.address,
                companyName: estimateData.companyName
            }
        };
        
        console.log('📧 Sending email with payload:', payload);
        
        const response = await fetch('https://roofbid-backend-production.up.railway.app/api/send-estimate-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server returned ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        console.log('📧 Email API response:', result);
        
        if (result.success) {
            alert(`✅ Email sent successfully to ${estimateData.clientEmail}!\\n\\n💳 Payment Link: ${result.paymentLink}`);
            
            if (confirm('Open payment link in new tab?')) {
                window.open(result.paymentLink, '_blank');
            }
        } else {
            throw new Error(result.error || 'Unknown error');
        }
        
    } catch (error) {
        console.error('💥 Email error:', error);
        alert('❌ Failed to send email: ' + error.message);
    } finally {
        emailBtn.innerHTML = originalText;
        emailBtn.disabled = false;
    }
}

// Create Payment Link
async function createPaymentLink() {
    if (!estimateData || !estimateData.total) {
        alert('❌ Please generate an estimate first!');
        return;
    }
    
    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Creating Link...';
    btn.disabled = true;
    
    try {
        const payload = {
            estimate: {
                lineItems: estimateData.lineItems || [],
                subtotal: estimateData.subtotal || 0,
                tax: estimateData.tax || 0,
                total: estimateData.total || 0,
                timeline: estimateData.timeline || 'TBD'
            },
            formData: {
                trade: estimateData.tradeType || 'general',
                clientName: estimateData.clientName,
                clientEmail: estimateData.clientEmail,
                clientPhone: estimateData.clientPhone || '',
                address: estimateData.address,
                companyName: estimateData.companyName
            }
        };
        
        console.log('💳 Creating payment link with payload:', payload);
        
        const response = await fetch('https://roofbid-backend-production.up.railway.app/api/send-estimate-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error('Failed to create payment link');
        
        const result = await response.json();
        
        if (result.success && result.paymentLink) {
            alert(`✅ Payment link created!\\n\\n💳 ${result.paymentLink}`);
            
            if (confirm('Open payment link now?')) {
                window.open(result.paymentLink, '_blank');
            }
            
            if (navigator.clipboard) {
                navigator.clipboard.writeText(result.paymentLink);
                console.log('📋 Payment link copied to clipboard');
            }
        } else {
            throw new Error(result.error || 'No payment link returned');
        }
        
    } catch (error) {
        console.error('💥 Payment link error:', error);
        alert('❌ Failed to create payment link: ' + error.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
