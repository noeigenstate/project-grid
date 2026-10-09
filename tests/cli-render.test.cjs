const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderCliRows } = require('../src/features/reading/cli-render.ts');

test("a slash command's dialog becomes tabs, headings, tables, meters, hints and text", () => {
  const blocks = renderCliRows([
    '   Settings  Status  Config  Usage  Stats', '',
    '   Session', '',
    '   Total cost:            $0.0000',
    '   Total duration (API):  0s', '',
    '   Current session',
    '   ███████████                                        22% used',
    '   Resets 7:40pm (Asia/Shanghai)', '',
    '   Skills                  % of usage',
    '   /update-config                  9%', '',
    '   d to day · w to week',
    '   Esc to cancel',
  ]);
  assert.deepEqual(blocks.map(block => block.kind), ['tabs', 'heading', 'pairs', 'heading', 'meter', 'text', 'pairs', 'hint', 'hint']);
  assert.deepEqual(blocks[0].items, ['Settings', 'Status', 'Config', 'Usage', 'Stats']);
  assert.deepEqual(blocks[2].pairs, [['Total cost', '$0.0000'], ['Total duration (API)', '0s']]);
  assert.deepEqual([blocks[4].percent, blocks[4].label], [22, 'used']);
  assert.deepEqual(blocks[6].pairs, [['Skills', '% of usage'], ['/update-config', '9%']]);
});

test('box frames go, their content stays, and links are not taken for labels', () => {
  const blocks = renderCliRows([
    '╭──────────────────────────╮',
    '│ Update available!        │',
    '│ See full release notes:  │',
    '│ https://example.com/notes │',
    '╰──────────────────────────╯',
  ]);
  assert.deepEqual(blocks, [{ kind: 'heading', text: 'Update available!' }, { kind: 'text', lines: ['See full release notes:', 'https://example.com/notes'] }]);
});

test("Codex's bar given as a value is drawn in its table row", () => {
  assert.deepEqual(renderCliRows(['  Context window:      100% left (0 used / 1M)', '  Weekly limit:        [███████████████████░] 96% left (resets 19:14 on 14 Oct)']), [{ kind: 'pairs', pairs: [
    ['Context window', '100% left (0 used / 1M)'], ['Weekly limit', '96% left (resets 19:14 on 14 Oct)', 96],
  ] }]);
});
