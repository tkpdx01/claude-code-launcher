import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { width, clip, pad, plain } from '../src/ui.js';

test('terminal layout keeps CJK, combining accents, and emoji on whole cells', () => {
  for (const [text, expected] of [['配置', 4], ['cafe\u0301', 4], ['👩‍💻', 2], ['🇨🇳', 2]]) {
    assert.equal(width(text), expected);
  }
  const label = '\x1b[36m配置 👩‍💻 cafe\u0301\x1b[39m';
  for (let size = 0; size < 30; size++) {
    assert.ok(width(clip(label, size)) <= size);
    assert.equal(width(pad(label, size)), size);
  }
  assert.equal(plain(clip('👩‍💻abc', 3)), '👩‍💻…');
});

function run(t, args, extraEnv = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccc-ui-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  delete env.NO_COLOR;
  delete env.FORCE_COLOR;
  delete env.TERM;
  return spawnSync(process.execPath, args, {
    cwd: new URL('../', import.meta.url), env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 10000,
  });
}

test('piped help contains no terminal escape sequences', (t) => {
  const result = run(t, ['index.js', '--help']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ccc <profile> -- <args>/);
  assert.doesNotMatch(result.stdout, /\x1b/);
});

test('NO_COLOR and dumb terminals disable even explicitly forced styling', (t) => {
  for (const env of [{ NO_COLOR: '', FORCE_COLOR: '1' }, { TERM: 'dumb', FORCE_COLOR: '1' }]) {
    const result = run(t, ['--input-type=module', '-e', "import { cyan, inverse } from './src/color.js'; console.log(inverse(cyan('hello')));"], env);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'hello\n');
  }
});

test('redirected selectors preserve defaults and never enter raw mode', (t) => {
  const result = run(t, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { select } from './src/prompt.js';
    Object.defineProperty(process.stdin, 'isTTY', { value: true });
    process.stdin.setRawMode = () => { throw new Error('raw mode must not be used'); };
    const choices = [{ value: 'first' }, { separator: true }, { value: 'second' }];
    assert.equal(await select('Pick', choices, 1), 'second');
    assert.equal(await select('Pick', choices, 99), 'first');
    assert.equal(await select('Pick', [{ separator: true }]), undefined);
  `]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});
