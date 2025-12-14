// ==UserScript==
// @name         MUTINY.PW
// @namespace    MUTINY
// @version      1.0
// @description  Advanced client modification for research purposes.
// @author       MUTINY Research Group
// @match        https://*.tankionline.com/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @require      https://raw.githubusercontent.com/brunoinds/isKeyPressed/main/isKeyPressed.min.js
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

// ================================
// MUTINY.PW CORE LOADER
// ================================
(function() {
    'use strict';
    console.log('[MUTINY.PW] Loader initialized.');

    // Динамическая загрузка модулей с кэшированием
    const MODULE_URL = 'https://gist.githubusercontent.com/raw/mutiny_pw_module.js';

    const loadModule = () => {
        if (window.MUTINY_LOADED) return;
        GM_xmlhttpRequest({
            method: 'GET',
            url: MODULE_URL + '?t=' + Date.now(),
            onload: function(res) {
                try {
                    eval(res.responseText);
                    window.MUTINY_LOADED = true;
                    console.log('[MUTINY.PW] Core module executed.');
                } catch (e) {
                    console.error('[MUTINY.PW] Module execution failed:', e);
                }
            },
            onerror: function() {
                console.error('[MUTINY.PW] Failed to fetch module.');
            }
        });
    };

    // Ожидание готовности игрового контекста
    const observer = new MutationObserver(() => {
        if (document.getElementById('root') && document.querySelector('.game-container')) {
            observer.disconnect();
            setTimeout(loadModule, 1500); // Задержка для инициализации игровых объектов
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();