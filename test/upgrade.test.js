import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { mergeCodexConfig, fixReservedProviderName } from '../src/codex-config.js';
import { tomlText, scanToml, setTomlValue } from '../src/toml.js';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccc-upgrade-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = (relative) => path.join(root, relative);
  const write = (relative, data) => {
    fs.mkdirSync(path.dirname(file(relative)), { recursive: true });
    fs.writeFileSync(file(relative), typeof data === 'string' ? data : JSON.stringify(data));
  };
  function run(source, input = '', env = {}) {
    return spawnSync(process.execPath, ['--input-type=module', '-e', `
      import os from 'node:os';
      import fs from 'node:fs';
      import path from 'node:path';
      import assert from 'node:assert/strict';
      os.homedir = () => process.env.CCC_TEST_HOME;
      const root = os.homedir();
      const store = await import('./src/store.js');
      globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: [{ id: 'listed-model' }] }) });
      ${source}
    `], { cwd: new URL('../', import.meta.url), env: { ...process.env, CCC_TEST_HOME: root, ...env },
      input, encoding: 'utf8', timeout: 10000 });
  }
  const cli = (args, input = '', env = {}) => run(`process.argv = [process.execPath, 'index.js', ...${JSON.stringify(args)}]; await import('./index.js');`, input, env);
  function fakeCli(command) {
    write(`bin/${command}.js`, 'process.stdout.write(JSON.stringify({ result: "ok", args: process.argv.slice(2) }) + "\\n");');
    if (process.platform === 'win32') write(`bin/${command}.cmd`, `@"${process.execPath}" "${file(`bin/${command}.js`)}" %*\r\n`);
    else {
      write(`bin/${command}`, `#!${process.execPath}\n` + fs.readFileSync(file(`bin/${command}.js`), 'utf8'));
      fs.chmodSync(file(`bin/${command}`), 0o700);
    }
  }
  return { root, file, write, run, cli, fakeCli };
}

const ok = (result) => assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout);
const seedCodex = (f, name = 'demo', config = 'model = "custom-unlisted"\n') => {
  f.write(`.ccc/codex-profiles/${name}/auth.json`, { OPENAI_API_KEY: 'old-complete-secret-123456' });
  f.write(`.ccc/codex-profiles/${name}/config.toml`, config);
};

test('editing and renaming Codex preserves state, old session paths, defaults, and unlisted models', (t) => {
  const f = fixture(t);
  seedCodex(f);
  const state = ['sessions/session.jsonl', 'history.jsonl', 'state_5.sqlite', 'AGENTS.md', 'skills/test/SKILL.md'];
  for (const name of state) f.write(`.ccc/codex-profiles/demo/${name}`, 'state:' + name);
  f.write('.ccc/default', 'demo\n');
  const result = f.cli(['edit', 'demo'], '\n\nrenamed\n');
  ok(result);
  assert.doesNotMatch(result.stdout + result.stderr, /old-complete-secret-123456/);
  assert.equal(fs.readFileSync(f.file('.ccc/default'), 'utf8'), 'renamed\n');
  for (const name of state) {
    assert.equal(fs.readFileSync(f.file(`.ccc/codex-profiles/renamed/${name}`), 'utf8'), 'state:' + name);
    assert.equal(fs.readFileSync(f.file(`.ccc/codex-profiles/demo/${name}`), 'utf8'), 'state:' + name);
  }
  assert.equal(tomlText(fs.readFileSync(f.file('.ccc/codex-profiles/renamed/config.toml'), 'utf8'), ['model']), 'custom-unlisted');
  ok(f.run(`
    store.renameCodexProfile('renamed', 'again');
    assert.deepEqual(store.getAllProfiles(), [{ name: 'again', type: 'codex' }]);
    assert.equal(store.resolveProfile('demo').name, 'again');
    store.createCodexProfile('occupied', 'key', '', 'm');
    assert.throws(() => store.renameCodexProfile('again', 'occupied'));
    assert.equal(store.resolveProfile('demo').name, 'again');
  `));
  const aliasOverwrite = f.cli(['new', 'demo'], 'y\n');
  assert.equal(aliasOverwrite.status, 1);
});

