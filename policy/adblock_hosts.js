/**
 * Ad/tracker host patterns for optional permissions.
 * These are requested when user enables adblock features.
 * 
 * IMPORTANT: Keep this list in sync with:
 * - manifest.json optional_host_permissions
 * - rules/basic_block.json
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

/**
 * Extended host list for cosmetic blocking.
 * These are additional domains blocked when cosmetic filtering is enabled.
 */
export const COSMETIC_HOSTS = [
  // Session Recording & Heatmaps
  "*://*.clarity.ms/*",
  "*://*.mouseflow.com/*",
  "*://*.luckyorange.com/*",
  "*://*.crazyegg.com/*",
  "*://*.inspectlet.com/*",
  "*://*.logrocket.com/*",
  
  // Analytics
  "*://*.heap-analytics.com/*",
  "*://*.amplitude.com/*",
  "*://*.plausible.io/*",
  
  // Data Management Platforms
  "*://*.demdex.net/*",
  "*://*.omtrdc.net/*",
  "*://*.bluekai.com/*",
  "*://*.liveramp.com/*",
  "*://*.rlcdn.com/*",
  "*://*.krxd.net/*",
  "*://*.eyeota.net/*",
  "*://*.exelator.com/*",
  "*://*.mookie1.com/*",
  
  // Social Platform Ads
  "*://*.ads.linkedin.com/*",
  "*://*.snap.licdn.com/*",
  "*://*.ads.pinterest.com/*",
  "*://*.analytics.tiktok.com/*",
  "*://*.ads.tiktok.com/*",
  "*://*.tr.snapchat.com/*"
];

/**
 * All hosts combined for permission requests
 */
export const ALL_ADBLOCK_HOSTS = [...ADBLOCK_HOSTS, ...COSMETIC_HOSTS];
