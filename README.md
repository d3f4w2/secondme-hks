# 讨论实验室

`讨论实验室` 现在是一个基于 `SecondMe + 知乎实验能力` 的 A2A 问题讨论产品：

- 支持 `知乎热点问题` 和 `用户自定义问题` 双入口
- 针对问题去知乎检索相近讨论与真实答主内容
- 将知乎真实用户/回答抽象为多个具备不同职责的代理
- 让这些代理围绕同一问题展开可见的 A2A 讨论
- 在讨论中引入 `全网可信搜` 结果作为真实论据
- 讨论结束后输出：`找谁 / 为什么找 / 怎么做`
- 登录 `SecondMe` 后，讨论目标、追问顺序和行动建议会结合用户画像、兴趣标签和软记忆

## 本地开发

1. `npm install`
2. `npm run dev`
3. 打开 `http://localhost:3000`

## 已接入的本地接口层

- `GET /api/topics`
- `POST /api/rooms`
- `GET /api/rooms/:roomId`
- `POST /api/rooms/:roomId/follow-up`
- `GET /api/health`

## 知乎 OpenAPI 配置

项目按黑客松接口清单预留了这些能力：

- `GET /openapi/billboard/list`
- `GET /openapi/search/global`
- `GET /openapi/ring/detail`
- `POST /openapi/publish/pin`
- `POST /openapi/reaction`
- `POST /openapi/comment/create`
- `GET /openapi/comment/list`

客户端封装位于 `src/lib/zhihu-openapi.ts`。

## 鉴权说明

- `ZHIHU_OPENAPI_AK` 对应文档里的 `app_key`，也就是用户 token
- `ZHIHU_OPENAPI_SK` 对应文档里的 `app_secret`
- 请求头已按文档实现：
  - `X-App-Key`
  - `X-Timestamp`
  - `X-Log-Id`
  - `X-Extra-Info`
  - `X-Sign`
- 签名串格式：
  - `app_key:{app_key}|ts:{timestamp}|logid:{log_id}|extra_info:{extra_info}`
- 签名算法：
  - `HMAC-SHA256` 后做 `Base64`
- 仍保留 `ZHIHU_OPENAPI_AUTH_HEADER` / `ZHIHU_OPENAPI_AUTH_VALUE` 作为调试附加头。

## 热榜与可信搜参数

- 热榜使用：
  - `ZHIHU_BILLBOARD_TOP_CNT`
  - `ZHIHU_BILLBOARD_PUBLISH_IN_HOURS`
- 可信搜使用：
  - `ZHIHU_SEARCH_COUNT`
  - `ZHIHU_SEARCH_CACHE_TTL_SECONDS`
- 当前实现会把可信搜结果同时接入：
  - 房间创建阶段
  - 用户追问阶段

## 生产部署

- 已启用 Next.js `standalone` 输出，适合标准 Node 服务部署。
- 生产环境需要设置 `APP_BASE_URL` 和线上 `SECONDME_REDIRECT_URI`。
- 若使用 Vercel，请同步设置：
  - `ZHIHU_OPENAPI_EXTRA_INFO`
  - `ZHIHU_BILLBOARD_TOP_CNT`
  - `ZHIHU_BILLBOARD_PUBLISH_IN_HOURS`
  - `ZHIHU_SEARCH_COUNT`
- `yycore` 部署清单见 `docs/2026-03-16-yycore-deploy.md`。

## 安全说明

- `.env.local` 和 `.secondme/` 已加入忽略。
- 当前 `SecondMe Client Secret` 已在外部对话中暴露过，演示前建议轮换一次。
