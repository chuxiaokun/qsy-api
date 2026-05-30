# 宝塔面板部署小鹅 API — 详细教程

本文从零说明：在已安装 **宝塔 Linux 面板** 的服务器上，部署本仓库（xiaoe-api）中的 Node 登录接口，并让微信小程序通过 HTTPS 访问。

**前提（请自备）：**

- 一台云服务器（阿里云 / 腾讯云等），已安装宝塔面板并可登录
- 一个已备案（国内服务器）或未备案但可访问的 **域名**，例如 `api.example.com`
- 微信小程序管理员权限（配置域名、查看 AppSecret）

**部署完成后的访问关系：**

```
微信小程序  --HTTPS-->  Nginx(443)  --反代-->  Node(127.0.0.1:3000)  -->  MySQL
```

`parseVideo` 解析仍走微信云开发时，无需为解析单独配置域名；只需为 **登录 API** 配置 `request 合法域名`。

---

## 第 0 步：宝塔安装必要软件

1. 登录宝塔面板 → 左侧 **软件商店**
2. 搜索并安装（未安装时）：
   - **Nginx**（或 OpenLiteSpeed，下文以 Nginx 为例）
   - **MySQL 5.7 / 8.0**（任选其一）
   - **PM2 管理器**（推荐，用于守护 Node 进程）
3. 若软件商店有 **Node 版本管理器**，可安装并选 **Node.js 18 或 20**；没有则后面用 SSH 安装 Node

安装 MySQL 时记住 **root 密码**（面板会提示保存）。

---

## 第 1 步：创建 MySQL 数据库与用户

1. 宝塔 → **数据库** → **添加数据库**
2. 填写示例（可按需改名，与 `.env` 一致即可）：

   | 项 | 示例值 |
   |---|---|
   | 数据库名 | `xiaoe` |
   | 用户名 | `xiaoe` |
   | 密码 | 自行生成强密码 |
   | 访问权限 | 本地服务器 |

3. 点击提交，记下：**数据库名、用户名、密码**

---

## 第 2 步：执行 `sql/schema.sql` 建表

有两种方式，任选其一。

### 方式 A：phpMyAdmin（适合新手）

1. 宝塔 → **数据库** → 找到 `xiaoe` → 点击 **管理**（进入 phpMyAdmin）
2. 左侧选中数据库 **`xiaoe`**
3. 顶部 **导入** → 选择文件 → 上传项目里的 `sql/schema.sql`
4. 执行导入

> 若 `schema.sql` 里含有 `CREATE DATABASE`，而你已经用宝塔建好了库 `xiaoe`，可能提示库已存在，可忽略；只要 **`users` 和 `counters` 两张表** 出现即可。

### 方式 B：宝塔「SQL」窗口

1. 数据库 → `xiaoe` → **管理** → **SQL**
2. 打开本地 `sql/schema.sql`，**删掉**前两行建库语句（若你已手动建好库）：

   ```sql
   -- 可删除这两行，改用面板已创建的库
   -- CREATE DATABASE IF NOT EXISTS xiaoe ...
   -- USE xiaoe;
   ```

3. 只保留 `CREATE TABLE` 部分，粘贴执行

### 验证是否成功

在 SQL 窗口执行：

```sql
SHOW TABLES;
```

应看到：

- `users`
- `counters`

---

## 第 3 步：上传代码到服务器

### 方式 A：宝塔文件管理器

1. **文件** → 进入 `/www/wwwroot/`
2. 新建目录 `xiaoe-api`
3. 将本仓库根目录内容上传进去（含 `package.json`、`src/`、`sql/` 等），最终路径类似：

   ```
   /www/wwwroot/xiaoe-api/
   ├── package.json
   ├── .env.example
   ├── src/
   └── sql/
   ```

### 方式 B：Git（服务器已装 git 时）

```bash
cd /www/wwwroot
git clone 你的仓库地址 xiaoe-api
cd xiaoe-api
```

`package.json` 应在当前目录（`npm install` 在此执行）。

---

## 第 4 步：配置 `.env` 环境变量

### 4.1 复制配置文件

SSH 登录服务器，或使用宝塔 **终端**：

```bash
cd /www/wwwroot/xiaoe-api
cp .env.example .env
```

也可在文件管理器中复制 `.env.example` 并重命名为 `.env`。

### 4.2 填写各项含义

用宝塔 **文件** 编辑 `.env`：

```env
PORT=3000

WX_APPID=wx69d8ada06130a2ad
WX_APPSECRET=这里填小程序AppSecret

JWT_SECRET=这里填一长串随机字符

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=xiaoe
DB_PASSWORD=第1步创建的数据库密码
DB_NAME=xiaoe
```

