import * as store from '../store.js';
import { discoverModels, promptModel } from '../models.js';
import { select } from '../prompt.js';
import { dim, gray } from '../color.js';
import { panel, redactUrl, success, typeBadge, warning } from '../ui.js';
import { validateModelId } from '../validation.js';
import {
  codexModelCatalogConflictMessage,
  inspectNativeCodexModelCatalog,
} from '../codex-catalog.js';

async function chooseProfile(token, message = 'Select profile:') {
  if (token) {
    const profile = store.resolveProfile(token);
    if (!profile) throw new Error(`Profile "${token}" does not exist`);
    return profile;
  }
  const all = store.getAllProfiles();
  if (all.length === 0) throw new Error('No profiles available');
  return select(message, all.map((profile) => ({
    name: `${typeBadge(profile.type)}  ${profile.name}`,
    value: profile,
  })));
}

function profileData(info) {
  return info.type === 'codex'
    ? store.readCodexProfileData(info.name)
    : store.readClaudeProfile(info.name);
}

export async function modelsCommand(args) {
  const refresh = args.includes('--refresh');
  const token = args.find((arg) => !arg.startsWith('-'));
  const info = await chooseProfile(token, 'Discover models for:');
  const profile = profileData(info);
  const result = await discoverModels({
    type: info.type,
    baseUrl: profile.apiUrl,
    apiKey: profile.apiKey,
    refresh,
  });

  panel('Model catalog', [
    ['Profile', `${typeBadge(info.type)}  ${info.name}`],
    ['Source', result.source],
    ['Models', result.models.length],
    ['Endpoint', redactUrl(profile.apiUrl)],
  ]);
  if (result.error) console.log(`  ${gray(`Remote discovery failed: ${result.error}`)}`);
  console.log();
  for (const model of result.models) {
    const capability = model.capability === 'agent' ? '' : ` ${dim(`[${model.capability}]`)}`;
    const selected = model.id === profile.model ? '  ✓' : '';
    console.log(`  ${model.id}${capability}${selected}`);
  }
  console.log();
}

export async function modelCommand(args) {
  const info = await chooseProfile(args[0], 'Select profile to change model:');
  const profile = profileData(info);
  const provided = args.length > 1;
  let model = args.slice(1).join(' ').trim();
  if (model === 'default' || model === '-') model = '';
  if (!provided) {
    model = await promptModel({
      type: info.type,
      baseUrl: profile.apiUrl,
      apiKey: profile.apiKey,
      currentModel: profile.model,
    });
  }
  model = validateModelId(model);

  if (info.type === 'codex') {
    store.saveCodexProfileData(info.name, { ...profile, model });
    const catalog = inspectNativeCodexModelCatalog(model);
    if (!catalog.compatible) {
      warning(codexModelCatalogConflictMessage(catalog, model, info.name));
    }
  } else {
    store.saveClaudeProfile(info.name, { ...profile, model, type: info.type });
  }
  success(`Model for "${info.name}" set to ${model || 'upstream default'}`);
}
