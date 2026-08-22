// 拆分项目写作页按钮状态模块。
// 只负责前端按钮标题、禁用、忙碌和成功状态，不改变 AI、保存或后端调用逻辑。
(function(window) {
    'use strict';

    const AppState = window.ZHIYU_APP_STATE || {};

const WRITE_BUTTON_TITLES = window.ZHIYU_WRITE_BUTTON_TITLES || {};

        function applyWriteButtonTooltips() {
            Object.keys(WRITE_BUTTON_TITLES).forEach(function(id) {
                const el = document.getElementById(id);
                if (el) el.title = WRITE_BUTTON_TITLES[id];
            });
            document.querySelectorAll('#page-write .action-tab-btn').forEach(function(btn) {
                const tab = btn.dataset.tab;
                if (tab === 'fineOutline') btn.title = '生成、编辑并保存章节细纲';
                else if (tab === 'decompose') btn.title = '拆解正文结构、人物关系和可借鉴写法';
                else if (tab === 'aiPolish') btn.title = 'AI检测或消痕，降低套话和AI味';
            });
            document.querySelectorAll('#page-write .og-file-stack').forEach(function(stack) {
                stack.title = stack.dataset.stack === 'linked' ? '查看当前关联的参考文件' : '查看当前导入或拆分的章节';
            });
            updateOGSendIdleTitle();
        }

        function resetConfirmUseVisual(btn) {
            btn = btn || document.getElementById('btnConfirm');
            if (!btn) return;
            btn.classList.remove('confirm-use-busy', 'confirm-use-success', 'confirm-use-error');
            delete btn.dataset.confirmUseState;
        }

        function setConfirmUseState(state) {
            const btn = document.getElementById('btnConfirm');
            if (!btn) return;
            resetConfirmUseVisual(btn);
            const map = {
                ready: { text: '确定使用', disabled: false, title: '确认采用当前生成正文，并同步更新记忆库' },
                generating: { text: '确定使用', disabled: true, title: '本章正文生成完成后才能确定使用', cls: 'confirm-use-busy' },
                using: { text: '使用中', disabled: true, title: '正在分析本章并更新记忆库，请稍候', cls: 'confirm-use-busy' },
                success: { text: '使用成功', disabled: false, title: '本章已确认使用，记忆库已同步', cls: 'confirm-use-success' },
                error: { text: '重试使用', disabled: false, title: '上次同步失败，点击可重新保存并更新记忆库', cls: 'confirm-use-error' }
            };
            const cfg = map[state] || map.ready;
            btn.textContent = cfg.text;
            btn.disabled = !!cfg.disabled;
            btn.title = cfg.title;
            btn.dataset.confirmUseState = state;
            if (cfg.cls) btn.classList.add(cfg.cls);
        }

        function setPlotSendWorking(isWorking) {
            const btn = document.getElementById('btnPlotSend');
            if (!btn) return;
            btn.textContent = isWorking ? '□' : '↑';
            btn.classList.toggle('is-working', !!isWorking);
            btn.disabled = false;
            btn.title = isWorking ? 'AI反馈正在生成，点击停止' : '发送当前输入给AI反馈';
            btn.setAttribute('aria-busy', isWorking ? 'true' : 'false');
        }

        function getOGSendIdleTitle() {
            const tab = AppState?.outlineGen?.activeTab || 'fineOutline';
            if (tab === 'decompose') return '开始拆书分析';
            if (tab === 'aiPolish') return '开始AI消痕或检测';
            return '开始生成细纲';
        }

        function updateOGSendIdleTitle() {
            const btn = document.getElementById('btnOGSend');
            if (btn && btn.getAttribute('aria-busy') !== 'true') btn.title = getOGSendIdleTitle();
        }

        function setOGSendWorking(isWorking, label) {
            const btn = document.getElementById('btnOGSend');
            if (!btn) return;
            btn.textContent = isWorking ? '□' : '↑';
            btn.classList.toggle('is-working', !!isWorking);
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.title = isWorking ? ((label || 'AI任务') + '正在工作，点击停止') : getOGSendIdleTitle();
            btn.setAttribute('aria-busy', isWorking ? 'true' : 'false');
            const modelBtn = document.getElementById('btnActionModelSelect');
            if (modelBtn) {
                modelBtn.disabled = !!isWorking;
                modelBtn.style.opacity = isWorking ? '0.65' : '1';
            }
        }

        function getActiveActionController() {
            const tab = AppState?.outlineGen?.activeTab || 'fineOutline';
            if (tab === 'decompose') return AppState.outlineGen.dcAbortController;
            if (tab === 'aiPolish') return AppState.outlineGen.apAbortController;
            return AppState.outlineGen.ogAbortController;
        }

        function stopActiveActionGeneration() {
            const tab = AppState?.outlineGen?.activeTab || 'fineOutline';
            if (tab === 'decompose') stopDCGeneration();
            else if (tab === 'aiPolish') stopAPGeneration();
            else stopOGGeneration();
        }

        // ===== 测试版：格式约束提示词 =====

    window.applyWriteButtonTooltips = applyWriteButtonTooltips;
    window.resetConfirmUseVisual = resetConfirmUseVisual;
    window.setConfirmUseState = setConfirmUseState;
    window.setPlotSendWorking = setPlotSendWorking;
    window.getOGSendIdleTitle = getOGSendIdleTitle;
    window.updateOGSendIdleTitle = updateOGSendIdleTitle;
    window.setOGSendWorking = setOGSendWorking;
    window.getActiveActionController = getActiveActionController;
    window.stopActiveActionGeneration = stopActiveActionGeneration;
})(window);