| 变量 | 如何获取 |
|------|----------|
| `WX_APPID` | 与 `project.config.json` 中 `appid` 一致，当前为 `wx69d8ada06130a2ad` |
| `WX_APPSECRET` | [微信公众平台](https://mp.weixin.qq.com) → 开发 → 开发管理 → 开发设置 → **AppSecret**（需管理员扫码，可重置） |
| `JWT_SECRET` | 自己生成，勿泄露。终端执行：`openssl rand -hex 32`（无 openssl 可随便敲 32 位以上随机字母数字） |
| `DB_*` | 第 1 步创建的数据库信息 |

**安全提醒：** `.env` 不要提交到 Git；不要发给他人。

### 4.3 获取 AppSecret 图文路径

1. 登录 https://mp.weixin.qq.com
2. 左侧 **开发** → **开发管理**
3. 右侧 **开发设置** 页
4. 找到 **AppID(小程序ID)**、**AppSecret(小程序密钥)**
5. 若 Secret 未显示，点击 **重置** 并保存（重置后旧 Secret 失效）

---

## 第 5 步：安装依赖并启动 Node

### 5.1 安装 Node（若服务器还没有）

宝塔 **软件商店** → **Node 版本管理器** → 安装 **v18** 或 **v20**，并设为默认。

或 SSH：

```bash
# 示例：使用 NodeSource（以 Ubuntu 为例，CentOS 请查对应文档）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # 应 >= v18
```

### 5.2 安装项目依赖

```bash
cd /www/wwwroot/xiaoe-api
npm install --production
```

无报错即成功（会生成 `node_modules/`）。

### 5.3 先手动试跑（建议）

```bash
cd /www/wwwroot/xiaoe-api
npm start
```

看到 `xiaoe-api listening on http://127.0.0.1:3000` 表示启动成功。

另开一个终端测试：

```bash
curl http://127.0.0.1:3000/health
```

应返回：`{"ok":true,"ts":...}`

按 `Ctrl+C` 停止手动进程，再用 PM2 常驻。

### 5.4 使用 PM2 守护（推荐）

**方法 1：宝塔 PM2 管理器（PM2 项目 → 自定义添加）**

| 表单项 | 填写示例 | 说明 |
|--------|----------|------|
| 项目名称 | `qsy-api` 或 `xiaoe-api` | 与 `deploy.env` 里 `PM2_NAME` 一致 |
| Node 版本 | `v20.x` | ≥18 即可 |
| 添加方式 | **自定义添加** | |
| **启动文件** | `src/index.js` | 相对运行目录，对应 `npm start` |
| **运行目录** | `/www/wwwroot/qsy-api` | 代码根目录（含 `package.json`） |
| 负载实例数量 | `1` | API 单进程即可 |
| 内存上限 | `512`～`1024` MB | 按服务器内存调整 |
| 自动重载 | 可选开启 | |
| 包管理器 | **npm**（推荐） | 仓库有 `package-lock.json`；用 pnpm 需在 `deploy.env` 设 `PACKAGE_MANAGER=pnpm` |

保存并启动；状态为 **运行中**。首次部署前需在运行目录放好 `.env`（见第 4 步），否则进程会启动失败。

**一键上传部署（替代 FTP）**

1. 本机复制 `deploy.env.example` → `deploy.env`，填写 `DEPLOY_HOST`、`DEPLOY_PATH`、`PM2_NAME`
2. 配置 SSH 免密（推荐）：本机 `ssh-keygen`，公钥写入服务器 `~/.ssh/authorized_keys`
3. 在项目根目录执行：
   - **Windows（推荐）**：`.\deploy.cmd` 或双击 `deploy.cmd`（无需改 PowerShell 执行策略）
   - Windows PowerShell：`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy.ps1`
   - Git Bash：`bash scripts/deploy.sh`（路径用正斜杠，不要写 `bash .\scripts\...`）

脚本会打包上传代码（不含 `node_modules`、`.env`）、在服务器安装依赖并 `pm2 restart`。

**方法 2：命令行 PM2**

```bash
cd /www/wwwroot/xiaoe-api
npm install -g pm2
pm2 start src/index.js --name xiaoe-api
pm2 save
pm2 startup    # 按提示执行一行命令，实现开机自启
```

常用命令：

```bash
pm2 list
pm2 logs xiaoe-api
pm2 restart xiaoe-api
```

### 5.5 防火墙说明

- **不要** 对公网开放 3000 端口
- 只让 Nginx 在本机 `127.0.0.1:3000` 反代即可
- 宝塔 **安全** 里放行 **80、443** 即可

---

## 第 6 步：添加网站 + Nginx 反向代理

假设 API 域名为：`api.example.com`（请换成你的真实域名）。

### 6.1 添加站点

1. 宝塔 → **网站** → **添加站点**
2. 域名：`api.example.com`
3. 根目录：默认 `/www/wwwroot/api.example.com` 即可（本 API 不托管静态页，目录几乎不用）
4. PHP：选 **纯静态** 或 **不创建 PHP**
5. 数据库：不创建
6. 提交

### 6.2 申请 SSL 证书（必须 HTTPS）

1. 网站列表 → 你的站点 → **设置**
2. **SSL** → **Let's Encrypt**
3. 勾选域名 `api.example.com` → **申请**
4. 申请成功后打开 **强制 HTTPS**

> 微信小程序 `request` 只支持 **https**，且证书需有效，不能用自签证书。

### 6.3 配置反向代理

仍在站点 **设置** 中：

1. 左侧 **反向代理** → **添加反向代理**
2. 配置：
   - 代理名称：`xiaoe-api`
   - 目标 URL：`http://127.0.0.1:3000`
   - 发送域名：`$host`
   - 开启 **缓存**：关闭（API 建议关闭缓存）
3. 提交

或使用 **配置文件** 自定义（高级用户），在 `server` 块内增加：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

保存后 **重载 Nginx**。

### 6.4 验证 HTTPS

浏览器或手机访问：

```
https://api.example.com/health
```

应看到 JSON：`{"ok":true,"ts":...}`

若 502 Bad Gateway：检查 PM2 是否在跑、`PORT` 是否为 3000、反代地址是否正确。

---

## 第 7 步：微信公众平台配置 request 合法域名

1. 登录 https://mp.weixin.qq.com
2. **开发** → **开发管理** → **开发设置**
3. 找到 **服务器域名**
4. 点击 **修改**（每月有次数限制，确认后再保存）
5. 在 **request 合法域名** 中添加（不要带路径、不要末尾斜杠）：

   ```
   https://api.example.com
   ```

   面板里通常只填域名：`api.example.com`（以微信后台输入框说明为准，多数版本 **不带** `https://`）

6. 保存后等待生效（通常几分钟内）

**注意：**

- 域名必须已备案（若服务器在中国大陆）
- 必须已配置有效 SSL
- 开发者工具可勾选「不校验合法域名」做本地调试；**真机预览/正式版必须配置**

---

## 第 8 步：修改小程序 `API_BASE`

编辑项目 `utils/config.js`：

```javascript
const API_BASE = "https://api.example.com"
```

保存后，微信开发者工具 **编译** → 真机调试。

登录逻辑：启动时 `wx.login` → 请求 `POST https://api.example.com/api/login`。

`CLOUD_ENV` **保留**，`parseVideo` 仍走云函数。

---

## 第 9 步：完整自测清单

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 浏览器打开 `https://api.example.com/health` | `ok: true` |
| 2 | 开发者工具打开小程序，填好 `API_BASE` | 编译无报错 |
| 3 | 控制台/Network 看启动请求 | 有 `POST .../api/login` |
| 4 | 登录成功 | 个人中心显示用户编号（publicId），非纯游客 |
| 5 | 首页粘贴链接解析 | 仍可用（云函数未关） |

### 用 curl 测登录（仅服务端，需有效 code）

`code` 只能由小程序 `wx.login()` 产生且 **5 分钟有效**，一般不在服务器手测。以小程序真机为准即可。

---

## 常见问题

### 1. `502 Bad Gateway`

- PM2 进程是否运行：`pm2 list`
- `.env` 是否配置错误导致启动即退出：`pm2 logs xiaoe-api`
- Nginx 反代是否指向 `127.0.0.1:3000`

### 2. `500` / 登录失败 / 无法获取 openid

- `WX_APPSECRET` 是否与当前小程序一致、是否多/copy 了空格
- `code` 是否过期（重复用旧 code 会失败）
- 服务器能否访问外网（需请求 `api.weixin.qq.com`）

### 3. 小程序提示「不在以下 request 合法域名列表中」

- 域名是否已在公众平台配置
- 是否用了 `http` 而非 `https`
- 真机是否未勾选「不校验合法域名」却仍用未配置域名

### 4. MySQL 连接失败

- `DB_HOST` 一般为 `127.0.0.1`
- 用户名、密码、库名与宝塔创建的一致
- 表是否已导入

### 5. 改了 `.env` 不生效

```bash
pm2 restart xiaoe-api
```

### 7. 添加 Node 项目提示「未安装 PM2 管理器」

宝塔已把 Node 托管迁到 **网站 → Node 项目**，旧版 **PM2 管理器** 插件常与此冲突或检测失败（插件描述里红字也会写「请前往网站→Node项目」）。

**推荐做法（二选一）：**

**A. 修好面板添加（保留 Node 版本管理器）**

1. 软件商店确认已安装 **Node.js 版本管理器**（你已有 2.7）
2. 打开 **Node.js 版本管理器** → 安装 **v20** → 点 **「设置命令行版本」** 为 v20（必做，否则面板认为没 Node/PM2）
3. 若同时装了 **PM2 管理器** 仍报错：在 PM2 管理器里 **修复** 一次；仍不行可 **卸载 PM2 管理器**（只卸插件，不删代码），仅用 Node 版本管理器 + 网站→Node 项目（论坛有用户反馈卸载旧 PM2 插件后恢复正常）
4. **网站 → Node 项目 → 添加 Node 项目**（不要从旧 PM2 管理器入口加）
5. 若仍提示未安装：SSH 用 **与面板相同的 Node** 全局装 pm2（路径按你机器为准，常见如下）：

   ```bash
   # 先看 node 在哪
   which node
   # 示例：用宝塔 Node 20 装 pm2
   /www/server/nvm/versions/node/v20.20.0/bin/npm install -g pm2
   pm2 -v
   ```

   装好后回到面板再添加 Node 项目。

**B. 不用面板，SSH + PM2（最稳，与一键部署脚本一致）**

```bash
cd /www/wwwroot/qsy-api
cp .env.example .env   # 首次：编辑 .env
npm install --omit=dev
npm install -g pm2
pm2 start src/index.js --name qsy-api
pm2 save
pm2 startup   # 按提示执行一行 sudo 命令
curl http://127.0.0.1:3000/health
```

之后本机 `.\scripts\deploy.ps1` 只会 `pm2 restart`，**不依赖** 面板里的 PM2 管理器是否显示正常。

### 8. 头像上传了但小程序/后台不显示

1. **服务器 `.env` 必须配置**（与域名一致、用 HTTPS）：
   ```env
   PUBLIC_BASE_URL=https://kit.baimengyan.cn
   ```
   改完后：`pm2 restart qsy-api`

2. **浏览器直接测**：打开（把文件名换成库里 `avatar_url` 的文件名）  
   `https://kit.baimengyan.cn/uploads/avatars/xxx.jpg`  
   - 404：检查服务器 `/www/wwwroot/qsy-api/uploads/avatars/` 是否有文件；Nginx 是否整站反代到 `127.0.0.1:3000`（不要只反代 `/api`）。  
   - 能打开但小程序不显示：微信公众平台 → 开发设置 → **downloadFile 合法域名** 增加 `https://kit.baimengyan.cn`（与 request 域名相同域名即可）。

3. **小程序清缓存**：删除小程序后重新进入，或退出再登录，避免本地仍缓存旧的空头像或 `http://` 地址。

4. 一键部署**不会覆盖**服务器已有 `uploads/`，头像文件在服务器本地，勿删该目录。

### 7. 国内服务器域名未备案

微信要求合法域名可访问；国内机房通常要求域名 **ICP 备案**，否则可能无法申请 SSL 或被封禁 80/443。

---

## 目录与端口速查

| 项目 | 值 |
|------|-----|
| 代码路径（示例） | `/www/wwwroot/xiaoe-api` |
| Node 监听 | `127.0.0.1:3000` |
| 健康检查 | `GET /health` |
| 登录接口 | `POST /api/login` |
| 小程序配置 | `utils/config.js` → `API_BASE` |

---

## 管理后台 API（kunkit-admin）

在 `.env` 增加：

```env
ADMIN_API_KEY=随机长字符串
```

重启 Node 后可用：

- `GET /api/admin/users` — Header: `X-Admin-Key: <密钥>`
- `GET /api/admin/stats`

`kunkit-admin` 的 `.env.local` 中 `ADMIN_API_KEY` 须与此一致。

---

## 下一步（可选）

- 邮箱验证码、绑定邮箱：在 `src/routes/` 增加接口，复用 `middleware/auth.js`
- 解析迁到自建：新增 `POST /api/parse-video`，小程序改 `callCloud` 为 `requestApi`
- 定期备份宝塔 MySQL 数据库

部署中若某一步报错，把 **PM2 日志** 和 **浏览器/curl 返回内容** 记下来便于排查。
