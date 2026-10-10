// Long answers are parsed in a worker, one at a time. A parse that takes too long is stopped (the worker is replaced)
// and its text shows as plain text instead of freezing the window. Results are kept for texts seen recently, so a
// conversation shown again is not parsed again.
const TIMEOUT = 2000, KEPT = 300;
type Job = { id: number; text: string; done: (html: string | null) => void };
let worker: Worker | null = null, running: (Job & { timer: ReturnType<typeof setTimeout> }) | null = null, sequence = 0;
const queue: Job[] = [];
const results = new Map<string, string | null>();

function remember(text: string, html: string | null) {
  results.delete(text); results.set(text, html);
  if (results.size > KEPT) results.delete(results.keys().next().value!);
}
function start() {
  if (running || !queue.length) return;
  const job = queue.shift()!;
  worker ??= new Worker(new URL('./markdown.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<{ id: number; html: string | null }>) => {
    if (!running || event.data.id !== running.id) return;
    const done = running; clearTimeout(done.timer); running = null;
    remember(done.text, event.data.html); done.done(event.data.html); start();
  };
  running = { ...job, timer: setTimeout(() => {
    const stuck = running!; running = null;
    worker?.terminate(); worker = null;
    remember(stuck.text, null); stuck.done(null); start();
  }, TIMEOUT) };
  worker.postMessage({ id: job.id, text: job.text });
}

// The HTML marked makes of text (not yet sanitized), or null when it could not be made in time.
export function parseMarkdown(text: string): Promise<string | null> {
  if (results.has(text)) { const html = results.get(text)!; remember(text, html); return Promise.resolve(html); }
  return new Promise(done => { queue.push({ id: ++sequence, text, done }); start(); });
}
export const parsedMarkdown = (text: string) => results.get(text);
