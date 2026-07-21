import * as store from '../store.js';
import { t } from '../i18n.js';
import { cyan, dim, gray } from '../color.js';
import { padVisible, redactUrl, typeBadge } from '../ui.js';

export function listCommand() {
  const profiles = store.getAllProfiles();
  if (profiles.length === 0) {
    console.log(t('common.no_profiles'));
    return;
  }
  const rows = profiles.map((profile, index) => {
    const data = profile.type === 'codex'
      ? store.readCodexProfileData(profile.name)
      : store.readClaudeProfile(profile.name);
    return {
      index: String(index + 1),
      type: typeBadge(profile.type),
      name: profile.name,
      model: data?.model || 'default',
      endpoint: redactUrl(data?.apiUrl || 'not set'),
    };
  });
  const widths = {
    index: Math.max(1, ...rows.map((row) => row.index.length)),
    type: 10,
    name: Math.max(7, ...rows.map((row) => row.name.length)),
    model: Math.max(5, ...rows.map((row) => row.model.length)),
  };
  console.log();
  console.log(`  ${cyan(padVisible('#', widths.index))}  ${cyan(padVisible('TYPE', widths.type))}  ${cyan(padVisible('PROFILE', widths.name))}  ${cyan(padVisible('MODEL', widths.model))}  ${cyan('ENDPOINT')}`);
  console.log(`  ${dim('─'.repeat(widths.index))}  ${dim('─'.repeat(widths.type))}  ${dim('─'.repeat(widths.name))}  ${dim('─'.repeat(widths.model))}  ${dim('─'.repeat(28))}`);
  for (const row of rows) {
    console.log(`  ${gray(padVisible(row.index, widths.index))}  ${padVisible(row.type, widths.type)}  ${padVisible(row.name, widths.name)}  ${padVisible(row.model, widths.model)}  ${row.endpoint}`);
  }
  console.log(gray(`\n  ${profiles.length} profiles · ccc <profile> [arguments]\n`));
}
