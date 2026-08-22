(function(window) {
    'use strict';

        function countMemFolders(book){
            let count=0;
            for(let k in book){
                if(typeof(book[k])==='object'&&book[k]!==null&&!Array.isArray(book[k]))count++;
            }
            return count;
        }

        function countMemFiles(book){
            let count=0;
            for(let k in book){
                if(Array.isArray(book[k]))count+=book[k].length;
            }
            return count;
        }

        function getMemFolderType(folderName){
            if((folderName || '').includes('细纲')) return 'fineOutline';
            if((folderName || '').includes('拆书')) return 'decompose';
            if((folderName || '').includes('章节概要')) return 'chapterSummary';
            return 'associated';
        }

        function getMemFolderTypeLabel(type){
            if(type==='fineOutline') return '细纲文件夹';
            if(type==='decompose') return '拆书文件夹';
            if(type==='chapterSummary') return '章节概要文件夹';
            return '关联文件夹';
        }

        function getMemFolderSortWeight(folderName){
            const type=getMemFolderType(folderName);
            if(type==='associated') return 0;
            if(type==='fineOutline') return 1;
            return 2;
        }

        function getMemBookGroupStats(book){
            const stats={ associated:0, fineOutline:0, decompose:0, chapterSummary:0 };
            Object.keys(book || {}).forEach(function(folderName){
                if(!Array.isArray(book[folderName])) return;
                const type=getMemFolderType(folderName);
                if(type==='fineOutline') stats.fineOutline += book[folderName].length;
                else if(type==='decompose') stats.decompose += book[folderName].length;
                else if(type==='chapterSummary') stats.chapterSummary += book[folderName].length;
                else stats.associated += book[folderName].length;
            });
            return stats;
        }

        function formatMemoryFolderName(folderName){
            const type=getMemFolderType(folderName);
            if(type==='associated' && folderName==='默认文件夹') return '关联文件夹';
            return folderName;
        }

        function formatMemoryFileDisplayName(fileName, folderName){
            const clean=String(fileName || '').replace(/\.md$/i,'');
            const type=getMemFolderType(folderName);
            if((type==='fineOutline' || type==='decompose' || type==='chapterSummary') && AppState.memory.book){
                const vol=String(folderName || '').replace(/^细纲-/, '').replace(/^拆书-/, '').replace(/^章节概要-/, '');
                return AppState.memory.book + vol + '-' + clean;
            }
            return clean;
        }

        function getMemorySystemFolderName(book){
            if(Array.isArray(book?.['关联文件夹'])) return '关联文件夹';
            if(Array.isArray(book?.['默认文件夹'])) return '默认文件夹';
            return '';
        }

        function getMemoryVolumeFolders(book,type){
            return Object.keys(book || {}).filter(function(folderName){
                return Array.isArray(book[folderName]) && getMemFolderType(folderName) === type;
            }).sort(function(a,b){
                const aNum=parseInt((String(a).match(/第\s*(\d+)\s*卷/)||[])[1],10);
                const bNum=parseInt((String(b).match(/第\s*(\d+)\s*卷/)||[])[1],10);
                if(Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) return aNum-bNum;
                return String(a).localeCompare(String(b),'zh-CN');
            });
        }

        function getMemoryVolumeLabel(folderName){
            const name=String(folderName || '');
            const match=name.match(/第\s*([一二三四五六七八九十百千\d]+)\s*卷/);
            if(match) return '第'+match[1]+'卷';
            return name.replace(/^(细纲|细纲文件|拆书|拆书文件|章节概要|章节概要文件)[-_—]?/,'') || name;
        }

        function getMemoryFileKey(fileName,bookName){
            let clean=String(fileName || '').replace(/\.md$/i,'');
            const prefix=String(bookName || '')+'_';
            if(prefix !== '_' && clean.startsWith(prefix)) clean=clean.slice(prefix.length);
            const aliases={ '信息卡':'信息表', '角色关系网':'角色列表', '关键事件':'关键事件表' };
            return aliases[clean] || clean;
        }

        function getAssociatedMemorySections(files,bookName){
            const foundationOrder=['追踪表','边界卡','承接卡','设定集','信息表','角色列表'];
            const planningOrder=['大纲','拆书设定','剧情总览','关键事件表','资料索引'];
            const sections={ foundation:[], planning:[], stage:[] };
            (files || []).forEach(function(file,idx){
                const key=getMemoryFileKey(file?.name,bookName);
                const entry={ file:file, idx:idx, key:key };
                if(/^(?:S\d{2,}阶段粗纲|阶段粗纲[-_—])/i.test(key)) sections.stage.push(entry);
                else if(foundationOrder.includes(key)) sections.foundation.push(entry);
                else sections.planning.push(entry);
            });
            function sortByOrder(list,order){
                list.sort(function(a,b){
                    const ai=order.indexOf(a.key), bi=order.indexOf(b.key);
                    if(ai < 0 && bi < 0) return a.idx-b.idx;
                    if(ai < 0) return 1;
                    if(bi < 0) return -1;
                    return ai-bi;
                });
            }
            sortByOrder(sections.foundation,foundationOrder);
            sortByOrder(sections.planning,planningOrder);
            sections.stage.sort(function(a,b){
                const aNum=parseInt((a.key.match(/S(\d+)/i)||[])[1],10);
                const bNum=parseInt((b.key.match(/S(\d+)/i)||[])[1],10);
                return Number.isFinite(aNum) && Number.isFinite(bNum) ? aNum-bNum : a.idx-b.idx;
            });
            return sections;
        }


    window.countMemFolders = countMemFolders;
    window.countMemFiles = countMemFiles;
    window.getMemFolderType = getMemFolderType;
    window.getMemFolderTypeLabel = getMemFolderTypeLabel;
    window.getMemFolderSortWeight = getMemFolderSortWeight;
    window.getMemBookGroupStats = getMemBookGroupStats;
    window.formatMemoryFolderName = formatMemoryFolderName;
    window.formatMemoryFileDisplayName = formatMemoryFileDisplayName;
    window.getMemorySystemFolderName = getMemorySystemFolderName;
    window.getMemoryVolumeFolders = getMemoryVolumeFolders;
    window.getMemoryVolumeLabel = getMemoryVolumeLabel;
    window.getMemoryFileKey = getMemoryFileKey;
    window.getAssociatedMemorySections = getAssociatedMemorySections;
    window.ZHIYU_MEMORY_DISPLAY_READY = true;
})(window);
