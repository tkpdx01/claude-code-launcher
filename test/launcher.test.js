import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const cliPath = path.join(repoRoot, 'index.js');

function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccc-launch-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const bin = path.join(home, 'bin');
  fs.mkdirSync(bin);
  const env = {
    ...process.env, HOME: home, USERPROFILE: home,
    PATH: bin, CCC_CAPTURE: path.join(home, 'capture.json'),
  };
  function write(relative, contents) {
    const target = path.join(home, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof contents === 'string' ? contents : JSON.stringify(contents));
    return target;
  }
  function fakeCli(command, source) {
    const target = write(`bin/${command}.js`, source);
    if (process.platform === 'win32') {
      write(`bin/${command}`, '#!/bin/sh\nexit 99\n');
      write(`bin/${command}.cmd`, `@"${process.execPath}" "${target}" %*\r\n`);
    } else {
      const executable = write(`bin/${command}`, `#!${process.execPath}\n${source}`);
      fs.chmodSync(executable, 0o700);
    }
  }
  function run(args, input, extraEnv = {}) {
    return spawnSync(process.execPath, args, {
      cwd: repoRoot, env: { ...env, ...extraEnv }, input,
      encoding: 'utf8', timeout: 10000,
    });
  }
  return { home, env, write, fakeCli, run };
}

const captureClaude = `
const fs = require('node:fs');
const args = process.argv.slice(2);
const settingsPath = args[args.indexOf('--settings') + 1];
fs.writeFileSync(process.env.CCC_CAPTURE, JSON.stringify({
  args, settingsPath, settings: JSON.parse(fs.readFileSync(settingsPath, 'utf8')),
  mode: fs.statSync(settingsPath).mode & 0o777,
  env: Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(ANTHROPIC_|CLAUDE_CODE_SUBAGENT_MODEL)/.test(key))),
}));
`;

function captured(f) {
  return JSON.parse(fs.readFileSync(f.env.CCC_CAPTURE, 'utf8'));
}

test('DeepSeek model survives launch and explicit profile env wins', (t) => {
  const f = fixture(t);
  f.fakeCli('claude', captureClaude);
  const main = {
    model: 'global-model',
    env: { ANTHROPIC_MODEL: 'global-model', ANTHROPIC_DEFAULT_OPUS_MODEL: 'global-opus' },
    permissions: { allow: ['Read'], deny: ['Bash(rm:*)'] },
  };
  const globalPath = f.write('.claude/settings.json', main);
  f.write('.ccc/profiles/deep.json', {
    type: 'deepseek', apiUrl: 'https://example.test/anthropic', apiKey: 'test-key',
    model: 'deepseek-reasoner', settings: { permissions: { allow: ['Glob'] } },
  });
  const result = f.run([cliPath, 'deep'], undefined, { ANTHROPIC_MODEL: 'shell-model' });
  assert.equal(result.status, 0, result.stderr);
  const launch = captured(f);
  assert.equal(launch.settings.env.ANTHROPIC_MODEL, 'deepseek-reasoner');
  assert.equal(launch.env.ANTHROPIC_MODEL, 'deepseek-reasoner');
  assert.equal(launch.settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL, '');
  assert.equal(launch.settings.model, undefined);
  assert.deepEqual(launch.settings.permissions, { allow: ['Glob'], deny: ['Bash(rm:*)'] });
  assert.deepEqual(JSON.parse(fs.readFileSync(globalPath, 'utf8')), main);

  f.write('.ccc/profiles/deep.json', {
    type: 'deepseek', apiKey: 'test-key', model: 'deepseek-chat',
    env: { ANTHROPIC_MODEL: 'explicit-model' },
  });
  assert.equal(f.run([cliPath, 'deep']).status, 0);
  assert.equal(captured(f).env.ANTHROPIC_MODEL, 'explicit-model');
  assert.equal(captured(f).settings.env.ANTHROPIC_MODEL, 'explicit-model');
});

test('replacing a DeepSeek profile with Claude keeps the newly saved file', (t) => {
  const f = fixture(t);
  const profilePath = f.write('.ccc/profiles/demo.json', {
    type: 'deepseek', apiKey: 'old-key', model: 'deepseek-chat',
  });
  const result = f.run([cliPath, 'new', 'demo'], 'y\nhttps://example.test\nnew-key\nn\n');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(profilePath), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(profilePath, 'utf8')), {
    type: 'claude', apiUrl: 'https://example.test', apiKey: 'new-key',
  });
});

