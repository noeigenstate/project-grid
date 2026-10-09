const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { Worker } = require('node:worker_threads');

const HOSTS = ['https://huggingface.co', 'https://hf-mirror.com'];
// Every file is pinned to one repository revision, so a repository update can never change the verified bytes.
const pinned = (repository, revision, files) => files.map(file => ({ ...file, urls: HOSTS.map(host => `${host}/${repository}/resolve/${revision}/${file.name}?download=true`) }));

// The recognizers to choose from, all run on the CPU through sherpa-onnx. config turns a file name into the
// model part of the recognizer's configuration.
const MODELS = {
  // SenseVoice Small (int8): strong Mandarin accuracy, simplified output with punctuation, and non-autoregressive
  // decoding that turns a sentence into text in well under a second. The 2025-09-09 re-export was rejected: with
  // sherpa-onnx 1.13.8 it ignores language detection and inverse text normalization.
  sensevoice: {
    label: 'SenseVoice Small', directory: 'sense-voice-2024-07-17',
    files: pinned('csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17', '2365baeacb507f821a0c8120fcee3d484dba7a07', [
      { name: 'tokens.txt', size: 315894, sha256: 'f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc' },
      { name: 'model.int8.onnx', size: 239233841, sha256: 'c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51' },
    ]),
    config: file => ({ senseVoice: { model: file('model.int8.onnx'), language: 'auto', useInverseTextNormalization: 1 }, tokens: file('tokens.txt') }),
  },
  // Qwen3-ASR 0.6B (int8): for speech that mixes Chinese and English. On dictation-style sentences (scripts/voice-bench.mjs)
  // it made about a third fewer errors than SenseVoice on mixed sentences and kept the English words' own spelling
  // and case (useEffect, TypeScript, GitHub), with punctuation. It needs about 1.7 GB while loaded and decodes at
  // about a third of real time. FireRedASR2 scored a little lower on errors but writes English in capitals without
  // punctuation, and is slower.
  qwen3: {
    label: 'Qwen3-ASR 0.6B', directory: 'qwen3-asr-0.6b-2026-03-25',
    files: pinned('csukuangfj2/sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25', '68818b2313fe77bd06f6a7c5068ff3ef59d02b8a', [
      { name: 'tokenizer/merges.txt', size: 1671853, sha256: '8831e4f1a044471340f7c0a83d7bd71306a5b867e95fd870f74d0c5308a904d5' },
      { name: 'tokenizer/tokenizer_config.json', size: 12487, sha256: '4942d005604266809309cabc9f4e9cb89ce855d59b14681fdc0e1cc62ea26c4c' },
      { name: 'tokenizer/vocab.json', size: 2776833, sha256: 'ca10d7e9fb3ed18575dd1e277a2579c16d108e32f27439684afa0e10b1440910' },
      { name: 'conv_frontend.onnx', size: 44148281, sha256: 'd22dc4423e0940e49884e903d2ea2f7e5567c14fc1aed97e4e26d6b8f208ef9e' },
      { name: 'encoder.int8.onnx', size: 182491662, sha256: '60748d3e6744a57c9c91e1b17424a6c2990567e8adceb0783940c03ed98fa9d9' },
      { name: 'decoder.int8.onnx', size: 755914231, sha256: '4f6885be5959ae26af3089d38ee7972c5fafbeeb1cf8d5e76eab6d8b61ca5771' },
    ]),
    config: file => ({ qwen3Asr: { convFrontend: file('conv_frontend.onnx'), encoder: file('encoder.int8.onnx'), decoder: file('decoder.int8.onnx'), tokenizer: file('tokenizer'), hotwords: '' } }),
  },
};
// Downloaded after installation, and used while a model chosen later is still downloading.
const DEFAULT_MODEL = 'sensevoice';
const downloadBytes = id => MODELS[id].files.reduce((total, file) => total + file.size, 0);
// Files from the previous Whisper engine, removed once so they stop occupying about 64 MB.
const LEGACY_ENTRIES = ['runtime', 'runtime.zip', 'runtime.zip.partial', 'model.bin', 'model.bin.partial', 'recordings'];
// A loaded model holds a few hundred MB or more. It is released after this long without dictation and loaded
// again while the next recording is being spoken (warm).
const IDLE_RELEASE = 5 * 60 * 1000;

async function digest(filename) { const hash = createHash('sha256'); for await (const chunk of fs.createReadStream(filename)) hash.update(chunk); return hash.digest('hex'); }

