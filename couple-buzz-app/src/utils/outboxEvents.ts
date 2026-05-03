// Lightweight in-process event bus for "outbox just changed". Fired from
// WriteLetterScreen on successful submission so MailboxScreen can refresh
// its 🚩 and App.tsx can flip the 信箱 tab red dot — without threading a
// callback through three layers of props.

type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyOutboxChanged(): void {
  for (const fn of listeners) {
    try { fn(); } catch {}
  }
}

export function subscribeOutboxChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
