import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse as parseToml } from 'smol-toml';
import { getCodexModelOverride, parseInvocation } from '../src/args.js';
import { applyClaudeDefaults } from '../src/claude-settings.js';
import { buildClaudeSettings } from '../src/claude.js';
import { buildClaudeEnv } from '../src/env.js';
import { OPENAI_MODEL_CATALOG } from '../src/models.js';
import { generateCodexConfigToml } from '../src/store.js';
import {
  revertLeakedCccCodexProvider,
  stripCccCodexProvider,
} from '../src/codex-native.js';

const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, 'index.js');

function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccc-test-'));
  const home = path.join(root, 'home');
  const bin = path.join(root, 'bin');
  const codexHome = path.join(root, 'codex-home');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true });
  installFakeCli(bin, 'claude');
  installFakeCli(bin, 'codex');
  return { root, home, bin, codexHome };
}

function cleanupSandbox(sandbox) {
  fs.rmSync(sandbox.root, { recursive: true, force: true });
}

function fakeCliSource(command) {
  return `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log(${JSON.stringify(`${command}-test 1.0.0`)});
  process.exit(0);
}
let settings = null;
const settingsIndex = args.indexOf('--settings');
if (settingsIndex >= 0 && args[settingsIndex + 1]) {
  settings = JSON.parse(fs.readFileSync(args[settingsIndex + 1], 'utf8'));
}
const payload = {
  command: ${JSON.stringify(command)},
  args,
  settings,
  settingsPath: settingsIndex >= 0 ? args[settingsIndex + 1] : null,
  env: {
    CODEX_HOME: process.env.CODEX_HOME || null,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || null,
    CCC_OPENAI_API_KEY: process.env.CCC_OPENAI_API_KEY || null,
    ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN || null,
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || null
  }
};
if (process.env.CCC_FAKE_PERSIST_PROVIDER && process.env.CODEX_HOME) {
  const path = require('node:path');
  const file = path.join(process.env.CODEX_HOME, 'config.toml');
  let existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (!/^model_provider\\s*=/m.test(existing)) {
    existing = 'model_provider = "ccc_openai"\\n' + existing;
  }
  if (!existing.includes('[model_providers.ccc_openai]')) {
    existing = existing.trimEnd() + '\\n\\n[model_providers.ccc_openai]\\nenv_key = "OPENAI_API_KEY"\\n';
  }
  fs.writeFileSync(file, existing);
}
if (process.env.CCC_CAPTURE) fs.writeFileSync(process.env.CCC_CAPTURE, JSON.stringify(payload));
process.exit(Number(process.env.CCC_FAKE_EXIT || 0));
`;
}

function installFakeCli(bin, command) {
  if (process.platform === 'win32') {
    const script = path.join(bin, `${command}.cjs`);
    fs.writeFileSync(script, fakeCliSource(command));
    fs.writeFileSync(
      path.join(bin, `${command}.cmd`),
      `@echo off\r\n"${process.execPath}" "%~dp0\\${command}.cjs" %*\r\n`,
    );
  } else {
    const script = path.join(bin, command);
    fs.writeFileSync(script, fakeCliSource(command), { mode: 0o755 });
  }
}

function sandboxEnv(sandbox, extra = {}) {
  return {
    ...process.env,
    HOME: sandbox.home,
    USERPROFILE: sandbox.home,
    CODEX_HOME: sandbox.codexHome,
    PATH: `${sandbox.bin}${path.delimiter}${process.env.PATH}`,
    NO_COLOR: '1',
    TERM: 'dumb',
    ...extra,
  };
}

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    env: options.env || process.env,
    encoding: 'utf8',
    input: options.input,
    timeout: options.timeout || 15000,
  });
}

function runInline(sandbox, source) {
  return runNode(['--input-type=module', '-e', source], { env: sandboxEnv(sandbox) });
}

function runCli(sandbox, args, options = {}) {
  const capturePath = path.join(sandbox.root, `capture-${Date.now()}-${Math.random()}.json`);
  const result = runNode([cliPath, ...args], {
    env: sandboxEnv(sandbox, { CCC_CAPTURE: capturePath, ...(options.env || {}) }),
    input: options.input,
    timeout: options.timeout,
  });
  return {
    ...result,
    capture: fs.existsSync(capturePath) ? JSON.parse(fs.readFileSync(capturePath, 'utf8')) : null,
  };
}

