// Environment variable management for child processes

import { CCC_OPENAI_API_KEY_ENV } from './store.js';

const MODEL_OVERRIDE_PATTERNS = [
  /^ANTHROPIC_DEFAULT_[A-Z0-9_]+_MODEL$/,
  /^ANTHROPIC_MODEL$/,
  /^ANTHROPIC_SMALL_FAST_MODEL(?:_[A-Z0-9_]+)?$/,
  /^CLAUDE_CODE_SUBAGENT_MODEL$/,
];

const CLAUDE_PROVIDER_FLAGS = [
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
];

export function isModelOverrideKey(key) {
  return MODEL_OVERRIDE_PATTERNS.some((p) => p.test(key));
}

// Build child process env for Claude launch.
// Injects profile env, strips model overrides not in profile.
export function buildClaudeEnv(profile) {
  const env = { ...process.env };

  // Remove conflicting inherited credentials/provider selection first.
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.ANTHROPIC_BASE_URL;
  for (const key of CLAUDE_PROVIDER_FLAGS) delete env[key];
  if (profile.apiKey) env.ANTHROPIC_AUTH_TOKEN = profile.apiKey;
  if (profile.apiUrl) env.ANTHROPIC_BASE_URL = profile.apiUrl;

  // Inject any extra env from profile.
  const profileEnvKeys = new Set();
  if (profile.env && typeof profile.env === 'object') {
    for (const [key, value] of Object.entries(profile.env)) {
      env[key] = value;
      profileEnvKeys.add(key);
    }
  }

  for (const key of Object.keys(env)) {
    if (isModelOverrideKey(key) && !profileEnvKeys.has(key)) env[key] = '';
  }

  return env;
}

// Build child process env for Codex launch without replacing the user's CODEX_HOME.
export function buildCodexEnv(apiKey) {
  const env = { ...process.env };
  // OPENAI_BASE_URL is deprecated; endpoint is in config.toml
  delete env.OPENAI_BASE_URL;
  if (apiKey) {
    env[CCC_OPENAI_API_KEY_ENV] = apiKey;
    // Leftover native configs may still name env_key = OPENAI_API_KEY.
    env.OPENAI_API_KEY = apiKey;
  } else {
    delete env[CCC_OPENAI_API_KEY_ENV];
    delete env.OPENAI_API_KEY;
  }
  return env;
}
