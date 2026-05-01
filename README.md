# 拉无忧 · Couple Buzz

> 一款专为情侣两人设计的亲密互动 App。把日常的小事攒成关系里的仪式感。

[![Release](https://img.shields.io/badge/release-v1.1.5-ff69b4)](https://github.com/Temp1258/PoopHub/releases/tag/v1.1.5)
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
> **v1.1 重构**：原本平铺的 MailboxCard / TimeCapsuleCard 全部下沉，主屏只剩**三张入口卡 + 底部「写信 ✉️」灵动岛 pill**。点入口卡以全屏 `pageSheet` 模态弹出对应子界面。这套结构让信箱真正像一个「桌子」：写信入口永远停在底部、收件 / 整理 / 留言三件事各回各家。

主屏入口（自带未读 🚩 红旗）：
- 📬 **收件箱** — 已送达的次日达 + 已开启的择日达
- 🗑️ **废件箱** — 从收件箱删除的信件可以在这里恢复（v1.1 前叫「垃圾篓」）
- 📝 **小贴吧** — 双方共享的便利贴墙（v1.1 新增）

底部固定的 ✉️ pill 进入**统一写信流程**（次日达 / 择日达分支由封信后选择）。

#### ✉️ 统一写信流程（WriteLetterScreen）
**5 个阶段**：`write → sealing → kind → capsuleDetails → sending`

- **写**：奶油色信纸（`#FAF6E8`）+ 棕墨字（`#3D2A19`）；正式信件版式：**致 [对方/自己] · 正文 · 落款 [自己] · 字数计数**；iOS 键盘上方 inline accessory 「完成」按钮一键收键盘；草稿 400ms debounce 自动落 AsyncStorage，关掉重开还在
- **封**：SealAnimation（信纸 → 信封 → 火漆印）~1.3s，作者本人也看不到自己写的内容（`my_sealed` 服务端标志，writing/sealing 阶段不返回 my_message；客户端草稿 setter 在 sealing 之后失活，避免 stale closure 把 sealing 阶段的 UI 草稿写入）
- **选**：📮 次日达（500 字上限）/ 💌 择日达（1000 字上限），二选一卡片
- **择日达详情**：年/月/日 + 时/分**五段下拉选择器**（不再是日历点击，6 年窗口，月日联动 clamp）；**双时区即时预览**——同时显示「我（北京时间）：04-27 20:34」与「ta 那边收到时：04-28 04:34」，让对方拿到的也是整点钟整分；可见性切换 🪞 给自己 / 💕 给对方
- **寄**：信件缩小 + 微微旋转 + 沿 Y 轴落入信箱图标（~520ms）+ 信箱小弹跳（~180ms），左右随机偏置增加变化

#### 📬 收件箱（InboxScreen — Apple Wallet 风格）
- 中央卡居中 snap，scale 1 / 邻居 0.93 / 远端 0.86 体现景深，所有卡保持 opacity 1 全部展示；卡片层叠 75% / 露出 25%
- 中央卡 tap 直接快速预览（fade + scale up，~250ms）；邻居 tap 自动滚到居中
- **滑动 haptic + 标题栏渐变 + 未读 pill + 邮戳时间戳**（双时区邮戳 = 寄出方 TZ + 收件方 TZ）
- **右划删除**：仅中央卡可触发，飞出阈值 38% 屏宽，触发后调用 trash API + 顶部弹出灵动岛风格 toast
- **未读小旗子**：服务端 letter list 与本地 `INBOX_LAST_SEEN` cursor 比对，新到的飞旗子；打开 InboxScreen 即刷新 cursor 到 now

#### 🗑️ 废件箱（TrashScreen）
- 单条「恢复」/「彻底删除」+ 选择模式批量「全部恢复」/「全部删除」
- 「彻底删除（purge）」服务端永久隐藏：archive、capsules、open endpoint 三处统一拦截，无法恢复
- 主信箱页下拉刷新一并刷新收件箱 + 废件箱

#### 📝 小贴吧（StickyWallScreen — v1.1 新增）
> 双方共享的木质便利贴墙。把那种「想发又不值得发一条单独消息」的小事写出来，贴一张，过几天对方贴一张回应——比聊天更轻、比朋友圈更近。

- **木色背景 `#D4B68C` + 奶油便利贴 `#FFFBE6`**；自己的字粉色 `#A0144A`，对方的字蓝色 `#0F4F8A`
- **掉落入场动画**：scale 1.35→1 + translateY -32→0 + opacity 0→1，spring
- **跟帖 = 订书钉串联的便利贴堆**：每个跟帖一张独立纸，纵向重叠 14pt + 圆钉装饰（pin head + highlight 高光）+ 纸面随机 ±1°-±5° 微旋转，新纸在最上层
- **双击便利贴 → 跟个帖**：300ms 内同 sticky 二次轻点直接弹出回复编辑器
- **撕下来过场动画 + 永久删除**：长按 → 二次确认 → scale 缩 + 随机 ±22° 翻转 + Y 轴上飘 + 淡出（~320ms）→ 调 DELETE 接口级联清掉所有 block 和 seen 记录
- **草稿持久化（temp）**：每人每对最多一张未发布的 sticky；编辑器 1200ms debounce 自动保存到服务端 `status='temp'`，关掉再开还在；类似地，跟帖也有 temp 阶段
- **背景点击收起 + 底部「收起」pill + 标题贴顶**；点击空白区域收回编辑器，连点保留草稿
- **未读旗子**：每张 sticky 维护 `last_seen_block_id`，对方有新 block 则首张纸右上角亮一颗「未读」灵动岛
- **socket 实时推送**：服务端 `sticky_posted` / `sticky_appended` APNs 推送 + `sticky_update` socket 广播；信箱 tab 红点和入口卡红旗实时刷新

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
- **JWT 双 token**：access 15 分钟 / refresh 90 天；refresh token 自动轮换；token_version 字段支持即时吊销所有 session；并发刷新加锁防 race；轮换走单条 SQLite 事务，崩在中间不会把 session 锁死
- **限流分层**：注册 / 配对 / 认证 / 普通 API 各自独立的速率限制
- **Socket 触摸限速**：服务端 5 events / 1s 的滚动窗口拦截畸形/恶意客户端，省电省 APNs 配额
- **多设备并发登录**：服务端 presence 用 `Map<userId, Set<socketId>>` 维护，手机 + iPad 同时在线不再误报对方掉线，touch_end 仅在最后一个 touching 设备离开时广播
- **Presence 防闪 / 防残留**：3s debounce 才广播 `presence_both` 避免快速重连闪烁；disconnect 留 1.5s grace + stale-closure guard（旧 closure 检测到 presence 已被新 session 覆盖直接 bail）；on-connect 给孤身 socket 主动补一次 `presence_single` 治愈历史残留状态
- **Capsule 解锁推送防重复**：`time_capsules.notified_at` 列 + 调度器分钟级 dedup key，进程重启 / 时钟漂移 / 多次扫描都不会让对方收到第二遍开信通知
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
- **小贴吧实时联动**：`sticky_posted` / `sticky_appended` 走 APNs，`sticky_update` 走 socket，信箱 tab 的红点 + 入口卡 🚩 同时刷新；点击通知 deep-link 直接进信箱

---

## 技术栈

### 移动端
- **React Native 0.81 · React 19 · Expo SDK 54 · TypeScript**
- React Navigation v7（material-top-tabs + 自定义 PillTabBar，6 tab 底部导航 + 顶部 swipe）
- Socket.IO Client（实时触碰 + presence + sticky_update）
- Expo Notifications / Haptics / ImagePicker / Updates / FileSystem / LinearGradient
- 内置 `Animated` API + `PanResponder` 实现 wallet cascade、信封开合、右划手势、PillTabBar spring、便利贴掉落 / 撕下来、写信寄出动画（**未引入 reanimated**，所有动画 OTA 可推）
- `@bacons/apple-targets`（iOS Widget 原生构建）
- EAS Build (internal IPA) + EAS Updates (OTA)

### 服务端
- **Node.js 20 · Express 4 · TypeScript**
- SQLite（`better-sqlite3` WAL 模式，启动时自动迁移 schema；新表 `sticky_notes` / `sticky_blocks` / `sticky_seen` 自带覆盖索引）
- Socket.IO Server（一次性 ticket 30s TTL 鉴权，多设备 socket Set，重连权威 presence 快照，touch 5/1s 滚动窗口限速）
- `@parse/node-apn`（APNs HTTP/2 推送，失效 token 自动清理，payload 包 `body` 兼容 expo-notifications）
- Multer（图片上传 5MB + image MIME 白名单 + atomic tmp/rename 防覆写）
- JWT + scrypt 密码哈希 + refresh token 哈希存储 + 并发轮换锁 + 事务化轮换
- node-cron 调度（mailbox reveal / capsule unlock，capsule 推送 `notified_at` 列持久 dedup）
- Jest + supertest（**95 个接口测试用例**）
- express-rate-limit
- GPG 加密备份 + cron + 离线私钥

---

## 安全（持续审计 + 漏洞修复）

| 维度 | 实现 |
|---|---|
| 密码 | scrypt + `crypto.timingSafeEqual`（防时序攻击）|
| Token | JWT 双 token + token_version 即时吊销 + refresh token 哈希存储 + 自动轮换 + 并发刷新锁 + 单条事务化轮换 |
| 图片访问 | HMAC 签名 URL（1h TTL + timing-safe verify + 路径正则严格） |
| WebSocket | 一次性 ticket 30s TTL + origin 白名单 + 多设备 Set 维护 + touch 5/1s 滚动窗口限速 |
| SQL 注入 | 全部 prepared statements 参数化绑定，零字符串拼接 |
| 输入校验 | typeof + length 上限 + YYYY-MM-DD 严格格式 + week/month 范围校验 + reaction 一次性服务端锁 + sticky content 长度校验 |
| 文件上传 | atomic tmp+rename + DB pre-check + 5MB + MIME 白名单 |
| 路径穿越 | regex 严格 + HMAC + 文件名/路径不取自 client 输入 |
| 随机源 | `crypto.randomInt` 生成用户 ID / 配对码 |
| 限流 | 注册 / 配对 / 认证 / API 分层 + socket touch 限速 |
| Badge 计数 | 服务端真实未读数 + clamp 防客户端越权推进读位指针 |
| 时间胶囊 | self 可见性服务端校验（防 partner 猜 id 越权读取） |
| 次日达内容封存 | writing/sealing 阶段服务端不返回作者自己的 my_message，加 my_sealed 标志；客户端草稿 setter 在 sealing 后失活，避免 stale closure 把 UI 草稿覆写 sealed 内容 |
| Inbox 软删除 | inbox_actions 表 per-recipient 状态机（trashed / purged）；archive、capsules、open endpoint 三处统一拦截 |
| Purge 防绕过 | 彻底删除后即使直接调 POST /capsules/:id/open 也返 404，杜绝从历史 id 拿回内容 |
| 推送隐私 | scheduler 不给 self-vis 胶囊推送 partner，防止泄露用户私密信件存在 |
| Capsule 推送防重 | `notified_at` 列 + scheduler 分钟级 dedup key，重启 / 时钟漂移不会重发开信通知 |
| Sticky 多写竞态 | 撕贴 vs 跟帖并发：服务端在 commit 前校验 sticky 仍存在，撕贴成功后 cascade 删除 blocks + seen 记录 |
| Presence 残留 | disconnect 1.5s grace + stale-closure guard（旧 closure 通过身份 token 比对识别已被新 session 覆盖）+ on-connect 给孤身 socket 补 `presence_single` |
| 数据备份 | GPG 公钥加密（AES-256），私钥离线 U 盘 + 密码管理器 passphrase |

### v1.1.5 修复清单（[Latest](https://github.com/Temp1258/PoopHub/releases/tag/v1.1.5)）

**安全 / 竞态打磨**

1. **Socket 触摸 DoS** — 客户端可以无限循环 emit `touch_start`，服务端原地放大成 APNs 推送 + 心跳广播。新增 5/1s 滚动窗口限速 + silent drop。
2. **客户端 socket 死循环** — auto-reconnect 在网络抖动时进入「连上即断」自激振荡，每秒新建几十条连接。改为指数退避 + 短窗口熔断。
3. **Capsule 推送重复** — 调度器进程重启或被 cron 多次拉起时，`unlock_at <= now AND opened_at IS NULL` 会再次命中已通知的胶囊。新增 `notified_at` 列 + 内存 minute-bucket dedup key。
4. **Refresh token 轮换非事务** — 旧 hash 删除与新 hash 写入分别为两条 SQL，崩在中间会让用户彻底登不回来。合并到单事务。
5. **Presence 闪烁** — 网络抖动时短间隔 disconnect/reconnect 触发 `presence_single` → `presence_both` 来回闪。`checkBothOnline()` 加 3s debounce。
6. **跟帖 vs 撕贴竞态** — 一方正在写跟帖、另一方撕走整张 sticky，commit 时若 sticky 已不存在会留下孤儿 block。在 commit 前校验 sticky 存在 + 撕贴 cascade 删除。
7. **AppState 切换定时器泄漏** — DailyQuestionCard / DailySnapCard / 触感震动定时器在切换 tab / 切到后台时未清理；统一加 cleanup。
8. **Presence stale-closure** — 旧 disconnect 闭包在 presence 被新 session 覆盖后还会广播，把刚回来的人误标成离线。closure 内通过身份 token 比对识别 presence 是否仍属于自己。
9. **写信草稿覆写 sealing 内容** — 用户高速点「寄出」时，草稿 setter 还会再触发一次，把 sealing 阶段的 UI 草稿（已封存内容）回写到状态。setter 在 sealing 之后失活。

### v1.1.0 — v1.1.4（2026-04-30）

**信箱大重构**
- 平铺卡片 → 三入口（收件箱 / 废件箱 / 小贴吧）+ 写信 pill；写信下沉成统一流程
- 「垃圾篓」改名「废件箱」
- 收件箱重构：点击空白收起 + 底部「收起」pill + 标题贴顶 + 卡片倒序按时间 + 旧贴 relayout / 旋转 ±1°-±5° / 时间戳浮在最上
- 写信流程 5 阶段：write → sealing → kind → capsuleDetails → sending；封信 + 寄出过场动画
- 择日达分钟级日期时间选择（六年窗口 + 月日联动 clamp + 双时区即时预览）
- 写信键盘可收回 + KeyboardAvoidingView 防遮挡 + 草稿持久化 + 正式信件版式（致 / 落款 / 双时区邮戳）

**小贴吧（信箱 tab 共享便利贴墙）**
- 木色背景 + 奶油便利贴 + 自己粉 / 对方蓝
- 掉落入场动画 / 撕下来过场动画 / 永久删除
- 跟帖独立成订书钉串联的便利贴堆 + 老贴一并 relayout
- 跟帖纸 z-order 翻转 + 圆钉替代订书钉
- 双击便利贴跟个帖 + 编辑器 tap-外保留草稿
- 标题边缘真正贴住的柔化渐隐 + 选中态加辨识 + 「不看了」pill
- 冷启动误重登修复 + 收件箱未读小旗子 + 重连给孤身 socket 同步 presence_single

### v1.0.2 修复清单（[Release notes](https://github.com/Temp1258/PoopHub/releases/tag/v1.0.2)）

经仓库全量审计验证的 7 个真实漏洞：

1. **徽章数被反应（reaction）污染** — `stmtCountUnreadActions` / `stmtLatestPartnerActionId` 没过滤 `reply_to`，反应行 id > 顶层 id 时 `markRead` clamp 不到，徽章可能卡在 ≥1 永远清不掉。两条 SQL 加 `reply_to IS NULL`。
2. **登录后用户名丢失** — `/api/login` 不返回 `name`，重装登录的用户在 MailboxCard / InboxScreen / TimeCapsuleCard / HistoryScreen 全部显示「我」。服务端响应增加 `name`，客户端登录写入。
3. **收件箱「未读」红标错闪** — `seenBeforeOpenRef` 异步加载与 `load()` 拉信件并行，AsyncStorage 解析慢时所有卡片瞬间打红标。改为先 `await getInboxLastSeen()` 再触发 `load()`。
4. **多设备 socket presence 误报下线** — `presence.sockets` 是 `Map<userId, socketId>`，结构上无法表达多设备。重构为 `Map<userId, Set<socketId>>`。
5. **未开启的择日达扔进垃圾篓后永远消失** — `/api/inbox/trash` 加守卫：未开启的胶囊不能被扔。
6. **接收方触感震动可能停不下来** — 新增 AppState 监听：切到非 active 时主动清空所有定时器和动画。
7. **倒计时 1Hz 无条件重渲染** — DailyQuestionCard / DailySnapCard 改为 cooldown 内才 tick，过期自停。

### v1.0.1 修复清单

- **HIGH** — `POST /capsules/:id/open` 不检查 `inbox_actions` 状态：彻底删除一封 capsule 后仍可通过此 endpoint 直接拿回内容。已加 status 检查（outgoing partner-vis 豁免）。
- **MEDIUM** — `EnvelopeOpenAnimation` 缺动画取消机制：快速 open/close/open 切换时旧动画 callback 仍触发 setState，造成闪烁。已加 `cancelled` flag。
- **LOW-MEDIUM** — `IslandToast` unmount 时 hideTimer 未清理：可能 setState on unmounted component。已加 useEffect cleanup。
- **LOW** — scheduler 给 self-vis 胶囊推送 partner：partner 收到 fake 推送但 app 内看不到对应胶囊。已在循环里跳过。

---

## 项目结构

```
PoopHub/
├── couple-buzz-app/                   # Expo / RN 移动端
│   ├── App.tsx                        # 入口 + 6 tab 路由 + PillTabBar + linking + push/socket 生命周期
│   ├── app.config.ts                  # Expo + EAS 配置
│   ├── eas.json                       # EAS Build profile
│   ├── src/
│   │   ├── screens/                   # Home / History / Us / Mailbox / WriteLetter / Inbox / Trash / StickyWall / AnniversaryWish / Settings / Setup
│   │   ├── components/                # MailboxCard / TimeCapsuleCard / BucketListCard / SealAnimation / EnvelopeOpenAnimation / IslandToast / SpringPressable / StickyNote / FireworksOverlay / ...
│   │   ├── services/                  # api / socket / notification
│   │   ├── utils/                     # storage / countdown / postmark / inboxUnread / toolbarSlot
│   │   └── constants.ts               # 颜色 / 表情配置
│   └── targets/widget/                # iOS WidgetKit Swift（v1.2 接通）
│
└── couple-buzz-server/
    ├── src/
    │   ├── index.ts                   # Express 入口 + 中间件 + 限流
    │   ├── routes.ts                  # REST API（含 sticky-wall 11 个接口 + inbox trash/restore/purge）
    │   ├── socket.ts                  # WebSocket touch / presence（多设备 Set + 重连快照 + 5/1s 限速 + stale-closure guard）
    │   ├── auth.ts                    # JWT / scrypt / HMAC 图片签名 / refresh 并发锁 + 事务轮换
    │   ├── db.ts                      # SQLite schema + 全部 SQL 操作（sticky_notes / sticky_blocks / sticky_seen / inbox_actions / time_capsules.notified_at）
    │   ├── push.ts                    # APNs + 推送模板（payload 包 body）
    │   ├── scheduler.ts               # 信箱 / 胶囊解锁 / 周报定时（capsule 解锁 dedup key）
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

### v1.1.5（2026-04-30，[Latest](https://github.com/Temp1258/PoopHub/releases/tag/v1.1.5)）
- [x] **9 项安全 / 竞态打磨**：socket touch 限速 / 客户端死循环熔断 / capsule 索引 + `notified_at` 持久 dedup / refresh token 事务化轮换 / presence 防闪 / 跟帖 vs 撕贴竞态 / AppState 定时器 cleanup / presence stale-closure guard / 写信草稿覆盖 sealing 阶段

### v1.1.0 — v1.1.4（2026-04-30）
- [x] **信箱大重构**：三入口（收件箱 / 废件箱 / 小贴吧）+ 底部固定写信 pill
- [x] **统一写信流程**：write → sealing → kind → capsuleDetails → sending 五阶段，封信 + 寄出过场动画
- [x] **正式信件版式**：致 / 落款 / 双时区邮戳，奶油色信纸 + 棕墨字
- [x] **择日达分钟级日期时间选择**：年/月/日/时/分五段下拉 + 月日联动 clamp + 双时区即时预览
- [x] **写信键盘可收回 + 草稿持久化 + KeyboardAvoidingView 防遮挡**
- [x] **小贴吧**：双方共享便利贴墙；木色背景 + 奶油纸 + 双色字
- [x] **跟帖 = 订书钉串联的便利贴堆 + 圆钉装饰 + 老贴 relayout**
- [x] **掉落入场动画 + 撕下来过场动画 + 永久删除**
- [x] **双击便利贴跟个帖 + 编辑器 tap-外保留草稿**

### v1.0.2（2026-04-28）
- [x] 自定义灵动岛 PillTabBar + spring + onPressIn 瞬切 + 4 tab 红点
- [x] App 级 Toolbar Slot + 顶部 scroll-bound fade
- [x] 通知 deep-link 路由（cold-launch + warm-tap 双路径）
- [x] APNs payload `body` wrap + iOS 锁屏通知合并
- [x] 7 个真实漏洞修复 + 95 接口测试

### v1.0.1（2026-04-28）
- [x] 信箱模块重命名：树洞信箱 → 次日达、时间胶囊 → 择日达
- [x] 写完后双方都看不到信件内容直到送达 + 封信 / 开信过场动画
- [x] 第 6 个 tab「🎀 约定」：纪念日 + 心愿清单合并管理
- [x] 收件箱（Apple Wallet 风格）+ 垃圾篓
- [x] 4 个安全/逻辑漏洞修复

### v1.0.0（2026-04-27）
- [x] MVP：5 tab 结构、双场信箱、couple ID、APNs 推送、JWT 双 token、95 接口测试

### v1.2 计划
- [ ] iOS Widget：接通数据写入 App Group UserDefaults（结构已搭好，差 native bridge）
- [ ] 备份失败主动告警（cron 失败邮件 / pushover 通知）
- [ ] 异地备份多云冗余（自动 sync 到 Google Drive / Dropbox）
- [ ] Android 测试

### 未来想法
- [ ] 端到端加密：mailbox / capsule 用对方公钥加密
- [ ] 视频快照
- [ ] 语音留言
- [ ] 小贴吧支持图片 / 涂鸦

---

## 致谢

为我和我的另一半而做。如果你也想给伴侣做一个，欢迎 fork。

## 许可

[MIT License](./LICENSE) — 自由使用 / 修改 / 商用，唯一要求是保留版权声明。
