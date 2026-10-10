// What Claude Code and Codex are told about the reading view: on their own they believe the conversation is plain
// terminal text and open pictures in the system's image viewer and pages in a browser, even after a mild hint. The
// reading view shows a local picture, HTML page or video whose path a reply names (src/features/reading/reply-files.ts),
// and opens it in a popup on a click, so naming the path is all it takes.
// Plain words only: the shell wrappers pass it as a TOML string to Codex.
const READING_NOTE = 'You run inside Agentrix. The user reads this conversation in its reading view, which renders Markdown '
  + 'and shows every local image, HTML page or video file your reply names by its full path, as a Markdown image ![description](C:/full/path/picture.png), '
  + 'a Markdown link or in backticks, right under your reply: the picture itself, a preview of the page, a playable video. '
  + 'To show the user one of these, write its full path in your reply; that is all it takes. '
  + 'Never open an image, a page or a video in another program or a browser to show it (no Start-Process, Invoke-Item, start, open, xdg-open, '
  + 'or a local web server for viewing), unless the user explicitly asks to open it there, and never say you cannot display images or pages.';

module.exports = { READING_NOTE };
