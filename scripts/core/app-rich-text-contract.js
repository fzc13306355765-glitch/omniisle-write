(function(root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.ZHIYU_RICH_TEXT_CONTRACT = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
    'use strict';

    const SCHEMA_VERSION = 'zhiyu-rich-text-v1';
    const EDITOR_VERSION = 'tiptap-v1';
    const DIGEST_VERSION = 'fnv1a32-v1';
    const MAX_JSON_DEPTH = 80;
    const MAX_JSON_NODES = 100000;
    const MAX_TEXT_LENGTH = 5 * 1024 * 1024;
    const ALLOWED_NODES = new Set([
        'doc', 'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem',
        'blockquote', 'codeBlock', 'text', 'hardBreak', 'horizontalRule'
    ]);
    const ALLOWED_MARKS = new Set([
        'bold', 'italic', 'underline', 'strike', 'code', 'textStyle'
    ]);

    function normalizePlainText(value) {
        return String(value ?? '')
            .replace(/\r\n?/g, '\n')
            .replace(/\u00a0/g, ' ')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/^\n+|\n+$/g, '');
    }

    function fnv1a32(value) {
        const text = String(value ?? '');
        let hash = 0x811c9dc5;
        for (let index = 0; index < text.length; index += 1) {
            const code = text.charCodeAt(index);
            hash ^= code & 0xff;
            hash = Math.imul(hash, 0x01000193);
            hash ^= code >>> 8;
            hash = Math.imul(hash, 0x01000193);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    function contentDigest(value) {
        return DIGEST_VERSION + ':' + fnv1a32(normalizePlainText(value));
    }

    function stableStringify(value) {
        if (value === null || typeof value !== 'object') return JSON.stringify(value);
        if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
        return '{' + Object.keys(value).sort().map(function(key) {
            return JSON.stringify(key) + ':' + stableStringify(value[key]);
        }).join(',') + '}';
    }

    function normalizeColor(value) {
        const color = String(value || '').trim();
        if (/^#[0-9a-f]{3,8}$/i.test(color)) return color.toLowerCase();
        if (/^rgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(color)) {
            return color.replace(/\s+/g, '');
        }
        if (/^hsla?\(\s*-?\d+(?:\.\d+)?(?:deg)?\s*,\s*\d+(?:\.\d+)?%\s*,\s*\d+(?:\.\d+)?%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(color)) {
            return color.replace(/\s+/g, '');
        }
        return '';
    }

    function normalizeMark(mark) {
        if (!mark || typeof mark !== 'object') return null;
        if (!ALLOWED_MARKS.has(mark.type)) return null;
        const normalized = { type: mark.type };
        if (mark.type === 'textStyle') {
            const color = normalizeColor(mark.attrs?.color);
            if (!color) return null;
            normalized.attrs = { color };
        }
        return normalized;
    }

    function normalizeEditorJson(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        let nodeCount = 0;
        let textLength = 0;

        function visit(node, depth) {
            if (!node || typeof node !== 'object' || Array.isArray(node)) throw new Error('invalid-node');
            if (depth > MAX_JSON_DEPTH || ++nodeCount > MAX_JSON_NODES) throw new Error('json-limit');
            const type = String(node.type || '');
            if (!ALLOWED_NODES.has(type)) throw new Error('unsupported-node');
            const normalized = { type };

            if (type === 'text') {
                const text = String(node.text ?? '');
                textLength += text.length;
                if (textLength > MAX_TEXT_LENGTH) throw new Error('text-limit');
                normalized.text = text;
                if (Array.isArray(node.marks) && node.marks.length) {
                    const marks = node.marks.map(normalizeMark);
                    if (marks.some(function(mark) { return !mark; })) throw new Error('unsupported-mark');
                    normalized.marks = marks;
                }
                return normalized;
            }

            if (type === 'heading') {
                const level = Number(node.attrs?.level);
                if (!Number.isInteger(level) || level < 1 || level > 6) throw new Error('invalid-heading');
                normalized.attrs = { level };
            } else if (type === 'orderedList') {
                const start = Number(node.attrs?.start ?? node.attrs?.order ?? 1);
                if (!Number.isInteger(start) || start < 1 || start > 1000000) throw new Error('invalid-list-start');
                normalized.attrs = { start };
            } else if (type === 'codeBlock' && node.attrs?.language) {
                const language = String(node.attrs.language);
                if (!/^[a-z0-9_+#.-]{1,40}$/i.test(language)) throw new Error('invalid-language');
                normalized.attrs = { language };
            }

            if (Array.isArray(node.content) && node.content.length) {
                normalized.content = node.content.map(function(child) { return visit(child, depth + 1); });
            }
            return normalized;
        }

        try {
            const result = visit(value, 0);
            return result.type === 'doc' ? result : null;
        } catch (error) {
            return null;
        }
    }

    function formatDigest(html, editorJson) {
        return DIGEST_VERSION + ':' + fnv1a32(
            String(html || '') + '\u0000' + stableStringify(editorJson || null)
        );
    }

    function createRichText(options) {
        const plainText = normalizePlainText(options?.plainText);
        const html = String(options?.html || '');
        const editorJson = normalizeEditorJson(options?.editorJson);
        const revision = Math.max(0, Number(options?.revision || 0));
        if (!html || !editorJson) return null;
        return {
            schemaVersion: SCHEMA_VERSION,
            editorVersion: EDITOR_VERSION,
            revision,
            plainTextDigest: contentDigest(plainText),
            formatDigest: formatDigest(html, editorJson),
            html,
            editorJson
        };
    }

    function validateRichText(richText, options) {
        if (!richText || typeof richText !== 'object' || Array.isArray(richText)) return null;
        const plainText = normalizePlainText(options?.plainText);
        const expectedRevision = options?.revision == null
            ? null
            : Math.max(0, Number(options.revision || 0));
        if (richText.schemaVersion !== SCHEMA_VERSION || richText.editorVersion !== EDITOR_VERSION) return null;
        if (expectedRevision !== null && Number(richText.revision || 0) !== expectedRevision) return null;
        if (richText.plainTextDigest !== contentDigest(plainText)) return null;
        const editorJson = normalizeEditorJson(richText.editorJson);
        if (!editorJson) return null;
        const sanitizeHtml = typeof options?.sanitizeHtml === 'function'
            ? options.sanitizeHtml
            : function(value) { return String(value || ''); };
        const html = String(sanitizeHtml(richText.html || '') || '');
        if (!html || html !== String(richText.html || '')) return null;
        if (typeof options?.htmlToPlainText === 'function') {
            if (normalizePlainText(options.htmlToPlainText(html)) !== plainText) return null;
        }
        if (richText.formatDigest !== formatDigest(html, editorJson)) return null;
        return {
            schemaVersion: SCHEMA_VERSION,
            editorVersion: EDITOR_VERSION,
            revision: Number(richText.revision || 0),
            plainTextDigest: richText.plainTextDigest,
            formatDigest: richText.formatDigest,
            html,
            editorJson
        };
    }

    function cloudFields(record, value) {
        const plainText = normalizePlainText(value !== undefined ? value : record?.plainText ?? record?.content ?? '');
        return {
            plainText,
            plainTextDigest: contentDigest(plainText),
            richText: record?.richText && typeof record.richText === 'object'
                ? JSON.parse(JSON.stringify(record.richText))
                : null
        };
    }

    return Object.freeze({
        SCHEMA_VERSION,
        EDITOR_VERSION,
        DIGEST_VERSION,
        normalizePlainText,
        contentDigest,
        stableStringify,
        normalizeColor,
        normalizeEditorJson,
        formatDigest,
        createRichText,
        validateRichText,
        cloudFields
    });
});
