import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ANYROUTER_DEFAULT_MODEL,
  CONTEXT_1M_BETA,
  applyAnyRouterEnv,
  applyAnyRouterProfile,
  applyAnyRouterSettings,
  isAnyRouterUrl,
  with1mModel,
  withContext1mHeader,
} from '../src/anyrouter.js';
import { mergeClaudeSettings } from '../src/claude-settings.js';
import { buildClaudeEnv, getClaudeProfileEnv } from '../src/env.js';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const cliPath = path.join(repoRoot, 'index.js');

test('AnyRouter URLs include official hosts and reverse-proxy paths', () => {
  for (const url of [
    'https://anyrouter.top',
    'https://anyrouter.top/',
    'https://anyrouter.top/v1',
    'http://anyrouter.top',
    'https://www.anyrouter.top',
    'https://anyrouter.dev',
    'https://anyrouter.win/',
    'https://betterclau.de/claude/anyrouter.top',
    'https://betterclau.de/claude/anyrouter.top/',
  ]) {
    assert.equal(isAnyRouterUrl(url), true, url);
  }
  for (const url of [
    '',
    'https://api.anthropic.com',
    'https://cd.xax920.eu.org/',
    'https://example.test',
    'https://notanyrouter.top',
    'https://anyrouter.example.com',
  ]) {
    assert.equal(isAnyRouterUrl(url), false, url);
  }
});

test('1M model suffix and beta header helpers are idempotent', () => {
  assert.equal(with1mModel(''), '');
  assert.equal(with1mModel('claude-fable-5-1'), 'claude-fable-5-1[1m]');
  assert.equal(with1mModel('claude-fable-5-1[1m]'), 'claude-fable-5-1[1m]');
  assert.equal(with1mModel('opus[1M]'), 'opus[1M]');
  assert.equal(withContext1mHeader(''), `anthropic-beta: ${CONTEXT_1M_BETA}`);
  assert.equal(
    withContext1mHeader(`x-foo: bar\nanthropic-beta: interleaved-thinking-2025-05-14`),
    `x-foo: bar\nanthropic-beta: interleaved-thinking-2025-05-14,${CONTEXT_1M_BETA}`,
  );
  assert.equal(
    withContext1mHeader(`anthropic-beta: ${CONTEXT_1M_BETA}`),
    `anthropic-beta: ${CONTEXT_1M_BETA}`,
  );
});

test('creating an AnyRouter profile writes 1M context defaults', () => {
  const before = { type: 'claude', apiUrl: 'https://anyrouter.top/', apiKey: 'secret' };
  const snapshot = structuredClone(before);
  const profile = applyAnyRouterProfile(before, { setDefaultModel: true });
  assert.deepEqual(before, snapshot);
  assert.equal(profile.settings.model, ANYROUTER_DEFAULT_MODEL);
  assert.equal(profile.settings.modelPrefer1mContext, true);
  assert.equal(profile.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS, '0');
  assert.equal(profile.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, undefined);
  assert.equal(profile.env.CLAUDE_CODE_DISABLE_1M_CONTEXT, '0');
  assert.equal(profile.env.ANTHROPIC_DEFAULT_FABLE_MODEL, ANYROUTER_DEFAULT_MODEL);
  assert.match(profile.env.ANTHROPIC_CUSTOM_HEADERS, new RegExp(CONTEXT_1M_BETA));
  const official = { apiUrl: 'https://api.anthropic.com', apiKey: 'k' };
  assert.deepEqual(applyAnyRouterProfile(official), official);
});

test('editing off AnyRouter strips the 1M overlay and keeps unrelated env', () => {
  const saved = applyAnyRouterProfile({
    apiUrl: 'https://anyrouter.top/',
    apiKey: 'k',
    env: { HTTP_PROXY: 'http://127.0.0.1:7897', ANTHROPIC_CUSTOM_HEADERS: 'x-foo: bar' },
    settings: { model: 'claude-opus-4-7' },
  }, { setDefaultModel: true });
  const moved = applyAnyRouterProfile({ ...saved, apiUrl: 'https://api.anthropic.com' });
  assert.equal(moved.apiUrl, 'https://api.anthropic.com');
  assert.equal(moved.env.HTTP_PROXY, 'http://127.0.0.1:7897');
  assert.equal(moved.env.ANTHROPIC_CUSTOM_HEADERS, 'x-foo: bar');
  assert.equal(moved.env.ANTHROPIC_DEFAULT_FABLE_MODEL, undefined);
  assert.equal(moved.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS, undefined);
  assert.equal(moved.env.CLAUDE_CODE_DISABLE_1M_CONTEXT, undefined);
  assert.equal(moved.settings.model, 'claude-opus-4-7');
  assert.equal(moved.settings.modelPrefer1mContext, undefined);
});

test('AnyRouter profile edit keeps an existing model and only appends [1m]', () => {
  const profile = applyAnyRouterProfile({
    apiUrl: 'https://anyrouter.top',
    apiKey: 'k',
    env: { HTTP_PROXY: 'http://127.0.0.1:7897', ANTHROPIC_CUSTOM_HEADERS: 'x-foo: bar' },
    settings: { model: 'claude-opus-4-7' },
  });
  assert.equal(profile.settings.model, 'claude-opus-4-7[1m]');
  assert.equal(profile.env.HTTP_PROXY, 'http://127.0.0.1:7897');
  assert.match(profile.env.ANTHROPIC_CUSTOM_HEADERS, /^x-foo: bar$/m);
  assert.match(profile.env.ANTHROPIC_CUSTOM_HEADERS, new RegExp(CONTEXT_1M_BETA));
});

