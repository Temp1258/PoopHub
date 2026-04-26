# Couple Buzz

一款面向两个人的亲密互动 App：实时触碰、表情动作、每日问答、每周挑战、纪念日倒数、树洞信箱、时间胶囊，把日常小事攒成关系里的仪式感。

仓库包含两个独立项目：

- [`couple-buzz-app/`](./couple-buzz-app) — Expo / React Native 移动端（iOS 为主，含 iOS 小组件）
- [`couple-buzz-server/`](./couple-buzz-server) — Node.js + Express + SQLite 后端，负责业务、实时通信与推送

---

## 功能概览

**核心交互**
- 24 种情绪 / 日常 / 示爱动作一键发送，配合 APNs 推送和 haptic 振动反馈
- 实时「摸一摸」：双方在线时通过 WebSocket 同步触碰与振动
- 双方在线自动记录「同时出现」的巧合时刻
- 历史消息分日聚合，支持表情回应

**关系仪式**
- 每日问题：双方作答后互相揭晓
- 早安 / 晚安打卡：按各自时区计算时间窗口
- 每周挑战：85 个挑战，动作计数 / 打卡天数 / 动作种类 / 自由命题写作等
- 树洞信箱：周五开启、周日揭晓的匿名周信
- 时间胶囊：写给未来某天的信件
- 愿望清单：一起完成的 bucket list

**记录与数据**
- 每日一张 Daily Snap，按月日历呈现
- 连续互动天数 streak
- 心情日历热力图 / 小时级热力分布 / 每周温度报告
- 多重要纪念日，支持置顶倒数

**系统能力**
- 时区感知：每个用户和伴侣各自时区独立计算
- JWT 双 token（access 15min / refresh 90d，按版本号即时吊销）
- iOS WidgetKit 小组件（纪念日倒数）

---

## 技术栈

### 移动端
React Native 0.81 · React 19 · Expo 54 · TypeScript  
React Navigation v7 · Socket.IO Client · Expo Notifications / Haptics / Image Picker  
`@bacons/apple-targets` 构建原生 iOS Widget · EAS Build & Updates

### 服务端
Node.js · Express 4 · TypeScript · SQLite（`better-sqlite3`，WAL 模式）  
Socket.IO · `@parse/node-apn`（APNs HTTP/2）· Multer · JWT  
Jest · express-rate-limit

---

## 项目结构

```
PoopHub/
├── couple-buzz-app/           # Expo / RN 移动端
│   ├── App.tsx
│   ├── app.config.ts          # Expo + EAS 配置
│   ├── eas.json               # EAS Build profile
│   ├── src/
│   │   ├── screens/           # Home / History / Us / Settings / Setup
│   │   ├── components/        # 功能卡片与交互组件
│   │   ├── services/          # api / socket / notification / widgetBridge
│   │   └── utils/             # storage 等工具
│   └── targets/widget/        # iOS WidgetKit 原生目标
│
└── couple-buzz-server/        # Node.js 后端
    ├── src/
    │   ├── index.ts           # 入口 & 中间件
    │   ├── routes.ts          # REST 路由
    │   ├── socket.ts          # WebSocket（touch / presence）
    │   ├── auth.ts            # JWT、scrypt、token 版本控制
    │   ├── db.ts              # SQLite schema 与查询
    │   ├── push.ts            # APNs 推送
    │   ├── scheduler.ts       # 周期任务（信箱、胶囊、周报）
    │   ├── challenges.ts      # 每周挑战定义
    │   └── questions.ts       # 每日问题题库
    ├── scripts/backup.sh      # SQLite 定时备份脚本
    └── data/                  # 运行时数据目录（db 与 snaps，未入版本控制的部分在 .gitignore）
```

---

## 本地开发

### 前置

- Node.js 20.x（EAS preview profile 固定 `20.20.0`）
- npm 或 pnpm
- Xcode + iOS 模拟器（或 Expo Go / EAS Development Build）
- 一份 Apple Developer 账号信息用于推送（可选）

### 启动后端

```bash
cd couple-buzz-server
npm install
cp .env.example .env        # 填 JWT_SECRET、APN_* 等
npm run dev                 # ts-node + nodemon
```

服务默认监听 `PORT=3000`。启动后会在 `data/app.db` 自动建表，上传的图片放 `data/snaps/`。

### 启动 App

```bash
cd couple-buzz-app
npm install
cp .env.example .env        # API_URL 指向上面的后端
npm run ios                 # 或 npm start 扫码
```

首次登录需要两端配对：A 注册后会得到 6 位 ID，B 注册后在设置中填写 A 的 ID 即可完成绑定。

---

## 环境变量

### `couple-buzz-server/.env`

| Key | 说明 |
| --- | --- |
| `PORT` | HTTP 端口，默认 `3000` |
| `HOST` | 绑定地址，默认 `127.0.0.1` |
| `JWT_SECRET` | JWT 签名密钥（必填） |
| `APN_KEY_ID` | Apple APNs Key ID |
| `APN_TEAM_ID` | Apple Team ID |
| `APN_KEY_PATH` | `.p8` 私钥路径，默认 `./certs/AuthKey.p8` |
| `APN_BUNDLE_ID` | Bundle ID，默认 `com.couplebuzz.app` |
| `APN_PRODUCTION` | 生产 APNs 网关开关 |

### `couple-buzz-app/.env`

| Key | 说明 |
| --- | --- |
| `API_URL` | 后端地址，如 `http://localhost:3000` |

---

## 构建与部署

**App 端**：使用 EAS Build（profile 定义在 `couple-buzz-app/eas.json`）。`development` / `preview` 两套 profile 均指向生产 API；`preview` 用于真机 internal distribution，是日常发布通道。OTA 更新走 EAS Updates，`runtimeVersion` 跟随 `appVersion`，发布命令 `npm run ota:preview`。

**Server 端**：自托管 Node.js 进程，SQLite 作为单机数据库。`scripts/backup.sh` 配合 cron 做每日备份（保留最近 30 份）。生产环境前端通常经由 HTTPS 反代（域名：`api.couple-buzz.com`）。

---

## 许可

本仓库为个人项目，暂未开源协议声明。如需引用或复用代码，请联系作者。