test('profile indices require a complete integer and names keep their full .json suffix', (t) => {
  const f = fixture(t);
  f.write('.ccc/profiles/a.json', { type: 'claude', apiKey: 'key' });
  f.write('.ccc/profiles/my.json.profile.json', { type: 'claude', apiKey: 'key' });
  const result = f.run(['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import * as store from './src/store.js';
    for (const value of ['1abc', '1.2', '1e1', '1/../a']) {
      assert.equal(store.resolveProfile(value), null, value);
    }
    assert.equal(store.resolveProfile('01').name, 'a');
    assert.equal(store.resolveProfile('my.json.profile').name, 'my.json.profile');
  `]);
  assert.equal(result.status, 0, result.stderr);
});

test('prototype property names can launch as ordinary profiles', (t) => {
  const f = fixture(t);
  f.fakeCli('claude', captureClaude);
  f.write('.ccc/profiles/constructor.json', { type: 'claude', apiKey: 'key' });
  const result = f.run([cliPath, 'constructor']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(f.env.CCC_CAPTURE), true);
});

test('Claude forwards child arguments verbatim and removes its private temp settings', (t) => {
  const f = fixture(t);
  f.fakeCli('claude', captureClaude);
  f.write('.ccc/profiles/demo.json', { type: 'claude', apiKey: 'test-key' });
  const extra = ['-p', 'a prompt with spaces', '--', '--help', '-d', 'a"b', 'a&b', '%PATH%', '$(echo secret)'];
  const result = f.run([cliPath, 'demo', '-d', ...extra]);
  assert.equal(result.status, 0, result.stderr);
  const launch = captured(f);
  assert.deepEqual(launch.args.slice(2), [
    '--dangerously-skip-permissions', ...extra.filter((arg) => arg !== '--'),
  ]);
  if (process.platform !== 'win32') assert.equal(launch.mode, 0o600);
  assert.equal(fs.existsSync(launch.settingsPath), false);
});

test('failed child startup cleans up temporary settings', (t) => {
  const f = fixture(t);
  f.write('.ccc/profiles/demo.json', { type: 'claude', apiKey: 'test-key' });
  const result = f.run([cliPath, 'demo']);
  assert.equal(result.status, 1, result.stderr);
  assert.deepEqual(fs.readdirSync(path.join(f.home, '.ccc/tmp')), []);
});

test('a child terminated by signal is reported as failure and temp settings are removed', {
  skip: process.platform === 'win32',
}, (t) => {
  const f = fixture(t);
  f.fakeCli('claude', captureClaude + "process.kill(process.pid, 'SIGTERM');");
  f.write('.ccc/profiles/demo.json', { type: 'claude', apiKey: 'test-key' });
  const result = f.run([cliPath, 'demo']);
  assert.equal(result.status, 143, result.stderr);
  assert.equal(fs.existsSync(captured(f).settingsPath), false);
});

test('termination of the launcher is forwarded to the child', {
  skip: process.platform === 'win32',
}, async (t) => {
  const f = fixture(t);
  f.fakeCli('claude', captureClaude + "process.stdout.write('CHILD_READY'); setInterval(() => {}, 1000);");
  f.write('.ccc/profiles/demo.json', { type: 'claude', apiKey: 'test-key' });
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, 'demo'], {
      cwd: repoRoot, env: f.env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000,
    });
    let output = '';
    child.stdout.on('data', (data) => {
      output += data;
      if (output.includes('CHILD_READY')) child.kill('SIGTERM');
    });
    child.on('error', reject);
    child.on('close', (code) => code === 143 ? resolve() : reject(new Error(`child exited ${code}`)));
  });
  assert.equal(fs.existsSync(captured(f).settingsPath), false);
});

test('legacy settings profiles launch with their overrides and remain unchanged on disk', (t) => {
  const f = fixture(t);
  f.fakeCli('claude', captureClaude + 'process.exit(42);');
  const legacy = {
    env: { ANTHROPIC_AUTH_TOKEN: 'test-key', ANTHROPIC_BASE_URL: 'https://example.test', ANTHROPIC_MODEL: 'legacy-model' },
    model: 'legacy-model', permissions: { allow: ['Read'] }, skipWebFetchPreflight: false,
  };
  const source = f.write('.ccc/profiles/legacy.json', legacy);
  const result = f.run([cliPath, 'legacy']);
  assert.equal(result.status, 42, result.stderr);
  const settings = captured(f).settings;
  assert.equal(settings.env.ANTHROPIC_MODEL, 'legacy-model');
  assert.equal(settings.model, 'legacy-model');
  assert.equal(settings.skipWebFetchPreflight, false);
  assert.deepEqual(settings.permissions, legacy.permissions);
  assert.deepEqual(JSON.parse(fs.readFileSync(source, 'utf8')), legacy);
  assert.equal(fs.existsSync(captured(f).settingsPath), false);
});

test('simultaneous launches of the same profile use separate settings files', async (t) => {
  const f = fixture(t);
  f.fakeCli('claude', captureClaude + 'setTimeout(() => {}, 200);');
  f.write('.ccc/profiles/demo.json', { type: 'claude', apiKey: 'test-key' });
  const captures = [path.join(f.home, 'one.json'), path.join(f.home, 'two.json')];
  await Promise.all(captures.map((capture) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, 'demo'], {
      cwd: repoRoot, env: { ...f.env, CCC_CAPTURE: capture }, stdio: 'ignore', timeout: 10000,
    });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`child exited ${code}`)));
  })));
  const [a, b] = captures.map((p) => JSON.parse(fs.readFileSync(p, 'utf8')));
  assert.notEqual(a.settingsPath, b.settingsPath);
  assert.equal(fs.existsSync(a.settingsPath), false);
  assert.equal(fs.existsSync(b.settingsPath), false);
});

test('apply preserves global settings and the DeepSeek model when merging profile overrides', (t) => {
  const f = fixture(t);
  const target = f.write('.claude/settings.json', {
    env: { KEEP: 'yes', ANTHROPIC_MODEL: 'global-model' },
    permissions: { allow: ['Read'], deny: ['Bash(rm:*)'] },
    skipWebFetchPreflight: false,
  });
  f.write('.ccc/profiles/deep.json', {
    type: 'deepseek', apiKey: 'test-key', model: 'deepseek-reasoner',
    settings: { env: { EXTRA: 'yes' }, permissions: { allow: ['Glob'] } },
  });
  const result = f.run([cliPath, 'apply', 'deep'], 'y\n');
  assert.equal(result.status, 0, result.stderr);
  const settings = JSON.parse(fs.readFileSync(target, 'utf8'));
  assert.equal(settings.env.ANTHROPIC_AUTH_TOKEN, 'test-key');
  assert.equal(settings.env.ANTHROPIC_MODEL, 'deepseek-reasoner');
  assert.equal(settings.env.KEEP, 'yes');
  assert.equal(settings.env.EXTRA, 'yes');
  assert.deepEqual(settings.permissions, { allow: ['Glob'], deny: ['Bash(rm:*)'] });
  assert.equal(settings.skipWebFetchPreflight, false);
});

test('apply refuses to overwrite invalid global JSON', (t) => {
  const f = fixture(t);
  const contents = '{ "permissions": invalid';
  const target = f.write('.claude/settings.json', contents);
  f.write('.ccc/profiles/demo.json', { type: 'claude', apiKey: 'test-key' });
  const result = f.run([cliPath, 'apply', 'demo'], 'y\n');
  assert.equal(result.status, 1);
  assert.equal(fs.readFileSync(target, 'utf8'), contents);
});

test('launch refuses invalid global settings without starting the child', (t) => {
  const f = fixture(t);
  f.fakeCli('claude', captureClaude);
  f.write('.ccc/profiles/demo.json', { type: 'claude', apiKey: 'test-key' });
  for (const contents of ['null', '[]', '{ invalid']) {
    f.write('.claude/settings.json', contents);
    const result = f.run([cliPath, 'demo']);
    assert.equal(result.status, 1);
    assert.equal(fs.existsSync(f.env.CCC_CAPTURE), false);
  }
});

test('applying an old Codex profile corrects the target without rewriting the source', (t) => {
  const f = fixture(t);
  f.write('.ccc/codex-profiles/demo/auth.json', { OPENAI_API_KEY: 'test-key' });
  const original = '# Codex profile managed by ccc\n[analytics]\nenabled = false\nmodel = "test-model"\n';
  const source = f.write('.ccc/codex-profiles/demo/config.toml', original);
  const result = f.run([cliPath, 'apply', 'demo'], 'y\n');
  assert.equal(result.status, 0, result.stderr);
  const target = fs.readFileSync(path.join(f.home, '.codex/config.toml'), 'utf8');
  assert.match(target.split(/^\s*\[/m)[0], /^model = "test-model"$/m);
  assert.equal(fs.readFileSync(source, 'utf8'), original);
});

test('Codex generated model and provider are root keys, with escaped TOML strings', (t) => {
  const f = fixture(t);
  const result = f.run(['--input-type=module', '-e', `
    import { generateCodexConfigToml } from './src/store.js';
    console.log(generateCodexConfigToml('https://example.test/v1', 'model"name'));
  `]);
  assert.equal(result.status, 0, result.stderr);
  const root = result.stdout.split(/^\s*\[/m)[0];
  assert.match(root, /^model = "model\\"name"$/m);
  assert.match(root, /^model_provider = "ccc_openai"$/m);
  assert.match(result.stdout, /^\[analytics\]\nenabled = false$/m);
});

test('Codex launch repairs old misplaced root keys without losing other tables', (t) => {
  const f = fixture(t);
  f.fakeCli('codex', `
    require('node:fs').writeFileSync(process.env.CCC_CAPTURE, JSON.stringify({
      args: process.argv.slice(2), home: process.env.CODEX_HOME, key: process.env.OPENAI_API_KEY,
    }));
  `);
  f.write('.ccc/codex-profiles/demo/auth.json', { auth_mode: 'apikey', OPENAI_API_KEY: 'test-key' });
  const target = f.write('.ccc/codex-profiles/demo/config.toml', `# Codex profile managed by ccc
[analytics]
enabled = false
model = "test-model"
model_provider = "ccc_openai"

[model_providers.ccc_openai]
name = "OpenAI Compatible"
base_url = "https://example.test/v1"
env_key = "OPENAI_API_KEY"
wire_api = "responses"

[mcp_servers.demo]
command = "demo-server"
`);
  const result = f.run([cliPath, 'demo', '-d', 'exec', 'test prompt']);
  assert.equal(result.status, 0, result.stderr);
  const toml = fs.readFileSync(target, 'utf8');
  const root = toml.split(/^\s*\[/m)[0];
  assert.match(root, /^model = "test-model"$/m);
  assert.match(root, /^model_provider = "ccc_openai"$/m);
  assert.match(toml, /\[mcp_servers.demo\]\ncommand = "demo-server"/);
  assert.deepEqual(captured(f).args, ['--dangerously-bypass-approvals-and-sandbox', 'exec', 'test prompt']);
  assert.equal(captured(f).key, 'test-key');
  assert.equal(f.run([cliPath, 'demo']).status, 0);
  assert.equal(fs.readFileSync(target, 'utf8'), toml, 'migration must be idempotent');
});

test('Codex profile edits combine upstream preservation with analytics repair and string escaping', (t) => {
  const f = fixture(t);
  f.write('.ccc/codex-profiles/demo/auth.json', { OPENAI_API_KEY: 'old-key' });
  f.write('.ccc/codex-profiles/demo/config.toml', [
    '# Codex profile managed by ccc', 'model_reasoning_effort = "high"',
    '[analytics]', 'enabled = false', 'model = "old-model"', 'model_provider = "ccc_openai"',
    '[model_providers.ccc_openai]', 'base_url = "https://old.example.test/v1"',
    '[mcp_servers.demo]', 'command = "demo-server"', '',
  ].join('\n'));
  const model = 'custom"model\\id';
  const result = f.run(['--input-type=module', '-e', `
    import * as store from './src/store.js';
    import { readTomlString } from './src/codex-config.js';
    store.updateCodexProfile('demo', 'new-key', 'https://new.example.test/v1', ${JSON.stringify(model)});
    const profile = store.readCodexProfile('demo');
    console.log(JSON.stringify({ ...profile, model: readTomlString(profile.configToml, 'model') }));
  `]);
  assert.equal(result.status, 0, result.stderr);
  const profile = JSON.parse(result.stdout);
  assert.equal(profile.model, model);
  assert.equal(profile.auth.OPENAI_API_KEY, 'new-key');
  assert.equal((profile.configToml.match(/^model =/gm) || []).length, 1);
  assert.match(profile.configToml.split(/^\s*\[/m)[0], /^model_provider = "ccc_openai"$/m);
  assert.match(profile.configToml, /^model_reasoning_effort = "high"$/m);
  assert.match(profile.configToml, /\[mcp_servers.demo\]\ncommand = "demo-server"/);
  assert.match(profile.configToml, /^base_url = "https:\/\/new.example.test\/v1"$/m);
});