test('launch and apply overlay 1M context onto existing AnyRouter profiles', () => {
  const profile = {
    type: 'claude',
    apiUrl: 'https://anyrouter.top/',
    apiKey: 'test-key',
    settings: { model: 'claude-fable-5-1' },
  };
  const main = {
    env: { CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
    model: 'global-model',
  };
  const before = structuredClone({ main, profile });
  const env = getClaudeProfileEnv(profile);
  const settings = mergeClaudeSettings(main, profile);
  const childEnv = buildClaudeEnv(profile);
  assert.deepEqual({ main, profile }, before);
  assert.equal(env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS, '0');
  assert.equal(env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, '');
  assert.equal(env.CLAUDE_CODE_DISABLE_1M_CONTEXT, '0');
  assert.equal(env.ANTHROPIC_DEFAULT_FABLE_MODEL, ANYROUTER_DEFAULT_MODEL);
  assert.match(env.ANTHROPIC_CUSTOM_HEADERS, new RegExp(CONTEXT_1M_BETA));
  assert.equal(settings.model, 'claude-fable-5-1[1m]');
  assert.equal(settings.modelPrefer1mContext, true);
  assert.equal(settings.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS, '0');
  assert.equal(childEnv.ANTHROPIC_CUSTOM_HEADERS, env.ANTHROPIC_CUSTOM_HEADERS);
  assert.equal(applyAnyRouterEnv('https://api.anthropic.com', { KEEP: 'yes' }).KEEP, 'yes');
  assert.equal(applyAnyRouterSettings('https://api.anthropic.com', { model: 'opus' }).model, 'opus');
});

test('launching a bare AnyRouter profile injects 1M context without rewriting the file', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccc-anyrouter-launch-'));
  try {
    const bin = path.join(home, 'bin');
    fs.mkdirSync(bin);
    const capture = path.join(home, 'capture.json');
    const claudeJs = path.join(bin, 'claude.js');
    fs.writeFileSync(claudeJs, `
const fs = require('node:fs');
const args = process.argv.slice(2);
const settingsPath = args[args.indexOf('--settings') + 1];
fs.writeFileSync(process.env.CCC_CAPTURE, JSON.stringify({
  settings: JSON.parse(fs.readFileSync(settingsPath, 'utf8')),
}));
`);
    if (process.platform === 'win32') {
      fs.writeFileSync(path.join(bin, 'claude.cmd'), `@"${process.execPath}" "${claudeJs}" %*\r\n`);
    } else {
      fs.writeFileSync(path.join(bin, 'claude'), `#!${process.execPath}\n${fs.readFileSync(claudeJs, 'utf8')}`);
      fs.chmodSync(path.join(bin, 'claude'), 0o700);
    }
    const profilePath = path.join(home, '.ccc', 'profiles', 'any.json');
    fs.mkdirSync(path.dirname(profilePath), { recursive: true });
    const original = { type: 'claude', apiUrl: 'https://anyrouter.top/', apiKey: 'test-key' };
    fs.writeFileSync(profilePath, JSON.stringify(original) + '\n');
    const result = spawnSync(process.execPath, [cliPath, 'any'], {
      cwd: repoRoot,
      env: {
        ...process.env, HOME: home, USERPROFILE: home,
        PATH: bin, CCC_CAPTURE: capture,
      },
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr);
    const launch = JSON.parse(fs.readFileSync(capture, 'utf8'));
    assert.equal(launch.settings.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS, '0');
    assert.match(launch.settings.env.ANTHROPIC_CUSTOM_HEADERS, new RegExp(CONTEXT_1M_BETA));
    assert.equal(launch.settings.modelPrefer1mContext, true);
    assert.deepEqual(JSON.parse(fs.readFileSync(profilePath, 'utf8')), original);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('ccc new persists AnyRouter 1M defaults and leaves other Claude profiles unchanged', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccc-anyrouter-'));
  try {
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    const any = spawnSync(process.execPath, [cliPath, 'new', 'any'], {
      cwd: repoRoot, env, encoding: 'utf8', input: 'https://anyrouter.top/\nsecret-key\nn\n', timeout: 10000,
    });
    assert.equal(any.status, 0, any.stderr);
    const saved = JSON.parse(fs.readFileSync(path.join(home, '.ccc', 'profiles', 'any.json'), 'utf8'));
    assert.equal(saved.apiUrl, 'https://anyrouter.top/');
    assert.equal(saved.settings.model, ANYROUTER_DEFAULT_MODEL);
    assert.equal(saved.settings.modelPrefer1mContext, true);
    assert.equal(saved.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS, '0');
    assert.equal(saved.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, undefined);
    assert.match(saved.env.ANTHROPIC_CUSTOM_HEADERS, new RegExp(CONTEXT_1M_BETA));
    assert.match(any.stdout, /1M context|1M 上下文/);

    const other = spawnSync(process.execPath, [cliPath, 'new', 'official'], {
      cwd: repoRoot, env, encoding: 'utf8', input: 'https://api.anthropic.com\nother-key\nn\n', timeout: 10000,
    });
    assert.equal(other.status, 0, other.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home, '.ccc', 'profiles', 'official.json'), 'utf8')), {
      type: 'claude', apiUrl: 'https://api.anthropic.com', apiKey: 'other-key',
    });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
