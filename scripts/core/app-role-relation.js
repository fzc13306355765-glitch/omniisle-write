(function(window) {
    'use strict';

    function extractLegacyMemorySection(content, heading) {
        const escaped = String(heading).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = String(content || '').match(new RegExp('^##\\s*' + escaped + '\\s*\\n([\\s\\S]*?)(?=^##\\s|$)', 'm'));
        return match ? match[1].trim() : '';
    }

    function migrateLegacyInfoAndRoles(content) {
        const source = String(content || '');
        const info = ['势力', '地点', '地点树', '物品', '物品栏'].map(name => extractLegacyMemorySection(source, name)).filter(Boolean).join('\n\n');
        const roles = ['角色资料', '角色关系', '角色关系网'].map(name => extractLegacyMemorySection(source, name)).filter(Boolean).join('\n\n');
        return {
            infoTable: info ? window.createInfoTableSkeleton() + '\n' + info : window.createInfoTableSkeleton(),
            roleList: roles ? window.createRoleListSkeleton() + '\n' + roles : window.createRoleListSkeleton(),
        };
    }

    async function generateRoleRelationCard(bookName, sourceContent, existingRoleRelation, meta) {
        if (!sourceContent) return null;
        const modelCfg = null;
        const systemPrompt = '你是小说角色资料整理助手。只维护重点角色资料和角色关系，返回完整角色列表。';
        const compactRoleList = meta?.compactRoleList === true;
        const compactRule = compactRoleList
            ? '本次是普通大纲重建：最多保留30名重点角色、最多80条关键关系；角色名不超过20字，其他单格不超过48字；不要用龙套凑数量。'
            : '';
        const fieldRule = compactRoleList
            ? '角色名≤20字，其他单格≤48字，关系名称≤14字。'
            : '角色名≤24字，其他单格≤80字，关系名称≤14字。';
        const prompt = `只整理真实出现的重要角色、角色写作资料和角色之间的关系，将本次内容融合进已有角色列表。

角色必须是具备独立身份、能够行动或说话，并实际参与剧情的具体人物。势力、地点、物品、时代、群体称谓和泛指身份都不是角色。路人、群众、一次性服务型龙套、只有泛称且没有独立剧情作用的人物都不要纳入；即使只出现一次，只要造成关键转折、留下后续影响或推动关键事件，仍可纳入。保留已有合格角色，不要因为本次未提及就删除。

不要输出“性格”字段。${fieldRule}${compactRule}
角色资料表每一行必须严格保持10列。任何单元格内都禁止使用半角竖线“|”；需要并列时使用顿号“、”或中文逗号“，”；没有内容时填写“—”。

【已有角色列表】
${existingRoleRelation || window.createRoleListSkeleton()}

${meta?.legacyContent ? `【旧版兼容资料】\n${meta.legacyContent}\n\n请只把其中的真实角色和角色关系迁入角色列表。` : ''}

【本次内容】
${sourceContent}

严格返回完整文件：
# 角色列表

## 角色资料
 | 角色 | 性别 | 身份/定位 | 所属势力 | 核心目标 | 对话风格 | 人物弧线 | 人物简介 | 当前状态 | 写作提醒 |
 | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

## 角色关系
张三：—同伴→李四
李四：—师徒→张三

没有新资料时保留已有合格角色内容。不要输出信息表、设定集、章节摘要或解释。`;
        try {
            let result = await window.requestMemoryAnalysisWithFallback(modelCfg, systemPrompt, prompt, {
                label: '角色列表', fallback: '角色列表生成失败', requestFeature: 'analysis', requestIdPrefix: 'analysis_role_relation', requestTraceGroup: meta?.requestTraceGroup || ''
            });
            if (!result || !result.trim()) return '';
            let check = window.validateRoleListOutput(existingRoleRelation, result, { ...(meta || {}), requireCurrentFormat: true });
            if (!check.ok) {
                result = await window.retryMemoryCardOutputOnce(result, check.message, () => window.requestMemoryAnalysisWithFallback(
                    modelCfg,
                    systemPrompt + '\n上一次输出未通过格式或资料保留校验，请返回完整角色列表。角色资料必须严格10列，单元格内禁止使用半角竖线“|”。',
                    prompt + '\n\n上一次失败原因：' + check.message,
                    { label: '角色列表格式重试', fallback: '角色列表生成失败', requestFeature: 'analysis', requestIdPrefix: 'analysis_role_relation_retry', requestTraceGroup: meta?.requestTraceGroup || '' }
                ));
                check = window.validateRoleListOutput(existingRoleRelation, result, { ...(meta || {}), requireCurrentFormat: true });
            }
            if (!check.ok) throw new Error('角色列表格式校验失败：' + check.message);
            window.Utils?.appendLog?.(null, '🕸️ 角色列表生成完成', 'success');
            return check.noChange ? '无变化' : check.content;
        } catch (error) {
            if (window.isAuthExpiredError?.(error)) throw error;
            window.Utils?.appendLog?.(null, '角色列表提取失败：' + window.formatMemoryAiError(error, '可重新确认使用重试'), 'error');
            return null;
        }
    }

    function renderRoleRelationCard(container, content) {
        if (!container) return;
        if (window.InfoCardRenderer?.render) {
            container.innerHTML = window.InfoCardRenderer.render(content);
            window.InfoCardRenderer.drawCanvas?.(container);
            return;
        }
        container.textContent = String(content || '');
    }

    Object.assign(window, { extractLegacyMemorySection, migrateLegacyInfoAndRoles, generateRoleRelationCard, renderRoleRelationCard });
})(window);
