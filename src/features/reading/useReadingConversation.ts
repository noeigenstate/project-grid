import { useEffect, useState } from 'react';
import type { ConversationEntry } from '../../shared/types';
import { createConversationBuffer } from './conversation-buffer';

export function conversationKey(id: string, sessionId: string | null) { return JSON.stringify([id, sessionId]); }

export function useReadingConversation(id: string, sessionId: string | null) {
  const key = conversationKey(id, sessionId);
  const [snapshot, setSnapshot] = useState<{ key: string; entries: ConversationEntry[] }>({ key, entries: [] });
  useEffect(() => {
    const buffer = createConversationBuffer(entries => setSnapshot({ key, entries }));
    const off = window.agentrix.onTerminalConversation(packet => { if (packet.id === id) buffer.push(packet); });
    void window.agentrix.terminalConversation(id).then(result => buffer.snapshot(result.ok ? result.value : []), () => buffer.snapshot([]));
    return () => { buffer.dispose(); off(); };
  }, [id, key]);
  // A changed terminal must never paint the previous session while its request is pending.
  return snapshot.key === key ? snapshot.entries : [];
}
