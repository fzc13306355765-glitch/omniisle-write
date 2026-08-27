(function(window) {
    'use strict';

    const CONTENT = Object.freeze({
        'action-tabs': { title: '细纲 / 拆书 / 优化', summary: '三个标签页分别处理章节规划、作品拆解和正文优化。', steps: ['细纲：选择大纲或输入剧情走向后生成并保存章节细纲', '拆书：导入章节，分析结构、人物关系和可借鉴写法', '优化：先检测或锁定剧情，再配置优化并确认应用到正文'], note: '切换标签页不会自动覆盖正文，只有“应用到正文”才会写入。' },
        'ai-polish': { title: 'AI优化配置', summary: '控制本次正文优化的方式和改写幅度。', steps: ['选择提示词模版', '选择轻度、中度或重度', '按需选择侧重点后开始优化'], note: '优化结果先进入预览，确认“应用到正文”后才会覆盖正文。' },
        'chapter-generate': { title: '章节生成配置', summary: '准备本章生成时使用的规则和参考资料。', steps: ['选择提示词模版，决定本章怎么写', '关联大纲、设定和人物等资料', '选择参考章节，用于文风和上下文衔接', '确认自备模型配置后点击开始生成'], note: '关联文件和参考章节不会被修改或删除。' },
        'chapter-generate-readiness': { title: '生成本章使用条件', summary: '按钮变亮前，请完成以下 3 项：', steps: ['在章节目录中选中一个正式章节，不能选卷目录或关联资料', '选择一份提示词模版', '至少选择 1 个与当前作品匹配的关联文件'], note: '“参考上文”、本章字数和剧情描述属于建议项；第一章没有前文也可以生成。模型已有默认值，可按需切换；生成期间按钮会暂时停用。' },
        'chapter-generation-focus': { title: '正文生成模式', summary: '两种模式分别有以下作用：', steps: ['剧情模式：更加注重段落自然结尾、剧情连贯性和内容质量', '字数模式：分阶段生成当前正文，对字数把控更加精准'], note: '两种模式都使用本章填写的目标字数；未填写时默认 3000 字。模式不会自动切换模型，所有请求只发送到当前选择的自备模型。' },
        'advanced-outline-master': { title: '大纲生成', summary: '先生成整本书的母大纲，作为后续阶段展开的基础。', steps: ['选择题材和全篇字数', '按需填写剧情梗概与剧情标签', '点击生成完整母大纲'], note: '生成母大纲时无需选择阶段。' },
        'advanced-outline-stages': { title: '阶段生成', summary: '把母大纲中的一个阶段继续展开成阶段粗纲。', steps: ['先生成或选择母大纲', '选择 S01、S02 等目标阶段', '按需关联参考文件后生成阶段粗纲'], note: '每次只展开一个阶段，不会改正文、章节细纲或上传文件。' },
        'advanced-outline-summary': { title: '剧情梗概', summary: '填写核心创意、主线方向、主要冲突和阶段要求。', steps: ['输入剧情方向或补充要求', '点击“添加标签”选择剧情偏好', '生成时与上方题材约束一起交给模型'], note: '这里的蓝色标签只显示剧情标签，题材仍在“题材选择”中管理。' },
        'outline-picker': { title: '选择大纲', summary: '从记忆库选择大纲，再拆分出需要生成细纲的章节。', steps: ['从记忆库加载大纲文件', '设置起止章节范围', '优先使用正则快拆，识别失败时使用智能拆分', '勾选拆分结果后点击确定'], note: '推荐章节标题使用“## 第X章”；普通“第X章”也可先整理格式再快拆。' },
        'outline-continue-overview': { title: '大纲续写总步骤', summary: '把已有大纲继续往后展开，不会直接覆盖原文件。', steps: ['选择一份当前作品中需要续写的普通大纲或母大纲', '关联角色列表、设定集、信息表、追踪表等资料，不要重复选择大纲', '填写从哪里继续、后续方向和不能改变的约束', '点击确定生成，检查结果后再保存'], note: '续写大纲、关联文件和正文应属于同一部作品，避免人物与设定串线。' },
        'outline-continue-source': { title: '该选哪个大纲', summary: '只选择一份需要继续写下去的主大纲。', steps: ['优先选择当前作品最新的大纲或高级母大纲', '确认文件末尾就是本次要接着写的位置', '不要选择章节正文、章节细纲或拆书分析'], note: '如果同名文件有多个版本，请先在记忆库确认内容，再选择最新且完整的一份。' },
        'outline-continue-links': { title: '该选哪些关联文件', summary: '选择用于保持人物、设定和伏笔一致的资料。', steps: ['优先选择角色列表、设定集和信息表', '长篇续写可再选择追踪表、边界卡、承接卡、关键事件表和资料索引', '不要在这里再次选择大纲文件'], note: '只选确实与当前作品相关的资料；无关文件会让续写方向混乱。' },
        'outline-continue-reference': { title: '续写参考怎么填', summary: '写清楚后续要发生什么，以及哪些内容不能改。', steps: ['说明从哪个阶段、卷或章节之后继续', '填写必须发生的事件、目标章节范围和收束位置', '补充视角、人物关系、节奏、文风等要求', '写明禁止改动的设定、角色状态和既有结局'], note: '不确定时至少写一句后续主线方向；不要把整份大纲重复粘贴到这里。' },
        'naturalize-usage': { title: '优化功能使用说明', summary: '消痕 I 会依次完成 AI检测、剧情锁定和 AI优化；消痕 II 可以直接按低、中、高档优化。', steps: ['先在设置中添加模型 API，并为“工具模型”选择该模型', '在章节目录中选择一章有正文的章节', '消痕 I 建议按 AI检测、剧情锁定、AI优化的顺序使用', '消痕 II 选择优化等级后直接开始', '检查预览后再点击“应用到正文”'], note: '所有请求只发送到您配置的模型接口；开源版不会登录知屿账号，也不会使用知屿积分。' },
        'template-metadata-safety': { compact: true, wrap: true, text: '模板信息生成仅用于本次资料建议，不会自动保存、发布或公开提示词。' },
        'outline-wordcount-short': { compact: true, points: 15, calls: 1 },
        'outline-wordcount-medium': { compact: true, points: 23, calls: 1 },
        'outline-wordcount-long': { compact: true, points: 30, calls: 2 },
        'outline-wordcount-xlong': { compact: true, points: 45, calls: 4 }
    });

    function initFlowHelpHints() {
        const triggers = Array.from(document.querySelectorAll('[data-flow-help]'));
        if (!triggers.length || document.getElementById('flowHelpPopover')) return;
        const popover = document.createElement('div');
        popover.id = 'flowHelpPopover'; popover.className = 'flow-help-popover'; popover.hidden = true;
        popover.setAttribute('role', 'tooltip'); popover.setAttribute('aria-live', 'polite');
        document.body.appendChild(popover);
        let active = null;
        let pinned = false;
        let timer = null;
        const clearTimer = () => { if (timer) clearTimeout(timer); timer = null; };
        const hide = () => {
            clearTimer();
            active?.setAttribute('aria-expanded', 'false'); active?.removeAttribute('aria-describedby');
            active = null; pinned = false; popover.hidden = true;
        };
        const position = () => {
            if (!active || popover.hidden) return;
            const rect = active.getBoundingClientRect();
            const left = Math.max(12, Math.min(rect.left, window.innerWidth - popover.offsetWidth - 12));
            const below = rect.bottom + 8;
            const top = below + popover.offsetHeight <= window.innerHeight - 12 ? below : Math.max(12, rect.top - popover.offsetHeight - 8);
            popover.style.left = left + 'px'; popover.style.top = top + 'px';
        };
        const show = (trigger, shouldPin) => {
            const content = CONTENT[trigger.dataset.flowHelp]; if (!content) return;
            clearTimer(); active = trigger; pinned = !!shouldPin;
            if (content.compact) {
                const summary = document.createElement('p');
                summary.className = 'flow-help-popover-summary';
                if (content.text) {
                    summary.textContent = content.text;
                } else {
                    const advancedMode = typeof window.isAdvancedOutlineMode === 'function' && window.isAdvancedOutlineMode();
                    const schedule = advancedMode && typeof window.getAdvancedOutlineSegmentSchedule === 'function'
                        ? window.getAdvancedOutlineSegmentSchedule()
                        : [];
                    summary.textContent = advancedMode
                        ? `预计分 ${Math.max(1, schedule.length)} 段生成，使用当前自备模型`
                        : `预计调用模型 ${content.calls || 1} 次，实际次数取决于重试情况`;
                }
                popover.replaceChildren(summary);
                popover.classList.add('flow-help-popover-compact');
            } else {
                const title = document.createElement('strong'); title.className = 'flow-help-popover-title'; title.textContent = content.title;
                const summary = document.createElement('p'); summary.className = 'flow-help-popover-summary'; summary.textContent = content.summary;
                const steps = document.createElement('ol'); steps.className = 'flow-help-popover-steps';
                content.steps.forEach(text => { const item = document.createElement('li'); item.textContent = text; steps.appendChild(item); });
                const note = document.createElement('p'); note.className = 'flow-help-popover-note'; note.textContent = '注意：' + content.note;
                popover.replaceChildren(title, summary, steps, note);
                popover.classList.remove('flow-help-popover-compact');
            }
            popover.classList.toggle('flow-help-popover-wrap', content.wrap === true);
            popover.hidden = false;
            trigger.setAttribute('aria-expanded', 'true'); trigger.setAttribute('aria-describedby', popover.id);
            requestAnimationFrame(position);
        };
        const scheduleHide = () => { if (!pinned) { clearTimer(); timer = setTimeout(() => { if (!popover.matches(':hover') && active !== document.activeElement) hide(); }, 100); } };
        triggers.forEach(trigger => {
            trigger.setAttribute('aria-controls', popover.id);
            trigger.addEventListener('mouseenter', () => { if (!pinned) show(trigger, false); });
            trigger.addEventListener('mouseleave', scheduleHide);
            trigger.addEventListener('focus', () => show(trigger, pinned));
            trigger.addEventListener('blur', scheduleHide);
            trigger.addEventListener('click', event => { event.stopPropagation(); active === trigger && pinned ? hide() : show(trigger, true); });
        });
        popover.addEventListener('mouseenter', clearTimer); popover.addEventListener('mouseleave', scheduleHide);
        document.addEventListener('click', event => { if (!popover.hidden && !popover.contains(event.target) && !active?.contains(event.target)) hide(); });
        document.addEventListener('keydown', event => { if (event.key === 'Escape' && !popover.hidden) { const trigger = active; hide(); trigger?.focus(); } });
        window.addEventListener('resize', position); document.addEventListener('scroll', position, true);
    }

    window.FLOW_HELP_CONTENT = CONTENT;
    window.initFlowHelpHints = initFlowHelpHints;
    window.ZHIYU_FLOW_HELP_READY = true;
    initFlowHelpHints();
})(window);
