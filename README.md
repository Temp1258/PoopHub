# Couple Buzz / 拉无忧

> 一款面向两个人的亲密互动 App。让日常的小事攒成关系里的仪式感。

仓库是一个 monorepo，包含两个独立项目：

- [`couple-buzz-app/`](./couple-buzz-app) — Expo / React Native 移动端（iOS 主）
- [`couple-buzz-server/`](./couple-buzz-server) — Node.js + Express + SQLite 后端

---

## 功能

### 互动
- **30+ 表情动作**：想你 / 爱你 / 亲亲 / 抱抱 / 害羞 / 哭哭 / 生气 / 晒特 / Ping 等多类一键发送
- **APNs 推送 + Haptic 振动**：每个动作推送到对方手机，伴随触感反馈
- **实时摸一摸**：双方在线时通过 WebSocket 同步按压，主页心跳动画
- **同时在线感知**：两人同时打开 App 时主页提示「你们正在同时想着对方 💓」
- **聊天式废话区**：历史消息按日聚合，长按对方消息可表情回应
- **时区感知**：每条记录按双方各自所在时区分别显示时间
- **底部表情面板**：上滑即出，分类（爱意 / 心情 / 日常 / 找你）网格选择

### 仪式
- **每日问答**：1000+ 题题库，双方都作答后才互相揭晓答案；按北京时间 0 点切题，距下次刷新倒计时精确到秒
- **早安 / 晚安打卡**：按本地时区窗口（早 4-13 点 / 晚 18-4 点）开放；双方都打卡后展示当日互动 recap
- **每日快照**：每天一张前置自拍，按月日历查看
- **树洞信箱**：每天 AM (北京时间 8:00-20:00) / PM (20:00-次日 8:00) 双场，**写完即封存**不能修改，到点同时揭晓；揭晓倒计时实时跳秒
- **时间胶囊**：写一封信给未来某天的自己，到期才能开启
- **心愿清单**：一起完成的 bucket list，分类管理，完成 / 删除会推送通知对方

### 数据
- **互动统计**：总互动数、双方对比、最爱表情 Top 5、按月趋势
- **恋爱周报**：本周互动量、与上周对比、连续天数、温度评分（互动 + 问答 + 打卡 + 连续天数四项加权）
- **连续互动 streak**：双方都活跃的连续天数
- **多纪念日管理**：增删改、置顶倒数（首页显示）、支持每年重复

### 系统
- **OTA 热更新**：纯 JS 改动通过 EAS Updates 秒推到手机，无需重 build
- **JWT 双 token**：access 15 分钟 / refresh 90 天；refresh token 自动轮换；支持按版本号即时吊销所有 session
- **限流**：注册 / 配对 / 认证 / 普通 API 各自独立的速率限制
- **健康检查端点**：`GET /health`
- **下拉刷新**：每日 / 信箱 / 数据三 tab 都支持下拉刷新
- **加密备份**：SQLite 每日 GPG 公钥加密备份，私钥离线保管（见 [`couple-buzz-server/docs/BACKUP.md`](./couple-buzz-server/docs/BACKUP.md)）

### 待补
- **iOS WidgetKit 小组件**：桌面卡片代码框架已搭好（`couple-buzz-app/targets/widget/`），但 RN 端写入 App Group UserDefaults 的桥接尚未接通，预计 v1.1 完成

---

## 技术栈

### 移动端
- React Native 0.81 · React 19 · Expo SDK 54 · TypeScript
- React Navigation v7（material-top-tabs，五 tab 底部导航）
- Socket.IO Client（实时触碰）
- Expo Notifications / Haptics / ImagePicker / Updates / FileSystem
- `@bacons/apple-targets` 构建原生 iOS Widget
- EAS Build（internal distribution）+ EAS Updates（OTA）

### 服务端
- Node.js · Express 4 · TypeScript
- SQLite（`better-sqlite3`，WAL 模式，启动时自动迁移 schema）
- Socket.IO 服务端（基于一次性 ticket 的握手鉴权）
- `@parse/node-apn`（APNs HTTP/2 推送，自动清理失效 token）
- Multer（图片上传，5MB 限制 + MIME 白名单）
- JWT + scrypt 密码哈希
- Jest + supertest（60+ 接口测试用例）
- express-rate-limit

