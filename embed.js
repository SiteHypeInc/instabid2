/**
 * InstaBid Embed Loader
 * Drop this script on any page to load the InstaBid calculator
 * Usage: <script src="https://white-raven-264519.hostingersite.com/embed.js" data-api-key="YOUR_KEY"></script>
 */

(function() {
  // Get the script tag that loaded this file
  const scriptTag = document.currentScript || document.querySelector('script[src*="embed.js"]');
  const apiKey = scriptTag.getAttribute('data-api-key');
  const containerId = scriptTag.getAttribute('data-container') || 'instabid-calculator';
  
  if (!apiKey) {
    console.error('❌ InstaBid Error: data-api-key attribute is required');
    return;
  }
  
  console.log('🚀 InstaBid: Initializing with API key:', apiKey);
  
  // Create container if it doesn't exist
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    scriptTag.parentNode.insertBefore(container, scriptTag);
  }
  
  // Create iframe
  const iframe = document.createElement('iframe');
  iframe.src = `https://white-raven-264519.hostingersite.com/estimate/?key=${apiKey}&embed=true`;
  iframe.style.width = '100%';
  iframe.style.height = '900px';
  iframe.style.border = 'none';
  iframe.style.overflow = 'hidden';
  iframe.setAttribute('scrolling', 'no');
  
  // Auto-resize iframe based on content (if same origin)
  iframe.addEventListener('load', function() {
    try {
      // Attempt to resize based on content
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      const resizeIframe = function() {
        iframe.style.height = iframeDoc.body.scrollHeight + 'px';
      };
      
      resizeIframe();
      
      // Watch for changes
      if (window.ResizeObserver) {
        new ResizeObserver(resizeIframe).observe(iframeDoc.body);
      }
    } catch (e) {
      // Cross-origin - can't access content
      console.log('📏 InstaBid: Using fixed height (cross-origin)');
    }
  });
  
  container.appendChild(iframe);
  
  console.log('✅ InstaBid: Loaded successfully');
  
})();