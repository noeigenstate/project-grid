// What the usage guide's last page lists for this release. Update it with every version: the guide opens on
// first use and after each update, on this page for people who are updating.
export const WHATS_NEW: string[] = [
  '发出的消息一定送达：回车没被接收会自动补按，助手空闲后仍没收到会自动重发，实在不行才标出“未送达”并可重新发送。',
  'Codex 直连（实验）：在设置 › 编码助手中打开后，项目可以不经过终端，在阅读视图里直接与 Codex 对话，确认和提问在卡片里作答。',
  '粘贴的图片显示在你的消息里；只有你的消息带底板，模型的回答和工具调用不再有。',
  '斜杠命令更可靠：Claude 的 /usage 不再停在状态页，也不会误改 /config 里的设置；Codex 的 /status 正常显示，用量画成进度条；命令卡片只保留展开和收起。',
];
