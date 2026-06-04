# 部署指南（小白版）

> 本文档假设你有一台 Linux 云服务器（已装宝塔面板）和一台 Windows 电脑（已装 WSL）。跟着步骤走，不需要懂 Linux。

---

## 一、准备清单

开始之前确认你手里有：

- [ ] 服务器 IP 地址（如 `123.456.78.90`）
- [ ] 宝塔面板登录地址和密码（服务器购买后通常会收到短信）
- [ ] 一个域名，已经解析到服务器 IP（如 `api.你的网站.com`）
- [ ] 本项目的完整源码（`i:\AI_creator_sum\ai-creator-server`）

---

## 二、服务器环境（宝塔面板操作）

### 2.1 登录宝塔

浏览器打开 `https://你的服务器IP:面板端口`（默认端口通常是 8888 或随机生成的），用短信里的账号密码登录。

### 2.2 安装软件

进入宝塔面板 → 软件商店，搜索安装以下软件：

| 软件 | 用途 | 怎么装 |
|------|------|--------|
| Nginx | 网站服务器，把域名指向我们的程序 | 搜索 → 一键安装 |
| MySQL 8.0 | 数据库，存用户、任务、订单等数据 | 搜索 → 一键安装 |
| Node.js 版本管理器 | 运行 Node.js 程序 | 搜索 → 一键安装 |

装好 Node.js 版本管理器后，点进去安装 **Node.js 20.x LTS**。

### 2.3 安装 PM2（进程守护）

打开宝塔面板 → 终端，粘贴以下命令：

```bash
npm install -g pm2
```

PM2 的作用：让程序在后台一直运行，崩溃了自动重启，重启服务器后自动启动。

### 2.4 创建数据库

宝塔面板 → 数据库 → 添加数据库：

| 填写项 | 填什么 | 说明 |
|--------|--------|------|
| 数据库名 | `ai_creator` | 程序的数据库名字 |
| 用户名 | `ai_creator` | 连接数据库用的账号 |
| 密码 | 点「随机生成」，**记下来** | 后面安装要用 |
| 访问权限 | `localhost` | 只允许本机连接，安全 |

### 2.5 创建网站（配置域名）

宝塔面板 → 网站 → 添加站点：

- 域名：填你的域名（如 `api.你的网站.com`）
- 其他默认，点确定

创建后点「设置」→「反向代理」→ 添加反向代理：

| 填写项 | 填什么 |
|--------|--------|
| 目标 URL | `http://127.0.0.1:3000` |
| 发送域名 | `$host` |

这个步骤的意思是：访问你的域名 → Nginx 接收 → 转发给我们的程序（3000 端口）。

### 2.6 创建项目目录

宝塔面板 → 终端：

```bash
mkdir -p /www/wwwroot/ai-creator/update-packages
mkdir -p /www/wwwroot/ai-creator/uploads
```

- `ai-creator`：放我们的程序
- `update-packages`：放更新包
- `uploads`：放用户上传的图片

---

## 三、打包（Windows 电脑上用 WSL）

WSL 是 Windows 自带的 Linux 子系统，用来运行打包脚本。

### 3.1 打开 WSL

Windows 开始菜单 → 搜索 "WSL" → 打开 Ubuntu。如果没装过，在 PowerShell 管理员窗口运行：

```powershell
wsl --install
```

第一次打开会提示创建用户名和密码，随便设一个就行。

### 3.2 安装 Node.js（WSL 里）

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

这两行的作用：下载 Node.js 20 的安装脚本并执行，装好后就能用 `node` 和 `npm` 命令。

### 3.3 执行打包

```bash
cd /mnt/i/AI_creator_sum/ai-creator-server
bash scripts/build-release.sh 1.0.1
```

WSL 里 `/mnt/i/` 就是 Windows 的 `I:` 盘。版本号 `1.0.1` 每次发版改成新的。

