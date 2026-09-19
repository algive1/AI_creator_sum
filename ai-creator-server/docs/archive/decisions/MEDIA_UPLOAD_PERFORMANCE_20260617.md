# 媒体上传性能优化说明
日期：2026-06-17

## 根因

本次排查的主要慢点不是单一接口，而是上传链路整体设计：

1. 生产配置仍可能使用 `STORAGE_PROVIDER=local`，所有图片/视频都必须先传到 Node 服务，再由 Node 写入本地或对象存储。
2. 后台和小程序页面原先直接调用 `/files/upload`，大视频会经历「客户端 -> Node 临时文件 -> 对象存储」两段传输，容易被 Nginx、Node、临时磁盘或上游超时打断。
3. 存储配置预加载每次会顺序读取大量 `storage.*` 配置并重置适配器，后台保存、上传、打开相关页面都会被拖慢。
4. 后台设置保存一组配置时逐条开事务，保存按钮会重复获取连接、提交事务和写日志。

## 已落地改造

1. 存储配置预加载改为批量读取 + 10 秒内存缓存，后台保存存储配置后强制刷新缓存。
2. 用户侧 `/api/v1/files/upload-config` 按当前 provider 返回上传模式：`local` 走 `server_relay`，非 `local` 走 `direct_client`，并返回 `directUploadProviders` 与 `fallbackUploadUrl`。
3. 后台新增 `/api/v1/admin/files/upload-config`、`/credential`、`/notify`，后台资源上传优先走浏览器直传。
4. 后台图片模板、视频模板、文件库、小程序视觉素材、会员权益图标统一使用 `uploadAdminAsset`，不再各页面手写 `/files/upload`。
5. 小程序 `uploadAsset` 保持原函数签名不变，优先走「配置 -> 凭证 -> 对象存储直传 -> notify」，当前支持七牛和腾讯云 COS；配置失败、凭证失败或对象存储上传失败时回退到原服务端中转。
6. 直传确认会把客户端测得的 `durationMs` 写入 `file_upload_logs.duration_ms`，用于上线后按 `direct_client/server_relay` 对比耗时。
7. `SettingsService.setGroup` 改为一组配置一次事务，减少后台设置保存按钮等待时间。

## 部署要求

要达到“点击即开、上传几秒内可用”的目标，生产环境不要使用 `local` 存储。当前直传优先支持 `qiniu_kodo` 和 `tencent_cos`；OSS/又拍/EOS 暂保留服务端中转兜底，避免各家签名格式差异引入新风险。

腾讯云 COS 直传至少需要：

```env
STORAGE_PROVIDER=tencent_cos
COS_SECRET_ID=...
COS_SECRET_KEY=...
COS_BUCKET=ai-creator-1301433202
COS_REGION=ap-chengdu
COS_CDN_DOMAIN=https://ai-creator-1301433202.cos.ap-chengdu.myqcloud.com
```

微信公众平台 `uploadFile` 合法域名填写 COS 存储桶域名：

```text
https://ai-creator-1301433202.cos.ap-chengdu.myqcloud.com
```

COS Bucket CORS 至少允许后台前端域名发起 `POST`，允许请求头 `*` 或 `Content-Type,q-sign-algorithm,q-ak,q-key-time,q-signature`，并建议暴露响应头 `ETag`。

七牛直传至少需要：

```env
STORAGE_PROVIDER=qiniu_kodo
QINIU_ACCESS_KEY=...
QINIU_SECRET_KEY=...
QINIU_BUCKET=...
QINIU_ZONE=z0
QINIU_CDN_DOMAIN=https://cdn.example.com
```

还需要在平台侧配置：

1. 七牛 Bucket CORS：允许后台域名和小程序业务域名发起 `POST` 上传。
2. 微信公众平台 `request` 合法域名：后端 API 域名。
3. 微信公众平台 `uploadFile` 合法域名：后端 API 域名 + 七牛上传域名，例如 `https://upload-z0.qiniup.com` 或实际 zone 对应域名。
4. 微信公众平台 `downloadFile` 合法域名：对象存储/CDN 域名。
5. Nginx 中转兜底仍保留，因此 `client_max_body_size` 和 `proxy_*_timeout` 仍按 200MB 视频配置。

## 验收 SQL

上线后用下面 SQL 看直传是否生效、平均耗时是否下降：

```sql
SELECT upload_mode, COUNT(*) AS cnt, ROUND(AVG(duration_ms)) AS avg_ms, MAX(duration_ms) AS max_ms
FROM file_upload_logs
WHERE created_at >= NOW() - INTERVAL 1 DAY
GROUP BY upload_mode;
```

慢接口排查：

```sql
SELECT method, path, duration_ms, status_code, created_at
FROM api_slow_logs
WHERE created_at >= NOW() - INTERVAL 1 DAY
ORDER BY duration_ms DESC
LIMIT 30;
```

近期上传失败或回退，需要同时看服务日志和对象存储 CORS/域名配置。

## 风险与回退

1. 如果对象存储 CORS 或微信 `uploadFile` 合法域名未配置，直传会失败并回退服务端中转；用户仍可上传，但速度不会达到目标。
2. 如果 `STORAGE_PROVIDER=local`，系统会主动返回 `server_relay`，这是安全兜底，不是性能路径。
3. 当前把七牛和腾讯云 COS 加入 `directUploadProviders`。其他云厂商继续中转，后续要按各家官方签名格式逐个补直传。
4. 超过当前业务上限的大文件仍不接受。若未来要支持更大视频，应为对应 provider 实现分片/断点续传，并同步调整微信、Nginx、业务上限和对象存储策略。