test('editing Claude never echoes existing or replacement keys', (t) => {
  const f = fixture(t);
  f.write('.ccc/profiles/demo.json', { apiKey: 'old-complete-secret-123456', apiUrl: 'https://example.test' });
  const result = f.cli(['edit', 'demo'], '\nreplacement-secret-123456\n\n');
  ok(result);
  assert.doesNotMatch(result.stdout + result.stderr, /old-complete-secret-123456|replacement-secret-123456/);
  assert.equal(JSON.parse(fs.readFileSync(f.file('.ccc/profiles/demo.json'))).apiKey, 'replacement-secret-123456');
});

test('profile writes are private and atomic even when replacement fails', (t) => {
  const f = fixture(t);
  ok(f.run(`
    process.umask(0o022);
    store.saveClaudeProfile('demo', { apiKey: 'first' });
    store.createCodexProfile('codex', 'key', '', 'm');
    const target = path.join(root, '.ccc/profiles/demo.json');
    if (process.platform !== 'win32') {
      for (const name of ['.ccc', '.ccc/profiles', '.ccc/codex-profiles/codex'])
        assert.equal(fs.statSync(path.join(root, name)).mode & 0o777, 0o700);
      for (const name of ['.ccc/profiles/demo.json', '.ccc/codex-profiles/codex/auth.json'])
        assert.equal(fs.statSync(path.join(root, name)).mode & 0o777, 0o600);
      fs.chmodSync(target, 0o644);
      store.saveClaudeProfile('demo', { apiKey: 'first' });
      assert.equal(fs.statSync(target).mode & 0o777, 0o600);
    }
    const original = fs.readFileSync(target, 'utf8');
    const rename = fs.renameSync;
    fs.renameSync = (source, dest) => { if (dest === target) throw new Error('injected write failure'); return rename(source, dest); };
    assert.throws(() => store.saveClaudeProfile('demo', { apiKey: 'second' }), /injected/);
    fs.renameSync = rename;
    assert.equal(fs.readFileSync(target, 'utf8'), original);
    assert.deepEqual(fs.readdirSync(path.dirname(target)), ['demo.json']);
  `));
});

test('Codex endpoint follows the active provider and does not reactivate an old endpoint', (t) => {
  const f = fixture(t);
  ok(f.run(`
    store.createCodexProfile('demo', 'key', 'https://old.example.test/v1', 'm');
    store.updateCodexProfile('demo', 'key', 'https://api.openai.com/v1', 'm');
    const creds = store.getCodexCredentials('demo');
    assert.equal(creds.baseUrl, 'https://api.openai.com/v1');
    store.updateCodexProfile('demo', creds.apiKey, creds.baseUrl, creds.model);
    assert.equal(store.getProfileSummaries()[0].url, 'https://api.openai.com/v1');
    const config = 'model_provider = "active.provider"\\n[model_providers.old]\\nbase_url = "https://wrong.test"\\n[model_providers."active.provider"]\\nbase_url = "https://right.test"\\n';
    store.saveCodexProfile('demo', { OPENAI_API_KEY: 'key' }, config);
    assert.equal(store.getCodexCredentials('demo').baseUrl, 'https://right.test');
  `));
});

test('apply edits only managed TOML fields, preserving complex unrelated tables and multiline strings', () => {
  const target = [
    '# user preferences', 'model = "old"', 'sandbox_mode = "read-only"', 'instructions = """',
    '[model_providers.ccc_openai]', 'model = "example text"', '"""',
    '[mcp_servers.demo]', 'command = "server"', 'args = [', '"--a",', '"]",', ']',
    '[projects."/my/project"]', 'trust_level = "trusted"',
    '[[plugins]]', 'name = "one"', '',
  ].join('\r\n');
  const source = 'model = "chosen"\nmodel_provider = "ccc_openai"\n[model_providers.ccc_openai]\nbase_url = "https://new.test/v1"\n';
  const result = mergeCodexConfig(target, source);
  assert.equal(tomlText(result, ['model']), 'chosen');
  assert.equal(tomlText(result, ['sandbox_mode']), 'read-only');
  assert.equal(tomlText(result, ['mcp_servers', 'demo', 'command']), 'server');
  assert.equal(tomlText(result, ['projects', '/my/project', 'trust_level']), 'trusted');
  assert.match(result, /\[model_providers.ccc_openai\]\r\nmodel = "example text"/);
  assert.ok(!result.replace(/\r\n/g, '').includes('\n'));
  assert.equal(mergeCodexConfig(result, source), result);
});

