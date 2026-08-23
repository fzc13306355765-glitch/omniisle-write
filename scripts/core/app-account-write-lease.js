// Prevents two tabs of the same account from overwriting whole local snapshots.
(function(window, document) {
    'use strict';

    const VERSION = 1;
    const LEASE_KEY = 'zhiyu_account_writer_lease_v1';
    const CHANNEL_NAME = 'zhiyu-account-writer-lease-v1';
    const settings = window.ZHIYU_ACCOUNT_WRITER_LEASE_TEST_CONFIG || {};
    const LEASE_TTL_MS = Math.max(1000, Number(settings.ttlMs || 45000));
    const HEARTBEAT_MS = Math.max(250, Math.min(Number(settings.heartbeatMs || 10000), LEASE_TTL_MS / 3));
    const tabId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : null;
    let currentUid = '';
    let currentLeaseId = '';
    let heartbeatTimer = null;
    let lastBlockedNoticeAt = 0;
    let activeWriteCount = 0;
    let pendingTakeoverTabId = '';
    let writeDataReady = false;
    let refreshPromise = null;
    let acquirePromise = null;
    let acquireUid = '';
    let acquisitionGeneration = 0;
    let recoveryNonce = '';
    const staleAccountSnapshots = new Set();

    function isOperationTutorialMode() {
        return /(?:[?&])tutorial(?:=|&|$)/.test(String(window.location?.search || ''))
            || window.ZHIYU_OPERATION_TUTORIAL?.isActive?.() === true
            || document.body?.classList.contains('zhiyu-outline-tutorial-active');
    }

    function normalizeUid(uid) {
        return window.AccountDataScope?.normalizeUid?.(uid) || String(uid || 'guest');
    }

    function storageKey(uid) {
        return window.AccountDataScope.key(LEASE_KEY, normalizeUid(uid));
    }

    function lockName(uid) {
        return 'zhiyu-account-writer-lease:' + normalizeUid(uid);
    }

    function fenceKey(uid) {
        return window.AccountDataScope.key('zhiyu_account_writer_fence_v1', normalizeUid(uid));
    }

    function randomId() {
        return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
    }

    function readLease(uid) {
        try {
            const record = JSON.parse(localStorage.getItem(storageKey(uid)) || 'null');
            if (!record || Number(record.version) !== VERSION
                || String(record.uid || '') !== normalizeUid(uid)
                || !record.tabId || !record.leaseId
                || !Number.isFinite(Number(record.expiresAt))) return null;
            return record;
        } catch (error) {
            return null;
        }
    }

    function isLive(record, now) {
        return !!record && Number(record.expiresAt || 0) > Number(now || Date.now());
    }

    function owns(record, uid) {
        return !!record
            && String(record.uid || '') === normalizeUid(uid)
            && record.tabId === tabId
            && record.leaseId === currentLeaseId;
    }

    function canWrite(uid) {
        const expectedUid = normalizeUid(uid === undefined
            ? (window.AccountDataScope?.getActiveUid?.() || currentUid || 'guest')
            : uid);
        if (!currentLeaseId || !writeDataReady || expectedUid !== currentUid) return false;
        const record = readLease(expectedUid);
        return owns(record, expectedUid) && isLive(record);
    }

    function broadcast(type, uid, leaseId, extra) {
        try {
            channel?.postMessage?.({
                version: VERSION,
                type,
                uid: normalizeUid(uid),
                tabId,
                leaseId: String(leaseId || ''),
                at: Date.now(),
                ...(extra || {})
            });
        } catch (error) {}
    }

    function ensureNotice() {
        if (!document?.body) return null;
        let notice = document.getElementById('accountWriterReadOnlyNotice');
        if (notice) return notice;
        notice = document.createElement('div');
        notice.id = 'accountWriterReadOnlyNotice';
        notice.setAttribute('role', 'status');
        notice.setAttribute('aria-live', 'polite');
        notice.style.cssText = 'position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:10050;max-width:min(92vw,720px);padding:10px 14px;border:1px solid #d9a441;border-radius:10px;background:#fff8e7;color:#6f4b00;box-shadow:0 6px 24px rgba(0,0,0,.14);font-size:14px;display:none;align-items:center;gap:10px;';
        const text = document.createElement('span');
        text.textContent = '此账号已在另一个标签页编辑。本页暂为只读，避免覆盖较新的作品。';
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = '接管编辑';
        button.style.cssText = 'border:1px solid currentColor;border-radius:7px;background:#fff;padding:5px 10px;cursor:pointer;';
        button.addEventListener('click', function() {
            button.disabled = true;
            requestTakeover(window.AccountDataScope?.getActiveUid?.() || currentUid)
                .finally(function() { button.disabled = false; });
        });
        notice.append(text, button);
        document.body.appendChild(notice);
        return notice;
    }

    function updateUi(uid) {
        const expectedUid = normalizeUid(uid || window.AccountDataScope?.getActiveUid?.() || currentUid || 'guest');
        const writable = canWrite(expectedUid);
        if (document?.documentElement) document.documentElement.dataset.accountWriteMode = writable ? 'writer' : 'readonly';
        const notice = ensureNotice();
        if (notice) notice.style.display = writable ? 'none' : 'flex';
        const editor = document?.getElementById?.('resultBox');
        if (editor) {
            if (writable) {
                if (editor.dataset.writerLeaseReadonly === '1') {
                    editor.setAttribute('contenteditable', editor.dataset.writerLeasePreviousEditable || 'true');
                    delete editor.dataset.writerLeaseReadonly;
                    delete editor.dataset.writerLeasePreviousEditable;
                }
                editor.removeAttribute('aria-readonly');
            } else {
                if (editor.dataset.writerLeaseReadonly !== '1') {
                    editor.dataset.writerLeasePreviousEditable = editor.getAttribute('contenteditable') || 'true';
                }
                editor.dataset.writerLeaseReadonly = '1';
                editor.setAttribute('contenteditable', 'false');
                editor.setAttribute('aria-readonly', 'true');
            }
        }
        try {
            window.dispatchEvent(new CustomEvent('zhiyu:account-writer-change', {
                detail: { uid: expectedUid, writable, tabId, leaseId: currentLeaseId }
            }));
        } catch (error) {}
        return writable;
    }

    function notifyBlocked(message) {
        updateUi(window.AccountDataScope?.getActiveUid?.() || currentUid);
        const now = Date.now();
        if (now - lastBlockedNoticeAt > 3000) {
            lastBlockedNoticeAt = now;
            window.ZHIYU_TOAST?.warn?.(message || '此标签页为只读。请在顶部选择“接管编辑”后再保存。');
        }
        return false;
    }

    function assertCanWrite(uid, options) {
        if (isOperationTutorialMode()) return false;
        if (canWrite(uid)) return true;
        return options?.silent ? false : notifyBlocked(options?.message);
    }

    function beginWrite(uid, options) {
        const expectedUid = normalizeUid(uid);
        if (!assertCanWrite(expectedUid, options)) return null;
        activeWriteCount += 1;
        return {
            uid: expectedUid,
            tabId,
            leaseId: currentLeaseId,
            fenceKey: fenceKey(expectedUid)
        };
    }

    function beginRecoveryWrite(uid) {
        const expectedUid = normalizeUid(uid);
        const record = readLease(expectedUid);
        if (writeDataReady || expectedUid !== currentUid || !owns(record, expectedUid) || !isLive(record)) return null;
        recoveryNonce = randomId();
        activeWriteCount += 1;
        return {
            uid: expectedUid,
            tabId,
            leaseId: currentLeaseId,
            fenceKey: fenceKey(expectedUid),
            recoveryNonce
        };
    }

    function isWriteTokenCurrent(token) {
        if (!token || token.tabId !== tabId || token.leaseId !== currentLeaseId) return false;
        if (token.recoveryNonce) {
            const record = readLease(token.uid);
            return token.recoveryNonce === recoveryNonce
                && token.uid === currentUid
                && owns(record, token.uid)
                && isLive(record);
        }
        return canWrite(token.uid);
    }

    function endWrite(token) {
        if (token?.recoveryNonce && token.recoveryNonce === recoveryNonce) recoveryNonce = '';
        if (token?.tabId === tabId && activeWriteCount > 0) activeWriteCount -= 1;
        if (activeWriteCount === 0 && pendingTakeoverTabId) {
            pendingTakeoverTabId = '';
            window.captureCurrentChapterEmergencyDraft?.();
            release(token?.uid || currentUid, { reason: 'takeover-after-write' });
        }
        return true;
    }

    async function withLeaseLock(uid, task) {
        if (window.navigator?.locks?.request) {
            return window.navigator.locks.request(lockName(uid), { mode: 'exclusive' }, task);
        }
        return task();
    }

    function writeAndVerify(record) {
        try {
            localStorage.setItem(storageKey(record.uid), JSON.stringify(record));
            const verified = readLease(record.uid);
            return !!verified && verified.tabId === record.tabId && verified.leaseId === record.leaseId;
        } catch (error) {
            return false;
        }
    }

    async function persistFence(record) {
        const idb = window.ZHIYU_IDB;
        if (!idb?.setMany || !idb?.get) return false;
        const key = fenceKey(record.uid);
        const value = {
            version: VERSION,
            uid: record.uid,
            tabId: record.tabId,
            leaseId: record.leaseId,
            acquiredAt: record.acquiredAt,
            updatedAt: Date.now()
        };
        await idb.setMany([[key, value]]);
        const verified = await idb.get(key);
        return String(verified?.uid || '') === String(record.uid)
            && String(verified?.tabId || '') === tabId
            && String(verified?.leaseId || '') === String(record.leaseId);
    }

    async function acquireOnce(uid, options, generation) {
        const expectedUid = normalizeUid(uid);
        const force = options?.force === true;
        const acquisition = await withLeaseLock(expectedUid, async function() {
            const existing = readLease(expectedUid);
            // 只要外部标签的租约仍存活，就绝不能强抢。
            // 正常接管由旧标签显式释放；旧标签崩溃则等待租约自然过期。
            if (isLive(existing) && existing.tabId !== tabId) {
                staleAccountSnapshots.add(expectedUid);
                return { acquired: false, refreshRequired: false };
            }
            const refreshRequired = staleAccountSnapshots.has(expectedUid)
                || (!!existing && existing.tabId !== tabId);
            const leaseId = existing?.tabId === tabId && isLive(existing)
                ? String(existing.leaseId)
                : randomId();
            const now = Date.now();
            const record = {
                version: VERSION,
                uid: expectedUid,
                tabId,
                leaseId,
                acquiredAt: existing?.tabId === tabId ? Number(existing.acquiredAt || now) : now,
                updatedAt: now,
                expiresAt: now + LEASE_TTL_MS
            };
            if (!writeAndVerify(record)) return { acquired: false, refreshRequired: false };
            // 本机租约已经写入后立即登记本次 leaseId，使后续 heartbeat 能在
            // IndexedDB 围栏落盘及持久状态重载期间继续续租，避免短 TTL 下形成幽灵租约。
            currentUid = expectedUid;
            currentLeaseId = leaseId;
            writeDataReady = false;
            if (!await persistFence(record)) {
                const latest = readLease(expectedUid);
                if (latest?.tabId === tabId && latest.leaseId === leaseId) {
                    try { localStorage.removeItem(storageKey(expectedUid)); } catch(error) {}
                }
                if (currentLeaseId === leaseId) currentLeaseId = '';
                return { acquired: false, refreshRequired: false, leaseId };
            }
            if (generation !== acquisitionGeneration) {
                const latest = readLease(expectedUid);
                if (latest?.tabId === tabId && latest.leaseId === leaseId) {
                    try { localStorage.removeItem(storageKey(expectedUid)); } catch(error) {}
                }
                if (currentLeaseId === leaseId) currentLeaseId = '';
                return { acquired: false, refreshRequired: false, leaseId };
            }
            const verifiedLease = readLease(expectedUid);
            if (verifiedLease?.tabId !== tabId || verifiedLease.leaseId !== leaseId || !isLive(verifiedLease)) {
                if (currentLeaseId === leaseId) currentLeaseId = '';
                return { acquired: false, refreshRequired: false, leaseId };
            }
            writeDataReady = !refreshRequired;
            broadcast(force ? 'takeover-complete' : 'acquired', expectedUid, leaseId);
            return { acquired: true, refreshRequired, leaseId };
        });
        if (!acquisition?.acquired && currentUid === expectedUid
            && (!acquisition?.leaseId || currentLeaseId === acquisition.leaseId)) {
            currentLeaseId = '';
            writeDataReady = false;
        }
        if (acquisition?.acquired && acquisition.refreshRequired) {
            const leaseId = currentLeaseId;
            const refresher = window.reloadAccountWriterPersistentState;
            if (typeof refresher !== 'function') {
                release(expectedUid, { reason: 'writer-refresh-unavailable' });
                updateUi(expectedUid);
                return false;
            }
            refreshPromise = Promise.resolve(refresher(expectedUid, { tabId, leaseId }));
            let refreshed = false;
            try {
                refreshed = await refreshPromise === true;
            } catch(error) {
                refreshed = false;
            } finally {
                refreshPromise = null;
            }
            const latest = readLease(expectedUid);
            if (generation !== acquisitionGeneration
                || !refreshed || !owns(latest, expectedUid) || !isLive(latest)) {
                release(expectedUid, { reason: 'writer-refresh-failed' });
                updateUi(expectedUid);
                return false;
            }
            // 持久快照已经重载，此时只在当前仍持有的租约内恢复紧急草稿。
            // UI 仍保持只读，后台同步也已由 reloadAccountWriterPersistentState 停止。
            const recoveryToken = beginRecoveryWrite(expectedUid);
            if (!recoveryToken) {
                release(expectedUid, { reason: 'emergency-draft-recovery-token-failed' });
                updateUi(expectedUid);
                return false;
            }
            let recoverySucceeded = false;
            try {
                const emergencyResult = await window.recoverEmergencyDrafts?.({
                    expectedUid,
                    books: window.ZHIYU_STORAGE_SERVICE?.getBooks?.() || {},
                    writeToken: recoveryToken
                });
                const flushed = await window.ZHIYU_LARGE_LOCAL_STORE?.flush?.();
                if (flushed === false) throw new Error('紧急草稿尚未安全写入本机');
                const afterRecovery = readLease(expectedUid);
                if (!owns(afterRecovery, expectedUid) || !isLive(afterRecovery)) {
                    throw new Error('紧急草稿恢复期间编辑权已变化');
                }
                if (Number(emergencyResult?.retained || 0) > 0 || Number(emergencyResult?.invalid || 0) > 0) {
                    window.ZHIYU_TOAST?.warn?.('检测到尚不能自动合并的紧急草稿，记录已保留，请打开对应章节核对。');
                }
                recoverySucceeded = true;
            } catch(error) {
                recoverySucceeded = false;
            } finally {
                endWrite(recoveryToken);
            }
            const afterRecovery = readLease(expectedUid);
            if (!recoverySucceeded || !owns(afterRecovery, expectedUid) || !isLive(afterRecovery)) {
                writeDataReady = false;
                release(expectedUid, { reason: 'emergency-draft-recovery-failed' });
                updateUi(expectedUid);
                return false;
            }
            writeDataReady = true;
            staleAccountSnapshots.delete(expectedUid);
            broadcast('writer-ready', expectedUid, leaseId);
        }
        updateUi(expectedUid);
        return acquisition?.acquired === true && canWrite(expectedUid);
    }

    function acquire(uid, options) {
        if (isOperationTutorialMode()) return Promise.resolve(true);
        const expectedUid = normalizeUid(uid);
        if (acquirePromise) {
            if (acquireUid === expectedUid) return acquirePromise;
            return acquirePromise.catch(function() { return false; }).then(function() {
                return acquire(expectedUid, options);
            });
        }
        acquireUid = expectedUid;
        const generation = acquisitionGeneration;
        const running = acquireOnce(expectedUid, options, generation).finally(function() {
            if (acquirePromise === running) {
                acquirePromise = null;
                acquireUid = '';
            }
        });
        acquirePromise = running;
        return running;
    }

    async function ensure(uid, options) {
        if (isOperationTutorialMode()) return true;
        const expectedUid = normalizeUid(uid);
        if (currentUid && currentUid !== expectedUid) release(currentUid, { reason: 'account-switch' });
        currentUid = expectedUid;
        if (canWrite(expectedUid)) return true;
        return acquire(expectedUid, options);
    }

    function heartbeat() {
        if (isOperationTutorialMode()) return false;
        if (!currentUid) return false;
        if (acquirePromise && !currentLeaseId) return false;
        const record = readLease(currentUid);
        if (!owns(record, currentUid)) {
            currentLeaseId = '';
            writeDataReady = false;
            staleAccountSnapshots.add(currentUid);
            updateUi(currentUid);
            if (!isLive(record) || record?.tabId === tabId) {
                void acquire(currentUid, { silent: true }).catch(function() {});
            }
            return false;
        }
        const now = Date.now();
        const next = { ...record, updatedAt: now, expiresAt: now + LEASE_TTL_MS };
        if (!writeAndVerify(next)) {
            currentLeaseId = '';
            writeDataReady = false;
            updateUi(currentUid);
            return false;
        }
        broadcast('heartbeat', currentUid, currentLeaseId, { expiresAt: next.expiresAt });
        return true;
    }

    function startHeartbeat() {
        if (heartbeatTimer) return;
        heartbeatTimer = window.setInterval(heartbeat, HEARTBEAT_MS);
    }

    function release(uid, options) {
        if (isOperationTutorialMode()) return true;
        acquisitionGeneration += 1;
        const expectedUid = normalizeUid(uid || currentUid || 'guest');
        const leaseId = currentLeaseId;
        const record = readLease(expectedUid);
        if (record?.tabId === tabId && record.leaseId === leaseId) {
            try {
                localStorage.removeItem(storageKey(expectedUid));
                broadcast('released', expectedUid, leaseId, { reason: String(options?.reason || '') });
            } catch (error) {}
        }
        if (currentUid === expectedUid) currentLeaseId = '';
        if (currentUid === expectedUid) writeDataReady = false;
        updateUi(expectedUid);
        return true;
    }

    async function requestTakeover(uid) {
        const expectedUid = normalizeUid(uid || currentUid || 'guest');
        const existing = readLease(expectedUid);
        broadcast('takeover-request', expectedUid, existing?.leaseId || '', { targetTabId: existing?.tabId || '' });
        for (let attempt = 0; attempt < 20; attempt += 1) {
            await new Promise(resolve => window.setTimeout(resolve, 250));
            const latest = readLease(expectedUid);
            if (!isLive(latest) || latest.tabId === tabId) break;
        }
        const latest = readLease(expectedUid);
        if (isLive(latest) && latest.tabId !== tabId) {
            notifyBlocked('另一个标签页仍在保存，请等待保存完成后再接管。');
            return false;
        }
        const acquired = await acquire(expectedUid, { force: true });
        if (acquired) window.ZHIYU_TOAST?.success?.('已接管此账号的本机编辑权。');
        else notifyBlocked('接管失败，请稍后重试。');
        return acquired;
    }

    function handleLeaseMessage(message) {
        if (!message || Number(message.version) !== VERSION || !message.uid || message.tabId === tabId) return;
        if (normalizeUid(message.uid) !== currentUid) return;
        if (message.type === 'takeover-request' && message.targetTabId === tabId && canWrite(currentUid)) {
            if (activeWriteCount > 0) {
                pendingTakeoverTabId = String(message.tabId || 'pending');
                broadcast('takeover-waiting', currentUid, currentLeaseId, { targetTabId: message.tabId });
            } else {
                window.captureCurrentChapterEmergencyDraft?.();
                release(currentUid, { reason: 'takeover-request' });
            }
            return;
        }
        if (['acquired', 'takeover-complete', 'released', 'heartbeat', 'writer-ready'].includes(message.type)) {
            const record = readLease(currentUid);
            if (!owns(record, currentUid)) {
                currentLeaseId = '';
                writeDataReady = false;
                staleAccountSnapshots.add(currentUid);
            }
            updateUi(currentUid);
        }
    }

    channel?.addEventListener?.('message', function(event) { handleLeaseMessage(event.data); });
    window.addEventListener?.('storage', function(event) {
        if (currentUid && event.key === storageKey(currentUid)) {
            const record = readLease(currentUid);
            if (!owns(record, currentUid)) {
                currentLeaseId = '';
                writeDataReady = false;
                staleAccountSnapshots.add(currentUid);
            }
            updateUi(currentUid);
        }
    });
    window.addEventListener?.('pagehide', function(event) {
        if (!event?.persisted) {
            window.captureCurrentChapterEmergencyDraft?.();
            release(currentUid, { reason: 'pagehide' });
        }
    });
    document?.addEventListener?.('DOMContentLoaded', function() { updateUi(currentUid || 'guest'); });
    document?.addEventListener?.('beforeinput', function(event) {
        if (canWrite(window.AccountDataScope?.getActiveUid?.() || currentUid)) return;
        const target = event.target;
        if (target?.id === 'resultBox' || target?.closest?.('#resultBox')) {
            event.preventDefault();
            notifyBlocked();
        }
    }, true);

    startHeartbeat();
    window.ZHIYU_ACCOUNT_WRITE_LEASE = {
        version: VERSION,
        tabId,
        ensure,
        acquire,
        release,
        requestTakeover,
        canWrite,
        assertCanWrite,
        beginWrite,
        isWriteTokenCurrent,
        endWrite,
        notifyBlocked,
        heartbeat,
        updateUi,
        readLease,
        storageKey,
        fenceKey,
        getState() {
            return {
                uid: currentUid,
                tabId,
                leaseId: currentLeaseId,
                writable: canWrite(currentUid),
                activeWriteCount,
                refreshing: !!refreshPromise
            };
        }
    };
    window.ensureAccountWriteLease = ensure;
    window.releaseAccountWriteLease = release;
    window.requestAccountWriteTakeover = requestTakeover;
    window.assertAccountWriteLease = assertCanWrite;
    window.ZHIYU_ACCOUNT_WRITE_LEASE_READY = true;
})(window, document);
