# 找谁 yycore 部署说明

当前默认部署形态：`标准 Node 服务`

## 构建与启动

- 安装依赖：`npm install`
- 构建：`npm run build`
- 启动：`npm run start`

项目已启用 Next.js `standalone` 输出，适合以 Node 服务方式部署。

## 必填环境变量

- `APP_BASE_URL`
- `SECONDME_CLIENT_ID`
- `SECONDME_CLIENT_SECRET`
- `SECONDME_REDIRECT_URI`
- `SECONDME_API_BASE_URL`
- `SECONDME_OAUTH_URL`
- `SECONDME_TOKEN_ENDPOINT`
- `SECONDME_REFRESH_ENDPOINT`
- `SESSION_SECRET`
- `ZHIHU_OPENAPI_BASE_URL`
- `ZHIHU_OPENAPI_AK`
- `ZHIHU_OPENAPI_SK`
- `ZHIHU_OPENAPI_EXTRA_INFO`

如果联调期拿到的是完整鉴权头，而不是签名算法，则额外配置：

- `ZHIHU_OPENAPI_AUTH_HEADER`
- `ZHIHU_OPENAPI_AUTH_VALUE`

## 可选环境变量

- `PORT`
- `HOSTNAME`
- `ZHIHU_BILLBOARD_TOP_CNT`
- `ZHIHU_BILLBOARD_PUBLISH_IN_HOURS`
- `ZHIHU_BILLBOARD_CACHE_TTL_SECONDS`
- `ZHIHU_SEARCH_CACHE_TTL_SECONDS`
- `ZHIHU_SEARCH_COUNT`

## OAuth 回调

上线后将 `SECONDME_REDIRECT_URI` 设置为：

`https://<your-domain>/api/auth/callback`

并同步到 SecondMe 开发者后台。

## 健康检查

可用健康检查地址：

`GET /api/health`

## 联调顺序

1. 先验证 `GET /api/health` 返回 200
2. 再验证 `GET /api/topics` 是否命中真实知乎热榜
3. 再验证 SecondMe OAuth 回调是否能从线上域名往返成功
4. 最后验证创建房间与追问是否能同时引用可信搜证据