test('apply and restore retain exact global settings and auth, including recovery of a new file', (t) => {
  const f = fixture(t);
  seedCodex(f);
  const original = 'model = "old"\n[mcp_servers.original]\ncommand = "server"\n';
  f.write('.codex/config.toml', original);
  ok(f.cli(['apply', 'demo'], 'y\n'));
  const applied = fs.readFileSync(f.file('.codex/config.toml'), 'utf8');
  assert.match(applied, /mcp_servers.original/);
  assert.equal(tomlText(applied, ['model']), 'custom-unlisted');
  const id = fs.readdirSync(f.file('.ccc/recovery'))[0];
  ok(f.cli(['restore', id, '--yes']));
  assert.equal(fs.readFileSync(f.file('.codex/config.toml'), 'utf8'), original);
  assert.equal(fs.existsSync(f.file('.codex/auth.json')), false);
});

test('apply rollback restores both credentials and settings after a write failure', (t) => {
  const f = fixture(t);
  ok(f.run(`
    const { writeWithBackup } = await import('./src/recovery.js');
    const { atomicWrite } = await import('./src/files.js');
    const a = path.join(root, '.codex/config.toml');
    const b = path.join(root, '.codex/auth.json');
    atomicWrite(a, 'old config'); atomicWrite(b, 'old auth');
    const rename = fs.renameSync;
    fs.renameSync = (source, target) => { if (target === b) throw new Error('injected'); return rename(source, target); };
    assert.throws(() => writeWithBackup([{ file: a, data: 'new config' }, { file: b, data: 'new auth' }]), /injected/);
    fs.renameSync = rename;
    assert.equal(fs.readFileSync(a, 'utf8'), 'old config');
    assert.equal(fs.readFileSync(b, 'utf8'), 'old auth');
  `));
});

test('restore refuses later edits and malformed TOML apply never writes credentials', (t) => {
  const f = fixture(t);
  seedCodex(f);
  f.write('.codex/config.toml', 'model = "old"\n');
  f.write('.codex/auth.json', { OPENAI_API_KEY: 'old-global-key' });
  ok(f.cli(['apply', 'demo'], 'y\n'));
  const id = fs.readdirSync(f.file('.ccc/recovery'))[0];
  f.write('.codex/config.toml', 'model = "later-edit"\n');
  assert.equal(f.cli(['restore', id, '--yes']).status, 1);
  assert.equal(fs.readFileSync(f.file('.codex/config.toml'), 'utf8'), 'model = "later-edit"\n');
  f.write('.codex/config.toml', '[broken');
  const auth = fs.readFileSync(f.file('.codex/auth.json'), 'utf8');
  assert.equal(f.cli(['apply', 'demo'], 'y\n').status, 1);
  assert.equal(fs.readFileSync(f.file('.codex/auth.json'), 'utf8'), auth);
});