---

## 项目结构

```
PoopHub/
├── couple-buzz-app/                # Expo / RN 移动端
│   ├── App.tsx                     # 入口 + 5 tab 路由 + 推送/socket 生命周期
│   ├── app.config.ts               # Expo + EAS 配置
│   ├── eas.json                    # EAS Build profile
│   ├── package.json                # 含 ota:preview 发布脚本
│   ├── src/
│   │   ├── screens/                # Home / History / Us / Mailbox / Settings / Setup
│   │   ├── components/             # 12 个功能 card + TouchArea + ActionRecord 等
│   │   ├── services/               # api / socket / notification
│   │   ├── utils/                  # storage (AsyncStorage 封装) / countdown (倒计时 hook)
│   │   └── constants.ts            # 颜色 / 动作配置
│   └── targets/widget/             # iOS WidgetKit 原生目标（Swift）
│
└── couple-buzz-server/             # Node.js 后端
    ├── src/
    │   ├── index.ts                # Express 入口 + 中间件 + 限流
    │   ├── routes.ts               # 全部 REST 路由（/api/...）
    │   ├── socket.ts               # WebSocket touch / presence
    │   ├── auth.ts                 # JWT 签发 / scrypt 密码 / 鉴权中间件
    │   ├── db.ts                   # SQLite schema + 全部 SQL 操作
    │   ├── push.ts                 # APNs 推送 + 推送文案模板
    │   ├── scheduler.ts            # 周期任务（信箱开启/揭晓/胶囊解锁/周报）
    │   └── questions.ts            # 1000+ 每日问答题库
    ├── scripts/backup.sh           # SQLite 定时备份脚本
    └── data/                       # 运行时 DB 与 snap 上传目录（gitignore）
```

---

## 本地开发

### 前置
- Node.js 20.x（与 EAS Build 用同一大版本）
- Xcode + iOS 模拟器（或 Expo Go / EAS Development Build）
- Apple Developer 账号（启用 APNs 推送时需要）

### 启动后端
```bash
cd couple-buzz-server
npm install
cp .env.example .env        # 填 JWT_SECRET、APN_* 等
npm run dev                 # ts-node + nodemon
```

服务默认监听 `127.0.0.1:3000`。首次启动自动建表，上传图片放 `data/snaps/`。

### 启动 App
```bash
cd couple-buzz-app
npm install
npm run ios                 # 或 npm start 扫码
```

首次登录需要两端配对：A 注册后获得 6 位 ID（去掉容易混淆的字符），B 注册后在配对页输入 A 的 ID 即可绑定。

### 跑测试
```bash
cd couple-buzz-server
JWT_SECRET=test-secret npm test
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
| `API_URL` | 后端地址。**留空 / 删除** 会兜底到 `app.config.ts` 默认值（生产 URL），不会污染线上 OTA |

> 本地调试连本地服务时，建议用 `API_URL=http://192.168.x.x:3000 npm start` inline 注入，**不要修改 `.env` 文件**——避免脏数据被 EAS Update 烤进生产 bundle。

---

## 部署

### 服务端
自托管 Node.js 进程（pm2 守护），SQLite 单机数据库。`scripts/backup.sh` 配合 cron 做每日备份（保留最近 30 份）。生产环境前端经由反向代理提供 HTTPS。

### 移动端
- **首次 / native 改动**：`eas build --profile preview --platform ios`，出 internal distribution IPA，Ad Hoc provisioning profile 直接安装到设备
- **后续纯 JS 改动**：`npm run ota:preview`（仓库根的 npm 脚本会 inline 注入生产 `API_URL`，避免本地 `.env` 把 dev URL 烤进 bundle）

OTA 推送后手机端**冷启动两次**生效（首次仍跑旧 bundle，第二次拉到新版本）。

---

## 许可
[MIT License](./LICENSE) — 自由使用 / 修改 / 商用，唯一要求是保留版权声明。
