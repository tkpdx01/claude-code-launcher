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
  if (!toml.includes('[model_providers.openai]')) return toml;

  let next = toml.replace(/\[model_providers\.openai\]/g, '[model_providers.ccc_openai]');

  // Ensure model_provider points to the renamed section
  if (/^\s*model_provider\s*=\s*"openai"/m.test(next)) {
    next = next.replace(/^(\s*model_provider\s*=\s*)"openai"/m, '$1"ccc_openai"');
  } else if (!/^\s*model_provider\s*=/m.test(next)) {
    // No model_provider set — add it before first [section]
    const firstSection = next.search(/^\s*\[/m);
    if (firstSection >= 0) {
      next = `${next.slice(0, firstSection)}model_provider = "ccc_openai"\n${next.slice(firstSection)}`;
    }
  }

  return next.replace(/(\[model_providers\.ccc_openai\][^[]*)/s, (section) => {
    let updated = section.replace(/^\s*requires_openai_auth\s*=\s*true\s*$/m, 'env_key = "OPENAI_API_KEY"');
    if (!/^\s*env_key\s*=.*$/m.test(updated)) {
      updated = updated.trimEnd() + '\nenv_key = "OPENAI_API_KEY"\n';
    }
    if (!/^\s*wire_api\s*=.*$/m.test(updated)) {
      updated = updated.trimEnd() + '\nwire_api = "responses"\n';
    }
    return updated;
  });
}
