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
  }
};

export const handleIframeAuthRedirect = (): void => {
  if (isInIframe()) {
    // In iframe mode, we need to handle auth redirects differently
    console.log('[Iframe Mode] Auth redirect handling active');
  }
};