function registerVoiceIpc({ handle, voiceManager }) {
  handle('voice:state', () => voiceManager.getState());
  handle('voice:prepare', () => voiceManager.prepare());
  handle('voice:warm', () => voiceManager.warm());
  handle('voice:transcribe', audio => voiceManager.transcribe(audio));
}

module.exports = { registerVoiceIpc };
