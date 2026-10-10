// Shared polling helper for the desktop smoke tests.
// CI runners are much slower than a workstation (six PowerShell processes on two cores), so CI
// stretches every timeout with AGENTRIX_TEST_TIMEOUT_SCALE instead of each test guessing its own.
export const timeoutScale = Math.max(1, Number(process.env.AGENTRIX_TEST_TIMEOUT_SCALE) || 1);

export async function waitFor(check, label, timeout = 25000) {
  const until = Date.now() + timeout * timeoutScale;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out: ${label}`);
}

// Terminals refit 80 ms after their size settles (src/features/terminal/TerminalPane.tsx). Pointer tests that aim at
// terminal cells wait for that, or a late reflow can move the text under the pointer.
export async function terminalsSettled(page) {
  await waitFor(async () => !(await page.locator('[data-fit-pending]').count()), 'terminal size settles');
}
