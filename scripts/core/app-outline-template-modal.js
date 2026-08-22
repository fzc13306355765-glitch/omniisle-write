(function(window, document) {
    'use strict';

    function bindOutlineTemplateModalClose() {
        const modal = document.getElementById('outlineTemplateModal');
        const modalBox = document.querySelector('#outlineTemplateModal .modal-box');

        if (modalBox && modalBox.dataset.outlineTemplateModalBoxBound !== '1') {
            modalBox.dataset.outlineTemplateModalBoxBound = '1';
            modalBox.addEventListener('click', function(e) {
                e.stopPropagation();
            });
        }

        if (modal && modal.dataset.outlineTemplateModalCloseBound !== '1') {
            modal.dataset.outlineTemplateModalCloseBound = '1';
            modal.addEventListener('click', function() {
                this.style.display = 'none';
            });
        }
    }

    window.ZHIYU_OUTLINE_TEMPLATE_MODAL = {
        bindOutlineTemplateModalClose
    };
    window.bindOutlineTemplateModalClose = bindOutlineTemplateModalClose;

    bindOutlineTemplateModalClose();
})(window, document);
