import fs from 'node:fs';
import path from 'node:path';
import crossSpawn from 'cross-spawn';
import { parse as parseToml } from 'smol-toml';
import { CODEX_HOME_PATH, CONFIG_DIR, PROFILES_DIR } from '../config.js';
import { fileMode } from '../fs-safe.js';
import * as store from '../store.js';
import { generateCodexConfigToml } from '../store.js';
import { gray, green, red, yellow } from '../color.js';
import { panel } from '../ui.js';

function executableVersion(command) {
  const result = crossSpawn.sync(command, ['--version'], {
    encoding: 'utf8',
    timeout: 5000,
  });
  if (result.error) return { ok: false, detail: result.error.message };
  if (result.status !== 0) return { ok: false, detail: (result.stderr || '').trim() || `exit ${result.status}` };
  return { ok: true, detail: (result.stdout || result.stderr || '').trim() };
}

function modeText(mode) {
  return mode === null ? 'missing' : mode.toString(8).padStart(3, '0');
}

function statusLine(check) {
  const icon = check.status === 'ok' ? green('✓') : check.status === 'warn' ? yellow('!') : red('×');
  return `  ${icon} ${check.label}${check.detail ? `  ${gray(check.detail)}` : ''}`;
}

export async function doctorCommand(args) {
  const json = args.includes('--json');
  const checks = [];
  const major = Number(process.versions.node.split('.')[0]);
  checks.push({
    status: major >= 20 ? 'ok' : 'fail',
    label: 'Node.js',
    detail: process.version,
  });

  for (const command of ['claude', 'codex']) {
    const version = executableVersion(command);
    checks.push({
      status: version.ok ? 'ok' : 'fail',
      label: `${command} executable`,
      detail: version.detail,
    });
  }

  store.ensureDirs();
  const rootMode = fileMode(CONFIG_DIR);
  checks.push({
    status: process.platform === 'win32' || rootMode === 0o700 ? 'ok' : 'fail',
    label: 'Credential directory permissions',
    detail: `${CONFIG_DIR} (${modeText(rootMode)})`,
  });

  const profiles = store.getAllProfiles();
  for (const file of fs.readdirSync(PROFILES_DIR).filter((name) => name.endsWith('.json'))) {
    const fullPath = path.join(PROFILES_DIR, file);
    try {
      const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !raw.type) {
        checks.push({ status: 'warn', label: `${file} schema`, detail: 'legacy or unversioned profile' });
      }
    } catch (err) {
      checks.push({ status: 'fail', label: `${file} profile`, detail: `invalid JSON: ${err.message}` });
    }
  }
  for (const info of profiles) {
    const file = store.getProfilePath(info.name);
    if (fs.existsSync(file)) {
      const mode = fileMode(file);
      checks.push({
        status: process.platform === 'win32' || mode === 0o600 ? 'ok' : 'fail',
        label: `${info.name} profile permissions`,
        detail: modeText(mode),
      });
    }
    if (info.type === 'codex') {
      const profile = store.readCodexProfile(info.name);
      if (!profile) {
        checks.push({ status: 'fail', label: `${info.name} Codex profile`, detail: 'unreadable' });
        continue;
      }
      const parsed = parseToml(generateCodexConfigToml(
        profile.profile.apiUrl,
        profile.profile.model,
      ));
      checks.push({
        status: parsed.model_provider && (!profile.profile.model || parsed.model === profile.profile.model) ? 'ok' : 'fail',
        label: `${info.name} Codex config`,
        detail: `${parsed.model || '<default>'} · ${parsed.model_provider || '<missing provider>'}`,
      });
      if (profile.source === 'legacy') {
        checks.push({
          status: 'warn',
          label: `${info.name} storage`,
          detail: 'legacy CODEX_HOME profile; edit once to migrate',
        });
      }
    }
  }

  if (json) {
    console.log(JSON.stringify({
      ok: !checks.some((check) => check.status === 'fail'),
      codexHome: CODEX_HOME_PATH,
      profiles: profiles.length,
      checks,
    }, null, 2));
  } else {
    panel('CCC Doctor', [
      ['Profiles', profiles.length],
      ['Codex home', CODEX_HOME_PATH],
      ['Checks', checks.length],
    ]);
    for (const check of checks) console.log(statusLine(check));
    console.log();
  }

  if (checks.some((check) => check.status === 'fail')) process.exitCode = 1;
}