async function downloadFrom(url, asset, filename, fetcher, signal, progress) {
  const partial = filename + '.partial';
  let offset = 0;
  try { offset = (await fsp.stat(partial)).size; } catch { }
  if (offset > asset.size) { await fsp.unlink(partial); offset = 0; }
  if (offset < asset.size) {
    const response = await fetcher(url, { headers: offset ? { Range: `bytes=${offset}-` } : {}, signal });
    if (!response.ok || !response.body) throw new Error(`下载失败（HTTP ${response.status}），请检查网络后重试。`);
    if (response.status === 206) { if (!response.headers.get('content-range')?.startsWith(`bytes ${offset}-`)) throw new Error('下载续传响应无效，请重试。'); }
    else offset = 0;
    const file = await fsp.open(partial, offset ? 'a' : 'w');
    try {
      for await (const value of response.body) {
        if (signal.aborted) throw new Error('下载已暂停。');
        if (offset + value.length > asset.size) throw new Error('下载文件大小不正确。');
        await file.writeFile(value); offset += value.length; progress(offset);
      }
    } finally { await file.close(); }
  }
  if (offset !== asset.size) throw new Error('下载中断，稍后会自动继续。');
  if (await digest(partial) !== asset.sha256) { await fsp.unlink(partial); throw new Error('下载文件校验失败，请重试。'); }
  await fsp.rename(partial, filename);
}

// Tries each mirror in turn. A partial file is shared between mirrors because every mirror
// serves identical bytes, and the final SHA-256 check rejects anything that is not.
async function downloadAsset(asset, filename, fetcher, signal, progress) {
  await fsp.mkdir(path.dirname(filename), { recursive: true });
  try { if ((await fsp.stat(filename)).size === asset.size && await digest(filename) === asset.sha256) { progress(asset.size); return; } } catch { }
  let failure;
  for (const url of asset.urls || [asset.url]) {
    if (signal.aborted) break;
    try { return await downloadFrom(url, asset, filename, fetcher, signal, progress); }
    catch (error) { failure = error; }
  }
  throw failure || new Error('下载已暂停。');
}

function validateAudio(value) {
  const bytes = Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value);
  if (bytes.length < 44 || bytes.length > 20 * 1024 * 1024 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.readUInt32LE(4) !== bytes.length - 8 || bytes.toString('ascii', 8, 12) !== 'WAVE' || bytes.toString('ascii', 12, 16) !== 'fmt ' || bytes.readUInt32LE(16) !== 16 || bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(22) !== 1 || bytes.readUInt32LE(24) !== 16000 || bytes.readUInt32LE(28) !== 32000 || bytes.readUInt16LE(32) !== 2 || bytes.readUInt16LE(34) !== 16 || bytes.toString('ascii', 36, 40) !== 'data' || bytes.readUInt32LE(40) !== bytes.length - 44 || (bytes.length - 44) % 2) throw new Error('录音数据无效，请重新录制。');
  if (bytes.length - 44 < 16000) throw new Error('录音太短，请说完后再停止。');
  return bytes;
}

function samplesFromWav(bytes) {
  const samples = new Float32Array((bytes.length - 44) / 2);
  for (let index = 0; index < samples.length; index++) samples[index] = bytes.readInt16LE(44 + index * 2) / 32768;
  return samples;
}

