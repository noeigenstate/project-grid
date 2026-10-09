import type { ConversationEntry, ConversationPacket } from '../../shared/types';

export function applyConversationPacket(entries: readonly ConversationEntry[], packet: Pick<ConversationPacket, 'list' | 'changes'>): ConversationEntry[] {
  if (packet.list) return packet.list.slice(-400);
  const next = [...entries];
  const indices = new Map(next.map((entry, index) => [entry.id, index]));
  for (const entry of packet.changes ?? []) {
    const at = indices.get(entry.id);
    if (at === undefined) { indices.set(entry.id, next.length); next.push(entry); }
    else next[at] = entry;
  }
  return next.slice(-400);
}

// The initial IPC snapshot is the base; events received while it is in flight follow it.
// A fixed window bounds latency even when packets keep arriving during a working turn.
export function createConversationBuffer(apply: (entries: ConversationEntry[]) => void, delay = 50) {
  let entries: ConversationEntry[] = [], waiting = true, disposed = false;
  let queued: Pick<ConversationPacket, 'list' | 'changes'>[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (waiting || disposed || timer !== null) return;
    timer = setTimeout(() => { timer = null; apply(entries); }, delay);
  };
  return {
    snapshot(initial: ConversationEntry[]) {
      if (disposed) return;
      entries = initial.slice(-400);
      for (const packet of queued) entries = applyConversationPacket(entries, packet);
      queued = []; waiting = false; schedule();
    },
    push(packet: Pick<ConversationPacket, 'list' | 'changes'>) {
      if (disposed) return;
      if (waiting) queued.push(packet);
      else { entries = applyConversationPacket(entries, packet); schedule(); }
    },
    dispose() { disposed = true; queued = []; if (timer !== null) clearTimeout(timer); timer = null; },
  };
}
