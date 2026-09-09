// Codex launch logic — invocation-scoped provider config, shared user state.

import { stringify as stringifyToml } from 'smol-toml';
import { getCodexModelOverride, hasCodexModelOverride } from './args.js';
import {
  buildLaunchCodexProvider,
  restoreLeakedNativeCodexProvider,
  snapshotNativeCodexProvider,
} from './codex-native.js';
import { buildCodexEnv } from './env.js';
import * as store from './store.js';
import { t } from './i18n.js';
import { commandPreview, danger, panel, redactUrl, typeBadge } from './ui.js';
import { manageChildLifecycle, spawnCli } from './spawn.js';
import {
  codexModelCatalogConflictMessage,
  inspectNativeCodexModelCatalog,
} from './codex-catalog.js';

function tomlLiteral(value) {
  const line = stringifyToml({ value }).trim();
  return line.slice(line.indexOf('=') + 1).trim();
}

function normalizeOptions(options) {
  if (typeof options === 'boolean') return { dangerous: options, args: [] };
  return { dangerous: false, args: [], ...(options || {}) };
}

export function buildCodexArgs(profile, options = {}) {
  const normalized = normalizeOptions(options);
  const providerId = store.CCC_OPENAI_COMPAT_PROVIDER;
  const provider = buildLaunchCodexProvider(profile);
  const passthrough = [...normalized.args];
  const args = [
    '-c', `model_provider=${tomlLiteral(providerId)}`,
    '-c', `model_providers.${providerId}.name=${tomlLiteral(provider.name)}`,
    '-c', `model_providers.${providerId}.base_url=${tomlLiteral(provider.base_url)}`,
    '-c', `model_providers.${providerId}.env_key=${tomlLiteral(provider.env_key)}`,
    '-c', `model_providers.${providerId}.wire_api=${tomlLiteral(provider.wire_api)}`,
    '-c', `model_providers.${providerId}.requires_openai_auth=${tomlLiteral(provider.requires_openai_auth)}`,
  ];
  if (profile.model && !hasCodexModelOverride(passthrough)) {
    args.push('-m', profile.model);
  }
  if (normalized.dangerous) args.push('--dangerously-bypass-approvals-and-sandbox');
  args.push(...passthrough);
  return args;
}

export function launchCodex(profileName, options = {}) {
  const normalized = normalizeOptions(options);
  const profile = store.readCodexProfileData(profileName);
  if (!profile) throw new Error(t('common.not_exist', { name: profileName }));
  if (!profile.apiKey) throw new Error(t('common.apikey_required'));

  const cliModel = getCodexModelOverride(normalized.args);
  const effectiveModel = cliModel === null ? profile.model : cliModel;
  const catalog = inspectNativeCodexModelCatalog(effectiveModel);
  if (!catalog.compatible) {
    throw new Error(codexModelCatalogConflictMessage(catalog, effectiveModel, profileName));
  }

  const args = buildCodexArgs(profile, normalized);
  const env = buildCodexEnv(profile.apiKey);
  const nativeProvider = snapshotNativeCodexProvider();

  if (process.stdout.isTTY) {
    panel('Launch', [
      ['Profile', `${typeBadge('codex')}  ${profileName}`],
      ['Model', profile.model || 'upstream default'],
      ['Endpoint', redactUrl(profile.apiUrl)],
      ['Access', normalized.dangerous ? 'FULL ACCESS' : 'standard'],
    ], normalized.dangerous ? 'danger' : 'cyan');
    if (normalized.dangerous) danger('Approvals and sandboxing are disabled for this session.');
    commandPreview('codex', args);
  }

  const child = spawnCli('codex', args, { stdio: 'inherit', env });
  manageChildLifecycle(child, {
    cleanup: () => {
      try {
        restoreLeakedNativeCodexProvider(nativeProvider);
      } catch (err) {
        console.error(`Failed to restore native Codex provider: ${err.message}`);
      }
    },
    onError: (err) => console.error(t('launch.failed', { msg: err.message })),
  });
}
