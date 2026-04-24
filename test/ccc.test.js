import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, 'index.js');

function makeTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ccc-test-'));
}

function cleanupTempHome(home) {
  fs.rmSync(home, { recursive: true, force: true });
}

function runNode(args, options = {}) {
  const env = { ...process.env, ...options.env };
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    input: options.input,
  });
}

test('legacy Claude profiles keep top-level settings during parsing', () => {
  const home = makeTempHome();
  try {
    const profilesDir = path.join(home, '.ccc', 'profiles');
    fs.mkdirSync(profilesDir, { recursive: true });
    fs.writeFileSync(path.join(profilesDir, 'legacy.json'), JSON.stringify({
      env: {
        ANTHROPIC_AUTH_TOKEN: 'token',
        ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
        FOO: 'bar',
      },
      model: 'claude-sonnet-4',
      permissions: { allow: ['Bash(ls:*)'] },
    }, null, 2));

    const result = runNode([
      '--input-type=module',
      '-e',
      "import * as store from './src/store.js'; console.log(JSON.stringify(store.readClaudeProfile('legacy')));",
    ], {
      env: { HOME: home, USERPROFILE: home },
    });

    assert.equal(result.status, 0, result.stderr);
    const profile = JSON.parse(result.stdout.trim());
    assert.equal(profile.apiKey, 'token');
    assert.equal(profile.apiUrl, 'https://api.anthropic.com');
    assert.deepEqual(profile.env, { FOO: 'bar' });
    assert.equal(profile.settings.model, 'claude-sonnet-4');
    assert.deepEqual(profile.settings.permissions, { allow: ['Bash(ls:*)'] });
  } finally {
    cleanupTempHome(home);
  }
});

test('non-TTY new command consumes piped answers across multiple prompts', () => {
  const home = makeTempHome();
  try {
    const result = runNode([cliPath, 'new', 'demo'], {
      env: { HOME: home, USERPROFILE: home },
      input: 'https://api.anthropic.com\nsecret-key\n\n',
    });

    assert.equal(result.status, 0, result.stderr);
    const saved = JSON.parse(fs.readFileSync(path.join(home, '.ccc', 'profiles', 'demo.json'), 'utf8'));
    assert.equal(saved.apiUrl, 'https://api.anthropic.com');
    assert.equal(saved.apiKey, 'secret-key');
  } finally {
    cleanupTempHome(home);
  }
});

test('exact profile names win over numeric index resolution', () => {
  const home = makeTempHome();
  try {
    const result = runNode([
      '--input-type=module',
      '-e',
      [
        "import * as store from './src/store.js';",
        "store.ensureDirs();",
        "store.saveClaudeProfile('2', { apiUrl: 'u', apiKey: 'k' });",
        "store.saveClaudeProfile('a', { apiUrl: 'u', apiKey: 'k' });",
        "console.log(JSON.stringify(store.resolveProfile('2')));",
      ].join(' '),
    ], {
      env: { HOME: home, USERPROFILE: home },
    });

    assert.equal(result.status, 0, result.stderr);
    const resolved = JSON.parse(result.stdout.trim());
    assert.equal(resolved.name, '2');
  } finally {
    cleanupTempHome(home);
  }
});

