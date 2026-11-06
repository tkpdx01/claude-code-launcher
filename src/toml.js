// Edit selected TOML assignments while preserving unrelated text and tables.
// This is a structural scanner, not a TOML value parser.
const KEY = /(?:[A-Za-z0-9_-]+|"(?:[^"\\]|\\.)*"|'[^']*')/g;

function keyPath(text) {
  const parts = [];
  let end = 0;
  for (const match of text.matchAll(KEY)) {
    const between = text.slice(end, match.index).trim();
    if (between !== (parts.length ? '.' : '')) throw new Error('Unsupported TOML key');
    const token = match[0];
    parts.push(token[0] === '"' ? JSON.parse(token) : token[0] === "'" ? token.slice(1, -1) : token);
    end = match.index + token.length;
  }
  if (!parts.length || text.slice(end).trim()) throw new Error('Unsupported TOML key');
  return parts;
}

function scanValue(line, state) {
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (state.quote) {
      if (state.quote[0] === '"' && c === '\\') { i++; continue; }
      if (line.startsWith(state.quote, i)) {
        let count = state.quote.length;
        if (count === 3) while (count < 5 && line[i + count] === c) count++;
        i += count - 1;
        state.quote = '';
      }
    } else if (c === '#') break;
    else if (c === '"' || c === "'") {
      state.quote = line.startsWith(c.repeat(3), i) ? c.repeat(3) : c;
      i += state.quote.length - 1;
    } else if (c === '[' || c === '{') state.depth++;
    else if (c === ']' || c === '}') state.depth--;
  }
  if (state.depth < 0 || state.quote.length === 1) throw new Error('Invalid TOML value');
}

export function scanToml(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const entries = [];
  const sections = [];
  let section = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const header = line.match(/^(\[\[?)(.*?)(\]\]?)\s*(?:#.*)?$/);
    if (header && header[1].length === header[3].length) {
      section = keyPath(header[2]);
      sections.push({ path: section, start: i, array: header[1].length === 2 });
      continue;
    }
    const assignment = line.match(/^((?:(?:[A-Za-z0-9_-]+|"(?:[^"\\]|\\.)*"|'[^']*')\s*\.?\s*)+)=(.*)$/);
    if (!assignment) throw new Error('Unsupported TOML syntax; configuration left unchanged');
    const start = i;
    const state = { quote: '', depth: 0 };
    scanValue(assignment[2], state);
    while (state.quote || state.depth) {
      if (++i >= lines.length) throw new Error('Unterminated TOML value');
      scanValue(lines[i], state);
    }
    entries.push({ path: [...section, ...keyPath(assignment[1])], start, end: i + 1,
      prefix: lines[start].match(/^\s*/)[0] + assignment[1],
      value: [assignment[2].trim(), ...lines.slice(start + 1, i + 1)].join(eol) });
  }
  sections.forEach((s, i) => { s.end = sections[i + 1]?.start ?? lines.length; });
  return { lines, eol, entries, sections };
}

const samePath = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function tomlValue(text, key) {
  return scanToml(text).entries.find((entry) => samePath(entry.path, key))?.value;
}

export function tomlText(text, key) {
  const value = tomlValue(text, key);
  const match = value?.match(/^("(?:[^"\\]|\\.)*"|'[^']*')\s*(?:#.*)?$/);
  if (!match) return '';
  return match[1][0] === '"' ? JSON.parse(match[1]) : match[1].slice(1, -1);
}

export function setTomlValue(text, key, value) {
  const { lines, eol, entries, sections } = scanToml(text);
  if (entries.some((entry) => entry.path.length < key.length && entry.path.every((part, i) => key[i] === part))) {
    throw new Error('Cannot modify a key inside an inline TOML table');
  }
  const matches = entries.filter((entry) => samePath(entry.path, key));
  if (matches.length > 1) throw new Error('Duplicate TOML key; configuration left unchanged');
  const sectionPath = key.slice(0, -1);
  if (sections.some((s) => s.array && s.path.every((part, i) => sectionPath[i] === part))) {
    throw new Error('Cannot edit an array of TOML tables');
  }
  if (matches.length) {
    const { start, end } = matches[0];
    // Keep the original key spelling (including dotted/quoted keys).
    const prefix = matches[0].prefix;
    lines.splice(start, end - start, ...(value == null ? [] : [`${prefix}= ${value}`]));
  } else if (value != null) {
    const section = sections.find((s) => samePath(s.path, sectionPath));
    const encode = (part) => /^[A-Za-z0-9_-]+$/.test(part) ? part : JSON.stringify(part);
    const assignment = `${encode(key.at(-1))} = ${value}`;
    if (!sectionPath.length) lines.splice(sections[0]?.start ?? 0, 0, assignment);
    else if (section) lines.splice(section.end, 0, assignment);
    else lines.push('', `[${sectionPath.map(encode).join('.')}]`, assignment, '');
  }
  return lines.join(eol);
}

export function replaceTomlTable(text, prefix, source) {
  const inside = (p) => prefix.every((part, i) => p[i] === part);
  const target = scanToml(text);
  const incoming = scanToml(source);
  if (target.entries.some((e) => e.path.length < prefix.length && e.path.every((p, i) => prefix[i] === p))) {
    throw new Error('Cannot replace an inline TOML provider table');
  }
  const remove = new Set();
  for (const section of target.sections.filter((s) => inside(s.path))) {
    for (let i = section.start; i < section.end; i++) remove.add(i);
  }
  // Dotted assignments can declare the same provider without a table header.
  for (const entry of target.entries.filter((e) => inside(e.path))) {
    for (let i = entry.start; i < entry.end; i++) remove.add(i);
  }
  const addition = incoming.sections.filter((s) => inside(s.path))
    .flatMap((s) => incoming.lines.slice(s.start, s.end)).join(target.eol);
  if (!addition) throw new Error('Selected provider must have an explicit TOML table');
  return target.lines.filter((_, i) => !remove.has(i)).join(target.eol).trimEnd()
    + target.eol + target.eol + addition.trimEnd() + target.eol;
}
