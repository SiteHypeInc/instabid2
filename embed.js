(function() {
  const scriptTag = document.currentScript || document.querySelector('script[src*="embed.js"]');
  const apiKey = scriptTag.getAttribute('data-api-key');
  const containerId = scriptTag.getAttribute('data-container') || 'instabid-calculator';
  
  if (!apiKey) {
    console.error('❌ InstaBid: data-api-key required');
    return;
  }
  
  console.log('🚀 InstaBid: Loading...');
  
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    scriptTag.parentNode.insertBefore(container, scriptTag);
  }
  
  const iframe = document.createElement('iframe');
  iframe.src = `https://instabid.pro/calculator/?key=${apiKey}&embed=true`;
  iframe.style.width = '100%';
  iframe.style.height = '2500px';
  iframe.style.border = 'none';
  iframe.style.setProperty('overflow', 'visible', 'important');
  iframe.setAttribute('scrolling', 'yes');

  window.addEventListener('message', function(e) {
    if (e.data.type === 'instabid-resize') {
      iframe.style.height = e.data.height + 'px';
      console.log('✅ InstaBid: Resized to', e.data.height + 'px');
    }
  });
  
  container.appendChild(iframe);
  console.log('✅ InstaBid: Loaded');
})();