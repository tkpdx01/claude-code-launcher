import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Exercise the real keypress decoder with isolated terminal streams and homes.
function runMenu(t, source) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccc-prompt-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const program = String.raw`
    import assert from 'node:assert/strict';
    import { PassThrough, Writable } from 'node:stream';
    const writes = [];
    const rawModes = [];
    const stdin = new PassThrough();
    stdin.isTTY = true;
    stdin.setRawMode = (raw) => rawModes.push(raw);
    const stdout = new Writable({
      write(chunk, encoding, callback) { writes.push(chunk.toString()); callback(); },
    });
    Object.assign(stdout, { isTTY: true, columns: 80, rows: 24 });
    Object.defineProperty(process, 'stdin', { value: stdin });
    Object.defineProperty(process, 'stdout', { value: stdout });
    process.exit = (code) => { throw new Error('Unexpected exit: ' + code); };
    const { select } = await import('./src/prompt.js');
    const { plain, width } = await import('./src/ui.js');
    const tick = () => new Promise((resolve) => setImmediate(resolve));
    const frame = () => plain(writes.at(-1));
    const queryLine = () => frame().split('\n').find((line) => line.startsWith('  │ / '));
    async function press(sequence) { stdin.write(sequence); await tick(); }
    async function escape() {
      // Send the decoded key without waiting for readline's escape timeout.
      stdin.emit('keypress', undefined, { name: 'escape' });
      await tick();
    }
    function assertRestored() {
      assert.equal(rawModes.at(-1), false);
      assert.equal(stdin.isPaused(), true);
      assert.equal(stdin.listenerCount('keypress'), 0);
      assert.equal(stdout.listenerCount('resize'), 0);
      assert.equal(process.listenerCount('SIGTERM'), 0);
      assert.equal(process.listenerCount('SIGHUP'), 0);
      assert.ok(writes.includes('\x1b[?25h'));
    }
    ${source}
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', program], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: '1', TERM: 'xterm' },
    encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
}

test('typing filters names and providers with normalized keywords and preserves choice values', (t) => {
  runMenu(t, String.raw`
    const selected = { name: 'Dev Singapore', type: 'codex' };
    const choices = [
      { name: 'Production', description: 'Claude', value: 'prod' },
      { separator: true, name: 'Development group' },
      { name: '\x1b[36mDev Singapore\x1b[39m', description: 'Codex', value: selected },
      { name: 'Dev Claude', description: 'Claude', value: 'dev-claude' },
    ];
    const result = select('Pick', choices, 2);
    const before = writes.length;
    await press('ＣＯＤＥＸ dev');
    assert.match(frame(), /1\/3 matches/);
    assert.match(frame(), /› Dev Singapore/);
    assert.doesNotMatch(frame(), /Production|Dev Claude|Development group/);
    assert.equal(writes.length - before, 2, 'a paste should erase and paint just once');
    await press('\r');
    assert.equal(await result, selected);
    assertRestored();
  `);
});

test('search supports aliases for translated menu actions', (t) => {
  runMenu(t, String.raw`
    const result = select('操作', [
      { name: '启动', description: '启动配置', searchText: 'launch', value: 'launch' },
      { name: '查看', description: '配置详情', searchText: 'show', value: 'show' },
    ]);
    await press('show');
    assert.match(frame(), /› 查看/);
    assert.doesNotMatch(frame(), /启动/);
    await press('\r');
    assert.equal(await result, 'show');
  `);
});

test('j and k still navigate while slash allows searching for j, k, and q', (t) => {
  runMenu(t, String.raw`
    const result = select('Pick', [
      { name: 'Alpha', value: 'a' },
      { name: 'Beta', value: 'b' },
      { name: 'jkq-project', value: 'jkq' },
    ]);
    await press('j');
    assert.match(frame(), /› Beta/);
    await press('k');
    assert.match(frame(), /› Alpha/);
    await press('/jkq');
    assert.match(frame(), /1\/3 matches/);
    assert.match(frame(), /› jkq-project/);
    await press('\r');
    assert.equal(await result, 'jkq');
    assertRestored();
  `);
});

test('empty search results cannot be selected and Escape restores the full menu', (t) => {
  runMenu(t, String.raw`
    let settled = false;
    const result = select('Pick', [
      { name: 'Alpha', value: 'a' },
      { name: 'Beta', value: 'b' },
    ]).then((value) => { settled = true; return value; });
    await press('missing');
    assert.match(frame(), /No matches/);
    assert.match(frame(), /0\/2 matches/);
    await press('\r\x1b[B\x1b[F');
    assert.equal(settled, false);
    await press('\x15');
    assert.match(frame(), /2\/2 matches/);
    await press('beta');
    assert.match(frame(), /› Beta/);
    await escape();
    assert.match(frame(), /Alpha/);
    assert.match(frame(), /› Beta/);
    assert.match(queryLine(), /Type to filter/);
    await press('\r');
    assert.equal(await result, 'b');
    assertRestored();
  `);
});

test('Unicode search and backspace keep combining accents, CJK, and emoji intact', (t) => {
  runMenu(t, String.raw`
    const result = select('Pick', [
      { name: 'Café studio', value: 'accent' },
      { name: 'Cafe light', value: 'ascii' },
      { name: '工具 👩‍💻', value: 'emoji' },
      { name: '配置', value: 'cjk' },
    ]);
    await press('cafe\u0301');
    assert.match(frame(), /1\/4 matches/);
    assert.match(frame(), /› Café studio/);
    await press('\x7f');
    assert.match(queryLine(), /\/ caf▏/);
    assert.match(frame(), /2\/4 matches/);
    await press('\x15👩‍💻');
    assert.match(frame(), /1\/4 matches/);
    await press('\x7f');
    assert.match(queryLine(), /\/ ▏/);
    assert.match(frame(), /4\/4 matches/);
    await press('配置\r');
    assert.equal(await result, 'cjk');
    assertRestored();
  `);
});

test('filtered lists preserve focus and support Home, End, paging, and arrows after resizing', (t) => {
  runMenu(t, String.raw`
    stdout.rows = 12;
    const choices = Array.from({ length: 50 }, (_, i) => ({
      name: 'Item ' + String(i).padStart(2, '0'),
      description: i % 2 ? 'Codex' : 'Claude', value: i,
    }));
    const result = select('Pick', choices, 13);
    await press('codex');
    assert.match(frame(), /› Item 13/);
    await press('\x1b[H');
    assert.match(frame(), /› Item 01/);
    await press('\x1b[6~');
    assert.match(frame(), /› Item 17/);
    await press('\x1b[F');
    assert.match(frame(), /› Item 49/);
    await press('\x1b[5~');
    assert.match(frame(), /› Item 33/);
    Object.assign(stdout, { columns: 32, rows: 8 });
    stdout.emit('resize');
    await tick();
    await press('\x1b[5~');
    assert.match(frame(), /› Item 27/);
    await press('\x1b[A\x1b[B\r');
    assert.equal(await result, 27);
    assertRestored();
  `);
});

test('menus fit terminal width and height and show the tail of long search input', (t) => {
  runMenu(t, String.raw`
    const choices = Array.from({ length: 20 }, (_, i) => ({
      name: '项目' + String(i).padStart(2, '0'), description: 'Codex 👩‍💻', value: i,
    }));
    const result = select('配置搜索', choices, 9);
    for (const [columns, rows] of [[80, 24], [32, 8], [18, 5], [8, 4], [3, 2], [100, 30]]) {
      Object.assign(stdout, { columns, rows });
      stdout.emit('resize');
      await tick();
      const lines = frame().trimEnd().split('\n');
      assert.ok(lines.length <= rows - 1, 'menu exceeds terminal height');
      for (const line of lines) assert.ok(width(line) < columns, 'row wraps at ' + columns + ' columns: ' + line);
      if (columns >= 18) assert.match(frame(), /› 项目09/);
    }
    Object.assign(stdout, { columns: 32, rows: 8 });
    stdout.emit('resize');
    await press('/' + 'x'.repeat(100) + '👩‍💻');
    assert.match(queryLine(), /….*👩‍💻▏/);
    assert.match(frame(), /No matches/);
    for (const line of frame().trimEnd().split('\n')) assert.ok(width(line) < stdout.columns);
    for (const rows of [3, 4]) {
      stdout.rows = rows;
      stdout.emit('resize');
      await tick();
      assert.match(queryLine(), /👩‍💻▏/, 'short terminals must keep the query visible');
      assert.ok(frame().trimEnd().split('\n').length <= rows - 1);
    }
    await press('\x15\r');
    assert.equal(await result, 0);
    assertRestored();
  `);
});

test('quit, Escape, Ctrl+C, and termination signals restore the terminal and cancel pending draws', (t) => {
  runMenu(t, String.raw`
    const exits = [];
    process.exit = (code) => exits.push(code);
    for (const action of ['q', 'escape', 'ctrl-c', 'SIGTERM', 'SIGHUP']) {
      select('Pick', [{ name: 'Alpha', value: 'a' }]);
      if (action === 'q') await press('q');
      else {
        await press('/alpha');
        if (action === 'escape') {
          await escape();
          assert.equal(exits.length, 1, 'first Escape must only clear the search');
          await escape();
        } else if (action === 'ctrl-c') await press('\x03');
        else {
          stdin.write('x'); // This draw must not run after signal cleanup.
          process.emit(action);
          await tick();
          assert.equal(writes.at(-1), '\x1b[?25h');
        }
      }
      assertRestored();
    }
    assert.deepEqual(exits, [0, 0, 0, 143, 129]);
  `);
});
