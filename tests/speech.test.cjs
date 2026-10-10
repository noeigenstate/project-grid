const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SpeechManager, SPEECH_DIRECTORY, SPEECH_FILES, SPEECH_BYTES, speakableText } = require('../electron/speech.cjs');

test('notices become text the voice can read: colons and quotes turn into pauses, length is bounded', () => {
  assert.equal(speakableText('界面开发：给“登录页”加上验证码'), '界面开发，给登录页加上验证码');
  assert.equal(speakableText('project-manager: done'), 'project-manager， done');
  assert.equal(speakableText('x'.repeat(500)).length, 200);
  assert.equal(speakableText(null), '');
});

test('the natural voice is pinned by revision, size and SHA-256, and reports ready only when every file is present', async t => {
  assert.ok(SPEECH_FILES.every(file => /^[a-f\d]{64}$/.test(file.sha256) && file.size > 0 && file.urls.every(url => url.includes('/resolve/a0d5c6a264c0ef92d70d8661d8cc502d79627cd6/'))));
  assert.ok(SPEECH_BYTES > 70e6 && SPEECH_BYTES < 80e6, 'about 74 MB');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentrix-speech-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const missing = new SpeechManager({ directory });
  assert.equal((await missing.getState()).ready, false);
  await assert.rejects(missing.speak('你好'), /尚未下载/);
  for (const file of SPEECH_FILES) {
    const target = path.join(directory, SPEECH_DIRECTORY, file.name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.closeSync(fs.openSync(target, 'w')); fs.truncateSync(target, file.size);
  }
  const present = new SpeechManager({ directory });
  assert.equal((await present.getState()).phase, 'ready');
  await assert.rejects(present.speak('   '), /没有可播报的文字/);
});

test('the loaded voice is kept while a round is worked on, released when idle, and loads again on demand', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agentrix-speech-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const file of SPEECH_FILES) {
    const target = path.join(directory, SPEECH_DIRECTORY, file.name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.closeSync(fs.openSync(target, 'w')); fs.truncateSync(target, file.size);
  }
  let working = true;
  const speech = new SpeechManager({ directory, idle: 40, busy: () => working, worker: path.join(__dirname, 'helpers/voice-worker-stub.cjs') });
  t.after(() => speech.close());
  const released = async () => { for (let tries = 0; speech.worker && tries < 2000; tries++) await new Promise(resolve => setTimeout(resolve, 1)); return !speech.worker; };
  await speech.warm();
  const first = speech.worker;
  assert.ok(first, 'warming loads the voice');
  await speech.warm(); assert.equal(speech.worker, first, 'warming again keeps the loaded voice');
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(speech.worker, first, 'kept while a round is being worked on');
  working = false;
  assert.ok(await released(), 'released once idle');
  // The released worker ends after its successor has started; that must not fail the new notice.
  assert.equal((await speech.speak('界面开发，完成啦')).sampleRate, 16000);
  assert.ok(speech.worker && speech.worker !== first);
  assert.ok(await released(), 'released again after the notice');
});
