const { test } = require('node:test');
const assert = require('node:assert/strict');
const { clearDomSelectionCache } = require('../src/features/terminal/terminal-selection.ts');

test('DOM selection cache clears before redraw and preserves actual selections across resize', () => {
  class Renderer {
    _rowFactory = {};
    _selectionRenderModel = { start: undefined, end: undefined, clear() { this.start = this.end = undefined; } };
    draws = [];
    handleSelectionChanged(start, end, column) {
      this.draws.push({ start, end, column });
      if (start && end) Object.assign(this._selectionRenderModel, { start, end });
    }
    resize() { const { start, end } = this._selectionRenderModel; this.handleSelectionChanged(start, end, false); }
  }
  const renderer = new Renderer();
  clearDomSelectionCache(renderer); clearDomSelectionCache(renderer);
  const start = [2, 1], end = [9, 3];
  renderer.handleSelectionChanged(start, end, true); renderer.resize();
  assert.deepEqual(renderer.draws.at(-1), { start, end, column: false });
  renderer.handleSelectionChanged(undefined, undefined, false); renderer.resize();
  assert.deepEqual(renderer.draws.at(-1), { start: undefined, end: undefined, column: false });
  const next = new Renderer(); next.handleSelectionChanged(start, end, false); next.handleSelectionChanged(undefined, undefined, false); next.resize();
  assert.equal(next.draws.at(-1).start, undefined);
});

test('DOM cache adapter safely ignores unsupported or GPU renderers', () => {
  const gpu = { handleSelectionChanged() {} }, before = gpu.handleSelectionChanged;
  clearDomSelectionCache(undefined); clearDomSelectionCache(gpu); clearDomSelectionCache({ _rowFactory: {}, _selectionRenderModel: {} });
  assert.equal(gpu.handleSelectionChanged, before);
});
