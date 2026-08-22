(function(window, document) {
    'use strict';

    const state = {
        saving: false,
        saveState: 'idle',
        saveMessage: ''
    };

    function modelUsageKey() {
        const uid = String(window.AccountDataScope?.getActiveUid?.() || 'community-local');
        return 'zhiyu_local_model_usage:' + uid + ':' + new Date().toISOString().slice(0, 10);
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
        button.title = state.saveMessage || '立即保存当前章节';
        button.textContent = state.saving ? '保存中…' : '立即保存当前章节';
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
        const saveButton = document.createElement('button');
        saveButton.id = 'btnCommunitySave';
        saveButton.type = 'button';
        saveButton.textContent = '立即保存当前章节';
        saveButton.title = '立即保存当前章节';
        saveButton.style.cssText = 'padding:5px 8px;font-size:12px;background:none;color:rgba(255,255,255,.82);border:1px solid rgba(255,255,255,.22);border-radius:7px;cursor:pointer;';
        saveButton.addEventListener('click', saveCurrentChapterNow);
        syncBar.replaceChildren(saveButton);
        if (themeToggle) syncBar.appendChild(themeToggle);
        syncBar.dataset.communityReady = 'true';
        syncBar.style.display = 'block';
        return syncBar;
    }

    function updateCommunityNotice() {
        const target = document.querySelector('#overviewAnnouncementBar .overview-announcement-text, #overviewAnnouncementBar .legacy-version-announcement-track');
        if (!target) return;
        const message = '社区版：作品保存在当前浏览器，请定期导出备份';
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
