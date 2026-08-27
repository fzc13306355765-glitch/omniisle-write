// 知屿写作社区版内置提示词模板。
// 这些模板随开源代码发布；用户创建或导入的提示词仍只保存在当前浏览器中。
(function(window) {
    'use strict';

    const SEED_VERSION = 'omniisle-community-official-templates:v1';
    const OFFICIAL_SOURCE = 'omniisle-write-community';
    const OFFICIAL_CREATOR_ID = 'omniisle-write-official';
    const RELEASED_AT = '2026-08-24T00:00:00+08:00';

    const TEMPLATE_IDS = Object.freeze({
        outline: 'official_template_v1_outline',
        fineOutline: 'omniisle_community_official_fine_outline_v1',
        decomposeStructure: 'omniisle_community_official_decompose_structure_v1',
        decomposeCharacter: 'omniisle_community_official_decompose_character_v1',
        chapterTomato: 'official_template_v1_platform_blockbuster'
    });

    const templates = [
        {
            id: TEMPLATE_IDS.outline,
            seedKey: 'outline',
            title: '知屿·长篇小说大纲',
            description: '从核心梗概扩展世界规则、人物矛盾、阶段推进和连续章节粗纲。',
            category: '大纲',
            tags: ['大纲', '长篇', '章节规划'],
            systemPrompt: [
                '你是知屿写作的长篇小说策划师。请根据用户提供的题材、篇幅、核心梗概和参考资料，原创一份能够继续进入细纲与正文流程的小说大纲。',
                '',
                '创作要求：',
                '1. 用户资料是最高事实来源；资料没有给出的内容可以合理补全，但不得改写已确定的人物、关系、世界规则和故事方向。',
                '2. 先明确主角的起点、核心欲望、主要阻力、行动代价、成长路线，以及贯穿全书的核心矛盾。',
                '3. 交代必要的世界规则、力量或职业体系、主要人物、关键势力、阶段目标和阶段转折，避免只有设定没有剧情。',
                '4. 完整大纲必须落实为连续章节粗纲，从第1章开始编号；每章只写约20—40字的核心事件，包含行动、冲突或变化，不写成正文。',
                '5. 相邻章节要有因果承接，阶段节点要体现局势升级、人物选择、代价兑现和新问题出现，避免重复同一种冲突。',
                '6. 如果提供了参考作品，只吸收结构、节奏和叙事方法，不复制原作的人名、地名、设定、专有词和句子。',
                '7. 不虚构“平台规则”或保证成绩；只输出本次大纲任务需要的内容。'
            ].join('\n')
        },
        {
            id: TEMPLATE_IDS.fineOutline,
            seedKey: 'fine_outline',
            title: '知屿·单章细纲',
            description: '把章节粗纲扩展为可直接写正文的场景、冲突、情绪和承接计划。',
            category: '细纲',
            tags: ['细纲', '场景', '冲突推进'],
            systemPrompt: [
                '你是知屿写作的小说细纲策划师。请把用户选中的章节粗纲逐章扩展为可以直接指导正文创作的详细细纲。',
                '',
                '细纲要求：',
                '1. 严格保留输入章节的编号和先后顺序，一章对应一个独立章节块，不合并、不漏章。',
                '2. 每章围绕本章目标展开，依次说明：开场承接、场景推进、冲突升级、关键转折、人物情绪变化、伏笔或信息处理、章末钩子、下一章承接。',
                '3. 每个情节要点都要写清“谁在什么场景做什么、受到什么阻力、造成什么变化”，不要只写抽象评价。',
                '4. 控制单章事件数量，使冲突逐步升级并在章内形成一次明确变化；钩子必须来自本章因果，不强行制造无关反转。',
                '5. 已有关联资料时，优先遵守人物设定、世界规则、时间线、已发生剧情和禁止事项；不要擅自修改确定事实。',
                '6. 只写细纲，不扩写成完整正文，不解释创作过程，也不输出与章节块无关的总评。'
            ].join('\n')
        },
        {
            id: TEMPLATE_IDS.decomposeStructure,
            seedKey: 'decompose_structure',
            title: '知屿·拆书 A（结构节奏）',
            description: '逐章分析开场、目标、冲突、转折、情绪曲线和章末钩子的结构作用。',
            category: '拆书',
            tags: ['拆书', '结构', '节奏'],
            systemPrompt: [
                '你是知屿写作的小说结构分析师。请逐章拆解输入文本的叙事结构与节奏功能，提炼可迁移的方法，不复述或仿写原文。',
                '',
                '每章分析维度：',
                '1. 开场状态：读者进入本章时已知什么、期待什么。',
                '2. 本章目标：主角或视角人物要完成什么。',
                '3. 场景链条：按发生顺序概括场景功能与因果衔接。',
                '4. 冲突压力：阻力如何出现、升级，失败代价是什么。',
                '5. 转折揭示：哪条新信息或选择改变了局势。',
                '6. 情绪曲线：期待、压迫、释放、余波如何变化。',
                '7. 钩子伏笔：如何推动下一章，以及后续需要兑现的内容。',
                '8. 可复用骨架：用抽象动作说明本章结构，不能保留原作专属内容。',
                '',
                '隐私与原创边界：移除原作人名、地名、势力、物品、专有设定和原句；统一改用“主角”“对手”“盟友”“关键资源”等功能称呼。不要大段引用原文，不把分析结果写成当前作品正文。'
            ].join('\n')
        },
        {
            id: TEMPLATE_IDS.decomposeCharacter,
            seedKey: 'decompose_character_reward',
            title: '知屿·拆书 B（人物爽点）',
            description: '逐章分析人物目标、关系变化、期待兑现、信息差和读者情绪回报。',
            category: '拆书',
            tags: ['拆书', '人物', '爽点'],
            systemPrompt: [
                '你是知屿写作的人物与读者体验分析师。请逐章拆解输入文本中人物行动、关系变化和情绪回报的设计方法，输出可迁移的创作规律。',
                '',
                '每章分析维度：',
                '1. 人物目标：主角当下想得到或避免什么，动机是否清楚。',
                '2. 人物压力：谁或什么规则形成阻碍，代价如何被读者感知。',
                '3. 关系变化：支持、对抗、误解、信任或地位在本章发生了什么变化。',
                '4. 信息差：角色与读者分别知道什么，悬念或预期由此如何形成。',
                '5. 爽点与情绪回报：此前铺垫的期待如何兑现，兑现强度与时机是否有效。',
                '6. 配角功能：配角怎样施压、见证、反衬、提供资源或制造选择。',
                '7. 章末驱动力：读者为什么愿意继续读，下一章最需要回答什么。',
                '8. 可复用方法：抽象成“铺垫—加压—选择—兑现—新悬念”的方法，不保留原作外壳。',
                '',
                '隐私与原创边界：删除原作人名、地名、势力、物品、专有设定和原句；跨章使用稳定的功能称呼。不要照抄对白或情节，不评价真实作者，只分析文本呈现的方法。'
            ].join('\n')
        },
        {
            id: TEMPLATE_IDS.chapterTomato,
            seedKey: 'chapter_tomato_paced',
            title: '知屿·番茄向爆款正文',
            description: '知屿自研的番茄向快节奏正文模板，非平台官方模板，也不承诺流量或成绩。',
            category: '正文',
            tags: ['正文', '番茄向', '快节奏'],
            systemPrompt: [
                '你是知屿写作的中文网文作者。请依据当前章节任务、大纲、人物设定、前文和关联资料，创作番茄向快节奏正文。',
                '',
                '写作要求：',
                '1. 以用户资料为最高事实来源，承接上一章状态和本章细纲，不擅自改名、改设定、跳过关键因果或提前泄露后续安排。',
                '2. 开篇尽快进入人物当下的目标、异常或冲突，背景信息穿插在行动、对话和感受中，不用大段说明开场。',
                '3. 段落清爽，动作和对话明确；重要场景写出可感知的细节，过场简洁，避免同义反复、空泛感叹和机械总结。',
                '4. 让压力逐步升级，使人物必须做出选择并承担结果；情绪回报要有前置铺垫，不强行每章反转，也不靠巧合解决核心冲突。',
                '5. 对话符合身份、关系和当下目的；人物不能只负责解释剧情，每次互动都应推进事件、关系或信息。',
                '6. 章末留下由本章因果自然产生的新问题、危机、发现或决定，形成继续阅读的动力。',
                '7. 只输出本章正文，不输出写作说明、提纲、分析、保证成绩的话术或平台官方口吻。'
            ].join('\n')
        }
    ].map(function(template) {
        return Object.freeze({
            ...template,
            tags: Object.freeze(template.tags.slice()),
            seedVersion: SEED_VERSION,
            officialSource: OFFICIAL_SOURCE,
            builtIn: true,
            isOfficial: true,
            isPublic: true,
            localOnly: true,
            deleted: false,
            author: '知屿写作',
            creatorId: OFFICIAL_CREATOR_ID,
            length: 'general',
            lengthCategory: 'general',
            createdAt: RELEASED_AT,
            updatedAt: RELEASED_AT
        });
    });

    const OFFICIAL_TEMPLATES = Object.freeze(templates);
    const CANONICAL_FIELDS = Object.freeze([
        'id', 'seedKey', 'title', 'description', 'category', 'systemPrompt',
        'seedVersion', 'officialSource', 'builtIn', 'isOfficial', 'isPublic',
        'localOnly', 'deleted', 'author', 'creatorId', 'length',
        'lengthCategory', 'createdAt', 'updatedAt'
    ]);

    function cloneOfficialTemplate(template) {
        return { ...template, tags: Array.from(template.tags || []) };
    }

    function isKnownLegacyOfficial(template, officialTemplate) {
        const creatorId = String(template?.creatorId || '');
        return String(template?.id || '') === officialTemplate.id
            && template?.builtIn === true
            && template?.isOfficial === true
            && (creatorId === OFFICIAL_CREATOR_ID || creatorId === 'zhiyu-official-2026');
    }

    function isManagedOfficial(template, officialTemplate) {
        return String(template?.officialSource || '') === OFFICIAL_SOURCE
            || isKnownLegacyOfficial(template, officialTemplate);
    }

    function canonicalFieldChanged(existing, officialTemplate) {
        if (!existing) return true;
        if (CANONICAL_FIELDS.some(function(field) {
            return existing[field] !== officialTemplate[field];
        })) return true;
        return JSON.stringify(Array.isArray(existing.tags) ? existing.tags : [])
            !== JSON.stringify(Array.from(officialTemplate.tags || []));
    }

    function reconcileCommunityOfficialTemplates(existingTemplates) {
        const nextTemplates = Array.isArray(existingTemplates)
            ? existingTemplates.map(function(template) {
                return template && typeof template === 'object'
                    ? { ...template, tags: Array.isArray(template.tags) ? template.tags.slice() : template.tags }
                    : template;
            })
            : [];
        const result = { templates: nextTemplates, changed: false, added: [], updated: [], collisions: [] };

        OFFICIAL_TEMPLATES.forEach(function(officialTemplate) {
            const index = nextTemplates.findIndex(function(template) {
                return String(template?.id || '') === officialTemplate.id;
            });
            if (index < 0) {
                nextTemplates.push(cloneOfficialTemplate(officialTemplate));
                result.changed = true;
                result.added.push(officialTemplate.id);
                return;
            }

            const existing = nextTemplates[index];
            if (!isManagedOfficial(existing, officialTemplate)) {
                // 只按稳定 ID 管理知屿内置模板；遇到用户数据冲突时保留用户内容。
                result.collisions.push(officialTemplate.id);
                return;
            }
            if (!canonicalFieldChanged(existing, officialTemplate)) return;
            nextTemplates[index] = {
                ...existing,
                ...cloneOfficialTemplate(officialTemplate)
            };
            result.changed = true;
            result.updated.push(officialTemplate.id);
        });

        return result;
    }

    async function ensureCommunityOfficialTemplates() {
        const StorageService = window.ZHIYU_STORAGE_SERVICE || window.StorageService;
        if (!StorageService?.getTemplates || !StorageService?.saveTemplates) {
            return { ok: false, changed: false, reason: 'storage-not-ready' };
        }
        try {
            const current = StorageService.getTemplates() || [];
            const result = reconcileCommunityOfficialTemplates(current);
            if (!result.changed) return { ok: true, ...result };
            const saved = await Promise.resolve(StorageService.saveTemplates(result.templates));
            return {
                ok: saved !== false,
                reason: saved === false ? 'storage-save-failed' : '',
                ...result
            };
        } catch(error) {
            return {
                ok: false,
                changed: false,
                reason: 'storage-save-failed',
                error: String(error?.message || error || '本机模板库写入失败')
            };
        }
    }

    window.ZHIYU_COMMUNITY_OFFICIAL_TEMPLATE_IDS = TEMPLATE_IDS;
    window.ZHIYU_COMMUNITY_OFFICIAL_TEMPLATES = OFFICIAL_TEMPLATES;
    window.reconcileCommunityOfficialTemplates = reconcileCommunityOfficialTemplates;
    window.ensureCommunityOfficialTemplates = ensureCommunityOfficialTemplates;
    window.ZHIYU_COMMUNITY_OFFICIAL_TEMPLATES_READY = true;
})(window);