test('Codex config uses analytics table expected by current codex-cli', () => {
  const result = runNode([
    '--input-type=module',
    '-e',
    [
      "import * as store from './src/store.js';",
      "console.log(store.generateCodexConfigToml('https://example.com/v1', 'gpt-5.4'));",
    ].join(' '),
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^model = "gpt-5.4"$/m);
  assert.match(result.stdout, /^model_provider = "ccc_openai"$/m);
  assert.ok(result.stdout.indexOf('model = "gpt-5.4"') < result.stdout.indexOf('[analytics]'));
  assert.ok(result.stdout.indexOf('model_provider = "ccc_openai"') < result.stdout.indexOf('[analytics]'));
  assert.match(result.stdout, /^\[analytics\]$/m);
  assert.match(result.stdout, /^enabled = false$/m);
  assert.doesNotMatch(result.stdout, /^analytics = false$/m);
  assert.doesNotMatch(result.stdout, /sandbox/i);
});

test('Codex config sanitizer removes sandbox settings', () => {
  const result = runNode([
    '--input-type=module',
    '-e',
    [
      "import * as store from './src/store.js';",
      "const input = 'model = \"gpt-5.4\"\\nsandbox_mode = \"danger-full-access\"\\n[windows]\\nsandbox = \"elevated\"\\n[analytics]\\nenabled = false\\n';",
      "console.log(store.sanitizeCodexConfigToml(input));",
    ].join(' '),
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^model = "gpt-5.4"$/m);
  assert.match(result.stdout, /^\[analytics\]$/m);
  assert.doesNotMatch(result.stdout, /sandbox/i);
  assert.doesNotMatch(result.stdout, /^\[windows\]$/m);
});

test('Codex profile updates preserve gpt-5.5 capability config', () => {
  const home = makeTempHome();
  try {
    const result = runNode([
      '--input-type=module',
      '-e',
      [
        "import fs from 'node:fs';",
        "import os from 'node:os';",
        "import path from 'node:path';",
        "import * as store from './src/store.js';",
        "const dir = path.join(os.homedir(), '.ccc', 'codex-profiles', 'demo');",
        "fs.mkdirSync(dir, { recursive: true });",
        "fs.writeFileSync(path.join(dir, 'auth.json'), JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: 'old-key' }, null, 2) + '\\n');",
        "fs.writeFileSync(path.join(dir, 'model-catalog.gpt-5.5.json'), '{}\\n');",
        "fs.writeFileSync(path.join(dir, 'config.toml'), 'model = \"gpt-5.5\"\\nmodel_provider = \"ccc_openai\"\\nmodel_reasoning_effort = \"xhigh\"\\nmodel_catalog_json = \\'.\\\\\\\\model-catalog.gpt-5.5.json\\'\\nsandbox_mode = \"danger-full-access\"\\n\\n[model_providers.ccc_openai]\\nname = \"OpenAI Compatible\"\\nbase_url = \"https://old.example/v1\"\\nrequires_openai_auth = true\\nwire_api = \"responses\"\\n\\n[projects.\\'C:\\\\\\\\repo\\']\\ntrust_level = \"trusted\"\\n\\n[windows]\\nsandbox = \"elevated\"\\n');",
        "store.updateCodexProfile('demo', 'new-key', 'https://new.example/v1', 'gpt-5.5');",
        "console.log(fs.readFileSync(path.join(dir, 'config.toml'), 'utf8'));",
      ].join(' '),
    ], {
      env: { HOME: home, USERPROFILE: home },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^model = "gpt-5.5"$/m);
    assert.match(result.stdout, /^model_reasoning_effort = "xhigh"$/m);
    assert.match(result.stdout, /^model_catalog_json = '\.\\model-catalog\.gpt-5\.5\.json'$/m);
    assert.match(result.stdout, /^base_url = "https:\/\/new\.example\/v1"$/m);
    assert.match(result.stdout, /^env_key = "OPENAI_API_KEY"$/m);
    assert.match(result.stdout, /^\[projects\.'C:\\\\repo'\]$/m);
    assert.doesNotMatch(result.stdout, /sandbox/i);
    assert.doesNotMatch(result.stdout, /requires_openai_auth/);
  } finally {
    cleanupTempHome(home);
  }
});

test('Codex support files copy to apply target', () => {
  const home = makeTempHome();
  try {
    const result = runNode([
      '--input-type=module',
      '-e',
      [
        "import fs from 'node:fs';",
        "import os from 'node:os';",
        "import path from 'node:path';",
        "import * as store from './src/store.js';",
        "const dir = path.join(os.homedir(), '.ccc', 'codex-profiles', 'demo');",
        "const target = path.join(os.homedir(), '.codex');",
        "fs.mkdirSync(dir, { recursive: true });",
        "fs.mkdirSync(target, { recursive: true });",
        "fs.writeFileSync(path.join(dir, 'model-catalog.gpt-5.5.json'), '{}\\n');",
        "store.copyCodexProfileSupportFiles('demo', target);",
        "console.log(fs.existsSync(path.join(target, 'model-catalog.gpt-5.5.json')));",
      ].join(' '),
    ], {
      env: { HOME: home, USERPROFILE: home },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'true');
  } finally {
    cleanupTempHome(home);
  }
});

test('Codex -d launches without sandbox and cleans old profile config', () => {
  const home = makeTempHome();
  try {
    const profileDir = path.join(home, '.ccc', 'codex-profiles', 'demo');
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(profileDir, 'auth.json'), JSON.stringify({
      auth_mode: 'apikey',
      OPENAI_API_KEY: 'test-key',
    }, null, 2) + '\n');
    fs.writeFileSync(path.join(profileDir, 'config.toml'), [
      'model = "gpt-5.4"',
      'sandbox_mode = "danger-full-access"',
      '[windows]',
      'sandbox = "elevated"',
      '[analytics]',
      'enabled = false',
      '',
    ].join('\n'));

    const binDir = path.join(home, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    if (process.platform === 'win32') {
      fs.writeFileSync(path.join(binDir, 'codex.cmd'), '@echo off\r\necho %*\r\nexit /b 0\r\n');
    } else {
      const fakeCodex = path.join(binDir, 'codex');
      fs.writeFileSync(fakeCodex, '#!/bin/sh\nprintf "%s\\n" "$*"\n');
      fs.chmodSync(fakeCodex, 0o755);
    }

    const result = runNode([cliPath, 'demo', '-d'], {
      env: {
        HOME: home,
        USERPROFILE: home,
        PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /--dangerously-bypass-approvals-and-sandbox/);
    assert.doesNotMatch(result.stdout, /--full-auto/);

    const cleaned = fs.readFileSync(path.join(profileDir, 'config.toml'), 'utf8');
    assert.doesNotMatch(cleaned, /sandbox/i);
    assert.doesNotMatch(cleaned, /^\[windows\]$/m);
  } finally {
    cleanupTempHome(home);
  }
});
