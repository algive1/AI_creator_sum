# 小程序登录审核合规修复（2026-08-30）

## 审核问题与原因

手机号快速验证组件的前置页面和登录弹窗直接展示了“微信登录”“微信一键登录”等平台名称。该文案与登录流程相邻，容易被审核识别为混淆平台官方登录元素。

## 本次修改

- 登录页、全局登录引导弹窗、首页手机号绑定弹窗和“我的”页登录弹窗统一使用“手机号快捷登录”。
- 手机号快速验证弹窗标题及主按钮统一使用“手机号快捷登录”，保留“暂不绑定，直接登录”的可选路径。
- 登录失败提示改为通用“登录失败”，避免在用户可见错误提示中出现平台名称。
- 登录页未引用图片或背景图片；已检查“我的”页默认头像资源，为应用内的 AI 头像，不是平台官方 Logo。
- 保留 `uni.login`、`provider: 'weixin'`、`/auth/wechat-login` 及手机号 `getPhoneNumber`/绑定接口调用，真实登录和绑定流程不变。

## 防回归

- 新增 `src/pages/login-review-compliance.test.mjs`，检查相关登录前置界面不包含“微信”字样，登录页不含图片标识，并验证真实登录、手机号绑定调用链仍在。
- 新增命令：`npm run test:login-review-compliance`。

## 已完成验证

在 `uni-app` 目录执行并通过：

```bash
npm run test:login-review-compliance
npm run test:login-guard
node --test src/utils/phone-authorization.test.mjs
npm run typecheck
npm run build:mp-weixin
npm run check:mp-size
```

生产包输出目录：`dist/build/mp-weixin`。

构建包体积：`1620.01 KB`，低于 `1806.64 KB` 阈值。

## 提审前人工核对

1. 在微信开发者工具导入 `uni-app/dist/build/mp-weixin` 后重新编译。
2. 逐一检查登录页、受保护操作登录弹窗、首次手机号弹窗及“我的”页登录弹窗，确认只显示“手机号快捷登录”，没有微信字样或官方 Logo。
3. 用真实测试账号完成手机号快捷登录、跳过手机号绑定、已绑定手机号登录三条路径。
4. 上传代码并重新提交审核。

## 风险说明

代码和生产构建已完成，但当前环境无法访问微信开发者工具的账号上传与审核系统，尚未进行真实账号联调或实际提交审核。构建时仍有既有模块的 circular chunk 警告，未因本次仅文案与测试调整新增，且不影响本次构建成功。
