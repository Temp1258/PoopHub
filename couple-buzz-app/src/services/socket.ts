import { io, Socket } from 'socket.io-client';
import { API_URL } from '../constants';
import { api } from './api';

let socket: Socket | null = null;
let connecting = false;
let ticketRetries = 0;
const MAX_TICKET_RETRIES = 3;

type Listener = (...args: any[]) => void;
const listeners: Record<string, Set<Listener>> = {};

function emit(event: string, ...args: any[]) {
  listeners[event]?.forEach(fn => fn(...args));
}

export function subscribe(event: string, fn: Listener): () => void {
  if (!listeners[event]) listeners[event] = new Set();
  listeners[event].add(fn);
  return () => { listeners[event]?.delete(fn); };
}

export async function connectSocket(): Promise<void> {
  if (socket?.connected || connecting) return;
  connecting = true;

  try {
    const { ticket } = await api.getWsTicket();
    const wsUrl = API_URL.replace(/^http/, 'ws');

    // Clean up old socket if exists
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }

    socket = io(wsUrl, {
      auth: { ticket },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: Infinity,
    });

    socket.on('touch_start', (data) => emit('touch_start', data));
    socket.on('touch_end', (data) => emit('touch_end', data));
    socket.on('partner_online', (data) => emit('partner_online', data));
    socket.on('presence_both', () => emit('presence_both'));
    socket.on('presence_single', () => emit('presence_single'));

    socket.on('connect', () => {
      ticketRetries = 0;
    });

    socket.on('connect_error', async (err) => {
      if (err.message === 'invalid_ticket' || err.message === 'missing_ticket') {
        if (ticketRetries >= MAX_TICKET_RETRIES) return;
        ticketRetries++;
        try {
          const { ticket: newTicket } = await api.getWsTicket();
          if (socket) {
            socket.auth = { ticket: newTicket };
            socket.connect();
          }
        } catch {}
      }
    });
  } catch {}

  connecting = false;
}

export function disconnectSocket(): void {
  connecting = false;
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function emitTouchStart(): void {
  socket?.emit('touch_start');
}

export function emitTouchEnd(): void {
  socket?.emit('touch_end');
}

export function isConnected(): boolean {
  return socket?.connected ?? false;
}
