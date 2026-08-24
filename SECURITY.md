# 安全政策

## 报告范围

请私下报告以下问题：

- API Key、小说正文或本地作品意外发送到未确认的地址；
- 绕过社区版网络限制；
- 跨作品读取、覆盖或删除本地数据；
- 导入文件导致脚本执行；
- 仓库或发布包包含密钥、正式环境配置或私人数据。

## 报告方式

公共仓库启用后，请进入仓库的 `Security` → `Advisories`，使用 `Report a vulnerability` 私密报告。GitHub 只为 Public 仓库提供 Repository security advisories 和 Private vulnerability reporting，因此项目所有者会在仓库改为 Public 后立即开启该入口，并在入口确认可用前暂缓发布公告和 Release。不要改用公共 Issue 报告漏洞。

仓库所有者的免费安全设置步骤见 [GITHUB-SETUP.md](GITHUB-SETUP.md)。

任何情况下都不要在公共 Issue、Discussion、截图或日志中粘贴 API Key、小说正文、账号信息或漏洞利用细节。

报告中请提供受影响版本、复现步骤、预期结果和实际结果。请使用虚构测试数据，并删除请求中的 Key。

## 支持范围

只有 GitHub Release 中明确列出的版本属于安全修复支持范围。开发候选和来历不明的第三方打包版本不承诺安全更新。
