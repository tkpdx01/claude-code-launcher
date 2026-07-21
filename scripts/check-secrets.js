#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const ignored = new Set(['.git', 'node_modules', 'coverage']);
const findings = [];
const secretPattern = /sk-[A-Za-z0-9_-]{20,}/g;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(file);
      continue;
    }
    if (!entry.isFile() || fs.statSync(file).size > 2 * 1024 * 1024) continue;
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const match of text.matchAll(secretPattern)) {
      const value = match[0];
      if (/(?:example|not-a-real|redacted)/i.test(value)) continue;
      const line = text.slice(0, match.index).split('\n').length;
      findings.push(`${path.relative(root, file)}:${line}`);
    }
  }
}

walk(root);
if (findings.length > 0) {
  console.error('Potential secrets found:');
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}
console.log('No secret-like API keys found in the working tree.');
