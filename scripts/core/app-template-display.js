// 拆分项目模板展示工具模块。
// 只负责模板点赞/使用次数和记忆库线框图标渲染，不改变数据和后端逻辑。
(function(window) {
    'use strict';

function _metricNumber(v) {
            const n = Number(v);
            return Number.isFinite(n) && n > 0 ? n : 0;
        }
        const OFFICIAL_TEMPLATE_AVATAR = './LOGO-256.png';
        function isOfficialTemplate(t) {
            return t?.builtIn === true || t?.isOfficial === true || t?.official === true;
        }
        function getTemplateLikeCount(t) {
            if (!t) return 0;
            return Math.max(
                _metricNumber(t.likes),
                _metricNumber(t.likeCount),
                _metricNumber(t.likedCount),
                _metricNumber(t.totalLikes),
                _metricNumber(t.stats?.likes),
                _metricNumber(t.stats?.likeCount)
            );
        }
        function getTemplateUsageCount(t) {
            if (!t) return 0;
            return Math.max(
                _metricNumber(t.usageCount),
                _metricNumber(t.useCount),
                _metricNumber(t.usedCount),
                _metricNumber(t.totalUsage),
                _metricNumber(t.stats?.usageCount),
                _metricNumber(t.stats?.useCount)
            );
        }
        function getTemplateAuthorName(t) {
            return String(t?.author || (t?.builtIn ? '官方' : '用户')).trim() || '用户';
        }
        function getTemplateAuthorAvatar(t) {
            if (isOfficialTemplate(t)) return OFFICIAL_TEMPLATE_AVATAR;
            const value = String(t?.authorAvatar || t?.creatorAvatar || '').trim();
            return /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value) ? value : '';
        }
        function createTemplateAuthorAvatar(t, extraClass) {
            const avatar = document.createElement('span');
            avatar.className = 'template-author-avatar' + (extraClass ? ' ' + extraClass : '');
            // 悬停只说明作者，不把“头像”当作一项功能提示。
            const official = isOfficialTemplate(t);
            avatar.title = official ? '知屿写作' : getTemplateAuthorName(t) + '用户';
            const fallback = function() {
                avatar.classList.add('is-placeholder');
                avatar.textContent = getTemplateAuthorName(t).charAt(0).toUpperCase() || '?';
            };
            const source = getTemplateAuthorAvatar(t);
            if (!source) {
                fallback();
                return avatar;
            }
            const image = document.createElement('img');
            image.src = source;
            image.alt = official ? '知屿写作' : getTemplateAuthorName(t) + '的头像';
            image.loading = 'lazy';
            image.addEventListener('error', fallback, { once: true });
            avatar.appendChild(image);
            return avatar;
        }
        function renderTemplateSelectionButton(target, template, options) {
            const button = typeof target === 'string' ? document.getElementById(target) : target;
            if (!button) return null;
            const opts = options || {};
            let label = opts.labelElement
                || (opts.labelId ? document.getElementById(opts.labelId) : null)
                || button.querySelector('.template-selection-button-label');
            if (!label) {
                button.replaceChildren();
                label = document.createElement('span');
                label.className = 'template-selection-button-label';
                button.appendChild(label);
            } else {
                label.classList.add('template-selection-button-label');
            }
            let avatarSlot = button.querySelector('.template-selection-button-avatar');
            if (!avatarSlot) {
                avatarSlot = document.createElement('span');
                avatarSlot.className = 'template-selection-button-avatar';
                avatarSlot.setAttribute('aria-hidden', 'true');
                button.insertBefore(avatarSlot, label);
            }
            const fallback = opts.placeholder || '选择提示词模版';
            const title = template?.title || opts.title || '';
            label.textContent = title || fallback;
            label.title = title || '';
            button.dataset.templateTitle = title;
            button.classList.toggle('is-template-selected', !!template);
            button.classList.toggle('is-placeholder', !template);
            avatarSlot.replaceChildren();
            avatarSlot.hidden = !template;
            if (template) avatarSlot.appendChild(createTemplateAuthorAvatar(template, 'template-selection-avatar'));
            return label;
        }
        function renderTemplateMetrics(t) {
            return '<span class="tpl-stats"><span class="tpl-metric tpl-metric-hot" title="热度">🔥 ' + getTemplateUsageCount(t) + '</span><span class="tpl-metric tpl-metric-like" title="点赞">👍 ' + getTemplateLikeCount(t) + '</span></span>';
        }
        function renderLineIcon(kind) {
            const icons = {
                folder: '<svg viewBox="0 0 32 32"><path d="M5 10c0-2.2 1.6-3.8 3.8-3.8h6l4.1 4.6h7.3c2.2 0 3.8 1.6 3.8 3.8v10.6c0 2.2-1.6 3.8-3.8 3.8H8.8C6.6 29 5 27.4 5 25.2V10Z"/></svg>',
                file: '<svg viewBox="0 0 32 32"><rect x="6" y="3.5" width="20" height="25" rx="2.8"/><path d="M10.5 9h11"/><path d="M10.5 13.5h11"/><path d="M10.5 18h11"/><path d="M10.5 22.5h11"/></svg>',
                'file-stack': '<svg viewBox="0 0 32 32"><rect x="6" y="3.5" width="20" height="25" rx="2.8"/><path d="M10.5 9h11"/><path d="M10.5 13.5h11"/><path d="M10.5 18h11"/><path d="M10.5 22.5h11"/></svg>',
                'folder-stack': '<svg viewBox="0 0 32 32"><path d="M5 10c0-2.2 1.6-3.8 3.8-3.8h6l4.1 4.6h7.3c2.2 0 3.8 1.6 3.8 3.8v10.6c0 2.2-1.6 3.8-3.8 3.8H8.8C6.6 29 5 27.4 5 25.2V10Z"/></svg>'
            };
            const safeKind = icons[kind] ? kind : 'file';
            return '<span class="line-icon line-icon-' + safeKind + '" aria-hidden="true">' + icons[safeKind] + '</span>';
        }

        // ===== 云端数据同步（新架构：章级推送 + dirty标记 + 2min定时 + 静默重试） =====

    window.getTemplateLikeCount = getTemplateLikeCount;
    window.getTemplateUsageCount = getTemplateUsageCount;
    window.isOfficialTemplate = isOfficialTemplate;
    window.getTemplateAuthorName = getTemplateAuthorName;
    window.getTemplateAuthorAvatar = getTemplateAuthorAvatar;
    window.createTemplateAuthorAvatar = createTemplateAuthorAvatar;
    window.renderTemplateSelectionButton = renderTemplateSelectionButton;
    window.renderTemplateMetrics = renderTemplateMetrics;
    window.renderLineIcon = renderLineIcon;
})(window);
