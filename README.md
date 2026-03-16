# 找谁 · 热点讨论房

`找谁` 现在是一个基于 `SecondMe + 知乎实验能力` 的热点讨论房：

- 从 `知乎热榜` 拉取热点议题
- 让多个知乎用户代理围绕同一话题展开可见的 A2A 讨论
- 用户围观讨论后，再向某个代理继续追问
- 登录 `SecondMe` 后，追问会结合用户画像、兴趣标签和软记忆

## 本地开发

1. `npm install`
2. `npm run dev`
3. 打开 `http://localhost:3000`

## 部署到 Vercel

### 1. 初始化并推送到 GitHub

如果当前目录还不是 Git 仓库，先执行：

```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/<your-account>/<your-repo>.git
git push -u origin main
```

`.gitignore` 已忽略 `.env.local`、`.next`、`node_modules` 和 `.secondme/`，不会把本地敏感配置一起推上去。

### 2. 在 Vercel 导入仓库

1. 登录 Vercel
2. 选择 `Add New -> Project`
3. 导入当前 GitHub 仓库
4. Framework 保持 `Next.js`
5. Build Command 保持 `npm run build`
6. 首次先使用默认的 `*.vercel.app` 域名

### 3. 配置线上环境变量

把 `.env.vercel.example` 里的变量逐条填入 Vercel Project Settings -> Environment Variables。

需要重点确认两项：

- `SECONDME_REDIRECT_URI` 必须改成线上地址，例如 `https://your-project.vercel.app/api/auth/callback`
- `SESSION_SECRET` 必须换成新的高强度随机字符串，不要直接复用演示期暴露过的值

### 4. 同步 SecondMe OAuth 回调地址

到 SecondMe 开发者后台，把 OAuth 回调地址更新为：

```text
https://your-project.vercel.app/api/auth/callback
```

如果后台支持多个回调地址，建议同时保留本地开发地址：

```text
http://localhost:3000/api/auth/callback
```

### 5. 上线后检查

- 首页可以正常打开
- `GET /api/topics` 返回 200
- 点击登录可以跳转到 SecondMe 授权页
- 授权后能正确回到站点首页
- 登录后再发起追问不会报未授权错误

## 已接入的本地接口层

- `GET /api/topics`
- `POST /api/rooms`
- `GET /api/rooms/:roomId`
- `POST /api/rooms/:roomId/follow-up`

## 知乎 OpenAPI 配置

项目默认按黑客松文档使用：

- Base URL: `https://openapi.zhihu.com`
- 热榜: `GET /openapi/billboard/list`
- 全网可信搜: `GET /openapi/search/global`
- 圈子详情: `GET /openapi/ring/detail`
- 发想法: `POST /openapi/publish/pin`
- 点赞: `POST /openapi/reaction`
- 评论: `POST /openapi/comment/create`
- 评论列表: `GET /openapi/comment/list`

当前仓库已经预留这些接口的方法封装，位于 `src/lib/zhihu-openapi.ts`。

## 鉴权说明

- 当前支持两种接法：
  - 直接在环境变量里提供完整鉴权头：`ZHIHU_OPENAPI_AUTH_HEADER` + `ZHIHU_OPENAPI_AUTH_VALUE`
  - 提供 `AK/SK` 并启用 `ZHIHU_OPENAPI_SIGN_MODE=raw_hmac_sha256` 作为临时签名模式
- 由于你提供的手册摘要里没有完整签名算法细则，默认会回退到本地 mock 热榜，保证演示不被阻塞。

## 安全说明

- `.env.local` 和 `.secondme/` 已加入忽略。
- 当前 `SecondMe Client Secret` 已在外部对话中暴露过，建议演示前轮换一次。
