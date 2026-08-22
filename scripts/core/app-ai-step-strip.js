(function(window) {
    'use strict';
    function setAIStepStrip(id, text, active) {
        const strip = document.getElementById(id);
        if (!strip) return;
        const label = strip.querySelector('[data-ai-step-text]') || strip;
        label.textContent = text || '正在处理...';
        strip.classList.toggle('active', !!active && !!text);
    }
    function setOutlineStep(text, active) { setAIStepStrip('outlineStepStrip', text, active); }
    function setChapterStep(text, active) { setAIStepStrip('chapterStepStrip', text, active); }
    function setFineOutlineStep(text, active) { setAIStepStrip('fineOutlineStepStrip', text, active); }
    function setDecomposeStep(text, active) { setAIStepStrip('decomposeStepStrip', text, active); }
    Object.assign(window, { setAIStepStrip, setOutlineStep, setChapterStep, setFineOutlineStep, setDecomposeStep });
})(window);
