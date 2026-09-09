import * as store from '../store.js';
import { t } from '../i18n.js';
import { gray, yellow, bold } from '../color.js';
import { section, typeTag, pad, clip, columns, width, hint } from '../ui.js';

export function listCommand() {
  const all = store.getAllProfiles();

  if (all.length === 0) {
    console.log(yellow(t('common.no_profiles')));
    console.log(gray(t('common.no_profiles_hint')));
    return;
  }

  const rows = all.map((p, i) => {
    const num = String(i + 1);
    let url;
    if (p.type === 'codex') {
      url = store.getCodexCredentials(p.name).baseUrl || gray(t('common.not_set'));
    } else {
      url = store.getClaudeCredentials(p.name).apiUrl || gray(t('common.not_set'));
    }
    return { num, name: p.name, url, rawType: p.type };
  });

  section(t('ui.profiles'), t('ui.count', { count: all.length }));
  const size = columns();
  const compact = process.stdout.isTTY && size < 60;
  const w0 = Math.max(2, ...rows.map((r) => r.num.length));
  const wName = Math.min(24, Math.max(12, ...rows.map((r) => width(r.name))));
  if (!compact) {
    console.log(`  ${gray(`${pad('#', w0)}  ${pad(t('ui.profile'), wName)}  ${pad(t('ui.type'), 10)}  ${t('ui.endpoint')}`)}`);
    console.log();
  }

  for (const r of rows) {
    const num = gray(r.num.padStart(w0, '0'));
    if (compact) {
      console.log(`  ${clip(`${num}  ${bold(r.name)}  ${typeTag(r.rawType)}`, size)}`);
      console.log(`      ${clip(gray(r.url), size - 4)}\n`);
    } else {
      // Keep full names and URLs when piping the list into another command.
      const name = process.stdout.isTTY ? pad(bold(r.name), wName) : bold(r.name.padEnd(wName));
      const line = `${num}  ${name}  ${pad(typeTag(r.rawType), 10)}  ${gray(r.url)}`;
      console.log(`  ${process.stdout.isTTY ? clip(line, size) : line}`);
    }
  }

  hint(t('list.footer', { count: all.length }));
}
