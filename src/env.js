// Environment variable management for child processes

const MODEL_OVERRIDE_PATTERNS = [
  /^ANTHROPIC_DEFAULT_[A-Z0-9_]+_MODEL$/,
  /^ANTHROPIC_MODEL$/,
  /^ANTHROPIC_SMALL_FAST_MODEL(?:_[A-Z0-9_]+)?$/,
  /^CLAUDE_CODE_SUBAGENT_MODEL$/,
];

export function isModelOverrideKey(key) {
  return MODEL_OVERRIDE_PATTERNS.some((p) => p.test(key));
}

// Build child process env for Claude launch.
// Injects profile env, strips model overrides not in profile.
export function buildClaudeEnv(profile) {
  const env = { ...process.env };

  // Inject profile-level env vars
  if (profile.apiKey) env.ANTHROPIC_AUTH_TOKEN = profile.apiKey;
  if (profile.apiUrl) env.ANTHROPIC_BASE_URL = profile.apiUrl;

  // Disable telemetry (granular, avoids blocking GrowthBook feature flags)
  env.DISABLE_TELEMETRY = '1';
  env.DISABLE_ERROR_REPORTING = '1';
  env.DISABLE_AUTOUPDATER = '1';
  env.DISABLE_BUG_COMMAND = '1';

  // Inject any extra env from profile
  const profileEnvKeys = new Set();
  if (profile.env && typeof profile.env === 'object') {
    for (const [key, value] of Object.entries(profile.env)) {
      env[key] = value;
      profileEnvKeys.add(key);
    }
  }

  // Strip model override env vars that aren't explicitly set in the profile
  for (const key of Object.keys(env)) {
    if (isModelOverrideKey(key) && !profileEnvKeys.has(key)) {
      delete env[key];
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
