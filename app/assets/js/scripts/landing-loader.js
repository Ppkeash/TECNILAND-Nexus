/**
 * Landing Loader - Prevents double loading of landing.js
 * This file should be loaded instead of landing.js directly
 */

(function() {
    'use strict'
    
    if (window.__LANDING_JS_LOADED__) {
        console.warn('[LANDING LOADER] landing.js already loaded, skipping.')
        return
    }
    
    console.log('[LANDING LOADER] Loading landing.js for the first time')
    
    // Dynamically load landing.js
    const script = document.createElement('script')
    script.src = './assets/js/scripts/landing.js'
    script.async = false
    document.body.appendChild(script)
})()
