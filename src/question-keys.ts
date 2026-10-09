import type { ScreenChoice } from './agent-screen-types';

// What answering a question means in keys, as the CLIs take them (checked live against Claude Code 2.1.294 and
// Codex 0.161): the arrows move the CLI's cursor, Enter picks, Space ticks in a multi-select question, Left and Right
// switch between questions, and Escape cancels.
const UP = '\x1b[A', DOWN = '\x1b[B', LEFT = '\x1b[D', RIGHT = '\x1b[C', ENTER = '\r', TAB = '\t', ESCAPE = '\x1b', ERASE = '\x7f';

export type QuestionAction =
  | { type: 'choose'; option: number }   // pick this option (and answer the question)
  | { type: 'toggle'; option: number }   // tick or untick it (multi-select)
  | { type: 'submit' }                   // Claude: the Submit row under multi-select options
  | { type: 'answer'; option: number; text: string } // an own answer (Claude), or notes with this option (Codex)
  | { type: 'switch'; direction: -1 | 1 } // previous or next question
  | { type: 'cancel' };

// Where the CLI's cursor can stand, in order. Claude's Submit row comes after the options above the rule.
type QuestionStop = { option: number } | { submit: true };
export function questionStops(choice: ScreenChoice): QuestionStop[] {
  const stops: QuestionStop[] = [];
  const submit = !!choice.question?.submit;
  choice.options.forEach((option, index) => {
    if (submit && option.role === 'chat' && !stops.some(stop => 'submit' in stop)) stops.push({ submit: true });
    stops.push({ option: index });
  });
  if (submit && !stops.some(stop => 'submit' in stop)) stops.push({ submit: true });
  return stops;
}

const isStop = (stop: QuestionStop, target: QuestionStop) => 'submit' in target ? 'submit' in stop : 'option' in stop && stop.option === target.option;
export function questionCursor(choice: ScreenChoice): QuestionStop {
  const stops = questionStops(choice);
  return stops.find(stop => 'submit' in stop ? choice.question?.submit?.selected : choice.options[stop.option].selected) ?? stops[0];
}

// An own answer replaces what the field already holds (Claude shows it as the option's label until then).
const typed = (label: string) => /^Type something\.?$/i.test(label) ? 0 : [...label].length;

export function questionKeys(choice: ScreenChoice, action: QuestionAction): string[] {
  const question = choice.question;
  if (!question) return [];
  const stops = questionStops(choice);
  const cursor = questionCursor(choice);
  const from = Math.max(0, stops.findIndex(stop => isStop(stop, cursor)));
  const go = (target: QuestionStop) => {
    const to = stops.findIndex(stop => isStop(stop, target));
    if (to < 0) return [];
    return Array.from({ length: Math.abs(to - from) }, () => to > from ? DOWN : UP);
  };
  switch (action.type) {
    // Codex pages with Ctrl+P / Ctrl+N wherever focus is (Left/Right move the caret inside notes); Escape in open notes
    // only clears them, so cancelling takes a second one.
    case 'switch': return question.agent === 'codex' ? [action.direction < 0 ? '\x10' : '\x0e'] : [action.direction < 0 ? LEFT : RIGHT];
    case 'cancel': return question.notes?.open ? [ESCAPE, ESCAPE] : [ESCAPE];
    case 'submit': return question.submit ? [...go({ submit: true }), ENTER] : [];
    case 'toggle': return question.multi ? [...go({ option: action.option }), ' '] : [];
    case 'choose': return [...go({ option: action.option }), ENTER];
    case 'answer': {
      const text = action.text.replace(/[\r\n]+/g, ' ').trim();
      if (!text) return [];
      if (question.agent === 'claude') {
        // Typing into the own-answer row ticks it in a multi-select question; Enter answers a single-choice one.
        const erase = ERASE.repeat(typed(choice.options[action.option]?.label ?? ''));
        return [...go({ option: action.option }), ...(erase ? [erase] : []), text, ...(question.multi ? [] : [ENTER])];
      }
      // Codex: Tab opens notes on the highlighted option, and Enter submits the option with them.
      const erase = ERASE.repeat([...question.notes?.text ?? ''].length);
      return [...go({ option: action.option }), ...(question.notes?.open ? [] : [TAB]), ...(erase ? [erase] : []), text, ENTER];
    }
  }
}
