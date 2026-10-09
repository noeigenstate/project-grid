import { useEffect, useRef, useState } from 'react';
import type { AgentScreen } from '../agents/agent-screen-types';

const WELCOME_STARTUP_MS = 4000;
export const hasStatusFooter = (screen: AgentScreen) => !!(screen.status.model || screen.status.effort || screen.status.context || screen.status.mode || screen.status.notes.length);
export const welcomeStarting = (screen: AgentScreen, startedAt: number, now: number, seenFooter: boolean) =>
  !screen.banner && (now - startedAt < WELCOME_STARTUP_MS || !seenFooter);

export function useWelcomeStarting(startedAt: number | null | undefined, screen: AgentScreen) {
  const fallback = useRef(Date.now()), seen = useRef(false);
  const since = startedAt ?? fallback.current;
  const previous = useRef(since), [now, setNow] = useState(Date.now);
  if (previous.current !== since) { previous.current = since; seen.current = false; }
  if (hasStatusFooter(screen)) seen.current = true;
  useEffect(() => {
    setNow(Date.now());
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, since + WELCOME_STARTUP_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [since]);
  return welcomeStarting(screen, since, now, seen.current);
}
