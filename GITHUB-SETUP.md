# GitHub 免费上线设置

这些设置都不需要购买服务，但必须在仓库创建后由 Zeyu 在 GitHub 页面完成。本地文件不能代替 GitHub 仓库设置。

## 公开前

1. 先保持仓库为 Private，上传正式候选提交。
2. 开启 Dependency graph、Dependabot alerts 和 Dependabot security updates；这些设置支持 Private 仓库。
3. 在 `Actions` → `General` 中保持最小权限：Workflow permissions 选择 Read repository contents permission，不允许 Actions 创建或批准合并请求。
4. 不要在仓库 Secrets、Variables、Actions 或 Pages 中配置知屿线上服务、正式域名、云账号、用户数据或个人 API Key。
5. 运行 `npm run verify:public`，确认本地许可证、密钥和公开边界检查全部通过。

## 改为 Public 后立即完成

GitHub 的 Repository security advisories、Private vulnerability reporting，以及个人免费仓库的 Secret scanning / Push protection 都需要仓库已经是 Public。切换可见性后，先完成以下设置，再对外发布公告或 Release：

1. 进入 `Settings` → `Security`，开启 Private vulnerability reporting，并确认 Security 页面出现 `Report a vulnerability` 私密入口。
2. 确认 Secret scanning 和 Push protection 已启用；公共仓库可免费使用这些功能。
3. 确认 `.github/workflows/ci.yml` 已成功运行，检查名称为“免费发布门禁 / 测试、许可与密钥检查”。
4. 为默认分支添加保护规则，要求上述检查通过后才能合并。
5. 确认 Dependabot 能读取 `package-lock.json` 和 GitHub Actions 配置。
6. 使用无账号、无真实 Key、无真实小说的全新浏览器配置再次下载并验收 Release 文件。

## 每次发布

```bash
npm ci
npm run verify:public
```

自动检查只负责发现明确问题，不能代替 Chrome、Edge、UI、教程和 AI 功能的实际验收。
