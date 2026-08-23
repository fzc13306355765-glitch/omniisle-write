// Split project current user module.
// Reads and writes local current-user identity helpers used by frontend display code.
(function(window) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE || {};

        function getCurrentUserId(){
            if (window.document?.body?.classList.contains('zhiyu-outline-tutorial-active')) return 'tutorial_demo_user';
            if (AppState.auth.isLoggedIn && AppState.auth.uid) return AppState.auth.uid;
            let uid=localStorage.getItem('novel_user_id');
            if(!uid){ uid='user_'+Date.now()+'_'+Math.random().toString(36).substr(2,9); localStorage.setItem('novel_user_id',uid); }
            return uid;
        }

        function getCurrentUserName(){
            if (AppState.auth.isLoggedIn && AppState.auth.displayName) return AppState.auth.displayName;
            return localStorage.getItem('novel_user_name')||'用户';
        }

        function setCurrentUserName(name){
            localStorage.setItem('novel_user_name',name);
        }

    window.getCurrentUserId = getCurrentUserId;
    window.getCurrentUserName = getCurrentUserName;
    window.setCurrentUserName = setCurrentUserName;
})(window);
