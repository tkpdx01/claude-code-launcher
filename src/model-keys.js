const MODEL_OVERRIDE_PATTERNS = [
  /^ANTHROPIC_DEFAULT_[A-Z0-9_]+_MODEL$/,
  /^ANTHROPIC_MODEL$/,
  /^ANTHROPIC_SMALL_FAST_MODEL(?:_[A-Z0-9_]+)?$/,
  /^CLAUDE_CODE_SUBAGENT_MODEL$/,
];

export function isModelOverrideKey(key) {
  return MODEL_OVERRIDE_PATTERNS.some((p) => p.test(key));
}
