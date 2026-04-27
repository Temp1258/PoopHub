# 拉无忧 · Couple Buzz

> 一款专为情侣两人设计的亲密互动 App。把日常的小事攒成关系里的仪式感。

[![Tests](https://img.shields.io/badge/tests-87%20passing-success)](./couple-buzz-server)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-iOS-lightgrey)]()
[![Stack](https://img.shields.io/badge/stack-RN%20%2B%20Expo%20%2B%20Node-brightgreen)]()

仓库是 monorepo，含两个独立项目：

- [`couple-buzz-app/`](./couple-buzz-app) — Expo / React Native 移动端（iOS 主）
- [`couple-buzz-server/`](./couple-buzz-server) — Node.js + Express + SQLite 后端

---

## 功能（按 tab 组织）

App 底部 5 个 tab：**拍拍 · 废话区 · 每日 · 信箱 · 数据**。

### 🤚 拍拍（Home）
- **实时摸一摸**：双方在线时按住屏幕同步，主页心跳动画 + 持续 haptic
- **同时在线感知**：两人同时打开 App 时主页提示「你们正在同时想着对方 💓」
- **顶部状态条**：连续天数 🔥 / 置顶纪念日倒数 / 双方在线指示

### 💬 废话区（History）
- **50+ 表情一键发**：4 类网格（表达爱意 / 心情 / 日常 / 找你），上滑出下滑收
- **APNs 推送 + Haptic**：每个动作推送对方手机 + 触感反馈
- **聊天式时间线**：按日聚合，长按对方消息可表情回应
- **时区感知**：每条记录按双方各自所在时区分别显示时间
- **桌面 badge 真实未读数**：iOS 图标右上角显示对方发的未读消息数（一次性 mark-read 防客户端越权）

### 📅 每日（Daily）
- **早安/晚安打卡**：按本地时区窗口（早 4-13 点 / 晚 18-4 点）开放；双方都打卡后展示当日互动 recap
- **每日问答**：1000+ 题题库，双方都作答后才互相揭晓；按北京时间 0 点切题，距下次刷新倒计时精确到秒
  - 一次性 👍 / 👎 互评 + 评价后推送通知对方
  - 自己已答对方未答时显示「⏰ 快答！」催答按钮（30s cooldown）
- **每日快照**：每天一张前置自拍，按月日历查看
  - 同样支持一次性 👍 / 👎 互评 + 「⏰ 拍照！」催拍按钮
  - 上传 atomic（写 tmp → 校验 → rename），防绕过 client 覆盖已有照片

### 📮 信箱（Mailbox）
- **树洞信箱**：每天 AM (北京 8:00-20:00) / PM (20:00-次日 8:00) 双场，**写完即封存**不能修改，到点同时揭晓；揭晓倒计时实时跳秒
- **时间胶囊**：写一封信给未来某天的自己或对方
  - **可选可见性**：给自己看（私密）或给对方看
  - 给对方时立即推送通知 ta + 显示精确到日和小时的开启倒计时
  - 防越权：'self' 胶囊服务端校验作者身份，partner 即使猜中 id 也无法 open
- **心愿清单**：一起完成的 bucket list，分类管理
  - 完成时二次确认 + **屏幕烟花动画庆祝** + 推送带具体心愿名给对方

### 📊 数据（Stats）
- **双方 ID 卡片**：左右并列展示
- **互动统计**：总互动数、双方对比、最爱表情 Top 5、按月趋势
- **恋爱周报**：本周互动量、与上周对比、连续天数、温度评分（互动 + 问答 + 打卡 + 连续天数四项加权）
- **多纪念日管理**：增删改、置顶倒数（首页显示）、支持每年重复
  - 年/月/日**三段下拉选择**（不再用日历点击，方便选 20 年前的纪念日）
  - 已过去的不重复纪念日自动显示「已经 N 天啦！」
- **对 ta 的备注**：仅自己可见的私密昵称
- **昵称 + 时区设置**：时区像 ID 一样并列显示，点选即自动保存

---

## 系统能力

- **iOS WidgetKit 小组件**：桌面卡片框架已搭好（`couple-buzz-app/targets/widget/`），数据接通排期 v1.1
- **OTA 热更新**：纯 JS 改动通过 EAS Updates 秒推到手机，无需重 build
- **JWT 双 token**：access 15 分钟 / refresh 90 天；refresh token 自动轮换；token_version 字段支持即时吊销所有 session
- **限流分层**：注册 / 配对 / 认证 / 普通 API 各自独立的速率限制
- **健康检查**：`GET /health`
- **下拉刷新**：每日 / 信箱 / 数据三 tab 都支持
- **加密备份**：每日 03:00 GPG 公钥加密 SQLite，私钥离线保管，详见 [`couple-buzz-server/docs/BACKUP.md`](./couple-buzz-server/docs/BACKUP.md)

---

## 技术栈

### 移动端
- **React Native 0.81 · React 19 · Expo SDK 54 · TypeScript**
- React Navigation v7（material-top-tabs，5 tab 底部导航）
- Socket.IO Client（实时触碰 + presence）
- Expo Notifications / Haptics / ImagePicker / Updates / FileSystem
- `@bacons/apple-targets`（iOS Widget 原生构建）
- EAS Build (internal IPA) + EAS Updates (OTA)

### 服务端
- **Node.js 20 · Express 4 · TypeScript**
- SQLite（`better-sqlite3` WAL 模式，启动时自动迁移 schema）
- Socket.IO Server（一次性 ticket 30s TTL 鉴权）
- `@parse/node-apn`（APNs HTTP/2 推送，失效 token 自动清理）
- Multer（图片上传 5MB + image MIME 白名单 + atomic tmp/rename 防覆写）
- JWT + scrypt 密码哈希
- Jest + supertest（**87 个接口测试用例**）
- express-rate-limit
- GPG 加密备份 + cron + 离线私钥

---

## 安全（v1.0 完整审计通过）

| 维度 | 实现 |
|---|---|
| 密码 | scrypt + `crypto.timingSafeEqual`（防时序攻击）|
| Token | JWT 双 token + token_version 即时吊销 + refresh token 哈希存储 + 自动轮换 |
| 图片访问 | HMAC 签名 URL（1h TTL + timing-safe verify + 路径正则严格） |
| WebSocket | 一次性 ticket 30s TTL + origin 白名单 |
| SQL 注入 | 全部 74 个 statement 参数化绑定，零字符串拼接 |
| 输入校验 | typeof + length 上限 + YYYY-MM-DD 严格格式 + reaction 一次性服务端锁 |
| 文件上传 | atomic tmp+rename + DB pre-check + 5MB + MIME 白名单 |
| 路径穿越 | regex 严格 + HMAC + 文件名/路径不取自 client 输入 |
| 随机源 | `crypto.randomInt` 生成用户 ID / 配对码 |
| 限流 | 注册 / 配对 / 认证 / API 分层 |
| Badge 计数 | 服务端真实未读数 + clamp 防客户端越权推进读位指针 |
| 时间胶囊 | self 可见性服务端校验（防 partner 猜 id 越权读取） |
| 数据备份 | GPG 公钥加密（AES-256），私钥离线 U 盘 + 密码管理器 passphrase |

---

## 项目结构

```
PoopHub/
├── couple-buzz-app/                   # Expo / RN 移动端
│   ├── App.tsx                        # 入口 + 5 tab 路由 + push/socket 生命周期
│   ├── app.config.ts                  # Expo + EAS 配置
│   ├── eas.json                       # EAS Build profile
│   ├── src/
│   │   ├── screens/                   # Home / History / Us / Mailbox / Settings / Setup
│   │   ├── components/                # BucketList / TimeCapsule / FireworksOverlay / ...
│   │   ├── services/                  # api / socket / notification
│   │   ├── utils/                     # storage / countdown
│   │   └── constants.ts               # 颜色 / 表情配置
│   └── targets/widget/                # iOS WidgetKit Swift（v1.1 接通）
│
└── couple-buzz-server/
    ├── src/
    │   ├── index.ts                   # Express 入口 + 中间件 + 限流
    │   ├── routes.ts                  # REST API
    │   ├── socket.ts                  # WebSocket touch / presence
    │   ├── auth.ts                    # JWT / scrypt / HMAC 图片签名
    │   ├── db.ts                      # SQLite schema + 全部 SQL 操作
    │   ├── push.ts                    # APNs + 推送模板
    │   ├── scheduler.ts               # 信箱 / 胶囊解锁 / 周报定时
    │   └── questions.ts               # 1000+ 每日问答题库
    ├── docs/BACKUP.md                 # GPG 加密备份完整运维指南
    ├── scripts/backup.sh              # GPG 加密备份脚本
    ├── scripts/secure-existing-backups.sh  # 一次性处理历史明文备份
    └── data/                          # 运行时 DB 与 snap 上传目录（gitignore）
```

---

## 本地开发

### 前置
- Node.js 20.x
- Xcode + iOS 模拟器（或 Expo Go / EAS Development Build）
- Apple Developer 账号（启用 APNs 推送时需要）

### 启动后端
```bash
cd couple-buzz-server
npm install
cp .env.example .env        # 填 JWT_SECRET、APN_* 等
npm run dev                 # ts-node + nodemon
```

服务默认监听 `127.0.0.1:3000`。首次启动自动建表 + 跑 schema migration，上传图片放 `data/snaps/`。

### 启动 App
```bash
cd couple-buzz-app
npm install
npm run ios                 # 或 npm start 扫码
```

首次登录两端配对：A 注册后获得 6 位 ID（去掉容易混淆的字符），B 注册后在配对页输入 A 的 ID 即可绑定。

### 跑测试
```bash
cd couple-buzz-server
JWT_SECRET=test-secret npm test
# 87 passed
```

---

## 环境变量

### `couple-buzz-server/.env`
| Key | 说明 |
| --- | --- |
| `PORT` | HTTP 端口，默认 `3000` |
| `HOST` | 绑定地址，默认 `127.0.0.1` |
| `JWT_SECRET` | JWT 签名密钥（**必填**，未设置启动会主动报错） |
| `APN_KEY_ID` | Apple APNs Key ID |
| `APN_TEAM_ID` | Apple Team ID |
| `APN_KEY_PATH` | `.p8` 私钥路径，默认 `./certs/AuthKey.p8` |
| `APN_BUNDLE_ID` | iOS Bundle ID |
| `APN_PRODUCTION` | 生产 APNs 网关开关；Ad Hoc 安装的 IPA 需要 `true` |

### `couple-buzz-app/.env`
| Key | 说明 |
| --- | --- |
| `API_URL` | 后端地址。**留空 / 删除** 会兜底到 `app.config.ts` 默认值（生产 URL） |

> 本地调试连本地服务时，建议用 `API_URL=http://192.168.x.x:3000 npm start` inline 注入，**不要修改 `.env` 文件** —— 避免脏数据被 EAS Update 烤进生产 bundle。

---

## 部署

### 服务端
- 自托管 Node.js 进程（pm2 守护），SQLite 单机数据库
- 反向代理（nginx / Caddy）终止 HTTPS
- `scripts/backup.sh` 配合 cron 每天 03:00 跑 GPG 加密备份（保留最近 30 份），私钥离线保管
- 异地备份：Mac 端 launchd 23:00 用 rsync 拉到 iCloud Drive（私钥可解密）

详细备份运维流程见 [`couple-buzz-server/docs/BACKUP.md`](./couple-buzz-server/docs/BACKUP.md)。

### 移动端
- **首次 / native 改动**：`eas build --profile preview --platform ios`，出 internal distribution IPA，Ad Hoc provisioning profile 直接安装
- **后续纯 JS 改动**：`npm run ota:preview`（仓库脚本 inline 注入生产 `API_URL`）

OTA 推送后手机端**冷启动两次**生效。

---

## Roadmap

### v1.1 计划
- [ ] iOS Widget：接通数据写入 App Group UserDefaults（结构已搭好，差 native bridge）
- [ ] 备份失败主动告警（cron 失败邮件 / pushover 通知）
- [ ] 异地备份多云冗余（自动 sync 到 Google Drive / Dropbox）
- [ ] Android 测试

### 未来想法
- [ ] 端到端加密：mailbox / capsule 用对方公钥加密
- [ ] 视频快照
- [ ] 语音留言

---

## 致谢

为我和我的另一半而做。如果你也想给伴侣做一个，欢迎 fork。

## 许可

[MIT License](./LICENSE) — 自由使用 / 修改 / 商用，唯一要求是保留版权声明。
