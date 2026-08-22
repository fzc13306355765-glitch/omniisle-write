(function () {
  'use strict';

  function state() {
    return window.ZHIYU_APP_STATE || window.AppState || {};
  }

  function toast() {
    return window.ZHIYU_TOAST || window.Toast || {};
  }

  function modal() {
    return window.ZHIYU_MODAL || window.Modal || {};
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function setText(id, text) {
    const el = byId(id);
    if (el) el.textContent = text;
  }

  function resetPolishButtons() {
    const btnGen = byId('btnGen');
    const btnConfirm = byId('btnConfirm');
    const btnRegen = byId('btnRegen');
    const btnRetry = byId('btnRetry');

    if (btnGen) btnGen.style.display = 'none';
    if (btnConfirm) btnConfirm.style.display = 'inline-block';
    if (typeof window.setConfirmUseState === 'function') {
      window.setConfirmUseState('ready');
    }
    if (btnRegen) {
      btnRegen.style.display = 'none';
      btnRegen.textContent = '🔄 重新润色';
      btnRegen.dataset.mode = '';
    }
    if (btnRetry) {
      btnRetry.style.display = 'none';
      btnRetry.dataset.mode = '';
    }
  }

  function syncPolishSelectionPreview(text) {
    setText('polishSelectedText', text || '');
    setText('polishWordCount', String((text || '').length));
  }

  function capturePolishSelectionSnapshot(editor, selection) {
    const capture = window.ZHIYU_REWRITE_MODAL_UI?.captureRewriteSelection;
    if (!editor || typeof capture !== 'function') return null;
    const snapshot = capture(editor, selection);
    if (!snapshot) return null;
    return {
      ...snapshot,
      text: snapshot.selectedText,
      sourceId: editor.id || 'resultBox'
    };
  }

  function resolvePolishSelectionSnapshot(selectionState, editor) {
    const resolve = window.resolveRewriteSelectionSnapshot;
    if (!selectionState || !editor || typeof resolve !== 'function') return null;
    const resolved = resolve({
      fullContent: selectionState.fullContent,
      selectedText: selectionState.selectedText || selectionState.text,
      selectionStart: selectionState.selectionStart,
      selectionEnd: selectionState.selectionEnd
    }, editor.textContent || '');
    if (!resolved) return null;
    return {
      ...resolved,
      selectionStart: selectionState.selectionStart,
      selectionEnd: selectionState.selectionEnd,
      professionalFrom: selectionState.professionalFrom,
      professionalTo: selectionState.professionalTo,
      range: selectionState.range || null
    };
  }

  function storePolishSelectionSnapshot(appState, snapshot) {
    if (!appState || !snapshot) return null;
    appState.selection = snapshot;
    syncPolishSelectionPreview(snapshot.selectedText);
    return snapshot;
  }

  function openPolishModalFromCurrentSelection() {
    const appState = state();
    if (!appState.chapter?.book) {
      toast().warn?.('请先选择章节');
      return false;
    }
    const editor = byId('resultBox');
    const sel = window.getSelection();
    const snapshot = capturePolishSelectionSnapshot(editor, sel);
    if (!snapshot) {
      toast().warn?.('请先选中要润色的文本');
      return false;
    }
    storePolishSelectionSnapshot(appState, snapshot);
    modal().open?.('polishModal');
    return true;
  }

  function openPolishModalFromStoredSelection() {
    const appState = state();
    const editor = byId('resultBox');
    const stored = appState.selection || {};
    let snapshot = resolvePolishSelectionSnapshot(stored, editor)
      ? {
          ...stored,
          selectedText: stored.selectedText || stored.text,
          text: stored.selectedText || stored.text
        }
      : null;
    if (!snapshot && stored.range) {
      snapshot = capturePolishSelectionSnapshot(editor, {
        rangeCount: 1,
        isCollapsed: false,
        getRangeAt: function() { return stored.range; }
      });
    }
    if (!snapshot) {
      toast().warn?.('请先选中要优化的文本');
      return false;
    }
    storePolishSelectionSnapshot(appState, snapshot);
    modal().open?.('polishModal');
    return true;
  }

  function clearPolishSession() {
    window.clearPolishSelectionHighlight?.();
    window._polishOriginal = null;
    window._polishResult = null;
    window._polishMark = null;
    window._polishRange = null;
    window._polishSession = null;
  }

  function isCurrentPolishSession(session) {
    const chapter = state().chapter || {};
    return !!session
      && chapter.book === session.bookName
      && chapter.vi === session.vi
      && chapter.ci === session.ci;
  }

  function finalizePolishSession(useResult, options) {
    const session = window._polishSession;
    if (!session?.editor) return false;
    if (options?.handle && session.handle !== options.handle) return false;
    if (session.running && !options?.allowRunning) {
      if (options?.notify) toast().warn?.('局部润色仍在进行，请稍候');
      return false;
    }
    if (!isCurrentPolishSession(session)) {
      clearPolishSession();
      return false;
    }
    let originalRestored = true;
    if (!useResult || !session.result) {
      originalRestored = window.restorePolishSessionOriginal?.(session) !== false;
    }
    if (!originalRestored) {
      clearPolishSession();
      if (options?.notify) {
        toast().warn?.('正文已发生变化，已放弃旧润色结果，未覆盖当前内容');
      }
      return true;
    }
    const combined = session.editor.textContent || '';
    session.editor.style.background = '';
    session.editor.setAttribute('contenteditable', 'true');
    window.updateChapWordCount?.(combined);
    if (typeof window.Event === 'function') {
      session.editor.dispatchEvent?.(new window.Event('input', { bubbles: true }));
    }
    clearPolishSession();
    resetPolishButtons();
    if (options?.notify) {
      if (useResult) toast().success?.('已应用润色内容');
      else toast().success?.('已放弃润色，原文已恢复');
    }
    return true;
  }

  function restorePolishOriginal(handle) {
    return finalizePolishSession(false, { notify: false, handle, allowRunning: true });
  }

  function cancelPolish(button) {
    finalizePolishSession(false, { notify: true });
    if (button) button.dataset.mode = '';
    return true;
  }

  function openRepolishModal() {
    const session = window._polishSession;
    if (!isCurrentPolishSession(session) || !session?.editor) {
      clearPolishSession();
      resetPolishButtons();
      return false;
    }
    if (session.mode === 'professional') {
      if (window.restorePolishSessionOriginal?.(session) === false) {
        clearPolishSession();
        resetPolishButtons();
        toast().warn?.('正文已发生变化，不能用旧润色结果覆盖当前内容');
        return false;
      }
      session.currentFrom = session.professionalFrom;
      session.currentTo = session.professionalTo;
      if (!window.refreshPolishSelectionHighlight?.(session)) {
        clearPolishSession();
        resetPolishButtons();
        return false;
      }
    } else {
      if (window.restorePolishSessionOriginal?.(session) === false) {
        clearPolishSession();
        resetPolishButtons();
        toast().warn?.('正文已发生变化，不能用旧润色结果覆盖当前内容');
        return false;
      }
      session.currentRange = window.createPolishDomRangeFromTextOffsets?.(
        session.editor,
        session.selectionStart,
        session.selectionEnd
      ) || null;
      if (!session.currentRange
        || !window.refreshPolishSelectionHighlight?.(session, session.currentRange)) {
        clearPolishSession();
        resetPolishButtons();
        return false;
      }
    }
    session.editor.setAttribute('contenteditable', 'false');
    session.result = '';
    window._polishResult = null;
    const appState = state();
    storePolishSelectionSnapshot(appState, {
      text: session.selectedText,
      selectedText: session.selectedText,
      fullContent: session.fullContent,
      selectionStart: session.selectionStart,
      selectionEnd: session.selectionEnd,
      professionalFrom: session.professionalFrom,
      professionalTo: session.professionalTo,
      sourceId: 'resultBox',
      range: session.mode === 'dom' ? session.currentRange?.cloneRange?.() || null : null
    });
    const instruction = byId('polishInstruction');
    if (instruction) instruction.value = '';
    modal().open?.('polishModal');
    resetPolishButtons();
    return true;
  }

  function confirmPolish() {
    return finalizePolishSession(true, { notify: true });
  }

  function finalizePolishBeforeChapterSave() {
    if (window._polishSession?.running) return false;
    return finalizePolishSession(true, { notify: false });
  }

  function finalizeLocalEditSessionsBeforeSave() {
    window.finalizeRewriteBeforeChapterSave?.();
    if (window._polishSession && !window._polishSession.running) {
      finalizePolishBeforeChapterSave();
    }
  }

  function bindPolishModalUi() {
    byId('btnPolish')?.addEventListener('click', openPolishModalFromCurrentSelection);
    byId('toolbarPolish')?.addEventListener('click', openPolishModalFromStoredSelection);
    byId('btnSaveNewChapter')?.addEventListener('click', finalizePolishBeforeChapterSave, true);
  }

  window.ZHIYU_POLISH_MODAL_UI = {
    bindPolishModalUi,
    resetPolishButtons,
    syncPolishSelectionPreview,
    capturePolishSelectionSnapshot,
    resolvePolishSelectionSnapshot,
    storePolishSelectionSnapshot,
    openPolishModalFromCurrentSelection,
    openPolishModalFromStoredSelection,
    clearPolishSession,
    isCurrentPolishSession,
    finalizePolishSession,
    restorePolishOriginal,
    cancelPolish,
    openRepolishModal,
    confirmPolish,
    finalizePolishBeforeChapterSave,
    finalizeLocalEditSessionsBeforeSave,
  };
  window.finalizeLocalEditSessionsBeforeSave = finalizeLocalEditSessionsBeforeSave;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindPolishModalUi, { once: true });
  } else {
    bindPolishModalUi();
  }
})();
