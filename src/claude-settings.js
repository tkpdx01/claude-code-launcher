// Defaults applied by ccc without overriding explicit Claude Code settings.

export function applyClaudeDefaults(settings, options = {}) {
  const normalized = String(options.apiUrl || '').replace(/\/+$/, '');
  const isCustomEndpoint = normalized && normalized !== 'https://api.anthropic.com';
  if (isCustomEndpoint && settings.skipWebFetchPreflight === undefined) {
    settings.skipWebFetchPreflight = true;
  }
  return settings;
}
