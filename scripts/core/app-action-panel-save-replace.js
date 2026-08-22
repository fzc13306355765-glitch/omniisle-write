// ===== 细纲/拆书结果应用 =====
        // 兼容旧调用名；AI消痕的结算、正文变化确认和应用均由专用模块处理。
        async function confirmReplaceToBody() {
            if (typeof window.applyNaturalizeResult !== 'function') {
                ACTION_PANEL_TOAST.warn('AI消痕功能尚未初始化完成，请刷新页面后重试');
                return false;
            }
            return await window.applyNaturalizeResult();
        }
