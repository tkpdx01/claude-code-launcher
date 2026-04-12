import * as store from '../store.js';
import { cyan, green, gray, blue, magenta, yellow } from '../color.js';

export function listCommand(args, flags) {
  const all = store.getAllProfiles();
  const def = store.getDefault();

  if (all.length === 0) {
    console.log(yellow('No profiles available'));
    console.log(gray('Use "ccc new" to create one'));
    return;
  }

  // Compute column widths
  const rows = all.map((p, i) => {
    const num = String(i + 1);
    const type = p.type === 'codex' ? 'Codex' : 'Claude';
    const name = p.name;
    let url;
    if (p.type === 'codex') {
      url = store.getCodexCredentials(p.name).baseUrl || gray('(not set)');
    } else {
      url = store.getClaudeCredentials(p.name).apiUrl || gray('(not set)');
    }
    return { num, type, name, url, isDefault: p.name === def, rawType: p.type };
  });

  const w0 = Math.max(1, ...rows.map((r) => r.num.length));
  const w1 = 6; // "Claude" is the longest
  const w2 = Math.max(7, ...rows.map((r) => r.name.length + (r.isDefault ? 2 : 0)));

  console.log();
  // Header
  console.log(
    `  ${cyan('#'.padEnd(w0))}  ${cyan('Type'.padEnd(w1))}  ${cyan('Profile'.padEnd(w2))}  ${cyan('API URL')}`,
  );
  console.log(`  ${'─'.repeat(w0)}  ${'─'.repeat(w1)}  ${'─'.repeat(w2)}  ${'─'.repeat(30)}`);

  for (const r of rows) {
    const num = r.isDefault ? green(r.num.padEnd(w0)) : gray(r.num.padEnd(w0));
    const type = r.rawType === 'codex' ? blue('Codex'.padEnd(w1)) : magenta('Claude'.padEnd(w1 - 1) + ' ');
    const name = r.isDefault
      ? green(`${r.name} *`.padEnd(w2))
      : r.name.padEnd(w2);
    console.log(`  ${num}  ${type}  ${name}  ${r.url}`);
  }

  console.log(gray(`\n  ${all.length} profiles, * = default, launch by number or name\n`));
}
