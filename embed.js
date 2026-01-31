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
  iframe.src = `https://white-raven-264519.hostingersite.com/estimate/?key=${apiKey}`;
  iframe.style.width = '100%';
  iframe.style.height = '1600px';
  iframe.style.border = 'none';
  iframe.style.overflow = 'hidden';
  iframe.setAttribute('scrolling', 'no');
  
  // Listen for height messages from iframe
  window.addEventListener('message', function(e) {
    if (e.data.type === 'instabid-resize') {
      iframe.style.height = e.data.height + 'px';
      console.log('✅ InstaBid: Resized to', e.data.height + 'px');
    }
  });
  
  container.appendChild(iframe);
  console.log('✅ InstaBid: Loaded');
})();