test('cleanup previews by default, rejects typos, and restores sessions, aliases, and default selection', (t) => {
  const f = fixture(t);
  seedCodex(f);
  f.write('.ccc/codex-profiles/demo/sessions/one.jsonl', 'history');
  f.write('.ccc/profiles/keep.json', { apiKey: 'keep-key' });
  f.write('.ccc/default', 'demo\n');
  ok(f.run(`store.renameCodexProfile('demo', 'renamed');`));
  ok(f.cli(['cleanup', '--keep', 'keep']));
  assert.equal(fs.existsSync(f.file('.ccc/recovery')), false);
  assert.equal(f.cli(['cleanup', '--keep', 'typo', '--apply', '--yes']).status, 1);
  assert.equal(fs.existsSync(f.file('.ccc/codex-profiles/renamed/auth.json')), true);
  ok(f.cli(['cleanup', '--keep', 'keep', '--apply', '--yes']));
  assert.equal(fs.existsSync(f.file('.ccc/codex-profiles/renamed')), false);
  assert.equal(fs.readFileSync(f.file('.ccc/default'), 'utf8'), '');
  const id = fs.readdirSync(f.file('.ccc/recovery'))[0];
  f.write('.ccc/codex-profiles/renamed/auth.json', { OPENAI_API_KEY: 'collision' });
  assert.equal(f.cli(['restore', id, '--yes']).status, 1);
  assert.equal(fs.existsSync(f.file('.ccc/codex-profiles/demo')), false);
  fs.rmSync(f.file('.ccc/codex-profiles/renamed'), { recursive: true });
  ok(f.cli(['restore', id, '--yes']));
  assert.equal(fs.readFileSync(f.file('.ccc/codex-profiles/demo/sessions/one.jsonl'), 'utf8'), 'history');
  assert.equal(fs.readFileSync(f.file('.ccc/default'), 'utf8'), 'renamed\n');
});

test('default selection follows Claude rename and recoverable delete', (t) => {
  const f = fixture(t);
  f.write('.ccc/profiles/demo.json', { apiKey: 'key' });
  ok(f.cli(['default', 'demo']));
  ok(f.cli(['edit', 'demo'], '\n\nrenamed\n'));
  assert.equal(f.cli(['default']).stdout.trim(), 'renamed');
  ok(f.cli(['delete', 'renamed'], 'y\n'));
  assert.equal(fs.readFileSync(f.file('.ccc/default'), 'utf8'), '');
  const id = fs.readdirSync(f.file('.ccc/recovery'))[0];
  ok(f.cli(['restore', id, '--yes']));
  assert.equal(f.cli(['default']).stdout.trim(), 'renamed');
});

test('both launchers preserve machine-readable stdout and redirected bare ccc never launches', (t) => {
  const f = fixture(t);
  for (const command of ['claude', 'codex']) f.fakeCli(command);
  f.write('.ccc/profiles/claude.json', { apiKey: 'key' });
  seedCodex(f, 'codex');
  for (const name of ['claude', 'codex']) {
    const result = f.cli([name, '--', '--output-format', 'json'], '', { PATH: f.file('bin') });
    ok(result);
    assert.equal(JSON.parse(result.stdout).result, 'ok');
    assert.match(result.stderr, /Launch/);
  }
  const bare = f.cli([], '', { PATH: f.file('bin') });
  ok(bare);
  assert.doesNotMatch(bare.stdout, /"result":"ok"/);
});

test('TOML scanner rejects malformed input and handles quoted provider names', () => {
  assert.throws(() => scanToml('model = "unfinished'));
  assert.throws(() => scanToml('[unfinished'));
  assert.equal(tomlText('model_provider = \'a.b\'\n[model_providers."a.b"]\nbase_url = \'https://example.test\'\n', ['model_providers', 'a.b', 'base_url']), 'https://example.test');
});

test('TOML maintenance leaves examples inside strings untouched and handles quoted assignment keys', () => {
  const text = 'instructions = """\n[model_providers.openai]\nsandbox_mode = "example"\n"""\nmodel = "chosen"\n';
  assert.equal(fixReservedProviderName(text), text);
  const dotted = 'model_providers."name=part".base_url = "old"\n';
  assert.equal(tomlText(setTomlValue(dotted, ['model_providers', 'name=part', 'base_url'], '"new"'), ['model_providers', 'name=part', 'base_url']), 'new');
  assert.doesNotThrow(() => scanToml('instructions = """quoted ending""""\nmodel = "m"\n'));
});

