import { useSyncExternalStore } from 'react';
import { MicrophoneCapture } from './voice-audio';
import type { VoiceState } from '../../shared/types';
import { t } from '../../shared/i18n';
import { shortcut } from '../shortcuts/shortcuts';
import { isMac, isLinux } from '../../shared/platform';

// One shared dictation controller: a single microphone, one recording at a time,
// and every terminal's microphone button reflecting the same device and model state.
// label names the terminal being dictated to; sending marks a recognition that will press Enter.
type VoiceSnapshot = { microphone: boolean | null; model: VoiceState | null; recording: string | null; busy: string | null; level: number; label: string | null; sending: boolean };
let snapshot: VoiceSnapshot = { microphone: null, model: null, recording: null, busy: null, level: 0, label: null, sending: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<VoiceSnapshot>) => { snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener()); };

const capture = new MicrophoneCapture();
let target: { id: string; sessionId: string; onError: (message: string) => void } | null = null;
let started = false;
// Microphone opens run one after another, so a cancelled open that finishes late never closes a newer recording.
let opening: Promise<unknown> = Promise.resolve();
// The terminal the user last clicked or typed in, for Ctrl+T when keyboard focus is elsewhere.
let lastTerminal: string | null = null;
// A reading view showing a terminal's conversation takes the words dictated to that terminal into its message
// box instead (submit: send them as the next message).
const composers = new Map<string, (text: string, submit: boolean) => void>();
export function dictateInto(id: string, insert: (text: string, submit: boolean) => void) {
  composers.set(id, insert);
  return () => { if (composers.get(id) === insert) composers.delete(id); };
}
// Codex and Claude Code treat an Enter that arrives right after pasted text as part of the paste
// (a newline), so the submitting Enter waits until the paste has landed.
const SUBMIT_DELAY = 400;

async function refreshMicrophone() {
  try { set({ microphone: (await navigator.mediaDevices.enumerateDevices()).some(device => device.kind === 'audioinput') }); }
  catch { set({ microphone: false }); }
}

function start() {
  if (started) return; started = true;
  navigator.mediaDevices?.addEventListener('devicechange', () => void refreshMicrophone());
  void refreshMicrophone();
  window.projectGrid.onVoiceState(model => set({ model }));
  void window.projectGrid.getVoiceState().then(result => { if (result.ok) set({ model: result.value }); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && snapshot.recording) void cancelDictation(); });
  document.addEventListener('focusin', event => {
    const id = (event.target as Element | null)?.closest?.<HTMLElement>('[data-terminal-id]')?.dataset.terminalId;
    if (id) lastTerminal = id;
  });
  // While recording, Enter and Escape belong to dictation and never reach the terminal.
  document.addEventListener('keydown', event => {
    if (!snapshot.recording || event.isComposing || (event.key !== 'Escape' && event.key !== 'Enter')) return;
    event.preventDefault(); event.stopPropagation();
    void (event.key === 'Escape' ? cancelDictation() : finish(true));
  }, true);
}

