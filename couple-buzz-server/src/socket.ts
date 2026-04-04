import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import crypto from 'crypto';
import { DbOps } from './db';

interface Ticket {
  userId: string;
  expiresAt: number;
}

interface CouplePresence {
  sockets: Map<string, string>; // userId -> socketId
  bothOnlineTimer?: ReturnType<typeof setTimeout>;
  bothEmitted: boolean;
  coincidenceId?: number;
  coincidenceStart?: number;
  userIds: [string, string]; // stored for DB logging
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

export function setupSocket(httpServer: HttpServer, dbOps: DbOps): Server {
  const io = new Server(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket'],
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
    checkBothOnline(io, key, presence, dbOps);
    socket.to(key).emit('partner_online', { online: true });

    // Touch relay
    socket.data.isTouching = false;

    socket.on('touch_start', () => {
      socket.data.isTouching = true;
      socket.to(key).emit('touch_start', { from: userId });
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

        // End coincidence logging
        if (presence.coincidenceId && presence.coincidenceStart) {
          const duration = Math.round((Date.now() - presence.coincidenceStart) / 1000);
          try { dbOps.endCoincidence(presence.coincidenceId, duration); } catch {}
          presence.coincidenceId = undefined;
          presence.coincidenceStart = undefined;
        }
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

function checkBothOnline(io: Server, key: string, presence: CouplePresence, dbOps: DbOps) {
  if (presence.sockets.size >= 2) {
    if (presence.bothOnlineTimer) clearTimeout(presence.bothOnlineTimer);
    presence.bothOnlineTimer = setTimeout(() => {
      if (presence.sockets.size >= 2) {
        io.to(key).emit('presence_both');
        presence.bothEmitted = true;

        // Log coincidence
        try {
          const [uid, pid] = presence.userIds;
          presence.coincidenceId = dbOps.logCoincidence(uid, pid);
          presence.coincidenceStart = Date.now();
        } catch {}
      }
    }, 3000);
  }
}
