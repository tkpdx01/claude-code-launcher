// Defaults applied by ccc without overriding explicit Claude Code settings.

export function applyClaudeDefaults(settings) {
  if (settings.skipWebFetchPreflight === undefined) {
    settings.skipWebFetchPreflight = true;
  }
  return settings;
}
