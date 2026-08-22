(function(window) {
    'use strict';
    const MEMORY_PROFILES = Object.freeze({
        normalOutline: Object.freeze({ createEventIndex: false, updateEventIndex: false }),
        advancedOutline: Object.freeze({ createEventIndex: true, updateEventIndex: true }),
        advancedStage: Object.freeze({ createEventIndex: true, updateEventIndex: true }),
        decomposeSetting: Object.freeze({ createEventIndex: false, updateEventIndex: false }),
        chapter: Object.freeze({ createEventIndex: false, updateEventIndex: 'existing-advanced-only' }),
    });
    function getMemoryProfile(name) { return MEMORY_PROFILES[name] || MEMORY_PROFILES.chapter; }
    function isEventIndexEnabledForBook(book) {
        const policy = book?.memoryPolicy;
        if (!policy?.eventIndexEnabled || policy.source === 'normal-outline') return false;
        const outlineUpdatedAt = Date.parse(book?.outline?.updatedAt || '');
        const policyUpdatedAt = Date.parse(policy.updatedAt || '');
        // 旧作品切回普通大纲时可能只更新了大纲时间，没有清掉高级资料标记。
        if (Number.isFinite(outlineUpdatedAt) && Number.isFinite(policyUpdatedAt) && outlineUpdatedAt > policyUpdatedAt) {
            return false;
        }
        return true;
    }
    function setEventIndexPolicy(book, enabled, source) {
        if (!book || typeof book !== 'object') return false;
        book.memoryPolicy = { ...(book.memoryPolicy || {}), schemaVersion: 2, eventIndexEnabled: enabled === true, source: source || '', updatedAt: new Date().toISOString() };
        return true;
    }
    Object.assign(window, { MEMORY_PROFILES, getMemoryProfile, isEventIndexEnabledForBook, setEventIndexPolicy });
})(window);
