# 备份与恢复

数据库备份用 GPG 公钥加密。私钥**只在你本地**，VPS 上只放公钥——这样即使 VPS 被入侵，攻击者拿到 `.gpg` 备份也读不出内容。

---

## 一次性设置（约 5 分钟）

### 1. 在你**本地** Mac 生成 GPG 密钥对

```bash
# macOS 没装 gpg 的先装
brew install gnupg

# 生成密钥（按提示选 RSA 4096，邮箱写一个用来标识的，passphrase 设强密码）
gpg --full-generate-key
```

**重点**：把这个密钥的 passphrase 抄到密码管理器里（1Password / Bitwarden 等），并把私钥导出离线备份：

```bash
# 列密钥拿到 key id
gpg --list-secret-keys --keyid-format=long
# 形如：sec   rsa4096/ABCDEF1234567890 ...

# 导出私钥到一个加密 U 盘或安全的离线位置
gpg --armor --export-secret-keys ABCDEF1234567890 > poophub-backup-private.asc
# 这个 .asc 文件是恢复备份的唯一凭证，丢了所有加密备份都打不开
```

### 2. 把公钥上传到 VPS

```bash
# 本地：导出公钥
gpg --armor --export ABCDEF1234567890 > poophub-backup-public.asc

# 上传到 VPS
scp poophub-backup-public.asc root@your-vps:/tmp/

# 在 VPS 导入公钥
ssh root@your-vps
gpg --import /tmp/poophub-backup-public.asc
rm /tmp/poophub-backup-public.asc

# 标记为信任（避免每次 gpg 加密时弹 trust 警告）
gpg --edit-key ABCDEF1234567890
# 在 gpg 提示符下输入：
#   trust
#   5  (= I trust ultimately)
#   y
#   quit
```

### 3. 处理已有的明文备份

如果 `/opt/poophub/backups/` 里**已经有明文 `app_*.db`** 文件（之前老版本脚本生成的），二选一：

**方案 A（推荐）：把它们加密保留**
```bash
POOPHUB_BACKUP_RECIPIENT=your@email.com \
  /opt/poophub/couple-buzz-server/scripts/secure-existing-backups.sh
```
脚本会逐个加密成 `.db.gpg`，然后 `shred -u` 抹掉原文件。

**方案 B：直接全删**（你不需要这些历史数据）
```bash
POOPHUB_WIPE_PLAINTEXT=1 \
  /opt/poophub/couple-buzz-server/scripts/secure-existing-backups.sh
```

### 4. 配置 cron 跑加密版备份

编辑 root 的 crontab：
```bash
crontab -e
```

添加（替换成你的 GPG key id/email）：
```
0 3 * * * POOPHUB_BACKUP_RECIPIENT=your@email.com /opt/poophub/couple-buzz-server/scripts/backup.sh >> /var/log/poophub-backup.log 2>&1
```

> **注意**：cron 不会自动加载你 shell 的环境变量，所以 `POOPHUB_BACKUP_RECIPIENT` 必须直接写在 crontab 行里。

### 5. 立即跑一次验证

```bash
POOPHUB_BACKUP_RECIPIENT=your@email.com \
  /opt/poophub/couple-buzz-server/scripts/backup.sh
ls -la /opt/poophub/backups/
# 应该看到 app_YYYYMMDD_HHMMSS.db.gpg，权限 -rw-------
```

---

## 恢复备份

```bash
# 1. 把加密备份从 VPS 拉回本地
scp root@your-vps:/opt/poophub/backups/app_20260427_030001.db.gpg ./

# 2. 用本地私钥解密（会提示输入 passphrase）
gpg --output app.db --decrypt app_20260427_030001.db.gpg

# 3. 验证可读
sqlite3 app.db 'SELECT COUNT(*) FROM users;'
```

恢复到 VPS：
```bash
# 关掉 server 防止写入冲突
pm2 stop poophub

# 替换数据库
mv /opt/poophub/couple-buzz-server/data/app.db /opt/poophub/couple-buzz-server/data/app.db.bak
scp ./app.db root@your-vps:/opt/poophub/couple-buzz-server/data/app.db

# 启回来
pm2 start poophub
```

---

## 故障排查

**"No public key" / "encryption failed"**
→ VPS 上没导入公钥，或者 `POOPHUB_BACKUP_RECIPIENT` 写的 key id/email 跟导入的不一致。`gpg --list-keys` 看下。

**"decryption failed"**
→ 本地用错了私钥（或者私钥丢了）。`gpg --list-secret-keys` 确认。

**`shred: not available`**
→ 极少数最小化镜像没装 coreutils-shred。脚本 fallback 到 `rm -f`，效果略差但不影响加密备份本身。
