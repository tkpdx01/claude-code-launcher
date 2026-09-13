// Claude Code environment variables that pin a model; one regex keeps the
// per-key check cheap when scanning the full process environment.
const MODEL_OVERRIDE_KEY = /^(?:ANTHROPIC_DEFAULT_[A-Z0-9_]+_MODEL|ANTHROPIC_MODEL|ANTHROPIC_SMALL_FAST_MODEL(?:_[A-Z0-9_]+)?|CLAUDE_CODE_SUBAGENT_MODEL)$/;

export function isModelOverrideKey(key) {
  return MODEL_OVERRIDE_KEY.test(key);
}
