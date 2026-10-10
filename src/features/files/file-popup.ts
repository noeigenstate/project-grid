import { useSyncExternalStore } from 'react';

// A file shown over whatever is on screen: a page, a document, a picture or a video an agent wrote or named. Opening
// one never moves to the project's page; only its header or a shortcut goes there.
// file and folder: a path inside the project, read as its preview and file list do. image: a picture anywhere on this
// computer.
export type PopupTarget = { kind: 'file' | 'folder'; projectId: string; path: string } | { kind: 'image'; path: string };

let current: PopupTarget | null = null;
const listeners = new Set<() => void>();
const publish = (target: PopupTarget | null) => { current = target; listeners.forEach(listener => listener()); };

export const showPopup = (target: PopupTarget) => publish(target);
export const closePopup = () => publish(null);
export const usePopup = () => useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => current);