// One model is chosen in settings. Recordings go to it once it is downloaded; until then they go to the
// default model, so choosing a larger one never interrupts dictation.
class VoiceManager {
  constructor({ directory, model = DEFAULT_MODEL, fetcher = fetch, changed = () => {}, idle = IDLE_RELEASE, worker = path.join(__dirname, 'voice-worker.cjs') }) {
    Object.assign(this, { directory, fetcher, changed, idle, workerFile: worker });
    this.choice = MODELS[model] ? model : DEFAULT_MODEL;
    this.status = Object.fromEntries(Object.keys(MODELS).map(id => [id, { phase: 'missing', percent: 0, error: null }]));
    this.transcribing = false;
    this.state = this.snapshot();
    this.requests = new Map(); this.sequence = 0;
  }
  file(id, name) { return path.join(this.directory, MODELS[id].directory, name); }
  // The model recordings go to now: the chosen one, else the default, else any downloaded one while the chosen one
  // is not downloaded yet.
  active() { return [this.choice, DEFAULT_MODEL, ...Object.keys(MODELS)].find(id => this.status[id].phase === 'ready') || null; }
  // phase, percent and error describe the model in use, or, before any is downloaded, the chosen one.
  snapshot() {
    const active = this.active(), shown = this.status[active || this.choice];
    return {
      phase: !active ? shown.phase : this.transcribing ? 'transcribing' : 'ready', ready: !!active, percent: shown.percent, error: shown.error,
      model: MODELS[active || this.choice].label, downloadBytes: downloadBytes(this.choice), choice: this.choice, active,
      models: Object.keys(MODELS).map(id => ({ id, label: MODELS[id].label, downloadBytes: downloadBytes(id), ...this.status[id] })),
    };
  }
  emit() { const next = this.snapshot(); if (JSON.stringify(next) === JSON.stringify(this.state)) return; this.state = next; this.changed(next); }
  set(id, patch) { Object.assign(this.status[id], patch); this.emit(); }
  async getState() {
    this.initialized ??= (async () => {
      await Promise.all(LEGACY_ENTRIES.map(name => fsp.rm(path.join(this.directory, name), { recursive: true, force: true }).catch(() => {})));
      // Size is enough at startup; the full hash already ran when each file was downloaded.
      await Promise.all(Object.keys(MODELS).map(async id => {
        try { for (const file of MODELS[id].files) if ((await fsp.stat(this.file(id, file.name))).size !== file.size) return; } catch { return; }
        this.set(id, { phase: 'ready', percent: 100 });
      }));
    })();
    await this.initialized; return this.snapshot();
  }
  // Downloads a model (the chosen one unless named). One download runs at a time; starting another pauses it,
  // and its partial files resume later.
  async prepare(id = this.choice) {
    await this.getState();
    if (this.status[id].phase === 'ready') return this.snapshot();
    // A live download of this model is the one to wait for; any other (or one being stopped) ends first, so two
    // writers never share a partial file.
    while (this.download) {
      const previous = this.download;
      if (previous.id === id && !previous.controller.signal.aborted) return previous.promise;
      previous.controller.abort();
      await previous.promise.catch(() => {});
    }
    const controller = new AbortController();
    this.set(id, { phase: 'downloading', error: null });
    const promise = (async () => {
      try {
        let completed = 0; const total = downloadBytes(id);
        for (const file of MODELS[id].files) {
          await downloadAsset(file, this.file(id, file.name), this.fetcher, controller.signal, count => this.set(id, { percent: Math.floor((completed + count) / total * 100) }));
          completed += file.size;
        }
        this.set(id, { phase: 'ready', percent: 100, error: null });
      } catch (error) {
        this.set(id, controller.signal.aborted ? { phase: 'missing', error: id === this.choice ? '下载已暂停，下次启动会继续。' : null } : { phase: 'error', error: error.message });
        throw error;
      } finally { if (this.download?.controller === controller) this.download = null; }
      return this.snapshot();
    })();
    this.download = { id, controller, promise };
    return promise;
  }
  // Chosen in settings: downloads it if needed. The loaded recognizer changes between recordings (engine).
  choose(id) {
    if (!MODELS[id] || id === this.choice) return;
    this.choice = id; this.emit();
    if (this.download && this.download.id !== id) this.download.controller.abort();
    void this.prepare(id).catch(() => {});
  }
  engine() {
    this.rest();
    const id = this.active();
    if (this.worker && this.workerModel === id) return this.worker;
    // A different model is now in use; the previous one has no recognition pending (transcribe runs one at a time).
    const previous = this.worker; this.worker = null; void previous?.terminate();
    const threads = Math.min(4, Math.max(1, os.availableParallelism() - 2));
    const worker = this.worker = new Worker(this.workerFile, { workerData: { model: MODELS[id].config(name => this.file(id, name)), threads } });
    this.workerModel = id;
    worker.on('message', ({ id, text, error }) => {
      const request = this.requests.get(id); if (!request) return;
      this.requests.delete(id);
      if (error) request.reject(new Error(`本地识别失败：${error}`)); else request.resolve(text);
    });
    // A released worker exits after its successor may have started; only the current one's end is a failure.
    const fail = error => {
      if (this.worker !== worker) return;
      for (const { reject } of this.requests.values()) reject(new Error(`本地识别引擎已停止：${error?.message || error}`));
      this.requests.clear(); this.worker = null;
    };
    worker.on('error', fail);
    worker.on('exit', code => fail(`退出代码 ${code}`));
    return worker;
  }
  // Counts the idle time again from now. When it runs out the worker and its model are released.
  rest() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.requests.size) { this.rest(); return; }
      const worker = this.worker; this.worker = null; void worker?.terminate();
    }, this.idle);
    this.idleTimer.unref?.();
  }
  // Loads the model while a recording is still being spoken, so recognition starts at once.
  async warm() {
    await this.getState();
    // A recognition still running keeps its worker, even if another model was chosen meanwhile.
    if (this.active() && !this.requests.size) this.engine().postMessage({ warm: true });
  }
  async transcribe(audio) {
    const state = await this.getState();
    if (!state.ready) throw new Error(state.phase === 'downloading' ? `语音模型正在下载（${state.percent}%），完成后即可使用。` : '语音模型尚未下载。');
    if (this.requests.size) throw new Error('正在识别上一段录音，请稍后。');
    const samples = samplesFromWav(validateAudio(audio));
    this.transcribing = true; this.emit();
    try {
      const id = ++this.sequence;
      const raw = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { this.requests.delete(id); reject(new Error('识别超时，请缩短录音后重试。')); }, 2 * 60 * 1000);
        this.requests.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
        this.engine().postMessage({ id, samples }, [samples.buffer]);
      });
      const text = raw.trim();
      if (!text) throw new Error('没有识别到文字，请靠近麦克风重试。');
      return text;
    } finally { this.transcribing = false; this.emit(); }
  }
  // Shutdown: stop any download and fail pending recognitions before the worker goes away.
  close() {
    this.download?.controller.abort(); clearTimeout(this.idleTimer);
    for (const { reject } of this.requests.values()) reject(new Error('识别已取消。'));
    this.requests.clear();
    const worker = this.worker; this.worker = null; void worker?.terminate();
  }
}
module.exports = { VoiceManager, MODELS, DEFAULT_MODEL, downloadBytes, digest, downloadAsset, validateAudio, samplesFromWav };
