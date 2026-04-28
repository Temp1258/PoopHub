import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import crypto from 'crypto';
import { DbOps } from './db';

type PushFn = (
  deviceToken: string,
  actionType: string,
  senderName: string,
  extra?: Record<string, string>,
  badge?: number,
  collapseId?: string,
  bodyOverride?: string
) => Promise<boolean>;

interface Ticket {
  userId: string;
  expiresAt: number;
}

interface CouplePresence {
  sockets: Map<string, string>; // userId -> socketId
  bothOnlineTimer?: ReturnType<typeof setTimeout>;
  bothEmitted: boolean;
  userIds: [string, string];
  // Pat unread counter, keyed by RECIPIENT user id. Resets when the recipient
  // reconnects (i.e. they came back online — implicit "I've seen them").
  // Lets a 拍拍 push body show "想你了 N 下" rolling tally.
  patUnread: Map<string, number>;
}

const tickets = new Map<string, Ticket>();
const presenceMap = new Map<string, CouplePresence>();
// Captured at setupSocket time so other modules (e.g. routes.ts) can broadcast
// to a couple's room without a circular import or full DI plumbing.
let ioRef: Server | null = null;

// Broadcast an event into the room shared by `userIdA` and `userIdB`. Both
// sides receive it — recipients should filter via the `from` field in the
// payload to avoid haptic-feedback'ing the sender.
export function emitToCouple(
  userIdA: string,
  userIdB: string,
  event: string,
  data?: Record<string, unknown>,
): void {
  if (!ioRef) return;
  ioRef.to(coupleKey(userIdA, userIdB)).emit(event, data ?? {});
}

function coupleKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

export function createWsTicket(userId: string): string {
  const ticket = crypto.randomBytes(32).toString('hex');
  tickets.set(ticket, { userId, expiresAt: Date.now() + 30000 });
  return ticket;
}

export function setupSocket(httpServer: HttpServer, dbOps: DbOps, pushFn?: PushFn): Server {
  const io = new Server(httpServer, {
    // Defense-in-depth: ticket auth is the primary guard, but pinning origin
    // means a malicious browser tab can't even open the socket. RN App has
    // no Origin header so it's unaffected.
    cors: {
      origin: ['https://couple-buzz.com', 'https://api.couple-buzz.com:8443'],
      credentials: false,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 30000,
    pingInterval: 15000,
  });
  ioRef = io;

  // Auth middleware: validate ticket
  io.use((socket, next) => {
    const ticket = socket.handshake.auth?.ticket as string;
    if (!ticket) return next(new Error('missing_ticket'));

    const stored = tickets.get(ticket);
    if (!stored || stored.expiresAt < Date.now()) {
      tickets.delete(ticket);
      return next(new Error('invalid_ticket'));
    }

    tickets.delete(ticket);
    socket.data.userId = stored.userId;
    next();
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    const user = dbOps.getUser(userId);
    if (!user?.partner_id) {
      socket.disconnect();
      return;
    }

    const partnerId = user.partner_id;
    const key = coupleKey(userId, partnerId);

    if (!presenceMap.has(key)) {
      presenceMap.set(key, {
        sockets: new Map(),
        bothEmitted: false,
        userIds: [userId, partnerId],
        patUnread: new Map(),
      });
    }
    const presence = presenceMap.get(key)!;
    presence.sockets.set(userId, socket.id);
    // This user is back online — they're seeing the partner directly, so any
    // pending pat tally for them resets to zero.
    presence.patUnread.set(userId, 0);

    socket.join(key);
    checkBothOnline(io, key, presence);
    socket.to(key).emit('partner_online', { online: true });

    // Check if partner is in the same room and currently touching
    const partnerSocketId = presence.sockets.get(partnerId);
    if (partnerSocketId) {
      const partnerSocket = io.sockets.sockets.get(partnerSocketId);
      if (partnerSocket?.data.isTouching) {
        socket.emit('touch_start', { from: partnerId });
      }
      // Tell the new user that partner is online
      socket.emit('partner_online', { online: true });
    }

    // Touch relay
    socket.data.isTouching = false;

    socket.on('touch_start', () => {
      socket.data.isTouching = true;
      socket.to(key).emit('touch_start', { from: userId });

      // Push only when partner is offline (otherwise they see the touch in
      // real time on Home). Every pat fires a push — APNs collapses them into
      // a single rolling notification on the lock screen via collapseId, so
      // the partner doesn't get N stacked alerts. Body shows the tally.
      const partnerConnected = presence.sockets.has(partnerId);
      if (!partnerConnected && pushFn) {
        const partner = dbOps.getUser(partnerId);
        if (partner?.device_token) {
          const tally = (presence.patUnread.get(partnerId) ?? 0) + 1;
          presence.patUnread.set(partnerId, tally);
          // Badge: emoji unread + 1 (representing "an unread pat series").
          // Multiple pats in the series keep emoji_unread the same → badge
          // stays put, matching the user's "+1 only" expectation.
          const emojiUnread = dbOps.getUnreadActionCount(partnerId, userId);
          const badge = emojiUnread + 1;
          const body = `${user.name} 想你了 ${tally} 下！🥹`;
          const collapseId = `pat_${userId}`;
          pushFn(partner.device_token, 'touch', user.name, undefined, badge, collapseId, body);
        }
      }
    });

    socket.on('touch_end', () => {
      socket.data.isTouching = false;
      socket.to(key).emit('touch_end', { from: userId });
    });

    socket.on('disconnect', () => {
      if (socket.data.isTouching) {
        socket.to(key).emit('touch_end', { from: userId });
      }

      if (presence.sockets.get(userId) === socket.id) {
        presence.sockets.delete(userId);
      }

      if (presence.bothOnlineTimer) {
        clearTimeout(presence.bothOnlineTimer);
        presence.bothOnlineTimer = undefined;
      }

      socket.to(key).emit('partner_online', { online: false });

      if (presence.bothEmitted) {
        io.to(key).emit('presence_single');
        presence.bothEmitted = false;
      }

      if (presence.sockets.size === 0) {
        presenceMap.delete(key);
      }
    });
  });

  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of tickets) {
      if (v.expiresAt < now) tickets.delete(k);
    }
  }, 60000);

  return io;
}

function checkBothOnline(io: Server, key: string, presence: CouplePresence) {
  if (presence.sockets.size >= 2) {
    if (presence.bothOnlineTimer) clearTimeout(presence.bothOnlineTimer);
    presence.bothOnlineTimer = setTimeout(() => {
      if (presence.sockets.size >= 2) {
        io.to(key).emit('presence_both');
        presence.bothEmitted = true;
      }
    }, 3000);
  }
}
