import { DbOps } from './db';
import { SendPushFn } from './routes';

let lastMailboxOpenHour = -1;
let lastMailboxRevealHour = -1;
let lastCapsuleCheckHour = -1;

export function startScheduler(dbOps: DbOps, pushFn: SendPushFn): void {
  setInterval(async () => {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcDay = now.getUTCDay(); // 0=Sun

    // Mailbox open: Friday at 00:00 UTC
    if (utcDay === 5 && utcHour === 0 && lastMailboxOpenHour !== utcHour) {
      lastMailboxOpenHour = utcHour;
      await broadcastPush(dbOps, pushFn, 'mailbox_open');
    }

    // Mailbox reveal + weekly report: Sunday at 14:00 UTC
    if (utcDay === 0 && utcHour === 14 && lastMailboxRevealHour !== utcHour) {
      lastMailboxRevealHour = utcHour;
      await broadcastPush(dbOps, pushFn, 'mailbox_reveal');
      await broadcastPush(dbOps, pushFn, 'weekly_report');
    }

    // Capsule unlock check: daily at 00:00 and 08:00 UTC
    if ((utcHour === 0 || utcHour === 8) && lastCapsuleCheckHour !== utcHour) {
      lastCapsuleCheckHour = utcHour;
      await checkCapsuleUnlocks(dbOps, pushFn);
    }

    // Reset guards
    if (utcHour !== 0) lastMailboxOpenHour = -1;
    if (utcHour !== 14) lastMailboxRevealHour = -1;
    if (utcHour !== 0 && utcHour !== 8) lastCapsuleCheckHour = -1;
  }, 60 * 60 * 1000);
}

async function broadcastPush(dbOps: DbOps, pushFn: SendPushFn, type: string): Promise<void> {
  try {
    const tokens = dbOps.getAllPairedUserTokens();
    for (const { device_token } of tokens) {
      await pushFn(device_token, type, '');
    }
  } catch (err) {
    console.warn('[Scheduler] Push broadcast error:', err);
  }
}

async function checkCapsuleUnlocks(dbOps: DbOps, pushFn: SendPushFn): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const capsules = dbOps.getUnlockableCapsules(today);
    const notified = new Set<string>();

    for (const capsule of capsules) {
      // Notify both users in the couple (once per user)
      for (const uid of [capsule.user_id, capsule.partner_id]) {
        if (notified.has(uid)) continue;
        notified.add(uid);
        const user = dbOps.getUser(uid);
        if (user?.device_token) {
          await pushFn(user.device_token, 'capsule_unlock', '');
        }
      }
    }
  } catch (err) {
    console.warn('[Scheduler] Capsule check error:', err);
  }
}
