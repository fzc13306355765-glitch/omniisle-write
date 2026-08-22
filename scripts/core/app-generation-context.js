(function(window) {
    'use strict';

    function getAutoRefChapters(book, currentVi, currentCi, maxCount) {
        const previousChapters = [];
        const volumes = Array.isArray(book?.volumes) ? book.volumes : [];
        let chapterNumber = 0;
        for (let vi = 0; vi < volumes.length; vi += 1) {
            const chapters = Array.isArray(volumes[vi]?.chapters) ? volumes[vi].chapters : [];
            for (let ci = 0; ci < chapters.length; ci += 1) {
                chapterNumber += 1;
                if (vi > currentVi || (vi === currentVi && ci >= currentCi)) {
                    return previousChapters.slice(-Math.max(1, Number(maxCount) || 6));
                }
                const chapter = chapters[ci];
                previousChapters.push({
                    chapterIndex: chapterNumber,
                    chapterName: chapter.name,
                    content: chapter.content || ''
                });
            }
        }
        return previousChapters.slice(-Math.max(1, Number(maxCount) || 6));
    }

    function getAutoMemoryContext(bookName) {
        const memBooks = window.getMemBooks();
        if (!memBooks[bookName]) return [];

        const contextFiles = [];
        const targetGroups = [
            [`${bookName}_关键事件表`],
            [`${bookName}_资料索引`],
            [`${bookName}_边界卡`],
            [`${bookName}_承接卡`],
            [`${bookName}_角色列表`, `${bookName}_角色关系网`],
            [`${bookName}_信息表`, `${bookName}_信息卡`],
            [`${bookName}_设定集`],
            [`${bookName}_追踪表`],
            [`${bookName}_大纲`]
        ];
        const folders = Object.keys(memBooks[bookName]);
        for (const candidates of targetGroups) {
            let found = null;
            for (const target of candidates) {
                for (const folder of folders) {
                    if (folder === '__memoryTrash') continue;
                    const files = memBooks[bookName][folder];
                    if (!Array.isArray(files)) continue;
                    found = files.find(file => file.name === target && file.content);
                    if (found) break;
                }
                if (found) break;
            }
            if (found) {
                contextFiles.push({ name: found.name, content: String(found.content || '') });
            }
        }

        return contextFiles;
    }

    function cleanContextContent(content) {
        return String(content || '');
    }

    function safeText(value) {
        return String(value || '').trim();
    }

    function contextTypeForName(name) {
        const text = String(name || '');
        if (text.includes('关键事件表')) return '关键事件表';
        if (text.includes('资料索引')) return '资料索引';
        if (text.includes('边界卡')) return '边界卡';
        if (text.includes('承接卡')) return '承接卡';
        if (text.includes('角色列表')) return '角色列表';
        if (text.includes('信息表') || text.includes('信息卡')) return '信息表';
        if (text.includes('信息卡')) return '信息卡';
        if (text.includes('设定集')) return '设定集';
        if (text.includes('追踪表')) return '追踪表';
        if (text.includes('大纲')) return '大纲';
        if (text.includes('细纲')) return '细纲';
        if (text.includes('拆书')) return '拆书';
        return '关联文件';
    }

    function contextPriority(item) {
        const type = contextTypeForName(item && item.name);
        const order = {
            '关键事件表': 1,
            '资料索引': 2,
            '边界卡': 3,
            '承接卡': 4,
            '角色列表': 5,
            '信息表': 6,
            '设定集': 7,
            '追踪表': 8,
            '大纲': 9,
            '细纲': 10,
            '拆书': 11,
            '关联文件': 12
        };
        return order[type] || 99;
    }

    function buildLinkedContextItems(bookName, linkedMemory) {
        return (linkedMemory || []).map(function(item, index) {
            const ref = typeof window.getRefFileContent === 'function'
                ? window.getRefFileContent(bookName, item.name, item.memFolder || item.folder, item.memIdx ?? item.idx)
                : null;
            const content = ref ? ref.content : (item.content || '');
            return {
                name: item.name || ('关联文件' + (index + 1)),
                type: contextTypeForName(item.name),
                priority: contextPriority(item),
                content: cleanContextContent(content),
                manuallySelected: true
            };
        }).filter(function(item) { return item.content; }).sort(function(a, b) {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return String(a.name).localeCompare(String(b.name), 'zh-Hans');
        });
    }

    function buildReferenceChapterItems(refChapters) {
        return (refChapters || []).map(function(ref) {
            return {
                chapterIndex: ref.chapterIndex,
                chapterName: ref.chapterName || '',
                content: safeText(ref.content)
            };
        }).filter(function(ref) { return ref.content; });
    }

    function buildReferenceSummaryItems(refSummaries) {
        return (refSummaries || []).map(function(ref) {
            return {
                chapterIndex: ref.chapterIndex,
                chapterName: ref.chapterName || '',
                eventId: ref.eventId || '',
                eventName: ref.eventName || '',
                content: safeText(ref.content)
            };
        }).filter(function(ref) { return ref.content; });
    }

    function buildChapterGenerationCallSpec(options) {
        const data = options || {};
        const template = data.template || {};
        const selectedFiles = data.linkedMemory || data.linkedFiles || [];
        const summary = typeof window.buildPrioritizedGenerationContext === 'function'
            ? window.buildPrioritizedGenerationContext(data.bookName, selectedFiles, data.refChapters || [])
            : null;
        const linkedItems = summary
            ? summary.usedLinkedFiles.map(function(item) {
                return Object.assign({}, item, { content: cleanContextContent(item.content) });
            })
            : buildLinkedContextItems(data.bookName, selectedFiles);
        const referenceChapters = buildReferenceChapterItems(data.refChapters || []);
        const referenceSummaries = buildReferenceSummaryItems(data.refSummaries || []);
        const keyEventSummaries = buildReferenceSummaryItems(data.keyEventSummaries || []);
        const fullAnalysisContext = data.fullAnalysisContext?.available === true
            ? {
                knowledgeSnapshotId: data.fullAnalysisContext.knowledgeSnapshotId || '',
                content: safeText(data.fullAnalysisContext.content),
                report: data.fullAnalysisContext.report || {}
            }
            : null;
        const skippedContext = summary ? summary.emptyLinkedFiles.map(function(item) {
            return {
                name: item.name,
                reason: item.missingFromStorage
                    ? '关联资料已失效或不存在，未发送给模型'
                    : '文件为空，未发送给模型'
            };
        }) : [];
        if (data.fullAnalysisContext?.available === false && data.fullAnalysisContext.reason) {
            skippedContext.push({
                name: '结构化全文分析资料',
                reason: String(data.fullAnalysisContext.reason)
            });
        }
        const wordTarget = Number(data.wordTarget || 0) || 0;
        const chapterTitle = data.chapterTitle || '';
        return {
            task: '生成本章小说正文',
            taskGoal: '根据本章剧情要求、当前章节信息和必要上下文创作新的小说正文。',
            rules: [
                '1. 只输出小说正文，不输出解释、标题、提纲、总结、创作说明、分析过程或<think>标签。',
                '剧情描述是创作方向，不是原文，禁止直接复制或复述用户剧情描述。',
                '不得删除主要剧情，不得擅自改人物关系、世界观规则、伏笔和爽点。',
                '参考章节只用于保持文风、承接和事实一致，不得整段搬运。'
            ],
            currentInput: {
                plot: safeText(data.plotInput),
                bookName: data.bookName || '',
                volumeIndex: data.vi,
                chapterIndex: data.ci,
                chapterTitle,
                wordTarget,
                templateTitle: template.title || ''
            },
            context: {
                linkedFiles: linkedItems,
                linkedFilesText: summary?.text || '',
                refChapters: referenceChapters,
                refSummaries: referenceSummaries,
                keyEventSummaries: keyEventSummaries,
                fullAnalysis: fullAnalysisContext,
                skipped: skippedContext
            },
            outputFormat: [
                wordTarget > 0 ? ('正文约 ' + wordTarget + ' 字，以自然段输出。') : '按本章需要输出完整正文。',
                '不要输出“以下是”“分析如下”“我将”等说明话。',
                '不要输出 <think>、推理过程、注释、总结或本章完标记。'
            ],
            failureRules: [
                '输出为空或只有说明文字。',
                '包含 <think> 或明显思考过程。',
                '开头出现“以下是”“分析如下”“我将”等非正文说明。'
            ]
        };
    }

    function renderContextBlock(callSpec) {
        const ctx = callSpec.context || {};
        const parts = [];
        if (ctx.fullAnalysis?.content) {
            parts.push('【结构化全文分析续写资料】\n' + ctx.fullAnalysis.content);
        }
        if (ctx.linkedFiles && ctx.linkedFiles.length) {
            const linkedFilesText = ctx.linkedFilesText || ctx.linkedFiles.map(function(item) {
                return typeof window.renderAiReferenceFile === 'function'
                    ? window.renderAiReferenceFile(item, callSpec.currentInput?.bookName || '')
                    : '### ' + item.type + '：' + item.name + '\n' + item.content;
            }).join('\n\n');
            parts.push('【记忆库与关联文件】\n' + linkedFilesText);
        }
        if (ctx.refChapters && ctx.refChapters.length) {
            parts.push('【参考章节】\n' + ctx.refChapters.map(function(ref) {
                return '### 第' + ref.chapterIndex + '章《' + ref.chapterName + '》\n' + ref.content;
            }).join('\n\n'));
        }
        if (ctx.refSummaries && ctx.refSummaries.length) {
            parts.push('【章节概要参考】\n' + ctx.refSummaries.map(function(ref) {
                return '### 第' + ref.chapterIndex + '章《' + ref.chapterName + '》概要\n' + ref.content;
            }).join('\n\n'));
        }
        if (ctx.keyEventSummaries && ctx.keyEventSummaries.length) {
            const eventMap = new Map();
            ctx.keyEventSummaries.forEach(function(ref) {
                String(ref.eventId || '').split('、').forEach(function(id) {
                    const key = id.trim();
                    if (key && !eventMap.has(key)) eventMap.set(key, ref.eventName || '');
                });
            });
            const eventLine = Array.from(eventMap.entries()).map(function(entry) {
                return entry[0] + (entry[1] ? '：' + entry[1] : '');
            }).join('、');
            parts.push('【关键事件概要参考】\n' + ctx.keyEventSummaries.map(function(ref) {
                const eventLabel = ref.eventId ? ('（关键事件 ' + ref.eventId + (ref.eventName ? '：' + ref.eventName : '') + '）') : '';
                return '### 第' + ref.chapterIndex + '章《' + ref.chapterName + '》概要' + eventLabel + '\n' + ref.content;
            }).join('\n\n') + '\n\n' + (eventLine ? '本章关联关键事件【' + eventLine + '】。\n' : '') + '请参考用户勾选的前文章节概要，延续该事件已经发生的事实、人物认知和伏笔进度。本章应自然完成对应的埋设、推进或回收，保持前后信息一致，不重复首次揭示，不提前泄露后续剧情。');
        }
        return parts.length ? parts.join('\n\n---\n\n') : '本次没有额外关联资料。';
    }

    function renderChapterGenerationCallSpec(callSpec) {
        const input = callSpec.currentInput || {};
        const plot = input.plot || '用户未填写额外剧情要求。';
        const meta = [
            input.bookName ? ('作品：' + input.bookName) : '',
            input.chapterTitle ? ('当前章节：' + input.chapterTitle) : '',
            input.wordTarget ? ('目标字数：约 ' + input.wordTarget + ' 字') : '',
            input.templateTitle ? ('模板：' + input.templateTitle) : ''
        ].filter(Boolean).join('\n');
        return [
            '【任务目标】\n' + callSpec.taskGoal,
            '【最高优先级规则】\n' + callSpec.rules.map(function(rule) { return '- ' + rule; }).join('\n'),
            '【当前输入】\n' + (meta ? meta + '\n\n' : '') + '本章剧情要求：\n' + plot,
            '【必要上下文】\n' + renderContextBlock(callSpec),
            '【输出格式】\n' + callSpec.outputFormat.map(function(rule) { return '- ' + rule; }).join('\n'),
            '【失败条件】\n' + callSpec.failureRules.map(function(rule) { return '- ' + rule; }).join('\n')
        ].join('\n\n---\n\n');
    }

    function validateChapterGenerationOutput(content, options) {
        const strict = typeof window.validateGeneratedChapterOutput === 'function'
            ? window.validateGeneratedChapterOutput(content, options)
            : null;
        const text = strict && typeof strict.content === 'string'
            ? strict.content
            : safeText(content);
        const wordTarget = Number(options && options.wordTarget || 0) || 0;
        const reasons = strict?.ok === false
            ? (Array.isArray(strict.reasons) && strict.reasons.length
                ? strict.reasons.slice()
                : [strict.message || '生成内容未通过正文校验'])
            : [];
        if (!text) reasons.push('AI 没有返回正文内容');
        if (/<think[\s>]|<\/think>/i.test(text)) reasons.push('输出包含 <think> 思考标签');
        if (/^\s*(以下是|分析如下|我将|我会|下面是|根据你提供|这里是|当然可以|好的[，,])/i.test(text)) {
            reasons.push('输出开头像说明文字，不是小说正文');
        }
        if (/(思考过程|推理过程|分析说明|输出说明|创作说明)/.test(text.slice(0, 300))) {
            reasons.push('输出包含分析或说明内容');
        }
        return {
            ok: reasons.length === 0,
            reasons,
            message: reasons[0] || '',
            content: text,
            length: text.length,
            wordTarget
        };
    }

    function buildGenerationPrompt(bookName, vi, ci, plotInput, template, linkedMemory, refChapters, wordTarget, extraContext) {
        const books = typeof window.gB === 'function' ? window.gB() : {};
        const chapterTitle = books?.[bookName]?.volumes?.[vi]?.chapters?.[ci]?.name || '';
        const extra = extraContext || {};
        const callSpec = buildChapterGenerationCallSpec({
            bookName,
            vi,
            ci,
            chapterTitle,
            plotInput,
            template,
            linkedMemory,
            refChapters,
            refSummaries: extra.refSummaries || [],
            keyEventSummaries: extra.keyEventSummaries || [],
            fullAnalysisContext: extra.fullAnalysisContext || null,
            wordTarget
        });
        window.__lastChapterGenerationCallSpec = callSpec;
        let prompt = '';
        if (template?.systemPrompt) prompt += template.systemPrompt + '\n\n---\n\n';
        prompt += renderChapterGenerationCallSpec(callSpec);
        const wcLines = (template?.systemPrompt || '').split('\n').filter(l => l.includes('字') && /\d/.test(l));
        if (wcLines.length > 0) {
            prompt += '\n' + wcLines.join('\n');
        }
        return prompt;
    }

    function getLastChapterGenerationCallSpec() {
        return window.__lastChapterGenerationCallSpec || null;
    }

    window.ZHIYU_GENERATION_CONTEXT = {
        getAutoRefChapters,
        getAutoMemoryContext,
        buildChapterGenerationCallSpec,
        renderChapterGenerationCallSpec,
        validateChapterGenerationOutput,
        getLastChapterGenerationCallSpec,
        buildGenerationPrompt
    };
    window.getAutoRefChapters = getAutoRefChapters;
    window.getAutoMemoryContext = getAutoMemoryContext;
    window.buildChapterGenerationCallSpec = buildChapterGenerationCallSpec;
    window.renderChapterGenerationCallSpec = renderChapterGenerationCallSpec;
    window.validateChapterGenerationOutput = validateChapterGenerationOutput;
    window.getLastChapterGenerationCallSpec = getLastChapterGenerationCallSpec;
    window.buildGenerationPrompt = buildGenerationPrompt;
    window.ZHIYU_GENERATION_CONTEXT_READY = true;
})(window);
