const latinFallback = ['Cascadia Mono', 'Cascadia Code', 'Consolas', 'SF Mono', 'Menlo', 'DejaVu Sans Mono', 'Liberation Mono'];
const chineseFallback = ['Microsoft YaHei UI', 'PingFang SC'];

// A user supplies one installed family, not a CSS list. Keep the original
// fallback order when fields are empty or the chosen family is unavailable.
export function terminalFontFamily(latin = '', chinese = ''): string {
  if (!latin.trim() && !chinese.trim()) return "'Cascadia Mono', 'Cascadia Code', Consolas, 'SF Mono', Menlo, 'Microsoft YaHei UI', 'PingFang SC', monospace";
  const families = [...(latin.trim() ? [latin.trim()] : []), ...latinFallback, ...(chinese.trim() ? [chinese.trim()] : []), ...chineseFallback];
  return [...new Set(families)].map(name => "'" + name.replaceAll('\\', '\\\\').replaceAll("'", "\\'") + "'").join(', ') + ', monospace';
}
