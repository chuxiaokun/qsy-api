# 小鹅 API（Node）

微信小程序自建后端（登录、管理接口等）。小程序前端在独立仓库 **xiaoe**；本仓库只负责 HTTP API。

## 关联项目

| 仓库 | 说明 |
|------|------|
| `../xiaoe` | 微信小程序，`utils/config.js` 中的 `API_BASE` 指向本服务 |

`parseVideo` 等仍可使用微信云函数，无需全部迁到本服务。

## 宝塔部署（详细图文步骤）

完整教程见：**[DEPLOY-BAOTA.md](./DEPLOY-BAOTA.md)**（从装 MySQL、执行 schema、PM2、Nginx SSL 到微信合法域名）。

### 快速清单

1. 宝塔安装 Nginx、MySQL、PM2、Node 18+
2. 建库 → 导入 `sql/schema.sql`
3. 上传本仓库到 `/www/wwwroot/xiaoe-api/` → `cp .env.example .env` 并填写
4. `npm install --production` → PM2 启动 `src/index.js`
5. 站点 + SSL + 反代 `http://127.0.0.1:3000`
6. 微信公众平台配置 **request 合法域名**
7. 小程序 `utils/config.js` 设置 `API_BASE`

## 本地调试

```bash
cp .env.example .env
# 编辑 .env
npm install
npm run dev
```

健康检查：`GET https://你的域名/health`

登录：`POST https://你的域名/api/login`，Body：`{ "code": "wx.login 的 code" }`

完善资料（需登录）：`POST https://你的域名/api/user/profile`，`multipart/form-data` 字段 `avatar`（图片）、`nickname`；Header：`Authorization: Bearer <token>`

## 接口约定

与云函数 `login` 返回格式一致：

```json
{
  "code": 200,
  "data": {
    "token": "JWT...",
    "user": {
      "id": "1",
      "openid": "...",
      "publicId": 10001,
      "nickname": "用户0001",
      "avatarUrl": "",
      "email": "",
      "emailVerified": false,
      "isGuest": false
    }
  }
}
```
