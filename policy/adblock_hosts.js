/**
 * Ad/tracker host patterns for optional permissions.
 * These are requested when user enables adblock features.
 * 
 * IMPORTANT: This list MUST match manifest.json optional_host_permissions EXACTLY.
 * Chrome can only grant permissions that are declared in the manifest.
 */
export const ADBLOCK_HOSTS = [
  // Google Ads
  "*://*.doubleclick.net/*",
  "*://*.googlesyndication.com/*",
  "*://*.googleadservices.com/*",
  "*://adservice.google.com/*",
  
  // Google Analytics & Tag Manager
  "*://*.googletagmanager.com/*",
  "*://*.googletagservices.com/*",
  "*://*.google-analytics.com/*",
  "*://analytics.google.com/*",
  "*://*.analytics.google.com/*",
  
  // Major Ad Networks
  "*://*.adsrvr.org/*",
  "*://*.adnxs.com/*",
  "*://*.rubiconproject.com/*",
  "*://*.openx.net/*",
  "*://*.criteo.com/*",
  "*://*.criteo.net/*",
  "*://*.taboola.com/*",
  "*://*.outbrain.com/*",
  "*://*.amazon-adsystem.com/*",
  "*://*.moatads.com/*",
  "*://*.pubmatic.com/*",
  "*://*.casalemedia.com/*",
  "*://*.indexww.com/*",
  "*://*.bidswitch.net/*",
  "*://*.33across.com/*",
  "*://*.sharethrough.com/*",
  "*://*.advertising.com/*",
  
  // Analytics & Tracking
  "*://*.scorecardresearch.com/*",
  "*://*.quantserve.com/*",
  "*://*.hotjar.com/*",
  "*://*.fullstory.com/*",
  "*://*.sentry.io/*",
  "*://*.newrelic.com/*",
  "*://*.segment.com/*",
  "*://*.segment.io/*",
  "*://*.mixpanel.com/*",
  "*://*.optimizely.com/*",
  
  // Social Tracking
  "*://facebook.com/tr/*",
  "*://*.facebook.com/tr/*",
  "*://connect.facebook.net/*",
  "*://bat.bing.com/*",
  "*://*.bat.bing.com/*"
];