function createProfiles(sandbox) {
  const result = runInline(sandbox, [
    "import * as store from './src/store.js';",
    "store.saveClaudeProfile('cl', { apiUrl: 'https://gateway.example.invalid', apiKey: 'claude-secret', model: 'fable' });",
    "store.saveClaudeProfile('deep', { type: 'deepseek', apiUrl: 'https://api.deepseek.com/anthropic', apiKey: 'deep-secret', model: 'deepseek-reasoner' });",
    "store.createCodexProfile('cx', 'codex-secret', 'https://codex.example.invalid/v1', 'gpt-5.6-terra');",
  ].join(' '));
  assert.equal(result.status, 0, result.stderr);
}

function writeModelCatalog(file, modelIds) {
  fs.writeFileSync(file, JSON.stringify({
    models: modelIds.map((slug) => ({ slug })),
  }));
}

test('legacy Claude profiles keep top-level settings during parsing', () => {
  const sandbox = makeSandbox();
  try {
    const profilesDir = path.join(sandbox.home, '.ccc', 'profiles');
    fs.mkdirSync(profilesDir, { recursive: true });
    fs.writeFileSync(path.join(profilesDir, 'legacy.json'), JSON.stringify({
      env: {
        ANTHROPIC_AUTH_TOKEN: 'token',
        ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
        FOO: 'bar',
      },
      model: 'claude-sonnet-4',
      permissions: { allow: ['Bash(ls:*)'] },
    }));
    const result = runInline(sandbox,
      "import * as store from './src/store.js'; console.log(JSON.stringify(store.readClaudeProfile('legacy')));");
    assert.equal(result.status, 0, result.stderr);
    const profile = JSON.parse(result.stdout.trim());
    assert.equal(profile.apiKey, 'token');
    assert.equal(profile.model, 'claude-sonnet-4');
    assert.deepEqual(profile.env, { FOO: 'bar' });
    assert.deepEqual(profile.settings.permissions, { allow: ['Bash(ls:*)'] });
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('new profiles use versioned private storage and non-TTY secrets', () => {
  const sandbox = makeSandbox();
  try {
    const result = runCli(sandbox, ['new', 'demo'], {
      input: 'https://api.anthropic.com\nsecret-key\n\n',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /secret-key/);
    const file = path.join(sandbox.home, '.ccc', 'profiles', 'demo.json');
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(saved.schemaVersion, 2);
    assert.equal(saved.apiKey, 'secret-key');
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(path.join(sandbox.home, '.ccc')).mode & 0o777, 0o700);
      assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    }
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('exact profile names win and partial numeric strings do not resolve', () => {
  const sandbox = makeSandbox();
  try {
    const result = runInline(sandbox, [
      "import * as store from './src/store.js';",
      "store.saveClaudeProfile('2', { apiUrl: 'u', apiKey: 'k' });",
      "store.saveClaudeProfile('a', { apiUrl: 'u', apiKey: 'k' });",
      "console.log(JSON.stringify([store.resolveProfile('2'), store.resolveProfile('2abc')]));",
    ].join(' '));
    assert.equal(result.status, 0, result.stderr);
    const [exact, partial] = JSON.parse(result.stdout.trim());
    assert.equal(exact.name, '2');
    assert.equal(partial, null);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('Codex TOML keeps model and provider at the root', () => {
  const parsed = parseToml(generateCodexConfigToml('https://example.com/v1', 'gpt-5.6-sol'));
  assert.equal(parsed.model, 'gpt-5.6-sol');
  assert.equal(parsed.model_provider, 'ccc_openai');
  assert.equal(parsed.model_providers.ccc_openai.base_url, 'https://example.com/v1');
  assert.equal(parsed.analytics, undefined);
});

test('WebFetch preflight default is scoped to custom Claude endpoints', () => {
  assert.deepEqual(
    applyClaudeDefaults({}, { apiUrl: 'https://gateway.example.invalid' }),
    { skipWebFetchPreflight: true },
  );
  assert.deepEqual(
    applyClaudeDefaults({}, { apiUrl: 'https://api.anthropic.com' }),
    {},
  );
  assert.deepEqual(
    applyClaudeDefaults({ skipWebFetchPreflight: false }, { apiUrl: 'https://gateway.example.invalid' }),
    { skipWebFetchPreflight: false },
  );
});

test('Claude profile model isolates inherited settings and environment overrides', () => {
  const settings = buildClaudeSettings({
    apiUrl: 'https://gateway.example.invalid',
    apiKey: 'profile-key',
    model: '',
  }, {
    model: 'main-settings-model',
    env: { ANTHROPIC_MODEL: 'settings-env-model', FOO: 'keep' },
  });
  assert.equal(settings.model, undefined);
  assert.equal(settings.env.ANTHROPIC_MODEL, '');
  assert.equal(settings.env.FOO, 'keep');

  const previous = process.env.ANTHROPIC_MODEL;
  process.env.ANTHROPIC_MODEL = 'process-env-model';
  try {
    const env = buildClaudeEnv({ apiUrl: 'https://gateway.example.invalid', apiKey: 'profile-key' });
    assert.equal(env.ANTHROPIC_MODEL, '');
  } finally {
    if (previous === undefined) delete process.env.ANTHROPIC_MODEL;
    else process.env.ANTHROPIC_MODEL = previous;
  }
});

test('argument parser preserves passthrough order and consumes only CCC dangerous flags', () => {
  assert.deepEqual(
    parseInvocation(['cx', '-d', '-c', 'x=1', '-c', 'y=2', '-C', '/a b', 'prompt']),
    {
      kind: 'launch',
      profile: 'cx',
      dangerous: true,
      args: ['-c', 'x=1', '-c', 'y=2', '-C', '/a b', 'prompt'],
    },
  );
  assert.deepEqual(
    parseInvocation(['cl', '--', '-d', 'api']),
    { kind: 'launch', profile: 'cl', dangerous: false, args: ['--', '-d', 'api'] },
  );
  assert.equal(parseInvocation(['cl', '--help']).args[0], '--help');
  assert.equal(getCodexModelOverride(['-m', 'first', '--model=last']), 'last');
  assert.equal(getCodexModelOverride(['--', '-m', 'literal']), null);
});

test('Claude launch forwards arguments, honors -d and removes runtime settings', () => {
  const sandbox = makeSandbox();
  try {
    createProfiles(sandbox);
    const result = runCli(sandbox, [
      'cl', '-d', '--debug', 'api', '--model', 'sonnet5', '-p', 'hello world', '--add-dir', '/tmp/a b',
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.deepEqual(result.capture.args.slice(2), [
      '--dangerously-skip-permissions', '--debug', 'api', '--model', 'sonnet5',
      '-p', 'hello world', '--add-dir', '/tmp/a b',
    ]);
    assert.equal(result.capture.settings.env.ANTHROPIC_AUTH_TOKEN, 'claude-secret');
    assert.equal(result.capture.settings.skipWebFetchPreflight, true);
    assert.equal(fs.existsSync(result.capture.settingsPath), false);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('Claude option separator is forwarded without enabling full access', () => {
  const sandbox = makeSandbox();
  try {
    createProfiles(sandbox);
    const result = runCli(sandbox, ['cl', '--', '-d', 'api']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.deepEqual(result.capture.args.slice(2), ['--model', 'fable', '--', '-d', 'api']);
    assert.doesNotMatch(result.stdout, /Permission checks are disabled/);

    const literalModel = runCli(sandbox, ['cl', '--', '--model']);
    assert.equal(literalModel.status, 0, literalModel.stderr);
    assert.deepEqual(literalModel.capture.args.slice(2), ['--model', 'fable', '--', '--model']);

    const dangerous = runCli(sandbox, ['cl', '-d', '--', 'prompt']);
    assert.equal(dangerous.status, 0, dangerous.stderr);
    assert.deepEqual(dangerous.capture.args.slice(2), [
      '--model', 'fable', '--dangerously-skip-permissions', '--', 'prompt',
    ]);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('Codex launch shares CODEX_HOME, injects provider, forwards repeats and maps -d', () => {
  const sandbox = makeSandbox();
  try {
    createProfiles(sandbox);
    const result = runCli(sandbox, [
      'cx', '-d', '-m', 'gpt-5.6-luna', '-C', '/tmp/a b', '-c', 'x=1', '-c', 'y=2', 'fix it',
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(result.capture.env.CODEX_HOME, sandbox.codexHome);
    assert.equal(result.capture.env.OPENAI_API_KEY, 'codex-secret');
    assert.equal(result.capture.env.CCC_OPENAI_API_KEY, 'codex-secret');
    assert.ok(result.capture.args.includes('model_provider="ccc_openai"'));
    assert.ok(result.capture.args.includes('model_providers.ccc_openai.base_url="https://codex.example.invalid/v1"'));
    assert.ok(result.capture.args.includes('model_providers.ccc_openai.env_key="CCC_OPENAI_API_KEY"'));
    assert.ok(result.capture.args.includes('model_providers.ccc_openai.requires_openai_auth=false'));
    assert.deepEqual(result.capture.args.slice(-10), [
      '--dangerously-bypass-approvals-and-sandbox',
      '-m', 'gpt-5.6-luna', '-C', '/tmp/a b', '-c', 'x=1', '-c', 'y=2', 'fix it',
    ]);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('Codex launch blocks a stale native catalog and honors the CLI model override', () => {
  const sandbox = makeSandbox();
  try {
    createProfiles(sandbox);
    const catalogName = 'model-catalog.gpt-5.5.json';
    writeModelCatalog(path.join(sandbox.codexHome, catalogName), ['gpt-5.5']);
    fs.writeFileSync(
      path.join(sandbox.codexHome, 'config.toml'),
      `model_catalog_json = "${catalogName}"\n`,
    );

    const blocked = runCli(sandbox, ['cx']);
    assert.equal(blocked.status, 1);
    assert.equal(blocked.capture, null);
    assert.match(blocked.stderr, /catalog conflict.*gpt-5\.6-terra/i);
    assert.match(blocked.stderr, /ccc apply cx --yes/);

    const compatibleOverride = runCli(sandbox, ['cx', '-m', 'gpt-5.5']);
    assert.equal(compatibleOverride.status, 0, compatibleOverride.stderr);
    assert.deepEqual(compatibleOverride.capture.args.slice(-2), ['-m', 'gpt-5.5']);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('DeepSeek profile model is passed to Claude instead of being blanked', () => {
  const sandbox = makeSandbox();
  try {
    createProfiles(sandbox);
    const result = runCli(sandbox, ['deep']);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.capture.args.slice(2), ['--model', 'deepseek-reasoner']);
    assert.equal(result.capture.settings.env.ANTHROPIC_AUTH_TOKEN, 'deep-secret');
    assert.notEqual(result.capture.settings.env.ANTHROPIC_MODEL, '');
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('OpenAI fallback catalog contains all requested model IDs', () => {
  const ids = new Set(OPENAI_MODEL_CATALOG.map((model) => model.id));
  for (const id of [
    'gpt-5.3-codex-spark', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.5',
    'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'codex-auto-review',
    'gpt-image-1.5', 'gpt-image-2',
  ]) assert.ok(ids.has(id), id);
});

test('model cache does not persist endpoint or API key credentials', () => {
  const sandbox = makeSandbox();
  try {
    const result = runInline(sandbox, [
      "globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: [{ id: 'remote-model' }] }) });",
      "const { discoverModels } = await import('./src/models.js');",
      "await discoverModels({ type: 'codex', baseUrl: 'https://gateway.example.invalid/v1?api_key=query-secret', apiKey: 'header-secret', refresh: true });",
    ].join(' '));
    assert.equal(result.status, 0, result.stderr);
    const cacheDir = path.join(sandbox.home, '.ccc', 'cache', 'models');
    const files = fs.readdirSync(cacheDir);
    assert.equal(files.length, 1);
    const cached = fs.readFileSync(path.join(cacheDir, files[0]), 'utf8');
    assert.doesNotMatch(cached, /query-secret|header-secret|gateway\.example/);
    assert.match(cached, /remote-model/);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('model command can explicitly restore the upstream default', () => {
  const sandbox = makeSandbox();
  try {
    createProfiles(sandbox);
    const changed = runCli(sandbox, ['model', 'cx', 'default']);
    assert.equal(changed.status, 0, changed.stderr);
    const result = runInline(sandbox,
      "import * as store from './src/store.js'; console.log(JSON.stringify(store.readCodexProfileData('cx')));");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).model, '');
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('model command warns when the native catalog does not contain the new model', () => {
  const sandbox = makeSandbox();
  try {
    createProfiles(sandbox);
    const catalogName = 'model-catalog.gpt-5.5.json';
    writeModelCatalog(path.join(sandbox.codexHome, catalogName), ['gpt-5.5']);
    fs.writeFileSync(
      path.join(sandbox.codexHome, 'config.toml'),
      `model_catalog_json = "${catalogName}"\n`,
    );

    const changed = runCli(sandbox, ['model', 'cx', 'gpt-5.6-sol']);
    assert.equal(changed.status, 0, changed.stderr);
    assert.match(changed.stdout, /catalog conflict.*gpt-5\.6-sol/i);
    assert.match(changed.stdout, /ccc apply cx --yes/);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('v2 Codex migration removes duplicate legacy credentials but preserves sessions', () => {
  const sandbox = makeSandbox();
  try {
    const legacy = path.join(sandbox.home, '.ccc', 'codex-profiles', 'legacy');
    fs.mkdirSync(path.join(legacy, 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(legacy, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'old-secret' }));
    fs.writeFileSync(path.join(legacy, 'config.toml'), 'model = "old-model"\n');
    fs.writeFileSync(path.join(legacy, 'sessions', 'keep.jsonl'), '{}\n');
    const result = runInline(sandbox, [
      "import * as store from './src/store.js';",
      "store.saveCodexProfileData('legacy', { apiKey: 'new-secret', apiUrl: 'https://example.invalid/v1', model: 'gpt-5.5', model_catalog_json: 'stale.json' });",
    ].join(' '));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(legacy, 'auth.json')), false);
    assert.equal(fs.existsSync(path.join(legacy, 'config.toml')), false);
    assert.equal(fs.existsSync(path.join(legacy, 'sessions', 'keep.jsonl')), true);
    const unifiedPath = path.join(sandbox.home, '.ccc', 'profiles', 'legacy.json');
    assert.equal(fs.existsSync(unifiedPath), true);
    assert.equal(JSON.parse(fs.readFileSync(unifiedPath, 'utf8')).model_catalog_json, undefined);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('apply backs up, merges atomically and rolls back Codex config', () => {
  const sandbox = makeSandbox();
  try {
    createProfiles(sandbox);
    const authPath = path.join(sandbox.codexHome, 'auth.json');
    const configPath = path.join(sandbox.codexHome, 'config.toml');
    const oldAuth = '{"auth_mode":"chatgpt","other":"keep"}\n';
    const catalogName = 'model-catalog.gpt-5.5.json';
    writeModelCatalog(path.join(sandbox.codexHome, catalogName), ['gpt-5.5']);
    const oldConfig = `theme = "dark"\nmodel_catalog_json = "${catalogName}"\n`;
    fs.writeFileSync(authPath, oldAuth);
    fs.writeFileSync(configPath, oldConfig);

    const applied = runCli(sandbox, ['apply', 'cx', '--yes']);
    assert.equal(applied.status, 0, applied.stderr);
    const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    const config = parseToml(fs.readFileSync(configPath, 'utf8'));
    assert.equal(auth.OPENAI_API_KEY, 'codex-secret');
    assert.equal(auth.auth_mode, 'apikey');
    assert.equal(auth.other, 'keep');
    assert.equal(config.theme, 'dark');
    assert.equal(config.model, 'gpt-5.6-terra');
    assert.equal(config.model_provider, 'ccc_openai');
    assert.equal(config.model_providers.ccc_openai.requires_openai_auth, true);
    assert.equal(config.model_providers.ccc_openai.env_key, undefined);
    assert.equal(config.model_catalog_json, undefined);
    assert.match(applied.stdout, /model_catalog_json will be removed/);
    if (process.platform !== 'win32') assert.equal(fs.statSync(authPath).mode & 0o777, 0o600);

    const rolledBack = runCli(sandbox, ['apply', '--rollback', '--yes']);
    assert.equal(rolledBack.status, 0, rolledBack.stderr);
    assert.equal(fs.readFileSync(authPath, 'utf8'), oldAuth);
    assert.equal(fs.readFileSync(configPath, 'utf8'), oldConfig);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('apply preserves a custom catalog that contains the profile model', () => {
  const sandbox = makeSandbox();
  try {
    createProfiles(sandbox);
    const catalogName = 'custom-model-catalog.json';
    writeModelCatalog(path.join(sandbox.codexHome, catalogName), ['gpt-5.6-terra']);
    fs.writeFileSync(path.join(sandbox.codexHome, 'auth.json'), '{}\n');
    fs.writeFileSync(
      path.join(sandbox.codexHome, 'config.toml'),
      `model_catalog_json = "${catalogName}"\n`,
    );

    const applied = runCli(sandbox, ['apply', 'cx', '--yes']);
    assert.equal(applied.status, 0, applied.stderr);
    const config = parseToml(fs.readFileSync(path.join(sandbox.codexHome, 'config.toml'), 'utf8'));
    assert.equal(config.model_catalog_json, catalogName);
    assert.doesNotMatch(applied.stdout, /model_catalog_json will be removed/);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('apply --restore-native unpins CCC without rewriting unrelated Codex config', () => {
  const sandbox = makeSandbox();
  try {
    const configPath = path.join(sandbox.codexHome, 'config.toml');
    fs.writeFileSync(configPath, [
      '# Codex profile managed by ccc',
      '# keep this comment',
      'model = "gpt-6-astra"',
      'model_provider = "ccc_openai"',
      'theme = "dark"',
      '',
      '[model_providers.ccc_openai]',
      'name = "OpenAI Compatible"',
      'base_url = "https://gateway.example.invalid/v1"',
      'env_key = "OPENAI_API_KEY"',
      '',
      '[projects."/tmp/x"]',
      'trust_level = "trusted"',
      '',
    ].join('\n'));

    const result = runCli(sandbox, ['apply', '--restore-native', '--yes']);
    assert.equal(result.status, 0, result.stderr);
    const restored = fs.readFileSync(configPath, 'utf8');
    assert.match(restored, /# keep this comment/);
    assert.match(restored, /theme = "dark"/);
    assert.match(restored, /\[projects\."\/tmp\/x"\]/);
    assert.doesNotMatch(restored, /model_provider/);
    assert.doesNotMatch(restored, /ccc_openai/);
    assert.doesNotMatch(restored, /managed by ccc/);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('Codex launch reverts a provider that Codex persisted into native config', () => {
  const sandbox = makeSandbox();
  try {
    createProfiles(sandbox);
    const configPath = path.join(sandbox.codexHome, 'config.toml');
    fs.writeFileSync(configPath, '# keep me\ntheme = "dark"\n\n[projects."/tmp/x"]\ntrust_level = "trusted"\n');
    const result = runCli(sandbox, ['cx'], { env: { CCC_FAKE_PERSIST_PROVIDER: '1' } });
    assert.equal(result.status, 0, result.stderr);
    const restored = fs.readFileSync(configPath, 'utf8');
    assert.match(restored, /# keep me/);
    assert.match(restored, /theme = "dark"/);
    assert.match(restored, /\[projects\."\/tmp\/x"\]/);
    assert.doesNotMatch(restored, /model_provider/);
    assert.doesNotMatch(restored, /ccc_openai/);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('doctor fails when native Codex is pinned to ccc_openai without the env key', () => {
  const sandbox = makeSandbox();
  try {
    createProfiles(sandbox);
    fs.writeFileSync(path.join(sandbox.codexHome, 'config.toml'), [
      'model_provider = "ccc_openai"',
      '[model_providers.ccc_openai]',
      'env_key = "OPENAI_API_KEY"',
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(sandbox.codexHome, 'auth.json'), JSON.stringify({
      auth_mode: 'chatgpt',
      OPENAI_API_KEY: null,
      tokens: { access_token: 'tok', refresh_token: 'ref' },
    }));
    const result = runCli(sandbox, ['doctor', '--json'], { env: { OPENAI_API_KEY: '' } });
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    const check = report.checks.find((item) => item.label === 'Native Codex provider');
    assert.equal(check.status, 'fail');
    assert.match(check.detail, /restore-native/);
    assert.match(check.detail, /ChatGPT/);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('doctor warns when ChatGPT login is ignored because OPENAI_API_KEY is in the environment', () => {
  const sandbox = makeSandbox();
  try {
    createProfiles(sandbox);
    fs.writeFileSync(path.join(sandbox.codexHome, 'config.toml'), [
      'model_provider = "ccc_openai"',
      '[model_providers.ccc_openai]',
      'env_key = "OPENAI_API_KEY"',
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(sandbox.codexHome, 'auth.json'), JSON.stringify({
      auth_mode: 'chatgpt',
      OPENAI_API_KEY: null,
      tokens: { access_token: 'tok', refresh_token: 'ref' },
    }));
    const result = runCli(sandbox, ['doctor', '--json'], { env: { OPENAI_API_KEY: 'sk-env' } });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    const check = report.checks.find((item) => item.label === 'Native Codex provider');
    assert.equal(check.status, 'warn');
    assert.match(check.detail, /ChatGPT login is ignored/);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('stripCccCodexProvider and leak revert keep unrelated TOML intact', () => {
  const original = [
    '# keep me',
    'model = "gpt-6-astra"',
    'model_provider = "ccc_openai"',
    '',
    '[model_providers.ccc_openai]',
    'env_key = "OPENAI_API_KEY"',
    '',
    '[projects."/tmp/x"]',
    'trust_level = "trusted"',
    '',
  ].join('\n');
  const stripped = stripCccCodexProvider(original);
  assert.equal(stripped.changed, true);
  assert.match(stripped.next, /# keep me/);
  assert.match(stripped.next, /\[projects\."\/tmp\/x"\]/);
  assert.doesNotMatch(stripped.next, /ccc_openai|model_provider/);

  const unpinned = stripCccCodexProvider('\ntheme = "dark"\n');
  assert.equal(unpinned.changed, false);
  assert.equal(unpinned.next, '\ntheme = "dark"\n');

  const leaked = revertLeakedCccCodexProvider(original, { modelProvider: undefined, hasCccProvider: false });
  assert.equal(leaked.changed, true);
  assert.doesNotMatch(leaked.next, /ccc_openai|model_provider/);

  const applied = revertLeakedCccCodexProvider(original, {
    modelProvider: 'ccc_openai',
    hasCccProvider: true,
    cccProvider: { env_key: 'OPENAI_API_KEY' },
  });
  assert.equal(applied.changed, false);

  const mutated = [
    'model_provider = "ccc_openai"',
    '[model_providers.ccc_openai]',
    'name = "CCC OpenAI Compatible"',
    'base_url = "https://gateway.example.invalid/v1"',
    'env_key = "CCC_OPENAI_API_KEY"',
    'requires_openai_auth = false',
    '',
  ].join('\n');
  const restored = revertLeakedCccCodexProvider(mutated, {
    modelProvider: 'ccc_openai',
    hasCccProvider: true,
    cccProvider: {
      name: 'CCC OpenAI Compatible',
      base_url: 'https://gateway.example.invalid/v1',
      wire_api: 'responses',
      requires_openai_auth: true,
    },
  });
  assert.equal(restored.changed, true);
  const restoredProvider = parseToml(restored.next).model_providers.ccc_openai;
  assert.equal(restoredProvider.env_key, undefined);
  assert.equal(restoredProvider.requires_openai_auth, true);
  assert.equal(restoredProvider.wire_api, 'responses');
});

test('apply automatically restores earlier files when a later write fails', () => {
  const sandbox = makeSandbox();
  try {
    const result = runInline(sandbox, [
      "import fs from 'node:fs'; import path from 'node:path';",
      "const { executePlan } = await import('./src/commands/apply.js');",
      "const first = path.join(process.env.HOME, 'first.json');",
      "const blocker = path.join(process.env.HOME, 'not-a-directory');",
      "fs.writeFileSync(first, 'original'); fs.writeFileSync(blocker, 'blocker');",
      "let failed = false;",
      "try { executePlan({ name: 'test', type: 'codex' }, [{ target: first, label: 'first', content: 'changed' }, { target: path.join(blocker, 'second.json'), label: 'second', content: 'never-written' }]); } catch { failed = true; }",
      "if (!failed || fs.readFileSync(first, 'utf8') !== 'original') process.exit(2);",
    ].join(' '));
    assert.equal(result.status, 0, result.stderr);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('apply refuses to overwrite invalid Codex TOML', () => {
  const sandbox = makeSandbox();
  try {
    createProfiles(sandbox);
    const configPath = path.join(sandbox.codexHome, 'config.toml');
    fs.writeFileSync(path.join(sandbox.codexHome, 'auth.json'), '{}');
    fs.writeFileSync(configPath, 'broken = [\n');
    const before = fs.readFileSync(configPath, 'utf8');
    const result = runCli(sandbox, ['apply', 'cx', '--yes']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid TOML/);
    assert.equal(fs.readFileSync(configPath, 'utf8'), before);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('apply preview redacts unrelated existing token fields', () => {
  const sandbox = makeSandbox();
  try {
    createProfiles(sandbox);
    fs.writeFileSync(path.join(sandbox.codexHome, 'auth.json'), '{}');
    fs.writeFileSync(
      path.join(sandbox.codexHome, 'config.toml'),
      '[mcp_servers.demo.env]\nPRIVATE_TOKEN = "do-not-print-this"\n',
    );
    const result = runCli(sandbox, ['apply', 'cx', '--dry-run']);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /do-not-print-this/);
    assert.match(result.stdout, /<redacted>/);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('new command rejects unsupported profile types', () => {
  const sandbox = makeSandbox();
  try {
    const result = runCli(sandbox, ['new', 'bad-type', '--type', 'codxe']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unsupported profile type/);
    assert.equal(fs.existsSync(path.join(sandbox.home, '.ccc', 'profiles', 'bad-type.json')), false);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('new command rejects non-HTTP API URLs', () => {
  const sandbox = makeSandbox();
  try {
    const result = runCli(sandbox, [
      'new', 'bad', '--type', 'codex', '--url', 'file:///tmp/api',
      '--api-key-env', 'TEST_API_KEY',
    ], { env: { TEST_API_KEY: 'secret' } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must use http/);
    assert.equal(fs.existsSync(path.join(sandbox.home, '.ccc', 'profiles', 'bad.json')), false);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('show output redacts profile and extra environment secrets', () => {
  const sandbox = makeSandbox();
  try {
    const created = runInline(sandbox, [
      "import * as store from './src/store.js';",
      "store.saveClaudeProfile('secure', { apiUrl: 'https://example.invalid', apiKey: 'top-secret-key', env: { MY_SECRET: 'hidden-value', FOO: 'bar' } });",
    ].join(' '));
    assert.equal(created.status, 0, created.stderr);
    const result = runCli(sandbox, ['show', 'secure']);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /top-secret-key|hidden-value/);
    assert.match(result.stdout, /FOO/);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('doctor supports stable JSON output with stored profiles', () => {
  const sandbox = makeSandbox();
  try {
    createProfiles(sandbox);
    const result = runCli(sandbox, ['doctor', '--json']);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.codexHome, sandbox.codexHome);
    assert.ok(report.checks.some((check) => check.label === 'claude executable'));
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('doctor fails a Codex profile whose native catalog is stale', () => {
  const sandbox = makeSandbox();
  try {
    createProfiles(sandbox);
    const catalogName = 'model-catalog.gpt-5.5.json';
    writeModelCatalog(path.join(sandbox.codexHome, catalogName), ['gpt-5.5']);
    fs.writeFileSync(
      path.join(sandbox.codexHome, 'config.toml'),
      `model_catalog_json = "${catalogName}"\n`,
    );

    const result = runCli(sandbox, ['doctor', '--json']);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    const check = report.checks.find((item) => item.label === 'cx Codex config');
    assert.equal(check.status, 'fail');
    assert.match(check.detail, /missing model "gpt-5\.6-terra"/);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('help is script-friendly and documents current dangerous semantics', () => {
  const sandbox = makeSandbox();
  try {
    const result = runCli(sandbox, ['--help']);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /\x1b\[/);
    assert.match(result.stdout, /dangerously|disables Claude permissions/i);
    assert.doesNotMatch(result.stdout, /--full-auto/);
  } finally {
    cleanupSandbox(sandbox);
  }
});

test('published package allowlist excludes internal and secret-bearing artifacts', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.files, ['index.js', 'src/', 'README.md', 'LICENSE']);
  const sample = fs.readFileSync(path.join(repoRoot, 'settings-sample.json'), 'utf8');
  assert.match(sample, /not-a-real-key/);
  assert.doesNotMatch(sample, /https:\/\/wzw\./);
});
