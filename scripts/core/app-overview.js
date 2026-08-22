// 拆分项目总览页模块。
// 只迁移原 app-test 内联脚本里的总览页显示逻辑，不改变数据结构和接口。

(function(window) {
    'use strict';

    const getOverviewChapterTarget = window.getOverviewChapterTarget;
    const getOverviewRecentBook = window.getOverviewRecentBook;
    const formatOverviewWritingTime = window.formatOverviewWritingTime;
    const renderOverviewTable = window.renderOverviewTable;
    const getOverviewSelectedEditBook = window.getOverviewSelectedEditBook;
    const renderOverviewEditBookSelect = window.renderOverviewEditBookSelect;
    const getOverviewBookEditRows = window.getOverviewBookEditRows;
    const getOverviewEditRowLimit = window.getOverviewEditRowLimit;
    const renderOverviewSelectedEdits = window.renderOverviewSelectedEdits;
    const renderOverviewSnapshot = window.renderOverviewSnapshot;
    const renderOverviewSixDayData = window.renderOverviewSixDayData || function(){};

        function refreshOverview(){
            const panelWorks=document.getElementById('panel-works'), panelArchive=document.getElementById('panel-archive'), panelTrash=document.getElementById('panel-trash');
            panelWorks.style.display=AppState.ui.tab==='works'?'grid':'none';
            panelArchive.style.display=AppState.ui.tab==='archive'?'block':'none';
            panelTrash.style.display=AppState.ui.tab==='trash'?'block':'none';
            const activeBooks=getBooksByStatus(STATUS.ACTIVE);
            const archivedBooks=getBooksByStatus(STATUS.ARCHIVED);
            const trashBooks=getBooksByStatus(STATUS.TRASH);
            let activeWords=0;
            Object.keys(activeBooks).forEach(function(bookName){
                const book=activeBooks[bookName];
                if(book.wordCount===undefined)updateWordCount(book);
                activeWords += book.wordCount || 0;
            });
            const activeCountEl=document.getElementById('overviewActiveCount');
            const totalWordsEl=document.getElementById('overviewTotalWords');
            const todayWordsEl=document.getElementById('overviewTodayWords');
            const writingTimeEl=document.getElementById('overviewWritingTime');
            const modelCallsEl=document.getElementById('overviewModelCalls');
            const trashCountEl=document.getElementById('overviewTrashCount');
            const listHintEl=document.getElementById('overviewListHint');
            const writeStats=getWriteStats();
            const modelCallUsage = typeof getTodayModelCallUsage === 'function' ? getTodayModelCallUsage() : { used: 0, limit: 0 };
            if(activeCountEl) activeCountEl.textContent=Object.keys(activeBooks).length;
            if(totalWordsEl) totalWordsEl.textContent=(writeStats.totalWords || activeWords || 0).toLocaleString();
            if(todayWordsEl) todayWordsEl.textContent=(writeStats.todayWords || 0).toLocaleString();
            const writingMs = typeof getTodayWritingDurationMs === 'function' ? getTodayWritingDurationMs() : 0;
            if(writingTimeEl) writingTimeEl.textContent=formatOverviewWritingTime(writingMs);
            if(modelCallsEl) {
                const text = window.ZHIYU_COMMUNITY_MODE === true
                    ? String(modelCallUsage.used || 0)
                    : (typeof formatTodayModelCallUsage === 'function' ? formatTodayModelCallUsage(modelCallUsage) : ((modelCallUsage.used || 0) + '/' + (modelCallUsage.limit || 0)));
                modelCallsEl.textContent=text;
                modelCallsEl.title=window.ZHIYU_COMMUNITY_MODE === true ? '今日本地直连模型调用：' + text : '今日免费模型调用次数：' + text;
            }
            if(trashCountEl) trashCountEl.textContent=Object.keys(trashBooks).length;
            if(listHintEl) listHintEl.textContent=Object.keys(activeBooks).length ? '点击继续写作可进入最近章节' : '';
            renderOverviewSnapshot(activeBooks, writeStats);
            renderOverviewSixDayData();
            const books=AppState.ui.tab==='works'?getBooksByStatus(STATUS.ACTIVE):AppState.ui.tab==='archive'?getBooksByStatus(STATUS.ARCHIVED):getBooksByStatus(STATUS.TRASH);

            if(AppState.ui.tab==='works'){
                const container=document.getElementById('overviewCardsContainer'); 
                // 清除旧卡片（保留新建/导入卡片）
                container.querySelectorAll('.book-card').forEach(c => c.remove());
                container.querySelectorAll('.overview-empty').forEach(c => c.remove());
                container.querySelectorAll('.overview-book-placeholder').forEach(c => c.remove());
                
                let names=Object.keys(books); 
                if(AppState.ui.searchQuery)names=names.filter(n=>n.toLowerCase().includes(AppState.ui.searchQuery));
                const isSearching=!!AppState.ui.searchQuery;
                container.classList.toggle('is-empty', isSearching && names.length===0);
                container.classList.toggle('is-overflowing', names.length>12);
                
                if(names.length===0 && isSearching){
                    const empty=document.createElement('div');
                    empty.className='overview-empty';
                    empty.textContent='没有找到匹配的作品';
                    container.appendChild(empty);
                }else{
                    const fragment=document.createDocumentFragment();
                    names.forEach(name=>{
                        const book=books[name];
                        if(book.wordCount===undefined)updateWordCount(book);
                        const wc=book.wordCount||0;
                        const target=getOverviewChapterTarget(book);
                        const escapedName=Utils.escapeHtml(name);
                        const card=document.createElement('div');
                        card.className='book-card';
                        let coverHTML = (book.cover && /^data:image\//.test(book.cover))
                            ? `<button type="button" data-action="upload-cover" data-book="${escapedName}" style="width:100%;height:100%;border:0;padding:0;background:transparent;cursor:pointer;" title="点击更换封面"><img src="${Utils.escapeHtml(book.cover)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:10px;"></button>`
                            : `<button type="button" data-action="upload-cover" data-book="${escapedName}" style="width:100%;height:100%;border:0;display:flex;align-items:center;justify-content:center;background:#e2e5ea;border-radius:10px;cursor:pointer;font-size:32px;color:#aaa;" title="点击上传封面">+</button>`;
                        card.innerHTML=`
                            <div style="display:flex;gap:14px;min-height:104px;">
                                <div style="width:74px;height:104px;flex-shrink:0;">${coverHTML}</div>
                                <div style="flex:1;display:flex;flex-direction:column;justify-content:center;min-width:0;">
                                    <div style="font-weight:800;font-size:15px;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapedName}">${escapedName}</div>
                                    <div style="font-size:12px;color:#667085;">字数：${wc.toLocaleString()}</div>
                                    <div style="font-size:12px;color:#667085;">更新：${Utils.formatDate(book.updatedAt || book.createdAt)}</div>
                                </div>
                            </div>
                            <div class="btn-row overview-book-card-actions" style="justify-content:flex-start;gap:6px;margin-top:auto;padding-top:10px;border-top:1px solid #e2e5ea;flex-wrap:nowrap;">
                                <button class="btn btn-dark btn-sm" data-action="continue-write" data-book="${escapedName}" data-vi="${target.vi}" data-ci="${target.ci}">继续写作</button>
                                <button class="btn btn-outline btn-sm" data-action="edit-book-info" data-book="${escapedName}">作品信息</button>
                                <div class="overview-book-menu-wrap" style="position:relative;">
                                    <button class="btn btn-outline btn-sm" data-action="book-menu" data-book="${escapedName}" style="font-size:12px;">作品管理 ▾</button>
                                    <div class="book-menu" style="display:none;position:absolute;bottom:100%;left:0;background:#fff;border-radius:12px;box-shadow:0 6px 16px rgba(0,0,0,0.12);z-index:50;min-width:110px;padding:4px 0;border:1px solid #e2e5ea;margin-bottom:4px;">
                                        <div style="padding:5px 12px;cursor:pointer;font-size:13px;" data-action="jump" data-book="${escapedName}">新建章节</div>
                                        <div style="padding:5px 12px;cursor:pointer;font-size:13px;" data-action="import-chapter" data-book="${escapedName}">导入章节</div>
                                        <div style="padding:5px 12px;cursor:pointer;font-size:13px;" data-action="archive" data-book="${escapedName}">归档作品</div>
                                        <div style="padding:5px 12px;cursor:pointer;font-size:13px;" data-action="trash" data-book="${escapedName}">删除作品</div>
                                    </div>
                                </div>
                            </div>
                            <input type="checkbox" class="batch-check" data-book="${escapedName}">`;
                        fragment.appendChild(card);
                    });
                    if(!isSearching && names.length<12){
                        const placeholder=document.createElement('div');
                        placeholder.className='overview-book-placeholder';
                        placeholder.textContent='期待您更多的作品 . . .';
                        fragment.appendChild(placeholder);
                    }
                    container.appendChild(fragment);
                }
            } else if(AppState.ui.tab==='archive'||AppState.ui.tab==='trash'){
                const container=AppState.ui.tab==='archive'?document.getElementById('archiveContainer'):document.getElementById('trashContainer');
                container.innerHTML='';
                let names=Object.keys(books);
                if(AppState.ui.searchQuery)names=names.filter(n=>n.toLowerCase().includes(AppState.ui.searchQuery));
                if(names.length===0){
                    container.innerHTML='<div style="color:#888;text-align:center;padding:40px;">暂无'+(AppState.ui.tab==='archive'?'归档':'回收站')+'作品</div>';
                    return;
                }
                const fragment=document.createDocumentFragment();
                names.forEach(name=>{
                    const book=books[name];
                    if(book.wordCount===undefined)updateWordCount(book);
                    const wc=book.wordCount||0;
                    const escapedName=Utils.escapeHtml(name);
                    const card=document.createElement('div');
                    card.className='book-card';
                    let coverHTML = (book.cover && /^data:image\//.test(book.cover)) ? `<img src="${Utils.escapeHtml(book.cover)}" style="width:52px;height:72px;object-fit:cover;border-radius:8px;flex-shrink:0;">` : '<div style="width:52px;height:72px;border-radius:8px;background:#f1f3f5;border:1px solid #e2e5ea;display:flex;align-items:center;justify-content:center;flex-shrink:0;">📖</div>';
                    card.innerHTML=`
                        <div style="display:flex;gap:12px;align-items:center;min-width:0;">
                            ${coverHTML}
                            <div style="display:flex;flex-direction:column;flex:1;min-width:0;">
                                <div style="font-weight:800;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapedName}">${escapedName}</div>
                                <div style="font-size:12px;color:#667085;margin-top:4px;">字数：${wc.toLocaleString()}</div>
                                <div style="font-size:12px;color:#667085;">更新：${Utils.formatDate(book.updatedAt || book.createdAt)}</div>
                            </div>
                        </div>
                        <div class="btn-row" style="flex-wrap:nowrap;margin-top:auto;padding-top:10px;border-top:1px solid #e2e5ea;">
                            <button class="btn btn-outline btn-sm" data-action="restore" data-book="${escapedName}">还原</button>
                            ${AppState.ui.tab==='archive'?'':`<button class="btn btn-outline btn-sm" data-action="delete" data-book="${escapedName}" style="color:#e74c3c;">彻底删除</button>`}
                        </div>`;
                    fragment.appendChild(card);
                });
                container.appendChild(fragment);
            }
        }

    window.refreshOverview = refreshOverview;
})(window);
