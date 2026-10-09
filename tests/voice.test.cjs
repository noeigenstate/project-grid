const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { VoiceManager, downloadAsset, validateAudio, samplesFromWav, MODELS } = require('../electron/voice.cjs');
const { wavFromSamples } = require('../src/features/voice/voice-audio.ts');

test('microphone encoder makes bounded mono 16 kHz WAV with safe clipping', () => {
  const samples = new Float32Array(16000); samples[0] = 2; samples[1] = -2; samples[2] = .5;
  const bytes = validateAudio(wavFromSamples(samples));
  assert.equal(bytes.readInt16LE(44), 32767); assert.equal(bytes.readInt16LE(46), -32768); assert.equal(bytes.readInt16LE(48), 16384);
  assert.throws(() => validateAudio(Buffer.from('invalid audio')), /无效/);
  const corrupt = Buffer.from(bytes); corrupt.writeUInt32LE(1, 40); assert.throws(() => validateAudio(corrupt), /无效/);
  assert.throws(() => validateAudio(wavFromSamples(new Float32Array(100))), /太短/);
});

test('offline model download resumes verified bytes and rejects corrupt content', async t => {
  const prefix = path.join(os.tmpdir(), 'project-grid-voice-test-'); const folder = await fs.mkdtemp(prefix);
  t.after(async () => { assert.ok(path.resolve(folder).startsWith(prefix)); await fs.rm(folder, { recursive: true, force: true }); });
  const bytes = Buffer.from('verified model fixture');
  const asset = { url: 'https://example.invalid/model', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  const filename = path.join(folder, 'model.bin'); await fs.writeFile(filename + '.partial', bytes.subarray(0, 5));
  const progress = [];
  await downloadAsset(asset, filename, async (_url, options) => { assert.equal(options.headers.Range, 'bytes=5-'); return new Response(bytes.subarray(5), { status: 206, headers: { 'Content-Range': `bytes 5-${bytes.length - 1}/${bytes.length}` } }); }, new AbortController().signal, value => progress.push(value));
  assert.deepEqual(await fs.readFile(filename), bytes); assert.equal(progress.at(-1), bytes.length);
  const bad = path.join(folder, 'bad.bin');
  await assert.rejects(downloadAsset(asset, bad, async () => new Response(Buffer.alloc(bytes.length, 1)), new AbortController().signal, () => {}), /校验失败/);
  await assert.rejects(fs.stat(bad)); await assert.rejects(fs.stat(bad + '.partial'));
});

test('model download falls back to the mirror and keeps the partial bytes', async t => {
  const prefix = path.join(os.tmpdir(), 'project-grid-voice-test-'); const folder = await fs.mkdtemp(prefix);
  t.after(async () => { assert.ok(path.resolve(folder).startsWith(prefix)); await fs.rm(folder, { recursive: true, force: true }); });
  const bytes = Buffer.from('mirrored model fixture');
  const asset = { urls: ['https://primary.invalid/model', 'https://mirror.invalid/model'], size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  const filename = path.join(folder, 'model.onnx'); await fs.writeFile(filename + '.partial', bytes.subarray(0, 4));
  const requested = [];
  await downloadAsset(asset, filename, async (url, options) => {
    requested.push([url, options.headers.Range]);
    if (url.startsWith('https://primary')) throw new TypeError('fetch failed');
    return new Response(bytes.subarray(4), { status: 206, headers: { 'Content-Range': `bytes 4-${bytes.length - 1}/${bytes.length}` } });
  }, new AbortController().signal, () => {});
  assert.deepEqual(requested, [['https://primary.invalid/model', 'bytes=4-'], ['https://mirror.invalid/model', 'bytes=4-']]);
  assert.deepEqual(await fs.readFile(filename), bytes);
});

test('recorded WAV becomes normalized samples for the recognizer', () => {
  const samples = new Float32Array(16000); samples[0] = .5; samples[1] = -1;
  const decoded = samplesFromWav(validateAudio(wavFromSamples(samples)));
  assert.equal(decoded.length, 16000); assert.ok(Math.abs(decoded[0] - .5) < 1e-4); assert.equal(decoded[1], -1);
});

test('the files of every recognizer are pinned and verified by size and SHA-256 on both hosts', () => {
  for (const [id, model] of Object.entries(MODELS)) {
    assert.ok(model.files.length >= 2, id); assert.ok(model.label && model.directory, id);
    for (const file of model.files) {
      assert.match(file.sha256, /^[0-9a-f]{64}$/); assert.ok(file.size > 0);
      assert.deepEqual(file.urls.map(url => new URL(url).host), ['huggingface.co', 'hf-mirror.com']);
      assert.ok(file.urls.every(url => /\/resolve\/[0-9a-f]{40}\//.test(url)), 'downloads are pinned to one repository revision');
    }
    // Every file the recognizer opens is one of the verified downloads.
    const opened = JSON.stringify(model.config(name => `<${name}>`)).match(/<[^>]+>/g);
    assert.deepEqual(opened.filter(name => !model.files.some(file => `<${file.name}>` === name || file.name.startsWith(name.slice(1, -1) + '/'))), [], id);
  }
});

test('the recognizer is released when idle and loads again for the next recording', async t => {
  const voice = new VoiceManager({ directory: os.tmpdir(), idle: 40, worker: path.join(__dirname, 'helpers/voice-worker-stub.cjs') });
  t.after(() => voice.close());
  // Stands for a downloaded model; the stub worker never opens it.
  voice.initialized = Promise.resolve(); voice.status.sensevoice.phase = 'ready';
  const released = async () => { for (let tries = 0; voice.worker && tries < 2000; tries++) await new Promise(resolve => setTimeout(resolve, 1)); return !voice.worker; };
  await voice.warm();
  const first = voice.worker;
  assert.ok(first, 'warming at the start of a recording loads the recognizer');
  assert.ok(await released(), 'released once idle');
  assert.equal(await voice.transcribe(wavFromSamples(new Float32Array(16000))), 'heard');
  assert.ok(voice.worker && voice.worker !== first);
  assert.ok(await released());
});

test('a chosen model downloads while dictation keeps using the default, then takes over between recordings', async t => {
  const prefix = path.join(os.tmpdir(), 'project-grid-voice-test-'); const folder = await fs.mkdtemp(prefix);
  const bytes = Buffer.from('larger model fixture');
  MODELS.fixture = { label: 'Fixture', directory: 'fixture', files: [{ name: 'model.onnx', urls: ['https://example.invalid/model'], size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }], config: file => ({ fixture: file('model.onnx') }) };
  let release; const served = new Promise(resolve => { release = resolve; });
  const states = [];
  const voice = new VoiceManager({ directory: folder, idle: 1000, worker: path.join(__dirname, 'helpers/voice-worker-stub.cjs'), changed: state => states.push(state), fetcher: async () => { await served; return new Response(bytes); } });
  t.after(async () => { voice.close(); delete MODELS.fixture; assert.ok(path.resolve(folder).startsWith(prefix)); await fs.rm(folder, { recursive: true, force: true }); });
  voice.initialized = Promise.resolve(); voice.status.sensevoice.phase = 'ready';
  voice.choose('fixture'); await new Promise(resolve => setImmediate(resolve));
  let state = await voice.getState();
  assert.deepEqual([state.choice, state.active, state.ready, state.model], ['fixture', 'sensevoice', true, 'SenseVoice Small']);
  assert.equal(state.models.find(model => model.id === 'fixture').phase, 'downloading');
  assert.equal(await voice.transcribe(wavFromSamples(new Float32Array(16000))), 'heard');
  assert.equal(voice.workerModel, 'sensevoice', 'recordings go to the default while the chosen model downloads');
  const first = voice.worker;
  release(); await voice.download.promise;
  state = await voice.getState();
  assert.deepEqual([state.active, state.model, state.phase], ['fixture', 'Fixture', 'ready']);
  assert.deepEqual(await fs.readFile(path.join(folder, 'fixture', 'model.onnx')), bytes);
  assert.equal(await voice.transcribe(wavFromSamples(new Float32Array(16000))), 'heard');
  assert.equal(voice.workerModel, 'fixture'); assert.notEqual(voice.worker, first, 'the next recording loads the chosen model');
  assert.ok(states.some(item => item.phase === 'transcribing'));
  voice.choose('sensevoice');
  assert.equal((await voice.getState()).active, 'sensevoice', 'choosing back switches at once');
});

test('a downloaded model stays in use when the chosen one and the default are both missing', () => {
  const voice = new VoiceManager({ directory: os.tmpdir(), model: 'sensevoice' });
  voice.status.qwen3.phase = 'ready';
  assert.equal(voice.active(), 'qwen3');
  voice.status.sensevoice.phase = 'ready';
  assert.equal(voice.active(), 'sensevoice', 'the chosen model once it is there');
});

test('choosing a model back while its download is being stopped starts it again', async t => {
  const prefix = path.join(os.tmpdir(), 'project-grid-voice-test-'); const folder = await fs.mkdtemp(prefix);
  const bytes = Buffer.from('fixture'), sha256 = createHash('sha256').update(bytes).digest('hex');
  MODELS.fixture = { label: 'Fixture', directory: 'fixture', files: [{ name: 'model.onnx', urls: ['https://example.invalid/m'], size: bytes.length, sha256 }], config: file => ({ fixture: file('model.onnx') }) };
  let calls = 0;
  const fetcher = async (_url, { signal }) => { calls++; if (calls === 1) await new Promise((_, reject) => signal.addEventListener('abort', () => setTimeout(() => reject(new Error('aborted')), 30))); return new Response(bytes); };
  const voice = new VoiceManager({ directory: folder, fetcher });
  t.after(async () => { voice.close(); delete MODELS.fixture; await fs.rm(folder, { recursive: true, force: true }); });
  voice.initialized = Promise.resolve(); voice.status.sensevoice.phase = 'ready';
  voice.choose('fixture');
  for (let tries = 0; tries < 200 && !calls; tries++) await new Promise(resolve => setTimeout(resolve, 5));
  voice.choose('sensevoice'); voice.choose('fixture');
  for (let tries = 0; tries < 200 && voice.status.fixture.phase !== 'ready'; tries++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(voice.status.fixture.phase, 'ready'); assert.equal(calls, 2);
});
