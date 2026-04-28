# 拉无忧 · Couple Buzz

> 一款专为情侣两人设计的亲密互动 App。把日常的小事攒成关系里的仪式感。

[![Release](https://img.shields.io/badge/release-v1.0.2-ff69b4)](https://github.com/Temp1258/PoopHub/releases/tag/v1.0.2)
[![Tests](https://img.shields.io/badge/tests-95%20passing-success)](./couple-buzz-server)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-iOS-lightgrey)]()
[![Stack](https://img.shields.io/badge/stack-RN%20%2B%20Expo%20%2B%20Node-brightgreen)]()

仓库是 monorepo，含两个独立项目：

- [`couple-buzz-app/`](./couple-buzz-app) — Expo / React Native 移动端（iOS 主）
- [`couple-buzz-server/`](./couple-buzz-server) — Node.js + Express + SQLite 后端

---

## 功能（按 tab 组织）

App 底部 6 个 tab：**拍拍 · 废话区 · 每日 · 信箱 · 约定 · 数据**。

> 底部导航是自定义的**灵动岛风格 PillTabBar**：胶囊状按钮、`onPressIn` 派发瞬切（不等抬手）、上方一段 fade-up 渐变让屏幕内容自然没入工具栏；选中态粉色填充 + spring 弹性放大；4 个 tab（拍拍 / 废话区 / 每日 / 信箱）顶角有未读红点。

### 🤚 拍拍（Home）
- **实时摸一摸**：双方在线时按住屏幕同步，主页心跳动画 + 持续 haptic
- **同时在线感知**：两人同时打开 App 时主页提示「你们正在同时想着对方 💓」；重连后服务端会主动下发权威 presence 快照，避免残留状态
- **顶部状态条**：连续天数 🔥 / 置顶纪念日倒数 / 双方在线指示

### 💬 废话区（History）
- **50+ 表情一键发**：4 类网格（表达爱意 / 心情 / 日常 / 找你），上滑出下滑收
- **APNs 推送 + Haptic**：每个动作推送对方手机 + 触感反馈
- **在线静音**：对方在 App 前台时跳过 emoji 推送，红点完全由 socket 驱动，避免双端同时在线时锁屏被刷屏
- **聊天式时间线**：按日聚合，长按对方消息可表情回应
- **未读分界线 + 水滴入场**：上次离开位置自动画一条「以下是新消息」分界线，新消息以水滴 spring 入场动画落入列表
- **时区感知**：每条记录按双方各自所在时区分别显示时间
- **桌面 badge 真实未读数**：iOS 图标右上角显示对方发的未读消息数（一次性 mark-read 防客户端越权）

### 📅 每日（Daily）
- **早安/晚安打卡**：按本地时区窗口（早 4-13 点 / 晚 18-4 点）开放；双方都打卡后展示当日互动 recap
- **每日问答**：1000+ 题题库，双方都作答后才互相揭晓；按**北京时间 07:00**滚动新题，距下次刷新倒计时合并到屏幕底部
  - 一次性 👍 / 👎 互评 + 评价后推送通知对方
  - 自己已答对方未答时显示「⏰ 快答！」催答按钮（30s cooldown）
- **每日快照**：每天一张前置自拍，按月日历查看
  - 同样支持一次性 👍 / 👎 互评 + 「⏰ 拍照！」催拍按钮（5s cooldown）
  - 上传 atomic（写 tmp → 校验 → rename），防绕过 client 覆盖已有照片

### 📮 信箱（Mailbox）
- **次日达**（每日 AM 8-20 点 / PM 20-次日 8 点双场）
  - 写完即封存，**作者本人也看不到自己写的内容**直到送达（`my_sealed` 服务端标志，writing 阶段不返回 my_message）
  - 写信卡片**弹簧展开/收起**（不再是僵硬的高度切换），展开后**不自动弹键盘**——避免误触；展开/收起按钮以灵动岛 pill 形态停在屏幕底部
  - 提交时播放封信过场动画（信纸→信封→火漆 stamp）
  - 「给自己/给对方」可见性切换居中紧凑布局
  - 仅寄出后才显示倒计时，文案统一「信件将在 xx:xx:xx 后送达」，分钟级精度的友好时区名
  - 双方到点同时揭晓，自动播放开信动画（信封翻盖 → 信纸滑出 + 缩放 + 内容淡入）
- **择日达**（写一封信给未来某天）
  - 可选可见性：给自己（私密）或给对方
  - 给对方时立即推送提醒 + 显示精确到日和小时的开启倒计时
  - 写完后**作者本人也看不到内容**（GET /capsules 未开启时 content=null）
  - 防越权：'self' 胶囊服务端校验作者身份；trash/purge 后 open endpoint 也返 404（防绕过）
- **📬 收件箱**（Apple Wallet 风格）
  - 已送达的次日达 + 已开启的择日达，按时间倒序
  - 卡片层叠堆放（覆盖 75% / 露出 25%），scrollY 驱动 transform 实现 wallet cascade
  - 中央卡居中 snap，scale 1 / 邻居 0.93 / 远端 0.86 体现景深，所有卡保持 opacity 1 全部展示
  - 中央卡 tap 直接快速预览（fade + scale up，~250ms）；邻居 tap 自动滚到居中
  - **滑动 haptic + 标题栏渐变 + 未读 pill + 邮戳时间戳**
  - **右划删除**：仅中央卡可触发，飞出阈值 38% 屏宽，触发后调用 trash API + 顶部弹出灵动岛风格 toast
- **🗑️ 垃圾篓**
  - 列出所有软删除的信件，每条提供「恢复」「彻底删除」两个按钮
  - 「选择」模式：复选框 + 全选/全不选 + 批量「全部恢复」/「全部删除」
  - **彻底删除（purge）后服务端永久隐藏**：archive、capsules、open endpoint 全部拦截，无法恢复
  - 主信箱页下拉刷新一并刷新收件箱 + 垃圾篓

### 🎀 约定（Anniversary & Wishes）
> 所有「过去的约定」和「未来的约定」集中地。

- **多纪念日管理**：增删改、置顶倒数（首页显示）、支持每年重复
  - 年/月/日**三段下拉选择**（不再用日历点击，方便选 20 年前的纪念日）
  - 已过去的不重复纪念日自动显示「已经 N 天啦！」
  - 「添加纪念日」改用 App 级灵动岛 pill 入口
- **心愿清单**：一起完成的 bucket list，按分类管理（旅行 / 美食 / 活动 / 其他）
  - 「添加心愿」也是灵动岛 pill；输入框不自动 focus，避免一进页面就弹键盘
  - **创建者区分**：每条心愿左侧 4px 彩条 + 右侧 chip，自己粉色（`COLORS.kiss`）/ 对方浅蓝（`#7AB8D6`）
  - 完成时二次确认 + **屏幕烟花动画庆祝** + 推送带具体心愿名给对方

### 📊 数据（Stats）
- **双方 ID 卡片**：左右并列展示
- **互动统计**：总互动数、双方对比、最爱表情 Top 5、按月趋势
- **恋爱周报**：本周互动量、与上周对比、连续天数、温度评分（互动 + 问答 + 打卡 + 连续天数四项加权）
- **昵称 + 备注 配对行**：双方昵称、彼此私密备注左右镜像并排，编辑后居中弹出灵动岛保存 pill
- **昵称 + 时区设置**：时区像 ID 一样并列显示，点选即自动保存

---

## 系统能力

- **iOS WidgetKit 小组件**：桌面卡片框架已搭好（`couple-buzz-app/targets/widget/`），数据接通排期 v1.2
- **OTA 热更新**：纯 JS 改动通过 EAS Updates 秒推到手机，无需重 build
- **JWT 双 token**：access 15 分钟 / refresh 90 天；refresh token 自动轮换；token_version 字段支持即时吊销所有 session；并发刷新加锁防 race
- **限流分层**：注册 / 配对 / 认证 / 普通 API 各自独立的速率限制
- **多设备并发登录**：服务端 presence 用 `Map<userId, Set<socketId>>` 维护，手机+iPad 同时在线不再误报对方掉线，touch_end 仅在最后一个 touching 设备离开时广播
- **健康检查**：`GET /health`
- **下拉刷新**：每日 / 信箱 / 数据三 tab 都支持
- **加密备份**：每日 03:00 GPG 公钥加密 SQLite，私钥离线保管，详见 [`couple-buzz-server/docs/BACKUP.md`](./couple-buzz-server/docs/BACKUP.md)
- **灵动岛风格 in-app toast**：屏幕顶部胶囊形提示，slide + spring 进出（`IslandToast.tsx`）
- **顶部 scroll-bound fade**：每日 / 信箱 / 约定 / 数据 4 屏列表顶部按 `scrollY` 渐隐，与底部 PillTabBar 形成对称的内容淡入效果
- **App 级 Toolbar Slot**：`ToolbarSlotContext` 把屏幕的「写信 / 添加纪念日 / 保存备注」灵动岛 pill 提升到 App overlay 层，不会被屏幕内的渐变遮罩压住

---

## 推送与导航

- **deep-link 路由**：`react-navigation` linking 配置 + `couplebuzz://` scheme，cold-launch 用 `getInitialURL()`，warm-tap 用 `addNotificationResponseReceivedListener` 订阅；点击通知后稳定跳到对应 tab，告别手写 nav-queue
- **iOS 锁屏合并**：相同对话方向的通知合并展示，避免连续摸一摸刷屏
- **APNs payload 兼容**：服务端把所有自定义字段包在 `body` 顶级 key 下，解决 expo-notifications 从 `userInfo['body']` 取数据的兼容性问题

---

## 技术栈

### 移动端
- **React Native 0.81 · React 19 · Expo SDK 54 · TypeScript**
- React Navigation v7（material-top-tabs + 自定义 PillTabBar，6 tab 底部导航 + 顶部 swipe）
- Socket.IO Client（实时触碰 + presence）
- Expo Notifications / Haptics / ImagePicker / Updates / FileSystem / LinearGradient
- 内置 `Animated` API + `PanResponder` 实现 wallet cascade、信封开合、右划手势、PillTabBar spring（**未引入 reanimated**，所有动画 OTA 可推）
- `@bacons/apple-targets`（iOS Widget 原生构建）
- EAS Build (internal IPA) + EAS Updates (OTA)

### 服务端
- **Node.js 20 · Express 4 · TypeScript**
- SQLite（`better-sqlite3` WAL 模式，启动时自动迁移 schema）
- Socket.IO Server（一次性 ticket 30s TTL 鉴权，多设备 socket Set，重连权威 presence 快照）
- `@parse/node-apn`（APNs HTTP/2 推送，失效 token 自动清理，payload 包 `body` 兼容 expo-notifications）
- Multer（图片上传 5MB + image MIME 白名单 + atomic tmp/rename 防覆写）
- JWT + scrypt 密码哈希 + refresh token 哈希存储 + 并发轮换锁
- Jest + supertest（**95 个接口测试用例**）
- express-rate-limit
- GPG 加密备份 + cron + 离线私钥

---

## 安全（持续审计 + 漏洞修复）

| 维度 | 实现 |
|---|---|
| 密码 | scrypt + `crypto.timingSafeEqual`（防时序攻击）|
| Token | JWT 双 token + token_version 即时吊销 + refresh token 哈希存储 + 自动轮换 + 并发刷新锁 |
| 图片访问 | HMAC 签名 URL（1h TTL + timing-safe verify + 路径正则严格） |
| WebSocket | 一次性 ticket 30s TTL + origin 白名单 + 多设备 Set 维护 |
| SQL 注入 | 全部 80+ 个 statement 参数化绑定，零字符串拼接 |
| 输入校验 | typeof + length 上限 + YYYY-MM-DD 严格格式 + week/month 范围校验 + reaction 一次性服务端锁 |
| 文件上传 | atomic tmp+rename + DB pre-check + 5MB + MIME 白名单 |
| 路径穿越 | regex 严格 + HMAC + 文件名/路径不取自 client 输入 |
| 随机源 | `crypto.randomInt` 生成用户 ID / 配对码 |
| 限流 | 注册 / 配对 / 认证 / API 分层 |
| Badge 计数 | 服务端真实未读数 + clamp 防客户端越权推进读位指针 |
| 时间胶囊 | self 可见性服务端校验（防 partner 猜 id 越权读取） |
| 次日达内容封存 | writing 阶段服务端不返回作者自己的 my_message，加 my_sealed 标志 |
| Inbox 软删除 | inbox_actions 表 per-recipient 状态机（trashed / purged）；archive、capsules、open endpoint 三处统一拦截 |
| Purge 防绕过 | 彻底删除后即使直接调 POST /capsules/:id/open 也返 404，杜绝从历史 id 拿回内容 |
| 推送隐私 | scheduler 不给 self-vis 胶囊推送 partner，防止泄露用户私密信件存在 |
| 数据备份 | GPG 公钥加密（AES-256），私钥离线 U 盘 + 密码管理器 passphrase |

### v1.0.2 修复清单（[Release notes](https://github.com/Temp1258/PoopHub/releases/tag/v1.0.2)）

经仓库全量审计验证的 7 个真实漏洞：

1. **徽章数被反应（reaction）污染** — `stmtCountUnreadActions` / `stmtLatestPartnerActionId` 没过滤 `reply_to`，反应行 id > 顶层 id 时 `markRead` clamp 不到，徽章可能卡在 ≥1 永远清不掉。两条 SQL 加 `reply_to IS NULL`。
2. **登录后用户名丢失** — `/api/login` 不返回 `name`，重装登录的用户在 MailboxCard / InboxScreen / TimeCapsuleCard / HistoryScreen 全部显示「我」。服务端响应增加 `name`，客户端登录写入；`App.tsx` 启动时也从 `/api/status` 兜底覆盖历史用户。
3. **收件箱「未读」红标错闪** — `seenBeforeOpenRef` 异步加载与 `load()` 拉信件并行，AsyncStorage 解析慢时所有卡片瞬间打红标。改为先 `await getInboxLastSeen()` 再触发 `load()`。
4. **多设备 socket presence 误报下线** — `presence.sockets` 是 `Map<userId, socketId>`，结构上无法表达多设备。新设备先掉线时 offline 事件被错误触发。重构为 `Map<userId, Set<socketId>>`，并修复触摸状态扫描 / disconnect-while-touching 的多设备逻辑。
5. **未开启的择日达扔进垃圾篓后永远消失** — 垃圾篓 SQL 过滤 `opened_at IS NOT NULL`，恶意客户端可调 `/api/inbox/trash` 让胶囊在收件箱（status='trashed' 隐藏）和垃圾篓（opened_at NULL 隐藏）双重消失。`/api/inbox/trash` 加守卫：未开启的胶囊不能被扔。
6. **接收方触感震动可能停不下来** — App 后台时 socket 被主动断开，错过对方的 `touch_end`；前台后 JS 间隔继续每 250ms 触发震动。新增 AppState 监听：切到非 active 时主动清空所有定时器和动画。
7. **倒计时 1Hz 无条件重渲染** — DailyQuestionCard / DailySnapCard 即使没在 cooldown 也每秒重渲染整张卡。`lastUrgeRef` 改为 `lastUrgeMs` state，effect 以 `[lastUrgeMs]` 为依赖：只在 cooldown 窗口内 tick，过期自停。

### v1.0.1 修复清单

- **HIGH** — `POST /capsules/:id/open` 不检查 `inbox_actions` 状态：彻底删除一封 capsule 后仍可通过此 endpoint 直接拿回内容。已加 status 检查（outgoing partner-vis 豁免）。
- **MEDIUM** — `EnvelopeOpenAnimation` 缺动画取消机制：快速 open/close/open 切换时旧动画 callback 仍触发 setState，造成闪烁。已加 `cancelled` flag。
- **LOW-MEDIUM** — `IslandToast` unmount 时 hideTimer 未清理：可能 setState on unmounted component。已加 useEffect cleanup。
- **LOW** — scheduler 给 self-vis 胶囊推送 partner：partner 收到 fake 推送但 app 内看不到对应胶囊。已在循环里跳过。

### main 未发布

- **重连 presence 残留**：旧实现只在状态切换瞬间广播 `presence_both` / `presence_single`，后台/断网造成的断连会错过事件，重连后若 partner 已离线，客户端 `presenceBoth` 残留为 true 导致主页一直显示「同时想着对方」。connect handler 现在会主动给单连接 socket 补一次权威 `presence_single`。

---

## 项目结构

```
PoopHub/
├── couple-buzz-app/                   # Expo / RN 移动端
│   ├── App.tsx                        # 入口 + 6 tab 路由 + PillTabBar + linking + push/socket 生命周期
│   ├── app.config.ts                  # Expo + EAS 配置
│   ├── eas.json                       # EAS Build profile
│   ├── src/
│   │   ├── screens/                   # Home / History / Us / Mailbox / AnniversaryWish / Settings / Setup / Inbox / Trash
│   │   ├── components/                # MailboxCard / TimeCapsuleCard / BucketListCard / SealAnimation / EnvelopeOpenAnimation / IslandToast / SpringPressable / ...
│   │   ├── services/                  # api / socket / notification
│   │   ├── utils/                     # storage / countdown / toolbarSlot
│   │   └── constants.ts               # 颜色 / 表情配置
│   └── targets/widget/                # iOS WidgetKit Swift（v1.2 接通）
│
└── couple-buzz-server/
    ├── src/
    │   ├── index.ts                   # Express 入口 + 中间件 + 限流
    │   ├── routes.ts                  # REST API（含 inbox trash/restore/purge）
    │   ├── socket.ts                  # WebSocket touch / presence（多设备 Set + 重连快照）
    │   ├── auth.ts                    # JWT / scrypt / HMAC 图片签名 / refresh 并发锁
    │   ├── db.ts                      # SQLite schema + 全部 SQL 操作（含 inbox_actions 表）
    │   ├── push.ts                    # APNs + 推送模板（payload 包 body）
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
# 95 passed
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

### v1.0.2（2026-04-28，[Latest](https://github.com/Temp1258/PoopHub/releases/tag/v1.0.2)）

**导航与交互重构**
- [x] **底部导航重构**：自定义灵动岛 PillTabBar + spring 弹性 + onPressIn 瞬切 + 4 tab 红点（拍拍 / 废话区 / 每日 / 信箱）
- [x] **App 级 Toolbar Slot**：「写信 / 添加纪念日 / 添加心愿 / 保存备注」灵动岛 pill 提升到 overlay 层，不再被渐变遮罩压住
- [x] **顶部 scroll-bound fade**（每日 / 信箱 / 约定 / 数据 4 屏）
- [x] **通知 deep-link 路由**：react-navigation linking + `couplebuzz://` scheme，cold-launch (`getInitialURL`) + warm-tap 双路径稳态
- [x] **APNs payload `body` wrap**（expo-notifications 从 `userInfo['body']` 取数据的兼容性）
- [x] **iOS 锁屏通知合并** + 拍拍每次都通知

**功能与体验**
- [x] 写信卡弹簧展开 / 收起（不再僵硬切换）+ 不自动弹键盘 + 寄达文案统一「信件将在 xx 后送达」
- [x] 友好时区名 + 分钟级精度 + ISO 标准化
- [x] 每日问答 / 快照按 BJT 07:00 滚动新题，倒计时合并到屏幕底部
- [x] 废话区未读分界线 + 新消息水滴入场动画 + 在线时跳过 emoji 推送（红点 socket 驱动）
- [x] 收件箱滑动 haptic + 标题栏渐变 + 未读 pill + 邮戳时间戳 + 秒开优化
- [x] 数据界面昵称 + 备注配对行，编辑后居中灵动岛保存 pill

**修复**（详见上方「v1.0.2 修复清单」）
- [x] 7 个真实漏洞：徽章被 reaction 污染 / 登录用户名丢失 / 收件箱红标错闪 / 多设备 socket presence / 垃圾篓双重消失 / 接收方震动停不下来 / 倒计时 1Hz 重渲染
- [x] refresh token 并发刷新加锁 + week / month 输入校验
- [x] 95 个接口测试全过

### v1.0.1（2026-04-28）

- [x] 信箱模块重命名：树洞信箱 → 次日达、时间胶囊 → 择日达
- [x] 写完后双方都看不到信件内容直到送达 + 封信 / 开信过场动画
- [x] 第 6 个 tab「🎀 约定」：纪念日 + 心愿清单合并管理
- [x] 心愿清单按创建者区分（粉/蓝彩条 + chip）
- [x] 收件箱（Apple Wallet 风格层叠 + center snap + 右划删除）
- [x] 垃圾篓（单条 / 批量 删除/恢复 / 彻底删除）
- [x] 灵动岛风格 in-app toast 组件
- [x] 4 个安全/逻辑漏洞修复（capsule open ACL / 动画取消 / toast 清理 / scheduler 推送隐私）

### v1.0.0（2026-04-27）

- [x] MVP：5 tab 结构、双场信箱、couple ID、APNs 推送、JWT 双 token、95 接口测试

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
