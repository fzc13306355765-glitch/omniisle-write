import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const source = read('scripts/core/app-community-official-templates.js');
const templateWindow = {};

vm.runInNewContext(source, { window: templateWindow, console });

const officialTemplates = Array.from(templateWindow.ZHIYU_COMMUNITY_OFFICIAL_TEMPLATES || []);
const ids = templateWindow.ZHIYU_COMMUNITY_OFFICIAL_TEMPLATE_IDS || {};
assert.equal(officialTemplates.length, 5, '知屿内置模板数量不是 5 个');
assert.equal(new Set(officialTemplates.map(template => template.id)).size, 5, '知屿内置模板 ID 不唯一');
assert.deepEqual(
    Array.from(officialTemplates, template => template.category).sort(),
    ['正文', '大纲', '拆书', '拆书', '细纲'].sort(),
    '知屿内置模板分类不完整'
);

for (const template of officialTemplates) {
    assert.equal(template.builtIn, true, `${template.title} 未标记为内置模板`);
    assert.equal(template.isOfficial, true, `${template.title} 未标记为知屿官方模板`);
    assert.equal(template.isPublic, true, `${template.title} 未在模板页显示`);
    assert.equal(template.localOnly, true, `${template.title} 未标记为本机模板`);
    assert.equal(template.officialSource, 'omniisle-write-community', `${template.title} 来源标记错误`);
    assert.equal(template.creatorId, 'omniisle-write-official', `${template.title} 作者标记错误`);
    assert.ok(template.systemPrompt.length >= 250, `${template.title} 提示词内容过短`);
}

assert.equal(officialTemplates.find(template => template.id === ids.outline)?.title, '知屿·长篇小说大纲');
assert.equal(officialTemplates.find(template => template.id === ids.fineOutline)?.title, '知屿·单章细纲');
assert.equal(officialTemplates.find(template => template.id === ids.decomposeStructure)?.title, '知屿·拆书 A（结构节奏）');
assert.equal(officialTemplates.find(template => template.id === ids.decomposeCharacter)?.title, '知屿·拆书 B（人物爽点）');
const tomatoTemplate = officialTemplates.find(template => template.id === ids.chapterTomato);
assert.equal(tomatoTemplate?.title, '知屿·番茄向爆款正文');
assert.match(tomatoTemplate?.description || '', /非平台官方模板，也不承诺流量或成绩/, '番茄向模板缺少真实边界说明');
assert.match(tomatoTemplate?.systemPrompt || '', /只输出本章正文/, '番茄向正文模板没有限制输出正文');
assert.doesNotMatch(source, /渺茫指引|全能至强拆书/, '社区内置模板仍包含第三方提示词标识');

const userTemplate = {
    id: 'local-user-template',
    title: '知屿·长篇小说大纲',
    category: '大纲',
    systemPrompt: '这是用户自己的提示词，不能覆盖。',
    creatorId: 'local-user',
    builtIn: false,
    isOfficial: false
};
const userSnapshot = JSON.stringify(userTemplate);
const first = templateWindow.reconcileCommunityOfficialTemplates([userTemplate]);
assert.equal(first.changed, true, '空模板库没有补入知屿内置模板');
assert.equal(first.added.length, 5, '没有一次补齐 5 个知屿内置模板');
assert.equal(first.templates.length, 6, '同名用户模板被错误替换或删除');
assert.equal(JSON.stringify(first.templates.find(template => template.id === userTemplate.id)), userSnapshot, '同名用户模板内容被修改');
assert.equal(JSON.stringify(userTemplate), userSnapshot, '模板合并修改了调用方的用户对象');

const second = templateWindow.reconcileCommunityOfficialTemplates(first.templates);
assert.equal(second.changed, false, '知屿内置模板重复初始化仍然写入');
assert.equal(second.templates.length, 6, '重复初始化产生了模板副本');

const collidingUserTemplate = {
    id: ids.outline,
    title: '用户占用的稳定 ID',
    systemPrompt: '用户内容必须原样保留',
    creatorId: 'local-user',
    builtIn: false,
    isOfficial: false
};
const collision = templateWindow.reconcileCommunityOfficialTemplates([collidingUserTemplate]);
assert.deepEqual(Array.from(collision.collisions), [ids.outline], '稳定 ID 冲突没有被识别');
assert.equal(collision.templates[0].systemPrompt, collidingUserTemplate.systemPrompt, '稳定 ID 冲突时覆盖了用户提示词');
assert.equal(collision.added.length, 4, '稳定 ID 冲突影响了其他官方模板补入');

