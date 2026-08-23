# 全文分析第三方来源与修改说明

`scripts/core/app-import-full-analysis-langextract-chunker.js` 的文本切块思路和部分结构改写自 Google LangExtract：

- 上游仓库：`https://github.com/google/langextract`
- 固定来源提交：`b5fe0baf807ac35ec95b968a71e4d03f198a1b60`
- 参考文件：`langextract/chunking.py`、`langextract/core/tokenizer.py`
- 上游版权：Copyright 2025 Google LLC.
- 上游许可证：Apache License 2.0

知屿写作社区版的主要修改包括：

- 从 Python 改写为浏览器原生 JavaScript；
- 使用浏览器可用的 Unicode 分段能力并提供兼容回退；
- 增加 UTF-8 字节上限、上传分段上限和社区版错误边界；
- 接入本机全文分析计划、检查点和恢复流程。

完整 Apache License 2.0 文本见 `docs/licenses/Apache-2.0.txt`。本说明不改变上游许可证，也不把 Google 的代码或权利归为 Zeyu 独占所有。
