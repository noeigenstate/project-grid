import type { ProjectTerminal, Result } from '../../shared/types';

export const usesSessionPicker = (terminal: Pick<ProjectTerminal, 'agent' | 'codexActive'>, text: string) =>
  terminal.agent === 'claude' && terminal.codexActive && text === '/resume';

// Like other slash commands, send typed text, wait for the CLI redraw, then send Enter separately.
export async function resumeReadingSession(id: string, write: (text: string) => void,
  follow: (id: string) => Promise<Result<boolean>>, active: () => boolean) {
  if (!/^[\w-]{1,100}$/.test(id)) throw new Error('Invalid session id');
  if (!active()) return false;
  write(`/resume ${id}`);
  await new Promise(resolve => setTimeout(resolve, 150));
  if (!active()) return false;
  write('\r');
  const result = await follow(id);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

export function sessionAge(updatedAt: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - updatedAt) / 60000));
  if (minutes < 1) return { unit: 'now', count: 0 } as const;
  if (minutes < 60) return { unit: 'minutes', count: minutes } as const;
  if (minutes < 1440) return { unit: 'hours', count: Math.floor(minutes / 60) } as const;
  return { unit: 'days', count: Math.floor(minutes / 1440) } as const;
}
