import * as store from '../store.js';
import { cyan, gray, blue, magenta, yellow } from '../color.js';

export function listCommand() {
  const all = store.getAllProfiles();

  if (all.length === 0) {
    console.log(yellow('No profiles available'));
    console.log(gray('Use "ccc new" to create one'));
    return;
  }

  const rows = all.map((p, i) => {
    const num = String(i + 1);
    let url;
    if (p.type === 'codex') {
      url = store.getCodexCredentials(p.name).baseUrl || gray('(not set)');
    } else {
      url = store.getClaudeCredentials(p.name).apiUrl || gray('(not set)');
    }
    return { num, name: p.name, url, rawType: p.type };
  });

  const w0 = Math.max(1, ...rows.map((r) => r.num.length));
  const w1 = 6;
  const w2 = Math.max(7, ...rows.map((r) => r.name.length));

  console.log();
  console.log(
    `  ${cyan('#'.padEnd(w0))}  ${cyan('Type'.padEnd(w1))}  ${cyan('Profile'.padEnd(w2))}  ${cyan('API URL')}`,
  );
  console.log(`  ${'─'.repeat(w0)}  ${'─'.repeat(w1)}  ${'─'.repeat(w2)}  ${'─'.repeat(30)}`);

  for (const r of rows) {
    const num = gray(r.num.padEnd(w0));
    const type = r.rawType === 'codex' ? blue('Codex'.padEnd(w1)) : magenta('Claude'.padEnd(w1 - 1) + ' ');
    console.log(`  ${num}  ${type}  ${r.name.padEnd(w2)}  ${r.url}`);
  }

  console.log(gray(`\n  ${all.length} profiles, launch: ccc <name> or ccc <number>\n`));
}
