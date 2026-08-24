(function(window, document) {
    'use strict';

    const state = {
        saving: false,
        saveState: 'idle',
        saveMessage: ''
    };

    function modelUsageKey() {
        const uid = String(window.AccountDataScope?.getActiveUid?.() || 'community-local');
        const now = new Date();
        const dateKey = window.ZHIYU_UTILS?.formatDate?.(now)
            || (now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0'));
        return 'zhiyu_local_model_usage:' + uid + ':' + dateKey;
    }

    function getTodayModelCallUsage() {
        try {
            return { used: Math.max(0, Number(localStorage.getItem(modelUsageKey()) || 0)) };
        } catch (_error) {
            return { used: 0 };
        }
    }

    function recordLocalModelCall() {
        const next = getTodayModelCallUsage().used + 1;
        try { localStorage.setItem(modelUsageKey(), String(next)); } catch (_error) {}
        return next;
    }

    function setSaveState(nextState, message) {
        state.saveState = String(nextState || 'idle');
        state.saveMessage = String(message || '');
        const button = document.getElementById('btnCommunitySave');
        if (!button) return;
        button.disabled = state.saving;
        button.dataset.saveState = state.saveState;
        button.dataset.syncState = state.saveState;
        button.setAttribute('aria-busy', String(state.saving));
        button.title = state.saveMessage || '立即保存当前章节';
        const label = button.querySelector('#communitySaveLabel');
        if (label) label.textContent = state.saving ? '保存中…' : '保存';
    }

    async function saveCurrentChapterNow() {
        if (state.saving) return false;
        if (typeof window.saveCurrentEditorContent !== 'function') {
            setSaveState('error', '保存模块尚未准备完成');
            window.ZHIYU_TOAST?.error?.('保存模块尚未准备完成，请刷新页面重试');
            return false;
        }
        state.saving = true;
        setSaveState('saving', '正在保存');
        try {
            const saved = await window.saveCurrentEditorContent(false);
            setSaveState(saved ? 'success' : 'error', saved ? '保存成功' : '保存失败');
            if (saved) window.ZHIYU_TOAST?.success?.('已保存到当前浏览器');
            return !!saved;
        } catch(error) {
            const message = String(error?.message || '保存失败，当前内容仍保留在编辑器中');
            setSaveState('error', message);
            window.ZHIYU_TOAST?.error?.(message);
            return false;
        } finally {
            state.saving = false;
            setSaveState(state.saveState, state.saveMessage);
        }
    }

    function ensureSidebarActions() {
        const syncBar = document.getElementById('syncBar');
        if (!syncBar || syncBar.dataset.communityReady === 'true') return syncBar;
        const themeToggle = document.getElementById('sidebarDarkModeToggle');
        if (themeToggle) {
            themeToggle.className = 'sidebar-theme-quick';
            themeToggle.innerHTML = ''
                + '<span class="sidebar-theme-quick-track" aria-hidden="true">'
                + '<svg class="sidebar-theme-icon sidebar-theme-icon-sun" viewBox="0 0 24 24">'
                + '<circle cx="12" cy="12" r="3.5"></circle>'
                + '<path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"></path>'
                + '</svg>'
                + '<svg class="sidebar-theme-icon sidebar-theme-icon-moon" viewBox="0 0 24 24">'
                + '<path d="M19.5 15.4A8 8 0 0 1 8.6 4.5 8.1 8.1 0 1 0 19.5 15.4z"></path>'
                + '<path d="M17.7 4.1v2.4M16.5 5.3h2.4M20.3 8.2v1.6M19.5 9h1.6"></path>'
                + '</svg></span>'
                + '<span class="sr-only" id="sidebarDarkModeState">当前为日间模式</span>';
        }
        const actions = document.createElement('div');
        actions.className = 'cloud-sidebar-actions';
        const saveButton = document.createElement('button');
        saveButton.id = 'btnCommunitySave';
        saveButton.type = 'button';
        saveButton.className = 'cloud-sidebar-btn';
        saveButton.title = '立即保存当前章节';
        saveButton.setAttribute('aria-label', '立即保存当前章节');
        saveButton.setAttribute('aria-busy', 'false');
        saveButton.innerHTML = ''
            + '<svg class="cloud-sidebar-icon cloud-sync-icon" viewBox="0 0 24 24" aria-hidden="true">'
            + '<path d="M20 7h-5V2"></path><path d="M20 7l-3.6-3.2A8 8 0 0 0 4.7 7"></path>'
            + '<path d="M4 17h5v5"></path><path d="M4 17l3.6 3.2A8 8 0 0 0 19.3 17"></path>'
            + '</svg><span id="communitySaveLabel">保存</span>';
        saveButton.addEventListener('click', saveCurrentChapterNow);
        actions.appendChild(saveButton);
        syncBar.replaceChildren(actions);
        if (themeToggle) syncBar.appendChild(themeToggle);
        syncBar.dataset.communityReady = 'true';
        syncBar.dataset.cloudCenterReady = 'true';
        syncBar.style.display = 'block';
        return syncBar;
    }

    function updateCommunityNotice() {
        const target = document.querySelector('#overviewAnnouncementBar .overview-announcement-text, #overviewAnnouncementBar .legacy-version-announcement-track');
        if (!target) return;
        const message = '';
        target.textContent = message;
        target.title = message;
        target.style.animation = 'none';
    }

    function renderCommunityIdentity() {
        const level = document.getElementById('userCreditsDisplay');
        if (level) level.textContent = '社区版 · 本地模式';
        const member = document.getElementById('upMemberStatus');
        if (member) member.textContent = '社区版 · 本地模式';
    }

    function init() {
        ensureSidebarActions();
        updateCommunityNotice();
        renderCommunityIdentity();
        document.getElementById('btnOpenHotList')?.addEventListener('click', function() {
            window.ZHIYU_TOAST?.show?.('社区版不提供联网榜单，请使用“导入本地作品”');
        });
        return true;
    }

    window.getTodayModelCallUsage = getTodayModelCallUsage;
    window.recordLocalModelCall = recordLocalModelCall;
    window.openUserPanel = function() {
        window.ZHIYU_TOAST?.show?.('当前为社区版本地身份；无需登录，作品只保存在这个浏览器中');
    };
    window.updateLatestNoticeBar = updateCommunityNotice;
    window.ZhiyuLocalSaveCenter = {
        init,
        open: function() {
            window.ZHIYU_TOAST?.show?.('社区版只使用本地保存');
        },
        refresh: function() {},
        reflectSaveState: function(nextState) {
            const status = String(nextState?.status || nextState || 'idle');
            const message = String(nextState?.message || '');
            setSaveState(status, message);
        },
        saveCurrentChapterNow,
        syncCurrentChapter: saveCurrentChapterNow,
        getState: function() { return { ...state }; }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})(window, document);
