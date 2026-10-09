const { test } = require('node:test');
const assert = require('node:assert/strict');
const { usesSessionPicker, resumeReadingSession, sessionAge } = require('../src/features/reading/reading-sessions.ts');
const { welcomeStarting, hasStatusFooter } = require('../src/features/reading/reading-welcome.ts');

test('only exact /resume for active Claude opens the native picker', () => {
  assert.equal(usesSessionPicker({ agent: 'claude', codexActive: true }, '/resume'), true);
  for (const text of ['/resume abc', '/resume-all', '/RESUME', 'hello', '/resume\n']) assert.equal(usesSessionPicker({ agent: 'claude', codexActive: true }, text), false);
  assert.equal(usesSessionPicker({ agent: 'codex', codexActive: true }, '/resume'), false);
  assert.equal(usesSessionPicker({ agent: 'claude', codexActive: false }, '/resume'), false);
});

test('targeted resume is typed before Enter, aborts when unmounted, and propagates follow errors', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const written = [], followed = []; let active = true;
  const pending = resumeReadingSession('session-id', text => written.push(text), async id => { followed.push(id); return { ok: true, value: true }; }, () => active);
  assert.deepEqual(written, ['/resume session-id']); assert.deepEqual(followed, []);
  t.mock.timers.tick(149); await Promise.resolve(); assert.equal(written.length, 1);
  active = false; t.mock.timers.tick(1); assert.equal(await pending, false); assert.deepEqual(followed, []);
  const failing = resumeReadingSession('session-id', text => written.push(text), async () => ({ ok: false, error: 'Read failed' }), () => true);
  const rejection = assert.rejects(failing, /Read failed/); t.mock.timers.tick(150); await rejection;
  assert.equal(written.at(-1), '\r');
  await assert.rejects(resumeReadingSession('../unsafe', () => assert.fail(), () => assert.fail(), () => true), /Invalid session/);
});

test('relative session times use minute, hour and day boundaries and clamp future times', () => {
  const now = 1000000000;
  assert.deepEqual(sessionAge(now + 1000, now), { unit: 'now', count: 0 });
  assert.deepEqual(sessionAge(now - 59000, now), { unit: 'now', count: 0 });
  assert.deepEqual(sessionAge(now - 180000, now), { unit: 'minutes', count: 3 });
  assert.deepEqual(sessionAge(now - 3600000, now), { unit: 'hours', count: 1 });
  assert.deepEqual(sessionAge(now - 86400000, now), { unit: 'days', count: 1 });
});

test('welcome settles after four seconds with a parsed footer, even without banner metadata', () => {
  const screen = { banner: null, status: { model: 'Opus 5.5', effort: 'high', context: null, mode: null, notes: [] } };
  assert.equal(hasStatusFooter(screen), true);
  assert.equal(welcomeStarting(screen, 1000, 4999, true), true);
  assert.equal(welcomeStarting(screen, 1000, 5000, true), false);
  assert.equal(welcomeStarting(screen, 1000, 5000, false), true);
  assert.equal(welcomeStarting({ ...screen, banner: { product: 'Claude Code' } }, 1000, 1001, false), false);
  const blank = { banner: null, status: { model: null, effort: null, context: null, mode: null, notes: [] } };
  assert.equal(hasStatusFooter(blank), false);
  assert.equal(welcomeStarting(blank, 1000, 8000, true), false, 'a footer that scrolled away does not rearm startup');
});
