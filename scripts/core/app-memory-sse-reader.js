(function(window) {
    'use strict';

        async function readMemorySseTextResponse(response, options) {
            const result = await window.ZhiyuSseContract.collectZhiyuSseText(response, options);
            if (!result.completed) {
                const error = new Error('AI 流式连接提前结束，未收到完成标志');
                error.code = 'AI_STREAM_INCOMPLETE';
                throw error;
            }
            return result.content;
        }


    window.readMemorySseTextResponse = readMemorySseTextResponse;
    window.ZHIYU_MEMORY_SSE_READER_READY = true;
})(window);
