(function(window) {
    'use strict';

    async function requestMemoryAnalysisWithFallback(primaryModelCfg, systemPrompt, userMessage, options) {
        const opts = options || {};
        const selected = primaryModelCfg?.base && primaryModelCfg?.model
            ? primaryModelCfg
            : window.getSelectedModelConfig?.();
        if (!selected?.base || !selected?.model) throw new Error('请先添加并选择自己的模型');
        const response = await window.callLLMAPI(
            { ...selected, maxTokens: opts.maxTokens || selected.maxTokens || 16384 },
            systemPrompt,
            userMessage,
            selected,
            { signal: opts.signal, timeoutMs: opts.timeoutMs }
        );
        const result = String(response?.content?.[0]?.text || '');
        if (!result.trim()) {
            const error = new Error(opts.fallback || 'AI 分析未返回内容');
            error.code = 'EMPTY_RESPONSE';
            throw error;
        }
        return result;
    }

    function shouldRethrowAuthError(error) {
        return window.isAuthExpiredError?.(error);
    }

    async function generateSettingUpdate(bookName, chapterContent, existingSetting, meta) {
        if (!chapterContent || !existingSetting) return null;

        const prompt = `检查本章是否出现**新的世界观规则**（仅限：修炼体系规则、世界运行法则、力量上限、独特机制）。

角色/势力/地点/关系/具体物品/角色技能/功法招式 — 这些属于信息卡范畴，不记入设定集。

已有设定已覆盖的内容不重复。每条新设定≤30字。

【已有设定集】
${existingSetting}

【本章内容】
${chapterContent}

无新规则只回复"无"。
有新规则则返回**融合后的完整设定集**（将新规则自然融入已有内容的对应章节，不标"第N章"、不标来源，保持一个完整文档的格式）。`;

        try {
            const result = await requestMemoryAnalysisWithFallback(
                null,
                '你是一位专业的小说设定分析师。',
                prompt,
                {
                    label: '设定集更新',
                    fallback: '设定集更新失败',
                    requestFeature: 'summary',
                    requestIdPrefix: 'summary_setting_update',
                    requestTraceGroup: meta?.requestTraceGroup || ''
                }
            );
            return result || null;
        } catch (e) {
            if (shouldRethrowAuthError(e)) throw e;
            window.Utils?.appendLog?.(null, window.formatMemoryAiError(e, '设定集更新失败'), 'error');
            return null;
        }
    }

    async function generateSettingCard(bookName, sourceContent, sourceType, meta) {
        if (!sourceContent) return null;

        const prompt = `注意：${sourceType === 'outline' ? '大纲中的「世界观概述」即本文件，以下内容均从大纲提炼，无需重新描述。' : '以下内容均从正文提炼。'}极简总结、不要赘述。无内容的部分直接跳过不写。

【${sourceType === 'outline' ? '大纲' : '章节'}内容】
${sourceContent}

## 世界观
[时代背景、地理特色、核心规则，需覆盖完整]
## 修炼体系
[等级划分、突破方式、关键设定，需覆盖完整]
## 金手指概要
[主角金手指的核心能力和限制，需覆盖完整]
## 特殊设定
[独特规则、世界观特色，无则不写]

只回复以上格式，无内容的部分不输出。`;

        try {
            const result = await requestMemoryAnalysisWithFallback(
                null,
                '你是一位专业的小说设定分析师，擅长从文本中提取结构化的世界观信息。请严格按要求格式回复。',
                prompt,
                {
                    label: '设定集',
                    fallback: '设定集生成失败',
                    requestFeature: 'analysis',
                    requestIdPrefix: 'analysis_setting_card',
                    requestTraceGroup: meta?.requestTraceGroup || ''
                }
            );
            if (!result || !result.trim()) return null;
            window.Utils?.appendLog?.(null, '📖 设定集生成完成', 'success');
            return result;
        } catch (e) {
            if (shouldRethrowAuthError(e)) throw e;
            window.Utils?.appendLog?.(null, '设定集生成失败：' + window.formatMemoryAiError(e, 'AI 分析未返回内容'), 'error');
            return null;
        }
    }

    async function generateInfoCard(bookName, chapterContent, existingInfoCard, meta, logEl) {
        const modelCfg = null;
        if (!chapterContent) return null;

        const prompt = `只整理非人物资料，将本次内容融合进已有信息表。保留已有合格内容，不要因为本次未提及就删除。

【已有信息表】
${existingInfoCard || window.createInfoTableSkeleton()}

${meta?.legacyContent ? `【旧版兼容资料】\n${meta.legacyContent}\n\n请只把其中的势力、地点和物品迁入信息表，不要迁入角色。` : ''}

【本次内容】
${chapterContent}

返回融合后的完整信息表，严格使用以下结构：
# 信息表

## 势力
| 名称 | 性质 | 当前状态 |
| --- | --- | --- |

## 地点
| 名称 | 所属 | 当前状态 |
| --- | --- | --- |

## 物品
| 名称 | 持有人 | 用途/状态 |
| --- | --- | --- |

不要输出角色资料、设定集、主线事件、章节摘要或解释。`;

        const systemPrompt = '你是小说非人物资料整理助手。只整理势力、地点和物品，返回完整信息表。';

        try {
            let result = await requestMemoryAnalysisWithFallback(
                modelCfg,
                systemPrompt,
                prompt,
                { label: '信息表', fallback: '信息表生成失败', requestFeature: 'analysis', requestIdPrefix: 'analysis_info_card', requestTraceGroup: meta?.requestTraceGroup || '' }
            );
            if (!result || !result.trim()) return '';
            let check = window.validateInfoTableOutput(existingInfoCard, result, meta);
            if (!check.ok) {
                result = await window.retryMemoryCardOutputOnce(result, check.message, () => requestMemoryAnalysisWithFallback(
                    modelCfg,
                    systemPrompt + '\n上一次输出未通过格式或资料保留校验，请返回完整信息表。',
                    prompt + '\n\n上一次失败原因：' + check.message,
                    { label: '信息表格式重试', fallback: '信息表生成失败', requestFeature: 'analysis', requestIdPrefix: 'analysis_info_card_retry', requestTraceGroup: meta?.requestTraceGroup || '' }
                ));
                check = window.validateInfoTableOutput(existingInfoCard, result, meta);
            }
            if (!check.ok) throw new Error('信息表格式校验失败：' + check.message);
            window.Utils?.appendLog?.(null, '🎴 信息表生成完成', 'success');
            return check.noChange ? '无变化' : check.content;
        } catch (e) {
            if (shouldRethrowAuthError(e)) throw e;
            console.error('生成信息表失败:', e);
            window.Utils?.appendLog?.(null, '信息表提取失败：' + window.formatMemoryAiError(e, '可重新确认使用重试'), 'error');
            return null;
        }
    }

    window.ZHIYU_MEMORY_INFO_GENERATORS = {
        generateSettingUpdate,
        generateSettingCard,
        generateInfoCard
    };

    window.generateSettingUpdate = generateSettingUpdate;
    window.generateSettingCard = generateSettingCard;
    window.generateInfoCard = generateInfoCard;
    window.requestMemoryAnalysisWithFallback = requestMemoryAnalysisWithFallback;
})(window);
