const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mentionToken, insertMention, mentionHighlights } = require('../src/features/reading/mention-tokens.ts');

test('mention tokens follow whitespace and stop at the caret, including empty queries', () => {
  assert.deepEqual(mentionToken('@', 1), { start: 0, end: 1, query: '' });
  assert.deepEqual(mentionToken('fix @src/ReadingView.tsx later', 12), { start: 4, end: 12, query: 'src/Rea' });
  assert.deepEqual(mentionToken('line\n@src/', 10), { start: 5, end: 10, query: 'src/' });
  assert.deepEqual(mentionToken('fix @old and @new', 17), { start: 13, end: 17, query: 'new' });
});

test('mentions reject email addresses, whitespace, selections and text before the token', () => {
  for (const draft of ['user@example.com', '(@src)', 'fix @src/ after', '@src/a b', '/@src', '@"complete"']) assert.equal(mentionToken(draft, draft.length), null, draft);
  assert.equal(mentionToken('@src', 2, 4), null);
  assert.equal(mentionToken('fix @src', 3), null);
  assert.equal(mentionToken('@src', 20), null);
});

test('file insertion quotes spaces, adds a space and preserves the surrounding draft', () => {
  const draft = 'fix @src/Re later', token = mentionToken(draft, 11);
  assert.deepEqual(insertMention(draft, token, { path: 'src/ReadingView.tsx', kind: 'file' }), { draft: 'fix @src/ReadingView.tsx  later', caret: 25 });
  assert.deepEqual(insertMention('@中文', mentionToken('@中文', 3), { path: 'docs/中文 file.md', kind: 'file' }), { draft: '@"docs/中文 file.md" ', caret: 19 });
});

test('directory insertion keeps a token open and quotes can be continued into a file', () => {
  const first = insertMention('fix @s', mentionToken('fix @s', 6), { path: 'src', kind: 'dir' });
  assert.deepEqual(first, { draft: 'fix @src/', caret: 9 });
  assert.deepEqual(mentionToken(first.draft, first.caret), { start: 4, end: 9, query: 'src/' });
  const quoted = insertMention('@docs', mentionToken('@docs', 5), { path: 'my docs', kind: 'dir' });
  assert.deepEqual(quoted, { draft: '@"my docs/"', caret: 10 });
  const token = mentionToken(quoted.draft, quoted.caret);
  assert.deepEqual(token, { start: 0, end: 11, query: 'my docs/' });
  assert.deepEqual(insertMention(quoted.draft, token, { path: 'my docs/read me.md', kind: 'file' }), { draft: '@"my docs/read me.md" ', caret: 22 });
});

test('highlights prefer a basename match and otherwise mark path matches or subsequences', () => {
  assert.deepEqual(mentionHighlights('read/ReadingView.tsx', 'REA'), [5, 6, 7]);
  assert.deepEqual(mentionHighlights('src/ReadingView.tsx', 'src/Re'), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(mentionHighlights('src/ReadingView.tsx', 'sRV'), [0, 1, 11]);
  assert.deepEqual(mentionHighlights('src/ReadingView.tsx', ''), []);
  assert.deepEqual(mentionHighlights('src/ReadingView.tsx', 'zzz'), []);
  assert.deepEqual(mentionHighlights('🌸/notes.ts', '🌸nt'), [0, 1, 3, 5]);
});
