import type { Settings } from './types';

// Spoken completion notices. The natural voice is the offline MeloTTS model synthesized in the main
// process; until it has downloaded, the Windows voice Chromium exposes stands in (Huihui or Yaoyao for
// Mandarin, Zira for English). Both speak a little faster than their default, which sounds flat and slow.
const preferred = { zh: /huihui|yaoyao|xiaoxiao|xiaoyi/i, en: /zira|aria|jenny|hazel|susan/i };
const locale = { zh: 'zh-CN', en: 'en-US' };

// One short sentence: which project finished, and what when the prompt named it. Kept plain on purpose:
// it is heard many times a day.
const phrases = {
  zh: { task: '{项目}，{任务}，完成。', plain: '{项目}完成。' },
  en: { task: '{project}: {task}, done.', plain: '{project} done.' },
};

export function announcementVoice(language: Settings['language']) {
  const voices = window.speechSynthesis?.getVoices() || [];
  const matching = voices.filter(voice => voice.lang.toLowerCase().startsWith(language));
  return matching.find(voice => preferred[language].test(voice.name)) || matching[0] || null;
}

// summary: a sentence about what the round achieved, written by the agent's own CLI; it is spoken as it is.
function announcementText(name: string, task: string, settings: Pick<Settings, 'announcePhrase' | 'language'>, summary = '') {
  if (summary) return settings.language === 'en' ? `${name}: ${summary}` : `${name}，${summary}`;
  const template = settings.announcePhrase || phrases[settings.language][task ? 'task' : 'plain'];
  return template.replace(/\{(项目|project)\}/gi, name).replace(/\{(任务|task)\}/gi, task).replace(/[，,]\s*[，,]/g, '，');
}

function systemVoice(text: string, language: Settings['language']) {
  const speech = window.speechSynthesis;
  if (!speech) return Promise.resolve();
  return new Promise<void>(resolve => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale[language];
    const voice = announcementVoice(language);
    if (voice) utterance.voice = voice;
    utterance.rate = 1.25; utterance.pitch = 1.08; utterance.volume = 1;
    utterance.onend = utterance.onerror = () => resolve();
    speech.speak(utterance);
    setTimeout(resolve, 15000);
  });
}

let context: AudioContext | null = null;
async function play({ samples, sampleRate }: { samples: Float32Array<ArrayBuffer>; sampleRate: number }, onStart = () => {}) {
  context ??= new AudioContext();
  if (context.state === 'suspended') await context.resume();
  const buffer = context.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(samples, 0);
  // The model speaks softly (peaks near 0.13); bring each notice up to a clear, even level.
  let peak = 0; for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const gain = context.createGain(); gain.gain.value = peak > 0 ? Math.min(6, .9 / peak) : 1;
  const source = context.createBufferSource(); source.buffer = buffer; source.connect(gain); gain.connect(context.destination);
  await new Promise<void>(resolve => { source.onended = () => resolve(); source.start(); onStart(); });
}

// One notice at a time: rounds that finish together are read one after another.
let queue = Promise.resolve();
// Each finished round reaches here once (the main process grants one notice per round); it is spoken once.
export function announce(name: string, task: string, settings: Pick<Settings, 'announcePhrase' | 'language'>, summary = '') {
  const text = announcementText(name, task, settings, summary);
  queue = queue.then(async () => {
    const result = await window.projectGrid.speak(text).catch(() => null);
    let started = false;
    if (result?.ok) await play(result.value, () => { started = true; }).catch(() => { if (!started) return systemVoice(text, settings.language); });
    else await systemVoice(text, settings.language);
  });
  return text;
}

// Voices load asynchronously; call back once they are known so settings can name the fallback voice.
export function onVoicesReady(callback: () => void) {
  const speech = window.speechSynthesis;
  if (!speech) return () => {};
  speech.addEventListener('voiceschanged', callback);
  if (speech.getVoices().length) callback();
  return () => speech.removeEventListener('voiceschanged', callback);
}