function subscribe(listener: () => void) { start(); listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useVoice() { return useSyncExternalStore(subscribe, () => snapshot); }

function microphoneMessage(error: unknown) {
  const name = (error as DOMException)?.name;
  if (name === 'NotAllowedError') return isMac ? t('麦克风访问被拒绝，请在“系统设置 › 隐私与安全性 › 麦克风”中允许 Project Grid。') : isLinux ? t('麦克风访问被拒绝，请在系统的隐私或声音设置中允许 Project Grid 使用麦克风。') : t('麦克风访问被拒绝，请在 Windows 设置中允许桌面应用使用麦克风。');
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return t('未检测到麦克风，请连接后重试。');
  if (name === 'NotReadableError') return t('麦克风无法使用，可能正被其他程序占用。');
  // Messages thrown in Chinese by the capture code (voice-audio.ts) are looked up here.
  return t(String((error as Error)?.message || error));
}

function modelMessage(model: VoiceState | null) {
  if (model?.phase === 'downloading') return t('语音模型正在下载（{percent}%），完成后即可使用。', { percent: model.percent });
  return t('语音模型开始下载，完成后即可使用。');
}

function focusTerminal(id: string) {
  document.querySelector<HTMLTextAreaElement>(`[data-terminal-id="${CSS.escape(id)}"] .xterm-helper-textarea`)?.focus();
}

async function cancelDictation() {
  target = null; await capture.close(); set({ recording: null, level: 0, label: null });
}

// submit: press Enter after inserting, so the text is sent as the next prompt.
async function finish(submit = false) {
  const current = target; if (!current) return;
  target = null; set({ recording: null, busy: current.id, sending: submit, level: 0 });
  try {
    const wav = await capture.stopRecording(); await capture.close();
    const text = await window.projectGrid.transcribe(wav);
    if (!text.ok) throw new Error(text.error);
    if (!text.value.trim()) throw new Error(t('没有识别出文字，请再说一遍。'));
    const composer = composers.get(current.id);
    if (composer) { composer(text.value.trim(), submit); return; }
    const pasted = await window.projectGrid.pasteTerminal(current.id, text.value, current.sessionId);
    if (!pasted.ok) throw new Error(pasted.error);
    if (submit) { await new Promise(resolve => setTimeout(resolve, SUBMIT_DELAY)); window.projectGrid.writeTerminal(current.id, '\r'); }
    focusTerminal(current.id);
  } catch (error) { current.onError(microphoneMessage(error)); }
  finally { await capture.close(); set({ busy: null, sending: false, label: null }); }
}

// Click once to start talking. Click again to insert the recognised text into this terminal's input
// for review, or press Enter (or Ctrl+T) to insert it and send it.
export async function toggleDictation(id: string, sessionId: string | null, onError: (message: string) => void, label = '') {
  if (snapshot.busy) return onError(t('正在识别上一段语音，请稍候。'));
  if (snapshot.recording) return snapshot.recording === id ? finish() : onError(t('另一个终端正在录音，请先结束那一段。'));
  if (!sessionId) return onError(t('请先启动终端，再使用语音输入。'));
  if (snapshot.microphone === false) { void refreshMicrophone(); return onError(t('未检测到麦克风，请连接后重试。')); }
  if (!snapshot.model?.ready) {
    if (snapshot.model?.phase !== 'downloading') void window.projectGrid.prepareVoice();
    return onError(modelMessage(snapshot.model));
  }
  // Recording counts from the keypress or click, so an Escape while the microphone is still opening cancels it.
  const pending = { id, sessionId, onError };
  target = pending; set({ recording: id, label: label || null });
  // The recognizer is released after a few idle minutes; load it again while the user is speaking.
  void window.projectGrid.warmVoice();
  const opened = opening.then(() => target === pending ? capture.open('', level => set({ level: Math.min(1, level * 5) })) : undefined);
  opening = opened.catch(() => {});
  try {
    await opened;
    // Cancelled or finished while opening: release the microphone unless a newer dictation already owns it.
    if (target !== pending) { if (!target) await capture.close(); return; }
    capture.onLimit = () => void finish();
    capture.startRecording();
    set({ microphone: true });
  } catch (error) {
    if (target === pending) { target = null; set({ recording: null, level: 0, label: null }); }
    if (!target) await capture.close();
    onError(microphoneMessage(error)); void refreshMicrophone();
  }
}

const shown = (element: HTMLElement | null | undefined) => element?.getClientRects().length ? element : null;

// Ctrl+T talks to the terminal with keyboard focus, else the expanded project's current terminal,
// else the terminal last used, else the only terminal on screen.
function terminalTarget() {
  const byId = (id: string | null) => id ? shown(document.querySelector<HTMLElement>(`[data-terminal-id="${CSS.escape(id)}"]`)) : null;
  const visible = [...document.querySelectorAll<HTMLElement>('[data-terminal-id]')].filter(element => shown(element));
  return shown(document.activeElement?.closest<HTMLElement>('[data-terminal-id]'))
    || shown(document.querySelector<HTMLElement>('.project-panel.is-focused .is-active-terminal'))
    || byId(lastTerminal)
    || (visible.length === 1 ? visible[0] : null);
}

// Ctrl+T starts talking to the current terminal; pressing it again works like Enter and sends the text.
export async function quickDictation(onError: (message: string) => void) {
  if (snapshot.recording) return finish(true);
  if (snapshot.busy) return onError(t('正在识别上一段语音，请稍候。'));
  const terminal = terminalTarget();
  if (!terminal?.dataset.terminalId) return onError(t('先点一下要输入的终端，再按 {key} 说话。', { key: shortcut('voice') }));
  return toggleDictation(terminal.dataset.terminalId, terminal.dataset.sessionId || null, onError, terminal.getAttribute('aria-label') || '');
}
