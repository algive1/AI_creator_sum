# 本地端口测试（兼容入口）

本地服务端与管理后台联调的完整说明已合并到 [DEPLOYMENT.md](DEPLOYMENT.md) 的“本地联调（服务端与管理后台）”章节。本文件保留给既有检查与书签使用。

在 Windows PowerShell 的 `ai-creator-server` 目录启动：

```powershell
.\scripts\local-test.ps1 -AdminPassword '<仅本机使用的临时密码>'
```

默认地址为后端 `http://127.0.0.1:3137/health` 和管理后台 `http://127.0.0.1:5173/login`。本地管理员默认用户名为 `local_admin`；密码必须通过 `-AdminPassword` 在启动时显式传入，不能写入文档、提交记录或生产配置。

默认端口被占用时，脚本会自动寻找下一个空闲端口，并把实际端口写入 `server/runtime/local-test/ports.json`。常用命令：

```powershell
.\scripts\local-test.ps1 status
.\scripts\local-test.ps1 stop
```

首次使用前分别在 `server`、`admin-web` 运行 `npm ci`。本地测试只使用指定的本地数据库，PID 和日志位于已忽略的 `server/runtime/local-test`，不会修改 `server/.env`。
