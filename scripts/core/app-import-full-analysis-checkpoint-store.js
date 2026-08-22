// 导入作品全文分析：本机检查点存储。
// 复用现有 ZHIYU_IDB 的原子 setMany；所有键都按账号和单一任务隔离。
(function(window) {
    'use strict';

    const SCHEMA_VERSION = '2.0.0';
    const KEY_PREFIX = 'zhiyu_full_analysis_v2';
    const TASK_RECORD_TYPES = Object.freeze([
        'task', 'source_unit', 'request', 'response_payload', 'chapter_fact',
        'entity', 'summary_node', 'output', 'audit'
    ]);
    const ENVELOPE_RECORD_TYPES = Object.freeze([
        ...TASK_RECORD_TYPES, 'source_snapshot', 'knowledge_snapshot'
    ]);
    const ENVELOPE_CHECKSUM_SCOPE = 'full_envelope_v1';
    const MIGRATIONS = new Map([
        ['1.0.0', function(value) {
            return Object.assign({}, clone(value), { schemaVersion: SCHEMA_VERSION });
        }]
    ]);
    const TASK_WRITE_QUEUES = new Map();

    function getSchema() {
        return window.ZhiyuImportFullAnalysisSchema;
    }

    function getIdb() {
        const idb = window.ZHIYU_IDB;
        if (!idb?.get || !idb?.set || !idb?.setMany || !idb?.remove) {
            const error = new Error('全文分析本机存储未就绪，请刷新页面后重试');
            error.code = 'FULL_ANALYSIS_STORAGE_UNAVAILABLE';
            throw error;
        }
        return idb;
    }

    function cleanPart(value, name) {
        const text = String(value || '').trim();
        if (!text) throw new Error('全文分析存储缺少 ' + name);
        if (text === '*' || text.includes('\u0000')) throw new Error('全文分析存储 ' + name + ' 无效');
        return encodeURIComponent(text);
    }

    function ownerPrefix(ownerId) {
        return KEY_PREFIX + ':owner:' + cleanPart(ownerId, 'ownerId');
    }

    function taskPrefix(ownerId, taskId) {
        return ownerPrefix(ownerId) + ':task:' + cleanPart(taskId, 'taskId');
    }

    function taskIndexKey(ownerId) {
        return ownerPrefix(ownerId) + ':task_index';
    }

    function recordKey(ownerId, taskId, recordType, recordId) {
        if (!TASK_RECORD_TYPES.includes(recordType)) throw new Error('未知全文分析记录类型：' + recordType);
        return taskPrefix(ownerId, taskId) + ':' + recordType + ':' + cleanPart(recordId, 'recordId');
    }

    function sourceSnapshotKey(ownerId, sourceSnapshotId) {
        return ownerPrefix(ownerId) + ':source_snapshot:' + cleanPart(sourceSnapshotId, 'sourceSnapshotId');
    }

    function knowledgeSnapshotKey(ownerId, targetWorkId) {
        return ownerPrefix(ownerId) + ':work_knowledge:' + cleanPart(targetWorkId, 'targetWorkId');
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function clone(value) {
        if (typeof structuredClone === 'function') return structuredClone(value);
        return JSON.parse(JSON.stringify(value));
    }

    function hashValue(value) {
        return getSchema()?.hashText?.(JSON.stringify(value)) || String(JSON.stringify(value).length);
    }

    function sourceSnapshotChecksum(value) {
        const snapshot = clone(value || {});
        delete snapshot.taskId;
        delete snapshot.createdAt;
        return hashValue(snapshot);
    }

    function checkpointCorruptError() {
        const error = new Error('全文分析检查点校验失败，已保留上一完整版本');
        error.code = 'FULL_ANALYSIS_CHECKPOINT_CORRUPT';
        return error;
    }

    function envelopeChecksumValue(envelope) {
        return {
            checksumScope: envelope.checksumScope,
            schemaVersion: envelope.schemaVersion,
            recordType: envelope.recordType,
            ownerId: envelope.ownerId,
            taskId: envelope.taskId,
            revision: envelope.revision,
            createdAt: envelope.createdAt,
            updatedAt: envelope.updatedAt,
            value: envelope.value
        };
    }

    function createEnvelope(recordType, ownerId, taskId, value, revision, createdAt) {
        const timestamp = nowIso();
        const payload = clone(value);
        const envelope = {
            checksumScope: ENVELOPE_CHECKSUM_SCOPE,
            schemaVersion: SCHEMA_VERSION,
            recordType,
            ownerId: String(ownerId),
            taskId: String(taskId || ''),
            revision: Number.isInteger(revision) && revision > 0 ? revision : 1,
            createdAt: createdAt || timestamp,
            updatedAt: timestamp,
            value: payload
        };
        envelope.checksum = hashValue(envelopeChecksumValue(envelope));
        return envelope;
    }

    function readEnvelopeValue(envelope, expected) {
        if (!envelope) return null;
        if (envelope.schemaVersion !== SCHEMA_VERSION) {
            const error = new Error('全文分析检查点版本不兼容，已停止自动恢复');
            error.code = 'FULL_ANALYSIS_SCHEMA_MIGRATION_REQUIRED';
            throw error;
        }
        if (expected?.ownerId && envelope.ownerId !== expected.ownerId) {
            const error = new Error('全文分析检查点账号不匹配');
            error.code = 'FULL_ANALYSIS_OWNER_MISMATCH';
            throw error;
        }
        if (expected?.taskId && envelope.taskId !== expected.taskId) {
            const error = new Error('全文分析检查点任务不匹配');
            error.code = 'FULL_ANALYSIS_TASK_MISMATCH';
            throw error;
        }
        if (!ENVELOPE_RECORD_TYPES.includes(envelope.recordType)
            || !Number.isInteger(envelope.revision)
            || envelope.revision < 1
            || typeof envelope.createdAt !== 'string'
            || typeof envelope.updatedAt !== 'string') {
            throw checkpointCorruptError();
        }
        if (expected?.recordType && envelope.recordType !== expected.recordType) {
            throw checkpointCorruptError();
        }
        let expectedChecksum;
        if (envelope.checksumScope === ENVELOPE_CHECKSUM_SCOPE) {
            expectedChecksum = hashValue(envelopeChecksumValue(envelope));
        } else if (typeof envelope.checksumScope === 'undefined') {
            expectedChecksum = hashValue(envelope.value);
        } else {
            throw checkpointCorruptError();
        }
        if (envelope.checksum !== expectedChecksum) {
            throw checkpointCorruptError();
        }
        return clone(envelope.value);
    }

    function recordTypeFromTaskKey(ownerId, taskId, key) {
        const prefix = taskPrefix(ownerId, taskId) + ':';
        const text = String(key || '');
        if (!text.startsWith(prefix)) throw checkpointCorruptError();
        const suffix = text.slice(prefix.length);
        const separator = suffix.indexOf(':');
        const recordType = separator > 0 ? suffix.slice(0, separator) : '';
        if (!TASK_RECORD_TYPES.includes(recordType)) throw checkpointCorruptError();
        return recordType;
    }

    async function getTaskEnvelope(ownerId, taskId) {
        return getIdb().get(recordKey(ownerId, taskId, 'task', taskId));
    }

    async function createTaskBundle(input) {
        const task = clone(input?.task || {});
        const ownerId = String(task.ownerId || '');
        const taskId = String(task.taskId || '');
        const taskValidation = getSchema()?.validateAnalysisTask?.(task);
        if (!taskValidation?.valid) {
            throw new Error('无法建立全文分析任务：' + (taskValidation?.errors || ['数据无效']).join('；'));
        }
        const snapshot = clone(input?.sourceSnapshot || {});
        if (snapshot.ownerId !== ownerId || snapshot.sourceSnapshotId !== task.sourceSnapshotId) {
            throw new Error('来源快照与任务不匹配');
        }
        const units = clone(Array.isArray(input?.sourceUnits) ? input.sourceUnits : []);
        if (!units.length) throw new Error('全文分析任务没有可处理的来源单元');
        units.forEach(function(unit) {
            const result = getSchema()?.validateSourceUnit?.(unit);
            if (!result?.valid) throw new Error('来源单元无效：' + (result?.errors || []).join('；'));
        });

        const idb = getIdb();
        const existingTask = await getTaskEnvelope(ownerId, taskId);
        if (existingTask) throw new Error('同一全文分析任务已存在，不能覆盖');
        const snapshotKey = sourceSnapshotKey(ownerId, task.sourceSnapshotId);
        const existingSnapshot = await idb.get(snapshotKey);
        if (existingSnapshot) {
            const existingSnapshotValue = readEnvelopeValue(existingSnapshot, {
                ownerId,
                recordType: 'source_snapshot'
            });
            if (sourceSnapshotChecksum(existingSnapshotValue) !== sourceSnapshotChecksum(snapshot)) {
                throw new Error('同名来源快照内容不同，已停止覆盖');
            }
        }
        const indexKey = taskIndexKey(ownerId);
        const currentIndex = await idb.get(indexKey);
        const index = Array.isArray(currentIndex) ? currentIndex.slice() : [];
        if (!index.includes(taskId)) index.push(taskId);

        const manifestKeys = units.map(function(unit) {
            return recordKey(ownerId, taskId, 'source_unit', unit.unitId);
        });
        task.recordKeys = Array.from(new Set([
            recordKey(ownerId, taskId, 'task', taskId),
            ...manifestKeys
        ]));
        task.checkpointRevision = 1;
        const entries = [
            [recordKey(ownerId, taskId, 'task', taskId), createEnvelope('task', ownerId, taskId, task, 1)],
            [indexKey, index]
        ];
        if (!existingSnapshot) {
            entries.push([snapshotKey, createEnvelope('source_snapshot', ownerId, '', snapshot, 1)]);
        }
        units.forEach(function(unit) {
            entries.push([
                recordKey(ownerId, taskId, 'source_unit', unit.unitId),
                createEnvelope('source_unit', ownerId, taskId, unit, 1)
            ]);
        });
        await idb.setMany(entries);
        return loadTaskBundle(ownerId, taskId);
    }

    async function loadTaskBundle(ownerId, taskId) {
        const idb = getIdb();
        const taskEnvelope = await getTaskEnvelope(ownerId, taskId);
        const task = readEnvelopeValue(taskEnvelope, { ownerId, taskId, recordType: 'task' });
        if (!task) return null;
        const sourceSnapshot = readEnvelopeValue(
            await idb.get(sourceSnapshotKey(ownerId, task.sourceSnapshotId)),
            { ownerId, recordType: 'source_snapshot' }
        );
        const sourceUnits = [];
        const related = {};
        for (const key of task.recordKeys || []) {
            if (key === recordKey(ownerId, taskId, 'task', taskId)) continue;
            const envelope = await idb.get(key);
            if (!envelope) continue;
            const expectedRecordType = recordTypeFromTaskKey(ownerId, taskId, key);
            const value = readEnvelopeValue(envelope, {
                ownerId,
                taskId,
                recordType: expectedRecordType
            });
            if (expectedRecordType === 'source_unit') sourceUnits.push(value);
            else {
                if (!related[expectedRecordType]) related[expectedRecordType] = [];
                related[expectedRecordType].push(value);
            }
        }
        sourceUnits.sort(function(left, right) {
            return left.chapterOrder - right.chapterOrder || left.partIndex - right.partIndex;
        });
        return { task, sourceSnapshot, sourceUnits, records: related };
    }

    async function listTasks(ownerId) {
        const idb = getIdb();
        const index = await idb.get(taskIndexKey(ownerId));
        const tasks = [];
        for (const taskId of Array.isArray(index) ? index : []) {
            const envelope = await getTaskEnvelope(ownerId, taskId);
            const task = readEnvelopeValue(envelope, { ownerId, taskId, recordType: 'task' });
            if (task) tasks.push(task);
        }
        return tasks.sort(function(left, right) {
            return String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''));
        });
    }

    async function writeRecords(ownerId, taskId, records, taskPatch) {
        const queueKey = taskPrefix(ownerId, taskId);
        const previous = TASK_WRITE_QUEUES.get(queueKey) || Promise.resolve();
        const operation = previous.catch(function() {}).then(function() {
            return writeRecordsNow(ownerId, taskId, records, taskPatch);
        });
        let gate;
        gate = operation.then(function() {}, function() {}).finally(function() {
            if (TASK_WRITE_QUEUES.get(queueKey) === gate) TASK_WRITE_QUEUES.delete(queueKey);
        });
        TASK_WRITE_QUEUES.set(queueKey, gate);
        return operation;
    }

    async function writeRecordsNow(ownerId, taskId, records, taskPatch) {
        const idb = getIdb();
        const taskEnvelope = await getTaskEnvelope(ownerId, taskId);
        const task = readEnvelopeValue(taskEnvelope, { ownerId, taskId, recordType: 'task' });
        if (!task) throw new Error('找不到要更新的全文分析任务');
        const entries = [];
        const manifest = new Set(task.recordKeys || []);
        const values = Array.isArray(records) ? records : [];
        for (const record of values) {
            if (!record || !TASK_RECORD_TYPES.includes(record.recordType) || record.recordType === 'task') {
                throw new Error('全文分析写入记录类型无效');
            }
            const key = recordKey(ownerId, taskId, record.recordType, record.recordId);
            const previous = await idb.get(key);
            const revision = Number(previous?.revision || 0) + 1;
            entries.push([
                key,
                createEnvelope(record.recordType, ownerId, taskId, record.value, revision, previous?.createdAt)
            ]);
            manifest.add(key);
        }
        const nextTask = Object.assign({}, task, clone(taskPatch || {}), {
            recordKeys: Array.from(manifest),
            checkpointRevision: Number(task.checkpointRevision || 0) + 1,
            updatedAt: nowIso()
        });
        const nextTaskEnvelope = createEnvelope(
            'task',
            ownerId,
            taskId,
            nextTask,
            Number(taskEnvelope.revision || 0) + 1,
            taskEnvelope.createdAt
        );
        entries.push([recordKey(ownerId, taskId, 'task', taskId), nextTaskEnvelope]);
        await idb.setMany(entries);
        return nextTask;
    }

    async function saveRequest(ownerId, taskId, request, taskPatch) {
        if (!request?.requestId) throw new Error('请求账本缺少 requestId');
        return writeRecords(ownerId, taskId, [{
            recordType: 'request',
            recordId: request.requestId,
            value: request
        }], taskPatch);
    }

    async function saveResponsePayload(ownerId, taskId, request, payload) {
        if (!request?.requestId) throw new Error('响应落盘缺少 requestId');
        const responsePayloadRef = 'response_' + request.requestId;
        const responseHash = hashValue(payload);
        const nextRequest = Object.assign({}, request, {
            status: 'result_received',
            responsePayloadRef,
            responseHash,
            responseReceivedAt: nowIso()
        });
        await writeRecords(ownerId, taskId, [
            { recordType: 'response_payload', recordId: responsePayloadRef, value: { responsePayloadRef, responseHash, payload } },
            { recordType: 'request', recordId: request.requestId, value: nextRequest }
        ]);
        return nextRequest;
    }

    async function commitChapterFacts(ownerId, taskId, request, chapterFacts, taskPatch) {
        const facts = Array.isArray(chapterFacts) ? chapterFacts : [];
        if (!facts.length) throw new Error('没有可提交的章节事实');
        facts.forEach(function(chapterFact) {
            getSchema()?.assertChapterFact?.(chapterFact);
            if (chapterFact.taskId !== taskId) throw new Error('章节事实与当前任务不匹配');
        });
        if (!request?.requestId || request.status !== 'result_received') {
            throw new Error('章节事实提交前必须先完整保存模型响应');
        }
        return commitRequestRecords(ownerId, taskId, request, [
            ...facts.map(function(chapterFact) {
                return {
                    recordType: 'chapter_fact',
                    recordId: chapterFact.chapterFactId,
                    value: chapterFact
                };
            })
        ], taskPatch);
    }

    async function commitChapterFact(ownerId, taskId, request, chapterFact, taskPatch) {
        return commitChapterFacts(ownerId, taskId, request, [chapterFact], taskPatch);
    }

    async function commitRequestRecords(ownerId, taskId, request, records, taskPatch) {
        if (!request?.requestId || request.status !== 'result_received') {
            throw new Error('模型结果提交前必须先完整保存响应');
        }
        const committedRequest = Object.assign({}, request, {
            status: 'committed',
            committedAt: nowIso()
        });
        return writeRecords(ownerId, taskId, [
            ...(Array.isArray(records) ? records : []),
            { recordType: 'request', recordId: request.requestId, value: committedRequest }
        ], taskPatch);
    }

    async function readRecord(ownerId, taskId, recordType, recordId) {
        const envelope = await getIdb().get(recordKey(ownerId, taskId, recordType, recordId));
        return readEnvelopeValue(envelope, { ownerId, taskId, recordType });
    }

    function buildKnowledgeSnapshotAtomicRecord(snapshot) {
        if (!snapshot?.ownerId || !snapshot?.targetWorkId || !snapshot?.knowledgeSnapshotId) {
            throw new Error('知识快照缺少账号、目标作品或快照编号');
        }
        return {
            key: knowledgeSnapshotKey(snapshot.ownerId, snapshot.targetWorkId),
            value: createEnvelope('knowledge_snapshot', snapshot.ownerId, snapshot.sourceTaskId || '', snapshot, 1)
        };
    }

    async function saveKnowledgeSnapshot(snapshot) {
        const record = buildKnowledgeSnapshotAtomicRecord(snapshot);
        await getIdb().set(record.key, record.value);
        return loadKnowledgeSnapshot(snapshot.ownerId, snapshot.targetWorkId);
    }

    async function loadKnowledgeSnapshot(ownerId, targetWorkId) {
        const envelope = await getIdb().get(knowledgeSnapshotKey(ownerId, targetWorkId));
        return readEnvelopeValue(envelope, { ownerId, recordType: 'knowledge_snapshot' });
    }

    async function inspectStoragePersistence(options) {
        const storage = window.navigator?.storage;
        if (!storage) {
            return {
                supported: false,
                persisted: false,
                warning: '当前浏览器无法确认本机持久存储，长任务结果可能被浏览器自动清理'
            };
        }
        const estimate = typeof storage.estimate === 'function' ? await storage.estimate() : {};
        let persisted = typeof storage.persisted === 'function' ? await storage.persisted() : false;
        let requested = false;
        if (!persisted && options?.request === true && typeof storage.persist === 'function') {
            requested = true;
            persisted = await storage.persist();
        }
        const quota = Number(estimate?.quota || 0);
        const usage = Number(estimate?.usage || 0);
        return {
            supported: true,
            persisted: !!persisted,
            requested,
            quota,
            usage,
            remaining: Math.max(0, quota - usage),
            warning: persisted ? '' : '浏览器未授予持久存储，长任务结果可能被自动清理，请确认风险后再继续'
        };
    }

    async function ensureCapacity(requiredBytes) {
        const status = await inspectStoragePersistence();
        const required = Math.max(0, Number(requiredBytes || 0));
        if (status.quota > 0 && status.remaining < required) {
            const error = new Error('本机剩余空间不足，全文分析已在下一次模型调用前暂停');
            error.code = 'FULL_ANALYSIS_STORAGE_QUOTA';
            error.storage = status;
            throw error;
        }
        return status;
    }

    async function migrateStoredRecord(key) {
        const idb = getIdb();
        const legacy = await idb.get(String(key || ''));
        if (!legacy) return { migrated: false, reason: 'missing' };
        if (legacy.schemaVersion === SCHEMA_VERSION) return { migrated: false, reason: 'current' };
        const migrate = MIGRATIONS.get(legacy.schemaVersion);
        if (typeof migrate !== 'function') {
            const error = new Error('全文分析检查点版本不受支持，原数据未被覆盖');
            error.code = 'FULL_ANALYSIS_SCHEMA_MIGRATION_REQUIRED';
            throw error;
        }
        const migratedValue = migrate(clone(legacy.value));
        const next = createEnvelope(
            legacy.recordType,
            legacy.ownerId,
            legacy.taskId,
            migratedValue,
            Number(legacy.revision || 0) + 1,
            legacy.createdAt
        );
        const backupKey = String(key) + ':migration_backup:' + encodeURIComponent(String(legacy.schemaVersion));
        try {
            await idb.setMany([
                [backupKey, legacy],
                [String(key), next]
            ]);
            const verified = await idb.get(String(key));
            readEnvelopeValue(verified, {
                ownerId: legacy.ownerId,
                taskId: legacy.taskId || undefined,
                recordType: legacy.recordType
            });
            return { migrated: true, from: legacy.schemaVersion, to: SCHEMA_VERSION, backupKey };
        } catch(error) {
            await idb.set(String(key), legacy).catch(function(){});
            throw error;
        }
    }

    async function deleteTask(ownerId, taskId) {
        if (!String(taskId || '').trim() || String(taskId).includes('*')) {
            throw new Error('删除任务必须明确指定一个 taskId');
        }
        const idb = getIdb();
        const taskEnvelope = await getTaskEnvelope(ownerId, taskId);
        const task = readEnvelopeValue(taskEnvelope, { ownerId, taskId, recordType: 'task' });
        if (!task) return { deleted: false, taskId };
        const indexKey = taskIndexKey(ownerId);
        const index = await idb.get(indexKey);
        await idb.set(indexKey, (Array.isArray(index) ? index : []).filter(function(id) {
            return id !== taskId;
        }));
        for (const key of task.recordKeys || []) await idb.remove(key);
        return {
            deleted: true,
            taskId,
            retainedSourceSnapshotId: task.sourceSnapshotId,
            knowledgeSnapshotsUnaffected: true
        };
    }

    window.ZhiyuImportFullAnalysisCheckpointStore = {
        SCHEMA_VERSION,
        KEY_PREFIX,
        taskIndexKey,
        recordKey,
        sourceSnapshotKey,
        knowledgeSnapshotKey,
        createTaskBundle,
        loadTaskBundle,
        listTasks,
        writeRecords,
        saveRequest,
        saveResponsePayload,
        commitRequestRecords,
        commitChapterFacts,
        commitChapterFact,
        readRecord,
        buildKnowledgeSnapshotAtomicRecord,
        saveKnowledgeSnapshot,
        loadKnowledgeSnapshot,
        inspectStoragePersistence,
        ensureCapacity,
        migrateStoredRecord,
        deleteTask
    };
})(window);
