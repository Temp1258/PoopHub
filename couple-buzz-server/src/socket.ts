import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import crypto from 'crypto';
import { DbOps } from './db';

type PushFn = (deviceToken: string, actionType: string, senderName: string) => Promise<boolean>;

interface Ticket {
  userId: string;
  expiresAt: number;
}

interface CouplePresence {
  sockets: Map<string, string>; // userId -> socketId
  bothOnlineTimer?: ReturnType<typeof setTimeout>;
  bothEmitted: boolean;
  userIds: [string, string];
}

const tickets = new Map<string, Ticket>();
const presenceMap = new Map<string, CouplePresence>();

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
    cors: { origin: '*' },
    transports: ['websocket', 'polling'],
    pingTimeout: 30000,
    pingInterval: 15000,
  });

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
      presenceMap.set(key, { sockets: new Map(), bothEmitted: false, userIds: [userId, partnerId] });
    }
    const presence = presenceMap.get(key)!;
    presence.sockets.set(userId, socket.id);

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
    // Throttle push: max once per 30s per user
    socket.data.lastTouchPush = 0;

    socket.on('touch_start', () => {
      socket.data.isTouching = true;
      socket.to(key).emit('touch_start', { from: userId });

      // If partner is not connected, send push notification
      const partnerConnected = presence.sockets.has(partnerId);
      if (!partnerConnected && pushFn) {
        const now = Date.now();
        if (now - (socket.data.lastTouchPush || 0) > 30000) {
          socket.data.lastTouchPush = now;
          const partner = dbOps.getUser(partnerId);
          if (partner?.device_token) {
            pushFn(partner.device_token, 'touch', user.name);
          }
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
