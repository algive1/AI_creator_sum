# 安装与系统更新运行结构

本文说明安装向导和后台「系统更新」共用的运行目录约定。

## 运行目录

默认运行根目录是 `APP_ROOT_DIR`。如果首次安装时还没有显式配置，后端会优先识别同时包含 `server/package.json` 和 `admin-web/package.json` 的项目根目录，避免误把 `server/` 当成运行根目录。

安装完成后目录应包含：

```text
APP_ROOT_DIR/
  server/
  admin-web/
  shared/.env
  shared/.env.installed
  releases/
  current -> releases/initial-<version>-<time> 或 releases/<version>
  update-packages/
  uploads/
  backups/
  logs/
```

## 首次安装

安装向导会生成 `server/.env`，并同步一份到 `shared/.env`。随后会捕获当前平铺部署为 `releases/initial-<version>-<time>`，创建 `current` 指向该初始版本，并从 `current/server/dist/index.js` 启动 PM2。

初始快照不会复制 `node_modules`，只会把 `current/server/node_modules` 链接到平铺部署的 `server/node_modules`。这样可以避免复制大量依赖目录时触发 Node.js/PM2 运行时异常，也能保证首次 PM2 启动仍可解析依赖。

安装锁写入后，当前后端进程会自动启动已安装运行态的后台任务，包括会员定时任务、备份检查、广告清理和图片/视频异步轮询。PM2 启动和重试会显式读取 `current/server/.env`，避免沿用安装前临时进程里的旧 `JWT_SECRET`、`ENCRYPTION_KEY` 或数据库配置。

这样首次安装后的运行结构与后续系统更新保持一致，`/health` 返回的 `releaseVersion` 也能来自当前版本的 `release.json`。

## 系统更新

后台系统更新只接受 `ai-creator-release-<semver>.tar.gz`。发布包由 `scripts/build-release.sh` 生成，包内包含源码、迁移和文档，不包含 `dist`、`node_modules`、真实 `.env`、上传文件、日志或备份。安装时会在目标服务器执行 `npm run build` 生成 `server/dist` 和 `admin-web/dist`，因此生产不依赖包内旧 `dist`。

安装更新包时，系统会：

1. 备份数据库和当前代码。
2. 解压新版本到 `releases/<version>`。
3. 链接或复制 `shared/.env` 到新版本的 `server/.env`。
4. 安装依赖、构建后端和后台前端。
5. 执行数据库迁移。
6. 切换 `current` 到新版本。
7. 重新从 `current/server/dist/index.js` 启动 PM2。
8. 校验 `/health.releaseVersion` 等于目标版本。
9. 写入 `app_releases`、`release_update_logs` 和 `shared/.env.installed`。

预检查会阻断缺少 `mysqldump`、`curl`、`pm2` 的更新。`mysqldump` 使用 `MYSQL_PWD` 环境变量传递密码，支持特殊字符密码；备份失败会中断安装，不会继续覆盖版本。

迁移脚本位于 `server/src/migrations`，更新安装会先构建后执行 `npm run db:migrate`。迁移执行器按分号分句，但不支持 `DELIMITER`、`CREATE PROCEDURE`、`CREATE FUNCTION`、`CREATE TRIGGER`、`CREATE EVENT`；这类 SQL 必须改成 TypeScript 迁移脚本或单独人工执行。DDL 必须使用 `IF EXISTS/IF NOT EXISTS` 或 information_schema 动态 SQL；seed 必须使用 `INSERT IGNORE` 或 `ON DUPLICATE KEY UPDATE`，保证失败中断后重跑安全。

安装会在 `backups/db` 保存数据库备份，在 `backups/code` 保存当前代码包。若健康检查失败，系统会把 `current` 回滚到旧代码并重启 PM2；数据库迁移不会自动回滚，需按安装日志里的 `dbBackupPath` 通过后台“数据库备份恢复”或命令行人工导入。

本地验证安装和更新基础链路可执行：

```bash
cd server
npm run check:install-update-flow
```

该脚本会使用独立测试库 `ai_creator_install_update_check` 和本地临时运行目录，验证安装初始化、管理员密码、`system.installed`、`app_releases`、更新包预检查、版本比较和 `release_update_logs` 写入。它不会启动正式 PM2，也不会使用正式数据库。

本地 Windows 验证时，`current` 会使用目录 junction；如果 `.env` 文件链接不可用，会退化为复制。Linux 服务器仍按符号链接方式运行。

Windows 本地验证后台更新时，`npm`/`pm2` 等 `.cmd` 命令会通过 `cmd.exe /d /c` 调用，避免 Node.js `execFile` 直接执行 `.cmd` 时出现 `spawn EINVAL`；Linux 生产环境仍按原可执行文件直接调用。
Windows 本地验证会跳过仅适用于 Linux 生产环境的 `npm run check:deploy`，避免平台、chmod 和生产密码强度检查阻断本地数据库升级验证；Linux 生产更新仍会执行该自检。
Windows 从 PM2 服务内发起后台更新时，安装 worker 会通过 PowerShell `Start-Process` 独立启动，避免切换版本时删除旧 PM2 进程连带结束 worker。

## 重新上传文件和数据库后的处理

如果已经安装过一次，又删除数据库和文件后重新上传文件、重新导入数据库，先确认运行状态属于本次部署：

1. `/www/wwwroot/ai-creator/current` 应指向本次发布目录。
2. `/www/wwwroot/ai-creator/shared/.env` 应是本次安装向导写入或本次备份恢复的配置。
3. `/www/wwwroot/ai-creator/shared/.env.installed` 如果来自旧环境，先不要手动复制；让安装向导在服务健康检查通过后重新写入。
4. `/www/wwwroot/ai-creator/.pm2` 如果来自旧环境，可能仍记录旧进程路径；安装向导会尝试删除并重新启动 PM2。
5. 安装快照和更新包都不会复制 `.pm2`，它属于运行态残留，复制进去会把旧的 socket 和进程元数据带到新部署里。

导入的旧数据库如果已经包含 `system.installed=true` 和管理员账号，安装向导会识别为“数据库已初始化”，此时应点击“重试启动服务/修复安装状态”，不要重复建表。

如果日志出现 `Unreachable code This is caused by either a bug in Node.js...`，优先处理运行环境，不要反复删除数据库：

```bash
node -v
pm2 -v
cd /www/wwwroot/ai-creator/server
npm ci --include=dev
npm run build
```

生产服务器建议使用 Node.js 20.x LTS 或稳定的 Node.js 22.x LTS。切换 Node 版本后重新安装依赖并构建，再回安装向导重试 PM2 启动。
