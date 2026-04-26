import apn from '@parse/node-apn';
import path from 'path';
import type { DbOps } from './db';

// Reasons that indicate the device token is no longer valid and should be
// evicted from the database so we stop trying to push to it.
// https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
const INVALID_TOKEN_REASONS = new Set([
  'Unregistered',
  'BadDeviceToken',
  'DeviceTokenNotForTopic',
]);

let cleanupDbOps: DbOps | null = null;

const PUSH_MESSAGES: Record<string, { title: string; body: string }> = {
  miss: { title: '💕 想你', body: '{name} 在想你～' },
  finger_heart: { title: '🫰 比心', body: '{name} 给你比了个心' },
  love: { title: '❤️ 爱你', body: '{name} 说爱你！' },
  kiss: { title: '😘 亲亲', body: '{name} 亲了你一下！' },
  poop: { title: '💩 拉屎', body: '{name} 在拉屎哈哈哈' },
  pat: { title: '🫶 拍拍', body: '{name} 拍了拍你～' },
  shy: { title: '😳 害羞', body: '{name} 害羞了～' },
  rose: { title: '🌹 玫瑰', body: '{name} 送你一朵玫瑰' },
  hug: { title: '🤗 抱抱', body: '{name} 想抱抱你～' },
  pick_nose: { title: '🤏 抠鼻屎', body: '{name} 在抠鼻屎...' },
  eat: { title: '🍚 吃饭', body: '{name} 去吃饭啦' },
  angry_silent: { title: '🙉 生气', body: '{name} 生气了，不想听你说话！' },
  angry_talk: { title: '😤 生气', body: '{name} 生气了，但是想听你说话' },
  hungry: { title: '🫠 饿', body: '{name} 饿了～' },
  sleepy: { title: '😴 困', body: '{name} 困了～' },
  where_r_u: { title: '👀 人呢', body: '{name} 在找你！' },
  what_doing: { title: '🤔 在干嘛', body: '{name} 想知道你在干嘛' },
  sleep: { title: '🛌 睡觉', body: '{name} 去睡觉啦' },
  play: { title: '🎮 玩', body: '{name} 在玩～' },
  clean: { title: '🧹 打扫卫生', body: '{name} 在打扫卫生' },
  cry: { title: '😢 哭哭', body: '{name} 哭了...' },
  wuwu: { title: '🥺 呜呜', body: '{name} 呜呜呜...' },
  sad: { title: '😞 伤心', body: '{name} 伤心了' },
  clown: { title: '🤡 小丑', body: '{name} 觉得自己是小丑' },
  haha: { title: '😆 哈哈', body: '{name} 在笑哈哈' },
  hehe: { title: '😏 嘿嘿', body: '{name} 嘿嘿嘿...' },
  work: { title: '💻 工作', body: '{name} 在工作' },
  slap: { title: '👋 打你', body: '{name} 打了你一巴掌！' },
  ping: { title: '🛎️ Ping', body: '{name} 按了一下铃！' },
  unpair: { title: '💔 已解除配对', body: '{name} 解除了配对' },
  daily_answer: { title: '📝 每日问答', body: '{name} 回答了今天的问题，在等你的答案' },
  daily_both: { title: '📝 每日问答', body: '你们都回答了！快来看看对方的答案' },
  reaction: { title: '💬 回应', body: '{name} 回应了你' },
  ritual_morning: { title: '🌅 早安', body: '{name} 说早安了～' },
  ritual_evening: { title: '🌙 晚安', body: '{name} 说晚安了～' },
  ritual_both_morning: { title: '🌅 早安', body: '你们都说了早安！新的一天一起加油 💪' },
  ritual_both_evening: { title: '🌙 晚安', body: '你们都说了晚安！今天辛苦了 💕' },
  mailbox_open: { title: '📮 树洞信箱', body: '本场信箱已开启，写点什么给 ta 吧～' },
  mailbox_written: { title: '💌 树洞信箱', body: '{name} 在树洞信箱写了一封信，等揭晓时间' },
  mailbox_countdown_15min: { title: '💌 树洞信箱', body: '15 分钟后揭晓本场的信！' },
  mailbox_reveal: { title: '📮 树洞信箱', body: '本场的信已揭晓！快来看看 💌' },
  weekly_report: { title: '📊 恋爱周报', body: '本周恋爱报告来了！' },
  capsule_unlock: { title: '💌 时间胶囊', body: '你有一封来自过去的信～' },
  bucket_new: { title: '📝 新心愿', body: '{name} 添加了一个新心愿' },
  bucket_complete: { title: '✅ 心愿达成', body: '{name} 完成了一个心愿！' },
  date_new: { title: '📅 新纪念日', body: '{name} 添加了一个新纪念日' },
  snap_submitted: { title: '📸 每日快照', body: '{name} 拍了今天的快照，在等你的照片' },
  snap_both: { title: '📸 每日快照', body: '你们都拍了今天的快照！快来看看 💕' },
  touch: { title: '拍臭宝！👏', body: '{name} 想你了！🥹' },
};

let provider: apn.Provider | null = null;

export function initAPNs(dbOps?: DbOps): void {
  if (dbOps) cleanupDbOps = dbOps;

  const keyId = process.env.APN_KEY_ID;
  const teamId = process.env.APN_TEAM_ID;
  const keyPath = process.env.APN_KEY_PATH || './certs/AuthKey.p8';

  if (!keyId || !teamId) {
    console.log('[APNs] Not configured, skipping initialization');
    return;
  }

  try {
    provider = new apn.Provider({
      token: {
        key: path.resolve(keyPath),
        keyId,
        teamId,
      },
      production: process.env.APN_PRODUCTION === 'true',
    });
    console.log('[APNs] Provider initialized');
  } catch (error) {
    console.error('[APNs] Failed to initialize:', error);
    provider = null;
  }
}

export async function sendPush(
  deviceToken: string,
  actionType: string,
  senderName: string
): Promise<boolean> {
  if (!provider) {
    console.error('[APNs] Provider not initialized');
    return false;
  }

  const message = PUSH_MESSAGES[actionType];
  if (!message) {
    console.error(`[APNs] Unknown action type: ${actionType}`);
    return false;
  }

  const notification = new apn.Notification();
  notification.alert = {
    title: message.title,
    body: message.body.replace('{name}', senderName),
  };
  notification.sound = 'default';
  notification.badge = 1;
  notification.topic = process.env.APN_BUNDLE_ID || 'com.couplebuzz.app';
  notification.payload = { actionType, senderName };

  try {
    const result = await provider.send(notification, deviceToken);

    if (result.failed.length > 0) {
      console.error('[APNs] Push failed:', JSON.stringify(result.failed));
      for (const f of result.failed) {
        const reason = f.response?.reason;
        // APNs returns HTTP 410 with reason "Unregistered" once the token is dead.
        if ((reason && INVALID_TOKEN_REASONS.has(reason)) || f.status === 410) {
          cleanupDbOps?.clearDeviceTokenByValue(deviceToken);
          console.log(`[APNs] Evicted stale device token (reason: ${reason ?? f.status})`);
          break;
        }
      }
      return false;
    }

    console.log(`[APNs] Push sent: ${actionType} from ${senderName}`);
    return true;
  } catch (error) {
    console.error('[APNs] Push error:', error);
    return false;
  }
}
