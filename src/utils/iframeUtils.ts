// Utility functions for iframe detection and handling

export const isInIframe = (): boolean => {
  try {
    return window.self !== window.top;
  } catch (e) {
    // If we can't access window.top due to cross-origin restrictions, we're likely in an iframe
    return true;
  }
};

export const logIframeInfo = (): void => {
  if (isInIframe()) {
    console.log('[Iframe Mode] App is running in an iframe');
    console.log('[Iframe Mode] User agent:', navigator.userAgent);
    console.log('[Iframe Mode] Location:', window.location.href);
    console.log('[Iframe Mode] Parent origin:', document.referrer);
    
    // Add error listeners to catch iframe-specific issues
    window.addEventListener('error', (e) => {
      console.error('[Iframe Mode] Error:', e.error, e.message);
    });
    
    window.addEventListener('unhandledrejection', (e) => {
      console.error('[Iframe Mode] Unhandled rejection:', e.reason);
    });
    
    // Log if the page becomes hidden
    document.addEventListener('visibilitychange', () => {
      console.log('[Iframe Mode] Visibility changed:', document.hidden ? 'hidden' : 'visible');
    });
  }
};

export const handleIframeAuthRedirect = (): void => {
  if (isInIframe()) {
    // In iframe mode, we need to handle auth redirects differently
    console.log('[Iframe Mode] Auth redirect handling active');
  }
};