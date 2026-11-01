[X @hunter_jia228](https://x.com/hunter_jia228)

# 行程助手 · Travel Planner Agent

用对话规划景点和路线的开源旅行 Agent：Web + 微信小程序 + Express/LangGraph 后端。不提供订票和支付。

## 功能

- 自然语言聊出行需求，推荐景点并生成多日路线
- 高德地图 / Mock 双模式；可选 DeepSeek 语义理解与网页搜索补充资料
- 匿名会话保护行程；管理后台查看访客与封禁 IP
- 分享只读快照、导出 PDF / 图片
- 微信小程序对齐 Web 手机版

## 技术栈

| 部分 | 技术 |
|---|---|
| server | Express、LangGraph.js、SQLite、DeepSeek（OpenAI 兼容） |
| web | React、Vite、Tailwind |
| miniprogram | 原生微信小程序（无构建） |
| shared | TypeScript 共享类型 |

## 快速开始

```bash
npm install
cp .env.example .env   # 至少可先留空密钥，用地图 Mock + 杭州示例库
npm run dev            # server :8787，web :5173
```

接真实高德 / DeepSeek / 搜索服务见 [docs/联调清单.md](docs/联调清单.md)。  
微信小程序见 [miniprogram/README.md](miniprogram/README.md)：开发者工具打开仓库根目录，AppID 用测试号 `touristappid`。

```bash
npm run typecheck && npm run test && npm run test:mp
```

## 密钥与隐私

- **不要提交** `.env`、AppSecret、真实小程序 AppID、支付或第三方 Key。仓库里只有空的 `.env.example`。
- 小程序 `project.config.json` 使用占位 AppID `touristappid`；本机覆盖写在已忽略的 `project.private.config.json`。
- 管理后台没有默认密码。使用前在 `.env` 设置 `ADMIN_PASSWORD`（以及可选的 `ADMIN_PHONE`）；未设置 `ADMIN_PASSWORD` 时无法登录。手机号留空时使用 `server/src/config/admin.ts` 里的占位号 `13800138000`（不是真实号码）。
- 杭州景点库是**示例数据**（`server/src/attractions/sampleHangzhou.ts`），仅供无地图 Key 时演示。
- 不做订票/支付；不收集微信昵称、头像或手机号（匿名会话）。

## 目录

```
server/        后端 API、规划图、地图与搜索适配
web/           React 网页与管理后台
miniprogram/   微信小程序
shared/        前后端共享类型
docs/          联调清单
screenshots/   界面截图（演示用公开景点）
```

微信小程序规范可参考已单独开源的 skill：[wechat-miniprogram-standards](https://github.com/inkwellio/wechat-miniprogram-standards)。

## 授权

[MIT](LICENSE)。代码可自由使用与商用；产品名「行程助手」、品牌图标（含 `xingcheng` 资源）及截图中的视觉标识**不在授权范围内**，二次开发或上架请使用自己的名称与图标。

本仓库是从私有开发仓库脱敏整理出的公开版本，为独立副本，不含该私有仓库的提交历史。
