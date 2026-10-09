import type { AgentScreen, ScreenAgent, ScreenBanner, ScreenChoice, ScreenOption, ScreenStatus } from './agent-screen-types.ts';
import { parseQuestion } from './agent-question.ts';

const rule = (row: string) => /^[─╌]{2,}$/.test(row.trim());
const optionRow = (row: string) => /^(\s*)([❯›↓↑]?\s*)(\d+)\.\s+(.+)$/.exec(row);
const inputRow = (agent: ScreenAgent, row: string) =>
  (agent === 'claude' ? /^\s*❯(?:\s|$)/ : /^\s*›(?:\s|$)/).test(row) && !optionRow(row);
const hintRow = (row: string) => /^(?:press\s+)?(?:enter|esc)\b.*(?:cancel|confirm|select|back|default)/i.test(row.trim());
const menuExtra = (row: string) => /^(?:…\s*\+\d+ models|●\s+\S+ effort\b.*to adjust)$/.test(row.trim());
const permissionTitle = (row: string) => /^(?:Do you want\b|Would you like to run\b|Allow\b)/i.test(row);
const choiceTitle = (row: string) => permissionTitle(row) || /^Select\b/i.test(row);

// Claude surrounds its composer with rules; Codex puts its footer below the last composer.
// Historical user messages and popup cursor rows must not become footer anchors.
function footerStart(agent: ScreenAgent, rows: string[]): number {
  if (agent === 'claude') {
    for (let index = rows.length - 1; index >= 1; index--) {
      if (/^─{2,}$/.test(rows[index].trim())) {
        return inputRow(agent, rows[index - 1]) ? index + 1 : rows.length;
      }
    }
  } else {
    for (let index = rows.length - 1; index >= 0; index--) {
      if (inputRow(agent, rows[index])) return index + 1;
    }
  }
  return rows.length;
}

function parseStatus(agent: ScreenAgent, rows: string[], start: number): ScreenStatus {
  const status: ScreenStatus = { model: null, effort: null, context: null, mode: null, notes: [] };
  if (agent === 'claude') {
    for (let index = rows.length - 1; index >= start; index--) {
      const text = rows[index].trim();
      const model = /^⏺\s+(.+?)\s+·/.exec(text);
      const effort = /●\s+(\S+)\s+·\s+\/effort\b/.exec(text);
      const mode = /^[⏸⏵⏺]+\s+(.+?)(?:\s+·|\s+\(|$)/.exec(text);
      if (model && status.model === null) {
        status.model = model[1].trim();
        status.context = text.split('●')[0].split('·').map(part => part.trim())
          .find(part => /^ctx\s+/.test(part)) ?? null;
      }
      if (effort && status.effort === null) status.effort = effort[1];
      if (!model && mode && status.mode === null) status.mode = mode[1].trim();
    }
  } else {
    const footer = rows.slice(start).map(row => row.trim()).filter(Boolean);
    const model = /^(.+?)\s+·\s+[^·]+\s+·\s+(.+)$/.exec(footer[0] ?? '');
    if (model) {
      const effort = /^(.*?)\s+(none|minimal|low|medium|high|xhigh|max|ultra)$/.exec(model[1]);
      status.model = effort ? effort[1] : model[1];
      status.effort = effort?.[2] ?? null;
      status.context = model[2];
      for (const row of footer.slice(1)) {
        const note = row.replace(/^\? for shortcuts\s*/, '').trim();
        if (note && note !== '? / esc close') status.notes.push(note);
      }
    }
  }
  return status;
}

function parseBanner(agent: ScreenAgent, rows: string[], status: ScreenStatus): ScreenBanner | null {
  for (let index = rows.length - 1; index >= 0; index--) {
    const match = (agent === 'claude' ? /Claude Code v([^\s]+)/ : />_ OpenAI Codex \(v([^\s)]+)\)/).exec(rows[index]);
    if (!match) continue;
    const clean = (row: string) => row.replace(/^[\s\u2580-\u259f]+/, '').trim() || null;
    const model = agent === 'claude'
      ? /^(.+?) with (\S+) effort(?:\s+·\s+(.+))?$/.exec(clean(rows[index + 1] ?? '') ?? '')
      : null;
    return {
      product: agent === 'claude' ? 'Claude Code' : 'OpenAI Codex', version: match[1],
      model: agent === 'claude' ? model?.[1] ?? null : status.model,
      effort: agent === 'claude' ? model?.[2] ?? null : status.effort,
      plan: model?.[3] ?? null,
      directory: clean(rows[index + (agent === 'claude' ? 2 : 1)] ?? ''),
    };
  }
  return null;
}

