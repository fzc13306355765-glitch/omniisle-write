(function(window, document) {
    'use strict';

    const ZERO_ARGUMENT_CALLS = new Set([
        'goToHome',
        'openUserPanel',
        'stopOGGeneration',
        'stopDCGeneration',
        'stopAPGeneration',
        'closeMem',
        'openLinkMemorySelector',
        'openRefChapterSelector',
        'openLinkMemoryForRewrite',
        'closeMemoryEditor',
        'toggleFavTemplate',
        'openAdvancedOutlinePicker',
        'openAdvancedOutlineLinkSelector',
        'openOutlineTemplateSelector',
        'openOutlineFunctionLinkSelector',
        'openOGOutlineFileModal'
    ]);
    const STRING_ARGUMENT_CALLS = new Set([
        'setRewriteDirection'
    ]);
    const TEMPLATE_CALLS = new Map([
        [
            "openTemplateSelector({context:'chapter',subCategories:['正文','续写']})",
            { context: 'chapter', subCategories: ['正文', '续写'] }
        ],
        [
            "openTemplateSelector({context:'script',subCategory:'分镜'})",
            { context: 'script', subCategory: '分镜' }
        ]
    ]);

    function staticHandlerSource(element, attribute) {
        return String(element.getAttribute(attribute) || '').trim().replace(/;$/, '');
    }

    function callNamed(name, args) {
        const handler = window[name];
        if (typeof handler !== 'function') throw new Error('静态按钮处理函数不可用：' + name);
        return handler(...args);
    }

    function runStaticClick(source, event) {
        if (source === 'event.stopPropagation()') {
            event.stopPropagation();
            return;
        }

        const modalMatch = source.match(/^Modal\.(open|close)\('([A-Za-z0-9_-]+)'\)$/);
        if (modalMatch) {
            const method = window.Modal?.[modalMatch[1]];
            if (typeof method !== 'function') throw new Error('弹窗处理函数不可用：Modal.' + modalMatch[1]);
            method(modalMatch[2]);
            return;
        }

        const hideMatch = source.match(
            /^document\.getElementById\('([A-Za-z0-9_-]+)'\)\.style\.display='none'$/
        );
        if (hideMatch) {
            const target = document.getElementById(hideMatch[1]);
            if (target) target.style.display = 'none';
            return;
        }

        const clickMatch = source.match(
            /^document\.getElementById\('([A-Za-z0-9_-]+)'\)\.click\(\)$/
        );
        if (clickMatch) {
            document.getElementById(clickMatch[1])?.click();
            return;
        }

        const focusMatch = source.match(
            /^document\.getElementById\('([A-Za-z0-9_-]+)'\)\?\.focus\(\)$/
        );
        if (focusMatch) {
            document.getElementById(focusMatch[1])?.focus();
            return;
        }

        if (TEMPLATE_CALLS.has(source)) {
            callNamed('openTemplateSelector', [TEMPLATE_CALLS.get(source)]);
            return;
        }

        const zeroMatch = source.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\(\)$/);
        if (zeroMatch && ZERO_ARGUMENT_CALLS.has(zeroMatch[1])) {
            callNamed(zeroMatch[1], []);
            return;
        }

        const stringMatch = source.match(
            /^([A-Za-z_$][A-Za-z0-9_$]*)\('([A-Za-z0-9_-]+)'\)$/
        );
        if (stringMatch && STRING_ARGUMENT_CALLS.has(stringMatch[1])) {
            callNamed(stringMatch[1], [stringMatch[2]]);
            return;
        }

        throw new Error('未登记的静态点击处理：' + source);
    }

    const clickElements = Array.from(document.querySelectorAll('[data-zhiyu-static-click]'));
    clickElements.forEach(function(element) {
        const source = staticHandlerSource(element, 'data-zhiyu-static-click');
        if (!source) throw new Error('静态点击处理内容为空');
        element.addEventListener('click', function(event) {
            runStaticClick(source, event);
        });
    });

    window.ZHIYU_STATIC_EVENT_BINDINGS = Object.freeze({
        clickCount: clickElements.length,
        keydownCount: 0
    });
})(window, document);
