import apn from '@parse/node-apn';
import path from 'path';

const PUSH_MESSAGES: Record<string, { title: string; body: string }> = {
  miss: { title: '💭 想你', body: '{name} 在想你～' },
  kiss: { title: '😘 亲亲', body: '{name} 亲了你一下！' },
  poop: { title: '💩 拉屎', body: '{name} 在拉屎哈哈哈' },
  pat:    { title: '🫶 拍拍', body: '{name} 拍了拍你～' },
  unpair: { title: '💔 已解除配对', body: '{name} 解除了配对' },
};

let provider: apn.Provider | null = null;

export function initAPNs(): void {
  const keyPath = process.env.APN_KEY_PATH || './certs/AuthKey.p8';

  provider = new apn.Provider({
    token: {
      key: path.resolve(keyPath),
      keyId: process.env.APN_KEY_ID || '',
      teamId: process.env.APN_TEAM_ID || '',
    },
    production: process.env.APN_PRODUCTION === 'true',
  });

  console.log('[APNs] Provider initialized');
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