等脚本跑完（大约 2-5 分钟），会在项目根目录生成：

```
ai-creator-release-1.0.1.tar.gz
```

这就是要上传到服务器的发布包。

打包脚本会在临时目录里重新安装依赖并执行后台 lint/build、后端 lint/编码检查/build，然后运行发布包结构检查。发布包包含 `docs`、`scripts`、`server/src`、`server/src/migrations`、`server/scripts`、`admin-web/src` 等源码和迁移；不包含 `dist`、`node_modules`、真实 `.env`、上传文件、日志、备份和本地压缩包。服务器安装或更新时会重新构建。

### 3.4 上传到服务器

在 WSL 终端里执行（把 IP 和路径换成你的）：

```bash
scp ai-creator-release-1.0.1.tar.gz root@你的服务器IP:/www/wwwroot/ai-creator/update-packages/
```

会提示输入服务器密码（宝塔的 root 密码）。上传需要几十秒到几分钟，取决于文件大小和网速。

> **备选方式**：如果 scp 不会用，打开宝塔面板 → 文件管理 → 进入 `/www/wwwroot/ai-creator/update-packages/` → 点上传 → 选择文件。

---

## 四、安装程序

### 4.1 解压

宝塔面板 → 终端：

```bash
cd /www/wwwroot/ai-creator
tar -xzf update-packages/ai-creator-release-1.0.1.tar.gz
```

解压后目录结构：

```
ai-creator/
├── server/        ← 后端程序
├── admin-web/     ← 后台管理页面
├── scripts/       ← 工具脚本
└── release.json   ← 版本信息
```

### 4.2 构建

```bash
# 构建后端
cd /www/wwwroot/ai-creator/server
npm ci --include=dev
npm run build

# 构建后台前端
cd /www/wwwroot/ai-creator/admin-web
npm ci --include=dev
npm run build
```

每行的作用：
- `npm ci` → 安装依赖（下载程序需要的第三方库）
- `npm run build` → 把 TypeScript 代码编译成 JavaScript（浏览器/Node.js 才能执行）

> **不需要手动创建或编辑 .env 文件。** 安装向导会自动生成。若你希望在安装或更新时自动写入供应商 API Key，可在启动安装/执行 `npm run db:migrate` 前把 `OPENAI_API_KEY`、`XIAOMA_API_KEY`、`BAGEGE_API_KEY`、`WELLAPI_API_KEY`、`CODESONLINE_IMAGE_API_KEY`、`APIMART_API_KEY` 写入服务器环境或 `.env`；系统会加密同步到数据库，不要把真实 Key 写入 SQL 种子文件。未配置 Key 的供应商专属档位不会展示给小程序。若数据库里的本地存储地址仍是默认 `/static`，也可设置 `LOCAL_BASE_URL=https://你的后端域名/static` 后运行 `npm run db:migrate` 同步。

### 4.3 启动

```bash
cd /www/wwwroot/ai-creator/server
pm2 start dist/index.js --name ai-creator --update-env
pm2 save
pm2 startup
```

- `pm2 start` → 启动程序
- `pm2 save` → 记住当前运行的程序列表
- `pm2 startup` → 设置开机自启（按提示复制粘贴输出的命令）

---

## 五、安装向导

浏览器打开 `https://你的域名/install`，进入 6 步安装向导。**每一步都有中文提示，跟着提示填就行。**

### 第 1 步：环境检测

系统自动检查 Node.js、PM2、MySQL、磁盘空间、目录权限。全部绿色通过点「下一步」。

如果出现红色「待处理」：
- **admin-web/dist 或 server/dist 未找到** → 回到 4.2 重新构建
- **MySQL 连接失败** → 检查数据库是否创建了

### 第 2 步：数据库配置