const legacyOfficial = {
    id: ids.outline,
    title: '旧版大纲模板',
    systemPrompt: '旧版公开提示词',
    creatorId: 'zhiyu-official-2026',
    builtIn: true,
    isOfficial: true,
    usageCount: 7,
    favorited: true
};
const upgraded = templateWindow.reconcileCommunityOfficialTemplates([legacyOfficial]);
const upgradedOutline = upgraded.templates.find(template => template.id === ids.outline);
assert.equal(upgraded.updated.length, 1, '旧版知屿模板没有升级');
assert.equal(upgradedOutline.title, '知屿·长篇小说大纲', '旧版知屿模板没有换成公开版内容');
assert.equal(upgradedOutline.usageCount, 7, '升级知屿模板时丢失本机使用次数');
assert.equal(upgradedOutline.favorited, true, '升级知屿模板时丢失本机收藏状态');

let storedTemplates = [];
let saveCount = 0;
templateWindow.ZHIYU_STORAGE_SERVICE = {
    getTemplates: () => storedTemplates,
    saveTemplates: templates => {
        saveCount += 1;
        storedTemplates = templates;
        return true;
    }
};
assert.equal((await templateWindow.ensureCommunityOfficialTemplates()).ok, true, '知屿内置模板首次保存失败');
assert.equal(saveCount, 1, '知屿内置模板首次保存次数错误');
assert.equal((await templateWindow.ensureCommunityOfficialTemplates()).changed, false, '知屿内置模板第二次初始化不幂等');
assert.equal(saveCount, 1, '幂等初始化仍然写本机模板库');

templateWindow.ZHIYU_STORAGE_SERVICE = {
    getTemplates: () => [],
    saveTemplates: async () => { throw new Error('模拟本机模板库写入失败'); }
};
const failedSave = await templateWindow.ensureCommunityOfficialTemplates();
assert.equal(failedSave.ok, false, '本机模板库写入失败被误报成功');
assert.equal(failedSave.reason, 'storage-save-failed', '本机模板库写入失败原因丢失');

const manifest = JSON.parse(read('config/community-runtime-bundles-v1.json'));
const moduleIndex = manifest.classicScripts.findIndex(item => item.includes('app-community-official-templates.js'));
const initIndex = manifest.classicScripts.findIndex(item => item.includes('app-init.js'));
const tutorialIndex = manifest.classicScripts.findIndex(item => item.includes('app-operation-tutorial-mainline-stages.js'));
assert.ok(moduleIndex >= 0 && moduleIndex < initIndex && moduleIndex < tutorialIndex, '知屿内置模板模块加载顺序错误');

const initSource = read('scripts/core/app-init.js');
assert.match(initSource, /await window\.ensureCurrentAccountScopeReady\?\.\(\);[\s\S]*await window\.ensureCommunityOfficialTemplates\?\.\(\)/, '模板没有在当前本机身份就绪后初始化');
const tutorialSource = read('scripts/core/app-operation-tutorial-mainline-stages.js');
assert.match(tutorialSource, /ZHIYU_COMMUNITY_OFFICIAL_TEMPLATES/, '操作教程没有使用社区版知屿内置模板');
const tutorialSources = [
    tutorialSource,
    read('scripts/core/app-operation-tutorial-extra-stages.js'),
    read('scripts/core/app-outline-tutorial.js')
].join('\n');
const runtimeSource = read('scripts/dist/community-runtime.js');
for (const retiredTemplateText of [
    'tutorial_decompose_miaomang_guide',
    '渺茫指引',
    '全能至强拆书',
    '平台爆款写作指令',
    '【细纲】粗纲转细纲（番茄爆款）',
    '大纲生成模板'
]) {
    assert.doesNotMatch(tutorialSources, new RegExp(retiredTemplateText), `操作教程仍引用旧模板：${retiredTemplateText}`);
    assert.doesNotMatch(runtimeSource, new RegExp(retiredTemplateText), `社区运行包仍包含旧模板：${retiredTemplateText}`);
}
for (const currentTemplateTitle of officialTemplates.map(template => template.title)) {
    assert.match(runtimeSource, new RegExp(currentTemplateTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `社区运行包缺少知屿内置模板：${currentTemplateTitle}`);
}

console.log('[smoke:community-builtin-templates] PASS 五个知屿内置模板、升级幂等、用户模板保护和教程引用均通过');
