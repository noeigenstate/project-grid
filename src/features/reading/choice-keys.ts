import type { ScreenChoice } from '../agents/agent-screen-types';

export function selectedChoiceIndex(choice: ScreenChoice): number {
  return Math.max(0, choice.options.findIndex(option => option.selected));
}

// Use positions, not printed numbers: menus may start at a number other than one.
export function choiceKeys(selected: number, target: number): string[] {
  const distance = target - selected;
  return [...Array.from({ length: Math.abs(distance) }, () => distance > 0 ? '\x1b[B' : '\x1b[A'), '\r'];
}

// Cursor updates are the same prompt; a second menu (e.g. effort after model) is a new prompt. A question keeps its
// card for the whole page: ticks, a typed answer, notes and hints redraw it, and only another question or page (or
// the review) is new. Replacing the card mid-answer would drop the keys it had not sent yet.
export function choiceIdentity(choice: ScreenChoice): string {
  const question = choice.question;
  if (question) return JSON.stringify([choice.kind, choice.title, choice.options.map(option => [option.number, option.role, option.role === 'input' ? null : option.label]), question.agent, question.tabs.map(tab => tab.label), question.position, question.multi, !!question.review]);
  return JSON.stringify([choice.kind, choice.title, choice.context, choice.options.map(({ number, label, detail, hotkey }) => [number, label, detail, hotkey]), choice.hint]);
}

// Everything the CLI drew for a choice except its cursor: it changes when an answer took effect.
export function choiceContent(choice: ScreenChoice): string {
  return JSON.stringify([choice.title, choice.options.map(({ number, label, detail, checked }) => [number, label, detail, checked]), choice.hint, choice.question]);
}

export async function writeChoiceKeys(selected: number, target: number, write: (key: string) => void, active: () => boolean = () => true) {
  const keys = choiceKeys(selected, target);
  for (let index = 0; index < keys.length; index++) {
    if (!active()) return;
    write(keys[index]);
    if (index < keys.length - 1) await new Promise(resolve => setTimeout(resolve, 25));
  }
}
