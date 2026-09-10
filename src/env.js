// Environment variable management for child processes

import { applyAnyRouterEnv } from './anyrouter.js';
import { isModelOverrideKey } from './model-keys.js';

export { isModelOverrideKey };

// Shared by runtime settings, apply, and the child process environment.
export function getClaudeProfileEnv(profile) {
  const env = { ...profile.settings?.env };

  // Inject profile-level env vars
  if (profile.apiKey) env.ANTHROPIC_AUTH_TOKEN = profile.apiKey;
  if (profile.apiUrl) env.ANTHROPIC_BASE_URL = profile.apiUrl;

  // Disable telemetry (granular, avoids blocking GrowthBook feature flags)
  env.DISABLE_TELEMETRY = '1';
  env.DISABLE_ERROR_REPORTING = '1';
  env.DISABLE_AUTOUPDATER = '1';
  env.DISABLE_BUG_COMMAND = '1';

  if (profile.type === 'deepseek' && profile.model && env.ANTHROPIC_MODEL === undefined) {
    env.ANTHROPIC_MODEL = profile.model;
  }

  // Overlay after profile.env so custom headers are kept and the 1M beta can still be appended.
  return applyAnyRouterEnv(profile.apiUrl, { ...env, ...profile.env });
}

// Build child process env for Claude launch.
// Injects profile env, strips model overrides not in profile.
export function buildClaudeEnv(profile) {
  const profileEnv = getClaudeProfileEnv(profile);
  const env = { ...process.env, ...profileEnv };

  // Override model env vars with empty string (not delete!) so process env
  // takes priority over ~/.claude/settings.json user setting source.
  // Deleting would let Claude Code fall back to user settings which contain
  // model overrides specific to the main endpoint.
  for (const key of Object.keys(env)) {
    if (isModelOverrideKey(key) && !Object.prototype.hasOwnProperty.call(profileEnv, key)) {
      env[key] = '';
    }
  }

  return env;
}

// Build child process env for Codex launch.
export function buildCodexEnv(codexHome, apiKey) {
  const env = { ...process.env, CODEX_HOME: codexHome };
  // OPENAI_BASE_URL is deprecated; endpoint is in config.toml
  delete env.OPENAI_BASE_URL;
  if (apiKey) {
    env.OPENAI_API_KEY = apiKey;
  } else {
    delete env.OPENAI_API_KEY;
  }
  return env;
}
