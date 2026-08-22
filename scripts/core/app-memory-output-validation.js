(function(window) {
    'use strict';

    const date = () => new Date().toISOString().slice(0, 10);
    function createInfoTableSkeleton(todayStr) { return `# 信息表\n\n> 更新于 ${todayStr || date()}\n\n## 势力\n| 名称 | 性质 | 当前状态 |\n| --- | --- | --- |\n\n## 地点\n| 名称 | 所属 | 当前状态 |\n| --- | --- | --- |\n\n## 物品\n| 名称 | 持有人 | 用途/状态 |\n| --- | --- | --- |\n`; }
    function createRoleListSkeleton(todayStr) { return `# 角色列表\n\n> 更新于 ${todayStr || date()}\n\n## 角色资料\n| 角色 | 性别 | 身份/定位 | 所属势力 | 核心目标 | 对话风格 | 人物弧线 | 人物简介 | 当前状态 | 写作提醒 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n\n## 角色关系\n（待章节展开）\n`; }
    function createRoleRelationCardSkeleton(todayStr) { return `# 角色关系卡\n\n> 更新于 ${todayStr || date()}\n\n| 角色A | 关系 | 角色B | 当前状态 |\n| --- | --- | --- | --- |\n`; }
    function createKeyEventTableSkeleton() { return '# 关键事件表\n\n## 活跃事件\n\n| ID | 类型 | 首次出现 | 事件说明 | 关键词 | 涉及角色 | 涉及地点/物品 | 状态 | 完成条件 | 最近更新 | 重要度 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n\n## 完成摘要\n\n| ID | 完成章节 | 完成摘要 | 后续影响 |\n| --- | --- | --- | --- |\n'; }
    function createMaterialIndexSkeleton() { return '# 资料索引\n\n| 文件名 | 文件类型 | 覆盖范围 | 关键词 | 关联事件ID | 涉及角色 | 涉及地点/物品 | 摘要 | 适用场景 | 优先级 | 更新时间 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n'; }

    function cleanMemoryCardOutput(raw) {
        return String(raw || '')
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/^```(?:markdown|md|json)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();
    }

    function splitMemoryTableRow(row) {
        const text = String(row || '').trim();
        if (!/^\|.*\|$/.test(text)) return [];
        const cells = [];
        let current = '';
        let escaped = false;
        for (let index = 1; index < text.length - 1; index += 1) {
            const char = text[index];
            if (escaped) {
                current += char === '|' ? '｜' : ('\\' + char);
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '|') {
                cells.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        if (escaped) current += '\\';
        cells.push(current.trim());
        return cells;
    }

    function normalizeMemoryTableRow(raw) {
        const lines = cleanMemoryCardOutput(raw).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const row = lines.find(line => /^\|.+\|$/.test(line) && !/^\|\s*:?-{3,}/.test(line));
        if (!row) return '';
        return '| ' + splitMemoryTableRow(row).map(cell => cell.replace(/\|/g, '｜')).join(' | ') + ' |';
    }

    function validateMemoryTableRow(raw, chapterNumOrColumns, cardName, expectedColumns) {
        const simpleCall = expectedColumns === undefined;
        const chapterNum = simpleCall ? null : chapterNumOrColumns;
        const columns = simpleCall ? Number(chapterNumOrColumns) : Number(expectedColumns);
        const label = simpleCall ? '记忆卡' : (cardName || '记忆卡');
        const cleaned = cleanMemoryCardOutput(raw);
        const lines = cleaned.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        if (/<\/?think>|推理过程|思考过程|分析过程/i.test(String(raw || '').slice(0, 500))) {
            return { ok: false, reason: label + '返回了思考或分析内容。', message: label + '返回了思考或分析内容。', content: '' };
        }
        if (lines.some(line => !/^\|.+\|$/.test(line))) {
            return { ok: false, reason: label + '表格行外包含说明文字。', message: label + '表格行外包含说明文字。', content: '' };
        }
        const row = normalizeMemoryTableRow(cleaned);
        if (!row) return { ok: false, reason: label + '没有返回表格行。', message: label + '没有返回表格行。', content: '' };
        const cells = splitMemoryTableRow(row);
        if (!Number.isFinite(columns) || cells.length !== columns) {
            return { ok: false, reason: label + '列数不正确。', message: label + '列数不正确。', content: row };
        }
        if (chapterNum !== null && chapterNum !== undefined && chapterNum !== '?'
            && (!cells[0] || !cells[0].includes('第' + chapterNum + '章'))) {
            return { ok: false, reason: label + '章节编号不正确。', message: label + '章节编号不正确。', content: row };
        }
        if (/[{}]/.test(row) || /以下是|分析如下|总结|我将|我会|好的，|当然可以/.test(row)) {
            return { ok: false, reason: label + '包含占位符或说明文字。', message: label + '包含占位符或说明文字。', content: row };
        }
        return { ok: true, reason: '', message: '', content: row };
    }

    function normalizeMemoryDocumentTitle(text, title) {
        const cleaned = cleanMemoryCardOutput(text);
        const escapedTitle = String(title || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const exactTitle = new RegExp('^#\\s*' + escapedTitle + '\\s*$', 'm');
        if (exactTitle.test(cleaned)) return cleaned;
        const prefixedTitle = new RegExp('^#\\s*[^\\n#]+(?:_|＿|-)\\s*' + escapedTitle + '\\s*$', 'm');
        return cleaned.replace(prefixedTitle, '# ' + title);
    }

    function validateMarkdownTable(text, title, expectedColumns) {
        const cleaned = normalizeMemoryDocumentTitle(text, title);
        if (!cleaned.includes('# ' + title)) return { ok: false, message: '缺少' + title + '标题', reason: '缺少' + title + '标题' };
        const rows = cleaned.split(/\r?\n/).map(line => line.trim()).filter(line => /^\|.*\|$/.test(line));
        if (rows.length < 2 || !rows.some(row => splitMemoryTableRow(row).every(cell => /^:?-{3,}:?$/.test(cell)))) {
            return { ok: false, message: title + '缺少完整表格', reason: title + '缺少完整表格' };
        }
        if (expectedColumns) {
            const invalid = rows.filter(row => !splitMemoryTableRow(row).every(cell => /^:?-{3,}:?$/.test(cell)))
                .find(row => splitMemoryTableRow(row).length !== expectedColumns);
            if (invalid) return { ok: false, message: title + '列数不正确', reason: title + '列数不正确' };
        }
        return { ok: true, message: '', reason: '', content: cleaned };
    }

    function countMemoryDataRows(text) {
        return cleanMemoryCardOutput(text).split(/\r?\n/).map(line => line.trim()).filter(line => {
            if (!/^\|.*\|$/.test(line)) return false;
            const cells = splitMemoryTableRow(line);
            return cells.length > 0 && !cells.every(cell => /^:?-{3,}:?$/.test(cell)) && !/^(名称|角色|ID|文件名|事件ID)$/.test(cells[0]);
        }).length;
    }

    function protectAgainstSevereShortening(existingContent, nextContent, label) {
        const previousRows = countMemoryDataRows(existingContent);
        const nextRows = countMemoryDataRows(nextContent);
        if (previousRows > 0 && nextRows < previousRows) {
            return { ok: false, message: label + '返回内容少于已有资料，已阻止覆盖', reason: label + '返回内容少于已有资料，已阻止覆盖' };
        }
        return null;
    }

    function getMarkdownSection(text, heading) {
        const escaped = String(heading || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = String(text || '').match(new RegExp('(^|\\n)##\\s*' + escaped + '\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)'));
        return match ? match[2] : '';
    }

    function validateSectionTableColumns(text, heading, expectedColumns, label) {
        const rows = getMarkdownSection(text, heading).split(/\r?\n/).map(line => line.trim()).filter(line => /^\|.*\|$/.test(line));
        if (rows.length < 2 || !rows.some(row => splitMemoryTableRow(row).every(cell => /^:?-{3,}:?$/.test(cell)))) {
            return { ok: false, message: label + '缺少完整表格', reason: label + '缺少完整表格' };
        }
        const invalid = rows.find(row => splitMemoryTableRow(row).length !== expectedColumns);
        return invalid ? { ok: false, message: label + '列数不正确', reason: label + '列数不正确' } : null;
    }

    function validateInfoTableOutput(existingOrText, output, meta) {
        const existing = output === undefined ? '' : String(existingOrText || '');
        const text = output === undefined ? existingOrText : output;
        const cleaned = cleanMemoryCardOutput(text);
        const base = validateMarkdownTable(cleaned, '信息表');
        if (!base.ok) return base;
        for (const heading of ['势力', '地点', '物品']) {
            if (!new RegExp('(^|\\n)##\\s*' + heading + '\\s*(\\n|$)').test(cleaned)) {
                return { ok: false, message: '信息表缺少“' + heading + '”分区', reason: '信息表缺少“' + heading + '”分区' };
            }
            const tableError = validateSectionTableColumns(cleaned, heading, 3, '信息表“' + heading + '”');
            if (tableError) return tableError;
        }
        if (/(^|\n)##\s*(角色|人物)/.test(cleaned)) return { ok: false, message: '信息表混入了角色资料', reason: '信息表混入了角色资料' };
        const shortened = protectAgainstSevereShortening(existing, cleaned, '信息表');
        return shortened || { ok: true, message: '', reason: '', content: cleaned, noChange: cleaned === cleanMemoryCardOutput(existing) };
    }

    function validateRoleListOutput(existingOrText, outputOrOptions, meta) {
        const hasOutput = typeof outputOrOptions === 'string';
        const existing = hasOutput ? String(existingOrText || '') : '';
        const text = hasOutput ? outputOrOptions : existingOrText;
        const options = (!hasOutput && outputOrOptions && typeof outputOrOptions === 'object') ? outputOrOptions : (meta || {});
        const cleaned = cleanMemoryCardOutput(text);
        const base = validateMarkdownTable(cleaned, '角色列表');
        if (!base.ok) return base;
        if (!/(^|\n)##\s*角色资料\s*(\n|$)/.test(cleaned)) return { ok: false, message: '角色列表缺少“角色资料”分区', reason: '角色列表缺少“角色资料”分区' };
        const rows = cleaned.split(/\r?\n/).map(line => line.trim()).filter(line => /^\|.*\|$/.test(line));
        const header = rows.find(row => splitMemoryTableRow(row)[0] === '角色');
        const headerCells = splitMemoryTableRow(header);
        const columns = headerCells.length;
        const isLegacyPersonalitySchema = columns === 11 && headerCells.includes('性格');
        const isCurrentSchema = columns === 10 && !headerCells.includes('性格');
        if (!isCurrentSchema && !isLegacyPersonalitySchema && !(columns === 4 && options.requireCurrentFormat !== true)) {
            return { ok: false, message: '角色资料必须使用完整人物字段', reason: '角色资料必须使用完整人物字段' };
        }
        if (options.requireCurrentFormat === true && !isCurrentSchema) {
            return { ok: false, message: '角色资料必须使用不含“性格”的当前字段', reason: '角色资料必须使用不含“性格”的当前字段' };
        }
        const profileTableError = validateSectionTableColumns(cleaned, '角色资料', columns, '角色资料');
        if (profileTableError) return profileTableError;
        if (options.requireCurrentFormat === true && !/(^|\n)##\s*角色关系\s*(\n|$)/.test(cleaned)) {
            return { ok: false, message: '角色列表缺少“角色关系”分区', reason: '角色列表缺少“角色关系”分区' };
        }
        if (/(^|\n)##\s*(势力|地点|地点树|物品|物品栏)/.test(cleaned)) return { ok: false, message: '角色列表混入了非人物资料', reason: '角色列表混入了非人物资料' };
        if (options.compactRoleList === true) {
            const roleRows = getMarkdownSection(cleaned, '角色资料').split(/\r?\n/).filter(function(line) {
                const cells = splitMemoryTableRow(line);
                return cells.length === columns && cells[0] && cells[0] !== '角色' && !/^[-:]+$/.test(cells[0]) && !/^[（(]待/.test(cells[0]);
            });
            if (roleRows.length > 30) return { ok: false, message: '角色列表超过30名重点角色上限', reason: '角色列表超过30名重点角色上限' };
            const tooLong = roleRows.some(function(line) {
                const cells = splitMemoryTableRow(line);
                return cells[0].length > 20 || cells.some(function(cell, index) { return index > 0 && cell.length > 48; });
            });
            if (tooLong) return { ok: false, message: '角色字段过长，未通过精简校验', reason: '角色字段过长，未通过精简校验' };
            const relationSection = getMarkdownSection(cleaned, '角色关系');
            const relationCount = (relationSection.match(/(?:→|->|=>)/g) || []).length;
            if (relationCount > 80) return { ok: false, message: '角色关系超过80条关键关系上限', reason: '角色关系超过80条关键关系上限' };
        }
        const shortened = protectAgainstSevereShortening(existing, cleaned, '角色列表');
        return shortened || { ok: true, message: '', reason: '', content: cleaned, noChange: cleaned === cleanMemoryCardOutput(existing) };
    }
    function validateRoleRelationCardOutput(text) { return validateMarkdownTable(text, '角色关系卡', 4); }
    function validateKeyEventTableOutput(text, sourceType, existingContent) {
        let cleaned = cleanMemoryCardOutput(text);
        const base = validateMarkdownTable(cleaned, '关键事件表');
        if (!base.ok) return base;
        cleaned = base.content;
        if (!/(^|\n)##\s*活跃事件\s*(\n|$)/.test(cleaned) || !/(^|\n)##\s*完成摘要\s*(\n|$)/.test(cleaned)) {
            if (sourceType === undefined) return validateMarkdownTable(cleaned, '关键事件表', 5);
            return { ok: false, message: '关键事件表缺少活跃事件或完成摘要分区', reason: '关键事件表缺少活跃事件或完成摘要分区' };
        }
        const rows = cleaned.split(/\r?\n/).map(line => line.trim()).filter(line => /^\|.*\|$/.test(line));
        const activeHeader = rows.find(row => splitMemoryTableRow(row)[0] === 'ID' && splitMemoryTableRow(row).includes('事件说明'));
        const completedHeader = rows.find(row => splitMemoryTableRow(row)[0] === 'ID' && splitMemoryTableRow(row).includes('完成章节'));
        if (splitMemoryTableRow(activeHeader).length !== 11 || splitMemoryTableRow(completedHeader).length !== 4) {
            return { ok: false, message: '关键事件表列数不正确', reason: '关键事件表列数不正确' };
        }
        const activeError = validateSectionTableColumns(cleaned, '活跃事件', 11, '关键事件表“活跃事件”');
        const completedError = validateSectionTableColumns(cleaned, '完成摘要', 4, '关键事件表“完成摘要”');
        if (activeError || completedError) return activeError || completedError;
        const activeRows = getMarkdownSection(cleaned, '活跃事件').split(/\r?\n/).filter(line => /^\|.*\|$/.test(line));
        if (activeRows.some(row => {
            const cells = splitMemoryTableRow(row);
            return /^F-\d{3,}$/.test(cells[0] || '') && !/^(未完成|推进中)$/.test(cells[7] || '');
        })) return { ok: false, message: '活跃事件状态只能是未完成或推进中', reason: '活跃事件状态不正确' };
        if (sourceType === 'chapter') {
            const existingIds = new Set(String(existingContent || '').match(/\bF-\d{3,}\b/g) || []);
            const nextIds = String(cleaned).match(/\bF-\d{3,}\b/g) || [];
            if (nextIds.some(id => !existingIds.has(id))) return { ok: false, message: '正文章节不能创建新的事件ID', reason: '正文章节不能创建新的事件ID' };
        }
        if (sourceType === 'outline') {
            const oldCompleted = new Set(getMarkdownSection(existingContent, '完成摘要').match(/\bF-\d{3,}\b/g) || []);
            const nextCompleted = new Set(getMarkdownSection(cleaned, '完成摘要').match(/\bF-\d{3,}\b/g) || []);
            if ([...nextCompleted].some(id => !oldCompleted.has(id)) || [...oldCompleted].some(id => !nextCompleted.has(id))) {
                return { ok: false, message: '规划阶段不能新增、删除或改写完成摘要事件', reason: '规划阶段完成摘要发生变化' };
            }
        }
        const shortened = protectAgainstSevereShortening(existingContent, cleaned, '关键事件表');
        if (shortened) return shortened;
        return { ok: true, message: '', reason: '', content: cleaned };
    }

    function validateMaterialIndexOutput(text, allowedFileNames, allowedEventIds, existingContent) {
        const cleaned = cleanMemoryCardOutput(text);
        const base = validateMarkdownTable(cleaned, '资料索引', 11);
        if (!base.ok) {
            if (allowedFileNames === undefined) return validateMarkdownTable(cleaned, '资料索引', 4);
            return base;
        }
        const rows = cleaned.split(/\r?\n/).map(line => line.trim()).filter(line => /^\|.*\|$/.test(line));
        const fileSet = allowedFileNames instanceof Set ? allowedFileNames : new Set(allowedFileNames || []);
        const enforceEventIds = allowedEventIds !== undefined;
        const eventSet = allowedEventIds instanceof Set ? allowedEventIds : new Set(allowedEventIds || []);
        for (const row of rows) {
            const cells = splitMemoryTableRow(row);
            if (!cells.length || cells[0] === '文件名' || cells.every(cell => /^:?-{3,}:?$/.test(cell))) continue;
            if (fileSet.size && !fileSet.has(cells[0])) return { ok: false, message: '资料索引包含不存在的文件：' + cells[0], reason: '资料索引包含不存在的文件' };
            const ids = String(cells[4] || '').match(/\bF-\d{3,}\b/g) || [];
            if (enforceEventIds && ids.some(id => !eventSet.has(id))) return { ok: false, message: '资料索引引用了不存在的事件ID', reason: '资料索引引用了不存在的事件ID' };
        }
        const shortened = protectAgainstSevereShortening(existingContent, cleaned, '资料索引');
        if (shortened) return shortened;
        return { ok: true, message: '', reason: '', content: cleaned };
    }
    function validateTrackingRowOutput(raw, chapterNum) { return validateMemoryTableRow(raw, chapterNum, '追踪表', 4); }
    function validateBoundaryRowOutput(raw, chapterNum) { return validateMemoryTableRow(raw, chapterNum, '边界卡', 4); }

    function isCharacterName(name, profile, knownNonCharacters) {
        const text = String(name || '').trim();
        if (!text || text.length > 20 || /[：:，,→]/.test(text)) return false;
        if (knownNonCharacters instanceof Set && knownNonCharacters.has(text)) return false;
        const identity = String(profile?.identity || profile?.身份 || '').trim();
        const explicitNonCharacterName = /^(?:势力|门派|宗门|组织|地点|国家|城池|物品|功法)(?:资料|条目|设定)?$/.test(text)
            || (text.length >= 3 && /(?:王朝|帝国|朝廷|皇室|官府|阵营|家族|世家|门派|宗门|商会|帮会|教派|寺院|书院|学院|军团|部族|联盟|协会|公会|宗)$/.test(text));
        const explicitNonCharacterIdentity = /^(?:主要|大型|地方|敌对|中立|神秘)?(?:势力|门派|宗门|组织|地点|国家|城池|物品|功法)(?:资料|条目|设定|势力)?$/.test(identity);
        if (explicitNonCharacterName || explicitNonCharacterIdentity) return false;
        const hasUsableProfile = !!profile && Object.values(profile).some(function(value) {
            return !/^(?:|—|-|无|暂无|未知|不详|待定|待补充)$/.test(String(value || '').trim());
        });
        // 角色资料表是更强的事实证据。“顾倾城”“宫本武藏”等真实姓名
        // 不能仅因结尾含“城/宫”被启发式规则误删。
        if (hasUsableProfile) return true;
        if (text.length > 12) return false;
        if (/^(前朝|旧朝|本朝|当朝|朝廷|皇室|官府|江湖|天下|上古|远古|时代|年代|时期|纪元)$/.test(text)) return false;
        if (/^(皇子|太子|公主|王爷|将军|官员|侍卫|百姓|士兵|敌人|刺客|门客|弟子|长老|族人|下属)$/.test(text)) return false;
        return !/(王朝|帝国|朝廷|皇室|官府|势力|阵营|家族|世家|门派|宗门|商会|宗|军|卫|帮|教|寺|宫|阁|楼|堂|寨|堡|庄|盟|会|司|府|院|族|国|城|镇|村|部|营)$/.test(text);
    }

    async function retryMemoryCardOutputOnce(outputOrModelCfg, reasonOrSystemPrompt, requesterOrPrompt, cardName, reason, requester) {
        if (typeof requesterOrPrompt === 'function' && cardName === undefined) {
            return requesterOrPrompt({ previousOutput: outputOrModelCfg, reason: reasonOrSystemPrompt });
        }
        const request = requester || window.requestShortMemoryCardText;
        if (typeof request !== 'function') throw new Error((cardName || '记忆卡') + '格式重试不可用');
        window.Utils?.appendLog?.(null, '⚠️ ' + (cardName || '记忆卡') + '格式不合格，正在自动重试一次...', 'progress');
        return request(
            outputOrModelCfg,
            String(reasonOrSystemPrompt || '') + ' 请严格按格式返回，不要解释。',
            String(requesterOrPrompt || '') + '\n\n上一次失败原因：' + (reason || '格式不正确'),
            { label: (cardName || '记忆卡') + '格式重试' }
        );
    }

    async function validateMemoryOutputWithSingleRetry(output, validator, requester, label) {
        const first = validator(output);
        if (first.ok) return first.content || output;
        const repaired = await retryMemoryCardOutputOnce(output, first.reason || first.message, requester);
        const second = validator(repaired);
        if (!second.ok) throw new Error((label || '记忆卡') + '格式校验失败：' + (second.reason || second.message));
        return second.content || repaired;
    }

    Object.assign(window, {
        createInfoTableSkeleton,
        createRoleListSkeleton,
        createRoleRelationCardSkeleton,
        createKeyEventTableSkeleton,
        createMaterialIndexSkeleton,
        cleanMemoryCardOutput,
        normalizeMemoryTableRow,
        validateMemoryTableRow,
        validateTrackingRowOutput,
        validateBoundaryRowOutput,
        validateInfoTableOutput,
        validateRoleListOutput,
        validateRoleRelationCardOutput,
        validateKeyEventTableOutput,
        validateMaterialIndexOutput,
        isCharacterName,
        retryMemoryCardOutputOnce,
        validateMemoryOutputWithSingleRetry
    });
})(window);