| 填写项 | 填什么 |
|--------|--------|
| 数据库地址 | `127.0.0.1`（不动的） |
| 数据库端口 | `3306`（不动的） |
| 数据库名称 | `ai_creator`（之前创建的名字） |
| 数据库用户名 | `ai_creator`（之前创建的用户名） |
| 数据库密码 | 之前记录的密码 |

填好后点「测试连接」，成功点「下一步」。

### 第 3 步：管理员配置

设置后台登录的账号密码，长度不够会有提示。**记好这个密码。**

> JWT 密钥和加密密钥由系统自动生成，不需要手动填。

### 第 4 步：系统配置

| 填写项 | 填什么 |
|--------|--------|
| 后端端口 | `3000`（不动的） |
| 站点名称 | `AI创作工坊`（或你的品牌名） |
| 后台标题 | `AI创作工坊后台` |
| 时区 | `Asia/Shanghai` |
| 存储方式 | 选 `本地存储`（默认） |

### 第 5 步：执行安装

确认信息无误 → 点「开始安装」。系统自动完成：

1. 写入配置文件
2. 创建数据库表
3. 导入初始数据
4. 创建管理员账号
5. 启动服务

进度条走完点「进入后台登录」。

### 第 6 步：完成

看到绿色"安装完成" → 点「进入后台登录」→ 用第 3 步设置的账号密码登录。

---

## 六、登录后台后要做什么

登录后台后按顺序检查这些：

| 顺序 | 检查项 | 在哪里 |
|------|--------|--------|
| 1 | 功能开关全部打开 | 左侧菜单 → 功能开关 |
| 2 | 微信小程序 AppID/Secret 填写 | 微信配置 → 微信小程序 |
| 3 | 微信支付商户号/密钥填写 | 微信配置 → 微信支付 |
| 4 | 客服入口配置 | 微信配置 → 微信客服 |
| 5 | 小程序运营素材配置 | 微信配置 → 小程序素材 |
| 6 | 底部导航栏配置 | 微信配置 → 底部导航 |
| 7 | 积分套餐创建 | 积分管理 |
| 8 | 会员套餐创建 | 会员套餐 |
| 9 | 模型档位配置 | AI 模型管理 → 功能页配置 |
| 10 | 供应商 Base URL/API Key 填写 | AI 模型管理 → 供应商与模型；也可先通过 `.env` 的供应商 Key 变量自动同步 |
| 11 | 模型测试 | AI 模型管理 → 模型测试 |
| 12 | 上传 SSL 证书 | 宝塔面板 → 网站设置 → SSL |

小程序素材配置里的图片必须使用公网 HTTPS，并把图片域名加入微信公众平台 `downloadFile` 合法域名。未配置素材时，小程序会使用本地 JPG 或 CSS 绘制兜底。

如果使用 APIMart：新部署执行迁移后会出现 `APIMart` 供应商和 `apimart_*` 专属档位。Base URL 默认 `https://api.apimart.ai/v1`，API Key 可在后台填写或用 `APIMART_API_KEY` 自动同步；不要把真实供应商模型 ID 暴露给小程序。图生图、图生视频、首尾帧视频和视频编辑依赖公网可访问的 HTTPS 素材 URL，本地 HTTP 上传地址不适合生产环境调用第三方模型。

---

## 七、后续版本更新

以后发新版本时，不需要重装，通过后台在线更新：

1. **打包**：WSL 里运行 `bash scripts/build-release.sh 新版本号`
2. **上传**：scp 到 `/www/wwwroot/ai-creator/update-packages/`，也可以在后台系统更新页上传 `.tar.gz`
3. **后台操作**：登录后台 → 系统更新 → 扫描 → 预检查 → 输入目标版本号确认 → 安装

系统会自动备份数据库和旧代码；如果失败发生在切换 `current` 之后，会自动回滚代码到旧版本。整个过程不需要 SSH。

当前更新流程的关键规则：

