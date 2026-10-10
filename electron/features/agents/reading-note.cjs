// What Claude Code and Codex are told about the reading view: on their own they believe the conversation is plain
// terminal text and send the user to an image viewer. The reading view shows a local picture whose path a reply names
// (see src/features/reading/reply-images.ts). Plain words only: the shell wrappers pass it as a TOML string to Codex.
const READING_NOTE = 'You run inside Agentrix, which also shows this conversation in a reading view that renders Markdown. '
  + 'There a local image file named in your reply by its full path, as a Markdown image ![description](C:/full/path/picture.png) or in backticks, '
  + 'is displayed to the user as the picture itself. To show the user an image, write its full path that way '
  + 'instead of opening an image viewer or saying that you cannot display images.';

module.exports = { READING_NOTE };
