(function(window, document) {
    'use strict';

    function bindOutlineRefBookPicker() {
        const button = document.getElementById('btnImportRefBook');
        const picker = document.getElementById('refBookFilePicker');
        if (!button || !picker || button.dataset.refBookPickerBound === '1') return;
        button.dataset.refBookPickerBound = '1';

        button.addEventListener('click', function() {
            picker.click();
        });
    }

    window.ZHIYU_OUTLINE_REF_BOOK_PICKER = {
        bindOutlineRefBookPicker
    };
    window.bindOutlineRefBookPicker = bindOutlineRefBookPicker;

    bindOutlineRefBookPicker();
})(window, document);
