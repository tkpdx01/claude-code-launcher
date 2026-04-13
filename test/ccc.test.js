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
