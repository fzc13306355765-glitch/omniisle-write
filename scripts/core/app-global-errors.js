// Global browser error logging split from app-main.js.
// This module only reports unexpected runtime errors to the console.
(function(window) {
  'use strict';

       // ===== 全局错误捕获 =====
window.addEventListener('error', (e) => {
    console.error('[Global Error]', e.error?.stack || e.error || e.message || e);
});
window.addEventListener('unhandledrejection', (e) => {
    console.error('[Unhandled Promise]', e.reason?.stack || e.reason);
});

  window.ZHIYU_GLOBAL_ERRORS_READY = true;
})(window);
