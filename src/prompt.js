// Interactive prompts — zero dependencies, replaces inquirer
// Uses Node built-in readline + raw mode for arrow-key selection

import readline from 'readline';
import { cyan, green, gray, dim } from './color.js';

let nonTtyLinesPromise;
let nonTtyLineIndex = 0;

function loadNonTtyLines() {
  if (!nonTtyLinesPromise) {
    nonTtyLinesPromise = new Promise((resolve, reject) => {
      const chunks = [];
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => chunks.push(chunk));
      process.stdin.on('end', () => {
        const text = chunks.join('').replace(/\r\n/g, '\n');
        resolve(text.split('\n'));
      });
      process.stdin.on('error', reject);
    });
  }
  return nonTtyLinesPromise;
}

async function readNonTtyAnswer(defaultValue = '') {
  const lines = await loadNonTtyLines();
  if (nonTtyLineIndex >= lines.length) return defaultValue;
  const answer = lines[nonTtyLineIndex++];
  return answer.trim() || defaultValue;
}

// --- Text input ---
export function input(message, defaultValue = '') {
  if (!process.stdin.isTTY) {
    const suffix = defaultValue ? ` ${dim(`(${defaultValue})`)}` : '';
    process.stdout.write(`${cyan('?')} ${message}${suffix} `);
    return readNonTtyAnswer(defaultValue).then((answer) => {
      process.stdout.write('\n');
      return answer;
    });
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const suffix = defaultValue ? ` ${dim(`(${defaultValue})`)}` : '';
    rl.question(`${cyan('?')} ${message}${suffix} `, (answer) => {
      resolve(answer.trim() || defaultValue);
      rl.close();
    });
    rl.on('close', () => resolve(defaultValue));
  });
}

// --- Password input (masked with *) ---
export function password(message) {
  return new Promise((resolve) => {
    const stdout = process.stdout;
    const origWrite = stdout.write.bind(stdout);
    let value = '';
    let done = false;

    function cleanup() {
      if (done) return;
      done = true;
      stdout.write = origWrite;
      process.stdin.removeListener('data', onData);
    }

    origWrite(`${cyan('?')} ${message} `);
    stdout.write = () => origWrite('');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    rl.question('', () => {
      cleanup();
      origWrite('\n');
      rl.close();
      resolve(value);
    });

    rl.on('close', () => {
      cleanup();
      origWrite('\n');
      resolve(value);
    });

    function onData(data) {
      if (done) return;
      const str = data.toString();
      for (const ch of str) {
        if (ch === '\x03') {
          cleanup();
          origWrite('\n');
          rl.close();
          process.exit(0);
        }
        if (ch === '\r' || ch === '\n') continue;
        if (ch === '\x7f' || ch === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            origWrite('\b \b');
          }
        } else if (ch.charCodeAt(0) >= 32) {
          value += ch;
          origWrite('*');
        }
      }
    }

    process.stdin.on('data', onData);
  });
}

// --- Confirm (y/n) ---
export function confirm(message, defaultValue = false) {
  if (!process.stdin.isTTY) {
    const hint = defaultValue ? 'Y/n' : 'y/N';
    process.stdout.write(`${cyan('?')} ${message} ${dim(`(${hint})`)} `);
    return readNonTtyAnswer('').then((answer) => {
      process.stdout.write('\n');
      const a = answer.trim().toLowerCase();
      if (a === '') return defaultValue;
      return a === 'y' || a === 'yes';
    });
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const hint = defaultValue ? 'Y/n' : 'y/N';
    rl.question(`${cyan('?')} ${message} ${dim(`(${hint})`)} `, (answer) => {
      const a = answer.trim().toLowerCase();
      if (a === '') resolve(defaultValue);
      else resolve(a === 'y' || a === 'yes');
      rl.close();
    });
    rl.on('close', () => resolve(defaultValue));
  });
}

// --- List selection (arrow keys) ---
// Supports separator items: { separator: true, name: '──' }
// Cursor skips separators automatically.
export function select(message, choices, defaultIndex = 0) {
  return new Promise((resolve) => {
    if (choices.length === 0) {
      resolve(undefined);
      return;
    }

    // Non-TTY: auto-select default selectable item
    if (!process.stdin.isTTY) {
      const selectable = choices.filter((c) => !c.separator);
      const idx = defaultIndex >= 0 && defaultIndex < selectable.length ? defaultIndex : 0;
      resolve(selectable[idx]?.value);
      return;
    }

    const stdout = process.stdout;

    // Map selectable indices
    const selectableIndices = choices.map((c, i) => (c.separator ? -1 : i)).filter((i) => i >= 0);
    let cursorPos = Math.max(0, Math.min(defaultIndex, selectableIndices.length - 1));
    const getCursor = () => selectableIndices[cursorPos];

    const maxVisible = Math.min(choices.length, Math.max(8, (stdout.rows || 24) - 4));

    function getWindowStart() {
      const cursor = getCursor();
      let start = cursor - Math.floor(maxVisible / 2);
      start = Math.max(0, start);
      start = Math.min(choices.length - maxVisible, start);
      return Math.max(0, start);
    }

    function render() {
      const windowStart = getWindowStart();
      const windowEnd = Math.min(windowStart + maxVisible, choices.length);
      const lines = [];
      const cursor = getCursor();

      if (message) lines.push(`${cyan('?')} ${message}`);

      for (let i = windowStart; i < windowEnd; i++) {
        const choice = choices[i];
        if (choice.separator) {
          lines.push(`    ${dim(choice.name || '─'.repeat(30))}`);
        } else if (i === cursor) {
          lines.push(`  ${cyan('›')} ${choice.name}`);
        } else {
          lines.push(`    ${choice.name}`);
        }
      }

      if (choices.length > maxVisible) {
        if (windowStart > 0 && windowEnd < choices.length) {
          lines.push(gray(`  ↑ ${windowStart} more · ↓ ${choices.length - windowEnd} more`));
        } else if (windowStart > 0) {
          lines.push(gray(`  ↑ ${windowStart} more`));
        } else if (windowEnd < choices.length) {
          lines.push(gray(`  ↓ ${choices.length - windowEnd} more`));
        }
      }

      return lines;
    }

    let renderedLineCount = 0;

    function draw() {
      if (renderedLineCount > 0) {
        stdout.write(`\x1b[${renderedLineCount}A`);
        stdout.write('\x1b[0J');
      }
      const lines = render();
      renderedLineCount = lines.length;
      stdout.write(lines.join('\n') + '\n');
    }

    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();

    draw();

    function cleanup() {
      process.stdin.setRawMode(wasRaw || false);
      process.stdin.removeListener('data', onKeypress);
      process.stdin.pause();
    }

    function onKeypress(data) {
      const key = data.toString();

      if (key === '\x1b[A' || key === 'k') {
        if (cursorPos > 0) { cursorPos--; draw(); }
        return;
      }

      if (key === '\x1b[B' || key === 'j') {
        if (cursorPos < selectableIndices.length - 1) { cursorPos++; draw(); }
        return;
      }

      if (key === '\r' || key === '\n') {
        const choice = choices[getCursor()];
        cleanup();
        if (renderedLineCount > 0) {
          stdout.write(`\x1b[${renderedLineCount}A`);
          stdout.write('\x1b[0J');
        }
        if (message) {
          stdout.write(`${cyan('?')} ${message} ${green(choice.name)}\n`);
        }
        resolve(choice.value);
        return;
      }

      if (key === '\x03' || key === 'q') {
        cleanup();
        stdout.write('\n');
        process.exit(0);
      }
    }

    process.stdin.on('data', onKeypress);
  });
}
