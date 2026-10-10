// CI helper: run one desktop smoke script and retry it once on failure.
// Each script launches its own isolated AGENTRIX_DATA_DIR profile, so a second run starts clean.
// The first failure stays in the log and is summarised, so flakiness remains visible instead of hidden.
import { spawnSync } from 'node:child_process';

const [command, ...args] = process.argv.slice(2);
if (!command) { console.error('usage: node scripts/retry.mjs <command> [...args]'); process.exit(2); }
// npm is a .cmd shim on Windows and needs a shell; quote arguments such as "Agentrix.exe" paths.
const quote = value => /[\s"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
const attempts = Math.max(1, Number(process.env.AGENTRIX_TEST_ATTEMPTS) || 2);
for (let attempt = 1; attempt <= attempts; attempt++) {
  const result = spawnSync(quote(command), args.map(quote), { stdio: 'inherit', shell: true });
  if (result.status === 0) {
    if (attempt > 1) console.log(`::warning::${[command, ...args].join(' ')} passed on attempt ${attempt} after a failure above.`);
    process.exit(0);
  }
  if (attempt < attempts) console.log(`\n::warning::${[command, ...args].join(' ')} failed (exit ${result.status}); retrying once in a fresh profile.\n`);
  else process.exit(result.status ?? 1);
}
