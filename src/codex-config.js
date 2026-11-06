import { setTomlValue, tomlValue, tomlText, replaceTomlTable, scanToml } from './toml.js';

// Repair only the simple model keys misplaced by older ccc releases.
// Keep unrelated TOML tables, comments, and explicit root values intact.
export function fixCodexAnalyticsScope(toml) {
  const eol = toml.includes('\r\n') ? '\r\n' : '\n';
  const firstTable = toml.search(/^[ \t]*\[/m);
  if (firstTable < 0) return toml;
  const root = toml.slice(0, firstTable);
  // Generated profiles put [analytics] first. Do not interpret a header that
  // could be inside a multiline string in a hand-written configuration.
  if (!/^[ \t]*\[analytics\][ \t]*(?:#[^\r\n]*)?\r?\n/.test(toml.slice(firstTable))) return toml;
  if (root.includes('"""') || root.includes("'''")) return toml;
  const moved = [];
  const updated = toml.replace(
    /^([ \t]*\[analytics\][ \t]*(?:#[^\r\n]*)?\r?\n)([\s\S]*?)(?=^[ \t]*\[|(?![\s\S]))/m,
    (section, header, body) => {
      // Leave complex hand-written values alone rather than guessing their scope.
      if (body.includes('"""') || body.includes("'''")) return section;
      const lines = body.split(eol).filter((line) => {
        const match = line.match(/^[ \t]*(model|model_provider)[ \t]*=[ \t]*(?:"(?:[^"\\]|\\.)*"|'[^']*')[ \t]*(?:#.*)?$/);
        if (!match) return true;
        if (!new RegExp(`^[ \\t]*${match[1]}[ \\t]*=`, 'm').test(root)) moved.push(line.trimStart());
        return false;
      });
      return header + lines.join(eol);
    },
  );
  if (updated === toml) return toml;
  return moved.length ? moved.join(eol) + eol + updated : updated;
}

// JSON basic strings share TOML escapes, except TOML disallows unescaped DEL.
export function tomlString(value) {
  return JSON.stringify(String(value)).replace(/\x7f/g, '\\u007f');
}

// Read the single-line basic/literal strings used in ccc profile fields.
export function readTomlString(toml, key) {
  const match = toml.match(new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*("(?:[^"\\\\]|\\\\.)*"|'[^']*')[ \\t]*(?:#[^\\r\\n]*)?\\r?$`, 'm'));
  if (!match) return '';
  if (match[1].startsWith("'")) return match[1].slice(1, -1);
  try {
    return JSON.parse(match[1]);
  } catch {
    return '';
  }
}

// Codex v0.120+ forbids overriding reserved provider names (openai, ollama, lmstudio).
// Rewrite old profiles that used [model_providers.openai]; returns the input
// unchanged when there is nothing to rename.
export function fixReservedProviderName(toml) {
  if (!toml.includes('openai')) return toml;
  const doc = scanToml(toml);
  const isProvider = (section, name) => section.path[0] === 'model_providers' && section.path[1] === name;
  const old = doc.sections.filter((s) => isProvider(s, 'openai'));
  if (!old.length) return toml;
  if (doc.sections.some((s) => isProvider(s, 'ccc_openai'))) {
    throw new Error('Both openai and ccc_openai provider tables exist; rename the legacy provider manually');
  }
  for (const section of old) {
    const parts = ['model_providers', 'ccc_openai', ...section.path.slice(2)];
    doc.lines[section.start] = '[' + parts.map((p) => /^[A-Za-z0-9_-]+$/.test(p) ? p : JSON.stringify(p)).join('.') + ']';
  }
  let next = doc.lines.join(doc.eol);
  const provider = tomlText(next, ['model_provider']);
  if (!provider || provider === 'openai') next = setTomlValue(next, ['model_provider'], '"ccc_openai"');
  const table = ['model_providers', 'ccc_openai'];
  if (/^true\s*(?:#.*)?$/.test(tomlValue(next, [...table, 'requires_openai_auth']) || '')) {
    next = setTomlValue(next, [...table, 'requires_openai_auth'], null);
  }
  for (const [key, value] of [['env_key', '"OPENAI_API_KEY"'], ['wire_api', '"responses"']]) {
    if (tomlValue(next, [...table, key]) === undefined) next = setTomlValue(next, [...table, key], value);
  }
  return next;
}

// Applying credentials must not replace MCP, project trust, or user preferences.
export function mergeCodexConfig(current, profile) {
  let next = fixReservedProviderName(current);
  const source = fixReservedProviderName(fixCodexAnalyticsScope(profile));
  scanToml(next);
  const provider = tomlText(source, ['model_provider']);
  for (const key of ['model', 'model_provider', 'model_catalog_json']) {
    next = setTomlValue(next, [key], tomlValue(source, [key]) ?? null);
  }
  const effort = tomlValue(source, ['model_reasoning_effort']);
  if (effort !== undefined) next = setTomlValue(next, ['model_reasoning_effort'], effort);
  if (provider && !['openai', 'ollama', 'lmstudio'].includes(provider)) {
    next = replaceTomlTable(next, ['model_providers', provider], source);
  }
  return next;
}
