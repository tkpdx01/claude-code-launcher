import fs from 'node:fs';
import path from 'node:path';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import * as store from '../store.js';
import { buildClaudeSettings } from '../claude.js';
import { BACKUPS_DIR, CLAUDE_SETTINGS_PATH, CODEX_HOME_PATH } from '../config.js';
import {
  atomicWriteFile,
  atomicWriteJson,
  backupFile,
  ensurePrivateDir,
  readJsonStrict,
} from '../fs-safe.js';
import { confirm, select } from '../prompt.js';
import { gray } from '../color.js';
import { panel, redactSecrets, success, typeBadge, warning } from '../ui.js';
import {
  describeCodexModelCatalog,
  inspectCodexModelCatalog,
} from '../codex-catalog.js';

const MANIFEST_PATH = path.join(BACKUPS_DIR, 'last-apply.json');

function parseOptions(args) {
  return {
    dryRun: args.includes('--dry-run'),
    rollback: args.includes('--rollback'),
    yes: args.includes('--yes'),
    profile: args.find((arg) => !arg.startsWith('-')) || '',
  };
}

async function chooseProfile(token) {
  const all = store.getAllProfiles();
  if (all.length === 0) throw new Error('No profiles available');
  if (token) {
    const profile = store.resolveProfile(token);
    if (!profile) throw new Error(`Profile "${token}" does not exist`);
    return profile;
  }
  return select('Select profile to apply:', all.map((profile) => ({
    name: `${typeBadge(profile.type)}  ${profile.name}`,
    value: profile,
  })));
}

function readJsonObject(file, label) {
  const value = readJsonStrict(file, { defaultValue: {} });
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must contain a JSON object`);
  }
  return value;
}

function buildClaudePlan(info) {
  const profile = store.readClaudeProfile(info.name);
  const current = readJsonObject(CLAUDE_SETTINGS_PATH, CLAUDE_SETTINGS_PATH);
  const next = buildClaudeSettings(profile, current);
  if (profile.model) next.model = profile.model;
  else delete next.model;
  return [{
    target: CLAUDE_SETTINGS_PATH,
    label: 'claude-settings.json',
    content: `${JSON.stringify(next, null, 2)}\n`,
    preview: `${JSON.stringify(redactSecrets(next), null, 2)}\n`,
  }];
}

function readTomlObject(file) {
  if (!fs.existsSync(file)) return {};
  try {
    return parseToml(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${file} is invalid TOML: ${err.message}`);
  }
}

function buildCodexPlan(info) {
  const profile = store.readCodexProfileData(info.name);
  const authPath = path.join(CODEX_HOME_PATH, 'auth.json');
  const configPath = path.join(CODEX_HOME_PATH, 'config.toml');
  const auth = readJsonObject(authPath, authPath);
  const config = readTomlObject(configPath);
  const providerId = store.CCC_OPENAI_COMPAT_PROVIDER;
  const catalog = inspectCodexModelCatalog(config, profile.model, { configPath });
  let catalogNotice = '';

  if (catalog.configured && !catalog.compatible) {
    delete config.model_catalog_json;
    catalogNotice = `Incompatible model_catalog_json will be removed (${describeCodexModelCatalog(catalog, profile.model)}) so Codex uses its bundled metadata.`;
  }

  if (config.analytics && typeof config.analytics === 'object') {
    delete config.analytics.model;
    delete config.analytics.model_provider;
  }
  config.model_provider = providerId;
  if (profile.model) config.model = profile.model;
  else delete config.model;
  config.model_providers = {
    ...(config.model_providers || {}),
    [providerId]: {
      name: 'CCC OpenAI Compatible',
      base_url: profile.apiUrl,
      env_key: 'OPENAI_API_KEY',
      wire_api: profile.wireApi || 'responses',
    },
  };

  const nextAuth = {
    ...auth,
    auth_mode: 'apikey',
    OPENAI_API_KEY: profile.apiKey,
  };
  return [
    {
      target: authPath,
      label: 'codex-auth.json',
      content: `${JSON.stringify(nextAuth, null, 2)}\n`,
      preview: `${JSON.stringify(redactSecrets(nextAuth), null, 2)}\n`,
    },
    {
      target: configPath,
      label: 'codex-config.toml',
      content: `${stringifyToml(config).trimEnd()}\n`,
      preview: `${stringifyToml(redactSecrets(config)).trimEnd()}\n`,
      notice: catalogNotice,
    },
  ];
}

function showPlan(info, plan, dryRun) {
  panel(dryRun ? 'Apply preview' : 'Apply', [
    ['Profile', `${typeBadge(info.type)}  ${info.name}`],
    ['Files', plan.length],
    ['Mode', dryRun ? 'dry run · no files changed' : 'backup + atomic write'],
  ]);
  for (const file of plan) {
    if (file.notice) warning(file.notice);
    console.log(`\n  ${file.target}`);
    console.log(gray(file.preview.split('\n').map((line) => `    ${line}`).join('\n')));
  }
}

function restoreFiles(files) {
  for (const item of [...files].reverse()) {
    if (item.existed) {
      if (!item.backup || !fs.existsSync(item.backup)) {
        throw new Error(`Missing backup for ${item.target}`);
      }
      atomicWriteFile(item.target, fs.readFileSync(item.backup));
    } else {
      try {
        fs.rmSync(item.target, { force: true });
      } catch (err) {
        if (!['ENOENT', 'ENOTDIR'].includes(err.code)) throw err;
      }
    }
  }
}

export function executePlan(info, plan) {
  ensurePrivateDir(BACKUPS_DIR);
  const files = plan.map((item) => ({
    target: item.target,
    backup: backupFile(item.target, BACKUPS_DIR, item.label),
    existed: fs.existsSync(item.target),
  }));
  try {
    for (const item of plan) atomicWriteFile(item.target, item.content);
    atomicWriteJson(MANIFEST_PATH, {
      createdAt: new Date().toISOString(),
      profile: info.name,
      type: info.type,
      files,
    });
  } catch (err) {
    try {
      restoreFiles(files);
    } catch (restoreError) {
      throw new Error(`Apply failed: ${err.message}; automatic restore failed: ${restoreError.message}`);
    }
    throw err;
  }
}

async function rollback(options) {
  const manifest = readJsonStrict(MANIFEST_PATH, { allowMissing: false, label: 'Apply backup manifest' });
  panel('Rollback', [
    ['Profile', manifest.profile],
    ['Created', manifest.createdAt],
    ['Files', manifest.files.length],
  ], 'danger');
  if (!options.yes && !await confirm('Restore this backup?', false)) return;
  restoreFiles(manifest.files);
  success('Native configuration restored from the latest CCC backup');
}

export async function applyCommand(args) {
  const options = parseOptions(args);
  if (options.rollback) {
    await rollback(options);
    return;
  }

  const info = await chooseProfile(options.profile);
  const plan = info.type === 'codex' ? buildCodexPlan(info) : buildClaudePlan(info);
  showPlan(info, plan, options.dryRun);
  if (options.dryRun) return;
  warning('Native configuration will change. A private backup will be created first.');
  if (!options.yes && !await confirm('Continue?', false)) return;
  executePlan(info, plan);
  success(`Applied "${info.name}" safely`);
}
