(function(window) {
    'use strict';

    function getChapterNumber(chapterName) {
        if (typeof window.extractChapterNumber === 'function') {
            return window.extractChapterNumber(chapterName);
        }
        return null;
    }

    function buildTrackingContent(bookName, chapterName, chapterContent, plotInput) {
        const chapterNum = getChapterNumber(chapterName) || '?';
        const summaryPrompt = `请分析以下小说章节，生成追踪表条目。只回复一行表格，不要其他解释。

章节名：${chapterName}
剧情要求：${plotInput || '无'}
正文内容：${chapterContent}

| 第${chapterNum}章 | {章节进度，≤20字} | {角色状态变化，死亡/退场/新登场，无则填—} | {伏笔追踪，新伏笔标⚪，已解标✅，无则填—} |`;

        return summaryPrompt;
    }

    function buildBoundaryContent(bookName, vi, chapterName, chapterContent, plotInput) {
        const chapterNum = getChapterNumber(chapterName) || '?';
        const boundaryPrompt = `请分析以下小说章节，生成边界卡条目。只回复一行表格，不要其他解释。

章节名：${chapterName}
剧情要求：${plotInput || '无'}
正文内容：${chapterContent}

| 第${chapterNum}章 | {本章禁区，≤20字} | {下章规划，≤20字} | {进度提醒，≤20字，提示下章该推进什么} |`;

        return boundaryPrompt;
    }

    function buildKeyEventTablePrompt(bookName, sourceContent, existingContent, meta, sourceType) {
        const sourceName = sourceType === 'outline' ? '高级大纲/阶段粗纲' : `第${meta?.chapterNum || '?'}章《${meta?.chapterName || ''}》`;
        const completionRule = sourceType === 'chapter'
            ? '只有本章正文明确写出事件被揭示、解决、回收或造成不可逆结果，才能移入完成摘要；没有正文证据时保持未完成或推进中。'
            : '大纲、细纲和拆书都不是正文完成证据，本次不得向完成摘要新增内容。';
        const idRule = sourceType === 'chapter'
            ? '正文分析只能使用已有关键事件表中的 F-ID，禁止创建、补号、改号或重编号。'
            : '保留已有 F-ID；只有跨章节重要事件才可创建新 ID，普通日常或单章冲突不要创建。';
        return `你是知屿写作的剧情资料维护助手。请根据本次内容更新关键事件表，只输出完整关键事件表，不要解释。\n\n【真实性规则】\n不要编造不存在的章节、人物、设定、事件或证据。\n${completionRule}\n${idRule}\n\n【状态列硬约束】\n1. “活跃事件”每一行第8列“状态”只能逐字填写“未完成”或“推进中”，不得使用“已完成、完成、已解决、计划中、待处理、进行中”等任何其他写法。\n2. 已经位于“完成摘要”的旧事件保持在完成摘要，不要复制回活跃事件。\n3. 输出前逐行检查活跃事件的状态列；发现不是“未完成”或“推进中”时，必须先改正再输出。\n\n【当前作品】${bookName}\n【本次来源】${sourceName}\n\n【已有关键事件表】\n${existingContent || window.createKeyEventTableSkeleton()}\n\n【本次内容】\n${sourceContent || '（无）'}\n\n请严格输出：\n# 关键事件表\n\n## 活跃事件\n\n| ID | 类型 | 首次出现 | 事件说明 | 关键词 | 涉及角色 | 涉及地点/物品 | 状态 | 完成条件 | 最近更新 | 重要度 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n\n## 完成摘要\n\n| ID | 完成章节 | 完成摘要 | 后续影响 |\n| --- | --- | --- | --- |`;
    }

    function buildMaterialIndexPrompt(bookName, sourceContent, existingContent, filesBrief, meta, sourceType, allowedEventIds) {
        const sourceName = sourceType === 'outline' ? '高级大纲/阶段粗纲' : `第${meta?.chapterNum || '?'}章《${meta?.chapterName || ''}》`;
        const allowedIds = String(allowedEventIds || '').trim();
        const idRule = allowedIds
            ? `“关联事件ID”只能留空，或引用以下白名单中的 ID：${allowedIds}。`
            : '当前没有可引用的事件 ID，“关联事件ID”整列必须留空。';
        return `你是知屿写作的资料索引维护助手。请根据本次内容和文件清单更新资料索引，只输出完整资料索引表，不要解释。\n\n【真实性规则】\n“文件名”列必须逐字复制当前文件清单中横线后面的完整文件名，不要复制开头的“- ”，也不得改写成简称、别名或内容标题；例如清单行是“- 作品名_大纲”时，只能填写“作品名_大纲”，不能改写成“全书母大纲”。\n只能填写当前文件清单中真实存在的文件名，不要编造文件、章节或证据。\n${idRule}\n不得引用只在大纲、正文或旧资料索引里出现、但不在上述白名单中的 F-ID；旧资料索引若含有白名单之外的 ID，本次必须删除该无效 ID，或把该单元格留空，不能照抄。\n输出前逐行核对“文件名”和“关联事件ID”两列。\n资料索引总行数最多40行；同一个系统文件最多1行；只保留高价值召回入口。\n\n【当前作品】${bookName}\n【本次来源】${sourceName}\n\n【已有资料索引】\n${existingContent || window.createMaterialIndexSkeleton()}\n\n【当前文件清单】\n${filesBrief || '（暂无）'}\n\n【本次内容】\n${sourceContent || '（无）'}\n\n请严格输出：\n# 资料索引\n\n| 文件名 | 文件类型 | 覆盖范围 | 关键词 | 关联事件ID | 涉及角色 | 涉及地点/物品 | 摘要 | 适用场景 | 优先级 | 更新时间 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`;
    }

    window.ZHIYU_MEMORY_PROMPT_BUILDERS = {
        buildTrackingContent,
        buildBoundaryContent,
        buildKeyEventTablePrompt,
        buildMaterialIndexPrompt
    };
    window.buildTrackingContent = buildTrackingContent;
    window.buildBoundaryContent = buildBoundaryContent;
    window.buildKeyEventTablePrompt = buildKeyEventTablePrompt;
    window.buildMaterialIndexPrompt = buildMaterialIndexPrompt;
})(window);
