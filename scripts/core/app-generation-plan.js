(function(window) {
    'use strict';

        const DEFAULT_CHAPTER_TARGET_WORDS = 3000;
        const MAX_CHAPTER_TARGET_WORDS = 20000;
        const CHAPTER_HIGH_REQUEST_CONFIRM_THRESHOLD = 5;
        const CHAPTER_SEGMENT_TARGET_WORDS = 1300;
        const CHAPTER_SUPPLEMENTAL_SEGMENT_LIMIT = 3;
        const CHAPTER_SEGMENT_MAX_TOKENS = 3600;
        const MAX_CHAPTER_OUTPUT_TOKENS = 16384;
        const CHAPTER_FULL_SAFE_TARGET_WORDS = Math.floor(MAX_CHAPTER_OUTPUT_TOKENS / 3);
        const CHAPTER_GENERATION_INPUT_LIMIT = 50000;
        const CHAPTER_SEGMENT_TAIL_CHARS = 2200;
        const CHAPTER_STORY_COMPLETION_MARKER = '[[ZHIYU_STORY_COMPLETE_6F4C]]';
        // 单段限制在 16K：部分模型服务的长连接可能提前断开，
        // 24K 输出在慢模型上可能超过该时限；分段数量不变，整本容量仍足够。
        const OUTLINE_SEGMENT_MAX_TOKENS = 16384;
        const OUTLINE_CHAPTER_WORDS = 2500;
        const OUTLINE_TARGET_WORDS = Object.freeze({
            short: 150000,
            medium: 500000,
            long: 1000000,
            xlong: 2000000
        });
        const OUTLINE_CONTINUITY_BRIDGE_MAX_CHARS = 1800;
        function extractExplicitChapterWordTarget(templatePrompt) {
            const source = String(templatePrompt || '').replace(/[,，]/g, '');
            const patterns = [
                /(?:本章(?:正文)?|整章|正文)\s*(?:总字数|目标字数|字数目标|字数)\s*(?:为|约|控制在|控制为|[:：=])?\s*(\d{3,6})\s*字/g,
                /(?:本章(?:正文)?|整章|正文)\s*(?:目标|约|写到|写成|控制在)\s*(\d{3,6})\s*字/g,
                /(?:总字数|目标字数|字数目标)\s*(?:为|约|控制在|控制为|[:：=])?\s*(\d{3,6})\s*字/g
            ];
            const matches = [];
            patterns.forEach(function(pattern) {
                let match;
                while ((match = pattern.exec(source))) {
                    const value = Number.parseInt(match[1], 10);
                    if (Number.isInteger(value) && value > 0) matches.push(value);
                }
            });
            const unique = Array.from(new Set(matches));
            return unique.length === 1 ? unique[0] : 0;
        }

        function parseChapterWordTargetInput(rawValue, badInput) {
            const raw = String(rawValue || '').trim();
            if (!raw && !badInput) return { ok: true, value: 0, automatic: true };
            if (badInput || !/^\d+$/.test(raw)) {
                return { ok: false, value: 0, automatic: false };
            }
            const value = Number(raw);
            if (!Number.isSafeInteger(value)
                || value <= 0
                || value > MAX_CHAPTER_TARGET_WORDS
                || !Number.isSafeInteger(Math.floor(value * 1.2))) {
                return { ok: false, value: 0, automatic: false };
            }
            return { ok: true, value, automatic: false };
        }

        function resolveChapterWordTarget(wordTarget, templatePrompt) {
            const numericTarget = Number(wordTarget);
            const target = Number.isSafeInteger(numericTarget) && numericTarget > 0 ? numericTarget : 0;
            if (target > 0) return target;
            return extractExplicitChapterWordTarget(templatePrompt) || DEFAULT_CHAPTER_TARGET_WORDS;
        }

        function resolveChapterGenerationTarget(wordTarget) {
            const numericTarget = Number(wordTarget);
            return Number.isSafeInteger(numericTarget) && numericTarget > 0
                ? numericTarget
                : DEFAULT_CHAPTER_TARGET_WORDS;
        }

        // 根据字数目标计算 max_tokens。这里只是输出上限，不会强制模型写满。
        function calcMaxTokensFromTemplate(_unused, wordTarget) {
            const target = resolveChapterWordTarget(wordTarget);
            return Math.min(Math.max(Math.ceil(target * 3), 8192), MAX_CHAPTER_OUTPUT_TOKENS);
        }

        function calcChapterSegmentMaxTokens() {
            return CHAPTER_SEGMENT_MAX_TOKENS;
        }

        function normalizeChapterGenerationFocus(value) {
            return String(value || '').trim().toLowerCase() === 'words' ? 'words' : 'story';
        }

        function countChapterGenerationWords(value) {
            const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
            const text = String(value || '')
                .replace(/<[^>]*>/g, '')
                .replace(/&(?:nbsp|#160|#x0*a0);/gi, ' ')
                .replace(/&#(\d+);/g, function(_match, code) {
                    const point = Number(code);
                    return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
                        ? String.fromCodePoint(point)
                        : '';
                })
                .replace(/&#x([\da-f]+);/gi, function(_match, code) {
                    const point = Number.parseInt(code, 16);
                    return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
                        ? String.fromCodePoint(point)
                        : '';
                })
                .replace(/&(amp|lt|gt|quot|apos);/gi, function(_match, name) {
                    return entities[String(name || '').toLowerCase()] || '';
                });
            let count = 0;
            for (const character of text) {
                if (/^[\p{L}\p{N}]$/u.test(character)) count += 1;
            }
            return count;
        }

        function getChapterGenerationPlan(wordTarget, _templatePrompt, focus) {
            const targetWords = resolveChapterGenerationTarget(wordTarget);
            const generationFocus = normalizeChapterGenerationFocus(focus);
            const wordExecutionTotal = Math.max(1, Math.round(targetWords / CHAPTER_SEGMENT_TARGET_WORDS));
            const longTarget = targetWords > CHAPTER_FULL_SAFE_TARGET_WORDS;
            const executionTotal = generationFocus === 'story'
                ? 1
                : (longTarget ? wordExecutionTotal : 2);
            return {
                focus: generationFocus,
                operation: generationFocus === 'story' ? 'chapter_story' : 'chapter_words',
                targetWords,
                executionTotal,
                wordExecutionTotal,
                total: executionTotal,
                longTarget,
                requiresHighRequestConfirmation: generationFocus === 'words'
                    && executionTotal > CHAPTER_HIGH_REQUEST_CONFIRM_THRESHOLD,
                segmentTarget: generationFocus === 'story' || !longTarget
                    ? targetWords
                    : Math.ceil(targetWords / executionTotal)
            };
        }

        function getChapterGenerationBudget(plan, stepIndex, generatedContent) {
            const source = plan || getChapterGenerationPlan(DEFAULT_CHAPTER_TARGET_WORDS, '', 'story');
            const targetWords = Math.max(1, Number(source.targetWords || DEFAULT_CHAPTER_TARGET_WORDS));
            const executionTotal = Math.max(1, Number(source.executionTotal || source.total || 1));
            const current = Math.min(executionTotal, Math.max(1, Number(stepIndex || 1)));
            const generatedWords = countChapterGenerationWords(generatedContent);
            const remainingTargetWords = Math.max(0, targetWords - generatedWords);
            const remainingSteps = Math.max(1, executionTotal - current + 1);
            const stepTargetWords = source.focus === 'story' || (!source.longTarget && current === 1)
                ? targetWords
                : Math.max(1, Math.ceil(remainingTargetWords / remainingSteps));
            return {
                generatedWords,
                targetWords,
                remainingTargetWords,
                reachedTarget: generatedWords >= targetWords,
                stepTargetWords
            };
        }

        function shouldStartChapterGenerationStep(plan, stepIndex, generatedContent) {
            const source = plan || getChapterGenerationPlan(DEFAULT_CHAPTER_TARGET_WORDS, '', 'story');
            const current = Math.max(1, Number(stepIndex || 1));
            const executionTotal = Math.max(1, Number(source.executionTotal || source.total || 1));
            if (current > executionTotal) return false;
            if (current === 1) return true;
            if (source.focus === 'story') return false;
            return !getChapterGenerationBudget(source, current, generatedContent).reachedTarget;
        }

        function buildChapterGenerationPrompt(basePrompt, plan, stepIndex, generatedContent) {
            const source = plan || getChapterGenerationPlan(DEFAULT_CHAPTER_TARGET_WORDS, '', 'story');
            const current = Math.max(1, Number(stepIndex || 1));
            const budget = getChapterGenerationBudget(source, current, generatedContent);
            let rule;
            if (source.focus === 'story') {
                rule = `剧情优先：一次写完整章，约${source.targetWords}字自然收束；连贯优先，勿凑字。\n`
                    + `只有在本章剧情已经完整推进并自然收束后，才在正文最后另起一行输出 ${CHAPTER_STORY_COMPLETION_MARKER}；该标记后不得再输出任何内容。`
                    + '如果正文尚未写完，禁止输出该标记。';
            } else if (current === 1) {
                rule = source.longTarget
                    ? `字数优先：本章总目标${source.targetWords}字；先从本章开头写约${budget.stepTargetWords}字并自然推进，勿提前收束。`
                    : `字数优先：本章目标${source.targetWords}字；直接写完整章，达标即自然收束。`;
            } else {
                const isLast = current >= Number(source.executionTotal || source.total || 1);
                rule = `承接上文，补约${budget.stepTargetWords}字${isLast ? '后收束' : '并自然推进'}；勿重复，勿另开支线。`;
                const tail = getSegmentTail(generatedContent, CHAPTER_SEGMENT_TAIL_CHARS);
                if (tail) rule += `\n【已写正文末尾】\n${tail}`;
            }
            return String(basePrompt || '') + '\n\n---\n\n【正文生成控制】\n' + rule;
        }

        // 大纲生成按篇幅阶梯计算 maxTokens
        function calcOutlineMaxTokens(wcKey) {
            const map = { short: 24576, medium: 49152, long: 73728, xlong: 98304 };
            return map[wcKey] || 24576;
        }

        function getOutlineSegmentPlan(wcKey) {
            const segmentMap = { short: 2, medium: 4, long: 8, xlong: 12 };
            const total = segmentMap[wcKey] || 2;
            const targetWords = OUTLINE_TARGET_WORDS[wcKey] || OUTLINE_TARGET_WORDS.medium;
            return {
                total,
                targetWords,
                targetChapters: Math.max(1, Math.round(targetWords / OUTLINE_CHAPTER_WORDS)),
                chapterStageTotal: Math.max(1, total - 1),
                segmentMaxTokens: total <= 1 ? calcOutlineMaxTokens(wcKey) : OUTLINE_SEGMENT_MAX_TOKENS
            };
        }

        function getOutlineChapterStageRange(plan, segmentIndex) {
            const total = Math.max(2, Number(plan?.total) || 2);
            const stageTotal = Math.max(1, Number(plan?.chapterStageTotal) || total - 1);
            const stageIndex = Number(segmentIndex) - 1;
            if (!Number.isInteger(stageIndex) || stageIndex < 1 || stageIndex > stageTotal) return null;
            const targetChapters = Math.max(1, Number(plan?.targetChapters) || 1);
            const baseCount = Math.floor(targetChapters / stageTotal);
            const remainder = targetChapters % stageTotal;
            const chapterCount = baseCount + (stageIndex <= remainder ? 1 : 0);
            const startChapter = 1 + (stageIndex - 1) * baseCount + Math.min(remainder, stageIndex - 1);
            return {
                stageIndex,
                stageTotal,
                startChapter,
                endChapter: startChapter + Math.max(1, chapterCount) - 1,
                chapterCount: Math.max(1, chapterCount),
                targetChapters,
                isLast: stageIndex === stageTotal
            };
        }

        function getOutlineFoundationContent(text) {
            const source = String(text || '');
            const firstHeading = getOutlineChapterHeadings(source)[0];
            return source.slice(0, firstHeading ? firstHeading.index : source.length).trim();
        }

        function getNormalOutlineMemorySource(text) {
            const source = String(text || '');
            const headings = getOutlineChapterHeadings(source);
            if (!headings.length) {
                return {
                    ok: false,
                    content: '',
                    chapterOutlineContent: '',
                    message: '未识别到从第1章开始的章节粗纲，无法安全确定基础设定范围'
                };
            }
            if (Number(headings[0].number) !== 1) {
                return {
                    ok: false,
                    content: '',
                    chapterOutlineContent: '',
                    message: '章节粗纲没有从第1章开始，无法安全确定基础设定范围'
                };
            }
            const content = source.slice(0, headings[0].index).trim();
            const chapterOutlineContent = source.slice(headings[0].index).trim();
            if (!content) {
                return {
                    ok: false,
                    content: '',
                    chapterOutlineContent: '',
                    message: '第1章之前没有可分析的基础设定'
                };
            }
            const futurePlanningHeading = /^(?:[ \t]*#{1,6}[ \t]*)?(?:全书阶段规划|剧情阶段规划|分卷规划|章节规划|结局规划|终局规划)\s*$/mi;
            const chapterRangeHeading = /^(?:[ \t]*#{1,6}[ \t]*)?第[ \t]*[零〇两一二三四五六七八九十百千万\d]{1,12}[ \t]*章[ \t]*(?:[-—–~～]|至|到)[ \t]*(?:第[ \t]*)?[零〇两一二三四五六七八九十百千万\d]{1,12}[ \t]*章/m;
            if (futurePlanningHeading.test(content) || chapterRangeHeading.test(content)) {
                return {
                    ok: false,
                    content: '',
                    chapterOutlineContent: '',
                    message: '基础设定中仍包含章节或结局规划，已停止关联资料分析'
                };
            }
            return {
                ok: true,
                content,
                chapterOutlineContent,
                chapterCount: headings.length,
                firstChapterNumber: headings[0].number
            };
        }

        function getOutlineContinuityBridge(text) {
            const foundation = getOutlineFoundationContent(text);
            if (!foundation) return '';
            const summaryIndex = foundation.search(/(?:^|\n)\s*(?:#{1,6}\s*)?章节承接摘要/i);
            const summary = summaryIndex >= 0 ? foundation.slice(summaryIndex) : foundation;
            const filtered = summary
                .split(/\r?\n/)
                .filter(function(line) {
                    return !/(?:最终收束|终局方向|最终大战|大结局|全书结局|最后阶段结局)/.test(line);
                })
                .join('\n')
                .trim();
            return getSegmentTail(filtered || foundation, OUTLINE_CONTINUITY_BRIDGE_MAX_CHARS);
        }

        function detectExplicitOutlineEnding(text, segmentIndex, segmentTotal) {
            const index = Number(segmentIndex);
            const total = Number(segmentTotal);
            if (!Number.isInteger(index) || !Number.isInteger(total) || index <= 1 || index >= total) {
                return { ended: false, reason: '' };
            }
            const tail = String(text || '').trim().slice(-2400);
            if (!tail) return { ended: false, reason: '' };
            if (/(?:全文完|全书完|全剧终|故事至此(?:结束|落幕)|全书(?:正式)?完结|小说(?:正式)?完结|大结局(?:完成|落幕))/i.test(tail)) {
                return { ended: true, reason: 'explicit_end_phrase' };
            }
            if (/(?:^|\n)\s*(?:#{1,6}\s*)?(?:终章|尾声|大结局|最终章)(?:\s*[:：][^\n]*)?\s*(?:\n|$)/i.test(tail)) {
                return { ended: true, reason: 'terminal_heading' };
            }
            if (/(?:主角|主人公|男主|女主)[^。\n]{0,36}(?:死亡|陨落|牺牲|退隐|永眠)[^。\n]{0,36}(?:全书|故事|传奇|一生)[^。\n]{0,24}(?:结束|落幕|终结)/i.test(tail)) {
                return { ended: true, reason: 'protagonist_terminal_state' };
            }
            return { ended: false, reason: '' };
        }

        function getOutlineSegmentLabel(plan, segmentIndex) {
            if (Number(segmentIndex) === 1) return '基础设定与角色信息';
            const range = getOutlineChapterStageRange(plan, segmentIndex);
            if (!range) return '大纲第 ' + segmentIndex + '/' + (plan?.total || '?') + ' 段';
            return '章节粗纲第 ' + range.stageIndex + '/' + range.stageTotal
                + ' 阶段（第' + range.startChapter + '-' + range.endChapter + '章）';
        }

        function getOutlineChapterHeadings(text) {
            const headings = [];
            const source = String(text || '');
            const pattern = /^([ \t]*(?:#{1,6}[ \t]*)?第[ \t]*)([零〇两一二三四五六七八九十百千万\d]{1,12})([ \t]*章(?![ \t]*(?:[-—–~～]|至|到)[ \t]*(?:第[ \t]*)?[零〇两一二三四五六七八九十百千万\d]{1,12}[ \t]*章)(?:[^\r\n]*)?)$/gmi;
            let match;
            while ((match = pattern.exec(source))) {
                const parsed = /^\d+$/.test(match[2])
                    ? Number(match[2])
                    : Number(window.chineseToNumber?.(match[2]) || 0);
                headings.push({
                    number: parsed,
                    index: match.index,
                    text: match[0]
                });
            }
            return headings;
        }

        function getOutlineSegmentProgress(generatedContent) {
            const headings = getOutlineChapterHeadings(generatedContent);
            const chapterNumbers = headings.map(item => item.number).filter(Number.isFinite);
            const highestChapterNumber = chapterNumbers.length ? Math.max(...chapterNumbers) : 0;
            return {
                chapterCount: chapterNumbers.length,
                highestChapterNumber,
                nextChapter: Math.max(1, highestChapterNumber + 1),
                enteredChapterOutline: highestChapterNumber > 0
            };
        }

        function getOutlineProgressSegmentRange(plan, segmentIndex, progress) {
            const total = Math.max(1, Number(plan?.total) || 1);
            const index = Math.max(1, Math.min(total, Number(segmentIndex) || 1));
            const start = Math.max(1, Number(progress?.nextChapter) || 1);
            const targetChapters = Math.max(start, Number(plan?.targetChapters) || start);
            const remainingSegments = Math.max(1, total - index + 1);
            const remainingChapters = Math.max(1, targetChapters - start + 1);
            const chapterCount = Math.max(1, Math.ceil(remainingChapters / remainingSegments));
            return {
                start,
                end: Math.min(targetChapters, start + chapterCount - 1),
                targetChapters,
                remainingSegments
            };
        }

        function normalizeOutlineFoundationSegment(text) {
            const source = String(text || '');
            const headings = getOutlineChapterHeadings(source);
            if (headings.length === 0) {
                return { content: source, changed: false, removedChapterCount: 0 };
            }

            return {
                content: source.slice(0, headings[0].index).trimEnd(),
                changed: true,
                removedChapterCount: headings.length
            };
        }

        function normalizeOutlineChapterStageSegment(text) {
            const source = String(text || '');
            const headings = getOutlineChapterHeadings(source);
            if (!headings.length) {
                return {
                    content: '',
                    changed: !!source.trim(),
                    removedPrefix: source.trim()
                };
            }
            return {
                content: source.slice(headings[0].index).trim(),
                changed: headings[0].index > 0 || source !== source.trim(),
                removedPrefix: source.slice(0, headings[0].index).trim()
            };
        }

        // AI 偶尔会忽略续写指令并复用旧章号。普通大纲只允许按正文出现顺序从第 1 章连续编号，
        // 因此在最终展示前只校正章节标题的数字，不改动任何章节内容或章节顺序。
        function normalizeSegmentedOutlineChapterOrder(text) {
            const source = String(text || '');
            const headings = getOutlineChapterHeadings(source);
            if (headings.length === 0) return { content: source, changed: false, chapterCount: 0 };

            let expectedNumber = 1;
            let changed = false;
            const content = source.replace(/^([ \t]*(?:#{1,6}[ \t]*)?第[ \t]*)([零〇两一二三四五六七八九十百千万\d]{1,12})([ \t]*章(?![ \t]*(?:[-—–~～]|至|到)[ \t]*(?:第[ \t]*)?[零〇两一二三四五六七八九十百千万\d]{1,12}[ \t]*章)(?:[^\r\n]*)?)$/gmi, function(_line, prefix, actual, suffix) {
                const nextNumber = expectedNumber++;
                const actualNumber = /^\d+$/.test(actual)
                    ? Number(actual)
                    : Number(window.chineseToNumber?.(actual) || 0);
                if (actualNumber !== nextNumber || !/^\d+$/.test(actual)) changed = true;
                return prefix + nextNumber + suffix;
            });
            return { content, changed, chapterCount: headings.length };
        }

        function buildSegmentedOutlinePrompt(basePrompt, wcKey, wcLabel, plan, segmentIndex, generatedContent) {
            if (!plan || plan.total <= 1) return basePrompt;
            const effectivePlan = {
                ...getOutlineSegmentPlan(wcKey),
                ...plan
            };
            const isFirst = segmentIndex === 1;
            const isLast = segmentIndex === effectivePlan.total;
            let prompt = basePrompt + '\n\n---\n\n';
            prompt += '【大纲分段生成控制】\n';
            prompt += `小说篇幅：${wcLabel}。\n`;
            prompt += `目标总字数约 ${effectivePlan.targetWords} 字，按每章正文约 ${OUTLINE_CHAPTER_WORDS} 字规划，目标总章节约 ${effectivePlan.targetChapters} 章。\n\n`;
            prompt += `当前生成第 ${segmentIndex}/${effectivePlan.total} 段。\n`;
            prompt += '全部可见内容必须使用简体中文。只输出大纲正文，不要输出 <think> 标签、推理过程、解释、创作说明、提示词分析或“第几段”字样。\n';
            if (isFirst) {
                prompt += String(window.ZHIYU_FORMAT_CONSTRAINTS?.OUTLINE_FOUNDATION || '')
                    + '\n这是第一阶段，只生成基础设定与角色初始信息。即使所选模板要求完整大纲，本阶段也不得输出章节粗纲、全书阶段剧情或结局规划。\n';
                return prompt;
            }

            const generated = String(generatedContent || '');
            const firstHeading = getOutlineChapterHeadings(generated)[0];
            const confirmedFoundation = getSegmentTail(getOutlineFoundationContent(generated), 10000);
            const previousChapters = firstHeading ? generated.slice(firstHeading.index) : '';
            const previousTail = getSegmentTail(previousChapters, 7000);
            const progress = getOutlineSegmentProgress(generated);
            const stageRange = getOutlineProgressSegmentRange(effectivePlan, segmentIndex, progress);
            prompt += `当前章节游标是第 ${stageRange.start} 章。\n`;
            prompt += '模板要求的书名、简介、世界观、人物和力量体系等章节前内容已经完成，不得重新生成或改写。\n';
            if (confirmedFoundation) {
                prompt += '\n【已确认的基础设定】\n' + confirmedFoundation + '\n';
            }
            if (previousTail) {
                prompt += '\n【上一章节粗纲阶段末尾】\n' + previousTail + '\n';
            }
            prompt += '\n请按这个篇幅规划故事长度和节奏，而不是只按章节数量凑内容。短篇要集中完整；中篇要有阶段转折；长篇/超长篇要有长期连载节奏，包含日常、小目标、副本、关系铺垫、阶段推进和阶段性小高潮，不能提前自然完结。\n';
            prompt += `本阶段必须从第 ${stageRange.start} 章连续生成到第 ${stageRange.end} 章附近，严禁重复设定、旧章节、跳号或倒序。\n`;
            prompt += '每章只写简短粗剧情，优先控制在20-40字，不写细纲、不写正文、不写长段落；不要因为篇幅较长就提前收束或用省略号跳过中间剧情。\n';
            prompt += '每章独立成段，使用清楚章节标题，推荐「## 第N章」。每章写清核心事件、人物变化、冲突推进和承接伏笔。\n';
            prompt += '主线章节、日常章节、小目标章节、关系铺垫章节、过渡章节、小高潮章节应交替出现，不要让每章都围绕伏笔或填坑写。\n';
            if (isLast) {
                prompt += `这是最后一段：需要写到第 ${effectivePlan.targetChapters} 章附近，完成后期高潮、终局冲突和结尾收束，确保整本书大纲完整。\n`;
            } else {
                prompt += `这不是最后一段：只能写到第 ${stageRange.end} 章附近的阶段性转折或悬念点，不要写最终大战、真相全揭、结局或完结；只有最后一段才允许收束全书。\n`;
            }
            return prompt;
        }


        function getSegmentedWritingPlan(wordTarget, templatePrompt) {
            const target = resolveChapterWordTarget(wordTarget, templatePrompt);
            const total = Math.max(1, Math.round(target / CHAPTER_SEGMENT_TARGET_WORDS));
            return { total, targetWords: target, segmentTarget: Math.ceil(target / total) };
        }

        function getSegmentedWritingBudget(plan, segmentIndex, generatedContent) {
            const targetWords = Math.max(1, Number(plan?.targetWords || DEFAULT_CHAPTER_TARGET_WORDS));
            const total = Math.max(1, Number(plan?.total || 1));
            const current = Math.min(total, Math.max(1, Number(segmentIndex || 1)));
            const generatedWords = typeof window.countWords === 'function'
                ? window.countWords(String(generatedContent || ''))
                : String(generatedContent || '').replace(/\s+/g, '').length;
            const remainingSegments = Math.max(1, total - current + 1);
            const remainingTargetWords = Math.max(0, targetWords - generatedWords);
            return {
                generatedWords,
                targetWords,
                remainingTargetWords,
                reachedTarget: generatedWords >= targetWords,
                segmentTargetWords: Math.round(remainingTargetWords / remainingSegments)
            };
        }

        function hasReachedChapterAcceptedLength(plan, generatedContent) {
            const budget = getSegmentedWritingBudget(plan, 1, generatedContent);
            return budget.reachedTarget;
        }

        function shouldStartChapterSegment(plan, segmentIndex, generatedContent) {
            if (Number(segmentIndex || 1) <= 1) return true;
            const budget = getSegmentedWritingBudget(plan, segmentIndex, generatedContent);
            return !budget.reachedTarget;
        }

        function getChapterSegmentDisplayPlan(plan, segmentIndex) {
            const source = plan || getSegmentedWritingPlan(DEFAULT_CHAPTER_TARGET_WORDS, '');
            const currentTotal = Math.max(1, Number(source.total || 1));
            const displayTotal = Math.max(currentTotal, Math.max(1, Number(segmentIndex || 1)));
            return displayTotal === currentTotal ? source : { ...source, total: displayTotal };
        }

        function getChapterSupplementalWritingPlan(plan, generatedContent) {
            const budget = getSegmentedWritingBudget(plan, Number(plan?.total || 1), generatedContent);
            if (budget.reachedTarget) return null;
            return getSegmentedWritingPlan(Math.max(1, budget.remainingTargetWords), '');
        }

        function getSegmentTail(text, maxLen) {
            const clean = String(text || '').trim();
            if (clean.length <= maxLen) return clean;
            return clean.slice(-maxLen);
        }

        function getSegmentedWritingInputBudget(basePrompt, plan, inputLimit) {
            const limit = Math.max(1, Number(inputLimit || CHAPTER_GENERATION_INPUT_LIMIT));
            const prompt = String(basePrompt || '');
            const total = Math.max(1, Number(plan?.total || 1));
            let requiredCharacters = prompt.length;
            let largestSegmentIndex = 1;
            const candidateIndexes = Array.from(new Set([1, Math.min(2, total), total]));
            for (const segmentIndex of candidateIndexes) {
                const priorContent = segmentIndex > 1 ? '续'.repeat(CHAPTER_SEGMENT_TAIL_CHARS) : '';
                const segmentLength = buildSegmentedWritingPrompt(prompt, plan, segmentIndex, priorContent).length;
                if (segmentLength > requiredCharacters) {
                    requiredCharacters = segmentLength;
                    largestSegmentIndex = segmentIndex;
                }
            }
            return {
                ok: requiredCharacters <= limit,
                inputLimit: limit,
                baseCharacters: prompt.length,
                requiredCharacters,
                reservedCharacters: Math.max(0, requiredCharacters - prompt.length),
                overCharacters: Math.max(0, requiredCharacters - limit),
                largestSegmentIndex
            };
        }

        function buildSegmentedWritingPrompt(basePrompt, plan, segmentIndex, generatedContent) {
            if (!plan) return basePrompt;
            const budget = getSegmentedWritingBudget(plan, segmentIndex, generatedContent);
            const completeParagraphRule = '本段必须在自然、完整的段落末尾结束；不得留下半句、未闭合的引号、未完成的动作或对话。只输出小说正文，不得输出解释、字数说明、创作说明或“未完待续”。\n';
            if (plan.total <= 1) {
                return basePrompt + '\n\n---\n\n'
                    + '【正文生成控制】\n'
                    + `本章总目标 ${plan.targetWords || DEFAULT_CHAPTER_TARGET_WORDS} 字；不足目标时必须继续写，达到目标后在最近的自然完整段落结尾。\n`
                    + `当前距离本章目标还需 ${budget.remainingTargetWords} 字。\n`
                    + `本段建议补写约 ${budget.segmentTargetWords} 字；为了把情节和段落自然写完，可以超过目标字数，不得因卡字数而截断。\n`
                    + '这是本章唯一一段，请完整生成本章正文；不要输出标题、提纲、总结或“本章完”。\n'
                    + completeParagraphRule;
            }
            const isFirst = segmentIndex === 1;
            const isLast = segmentIndex === plan.total;
            const previousTail = getSegmentTail(generatedContent, CHAPTER_SEGMENT_TAIL_CHARS);
            const generatedWords = typeof window.countWords === 'function'
                ? window.countWords(String(generatedContent || ''))
                : String(generatedContent || '').replace(/\s+/g, '').length;
            let prompt = basePrompt + '\n\n---\n\n';
            prompt += `【分段写作控制】\n`;
            prompt += `本章总目标 ${plan.targetWords || DEFAULT_CHAPTER_TARGET_WORDS} 字；不足目标时必须继续写，达到目标后在最近的自然完整段落结尾。当前写第 ${segmentIndex}/${plan.total} 段。\n`;
            prompt += `前文完成后，当前距离本章目标还需 ${budget.remainingTargetWords} 字。\n`;
            prompt += `本段建议补写约 ${budget.segmentTargetWords} 字；为了把情节和段落自然写完，可以超过目标字数，不得因卡字数而截断。\n`;
            prompt += '只输出小说正文，不要输出“第几段”、标题、提纲或总结。\n';
            prompt += completeParagraphRule;
            if (isFirst) {
                prompt += '这是本章开头：要自然承接参考章节和剧情描述，先立场景与冲突，不要提前写完整章结局。\n';
            } else {
                prompt += `前面实际已生成约 ${generatedWords} 字。以下是已经写出的上一段末尾，请无缝续写，不要重复已经写过的句子和情节：\n${previousTail}\n\n`;
                prompt += '这是续写段：从上一段最后一句继续推进，保持人物状态、地点、动作和语气连续。\n';
            }
            if (isLast) {
                prompt += '这是本章最后一段：需要完成本章应完成的剧情推进，结尾留下自然承接点，但不要开启下一章剧情。\n';
            } else {
                prompt += '这不是最后一段：写到一个自然停顿点即可，不要给本章收尾，不要写“本章完”。\n';
            }
            return prompt;
        }

        function isAbortLikeError(err) {
            const msg = String(err?.message || err || '');
            return err?.name === 'AbortError' || msg.includes('abort') || msg.includes('Abort') || msg.includes('BodyStream') || msg.includes('取消');
        }

        const CHAPTER_RESPONSE_TIMEOUT_MS = 90000;
        const SLOW_PYTN_CHAPTER_RESPONSE_TIMEOUT_MS = 5 * 60 * 1000;
        const SLOW_PYTN_CHAPTER_PROVIDERS = new Set([
            'xstx-gemini',
            'xstx-gemini35-flash',
            'xstx-grok45'
        ]);

        function getChapterResponseTimeoutMs(provider) {
            return SLOW_PYTN_CHAPTER_PROVIDERS.has(String(provider || '').trim().toLowerCase())
                ? SLOW_PYTN_CHAPTER_RESPONSE_TIMEOUT_MS
                : CHAPTER_RESPONSE_TIMEOUT_MS;
        }

        function isDisplayableChapterText(value) {
            return String(value || '').trim().length > 0;
        }

        function endsWithCompleteChapterParagraph(value) {
            const text = String(value || '').trimEnd();
            if (!text || /(?:未完待续|本章完)[。！？!?…\.]*[”’"'」』）》】）\]\}]*$/u.test(text)) return false;
            return /(?:[。！？!?…]|\.{1,3})[”’"'」』）》】）\]\}]*$/u.test(text);
        }

        function trimIncompleteChapterTail(value) {
            const source = String(value || '').trimEnd();
            if (!source) return { content: '', removedTail: '', complete: false };
            if (endsWithCompleteChapterParagraph(source)) {
                return { content: source, removedTail: '', complete: true };
            }
            const boundaries = [];
            const lineBreaks = /\r?\n+/g;
            let match;
            while ((match = lineBreaks.exec(source))) boundaries.push(match.index);
            for (let index = boundaries.length - 1; index >= 0; index -= 1) {
                const content = source.slice(0, boundaries[index]).trimEnd();
                if (endsWithCompleteChapterParagraph(content)) {
                    return {
                        content,
                        removedTail: source.slice(boundaries[index]).trim(),
                        complete: true
                    };
                }
            }
            return { content: '', removedTail: source, complete: false };
        }

        function createChapterStoryCompletionFilter(enabled) {
            const active = enabled === true;
            let pending = '';
            let markerFound = false;
            let finished = false;
            let finalResult = null;

            function getMarkerPrefixTailLength(value) {
                const maximum = Math.min(value.length, CHAPTER_STORY_COMPLETION_MARKER.length - 1);
                for (let length = maximum; length > 0; length -= 1) {
                    if (value.endsWith(CHAPTER_STORY_COMPLETION_MARKER.slice(0, length))) return length;
                }
                return 0;
            }

            function push(value) {
                const chunk = String(value || '');
                if (!active || finished || !chunk) return chunk;
                if (markerFound) {
                    pending += chunk;
                    return '';
                }
                pending += chunk;
                const markerIndex = pending.indexOf(CHAPTER_STORY_COMPLETION_MARKER);
                if (markerIndex >= 0) {
                    const visible = pending.slice(0, markerIndex);
                    pending = pending.slice(markerIndex + CHAPTER_STORY_COMPLETION_MARKER.length);
                    markerFound = true;
                    return visible;
                }
                const retainedLength = getMarkerPrefixTailLength(pending);
                const visible = pending.slice(0, pending.length - retainedLength);
                pending = pending.slice(pending.length - retainedLength);
                return visible;
            }

            function finish() {
                if (finished) return finalResult;
                finished = true;
                if (!active) {
                    finalResult = { complete: true, markerFound: false, tail: '' };
                    return finalResult;
                }
                const trailing = pending.split(CHAPTER_STORY_COMPLETION_MARKER).join('');
                pending = '';
                const hasTrailingContent = trailing.trim().length > 0;
                finalResult = {
                    complete: markerFound && !hasTrailingContent,
                    markerFound,
                    tail: markerFound && hasTrailingContent ? trailing : ''
                };
                return finalResult;
            }

            return { push, finish };
        }

        function createChapterExecutionError(message, code) {
            const error = new Error(message || '正文生成失败');
            if (code) error.code = code;
            return error;
        }

        function normalizeChapterExecutionError(value) {
            if (value instanceof Error) return value;
            const source = value && typeof value === 'object' ? value : null;
            const error = createChapterExecutionError(String(source?.message || value || '正文生成失败'));
            ['status', 'upstreamStatus', 'code', 'rawBody', 'name'].forEach(function(key) {
                if (source?.[key] !== undefined && source[key] !== null && source[key] !== '') {
                    error[key] = source[key];
                }
            });
            return error;
        }

        function createChapterAbortError() {
            const error = createChapterExecutionError('已停止生成', 'AI_REQUEST_CANCELLED');
            error.name = 'AbortError';
            return error;
        }

        async function executeChapterGenerationPlan(options) {
            const opts = options || {};
            const plan = opts.plan || getChapterGenerationPlan(DEFAULT_CHAPTER_TARGET_WORDS, '', 'story');
            const stream = opts.streamGenerate;
            if (typeof stream !== 'function') {
                throw createChapterExecutionError('正文生成传输模块未加载', 'AI_TRANSPORT_UNAVAILABLE');
            }
            const modelConfig = Object.freeze({ ...(opts.modelConfig || {}) });
            if (!modelConfig.base || !modelConfig.model) {
                throw createChapterExecutionError('请先添加并选择自己的模型', 'COMMUNITY_MODEL_REQUIRED');
            }
            let generatedContent = String(opts.initialContent || '');
            let completedExecutionCount = 0;
            try {
                for (let stepIndex = 1; stepIndex <= plan.executionTotal; stepIndex += 1) {
                    if (!shouldStartChapterGenerationStep(plan, stepIndex, generatedContent)) break;
                    const prompt = buildChapterGenerationPrompt(
                        String(opts.basePrompt || ''),
                        plan,
                        stepIndex,
                        generatedContent
                    );
                    const completionFilter = createChapterStoryCompletionFilter(plan.focus === 'story');
                    let requestError = null;
                    opts.onExecutionStart?.({ stepIndex, plan, prompt, generatedContent, modelConfig });
                    await stream(
                        modelConfig,
                        String(opts.systemPrompt || ''),
                        prompt,
                        function(chunk) {
                            const visibleChunk = completionFilter.push(chunk);
                            if (!visibleChunk) return;
                            generatedContent += visibleChunk;
                            opts.onChunk?.(visibleChunk, generatedContent, { stepIndex, plan, modelConfig });
                        },
                        function(result) {
                            opts.onRequestDone?.(result, { stepIndex, plan, modelConfig });
                        },
                        function(error) {
                            requestError = normalizeChapterExecutionError(error);
                        },
                        opts.signal
                    );
                    const completion = completionFilter.finish();
                    if (completion.tail) {
                        generatedContent += completion.tail;
                        opts.onChunk?.(completion.tail, generatedContent, { stepIndex, plan, modelConfig });
                    }
                    if (requestError) throw requestError;
                    if (opts.signal?.aborted) throw createChapterAbortError();
                    if (!generatedContent.trim()) {
                        throw createChapterExecutionError('AI没有返回可保留的正文内容', 'AI_STREAM_EMPTY');
                    }
                    if (plan.focus === 'story' && !completion.complete) {
                        const incompleteError = createChapterExecutionError(
                            '本章剧情没有完整结束，已保留当前正文；剧情模式不会自动补写。',
                            'AI_STORY_INCOMPLETE'
                        );
                        incompleteError.contentDelivered = true;
                        throw incompleteError;
                    }
                    completedExecutionCount += 1;
                    const generatedWords = countChapterGenerationWords(generatedContent);
                    opts.onExecutionComplete?.({
                        stepIndex,
                        plan,
                        generatedContent,
                        generatedWords,
                        completedExecutionCount,
                        reachedTarget: generatedWords >= plan.targetWords,
                        modelConfig
                    });
                    if (generatedWords >= plan.targetWords) break;
                }
                return {
                    content: generatedContent,
                    generatedWords: countChapterGenerationWords(generatedContent),
                    completedExecutionCount,
                    modelConfig,
                    plan
                };
            } catch (value) {
                const error = normalizeChapterExecutionError(value);
                error.generatedContent = generatedContent;
                error.completedExecutionCount = completedExecutionCount;
                throw error;
            }
        }

        function createChapterResponseGuard(options) {
            const opts = options || {};
            const timeoutMs = Math.max(1, Number(opts.timeoutMs || CHAPTER_RESPONSE_TIMEOUT_MS));
            const setTimer = opts.setTimeout || window.setTimeout.bind(window);
            const clearTimer = opts.clearTimeout || window.clearTimeout.bind(window);
            let timerId = null;
            let rejectGuard = null;
            let active = true;
            let phase = 'first_text';
            const promise = new Promise(function(_resolve, reject) {
                rejectGuard = reject;
            });
            function clearTimerOnly() {
                if (timerId !== null) {
                    clearTimer(timerId);
                    timerId = null;
                }
            }
            function schedule() {
                clearTimerOnly();
                timerId = setTimer(function() {
                    if (!active) return;
                    active = false;
                    const timeoutError = new DOMException(
                        phase === 'first_text' ? '正文生成等待首段文字超时' : '正文生成输出停顿超时',
                        'TimeoutError'
                    );
                    if (typeof opts.onTimeout === 'function') opts.onTimeout(timeoutError, phase);
                    rejectGuard(timeoutError);
                }, timeoutMs);
            }
            function noteDisplayableText(value) {
                if (!active || !isDisplayableChapterText(value)) return false;
                phase = 'idle_text';
                schedule();
                return true;
            }
            function clear() {
                active = false;
                clearTimerOnly();
            }
            schedule();
            return {
                promise,
                noteDisplayableText,
                clear,
                getPhase: function() { return phase; }
            };
        }

        function resolveChapterGenerationFailureContent(error, generatedContent, generationTask) {
            const delivered = error?.contentDelivered === true
                ? trimIncompleteChapterTail(generatedContent).content
                : '';
            const serverDeliveredContent = String(delivered || '');
            const completedContent = serverDeliveredContent.trim()
                ? serverDeliveredContent
                : (error?.code !== 'GENERATION_OUTPUT_INVALID'
                    && Number(generationTask?.completedSegmentCount || 0) > 0
                    ? trimIncompleteChapterTail(generationTask?.completedContent || '').content
                    : '');
            return { serverDeliveredContent, completedContent };
        }


    window.DEFAULT_CHAPTER_TARGET_WORDS = DEFAULT_CHAPTER_TARGET_WORDS;
    window.MAX_CHAPTER_TARGET_WORDS = MAX_CHAPTER_TARGET_WORDS;
    window.CHAPTER_HIGH_REQUEST_CONFIRM_THRESHOLD = CHAPTER_HIGH_REQUEST_CONFIRM_THRESHOLD;
    window.CHAPTER_SEGMENT_TARGET_WORDS = CHAPTER_SEGMENT_TARGET_WORDS;
    window.CHAPTER_SUPPLEMENTAL_SEGMENT_LIMIT = CHAPTER_SUPPLEMENTAL_SEGMENT_LIMIT;
    window.CHAPTER_SEGMENT_MAX_TOKENS = CHAPTER_SEGMENT_MAX_TOKENS;
    window.MAX_CHAPTER_OUTPUT_TOKENS = MAX_CHAPTER_OUTPUT_TOKENS;
    window.CHAPTER_FULL_SAFE_TARGET_WORDS = CHAPTER_FULL_SAFE_TARGET_WORDS;
    window.CHAPTER_GENERATION_INPUT_LIMIT = CHAPTER_GENERATION_INPUT_LIMIT;
    window.CHAPTER_STORY_COMPLETION_MARKER = CHAPTER_STORY_COMPLETION_MARKER;
    window.OUTLINE_SEGMENT_MAX_TOKENS = OUTLINE_SEGMENT_MAX_TOKENS;
    window.CHAPTER_RESPONSE_TIMEOUT_MS = CHAPTER_RESPONSE_TIMEOUT_MS;
    window.getChapterResponseTimeoutMs = getChapterResponseTimeoutMs;
    window.isDisplayableChapterText = isDisplayableChapterText;
    window.endsWithCompleteChapterParagraph = endsWithCompleteChapterParagraph;
    window.trimIncompleteChapterTail = trimIncompleteChapterTail;
    window.createChapterStoryCompletionFilter = createChapterStoryCompletionFilter;
    window.executeChapterGenerationPlan = executeChapterGenerationPlan;
    window.createChapterResponseGuard = createChapterResponseGuard;
    window.resolveChapterGenerationFailureContent = resolveChapterGenerationFailureContent;
    window.extractExplicitChapterWordTarget = extractExplicitChapterWordTarget;
    window.parseChapterWordTargetInput = parseChapterWordTargetInput;
    window.resolveChapterWordTarget = resolveChapterWordTarget;
    window.resolveChapterGenerationTarget = resolveChapterGenerationTarget;
    window.calcMaxTokensFromTemplate = calcMaxTokensFromTemplate;
    window.calcChapterSegmentMaxTokens = calcChapterSegmentMaxTokens;
    window.normalizeChapterGenerationFocus = normalizeChapterGenerationFocus;
    window.countChapterGenerationWords = countChapterGenerationWords;
    window.getChapterGenerationPlan = getChapterGenerationPlan;
    window.getChapterGenerationBudget = getChapterGenerationBudget;
    window.shouldStartChapterGenerationStep = shouldStartChapterGenerationStep;
    window.buildChapterGenerationPrompt = buildChapterGenerationPrompt;
    window.calcOutlineMaxTokens = calcOutlineMaxTokens;
    window.getOutlineSegmentPlan = getOutlineSegmentPlan;
    window.getOutlineChapterStageRange = getOutlineChapterStageRange;
    window.getOutlineFoundationContent = getOutlineFoundationContent;
    window.getNormalOutlineMemorySource = getNormalOutlineMemorySource;
    window.getOutlineContinuityBridge = getOutlineContinuityBridge;
    window.detectExplicitOutlineEnding = detectExplicitOutlineEnding;
    window.getOutlineSegmentLabel = getOutlineSegmentLabel;
    window.getOutlineChapterHeadings = getOutlineChapterHeadings;
    window.getOutlineSegmentProgress = getOutlineSegmentProgress;
    window.getOutlineProgressSegmentRange = getOutlineProgressSegmentRange;
    window.normalizeOutlineFoundationSegment = normalizeOutlineFoundationSegment;
    window.normalizeOutlineChapterStageSegment = normalizeOutlineChapterStageSegment;
    window.normalizeSegmentedOutlineChapterOrder = normalizeSegmentedOutlineChapterOrder;
    window.buildSegmentedOutlinePrompt = buildSegmentedOutlinePrompt;
    window.getSegmentedWritingPlan = getSegmentedWritingPlan;
    window.getSegmentedWritingBudget = getSegmentedWritingBudget;
    window.hasReachedChapterAcceptedLength = hasReachedChapterAcceptedLength;
    window.shouldStartChapterSegment = shouldStartChapterSegment;
    window.getChapterSegmentDisplayPlan = getChapterSegmentDisplayPlan;
    window.getChapterSupplementalWritingPlan = getChapterSupplementalWritingPlan;
    window.getSegmentedWritingInputBudget = getSegmentedWritingInputBudget;
    window.getSegmentTail = getSegmentTail;
    window.buildSegmentedWritingPrompt = buildSegmentedWritingPrompt;
    window.isAbortLikeError = isAbortLikeError;
    window.ZHIYU_GENERATION_PLAN_READY = true;
})(window);
