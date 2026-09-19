# 工作区整理记录

日期：2026-08-28
当前分支：`codex/wechat-tools-config`

## 目标

解决根目录和服务端目录混杂的问题，让源码、正式文档、构建入口和本地材料边界清楚，后续开发完成后可以直接检查、提交和推送。

## 问题原因

- 根目录堆放了截图、压缩包、审计交接笔记、原始设计资源和临时文件。
- `ai-creator-server` 下有旧发布快照、发布压缩包、截图和配置备份，容易被误认为源码。
- 根目录缺少描述真实工程结构和 Git 工作方式的入口 README。
- 小程序编译说明和后端发布基线分别放在根目录，定位不直观。
- `ai-creator-server/src` 和 `ai-creator-server/work` 只有旧的空目录残留，不属于当前构建链路。

## 整理结果

```text
.
├── uni-app/                         # 微信小程序源码和构建配置
│   └── docs/小程序自动编译说明.md
├── ai-creator-server/               # 服务端项目集合
│   ├── server/                      # API、任务、迁移和检查脚本
│   ├── admin-web/                   # 管理后台
│   ├── user-web/                    # 用户 Web
│   ├── docs/                        # 正式技术、部署和发布文档
│   │   └── releases/                # 发布基线记录
│   └── scripts/                     # 发布和运维脚本
├── docs/superpowers/                # 设计稿和开发计划
├── PRODUCT.md                       # 产品约束
└── other/                           # 本机归档区，除 README 外全部忽略
```

`other/` 目前按 `archives`、`notes`、`qa`、`design-assets`、`private` 分类保存历史材料。这里的内容不参与构建，也不会推送到远程仓库；真实 API key 只应保留在本地受保护配置中，并建议对已暴露过的 key 立即轮换。

## Git 使用方式

```bash
git status
git diff
# 运行相关检查
git add <相关文件>
git commit -m "feat: 描述本次功能"
git push -u origin <当前分支>
```

本次保留当前分支已有的后端模型目录、媒体参数、小程序上传和测试改动，并将它们与工作区整理一起纳入候选提交；没有移动源码、依赖锁文件、迁移或正式运行文档。

## 验证结果

- server `npm run build`：通过。
- server `npm run lint`：0 errors，12 个既有 warning。
- server `npm run check:all`：通过。
- server JavaScript/ESM 测试：138/138 通过，使用 `npx tsx --test`。
- server TypeScript 测试：4/4 通过，使用 `npx tsx --test`。
- admin-web build/lint：通过，0 errors，22 个既有 warning。
- user-web build/lint：通过。
- uni-app typecheck：通过。
- uni-app 微信小程序构建：通过；仅有 Sass legacy API 和 chunk 循环提示。
- uni-app 静态测试：123/123 通过，使用 `npx tsx --test`。
- `git diff --check`：通过。

## 仍存在的风险

- 3 个工具档位当前没有绑定主模型，`check:tiers` 会输出 warning；这不是目录整理造成的。
- lint 中的 warning 是现有代码问题，本次没有扩大范围重构。
- 真实第三方 API、生产数据库和线上部署没有在本次本机整理中重新联调。

## 推送状态

- 本地提交已创建：`ed58570 feat: update provider capabilities and organize workspace`。
- 当时推送未完成，原因是本机没有 GitHub HTTPS 登录凭据，也没有可用的 SSH key 或 `gh` 登录状态。

## 推送补记（2026-08-30）

本机 GitHub 凭据已可用，上述阻塞已解除。`codex/wechat-tools-config` 已成功推送到 `https://github.com/algive1/AI_creator_sum.git`，本次批次包含 4 个提交：

- `1a8e3a9 fix: require explicit local test admin password`
- `49eba3a docs: reorganize and reconcile project documentation`
- `49e32e1 feat: make phone binding optional during login`
- `a51e35a perf: paginate inspiration feed and cut redundant template loads`

推送后远程 `refs/heads/codex/wechat-tools-config` 与 `refs/pull/1/head` 均为 `a51e35a`，本地与远程一致，工作区干净。`main` 仍停留在 `34cd7e26`，落后该分支 23 个提交；按 `README.md` 的工作方式，稳定版本再通过 Pull Request 或合并进入 `main`。
