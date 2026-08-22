(function(window, document) {
    'use strict';

    const runtime = window.ZhiyuTiptapRuntime;
    const editors = new Map();
    const INNER_HTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    const INNER_TEXT = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText');
    const nativeAppendChild = Node.prototype.appendChild;
    const nativeAppend = Element.prototype.append;
    const nativeQuerySelector = Element.prototype.querySelector;
    const nativeQuerySelectorAll = Element.prototype.querySelectorAll;
    const nativeSetAttribute = Element.prototype.setAttribute;
    const nativeGetAttribute = Element.prototype.getAttribute;
    const nativeRemoveAttribute = Element.prototype.removeAttribute;
    const RichTextContract = window.ZHIYU_RICH_TEXT_CONTRACT;

    function supportsProfessionalEditor() {
        return !!runtime?.Editor
            && typeof runtime.createNovelExtensions === 'function'
            && typeof window.MutationObserver === 'function'
            && typeof window.getSelection === 'function'
            && typeof document.createRange === 'function'
            && typeof Promise === 'function';
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizePlainText(value) {
        return String(value || '')
            .replace(/\r\n?/g, '\n')
            .replace(/\u00a0/g, ' ')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/^\n+|\n+$/g, '');
    }

    function preservePlainText(value) {
        return String(value || '')
            .replace(/\r\n?/g, '\n')
            .replace(/\u00a0/g, ' ');
    }

    function extractHtmlText(html, preserveWhitespace) {
        const holder = document.createElement('div');
        holder.innerHTML = String(html || '');
        const blocks = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'DL', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TR', 'UL']);
        let output = '';
        let trailingStructuralBreak = false;
        function walk(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                output += node.nodeValue || '';
                if (node.nodeValue) trailingStructuralBreak = false;
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            if (node.tagName === 'BR') {
                output += '\n';
                trailingStructuralBreak = false;
                return;
            }
            const beforeChildren = output.length;
            Array.from(node.childNodes).forEach(walk);
            if (blocks.has(node.tagName)) {
                if (output.length === beforeChildren) {
                    // 空段落本身就是一个有效换行，不能因为上一段已经以换行结尾而吞掉。
                    output += '\n';
                    trailingStructuralBreak = true;
                } else if (!output.endsWith('\n')) {
                    output += '\n';
                    trailingStructuralBreak = true;
                }
            }
        }
        Array.from(holder.childNodes).forEach(walk);
        if (trailingStructuralBreak && output.endsWith('\n')) output = output.slice(0, -1);
        return preserveWhitespace ? preservePlainText(output) : normalizePlainText(output);
    }

    function htmlToPlainText(html) {
        return extractHtmlText(html, false);
    }

    function htmlToPlainTextPreserving(html) {
        return extractHtmlText(html, true);
    }

    function contentToPlainText(value) {
        const content = String(value || '');
        return looksLikeHtml(content) ? htmlToPlainText(content) : normalizePlainText(content);
    }

    function plainTextToHtml(text) {
        const normalized = normalizePlainText(text);
        if (!normalized) return '';
        return normalized.split('\n').map(function(line) {
            return '<p>' + (line ? escapeHtml(line) : '') + '</p>';
        }).join('');
    }

    function plainTextToHtmlPreserving(text) {
        const preserved = preservePlainText(text);
        if (!preserved) return '';
        return preserved.split('\n').map(function(line) {
            return '<p>' + (line ? escapeHtml(line) : '') + '</p>';
        }).join('');
    }

    function looksLikeHtml(value) {
        return /<\/?[a-z][\s\S]*?>/i.test(String(value || ''));
    }

    function normalizeInputContent(value) {
        if (value && typeof value === 'object') return value;
        const text = String(value || '');
        return looksLikeHtml(text) ? text : plainTextToHtml(text);
    }

    function requiresRawRendering(html) {
        return /(?:ref-file-preview-card|info-card-canvas|info-card-raw-details|ai-detect-mark|ap-detect-panel|ap-lock-panel|<canvas\b)/i.test(String(html || ''));
    }

    function normalizeCompareHtml(value) {
        return String(value || '')
            // ProseMirror 会在空段落中插入仅用于光标定位的 DOM 占位符；
            // 它不属于编辑器数据，比较时必须忽略，否则会把自身渲染误判成外部改动。
            .replace(/<(?:br|img)\b(?=[^>]*\bProseMirror-(?:trailingBreak|separator)\b)[^>]*>/gi, '')
            .replace(/>\s+</g, '><')
            .trim();
    }

    function installFallbackValueBridge(element) {
        if (!element || !['edText', 'ogFileEditor'].includes(element.id)) return false;
        const descriptor = Object.getOwnPropertyDescriptor(element, 'value');
        if (descriptor?.get || descriptor?.set) return true;
        Object.defineProperty(element, 'value', {
            configurable: true,
            get: function() { return htmlToPlainTextPreserving(INNER_HTML.get.call(element)); },
            set: function(value) { INNER_HTML.set.call(element, plainTextToHtmlPreserving(value)); }
        });
        nativeSetAttribute.call(element, 'contenteditable', 'true');
        nativeSetAttribute.call(element, 'data-editor-fallback-value-bridge', 'true');
        return true;
    }

    function mountEditor(element) {
        if (!element || editors.has(element.id) || !supportsProfessionalEditor()) return editors.get(element?.id) || null;
        const id = element.id;
        const preserveValueText = id === 'edText' || id === 'ogFileEditor';
        const initialHtml = INNER_HTML.get.call(element);
        INNER_HTML.set.call(element, '');
        nativeRemoveAttribute.call(element, 'contenteditable');
        element.classList.add('professional-editor-host');

        const editor = new runtime.Editor({
            element,
            extensions: runtime.createNovelExtensions(),
            content: normalizeInputContent(initialHtml),
            parseOptions: { preserveWhitespace: 'full' },
            editable: true,
            editorProps: {
                attributes: {
                    class: 'zhiyu-tiptap-surface',
                    spellcheck: 'false',
                    'data-professional-editor-surface': id
                }
            }
        });
        const surface = editor.view.dom;
        const rawLayer = document.createElement('div');
        rawLayer.className = 'professional-editor-raw-layer';
        rawLayer.hidden = true;
        const legacyLayer = document.createElement('div');
        legacyLayer.className = 'professional-editor-legacy-layer';
        legacyLayer.hidden = true;
        nativeAppendChild.call(element, rawLayer);
        nativeAppendChild.call(element, legacyLayer);

        const state = {
            id,
            element,
            editor,
            surface,
            rawLayer,
            legacyLayer,
            rawMode: false,
            syncing: false,
            domDirty: false,
            editable: true,
            observer: null
        };

        function clearLegacyLayer() {
            INNER_HTML.set.call(legacyLayer, '');
            legacyLayer.hidden = true;
        }

        function syncEditorFromDom() {
            if (state.rawMode || state.syncing || !state.domDirty) return;
            state.domDirty = false;
            const domHtml = INNER_HTML.get.call(surface);
            if (normalizeCompareHtml(domHtml) === normalizeCompareHtml(editor.getHTML())) return;
            state.syncing = true;
            try {
                editor.commands.setContent(domHtml, { emitUpdate: false, errorOnInvalidContent: false, parseOptions: { preserveWhitespace: 'full' } });
            } finally {
                state.syncing = false;
            }
        }

        function setContent(value) {
            clearLegacyLayer();
            const html = typeof value === 'string' ? value : '';
            if (typeof value === 'string' && requiresRawRendering(html)) {
                state.rawMode = true;
                surface.hidden = true;
                rawLayer.hidden = false;
                INNER_HTML.set.call(rawLayer, html);
                return;
            }
            state.rawMode = false;
            INNER_HTML.set.call(rawLayer, '');
            rawLayer.hidden = true;
            surface.hidden = false;
            state.syncing = true;
            try {
                editor.commands.setContent(normalizeInputContent(value), { emitUpdate: false, errorOnInvalidContent: false, parseOptions: { preserveWhitespace: 'full' } });
            } finally {
                state.syncing = false;
                state.domDirty = false;
            }
        }

        function getHtml() {
            if (state.rawMode) return INNER_HTML.get.call(rawLayer);
            syncEditorFromDom();
            const base = editor.getHTML();
            return legacyLayer.hidden ? base : base + INNER_HTML.get.call(legacyLayer);
        }

        function getText() {
            if (state.rawMode) return INNER_TEXT.get.call(rawLayer);
            syncEditorFromDom();
            const base = editor.getText({ blockSeparator: '\n' });
            const legacy = legacyLayer.hidden ? '' : INNER_TEXT.get.call(legacyLayer);
            return preserveValueText ? preservePlainText(base + legacy) : normalizePlainText(base + legacy);
        }

        function setEditable(next) {
            state.editable = !!next;
            editor.setEditable(state.editable);
            nativeSetAttribute.call(element, 'data-editor-editable', state.editable ? 'true' : 'false');
        }

        function appendPlainText(value) {
            const text = preservePlainText(value);
            if (!text) return;
            if (state.rawMode) setContent('');
            clearLegacyLayer();
            const insertAt = Math.max(1, editor.state.doc.content.size - 1);
            const transaction = editor.state.tr
                .insertText(text, insertAt)
                .setMeta('addToHistory', false);
            state.syncing = true;
            try {
                editor.view.dispatch(transaction);
            } finally {
                state.syncing = false;
                state.domDirty = false;
            }
        }

        state.appendPlainText = appendPlainText;

        Object.defineProperty(element, 'innerHTML', {
            configurable: true,
            get: getHtml,
            set: setContent
        });
        Object.defineProperty(element, 'textContent', {
            configurable: true,
            get: getText,
            set: function(value) { setContent(plainTextToHtml(value)); }
        });
        Object.defineProperty(element, 'innerText', {
            configurable: true,
            get: getText,
            set: function(value) { setContent(plainTextToHtml(value)); }
        });
        Object.defineProperty(element, 'value', {
            configurable: true,
            get: getText,
            set: function(value) { setContent(preserveValueText ? plainTextToHtmlPreserving(value) : plainTextToHtml(value)); }
        });

        element.appendChild = function(node) {
            if (state.rawMode) setContent('');
            legacyLayer.hidden = false;
            return nativeAppendChild.call(legacyLayer, node);
        };
        element.append = function() {
            if (state.rawMode) setContent('');
            legacyLayer.hidden = false;
            return nativeAppend.apply(legacyLayer, arguments);
        };
        element.querySelector = function(selector) {
            return nativeQuerySelector.call(element, selector);
        };
        element.querySelectorAll = function(selector) {
            return nativeQuerySelectorAll.call(element, selector);
        };
        element.setAttribute = function(name, value) {
            if (String(name).toLowerCase() === 'contenteditable') {
                setEditable(String(value).toLowerCase() !== 'false');
                return;
            }
            return nativeSetAttribute.call(element, name, value);
        };
        element.getAttribute = function(name) {
            if (String(name).toLowerCase() === 'contenteditable') return state.editable ? 'true' : 'false';
            return nativeGetAttribute.call(element, name);
        };
        element.focus = function() {
            if (!state.rawMode) editor.commands.focus();
            else rawLayer.focus();
        };

        state.observer = new MutationObserver(function() {
            if (!state.syncing) state.domDirty = true;
        });
        state.observer.observe(surface, { childList: true, subtree: true, characterData: true, attributes: true });
        surface.addEventListener('keydown', function(event) {
            if (!(event.ctrlKey || event.metaKey) || String(event.key || '').toLowerCase() !== 'a') return;
            event.preventDefault();
            event.stopPropagation();
            if (typeof editor.commands?.selectAll === 'function') {
                editor.commands.selectAll();
                return;
            }
            const range = document.createRange();
            range.selectNodeContents(surface);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        }, true);
        setEditable(true);
        editors.set(id, state);
        return state;
    }

    function getState(target) {
        const id = typeof target === 'string' ? target : target?.id;
        return id ? editors.get(id) || null : null;
    }

    function getPayload(target, fallbackHtml) {
        const state = getState(target);
        if (!state) {
            const element = typeof target === 'string' ? document.getElementById(target) : target;
            const html = fallbackHtml !== undefined ? String(fallbackHtml || '') : String(element?.innerHTML || '');
            return { html, plainText: htmlToPlainText(html), editorJson: null, professional: false };
        }
        const html = state.element.innerHTML;
        return {
            html,
            plainText: htmlToPlainText(html),
            editorJson: state.rawMode ? null : state.editor.getJSON(),
            professional: !state.rawMode
        };
    }

    function sanitizeRichHtml(value) {
        const Utils = window.ZHIYU_UTILS || window.Utils || {};
        return typeof Utils.sanitizeHTML === 'function'
            ? Utils.sanitizeHTML(String(value || ''))
            : String(value || '');
    }

    function metadataRevision(record) {
        return Math.max(0, Number(record?.contentRevision || record?._version || record?.version || 0));
    }

    function applyPayloadMetadata(record, payload) {
        if (!record || !payload) return null;
        const plainText = RichTextContract?.normalizePlainText
            ? RichTextContract.normalizePlainText(payload.plainText)
            : normalizePlainText(payload.plainText);
        const html = sanitizeRichHtml(payload.html);
        const editorJson = RichTextContract?.normalizeEditorJson?.(payload.editorJson) || null;
        const revision = metadataRevision(record);
        const richText = RichTextContract?.createRichText?.({
            plainText,
            html,
            editorJson,
            revision
        }) || null;
        record.plainText = plainText;
        record.plainTextDigest = RichTextContract?.contentDigest?.(plainText) || '';
        record.contentRevision = revision;
        record.html = html;
        record.editorVersion = 'tiptap-v1';
        if (editorJson) record.editorJson = editorJson;
        else delete record.editorJson;
        if (richText) record.richText = richText;
        else delete record.richText;
        return { ...payload, plainText, html, editorJson, richText };
    }

    function applyPayloadToChapter(chapter, target, fallbackHtml) {
        if (!chapter) return null;
        const payload = getPayload(target, fallbackHtml);
        return applyPayloadMetadata(chapter, payload);
    }

    function applyContentMetadata(record, content, target) {
        if (!record) return null;
        const source = String(content || '');
        const sourcePlainText = contentToPlainText(source);
        const state = getState(target);
        const stateHtml = state ? state.element.innerHTML : '';
        const stateMatchesSource = !!state && !!sourcePlainText && (
            looksLikeHtml(source)
                ? normalizeCompareHtml(stateHtml) === normalizeCompareHtml(source)
                : contentToPlainText(stateHtml) === sourcePlainText
        );
        const payload = stateMatchesSource
            ? getPayload(state.element)
            : {
                html: looksLikeHtml(source) ? source : plainTextToHtml(source),
                plainText: sourcePlainText,
                editorJson: null,
                professional: false
            };
        return applyPayloadMetadata(record, payload);
    }

    function applyExternalContentMetadata(record, content) {
        if (!record) return null;
        const source = String(content ?? '');
        const payload = {
            html: looksLikeHtml(source) ? source : plainTextToHtml(source),
            plainText: contentToPlainText(source),
            editorJson: null,
            professional: false
        };
        return applyPayloadMetadata(record, payload);
    }

    function replaceContent(target, content) {
        const element = typeof target === 'string' ? document.getElementById(target) : target;
        if (!element) return null;
        element.innerHTML = normalizeInputContent(content);
        return getPayload(element);
    }

    function appendPlainText(target, value) {
        const element = typeof target === 'string' ? document.getElementById(target) : target;
        if (!element) return false;
        const text = preservePlainText(value);
        if (!text) return true;
        const state = getState(element);
        if (typeof state?.appendPlainText === 'function') {
            state.appendPlainText(text);
        } else {
            nativeAppendChild.call(element, document.createTextNode(text));
        }
        return true;
    }

    function setFromRecord(target, record, fallbackContent) {
        const state = getState(target);
        const element = typeof target === 'string' ? document.getElementById(target) : target;
        if (!element) return false;
        const content = fallbackContent !== undefined ? fallbackContent : (record?.content || '');
        if (!state || !record) {
            element.innerHTML = normalizeInputContent(content);
            return !!state;
        }
        const currentPlain = contentToPlainText(record.plainText ?? content);
        const revision = metadataRevision(record);
        const validRichText = RichTextContract?.validateRichText?.(record.richText, {
            plainText: currentPlain,
            revision,
            sanitizeHtml: sanitizeRichHtml,
            htmlToPlainText
        }) || null;
        if (validRichText) {
            element.innerHTML = validRichText.editorJson;
            return true;
        }
        const savedPlain = normalizePlainText(record.plainText || '');
        const metadataMatches = !!savedPlain && savedPlain === contentToPlainText(content);
        if (metadataMatches && record.html) {
            const safeLegacyHtml = sanitizeRichHtml(record.html);
            if (safeLegacyHtml && htmlToPlainText(safeLegacyHtml) === savedPlain) {
                element.innerHTML = safeLegacyHtml;
                return true;
            }
        }
        element.innerHTML = normalizeInputContent(content);
        return true;
    }

    function plainTextForCloud(value, record) {
        return contentToPlainText(value !== undefined ? value : (record?.content || ''));
    }

    function cloudFieldsFor(record, value) {
        const plainText = plainTextForCloud(value, record);
        return RichTextContract?.cloudFields?.(record, plainText) || {
            plainText,
            plainTextDigest: '',
            richText: null
        };
    }

    function commitCloudRevision(record, revision, response) {
        if (!record) return false;
        const normalizedRevision = Math.max(1, Number(revision || response?.version || record._version || 1));
        record.contentRevision = normalizedRevision;
        if (record.richText && typeof record.richText === 'object') {
            record.richText.revision = normalizedRevision;
        }
        if (response?.richTextAccepted === false) {
            delete record.richText;
            delete record.editorJson;
            delete record.html;
        }
        return true;
    }

    function applyCloudContentMetadata(record, cloudRecord, fallbackContent) {
        if (!record || !cloudRecord) return false;
        const plainText = RichTextContract?.normalizePlainText?.(
            cloudRecord.plainText ?? cloudRecord.content ?? fallbackContent ?? ''
        ) || normalizePlainText(cloudRecord.plainText ?? cloudRecord.content ?? fallbackContent ?? '');
        record.plainText = plainText;
        record.plainTextDigest = String(
            cloudRecord.plainTextDigest
            || RichTextContract?.contentDigest?.(plainText)
            || ''
        );
        record.contentRevision = Math.max(1, Number(
            cloudRecord.contentRevision || cloudRecord.version || record._version || 1
        ));
        const validRichText = RichTextContract?.validateRichText?.(cloudRecord.richText, {
            plainText,
            revision: record.contentRevision,
            sanitizeHtml: sanitizeRichHtml,
            htmlToPlainText
        }) || null;
        if (validRichText) {
            record.richText = validRichText;
            record.html = validRichText.html;
            record.editorJson = validRichText.editorJson;
            record.editorVersion = validRichText.editorVersion;
        } else {
            delete record.richText;
            delete record.html;
            delete record.editorJson;
            record.editorVersion = 'tiptap-v1';
        }
        return !!validRichText;
    }

    function showFallbackNotice() {
        document.documentElement.dataset.professionalEditor = 'fallback';
        const notify = function() {
            const Toast = window.ZHIYU_TOAST || window.Toast;
            Toast?.warn?.('当前浏览器内核较旧，已使用兼容编辑模式；正文仍可查看和保存。');
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', notify, { once: true });
        else setTimeout(notify, 0);
    }

    const EditorAdapter = Object.freeze({
        supportsProfessionalEditor,
        mountEditor,
        getState,
        getPayload,
        applyPayloadToChapter,
        applyContentMetadata,
        applyExternalContentMetadata,
        replaceContent,
        appendPlainText,
        setFromRecord,
        htmlToPlainText,
        contentToPlainText,
        plainTextToHtml,
        plainTextForCloud,
        cloudFieldsFor,
        commitCloudRevision,
        applyCloudContentMetadata,
        normalizePlainText,
        preservePlainText
    });
    window.ZhiyuEditorAdapter = EditorAdapter;

    ['edText', 'ogFileEditor'].forEach(function(id) {
        installFallbackValueBridge(document.getElementById(id));
    });

    if (!supportsProfessionalEditor()) {
        showFallbackNotice();
        window.ZHIYU_PROFESSIONAL_EDITOR_READY = false;
        return;
    }

    ['resultBox', 'outlineResultBox', 'ogContentBox', 'dcContentBox', 'edText', 'ogFileEditor'].forEach(function(id) {
        try { mountEditor(document.getElementById(id)); } catch(error) {
            console.warn('专业编辑器初始化失败，已保留兼容编辑框：' + id, error);
        }
    });
    document.documentElement.dataset.professionalEditor = editors.has('resultBox') ? 'tiptap' : 'fallback';
    window.ZHIYU_PROFESSIONAL_EDITOR_READY = editors.has('resultBox');
})(window, document);
