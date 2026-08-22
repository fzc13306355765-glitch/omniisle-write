(function(window) {
    'use strict';

    async function requestOrdinaryAuxiliaryText(apiConfig, systemPrompt, userMessage, requestIdPrefix) {
        if (typeof window.requestMemoryAnalysisWithFallback === 'function') {
            return window.requestMemoryAnalysisWithFallback(null, systemPrompt, userMessage, {
                label: '后台资料整理',
                fallback: '后台资料整理失败',
                requestFeature: 'analysis',
                requestIdPrefix: requestIdPrefix
            });
        }
        const candidates = typeof window.getOrdinaryModelCandidates === 'function'
            ? window.getOrdinaryModelCandidates()
            : [];
        const makeFallbackRequestId = function() {
            return window.makeRequestId?.(requestIdPrefix)
                || `${requestIdPrefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
        };
        let requestId = makeFallbackRequestId();
        let lastError = null;
        for (let index = 0; index < candidates.length; index += 1) {
            const modelCfg = candidates[index];
            try {
                const response = await window.callLLMAPI(
                    apiConfig,
                    systemPrompt,
                    userMessage,
                    modelCfg,
                    {
                        requestFeature: 'analysis',
                        requestTier: 'normal',
                        requestUnits: 1,
                        requestId
                    }
                );
                const text = response?.content?.[0]?.text || response?.choices?.[0]?.message?.content || '';
                if (String(text).trim()) return String(text);
                const emptyError = new Error('后台资料整理未返回内容');
                emptyError.code = 'EMPTY_RESPONSE';
                throw emptyError;
            } catch (error) {
                if (typeof window.isAbortLikeError === 'function' && window.isAbortLikeError(error)) throw error;
                if (typeof window.isAuthExpiredError === 'function' && window.isAuthExpiredError(error)) throw error;
                lastError = error;
                if (index >= candidates.length - 1
                    || (typeof window.shouldRetryMemoryAnalysis === 'function'
                        && !window.shouldRetryMemoryAnalysis(error))) {
                    throw error;
                }
                if (error?.code === 'EMPTY_RESPONSE') requestId = makeFallbackRequestId();
            }
        }
        throw lastError || new Error('没有可用的普通模型');
    }

    async function generateTrackingAndBoundary(bookName, vi, ci, chapterContent, plotInput, template, linkedFiles, refChapters) {
        const apiConfig = window.gA();

        const book = window.gB()[bookName];
        const chapter = book.volumes[vi].chapters[ci];
        const chapterNum = window.calculateChapterNumber(book, vi, ci);

        window.Utils.appendLog(null, '📝 正在生成追踪卡和边界卡...');

        try {
            const trackPrompt = window.buildTrackingContent(bookName, chapter.name, chapterContent, plotInput);
            const trackingText = await requestOrdinaryAuxiliaryText(
                apiConfig,
                '你是一位专业的小说写作助手，擅长创作网文小说。',
                trackPrompt,
                'analysis_tracking_card'
            );

            if (trackingText) {
                window.updateTrackingCard(bookName, chapterNum, chapter.name, trackingText);
                window.Utils.appendLog(null, '✅ 追踪表已更新', 'success');
            }

            const boundPrompt = window.buildBoundaryContent(bookName, vi, chapter.name, chapterContent, plotInput);
            const boundaryText = await requestOrdinaryAuxiliaryText(
                apiConfig,
                '你是一位专业的小说写作助手，擅长创作网文小说。',
                boundPrompt,
                'analysis_boundary_card'
            );

            if (boundaryText) {
                window.updateBoundaryCard(bookName, chapterNum, chapter.name, boundaryText);
                window.Utils.appendLog(null, '✅ 边界卡已更新', 'success');
            }
        } catch (err) {
            const message = typeof window.formatAiErrorForDisplay === 'function'
                ? window.formatAiErrorForDisplay(err, '追踪卡/边界卡生成失败')
                : String(err?.message || err || '追踪卡/边界卡生成失败');
            window.Utils.appendLog(null, message, 'error');
        }
    }

    async function generateOutlineCards(bookName, outlineContent, genres) {
        const apiConfig = window.gA();
        if (!outlineContent) return;

        try {
            window.ensureMemBook(bookName);
            const memBooks = window.getMemBooks();

            const trackPrompt = `请根据以下小说大纲，提取关键信息用于建立追踪表。

【大纲内容】
${outlineContent}

用简洁中文回复，格式如下：
主角：[姓名、性格、金手指，20字以内]
世界观：[势力、修炼体系、关键规则，30字以内]
关键情节点：[开篇钩子、中期转折、最终决战，各15字以内]`;

            const trackingText = await requestOrdinaryAuxiliaryText(
                apiConfig,
                '你是一位专业的小说编辑，擅长整理和结构化小说信息。请严格按照要求的格式回复。',
                trackPrompt,
                'analysis_outline_tracking_card'
            );

            const boundPrompt = `请根据以下小说大纲，提取世界观核心规则和禁区。

【大纲内容】
${outlineContent}

用简洁中文回复，格式如下：
核心规则：[2-3条，每条20字以内]
剧情禁区：[2-3条，每条20字以内]
力量天花板：[20字以内]`;

            const boundaryText = await requestOrdinaryAuxiliaryText(
                apiConfig,
                '你是一位专业的小说设定分析师，擅长识别故事中的规则和禁区。请严格按照要求的格式回复。',
                boundPrompt,
                'analysis_outline_boundary_card'
            );

            const trackFileName = `${bookName}_追踪表`;
            let trackFile = null;
            for (const folder in memBooks[bookName]) {
                const found = memBooks[bookName][folder].find((f) => f.name === trackFileName);
                if (found) { trackFile = found; break; }
            }

            const todayStr = new Date().toISOString().slice(0, 10);
            const trackContent = `# 追踪表

## 进度总览
已写章节：0 章（大纲阶段）
最近更新：${todayStr}（已生成大纲）
题材：${genres}

## 大纲信息
${trackingText}

---
## 已完成章节
| 章 | 章节名 | 剧情概要 |
|----|--------|----------|
（暂无，大纲已生成，请点击"生成本章"开始写作）
`;

            if (trackFile) {
                if (!trackFile.content.includes('大纲信息')) {
                    trackFile.content = trackFile.content.replace('# 追踪表', `# 追踪表\n\n## 大纲信息\n${trackingText}\n`);
                }
                trackFile.updatedAt = new Date().toISOString();
            } else {
                const defaultFolder = Object.keys(memBooks[bookName])[0] || '默认文件夹';
                memBooks[bookName][defaultFolder].push({
                    name: trackFileName,
                    content: trackContent,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
            }

            const boundaryFileName = `${bookName}_边界卡`;
            let boundaryFile = null;
            for (const folder in memBooks[bookName]) {
                const found = memBooks[bookName][folder].find((f) => f.name === boundaryFileName);
                if (found) { boundaryFile = found; break; }
            }

            const boundaryContent = `# 边界卡

## 大纲设定（生成于 ${todayStr}）
${boundaryText}

---
（以下为各章节边界卡，每章自动追加）
`;

            if (!boundaryFile) {
                const defaultFolder = Object.keys(memBooks[bookName])[0] || '默认文件夹';
                memBooks[bookName][defaultFolder].push({
                    name: boundaryFileName,
                    content: boundaryContent,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
            }

            window.sMB(memBooks);
            window.Utils.appendLog(null, '📋 大纲追踪卡和边界卡已自动创建到记忆库', 'success');
        } catch (err) {
            const message = typeof window.formatAiErrorForDisplay === 'function'
                ? window.formatAiErrorForDisplay(err, '自动创建大纲追踪卡/边界卡失败')
                : String(err?.message || err || '自动创建大纲追踪卡/边界卡失败');
            window.Utils.appendLog(null, message, 'error');
        }
    }

    window.ZHIYU_MEMORY_CARD_ORCHESTRATOR = {
        generateTrackingAndBoundary,
        generateOutlineCards
    };
    window.generateTrackingAndBoundary = generateTrackingAndBoundary;
    window.generateOutlineCards = generateOutlineCards;
})(window);
