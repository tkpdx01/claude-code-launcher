import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fixReservedProviderName } from '../src/codex-config.js';
import { isSafeProfileName, validateProfileName } from '../src/profile-name.js';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const cliPath = path.join(repoRoot, 'index.js');

function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccc-store-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  function write(relative, contents) {
    const target = path.join(home, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof contents === 'string' ? contents : JSON.stringify(contents));
    return target;
  }
  function run(args, input) {
    return spawnSync(process.execPath, args, {
      cwd: repoRoot, env: { ...process.env, HOME: home, USERPROFILE: home }, input,
      encoding: 'utf8', timeout: 10000,
    });
  }
  // Run a module snippet with fs read counters so tests can assert on disk traffic.
  function measure(script) {
    const result = run(['--input-type=module', '-e', `
      import fs from 'node:fs';
      const counts = { readFileSync: 0, readdirSync: 0, existsSync: 0 };
      for (const name of Object.keys(counts)) {
        const original = fs[name];
        fs[name] = function (...args) { counts[name] += 1; return original.apply(this, args); };
      }
      import * as store from './src/store.js';
      const reset = () => { for (const name of Object.keys(counts)) counts[name] = 0; };
      const output = {};
      ${script}
      console.log(JSON.stringify({ output, counts }));
    `]);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout.trim());
  }
  return { home, write, run, measure };
}

function seed(f, count) {
  const names = [];
  for (let i = 0; i < count; i++) {
    const name = `claude-${String(i).padStart(2, '0')}`;
    f.write(`.ccc/profiles/${name}.json`, { type: 'claude', apiUrl: `https://c${i}.example.test`, apiKey: 'k' });
    names.push(name);
  }
  f.write('.ccc/profiles/deep.json', { type: 'deepseek', apiKey: 'k', model: 'deepseek-chat' });
  f.write('.ccc/profiles/slim.json', { type: 'codex', apiKey: 'k', apiUrl: 'https://slim.example.test/v1' });
  f.write('.ccc/codex-profiles/dir/auth.json', { OPENAI_API_KEY: 'k' });
  f.write('.ccc/codex-profiles/dir/config.toml', 'model = "m"\n\n[model_providers.ccc_openai]\nbase_url = "https://dir.example.test/v1"\n');
  f.write('.ccc/profiles/broken.json', '{ not json');
  f.write('.ccc/profiles/notes.txt', 'ignored');
  return names;
}

test('profile listing reads every profile file once', (t) => {
  const f = fixture(t);
  const claudeNames = seed(f, 20);
  const { output, counts } = f.measure(`
    reset();
    output.all = store.getAllProfiles();
    output.listCounts = { ...counts };
    reset();
    output.summaries = store.getProfileSummaries();
    output.summaryCounts = { ...counts };
  `);
  assert.deepEqual(output.all.map((p) => p.name), [...claudeNames, 'deep', 'dir', 'slim']);
  assert.deepEqual(output.all.filter((p) => p.type !== 'claude'), [
    { name: 'deep', type: 'deepseek' }, { name: 'dir', type: 'codex' }, { name: 'slim', type: 'codex' },
  ]);
  const jsonFiles = 20 + 3; // claude + deep + slim + broken
  assert.equal(output.listCounts.readFileSync, jsonFiles);
  assert.equal(output.listCounts.readdirSync, 2);
  // Listing adds exactly one config.toml read for the materialized Codex directory.
  assert.equal(output.summaryCounts.readFileSync, jsonFiles + 1);
  const urls = Object.fromEntries(output.summaries.map((p) => [p.name, p.url]));
  assert.equal(urls['claude-03'], 'https://c3.example.test');
  assert.equal(urls.deep, '');
  assert.equal(urls.slim, 'https://slim.example.test/v1');
  assert.equal(urls.dir, 'https://dir.example.test/v1');
});

test('resolving a profile by name does not scan the profile directories', (t) => {
  const f = fixture(t);
  seed(f, 20);
  const { output } = f.measure(`
    reset();
    output.byName = store.resolveProfile('claude-07');
    output.byNameCounts = { ...counts };
    reset();
    output.codex = store.resolveProfile('dir');
    output.slim = store.resolveProfile('slim');
    output.deep = store.resolveProfile('deep');
    output.byIndex = store.resolveProfile('2');
    output.missing = store.resolveProfile('nope');
    output.unsafe = store.resolveProfile('../claude-07');
  `);
  assert.deepEqual(output.byName, { name: 'claude-07', type: 'claude' });
  assert.equal(output.byNameCounts.readdirSync, 0);
  assert.ok(output.byNameCounts.readFileSync <= 2, JSON.stringify(output.byNameCounts));
  assert.deepEqual(output.codex, { name: 'dir', type: 'codex' });
  assert.deepEqual(output.slim, { name: 'slim', type: 'codex' });
  assert.deepEqual(output.deep, { name: 'deep', type: 'deepseek' });
  assert.deepEqual(output.byIndex, { name: 'claude-01', type: 'claude' });
  assert.equal(output.missing, null);
  assert.equal(output.unsafe, null);
});

