import fs from 'node:fs';
import path from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { CODEX_HOME_PATH } from './config.js';

export function getNativeCodexConfigPath() {
  return path.join(CODEX_HOME_PATH, 'config.toml');
}

function bundledResult(configPath) {
  return {
    compatible: true,
    configured: false,
    reason: 'bundled',
    configPath,
    catalogPath: '',
    error: '',
  };
}

function conflictResult(reason, configPath, catalogPath = '', error = '') {
  return {
    compatible: false,
    configured: true,
    reason,
    configPath,
    catalogPath,
    error,
  };
}

export function inspectCodexModelCatalog(config, model = '', options = {}) {
  const configPath = options.configPath || getNativeCodexConfigPath();
  if (!Object.hasOwn(config || {}, 'model_catalog_json')) return bundledResult(configPath);

  const configuredPath = config.model_catalog_json;
  if (typeof configuredPath !== 'string' || !configuredPath.trim()) {
    return conflictResult('invalid-path', configPath);
  }

  const catalogPath = path.isAbsolute(configuredPath)
    ? path.normalize(configuredPath)
    : path.resolve(path.dirname(configPath), configuredPath);
  let raw;
  try {
    raw = fs.readFileSync(catalogPath, 'utf8');
  } catch (err) {
    return conflictResult(
      err?.code === 'ENOENT' ? 'missing-file' : 'unreadable-file',
      configPath,
      catalogPath,
      err?.message || String(err),
    );
  }

  let catalog;
  try {
    catalog = JSON.parse(raw);
  } catch (err) {
    return conflictResult('invalid-json', configPath, catalogPath, err?.message || String(err));
  }
  if (!catalog || !Array.isArray(catalog.models) || catalog.models.length === 0) {
    return conflictResult('invalid-catalog', configPath, catalogPath);
  }

  const slugs = catalog.models
    .map((item) => item && typeof item === 'object' ? item.slug : '');
  if (slugs.some((id) => typeof id !== 'string' || !id)) {
    return conflictResult('invalid-catalog', configPath, catalogPath);
  }
  const modelIds = new Set(slugs);
  if (model && !modelIds.has(model)) {
    return conflictResult('missing-model', configPath, catalogPath);
  }
  return {
    compatible: true,
    configured: true,
    reason: 'compatible',
    configPath,
    catalogPath,
    error: '',
  };
}

export function inspectNativeCodexModelCatalog(model = '', options = {}) {
  const configPath = options.configPath || getNativeCodexConfigPath();
  if (!fs.existsSync(configPath)) return bundledResult(configPath);
  let config;
  try {
    config = parseToml(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    return conflictResult('invalid-config', configPath, '', err?.message || String(err));
  }
  return inspectCodexModelCatalog(config, model, { configPath });
}

export function describeCodexModelCatalog(check, model = '') {
  const target = model ? `model "${model}"` : 'the selected model';
  if (check.reason === 'bundled') return 'bundled catalog';
  if (check.reason === 'compatible') {
    return model
      ? `custom catalog contains ${target} (${check.catalogPath})`
      : `custom catalog (${check.catalogPath})`;
  }
  if (check.reason === 'missing-model') return `custom catalog is missing ${target} (${check.catalogPath})`;
  if (check.reason === 'missing-file') return `custom catalog file is missing (${check.catalogPath})`;
  if (check.reason === 'unreadable-file') return `custom catalog is unreadable (${check.catalogPath})`;
  if (check.reason === 'invalid-json') return `custom catalog is invalid JSON (${check.catalogPath})`;
  if (check.reason === 'invalid-catalog') return `custom catalog has no valid model slugs (${check.catalogPath})`;
  if (check.reason === 'invalid-path') return 'model_catalog_json is not a non-empty path';
  if (check.reason === 'invalid-config') return `native config is invalid TOML (${check.configPath})`;
  return 'custom catalog is incompatible';
}

export function codexModelCatalogConflictMessage(check, model = '', profileName = '') {
  const detail = describeCodexModelCatalog(check, model);
  if (check.reason === 'invalid-config') {
    return `Cannot validate the Codex model catalog: ${detail}. Fix config.toml before launching.`;
  }
  const target = model ? ` for "${model}"` : '';
  const repair = profileName
    ? ` Run "ccc apply ${profileName} --yes" to remove the incompatible model_catalog_json setting.`
    : '';
  return `Codex model catalog conflict${target}: ${detail}. The custom catalog overrides Codex's bundled metadata.${repair}`;
}
