import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const stored = new Map();
let body, requestedUrl, events = [], outputLanguageChanged = false;
const c = { console, URL, Response, Headers, Request, AbortController, ReadableStream,
    TextEncoder, TextDecoder, setTimeout, clearTimeout, Intl,
    navigator: { language: 'en-US' },
    location: { protocol: 'https:', hostname: 'fixture.invalid' },
    localStorage: { getItem: k => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, v) },
    document: { readyState: 'loading', documentElement: {}, addEventListener() {}, querySelectorAll: () => [], getElementById: () => null,
        body: { classList: { contains: () => false } } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    dispatchEvent() {},
    fetch: async (url, init) => {
        requestedUrl = url; body = JSON.parse(init.body);
        if (outputLanguageChanged) c.ZHIYU_I18N.setOutputLanguage('zh-CN');
        return new Response(events.map(value => 'data: ' + JSON.stringify(value) + '\n\n').join(''), { headers: { 'content-type': 'text/event-stream' } });
    },
    ZHIYU_COMMUNITY_RUNTIME: { network: { assertProviderRequest(url) { assert.match(url, /^https:\/\/provider\.invalid\//); } } }
};
c.window = c;
vm.createContext(c);
for (const file of ['app-i18n-locales', 'app-i18n', 'app-writing-language', 'app-sse-contract', 'app-ai-transport', 'app-outline-chapter-parser', 'app-chapter-numbering']) {
    vm.runInContext(fs.readFileSync(new URL('../core/' + file + '.js', import.meta.url), 'utf8'), c);
}
assert.equal(c.ZHIYU_I18N.getLocale(), 'zh-CN');
assert.equal(c.ZHIYU_I18N.getOutputLanguage(), 'zh-CN');
// Branding and repeated rendering must retain the translation binding.
const brandedKey = Object.keys(c.ZHIYU_LOCALES['zh-CN']).find(key => c.ZHIYU_LOCALES['zh-CN'][key].includes('还没有消息'));
assert.ok(brandedKey);
const attrs = new Map([['data-i18n', brandedKey]]);
const brandedNode = { tagName: 'DIV', children: [], textContent: c.ZHIYU_LOCALES['zh-CN'][brandedKey],
    closest: () => null, matches: () => true, querySelectorAll: () => [],
    getAttribute: key => attrs.get(key) ?? null, setAttribute: (key, value) => attrs.set(key, value), removeAttribute: key => attrs.delete(key) };
c.ZHIYU_I18N.apply(brandedNode); c.ZHIYU_I18N.apply(brandedNode);
assert.equal(attrs.get('data-i18n'), brandedKey);
c.ZHIYU_I18N.setLocale('en'); c.ZHIYU_I18N.apply(brandedNode);
assert.equal(brandedNode.textContent, c.ZHIYU_I18N.t(brandedKey));
assert.ok(!brandedNode.textContent.includes('还没有消息'));
for (const locale of ['en', 'id', 'ms', 'vi', 'th', 'ar', 'zh-CN']) {
    c.ZHIYU_I18N.setLocale(locale);
    assert.equal(c.ZHIYU_I18N.getOutputLanguage(), 'zh-CN', 'UI locale must not change AI output preference');
    assert.equal(c.document.documentElement.dir, locale === 'ar' ? 'rtl' : 'ltr');
}
const samples = { 'zh-CN': '雨夜里，他推开旧书店的门，灯光映出一封信。', en: 'The rain stopped. Mira found a letter beneath the old door.',
    id: 'Hujan berhenti. Mira menemukan surat di bawah pintu lama.', ms: 'Hujan berhenti. Mira menemui surat di bawah pintu lama.',
    vi: 'Mưa đã tạnh. Mira tìm thấy một lá thư dưới cánh cửa cũ.', th: 'ฝนหยุดแล้ว มิราพบจดหมายใต้ประตูเก่า', ar: 'توقف المطر. وجدت ميرا رسالة تحت الباب القديم.' };
for (const [language, text] of Object.entries(samples)) {
    for (const protocol of ['openai', 'anthropic', 'responses']) {
        c.ZHIYU_I18N.setOutputLanguage(language);
        const hidden = '<think>private reasoning</think>' + text;
        events = protocol === 'openai' ? [{ choices: [{ delta: { content: hidden } }] }, { choices: [{ finish_reason: 'stop' }] }]
            : protocol === 'anthropic' ? [{ type: 'content_block_delta', delta: { text: hidden } }, { type: 'message_stop' }]
            : [{ type: 'response.reasoning_text.delta', delta: 'never expose' }, { type: 'response.output_text.delta', delta: hidden }, { type: 'response.completed' }];
        const chunks = [];
        const result = await c.streamGenerate({ base: 'https://provider.invalid/v1/models', model: 'fixture', key: 'fixture-key', protocol },
            'Preserve schema keys.', 'Write a scene.', chunk => chunks.push(chunk));
        assert.equal(result, text); assert.equal(chunks.join(''), text);
        assert.equal(requestedUrl, 'https://provider.invalid/v1/' + ({ openai: 'chat/completions', anthropic: 'messages', responses: 'responses' })[protocol]);
        if (protocol === 'responses') { assert.equal(body.store, false); assert.equal(body.input[0].content[0].type, 'input_text'); }
    }
}
// The request keeps its language when the user changes preferences while it is running.
c.ZHIYU_I18N.setOutputLanguage('en'); outputLanguageChanged = true;
events = [{ type: 'response.completed', response: { output: [{ content: [{ type: 'output_text', text: samples.en }] }] } }];
assert.equal(await c.streamGenerate({ base: 'https://provider.invalid/v1', model: 'fixture', protocol: 'responses' }, 'Task', 'Task'), samples.en);
outputLanguageChanged = false;
for (const type of ['response.failed', 'response.incomplete']) {
    events = [{ type }]; let completed = false, error;
    await c.streamGenerate({ base: 'https://provider.invalid/v1', model: 'fixture', protocol: 'responses' }, 'Task', 'Task', () => {}, () => { completed = true; }, value => { error = value; });
    assert.equal(completed, false); assert.ok(error);
}
const titles = ['Chapter 1: Door', 'Bab 1: Pintu', 'Chương 1: Cửa', 'บทที่๑ ประตู', 'الفصل الأول: الباب'];
for (const title of titles) {
    const source = '# ' + title + '\n' + samples.en + '\n';
    assert.equal(c.parseChapterNum(title), 1);
    const parsed = c.regexSplitChapters(source, 1, 10);
    assert.equal(parsed.length, 1); assert.equal(parsed[0].num, 1); assert.equal(parsed[0].content, source.trim());
    assert.equal(c.splitGeneratedChapterSections(source)[0].content, source.trim());
}
assert.equal(c.ZHIYU_WRITING_LANGUAGE.findHeadings('She spoke about Chapter 2 yesterday.\nChapter 1-3: Plan', 'chapter').length, 0);
assert.equal(c.ZHIYU_WRITING_LANGUAGE.countCharacters('العربية ไทย e\u0301', { html: false }), 11);
assert.equal(c.ZHIYU_AI_TRANSPORT.buildModelDiscoveryUrl('https://provider.invalid/v1/responses'), 'https://provider.invalid/v1/models');
// Fine-outline cards must keep exactly one chapter prefix after matching bare headings.
c.ACTION_PANEL_APP_STATE = { outlineGen: { chapters: [{ num: 1, title: 'Original', content: 'original' }] } };
c.refreshAllOGFileStacks = () => {};
vm.runInContext(fs.readFileSync(new URL('../core/app-action-panel-outline-splitter.js', import.meta.url), 'utf8'), c);
c.splitFineOutlineByChapter('## 第1章 初遇\n中文细纲。\n## Chapter 2: Letter\nEnglish outline.');
assert.equal(c.ACTION_PANEL_APP_STATE.outlineGen.chapters[0].title, '初遇');
assert.equal(c.ACTION_PANEL_APP_STATE.outlineGen.chapters[1].title, 'Letter');
// Execute the actual tutorial lookup helper against a translated button.
const tutorial = fs.readFileSync(new URL('../core/app-outline-tutorial.js', import.meta.url), 'utf8');
const helperStart = tutorial.indexOf('    function findTextButton(');
const helperEnd = tutorial.indexOf('    function resolveTarget(', helperStart);
const tutorialButton = { textContent: 'Medium', getAttribute: () => 'flow.中级' };
c.document.querySelector = () => ({ querySelectorAll: () => [tutorialButton] });
c.isVisible = () => true;
vm.runInContext(tutorial.slice(helperStart, helperEnd), c);
assert.equal(c.findTextButton('#naturalizeModal', '中级'), tutorialButton);
console.log('PASS multilingual: 21 actual SSE/protocol paths, hidden reasoning, language snapshot, failed terminal events, seven-language preferences and original chapter content. Synthetic models, no external calls.');
