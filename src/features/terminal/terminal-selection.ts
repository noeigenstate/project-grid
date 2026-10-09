import type { Terminal } from '@xterm/xterm';

type Point = [number, number] | undefined;
type DomSelection = {
  _rowFactory?: unknown;
  _selectionRenderModel?: { clear(): void };
  handleSelectionChanged(start: Point, end: Point, column: boolean): void;
};
const patched = new WeakSet<object>();

// xterm 6.0's DOM renderer clears the visible selection but keeps its cached range. A later resize
// can paint that old range again. Clear the cache with the selection; preserve active selections.
// Like the WebGL adapter, this is guarded against changes to the pinned renderer's internals.
export function clearDomSelectionCache(renderer: DomSelection | undefined) {
  if (!renderer?._rowFactory || typeof renderer._selectionRenderModel?.clear !== 'function') return;
  const prototype = Object.getPrototypeOf(renderer) as DomSelection;
  const change = prototype?.handleSelectionChanged;
  if (!prototype || typeof change !== 'function' || patched.has(prototype)) return;
  patched.add(prototype);
  prototype.handleSelectionChanged = function (start, end, column) {
    if (!start || !end) this._selectionRenderModel?.clear();
    change.call(this, start, end, column);
  };
}

export function keepDomSelectionCleared(terminal: Terminal) {
  clearDomSelectionCache((terminal as unknown as { _core?: { _renderService?: { _renderer?: { value?: DomSelection } } } })._core?._renderService?._renderer?.value);
}
