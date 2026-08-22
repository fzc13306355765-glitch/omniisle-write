// 拆分项目通用工具入口：从旧 app-test 内联脚本拆出，保持行为不变。
(function(window) {
    'use strict';

    // 平板识别只看可用尺寸与触控能力，不依赖品牌、机型或 UA。
    // 屏幕短边可避免横屏手机被误判；布局宽度可让窄分屏继续使用手机版。
    if (!window.ZHIYU_RESPONSIVE_DEVICE) {
        const pointerMedia = window.matchMedia('(any-pointer: coarse)');
        const listeners = new Set();
        let currentLayout = '';
        let syncFrame = 0;

        function getDimensions() {
            const root = window.document?.documentElement;
            const viewportWidth = Math.max(
                Number(root?.clientWidth) || 0,
                Number(window.innerWidth) || 0
            );
            const viewportHeight = Math.max(
                Number(root?.clientHeight) || 0,
                Number(window.innerHeight) || 0
            );
            const screenWidth = Number(window.screen?.width) || viewportWidth;
            const screenHeight = Number(window.screen?.height) || viewportHeight;
            return {
                viewportWidth,
                viewportHeight,
                screenShortSide: Math.min(screenWidth, screenHeight),
                screenLongSide: Math.max(screenWidth, screenHeight)
            };
        }

        function hasTouchCapability() {
            return (Number(window.navigator?.maxTouchPoints) || 0) > 0 || pointerMedia.matches;
        }

        function isTabletHardware() {
            const size = getDimensions();
            return hasTouchCapability()
                && size.screenShortSide >= 600
                && size.screenLongSide <= 1440;
        }

        function isTablet() {
            const size = getDimensions();
            return isTabletHardware() && size.viewportWidth >= 600;
        }

        function getLayout() {
            if (isTablet()) return 'tablet';
            const size = getDimensions();
            if (hasTouchCapability() && (size.screenShortSide < 600 || isTabletHardware())) {
                return 'phone';
            }
            return 'desktop';
        }

        function sync() {
            syncFrame = 0;
            const nextLayout = getLayout();
            const root = window.document?.documentElement;
            if (root) root.dataset.zhiyuDevice = nextLayout;
            if (nextLayout === currentLayout) return nextLayout;
            currentLayout = nextLayout;
            listeners.forEach(function(listener) {
                try {
                    listener(nextLayout);
                } catch (error) {
                    window.console?.error?.('平板布局同步失败', error);
                }
            });
            return nextLayout;
        }

        function scheduleSync() {
            if (syncFrame) return;
            syncFrame = window.requestAnimationFrame(sync);
        }

        window.addEventListener('resize', scheduleSync, { passive: true });
        window.addEventListener('orientationchange', scheduleSync, { passive: true });
        if (typeof pointerMedia.addEventListener === 'function') {
            pointerMedia.addEventListener('change', scheduleSync);
        } else {
            pointerMedia.addListener?.(scheduleSync);
        }

        window.ZHIYU_RESPONSIVE_DEVICE = Object.freeze({
            getDimensions,
            getLayout,
            hasTouchCapability,
            isTabletHardware,
            isTablet,
            sync,
            subscribe(listener) {
                if (typeof listener !== 'function') return function() {};
                listeners.add(listener);
                return function() { listeners.delete(listener); };
            }
        });
        sync();
    }

    window.ZHIYU_UTILS = {
            escapeHtml(s) { const map={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}; return String(s).replace(/[&<>"']/g,c=>map[c]); },
            // 安全日志写入：所有 stepLog/logEl 必须通过此函数追加，禁止直接 innerHTML+=
            appendLog(container, text, type) {
                const div = document.createElement('div');
                const icons = { success: '✅ ', error: '❌ ', info: '📝 ', warn: '⚠️ ', progress: '⏳ ' };
                const colors = { success: '#27ae60', error: '#e74c3c', info: '#333', warn: '#e65100', progress: '#555' };
                div.style.color = colors[type] || '#333';
                div.textContent = (icons[type] || '') + text;
                if (typeof container === 'string') container = document.getElementById(container);
                if (container) {
                    container.appendChild(div);
                    trimExecutionLog(container);
                }
                return div;
            },
            // 正文和历史预览共用的富文本边界：只保留无属性的排版标签。
            // 通过 DOM 节点重新构造结果，文本节点交给浏览器编码，避免实体二次解析。
            sanitizeHTML(html) {
                if (!html) return '';
                const allowedTags = new Set([
                    'b', 'strong', 'i', 'em', 'u', 's', 'strike',
                    'span', 'br', 'p', 'div', 'blockquote', 'pre', 'code',
                    'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot',
                    'tr', 'th', 'td', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr'
                ]);
                const blockedTags = new Set([
                    'script', 'style', 'iframe', 'object', 'embed', 'svg',
                    'math', 'template', 'noscript', 'link', 'meta', 'base',
                    'form', 'input', 'button', 'textarea', 'select', 'option',
                    'audio', 'video', 'source', 'track', 'canvas'
                ]);
                const source = document.createElement('div');
                const output = document.createElement('div');
                source.innerHTML = String(html);
                const appendSafe = (node, parent, depth) => {
                    if (depth > 50) return;
                    if (node.nodeType === 3) {
                        parent.appendChild(document.createTextNode(node.nodeValue || ''));
                        return;
                    }
                    if (node.nodeType !== 1) return;
                    const tag = String(node.tagName || '').toLowerCase();
                    if (blockedTags.has(tag)) return;
                    if (!allowedTags.has(tag)) {
                        Array.from(node.childNodes || []).forEach(child => appendSafe(child, parent, depth + 1));
                        return;
                    }
                    const safeNode = document.createElement(tag);
                    if (tag === 'span') {
                        const normalizeColor = window.ZHIYU_RICH_TEXT_CONTRACT?.normalizeColor;
                        const color = typeof normalizeColor === 'function'
                            ? normalizeColor(node.style?.color)
                            : '';
                        if (color) safeNode.style.color = color;
                    }
                    Array.from(node.childNodes || []).forEach(child => appendSafe(child, safeNode, depth + 1));
                    parent.appendChild(safeNode);
                };
                Array.from(source.childNodes || []).forEach(node => appendSafe(node, output, 0));
                return output.innerHTML;
            },
            formatDate(d) { if (!d) return '-'; try { const dt = new Date(d); if (isNaN(dt.getTime())) return '-'; return dt.toISOString().slice(0,10); } catch(e) { return '-'; } },
            generateId() { return 'id_'+Date.now()+'_'+Math.random().toString(36).substr(2,9); },
            debounce(func, wait) { let t; return function(...args){ clearTimeout(t); t=setTimeout(()=>func.apply(this,args),wait); }; },
            // 清理 API 响应中混入的 JSON 元数据 / thinking 片段 / 转义字符
            cleanContent(text) {
                if (!text) return '';
                let s = text;
                // 剥离完整 JSON 对象/数组
                s = s.replace(/\{"id":"[^"]*"[^}]*\}/g, '');
                s = s.replace(/\{"type":"[^"]*"[^}]*\}/g, '');
                s = s.replace(/\{"delta":\{[^}]*\}\}/g, '');
                s = s.replace(/\{"signature":"[^"]*"\}/g, '');
                s = s.replace(/\{"text":"[^"]*"\}/g, '');
                // 剥离 usage/stop_reason/base_resp 等 API 元数据块
                s = s.replace(/\],"usage":\{[^}]*\}[^}]*\}[^}]*\}/g, '');
                s = s.replace(/"usage":\{[^}]*\}/g, '');
                s = s.replace(/"stop_reason":"[^"]*"/g, '');
                s = s.replace(/"base_resp":\{[^}]*\}/g, '');
                s = s.replace(/"cache_creation_input_tokens":\d+/g, '');
                s = s.replace(/"cache_read_input_tokens":\d+/g, '');
                s = s.replace(/"input_tokens":\d+/g, '');
                s = s.replace(/"output_tokens":\d+/g, '');
                s = s.replace(/"status_code":\d+/g, '');
                s = s.replace(/"status_msg":"[^"]*"/g, '');
                // 剥离残留的 JSON 结构字符
                s = s.replace(/"[a-z_]+":\d+/g, '');
                s = s.replace(/\{[^}]*"role":"assistant"[^}]*\}/g, '');
                s = s.replace(/\[|\]/g, '');
                // 清理残留的 JSON key-value 片段
                s = s.replace(/\{[^}]{0,3}\}/g, '');
                s = s.replace(/","/g, '');
                s = s.replace(/"type"\s*:\s*"text"\s*\}/g, '');
                s = s.replace(/\{\s*"text"\s*:\s*"/g, '');
                s = s.replace(/\{\s*"type"\s*:\s*"text"\s*,\s*"text"\s*:/g, '');
                s = s.replace(/"\s*\}/g, '');
                // 移除多余的引号和逗号残余
                s = s.replace(/^\s*"\s*,\s*/gm, '');
                s = s.replace(/,\s*"\s*$/gm, '');
                // 转义还原
                s = s.replace(/\\n/g, '\n');
                s = s.replace(/\\"/g, '"');
                s = s.replace(/\\t/g, '\t');
                // 移除连续空行
                s = s.replace(/\n{3,}/g, '\n\n');
                // 去除首尾空白和残留标点
                return s.replace(/^[\s,\}\]]+|[\s,\{\[]+$/g, '').trim();
            },
            // Markdown 转简单 HTML（支持表格、标题、列表）
            mdToHtml(md) {
                if (!md) return '';
                const lines = md.split('\n');
                let html = '<div style="font-size:14px;line-height:1.8;">', inTable = false, headerRow = true;
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (/^\|.*\|$/.test(line.trim())) {
                        if (!inTable) { html += '<table style="border-collapse:collapse;width:100%;margin:10px 0;font-size:13px;border:1px solid #bcc0c8;">'; inTable = true; headerRow = i+1 < lines.length && /^\|[\s\-:|]+\|$/.test(lines[i+1].trim()); }
                        if (/^\|[\s\-:|]+\|$/.test(line.trim())) continue; // skip separator row
                        const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
                        const tag = headerRow ? 'th' : 'td';
                        const style = 'border:1px solid #bcc0c8;padding:6px 12px;text-align:left;' + (tag === 'th' ? 'background:#32364a;color:#fff;font-weight:700;' : 'background:#fff;');
                        html += '<tr>' + cells.map(c => `<${tag} style="${style}">${Utils.escapeHtml(c)}</${tag}>`).join('') + '</tr>';
                        if (headerRow && cells.length > 0) headerRow = false;
                    } else {
                        if (inTable) { html += '</table>'; inTable = false; headerRow = true; }
                        if (line.startsWith('# ')) html += '<h3 style="margin:14px 0 8px;padding:8px 12px;background:#32364a;color:#fff;border-radius:6px;font-size:15px;">' + Utils.escapeHtml(line.slice(2)) + '</h3>';
                        else if (line.startsWith('## ')) html += '<h4 style="margin:12px 0 6px;padding:6px 10px;background:#e8ebf0;color:#333;border-left:4px solid #32364a;font-size:14px;font-weight:700;">' + Utils.escapeHtml(line.slice(3)) + '</h4>';
                        else if (/^[一二三四五六七八九十]、/.test(line.trim())) html += '<h4 style="margin:12px 0 6px;padding:6px 10px;background:#e8ebf0;color:#333;border-left:4px solid #32364a;font-size:14px;font-weight:700;">' + Utils.escapeHtml(line.trim()) + '</h4>';
                        else if (line.startsWith('- ')) html += '<div style="padding:2px 0 2px 16px;margin:1px 0;">• ' + Utils.escapeHtml(line.slice(2)) + '</div>';
                        else if (line.trim()) html += '<p style="margin:3px 0;">' + Utils.escapeHtml(line) + '</p>';
                        else html += '<br>';
                    }
                }
                if (inTable) html += '</table>';
                html += '</div>';
                return html;
            }
        };
    // 兼容仍通过旧全局名称调用通用工具的拆分模块。
    // 两个名称必须指向同一个对象，避免保存流程在写执行日志时中断。
    window.Utils = window.ZHIYU_UTILS;
})(window);
