// Local, opt-in UI translation. Never traverse or rewrite user content.
(function(window) {
    'use strict';
    const document = window.document;
    const dictionaries = window.ZHIYU_LOCALES;
    const UI_KEY = 'zhiyu_community_ui_locale_v1';
    const OUTPUT_KEY = 'zhiyu_community_prose_language_v1';
    const METADATA_OUTPUT_KEY = 'zhiyu_community_template_metadata_language_v1';
    const FUNCTIONAL_OUTPUT_KEY = 'zhiyu_community_functional_language_v1';
    const OUTLINE_OUTPUT_KEY = 'zhiyu_community_outline_language_v1';
    const DETAIL_OUTPUT_KEY = 'zhiyu_community_detail_outline_language_v1';
    const UI_LANGUAGES = ['zh-CN', 'en', 'id', 'ms', 'vi', 'th', 'ar'];
    const OUTPUT_LANGUAGES = ['source', ...UI_LANGUAGES];
    const MARKED = '[data-i18n], [data-i18n-title], [data-i18n-aria-label], [data-i18n-placeholder], [data-i18n-alt]';
    const PROTECTED = '[data-i18n-ignore], [contenteditable]:not([contenteditable="false"]), #resultBox, #ogContentBox, #dcContentBox, #apContentBox, #currentWritingBookName, #composerTemplateName, #naturalizeChapterLabel, #selectedTemplateName, #scriptSelectedTplName, #outlineTemplateLabel, #edTitle, #ogFileEditorLabel, #fullAnalysisNormalModelLabel, #btnActionModelSelect, #btnOGTemplate, #btnDCTemplate, #apConfigTemplateBtn';
    let persistenceFailed = false;
    function readPreference(key) {
        try { return window.localStorage.getItem(key); } catch (_) { return null; }
    }
    function writePreference(key, value) {
        try { window.localStorage.setItem(key, value); return true; } catch (_) { return false; }
    }
    function normalizeLocale(value) {
        const base = String(value || '').replace(/_/g, '-').toLowerCase().split('-')[0];
        if (base === 'zh') return 'zh-CN';
        return UI_LANGUAGES.includes(base) ? base : 'en';
    }
    const savedLocale = readPreference(UI_KEY);
    let locale = UI_LANGUAGES.includes(savedLocale) ? savedLocale
        : 'zh-CN';
    const savedOutput = readPreference(OUTPUT_KEY);
    let outputLanguage = OUTPUT_LANGUAGES.includes(savedOutput) ? savedOutput : 'zh-CN';
    const savedMetadataOutput = readPreference(METADATA_OUTPUT_KEY);
    let metadataOutputLanguage = OUTPUT_LANGUAGES.includes(savedMetadataOutput) ? savedMetadataOutput : 'source';
    const savedFunctionalOutput = readPreference(FUNCTIONAL_OUTPUT_KEY);
    let functionalOutputLanguage = OUTPUT_LANGUAGES.includes(savedFunctionalOutput) ? savedFunctionalOutput : 'source';
    const savedOutlineOutput = readPreference(OUTLINE_OUTPUT_KEY);
    let outlineOutputLanguage = OUTPUT_LANGUAGES.includes(savedOutlineOutput) ? savedOutlineOutput : 'source';
    const savedDetailOutput = readPreference(DETAIL_OUTPUT_KEY);
    let detailOutputLanguage = OUTPUT_LANGUAGES.includes(savedDetailOutput) ? savedDetailOutput : 'source';
    const brandTemplate = text => String(text).replace(/知屿助手|Zhiyu Assistant|Asisten Zhiyu|Pembantu Zhiyu|Trợ lý Zhiyu|ผู้ช่วย Zhiyu|مساعد Zhiyu/gi, 'Omniisle Write');
    function t(key, params, zhFallback) {
        const text = dictionaries?.[locale]?.[key] ?? dictionaries?.en?.[key] ?? dictionaries?.['zh-CN']?.[key] ?? zhFallback ?? key;
        // Brand only system messages before interpolating user-owned values.
        const branded = (dictionaries?.[locale]?.[key] !== undefined || dictionaries?.en?.[key] !== undefined) ? brandTemplate(text) : String(text);
        return branded.replace(/\{(\w+)\}/g, function(match, name) {
            return params && Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match;
        });
    }
    // Only explicitly marked system tooltips participate. Never translate content titles.
    const titleSources = new Map();
    const renderedTitleKeys = new WeakMap();
    for (const messages of Object.values(dictionaries || {})) {
        for (const [key, value] of Object.entries(messages)) {
            if (!String(value).includes('{')) {
                titleSources.set(String(value), key);
                titleSources.set(brandTemplate(value), key);
            }
        }
    }
    function refreshTitleKey(node) {
        if (!node?.getAttribute?.('data-i18n-title') || node.closest(PROTECTED)) return;
        // An explicitly changed key belongs to the state writer and takes precedence over old text.
        if (renderedTitleKeys.get(node) !== node.getAttribute('data-i18n-title')) return;
        const current = node.getAttribute('title');
        if (current === null) return;
        if (!current) { node.removeAttribute('data-i18n-title'); return; }
        const previous = node.getAttribute('data-i18n-title');
        let params = {};
        try { params = JSON.parse(node.getAttribute('data-i18n-params') || '{}') || {}; } catch (_) {}
        // Keep the existing key when its translated value still describes this state.
        if (Object.values(dictionaries || {}).some(messages => brandTemplate(messages[previous] || '')
            .replace(/\{(\w+)\}/g, (match, name) => Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match) === current)) return;
        const key = titleSources.get(current);
        if (key) node.setAttribute('data-i18n-title', key);
        else node.removeAttribute('data-i18n-title'); // A new, unbound value must not be replaced by an old state.
    }
    function translateNode(node) {
        if (node.closest(PROTECTED)) return;
        refreshTitleKey(node);
        let params = null;
        try { params = JSON.parse(node.getAttribute('data-i18n-params') || 'null'); } catch (_) {}
        let key = node.getAttribute('data-i18n');
        // A translated label must be a leaf. Never erase controls or an SVG.
        if (key && !node.children.length && !/^(INPUT|TEXTAREA)$/i.test(node.tagName)) {
            const current = node.textContent.trim();
            const known = Object.values(dictionaries || {}).some(messages =>
                [String(messages[key] ?? ''), brandTemplate(messages[key] ?? '')].some(template => template
                    .replace(/\{(\w+)\}/g, (match, name) => params && Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match).trim() === current));
            // A renderer may have replaced an old placeholder with a user-owned name.
            // Never restore the placeholder over a new, unbound value.
            if (!known) {
                const next = node.tagName === 'BUTTON' ? titleSources.get(current) : null;
                if (!next) { node.removeAttribute('data-i18n'); return; }
                key = next;
                node.setAttribute('data-i18n', key);
            }
            const value = t(key, params, node.textContent);
            if (node.textContent !== value) node.textContent = value;
        }
        for (const attr of ['title', 'aria-label', 'placeholder', 'alt']) {
            const attrKey = node.getAttribute('data-i18n-' + attr);
            if (attrKey) node.setAttribute(attr, t(attrKey, params, node.getAttribute(attr) || ''));
            if (attr === 'title') renderedTitleKeys.set(node, attrKey);
        }
    }
    // Explicit source-message calls for legacy UI only; never an automatic page translator.
    function ui(source, params) {
        // Legacy sync status strings carry counts. Keep values while translating the template.
        if (!params) {
            const pending = /^(\d+) 个章节、(\d+) 项其他内容、(\d+) 个附件尚待确认$/.exec(source);
            if (pending) return ui('{chapters} 个章节、{items} 项其他内容、{attachments} 个附件尚待确认', { chapters: pending[1], items: pending[2], attachments: pending[3] });
            const attachments = /^有 (\d+) 个附件尚未完整保存到云端$/.exec(source);
            if (attachments) return ui('有 {count} 个附件尚未完整保存到云端', { count: attachments[1] });
        }
        return t('flow.' + source, params, source);
    }
    // Bind only system-owned labels. Refreshing them never rebuilds a dialog or input.
    function bindText(node, source, params) {
        if (!node || node.closest(PROTECTED) || node.children.length || /^(INPUT|TEXTAREA)$/i.test(node.tagName)) return;
        node.setAttribute('data-i18n', 'flow.' + source);
        node.setAttribute('data-i18n-params', JSON.stringify(params || null));
        node.textContent = ui(source, params);
    }
    function bindTitle(node, source, params) {
        if (!node || node.closest(PROTECTED)) return;
        node.setAttribute('data-i18n-title', 'flow.' + source);
        node.setAttribute('data-i18n-params', JSON.stringify(params || null));
        node.title = ui(source, params);
    }
    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }
    function html(source, params) {
        return '<span data-i18n="' + escapeHtml('flow.' + source) + '" data-i18n-params="'
            + escapeHtml(JSON.stringify(params || null)) + '">' + escapeHtml(ui(source, params)) + '</span>';
    }
    function numberedNameHtml(name, unit) {
        const value = String(name || '');
        const match = /^第([零〇两一二三四五六七八九十百千万\d]+)(卷|章)$/.exec(value);
        const number = match && match[2] === unit
            ? window.ZhiyuFullTextAnalysisCore?.parseChapterNumber('第' + match[1] + '章') : 0;
        return number > 0 ? html('第{number}' + unit, { number }) : escapeHtml(value);
    }
    function numberedName(name, unit) {
        const value = String(name || '');
        const match = /^第([零〇两一二三四五六七八九十百千万\d]+)(卷|章)$/.exec(value);
        const number = match && match[2] === unit
            ? window.ZhiyuFullTextAnalysisCore?.parseChapterNumber('第' + match[1] + '章') : 0;
        return number > 0 ? ui('第{number}' + unit, { number }) : value;
    }
    function systemFileNameHtml(file, bookName, displayName) {
        const original = String(displayName ?? file?.name ?? '');
        if (['user-upload', 'upload', 'user'].includes(file?.source) || file?.managedBy === 'user') return escapeHtml(original);
        const prefix = String(bookName || '') + '_';
        const clean = original.replace(/\.(?:md|txt)$/i, '');
        const hasPrefix = prefix !== '_' && clean.startsWith(prefix);
        const name = hasPrefix ? clean.slice(prefix.length) : clean;
        const chapter = /^(第\s*[零〇两一二三四五六七八九十百千万\d]+\s*章)([\s\S]*)$/.exec(name);
        if (chapter) return (hasPrefix ? escapeHtml(prefix) : '')
            + numberedNameHtml(chapter[1].replace(/\s/g, ''), '章')
            + escapeHtml(chapter[2] + original.slice(clean.length));
        const systemNames = ['大纲','剧情总览','拆书设定','边界卡','追踪表','承接卡','信息表','信息卡','角色列表','设定集','章节粗纲','关键事件表','资料索引','剧本','分镜','角色','场景','道具'];
        if (!systemNames.includes(name)) return escapeHtml(original);
        return (hasPrefix ? escapeHtml(prefix) : '') + html(name);
    }
    function apply(root) {
        const scope = root || document;
        if (!scope) return;
        if (scope.matches?.(MARKED)) translateNode(scope);
        scope.querySelectorAll(MARKED).forEach(translateNode);
    }
    function syncControls() {
        const ui = document?.getElementById('interfaceLanguage');
        const output = document?.getElementById('generationLanguage');
        const metadataOutput = document?.getElementById('templateMetadataLanguage');
        const functionalOutput = document?.getElementById('functionalGenerationLanguage');
        const outlineOutput = document?.getElementById('outlineGenerationLanguage');
        const detailOutput = document?.getElementById('detailGenerationLanguage');
        const warning = document?.getElementById('languagePreferenceWarning');
        if (ui) ui.value = locale;
        if (output) output.value = outputLanguage;
        if (metadataOutput) metadataOutput.value = metadataOutputLanguage;
        if (functionalOutput) functionalOutput.value = functionalOutputLanguage;
        if (outlineOutput) outlineOutput.value = outlineOutputLanguage;
        if (detailOutput) detailOutput.value = detailOutputLanguage;
        if (warning) {
            warning.hidden = !persistenceFailed;
            warning.textContent = t('language.persistenceWarning');
        }
    }
    function refresh() {
        if (document?.documentElement) {
            document.documentElement.lang = locale;
            document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
        }
        apply();
        syncControls();
    }
    function setLocale(value) {
        if (!UI_LANGUAGES.includes(value)) return false;
        locale = value;
        persistenceFailed = !writePreference(UI_KEY, value);
        refresh();
        window.dispatchEvent(new window.CustomEvent('zhiyu:locale-changed', { detail: { locale } }));
        return true;
    }
    function setOutputLanguage(value) {
        if (!OUTPUT_LANGUAGES.includes(value)) return false;
        outputLanguage = value;
        persistenceFailed = !writePreference(OUTPUT_KEY, value);
        syncControls();
        // No UI-locale event, editor writes, save or generation side effects.
        return true;
    }
    function setMetadataOutputLanguage(value) {
        if (!OUTPUT_LANGUAGES.includes(value)) return false;
        metadataOutputLanguage = value;
        persistenceFailed = !writePreference(METADATA_OUTPUT_KEY, value);
        syncControls();
        return true;
    }
    function setFunctionalOutputLanguage(value) {
        if (!OUTPUT_LANGUAGES.includes(value)) return false;
        functionalOutputLanguage = value;
        persistenceFailed = !writePreference(FUNCTIONAL_OUTPUT_KEY, value);
        syncControls();
        return true;
    }
    function setOutlineOutputLanguage(value) {
        if (!OUTPUT_LANGUAGES.includes(value)) return false;
        outlineOutputLanguage = value;
        persistenceFailed = !writePreference(OUTLINE_OUTPUT_KEY, value);
        syncControls();
        return true;
    }
    function setDetailOutputLanguage(value) {
        if (!OUTPUT_LANGUAGES.includes(value)) return false;
        detailOutputLanguage = value;
        persistenceFailed = !writePreference(DETAIL_OUTPUT_KEY, value);
        syncControls();
        return true;
    }
    function init() {
        refresh();
        document.querySelectorAll('textarea, [contenteditable="true"]').forEach(node => node.setAttribute('dir', 'auto'));
        if (typeof window.MutationObserver === 'function') {
            const pending = new Set();
            let scheduled = false;
            new window.MutationObserver(records => {
                for (const record of records) {
                    pending.add(record.target.nodeType === 1 ? record.target : record.target.parentElement);
                    for (const node of record.addedNodes) if (node.nodeType === 1) pending.add(node);
                }
                if (!scheduled) {
                    scheduled = true;
                    window.queueMicrotask(() => {
                        scheduled = false;
                        const scopes = [...pending]; pending.clear();
                        for (const scope of scopes) if (scope?.isConnected && !scope.closest(PROTECTED)) apply(scope);
                    });
                }
            }).observe(document.body, { childList: true, subtree: true, characterData: true });
        }
        // Dynamic legacy controls may replace title after initial render. Translate before hover/focus.
        for (const event of ['mouseover', 'focusin']) document.addEventListener(event, function(e) {
            const node = e.target?.closest?.('[data-i18n-title]');
            if (node) translateNode(node);
        }, true);
        // Reveal the static shell only after its first translation and direction are applied.
        document.documentElement?.removeAttribute?.('data-ui-language-pending');
        document.getElementById('interfaceLanguage')?.addEventListener('change', event => setLocale(event.target.value));
        document.getElementById('generationLanguage')?.addEventListener('change', event => setOutputLanguage(event.target.value));
        document.getElementById('templateMetadataLanguage')?.addEventListener('change', event => setMetadataOutputLanguage(event.target.value));
        document.getElementById('functionalGenerationLanguage')?.addEventListener('change', event => setFunctionalOutputLanguage(event.target.value));
        document.getElementById('outlineGenerationLanguage')?.addEventListener('change', event => setOutlineOutputLanguage(event.target.value));
        document.getElementById('detailGenerationLanguage')?.addEventListener('change', event => setDetailOutputLanguage(event.target.value));
    }
    window.ZHIYU_I18N = Object.freeze({
        t, ui, html, numberedName, numberedNameHtml, systemFileNameHtml, bindText, bindTitle, apply, normalizeLocale, getLocale: () => locale, setLocale,
        // Interface changes never change output preferences or existing writing.
        getOutputLanguage: () => outputLanguage, setOutputLanguage,
        getMetadataOutputLanguage: () => 'source', setMetadataOutputLanguage,
        getFunctionalOutputLanguage: () => 'source', setFunctionalOutputLanguage,
        getOutlineOutputLanguage: () => 'source', setOutlineOutputLanguage,
        getDetailOutputLanguage: () => 'source', setDetailOutputLanguage
    });
    if (document?.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else if (document) init();
})(window);
