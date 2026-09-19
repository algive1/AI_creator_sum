# MP-weixin 构建与性能审查（2026-08-29）

## 构建结论

- 可用于生产上传的目录是 `uni-app/dist/build/mp-weixin`，目录修改时间为 `2026-08-29 00:26:23 +0800`。
- `uni-app/dist/dev/mp-weixin` 修改时间为 `2026-06-16 23:23:41 +0800`，已经过期，不能作为当前包上传。
- 当前 `uni-app/src` 中最新受检源码修改时间早于生产产物；生产产物共 313 个文件，均晚于 `src/pages.json` 的修改时间。最近一次涉及 `uni-app` 的 Git 提交是 `ed58570`（`2026-08-28 23:24:53 +0800`）。因此，基于当前工作区时间链，`dist/build/mp-weixin` 是现有源码对应的最新编译产物。
- `dist/` 被 Git 忽略，不记录“由哪个 commit 构建”的元数据。每次实际提交审核前仍应重新执行：

```bash
cd uni-app
npm run build:mp-weixin
npm run check:mp-size
```

## 包体积

生产包精确大小为 1,657,875 B（1,619.02 KiB / 1.58 MiB），低于项目的 1,850,000 B 预警阈值。

| 目录 | 大小 | 占比 |
| --- | ---: | ---: |
| `static` | 842.0 KiB | 52.0% |
| `pages` | 567.9 KiB | 35.1% |
| `common` | 71.0 KiB | 4.4% |
| `components` | 61.4 KiB | 3.8% |
| `utils` | 45.6 KiB | 2.8% |

- 未发现 source map 或日志文件进入生产包。
- 最大单个静态资源为 `static/home/notice_megaphone.png`（68,343 B）；本地图片没有异常的大文件。
- 当前 `pages.json` 没有 `subPackages`，23 个页面及相关资源都在主包。包尚未超限，但已经约为单包 2 MB 上限的 79%，不宜继续无规划增长。

## 性能问题与推荐顺序

### P0：灵感接口未分页，且登录用户存在 N+1 查询

前端首页请求已经传入 `page` 和 `pageSize: 12`，但服务端 `queryDisplayPositionTemplates` 未读取这两个参数、没有 `LIMIT/OFFSET`，会把所有可展示模板一次性返回。灵感页同样不传分页参数，收到所有模板后再在客户端过滤、排序并渲染。

当请求携带 `random` 时，服务端还会使用 `RAND()` 排序。每个登录用户模板在 `toPublicTemplate` 内又顺序调用 `isTemplateFavorited`，即每条模板额外查询一次收藏状态。这会使数据库往返、响应体积、前端响应式列表和 WXML 节点数随模板总量线性增长。

建议作为第一项全链路改动：

1. 两个接口统一支持并返回 `page`、`pageSize`、`total`、`hasMore`，服务端使用 `LIMIT/OFFSET` 或游标分页。
2. 首页维持首屏 12 条；灵感页以 20～24 条为一页，并在触底时追加。
3. 用一次批量查询（`WHERE template_id IN (...)`）填充当前用户的收藏状态，禁止逐条查询。
4. 随机换一批改为可索引的随机游标/候选池策略；不要对增长中的全集使用 `ORDER BY RAND()`。

涉及文件：`uni-app/src/pages/home/index.vue`、`uni-app/src/pages/inspiration/index.vue`、`ai-creator-server/server/src/routes/content-templates.ts`。

### P1：任务轮询取消订阅后仍继续请求

`TaskPoller.removeListener` 只删除监听器，不从 `taskIds` 删除任务；定时器仍每 5 秒请求 `/tasks?ids=...`，直到任务变为终态。作品库和结果页在隐藏/卸载时均只调用 `removeListener`，因此用户离开页面后仍可能保持轮询；异常任务尤其容易让这一开销持续存在。

建议把 `taskPoller.add` 改为返回取消订阅函数，或按任务维护订阅计数：最后一个订阅者离开时删除该任务并在集合为空时停止定时器。改动时需要同步处理 `history`、`result` 和 `stores/task`，避免某一页面释放另一页面仍在订阅的任务。

涉及文件：`uni-app/src/utils/task-poller.ts`、`uni-app/src/pages/history/index.vue`、`uni-app/src/pages/result/index.vue`、`uni-app/src/stores/task.ts`。

### P1：生成页预取所有模式的模板

进入 AI 生图页会并发请求 3 个 target feature、每个 24 条模板；AI 视频页会并发请求 4 个 feature、每个 24 条。用户初次只会看到当前模式的模板，其他模式的网络请求、JSON 解析和内存占用都被提前支付。

建议按当前模式惰性加载模板，并按 feature 做 60 秒缓存；切换到一个未加载的模式时再请求。保留现有请求层的去重能力即可，不需要新增通用缓存框架。

涉及文件：`uni-app/src/pages/ai-image/index.vue`、`uni-app/src/pages/ai-video/index.vue`。

### P2：主包应规划分包，但不建议仅为“变小”立即搬迁

主包仍符合限制，且公共依赖较小。下一次增加大型页面或资源前，应将低频、相对独立的“工具运行页/OBS”、“会员与积分”、“任务结果/作品库”等按业务分包；首页与真正共享的代码资源留在主包。分包前需在真机验证自定义导航、跨包资源引用和首屏跳转，不建议只改 `pages.json` 后直接发布。

## 已有有效措施

- `request.ts` 有 GET 请求去重与短期内存缓存。
- 作品库、首页和灵感瀑布流的远程缩略图已使用 `lazy-load`。
- 灵感页只对前 12 张封面预取尺寸，并有 500 ms 超时保护。
- AI 生图/视频草稿保存有 500 ms 防抖。
- 类型检查和包大小检查已接入脚本。

这些措施保持即可；深度监听草稿状态和单个小图压缩都不是当前最高收益项。

## 验证结果

已通过：

```text
npm run check:mp-size              # 1619.02KB <= 1806.64KB
npm run typecheck
npm run test:login-guard           # 10 passed
npm run test:ai-image-ratio-conflict # 2 passed
```

补充：直接用 `node --test` 执行全部 `.test.mjs` 时，11 个测试因 Node 默认不能加载 `.ts` 模块而失败；以 `--experimental-strip-types` 重跑相关测试后仍有一个 `work-library` 测试因无扩展名 ESM import 失败。这是测试命令/模块解析配置缺失，不是生产编译失败；`vue-tsc --noEmit` 已通过。建议后续单独补充统一的测试 runner，不与本次性能修复混在同一个改动中。

## 本次范围

本次为只读审查，除本交接文档外未修改业务源码或构建产物。