test('safe profile names never escape the profile directories', () => {
  for (const name of ['demo', 'my.json.profile', 'a b', 'x-y_z.1']) assert.equal(isSafeProfileName(name), true, name);
  for (const name of ['', '.', ' . ', '../demo', 'a/b', 'a\\b', 'a..b', '配置', 'x'.repeat(65), 7, null]) {
    assert.equal(isSafeProfileName(name), false, String(name));
  }
  assert.equal(validateProfileName('demo'), true);
  assert.notEqual(validateProfileName('a/b'), true);
  assert.notEqual(validateProfileName('x'.repeat(65)), true);
  assert.notEqual(validateProfileName('list'), true);
});

test('reserved provider rename is pure and idempotent', () => {
  const old = [
    'model = "gpt-5.4"', 'model_provider = "openai"', '', '[model_providers.openai]',
    'name = "Custom"', 'base_url = "https://example.test/v1"', 'requires_openai_auth = true', '',
    '[mcp_servers.demo]', 'command = "demo"', '',
  ].join('\n');
  const fixed = fixReservedProviderName(old);
  assert.match(fixed, /^model_provider = "ccc_openai"$/m);
  assert.match(fixed, /^\[model_providers\.ccc_openai\]$/m);
  assert.match(fixed, /^env_key = "OPENAI_API_KEY"$/m);
  assert.match(fixed, /^wire_api = "responses"$/m);
  assert.doesNotMatch(fixed, /requires_openai_auth|model_providers\.openai\]/);
  assert.match(fixed, /\[mcp_servers\.demo\]\ncommand = "demo"/);
  assert.equal(fixReservedProviderName(fixed), fixed);
  const withoutProvider = '[model_providers.openai]\nbase_url = "https://example.test/v1"\n';
  assert.match(fixReservedProviderName(withoutProvider), /^model_provider = "ccc_openai"\n\[model_providers\.ccc_openai\]/);
});

test('Codex launch repairs a profile config in one write and reports the rename once', (t) => {
  const f = fixture(t);
  f.write('.ccc/codex-profiles/demo/auth.json', { auth_mode: 'apikey', OPENAI_API_KEY: 'k' });
  const target = f.write('.ccc/codex-profiles/demo/config.toml', [
    '# Codex profile managed by ccc', 'sandbox_mode = "danger-full-access"', '[analytics]', 'enabled = false',
    'model = "gpt-5.4"', 'model_provider = "openai"', '', '[model_providers.openai]',
    'base_url = "https://example.test/v1"', 'requires_openai_auth = true', '', '[windows]', 'sandbox = "elevated"', '',
  ].join('\n'));
  const { output } = f.measure(`
    output.first = store.repairCodexProfileConfig('demo');
    output.toml = fs.readFileSync(${JSON.stringify(target)}, 'utf8');
    output.second = store.repairCodexProfileConfig('demo');
    output.missing = store.repairCodexProfileConfig('nope');
  `);
  assert.deepEqual(output.first, { changed: true, renamedProvider: true });
  assert.deepEqual(output.second, { changed: false, renamedProvider: false });
  assert.deepEqual(output.missing, { changed: false, renamedProvider: false });
  const root = output.toml.split(/^\s*\[/m)[0];
  assert.match(root, /^model = "gpt-5.4"$/m);
  assert.match(root, /^model_provider = "ccc_openai"$/m);
  assert.match(output.toml, /^\[model_providers\.ccc_openai\]$/m);
  assert.match(output.toml, /^env_key = "OPENAI_API_KEY"$/m);
  assert.doesNotMatch(output.toml, /sandbox|\[windows\]|requires_openai_auth/);
});

test('replacing a Codex profile with a Claude profile removes the Codex directory and vice versa', (t) => {
  const f = fixture(t);
  f.write('.ccc/codex-profiles/demo/auth.json', { OPENAI_API_KEY: 'old' });
  f.write('.ccc/codex-profiles/demo/config.toml', 'model = "m"\n');
  let result = f.run([cliPath, 'new', 'demo'], 'y\nhttps://example.test\nnew-key\nn\n');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(f.home, '.ccc/codex-profiles/demo')), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.home, '.ccc/profiles/demo.json'), 'utf8')), {
    type: 'claude', apiUrl: 'https://example.test', apiKey: 'new-key',
  });

  // Codex is the second menu choice; piped selects take the default, so seed the type through a slim file instead.
  f.write('.ccc/profiles/slim.json', { type: 'codex', apiKey: 'k', apiUrl: 'https://slim.example.test/v1' });
  result = f.run(['--input-type=module', '-e', `
    import * as store from './src/store.js';
    store.createCodexProfile('demo', 'codex-key', 'https://example.test/v1', 'gpt-5.4');
    store.deleteClaudeProfile('demo');
    console.log(JSON.stringify(store.getAllProfiles()));
  `]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), [
    { name: 'demo', type: 'codex' }, { name: 'slim', type: 'codex' },
  ]);
  assert.equal(fs.existsSync(path.join(f.home, '.ccc/profiles/demo.json')), false);
});

test('unknown profiles print the hint and exit without launching', (t) => {
  const f = fixture(t);
  f.write('.ccc/profiles/demo.json', { type: 'claude', apiKey: 'k' });
  const result = f.run([cliPath, 'missing']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /missing/);
  assert.match(result.stdout, /ccc list/);
});
