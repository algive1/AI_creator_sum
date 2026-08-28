# AI Creator

AI Creator 是一个由微信小程序、Node.js 后端、管理后台和用户 Web 端组成的 AI 创作平台。

## 项目结构

```text
.
├── uni-app/                 # 微信小程序前端
│   └── docs/                # 小程序专属开发说明
├── ai-creator-server/       # 服务端项目集合
│   ├── server/              # Node.js API、任务和数据库迁移
│   ├── admin-web/           # 管理后台
│   ├── user-web/            # 用户 Web 端
│   ├── docs/                # 服务端、部署和 API 文档
│   └── scripts/             # 构建、发布和运维脚本
├── docs/superpowers/        # 已纳入版本控制的设计稿和开发计划
├── PRODUCT.md               # 产品目标和设计约束
└── other/                   # 本地归档、截图、压缩包和临时材料，不上传 Git
```

## 常用开发命令

```bash
# 小程序
npm install --prefix uni-app
npm run typecheck --prefix uni-app
npm run build:mp-weixin --prefix uni-app

# 后端
npm install --prefix ai-creator-server/server
npm run build --prefix ai-creator-server/server
npm run lint --prefix ai-creator-server/server

# 管理后台和用户 Web
npm run build --prefix ai-creator-server/admin-web
npm run build --prefix ai-creator-server/user-web
```

小程序实时编译说明见 [`uni-app/docs/小程序自动编译说明.md`](uni-app/docs/小程序自动编译说明.md)，服务端文档索引见 [`ai-creator-server/docs/README.md`](ai-creator-server/docs/README.md)。

## Git 工作方式

每个功能或修复使用独立分支，例如 `codex/feature-model-sync` 或 `codex/fix-video-upload`。完成开发后先检查 `git diff` 并运行相关检查，再执行：

```bash
git add <相关文件>
git commit -m "feat: 描述本次变更"
git push -u origin <当前分支>
```

提交是本地版本节点，推送是上传到远程仓库；两者都完成后，其他设备和 GitHub 才能看到这个版本。稳定版本再通过 Pull Request 或合并进入 `main`。

## 配置和安全

真实配置只放在本地 `.env` 文件中。`.env`、API key、日志、上传文件、构建产物、发布压缩包和本地归档均不应提交到 Git；示例配置使用 `.env.example` 或 `.env.production.example`。