1. 发布包必须命名为 `ai-creator-release-<版本号>.tar.gz`，版本号必须大于当前版本。
2. 更新服务会先解压并构建后端和后台，构建成功后才执行数据库迁移。
3. 构建失败不会执行数据库迁移，也不会切换 `current`。
4. 迁移成功后才把 `/www/wwwroot/ai-creator/current` 软链接切到目标 release，并用 PM2 从 `current/server/dist/index.js` 重启。
5. `/health` 返回的 `releaseVersion` 必须等于目标版本，否则自动回滚 `current` 到旧版本并重启 PM2。
6. 安装锁统一写入 `/www/wwwroot/ai-creator/shared/.env.installed`，旧的 `server/.env.installed` 只作为兼容读取来源。
7. 更新失败后会保留数据库备份和代码备份；数据库不会自动导回，后台提供数据库备份恢复入口，需要人工确认后执行。

---

## 八、常见问题

### 访问域名显示"无法访问"

1. 检查服务器安全组是否放行了 80（HTTP）和 443（HTTPS）端口
2. 检查域名是否解析到了服务器 IP
3. 检查 Nginx 是否在运行：宝塔面板首页看到 Nginx 是绿色运行状态

### 访问 /install 显示 502

```bash
pm2 logs ai-creator --lines 50
```

看最近的错误日志。常见原因：
- 数据库连接失败 → 检查 MySQL 是否在运行
- 端口被占用 → `netstat -tlnp | grep 3000`

### 安装向导最后一步卡住

PM2 启动服务需要几秒钟。如果进度条一直在"正在启动 PM2 服务"，刷新页面重新进入安装向导即可（已完成步骤不会重复执行）。

### 安装完成后登录后台失败

按顺序排查这四个原因：

**1. 密码记错了**（最常见）

安装向导第 3 步输入的密码和现在输入的不一致。用下面的方法重置。

**2. 安装向导没走完**

访问 `https://你的域名/install` 看状态：
- 如果显示"部分完成"→ 点"重试启动服务"
- 如果显示安装向导首页 → 说明没执行安装，走完 5 步
- 如果自动跳转到 `/login` → 说明安装已完成，问题不在安装

**3. PM2 进程挂了**

```bash
pm2 list
pm2 logs ai-creator --lines 30
```

如果 `pm2 list` 看不到 `ai-creator`，说明进程没启动。重新启动：

```bash
cd /www/wwwroot/ai-creator/server
pm2 start dist/index.js --name ai-creator --update-env
```

如果日志里看到 `FATAL: JWT_SECRET is missing, too short, or uses a known default`，说明 `.env` 里的密钥不安全。删除 `server/.env`，重新走一遍安装向导让它自动生成。

**4. 数据库里没有管理员账号**

```bash
mysql -u root -p ai_creator -e "SELECT username FROM admin_users;"
```

如果结果为空，说明安装向导创建管理员那步失败了。重新走安装向导。

### 忘记管理员密码，重置方法

```bash
cd /www/wwwroot/ai-creator/server
node -e "const b=require('bcryptjs');console.log(b.hashSync('你的新密码',10))"
```

会输出一串乱码（密码哈希），复制它。然后：

```bash
mysql -u root -p ai_creator -e "UPDATE admin_users SET password_hash='刚才复制的乱码' WHERE username='admin';"
```

用新密码登录即可。

### 小程序连不上

1. 确认域名是 `https://`（不是 `http://`）
2. 微信公众平台 → 开发管理 → 服务器域名 → 把 `https://你的域名` 加到 request/uploadFile/downloadFile 合法域名
3. 宝塔面板 → 网站设置 → SSL → 申请 Let's Encrypt 免费证书

### 如何看程序是否在运行

```bash
pm2 list
```

看到 `ai-creator` 状态是 `online` 就说明在运行。

### 如何重启程序

```bash
pm2 restart ai-creator
```

---

> 遇到本文未覆盖的问题，查看 [AI 开发指南](AI_DEVELOPMENT_GUIDE.md) 或联系开发人员。
