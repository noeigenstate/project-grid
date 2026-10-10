import { marked } from 'marked';

// Markdown to HTML off the window's thread: a long or pathological answer (thousands of nested emphasis marks) can
// take seconds to parse, and here it can be stopped. The HTML is sanitized by the window, which has the DOM for it.
self.onmessage = (event: MessageEvent<{ id: number; text: string }>) => {
  const { id, text } = event.data;
  let html: string | null = null;
  try { html = marked.parse(text, { async: false, gfm: true, breaks: true }) as string; } catch { }
  self.postMessage({ id, html });
};
