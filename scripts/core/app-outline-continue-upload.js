(function(window, document) {
    'use strict';

    function bindOutlineContinueUploadButton() {
        const button = document.getElementById('btnOCLocalUpload');
        const picker = document.getElementById('memoryFilePicker');
        if (!button || !picker || button.dataset.ocLocalUploadBound === '1') return;
        button.dataset.ocLocalUploadBound = '1';

        button.addEventListener('click', function() {
            picker.dataset.memoryImportMode = 'outline-continue';
            picker.click();
        });
    }

    window.ZHIYU_OUTLINE_CONTINUE_UPLOAD = {
        bindOutlineContinueUploadButton
    };
    window.bindOutlineContinueUploadButton = bindOutlineContinueUploadButton;

    bindOutlineContinueUploadButton();
})(window, document);
