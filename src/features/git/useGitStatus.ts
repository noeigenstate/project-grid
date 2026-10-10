import { useEffect, useRef, useState } from 'react';
import type { GitStatus } from '../../shared/types';

export function useGitStatus(projectId: string, enabled: boolean, revision: number) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const refreshRef = useRef<((force?: boolean) => void) | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true, running = false, queued = false, forceQueued = false, retryAt = 0;
    const refresh = async (force = false) => {
      if (!active || !force && Date.now() < retryAt) return;
      if (running) { queued = true; forceQueued ||= force; return; }
      running = true; setLoading(true);
      const started = Date.now();
      try {
        const result = await window.agentrix.gitStatus(projectId);
        if (!active) return;
        if (!result.ok) throw new Error(result.error);
        // The explorer asks again every few seconds. Where reading the status is slow (a large repository,
        // a remote host), automatic refreshes rest ten times as long as it took; the refresh button still acts at once.
        const took = Date.now() - started;
        setStatus(result.value); setError(''); retryAt = took > 300 ? Date.now() + Math.min(60000, took * 10) : 0;
      } catch (error) { if (active) { retryAt = Date.now() + 15000; setStatus(null); setError(String(error instanceof Error ? error.message : error)); } }
      finally { running = false; if (active) { setLoading(false); if (queued) { const force = forceQueued; queued = false; forceQueued = false; void refresh(force); } } }
    };
    refreshRef.current = force => { void refresh(force); };
    void refresh();
    return () => { active = false; refreshRef.current = null; };
  }, [projectId, enabled]);
  useEffect(() => { refreshRef.current?.(); }, [revision]);
  return { status, error, loading, refresh: () => refreshRef.current?.(true) };
}
