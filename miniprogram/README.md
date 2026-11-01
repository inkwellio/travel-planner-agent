# 行程助手 · 微信小程序

与 Web 手机版同一套宣纸青瓷界面：顶栏「智能规划 / 我的行程」、参数条、对话推荐、底部规划结果抽屉。不另做一套视觉，也不把 React 组件搬进来。后端契约以 `shared/types.ts` 和 `server/src/index.ts` 为准。

## 用微信开发者工具打开

1. 仓库根目录先跑起后端：`npm install && npm run dev`（server `:8787`，web `:5173`）。
2. 开发者工具 → 导入项目，选下面任一目录：
   - **仓库根目录**（读根上的 `project.config.json`，`miniprogramRoot` 为 `miniprogram/`）
   - **`miniprogram/`**（该目录自带 `project.config.json`，`miniprogramRoot` 为 `./`）
3. AppID 可用测试号 `touristappid`，或换成自己的。`project.private.config.json` 已 gitignore，本机覆盖不要提交。
4. 工程里 `urlCheck` 为 false，模拟器可直接请求 `http://127.0.0.1:8787`。若仍被拦截：详情 → 本地设置 → 不校验合法域名、web-view、TLS 版本以及 HTTPS 证书。
5. 基础库选 **3.7.1** 或更新。规划的流式输出依赖 `enableChunked`（基础库 ≥ 2.20.1）。

真机预览时把 `config.js` 的 `baseUrl` 改成电脑局域网 IP（手机和电脑同一 Wi-Fi），例如 `http://192.168.1.8:8787`。不要写 `localhost`。

## 配置

`miniprogram/config.js`：

| 字段 | 默认 | 作用 |
|---|---|---|
| `baseUrl` | `http://127.0.0.1:8787` | 行程 API 根地址，不要带末尾 `/` |
| `webOrigin` | `http://127.0.0.1:5173` | 分享 `/s/:id` 的 Web 源。小程序展示链接 |

密钥只放仓库根目录 `.env`（服务端读取）。小程序包内没有高德 Key、搜索 Key、模型 Key。

匿名用户：首次启动向服务端申请会话凭证，保存在 `wx.setStorage` 的 `travel-agent:session` 中，请求使用 Bearer 凭证。Web 和小程序的会话各自独立，清除本地数据后无法自动找回。旧版匿名 ID 没有身份验证，不能安全地自动迁移原有行程。

## 和 Web 手机版的对应

| Web 手机版 | 小程序 |
|---|---|
| 顶栏「智能规划 / 我的行程」、菜单打开行程抽屉 | 同一信息架构。自定义导航让出右侧胶囊，不放头像 |
| 规划参数（目的地 / 偏好） | 同一组字段，走 `PATCH /api/trips/:id/state` |
| 对话、勾选景点、「生成路线」 | `POST /chat`；生成走 `POST /plan` 的 SSE |
| 底部抽屉：收起 / 半屏 / 全屏 | 手柄跟手拖动，松手吸附这三档（WXS，拖动过程不 `setData`）。旁侧「展开 / 收起」不依赖拖动手势 |
| 逐天路线、交通、天气、版本切换 | 同一份数据。编辑用上移 / 下移 / 删除，仍是 `POST /edit` |
| 高德 JS 地图或静态占位 | 有坐标时用微信原生 `<map>` 画点（不带 Key）；没有路线时是宣纸色块上的城市名 |
| 分享链接、导出图片 | 分享展示 Web 链接；导出按天生成图片并打开微信预览 |
| 灵感文库、订票、支付 | 不做 |

SSE 降级：能分块就边收边画；工具不支持分块时，等整段响应结束后解析；如果一段事件都没有，再 `GET /api/trips/:id` 拉完成后的行程。限流文案与 Web 相同（稍等几秒 / 明天再来）。

## 合法域名（上线时）

开发者工具里的「不校验合法域名」只用于开发，不能当成线上配置。

在小程序后台 → 开发 → 开发设置 → 服务器域名：

- **request 合法域名**：`baseUrl` 的主机。必须是已备案的 **HTTPS**，不能是 IP，不能是 `localhost`，配置里不写端口时请求也不能带端口。
- **downloadFile 合法域名**：景点照片的主机。高德图片常见 `store.is.autonavi.com`、`aos-comment.amap.com`，以接口里 `photos` 的实际域名为准。未配置时图片加载失败，退回色块。
- 不需要 socket 合法域名（规划是 HTTPS 分块，不是 WebSocket）。
- 不把 `api.weixin.qq.com` 配成业务域名。

`<map>` 使用微信自带底图，不请求高德 JS API，因此也不需要在包里放安全密钥。

## 隐私（结构在，提审清单未做完）

本期不调用定位、微信登录、手机号、剪贴板写入。说明页在「我的行程」抽屉底部的「隐私说明」（`pages/privacy`）。

提审前仍要做的事写在该页：**TODO** 于后台填写《用户隐私保护指引》（匿名 ID、对话与行程内容）。若以后改成一键复制，再声明剪贴板并接 `agreePrivacyAuthorization`。用户内容的内容安全检查放在服务端，不要在小程序里调。

## 体积

无 npm 依赖，主包只有这一页加隐私页和线性图标。`app.json` 开了 `lazyCodeLoading: "requiredComponents"`，并把 `rpx` 编译成 `vw`（`convertRpxToVw`）。图标由 `python3 scripts/gen-mp-icons.py` 从 Web 的描边路径栅格而来，需要本机 cairosvg / Pillow；仓库里已经提交生成结果，打开项目不必再跑。

逻辑自测（不启动开发者工具）：

```bash
npm run test:mp
```
