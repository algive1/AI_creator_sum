# 本地端口测试

本地联调统一使用脚本启动，不再手动分别启动后端和后台。

## 一键启动

```powershell
cd I:\AI_creator_sum\ai-creator-server
.\scripts\local-test.ps1
```

脚本会启动两个本地端口：

| 服务 | 地址 |
| --- | --- |
| 后端健康检查 | `http://127.0.0.1:3137/health` |
| 管理后台 | `http://127.0.0.1:5173/login` |

本地后台测试账号：

```text
账号：local_admin
密码：LocalTest#2026
```

脚本会自动把该账号写入本机测试库 `ai_creator_login_test.admin_users`，并设置为 `super_admin`。这只是本地测试账号，不用于线上。

## 常用命令

查看本地端口状态：

```powershell
.\scripts\local-test.ps1 status
```

停止本地端口：

```powershell
.\scripts\local-test.ps1 stop
```

如果默认端口被占用，未显式指定端口时脚本会自动寻找下一个空闲端口，并把实际端口写入 `server/runtime/local-test/ports.json`。当前状态可用 `status` 查看。

手动指定其他端口：

```powershell
.\scripts\local-test.ps1 -BackendPort 3138 -AdminPort 5174
```

## 脚本行为

- 不修改 `server/.env`。
- 后端用临时环境变量覆盖为 `NODE_ENV=development`、`PORT=3137`、`LOCAL_BASE_URL=/static`。
- 后台 Vite 代理 `VITE_API_PROXY_TARGET` 指向本地后端端口。
- PID、runner 和日志写入 `server/runtime/local-test`，该目录已被 git 忽略。
- 如果未显式指定端口，3137 或 5173 被占用时会自动寻找下一个空闲端口。
- 如果已经显式指定端口且该端口被占用，脚本会停止并提示，不会强行杀掉未知进程。

## 本机依赖

首次使用前，确保依赖已经安装：

```powershell
cd I:\AI_creator_sum\ai-creator-server\server
npm ci

cd I:\AI_creator_sum\ai-creator-server\admin-web
npm ci
```

默认连接本机 MySQL：

```text
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=ai_creator_login_test
DB_USER=root
DB_PASSWORD=<本机 MySQL 密码>
```

如需改库或改账号，可在启动时传参：

```powershell
.\scripts\local-test.ps1 -DbName ai_creator_login_test -DbUser root -DbPassword '<本机 MySQL 密码>'
```
