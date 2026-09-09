import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/args.js';
import { mergeClaudeSettings } from '../src/claude-settings.js';
import { buildClaudeEnv } from '../src/env.js';
import { fixCodexAnalyticsScope, readTomlString } from '../src/codex-config.js';
import { generateCodexConfigToml } from '../src/store.js';

test('legacy launcher flag aliases and explicit child argument boundaries are preserved', () => {
  for (const flag of ['-d', '--ddd', '-h', '--help', '-v', '--version', '-V']) {
    for (const args of [[flag, 'demo'], ['demo', flag]]) {
      const parsed = parseArgs(args);
      assert.equal(parsed.cmd, 'demo');
      assert.deepEqual([...parsed.flags], [flag]);
      assert.deepEqual(parsed.rest, []);
    }
  }
  const parsed = parseArgs(['demo', '--', '-p', '--help', '--', 'file with spaces']);
  assert.equal(parsed.cmd, 'demo');
  assert.deepEqual([...parsed.flags], []);
  assert.deepEqual(parsed.rest, ['-p', '--help', '--', 'file with spaces']);
  assert.equal(parseArgs(['--', '-demo']).cmd, '-demo');
});

test('settings.env models survive in both settings and the child environment', () => {
  const main = { env: { ANTHROPIC_MODEL: 'global', KEEP: 'yes' }, model: 'global' };
  const profile = {
    type: 'claude', apiKey: 'test-key',
    settings: { env: { ANTHROPIC_MODEL: 'selected' }, model: 'selected', skipWebFetchPreflight: false },
  };
  const before = structuredClone({ main, profile });
  const settings = mergeClaudeSettings(main, profile);
  assert.equal(settings.env.ANTHROPIC_MODEL, 'selected');
  assert.equal(buildClaudeEnv(profile).ANTHROPIC_MODEL, 'selected');
  assert.equal(settings.model, 'selected');
  assert.equal(settings.env.KEEP, 'yes');
  assert.equal(settings.skipWebFetchPreflight, false);
  assert.deepEqual({ main, profile }, before, 'merging must not mutate either input');
});

test('JSON prototype keys cannot alter inherited settings during a merge', () => {
  const profile = JSON.parse('{"apiKey":"test-key","settings":{"__proto__":{"cccPolluted":true},"constructor":{"prototype":{"cccPolluted":true}}}}');
  const settings = mergeClaudeSettings({}, profile);
  assert.equal({}.cccPolluted, undefined);
  assert.equal(Object.getPrototypeOf(settings), Object.prototype);
  assert.equal(Object.prototype.hasOwnProperty.call(settings, '__proto__'), true);
});

test('Codex official and custom profiles preserve escaped strings', () => {
  const model = 'custom"model\\id\nline\t\x7f';
  for (const url of ['', 'https://api.openai.com/v1/', 'https://example.test/v1']) {
    const config = generateCodexConfigToml(url, model);
    const root = config.split(/^\s*\[/m)[0];
    assert.equal(readTomlString(root, 'model'), model);
    assert.equal(readTomlString(root, 'model_provider'), url.includes('example') ? 'ccc_openai' : '');
    assert.equal(fixCodexAnalyticsScope(config), config, 'valid new profiles need no migration');
  }
  assert.equal(readTomlString("model = 'custom-model' # comment\r\n", 'model'), 'custom-model');
});

test('Codex migration preserves CRLF, explicit root values, and unrelated sections', () => {
  const original = [
    '# Codex profile managed by ccc', 'model = "chosen"', '[analytics]',
    'enabled = false', 'model = "old" # misplaced', "model_provider = 'ccc_openai'",
    '', '[model_providers.ccc_openai]', 'base_url = "https://example.test/v1"',
    '', '[mcp_servers.demo]', 'command = "demo"', '',
  ].join('\r\n');
  const updated = fixCodexAnalyticsScope(original);
  const root = updated.split(/^\s*\[/m)[0];
  assert.equal(readTomlString(root, 'model'), 'chosen');
  assert.equal(readTomlString(root, 'model_provider'), 'ccc_openai');
  assert.doesNotMatch(updated, /model = "old"/);
  assert.equal(updated.includes('\n') && !updated.replace(/\r\n/g, '').includes('\n'), true);
  assert.ok(updated.endsWith(original.slice(original.indexOf('[model_providers.ccc_openai]'))));
  assert.equal(fixCodexAnalyticsScope(updated), updated);
});

test('Codex migration leaves table-like text inside multiline strings unchanged', () => {
  const configs = [
    'instructions = """\n[analytics]\nmodel = "example"\n"""\n',
    '[mcp_servers.demo]\nnotes = """\n[analytics]\nmodel = "example"\n"""\n',
    '[analytics]\nnotes = """\nmodel = "example"\n"""\n',
  ];
  for (const config of configs) assert.equal(fixCodexAnalyticsScope(config), config);
});