function parseOverlay(agent: ScreenAgent, rows: string[], start: number): AgentScreen['overlay'] {
  if (agent === 'claude') {
    const popup = rows.slice(start);
    const input = rows[start - 2]?.trim() ?? '';
    if (popup.some(row => /^! for shell mode\b/.test(row.trim())) &&
        popup.some(row => /^\/ for commands\b/.test(row.trim()))) return 'shortcuts';
    if (/^❯\s*@/.test(input) && popup.some(row => /^\*\s+/.test(row.trim()))) return 'mention';
    if (/^❯\s*\//.test(input) && popup.some(row => /^\s*(?:❯\s*)?\/\S+\s{2,}\S/.test(row))) return 'slash';
  } else if (start < rows.length) {
    // Popups are above Codex's composer; their insertion/close hints identify the live block.
    let previousInput = start - 2;
    while (previousInput >= 0 && (!inputRow(agent, rows[previousInput]) ||
      /^\s*›\s+\S.*\s{2,}\S/.test(rows[previousInput]))) previousInput--;
    const popup = rows.slice(previousInput + 1, start - 1);
    const input = rows[start - 1].trim();
    if (popup.some(row => row.trim() === 'Keyboard shortcuts') &&
        rows.slice(start).some(row => row.trim() === '? / esc close')) return 'shortcuts';
    if (/^›\s*@/.test(input) && popup.some(row => row.trim() === 'Mentions') &&
        popup.some(row => /enter\/tab insert · esc close/.test(row))) return 'mention';
    // A selected slash suggestion is itself cursor-prefixed, so include the preceding input-like row.
    if (/^›\s*\//.test(input) && rows.slice(Math.max(previousInput, 0), start - 1)
      .some(row => /^\s*(?:›\s*)?\/\S+\s{2,}\S/.test(row))) return 'slash';
  }
  return 'none';
}

function parseChoice(agent: ScreenAgent, rows: string[]): ScreenChoice | null {
  let lastOption = rows.length - 1;
  while (lastOption >= 0 && !optionRow(rows[lastOption])) lastOption--;
  if (lastOption < 0) return null;

  let titleIndex = lastOption - 1;
  while (titleIndex >= 0 && !choiceTitle(rows[titleIndex].trim())) {
    if (inputRow(agent, rows[titleIndex])) return null;
    titleIndex--;
  }
  if (titleIndex < 0) return null;
  let firstOption = titleIndex + 1;
  while (firstOption <= lastOption && !optionRow(rows[firstOption])) firstOption++;

  const options: ScreenOption[] = [];
  let numberColumn = 0, hasDetail = false, end = firstOption;
  for (; end < rows.length; end++) {
    const row = rows[end], match = optionRow(row);
    if (match) {
      const columns = match[4].trim().split(/\s{2,}/);
      numberColumn = match[1].length + match[2].length;
      hasDetail = columns.length > 1;
      options.push({ number: Number(match[3]), label: columns[0], detail: columns.slice(1).join(' '),
        selected: match[2].includes(agent === 'claude' ? '❯' : '›'), hotkey: null });
    } else if (row.trim() && !rule(row) && !hintRow(row) && !menuExtra(row) && !inputRow(agent, row) &&
        row.search(/\S/) > numberColumn && options.length) {
      const option = options[options.length - 1];
      if (hasDetail) option.detail += ' ' + row.trim();
      else option.label += ' ' + row.trim();
    } else break;
  }
  if (end <= lastOption) return null;

  let hint: string | null = null;
  for (const row of rows.slice(end)) {
    if (hintRow(row)) hint = row.trim();
    else if (row.trim() && !rule(row) && !menuExtra(row)) return null;
  }
  if (agent === 'codex') {
    for (const option of options) {
      const field = option.detail ? 'detail' : 'label';
      const hotkey = /\s+\((y|p|esc)\)$/.exec(option[field]);
      if (hotkey) {
        option.hotkey = hotkey[1];
        option[field] = option[field].slice(0, hotkey.index).trimEnd();
      }
    }
  }

  const title = rows[titleIndex].trim();
  let contextStart = titleIndex + 1;
  if (agent === 'claude' && permissionTitle(title)) {
    // Claude displays the file/action before the question, bounded by the prompt's solid rule.
    contextStart = titleIndex - 1;
    while (contextStart >= 0 && !/^─{2,}$/.test(rows[contextStart].trim()) &&
        !inputRow(agent, rows[contextStart])) contextStart--;
    contextStart++;
  }
  return {
    title, kind: permissionTitle(title) ? 'permission' : 'menu', options, hint,
    context: rows.slice(contextStart, firstOption).filter((row, offset) =>
      contextStart + offset !== titleIndex && row.trim() && !rule(row)).map(row => row.trim()),
  };
}

export function parseAgentScreen(agent: ScreenAgent, rows: string[]): AgentScreen {
  // Retain leading/column whitespace for option alignment; normalize CRLF and terminal padding.
  const normalized = rows.map(row => row.replace(/[\s\r]+$/, ''));
  const start = footerStart(agent, normalized);
  const status = parseStatus(agent, normalized, start);
  const overlay = parseOverlay(agent, normalized, start);
  return { banner: parseBanner(agent, normalized, status), status,
    choice: overlay === 'none' ? parseQuestion(agent, normalized) ?? parseChoice(agent, normalized) : null, overlay };
}