test('Codex credential update rolls back config when auth replacement fails', (t) => {
  const f = fixture(t);
  ok(f.run(`
    store.createCodexProfile('demo', 'old-key', 'https://old.test/v1', 'old-model');
    const original = store.readCodexProfile('demo');
    const auth = path.join(root, '.ccc/codex-profiles/demo/auth.json');
    const rename = fs.renameSync;
    fs.renameSync = (from, to) => { if (to === auth) throw new Error('injected'); return rename(from, to); };
    assert.throws(() => store.updateCodexProfile('demo', 'new-key', 'https://new.test/v1', 'new-model'), /injected/);
    fs.renameSync = rename;
    assert.deepEqual(store.readCodexProfile('demo'), original);
  `));
});

test('show masks nested secrets and cancelled cleanup leaves profiles in place', (t) => {
  const f = fixture(t);
  f.write('.ccc/profiles/demo.json', { apiKey: 'key', settings: { env: { ANTHROPIC_AUTH_TOKEN: 'nested-secret-value' } } });
  const shown = f.cli(['show', 'demo']);
  ok(shown);
  assert.doesNotMatch(shown.stdout, /nested-secret-value/);
  seedCodex(f, 'codex', 'model = "m"\n[mcp_servers.demo.env]\nAPI_TOKEN = "nested-codex-secret"\n');
  const codex = f.cli(['show', 'codex']);
  ok(codex);
  assert.doesNotMatch(codex.stdout, /nested-codex-secret/);
  ok(f.cli(['cleanup', '--keep', 'demo', '--apply'], 'n\n'));
  assert.equal(fs.existsSync(f.file('.ccc/codex-profiles/codex')), true);
  assert.equal(fs.existsSync(f.file('.ccc/recovery')), false);
});

test('apply copies the chosen model catalog and restores overwritten catalog bytes', (t) => {
  const f = fixture(t);
  seedCodex(f, 'demo', 'model = "m"\nmodel_catalog_json = \'./model-catalog.demo.json\'\n');
  f.write('.ccc/codex-profiles/demo/model-catalog.demo.json', 'new catalog');
  f.write('.codex/model-catalog.demo.json', 'old catalog');
  ok(f.cli(['apply', 'demo'], 'y\n'));
  assert.equal(fs.readFileSync(f.file('.codex/model-catalog.demo.json'), 'utf8'), 'new catalog');
  assert.equal(tomlText(fs.readFileSync(f.file('.codex/config.toml'), 'utf8'), ['model_catalog_json']), f.file('.codex/model-catalog.demo.json'));
  const id = fs.readdirSync(f.file('.ccc/recovery'))[0];
  ok(f.cli(['restore', id, '--yes']));
  assert.equal(fs.readFileSync(f.file('.codex/model-catalog.demo.json'), 'utf8'), 'old catalog');
});

test('interactive ccc opens the profile picker and Enter launches the saved default directly', (t) => {
  const f = fixture(t);
  f.fakeCli('claude');
  for (const name of ['aaa', 'chosen']) f.write(`.ccc/profiles/${name}.json`, { apiKey: 'test-key' });
  f.write('.ccc/default', 'chosen\n');
  const result = f.run(`
    const { PassThrough, Writable } = await import('node:stream');
    const { Console } = await import('node:console');
    const chunks = [];
    const stdin = new PassThrough();
    stdin.isTTY = true; stdin.setRawMode = () => {};
    const stdout = new Writable({ write(data, enc, cb) { chunks.push(data.toString()); cb(); } });
    Object.assign(stdout, { isTTY: true, columns: 90, rows: 30 });
    Object.defineProperty(process, 'stdin', { value: stdin });
    Object.defineProperty(process, 'stdout', { value: stdout });
    globalThis.console = new Console({ stdout, stderr: process.stderr });
    process.argv = [process.execPath, 'index.js'];
    await import('./index.js');
    await new Promise(setImmediate);
    assert.match(chunks.join(''), /›.*chosen.*★/);
    assert.doesNotMatch(chunks.join(''), /What would you like to do/);
    stdin.write('\\r');
  `, '', { PATH: f.file('bin'), TERM: 'xterm', NO_COLOR: '1' });
  ok(result);
  assert.equal(JSON.parse(result.stdout).result, 'ok');
  assert.match(result.stderr, /chosen/);
});
