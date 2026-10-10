// A record too large to read whole (over 1 MB) is skipped, except one: Codex writes a generated picture's pixels into
// the record that reports it. What the reading view needs of it lies at its two ends, the picture's id, state and
// prompt at the start and the file it was saved to at the end, so a reader keeps the start and the end of an oversized
// line and this rebuilds the record without the pixels.
const HEAD = 64 * 1024, TAIL = 8 * 1024;

const field = (text, name) => {
  const match = new RegExp(`"${name}":"((?:[^"\\\\]|\\\\.)*)"`).exec(text);
  if (!match) return null;
  try { return JSON.parse(`"${match[1]}"`); } catch { return null; }
};

function oversizedRecord(head, tail) {
  const start = head.toString('utf8'), end = tail.toString('utf8');
  const item = start.indexOf('"item":');
  if (item < 0 || !/"kind":"image_gen\.generation"|"type":"imageGeneration"/.test(start.slice(item))) return null;
  const savedPath = field(end, 'savedPath');
  if (!savedPath) return null;
  const body = start.slice(item);
  return { timestamp: field(start, 'timestamp'), type: 'event_msg', payload: { type: 'item_completed', item: {
    type: 'Extension', kind: 'image_gen.generation', id: field(body, 'id'), status: field(body, 'status'), revisedPrompt: field(body, 'revisedPrompt'), savedPath,
  } } };
}

// Follows one line that outgrew the reader's limit: the first HEAD bytes and the last TAIL bytes it had.
class OversizedLine {
  constructor(start) { this.head = Buffer.from(start.subarray(0, HEAD)); this.tail = Buffer.from(start.subarray(-TAIL)); }
  add(chunk) { this.tail = Buffer.concat([this.tail, chunk]).subarray(-TAIL); }
  record() { return oversizedRecord(this.head, this.tail); }
}

module.exports = { OversizedLine, oversizedRecord };
