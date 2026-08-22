// 拆分项目基础反馈入口：Toast、Confirm、Prompt、Modal。
// 这几个对象从旧 app-test 内联脚本拆出，保持原行为不变。
(function(window) {
    'use strict';

    const Utils = window.ZHIYU_UTILS || {};
    const TOPMOST_FEEDBACK_Z_INDEX = '2147483646';

// =================== [2] Toast 通知 + Confirm 确认框 ===================
        const Toast = (function() {
            let _timer = null;
            const _el = document.createElement('div');
            _el.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:' + TOPMOST_FEEDBACK_Z_INDEX + ';max-width:380px;padding:12px 24px;border-radius:10px;font-size:14px;color:#fff;opacity:0;transition:all 0.3s;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,0.15);text-align:center;';
            document.body.appendChild(_el);

            function _show(msg, bg, duration) {
                clearTimeout(_timer);
                _el.textContent = msg;
                _el.style.background = bg;
                _el.style.opacity = '1';
                _el.style.transform = 'translateX(-50%) translateY(0)';
                _timer = setTimeout(() => { _el.style.opacity = '0'; _el.style.transform = 'translateX(-50%) translateY(-10px)'; }, duration || 2500);
            }

            return {
                show(msg) { _show(msg, '#333', 2500); },
                success(msg) { _show(msg, '#2e7d32', 2500); },
                error(msg) { _show(msg, '#c62828', 3500); },
                warn(msg) { _show(msg, '#e65100', 3000); }
            };
        })();

        const Confirm = {
            show(msg, options) {
                return new Promise(function(resolve) {
                    const opts = options || {};
                    const overlay = document.createElement('div');
                    const rebuild = opts.variant === 'outline-rebuild';
                    const acknowledgeOnly = opts.acknowledgeOnly === true;
                    overlay.dataset.appConfirmOverlay = 'true';
                    overlay.className = rebuild
                        ? 'outline-rebuild-confirm-overlay'
                        : 'feedback-overlay feedback-confirm-overlay';
                    if (!rebuild) {
                        const requestedZIndex = Number(opts.zIndex);
                        const zIndex = Number.isFinite(requestedZIndex) && requestedZIndex > 0
                            ? String(Math.floor(requestedZIndex))
                            : '2147483000';
                        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:' + zIndex + ';display:flex;align-items:center;justify-content:center;';
                    }
                    const renderItems = function(items) {
                        return (items || []).map(function(item) { return '<li>' + Utils.escapeHtml(item) + '</li>'; }).join('');
                    };
                    overlay.innerHTML = rebuild
                        ? `<div class="outline-rebuild-confirm" role="dialog" aria-modal="true" aria-labelledby="outlineRebuildConfirmTitle" aria-describedby="outlineRebuildConfirmDesc">
                            <div class="outline-rebuild-confirm-head"><div class="outline-rebuild-confirm-icon" aria-hidden="true">!</div><div><h3 id="outlineRebuildConfirmTitle">${Utils.escapeHtml(opts.title || '确认保存')}</h3><p class="outline-rebuild-confirm-desc" id="outlineRebuildConfirmDesc">${Utils.escapeHtml(msg)}</p></div></div>
                            <div class="outline-rebuild-confirm-subject"><strong>${Utils.escapeHtml(opts.subject || '')}</strong></div>
                            <div class="outline-rebuild-confirm-grid"><section><h4>将重新生成</h4><ul>${renderItems(opts.replaceItems)}</ul></section><section class="is-safe"><h4>不会删除</h4><ul>${renderItems(opts.keepItems)}</ul></section></div>
                            <div class="outline-rebuild-confirm-actions"><button class="btn btn-outline" id="_cfmCancel">${Utils.escapeHtml(opts.cancelText || '取消')}</button><button class="btn btn-dark" id="_cfmOk">${Utils.escapeHtml(opts.confirmText || '确认')}</button></div>
                        </div>`
                        : `<div class="feedback-dialog feedback-confirm-dialog" role="dialog" aria-modal="true" style="border-radius:16px;padding:24px;min-width:320px;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,0.2);text-align:center;"><div class="feedback-dialog-message" style="font-size:15px;margin-bottom:20px;line-height:1.6;white-space:pre-line;">${Utils.escapeHtml(msg)}</div><div style="display:flex;gap:10px;justify-content:center;">${acknowledgeOnly ? '' : '<button class="btn btn-outline btn-sm" id="_cfmCancel">取消</button>'}<button class="btn btn-dark btn-sm" id="_cfmOk">${Utils.escapeHtml(opts.confirmText || '确认')}</button></div></div>`;
                    document.body.appendChild(overlay);
                    overlay.querySelector('#_cfmOk').addEventListener('click', function() { overlay.remove(); resolve(true); });
                    overlay.querySelector('#_cfmCancel')?.addEventListener('click', function() { overlay.remove(); resolve(false); });
                    overlay.addEventListener('click', function(e) {
                        if (!acknowledgeOnly && e.target === overlay) { overlay.remove(); resolve(false); }
                    });
                    overlay.querySelector('#_cfmOk')?.focus();
                });
            }
        };

        const Prompt = {
            show(msg, defaultVal) {
                return new Promise(function(resolve) {
                    const overlay = document.createElement('div');
                    overlay.className = 'feedback-overlay feedback-prompt-overlay';
                    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:2147483000;display:flex;align-items:center;justify-content:center;';
                    overlay.innerHTML = `<div class="feedback-dialog feedback-prompt-dialog" role="dialog" aria-modal="true" style="border-radius:16px;padding:24px;min-width:320px;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
                        <div class="feedback-dialog-message" style="font-size:15px;margin-bottom:14px;">${Utils.escapeHtml(msg)}</div>
                        <input class="feedback-dialog-input" type="text" id="_pmtInput" value="${Utils.escapeHtml(defaultVal||'')}" style="width:100%;padding:10px;border-radius:10px;font-size:14px;margin-bottom:16px;">
                        <div style="display:flex;gap:10px;justify-content:flex-end;">
                            <button class="btn btn-outline btn-sm" id="_pmtCancel">取消</button>
                            <button class="btn btn-dark btn-sm" id="_pmtOk">确认</button>
                        </div>
                    </div>`;
                    document.body.appendChild(overlay);
                    const input = overlay.querySelector('#_pmtInput');
                    input.focus();
                    overlay.querySelector('#_pmtOk').addEventListener('click', function() { overlay.remove(); resolve(input.value.trim()); });
                    overlay.querySelector('#_pmtCancel').addEventListener('click', function() { overlay.remove(); resolve(null); });
                    overlay.addEventListener('click', function(e) { if (e.target === overlay) { overlay.remove(); resolve(null); } });
                    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') { overlay.remove(); resolve(input.value.trim()); } });
                });
            }
        };

        // =================== [3] Modal 弹窗工具 ===================
        const Modal = {
            open(id) {
                const el = document.getElementById(id);
                if (el) el.style.display = 'flex';
            },
            close(id) {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            },
            closeAll() {
                document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
            }
        };

    window.ZHIYU_TOAST = Toast;
    window.ZHIYU_TOPMOST_FEEDBACK_Z_INDEX = TOPMOST_FEEDBACK_Z_INDEX;
    window.ZHIYU_CONFIRM = Confirm;
    window.ZHIYU_PROMPT = Prompt;
    window.ZHIYU_MODAL = Modal;
    // 兼容页面中保留的内联弹窗入口；拆分模块统一以 ZHIYU_MODAL 为主。
    window.Modal = Modal;
})(window);
