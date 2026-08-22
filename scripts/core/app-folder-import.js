// Split project folder import module.
// Handles importing a whole local folder as a book.
(function(window, document) {
    'use strict';

    const STATUS = window.ZHIYU_STATUS || {};
    const Toast = window.ZHIYU_TOAST || window.Toast || { warn: function(){} };

    function getBooks(){
        return typeof window.gB === 'function' ? window.gB() : {};
    }

    function saveBooks(books){
        if (typeof window.sB === 'function') window.sB(books);
    }

    function refreshOverviewSafe(){
        if (typeof window.refreshOverview === 'function') window.refreshOverview();
    }

    function readTextFile(file) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = event => resolve({
                name: file.name.replace(/\.(md|txt)$/i, ''),
                content: event.target.result,
                createdAt: new Date().toISOString()
            });
            reader.readAsText(file);
        });
    }

    const folderPicker = document.getElementById('folderPicker');
    folderPicker?.addEventListener('change', async function(event) {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;

        const firstPath = files[0].webkitRelativePath || files[0].name || '';
        const dirName = firstPath.split('/')[0] || '未命名作品';
        const books = getBooks();
        if (books[dirName]) {
            Toast.warn('作品已存在！');
            return;
        }

        const chapters = await Promise.all(files.map(readTextFile));
        books[dirName] = {
            status: STATUS.ACTIVE,
            createdAt: new Date().toISOString(),
            volumes: [{ name: '第一卷', chapters }],
            currentVol: 0,
            wordCount: 0
        };
        saveBooks(books);
        refreshOverviewSafe();
    });

    window.ZHIYU_FOLDER_IMPORT_READY = true;
})(window, document);
