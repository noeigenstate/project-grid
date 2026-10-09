// Renderer echoes are replaced only by newly observed user records, one record per send.
export const PENDING_PROMPT_TIMEOUT = 20_000;
type UserRecord = { id: string; role: string; text?: string };
export type PendingPrompt = { id: string; role: 'user'; text: string; at: number; sending: boolean };
export type PendingPrompts = { sessionId: string | null; prompts: readonly PendingPrompt[]; seen: readonly string[] };

export const normalizePrompt = (text: string) => text.trim().replace(/\s+/g, ' ');
export const isTypedCommand = (text: string) => /^[\/!]/.test(text) && !/[\r\n]/.test(text);

export function createPendingPrompts(sessionId: string | null, entries: readonly UserRecord[] = []): PendingPrompts {
  return { sessionId, prompts: [], seen: entries.filter(entry => entry.role === 'user').map(entry => entry.id) };
}

export function reconcilePendingPrompts(state: PendingPrompts, sessionId: string | null, entries: readonly UserRecord[], now: number): PendingPrompts {
  if (state.sessionId !== sessionId) return createPendingPrompts(sessionId, entries);
  const seen = new Set(state.seen), prompts = [...state.prompts];
  let changed = false;
  for (const entry of entries) {
    if (entry.role !== 'user' || seen.has(entry.id)) continue;
    seen.add(entry.id); changed = true;
    // The echo with the same text, or one this record ends with: a prompt Claude put back after an interrupt can
    // precede what was sent.
    const text = normalizePrompt(entry.text ?? '');
    let index = prompts.findIndex(prompt => normalizePrompt(prompt.text) === text);
    if (index < 0) index = prompts.findIndex(prompt => text.endsWith(normalizePrompt(prompt.text)));
    if (index >= 0) prompts.splice(index, 1);
  }
  for (let index = 0; index < prompts.length; index++) {
    const prompt = prompts[index];
    if (prompt.sending && now - prompt.at >= PENDING_PROMPT_TIMEOUT) {
      prompts[index] = { ...prompt, sending: false }; changed = true;
    }
  }
  return changed ? { ...state, prompts, seen: [...seen] } : state;
}

export function addPendingPrompt(state: PendingPrompts, id: string, text: string, now: number): PendingPrompts {
  if (!normalizePrompt(text) || isTypedCommand(text)) return state;
  return { ...state, prompts: [...state.prompts, { id, role: 'user', text, at: now, sending: true }] };
}

export function removePendingPrompt(state: PendingPrompts, id: string): PendingPrompts {
  const prompts = state.prompts.filter(prompt => prompt.id !== id);
  return prompts.length === state.prompts.length ? state : { ...state, prompts };
}
