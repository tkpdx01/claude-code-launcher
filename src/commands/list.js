import * as store from '../store.js';
import { t } from '../i18n.js';
import { gray, yellow, bold } from '../color.js';
import { section, typeTag, pad, clip, columns, width, hint } from '../ui.js';

export function listCommand() {
  const rows = store.getProfileSummaries();

  if (rows.length === 0) {
    console.log(yellow(t('common.no_profiles')));
    console.log(gray(t('common.no_profiles_hint')));
    return;
  }

  const isTTY = Boolean(process.stdout.isTTY);
  section(t('ui.profiles'), t('ui.count', { count: rows.length }));
  const size = columns();
  const compact = isTTY && size < 60;
  const w0 = Math.max(2, String(rows.length).length);
  const wName = Math.min(24, Math.max(12, ...rows.map((r) => width(r.name))));
  if (!compact) {
    console.log(`  ${gray(`${pad('#', w0)}  ${pad(t('ui.profile'), wName)}  ${pad(t('ui.type'), 10)}  ${t('ui.endpoint')}`)}`);
    console.log();
  }

  const notSet = gray(t('common.not_set'));
  rows.forEach((r, i) => {
    const num = gray(String(i + 1).padStart(w0, '0'));
    const url = r.url || notSet;
    if (compact) {
      console.log(`  ${clip(`${num}  ${bold(r.name)}  ${typeTag(r.type)}`, size)}`);
      console.log(`      ${clip(gray(url), size - 4)}\n`);
    } else {
      // Keep full names and URLs when piping the list into another command.
      const name = isTTY ? pad(bold(r.name), wName) : bold(r.name.padEnd(wName));
      const line = `${num}  ${name}  ${pad(typeTag(r.type), 10)}  ${gray(url)}`;
      console.log(`  ${isTTY ? clip(line, size) : line}`);
    }
  });

  hint(t('list.footer', { count: rows.length }));
}
