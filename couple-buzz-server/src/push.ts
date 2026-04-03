import apn from '@parse/node-apn';
import path from 'path';

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
  ping: { title: '🛎️ Ping', body: '{name} 按了一下铃！' },
  unpair: { title: '💔 已解除配对', body: '{name} 解除了配对' },
  daily_answer: { title: '📝 每日问答', body: '{name} 回答了今天的问题' },
  daily_both: { title: '📝 每日问答', body: '你们都回答了！快来看看对方的答案' },
};

let provider: apn.Provider | null = null;

export function initAPNs(): void {
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
      return false;
    }

    console.log(`[APNs] Push sent: ${actionType} from ${senderName}`);
    return true;
  } catch (error) {
    console.error('[APNs] Push error:', error);
    return false;
  }
}
