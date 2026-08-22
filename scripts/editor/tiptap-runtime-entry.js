import { Editor, Mark, mergeAttributes } from './tiptap-core-entry.js';
import { StarterKit } from './tiptap-starter-entry.js';

function normalizeEditorColor(value) {
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

const TextStyle = Mark.create({
    name: 'textStyle',
    addAttributes() {
        return {
            color: {
                default: null,
                parseHTML: element => normalizeEditorColor(element.style?.color) || null,
                renderHTML: attributes => {
                    const color = normalizeEditorColor(attributes.color);
                    return color ? { style: `color:${color}` } : {};
                }
            }
        };
    },
    parseHTML() {
        return [{
            tag: 'span',
            getAttrs: element => normalizeEditorColor(element.style?.color) ? {} : false
        }];
    },
    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes), 0];
    }
});

function createNovelExtensions() {
    return [StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false }
    }), TextStyle];
}

window.ZhiyuTiptapRuntime = { Editor, createNovelExtensions };
