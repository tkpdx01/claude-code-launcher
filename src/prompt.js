// Interactive prompts — zero dependencies, replaces inquirer
// Uses Node built-in readline + raw mode for arrow-key selection

import readline from 'readline';
import { cyan, green, gray, dim } from './color.js';

// --- Text input ---
export function input(message, defaultValue = '') {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const suffix = defaultValue ? ` ${dim(`(${defaultValue})`)}` : '';
    rl.question(`${cyan('?')} ${message}${suffix} `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
    rl.on('close', () => resolve(defaultValue)); // Ctrl+C / EOF
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

    // Print prompt
    origWrite(`${cyan('?')} ${message} `);

    // Suppress readline echo — intercept stdout.write
    stdout.write = (chunk) => origWrite('');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    rl.question('', () => {
      cleanup();
      origWrite('\n');
      rl.close();
      resolve(value);
    });

    rl.on('close', () => {
      // Ctrl+C or EOF
      cleanup();
      origWrite('\n');
      resolve(value);
    });

    function onData(data) {
      if (done) return;
      const str = data.toString();
      for (const ch of str) {
        if (ch === '\x03') {
          // Ctrl+C
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
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const hint = defaultValue ? 'Y/n' : 'y/N';
    rl.question(`${cyan('?')} ${message} ${dim(`(${hint})`)} `, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === '') resolve(defaultValue);
      else resolve(a === 'y' || a === 'yes');
    });
    rl.on('close', () => resolve(defaultValue)); // Ctrl+C / EOF
  });
}

// --- List selection (arrow keys) ---
export function select(message, choices, defaultIndex = 0) {
  // choices: [{ name: string, value: any }, ...]
  return new Promise((resolve) => {
    if (choices.length === 0) {
      resolve(undefined);
      return;
    }

    // Non-TTY: auto-select default
    if (!process.stdin.isTTY) {
      const idx = defaultIndex >= 0 && defaultIndex < choices.length ? defaultIndex : 0;
      resolve(choices[idx].value);
      return;
    }

    const stdout = process.stdout;
    let cursor = defaultIndex >= 0 && defaultIndex < choices.length ? defaultIndex : 0;

    const maxVisible = Math.min(choices.length, Math.max(5, (stdout.rows || 24) - 4));

    function getWindowStart() {
      let start = cursor - Math.floor(maxVisible / 2);
      start = Math.max(0, start);
      start = Math.min(choices.length - maxVisible, start);
      return Math.max(0, start);
    }

    function render() {
      const windowStart = getWindowStart();
      const windowEnd = windowStart + maxVisible;
      const lines = [];

      lines.push(`${cyan('?')} ${message}`);

      for (let i = windowStart; i < windowEnd; i++) {
        const choice = choices[i];
        if (i === cursor) {
          lines.push(`  ${cyan('>')} ${choice.name}`);
        } else {
          lines.push(`    ${choice.name}`);
        }
      }

      if (choices.length > maxVisible) {
        if (windowStart > 0 && windowEnd < choices.length) {
          lines.push(gray(`  (${windowStart} more above, ${choices.length - windowEnd} more below)`));
        } else if (windowStart > 0) {
          lines.push(gray(`  (${windowStart} more above)`));
        } else if (windowEnd < choices.length) {
          lines.push(gray(`  (${choices.length - windowEnd} more below)`));
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
        if (cursor > 0) { cursor--; draw(); }
        return;
      }

      if (key === '\x1b[B' || key === 'j') {
        if (cursor < choices.length - 1) { cursor++; draw(); }
        return;
      }

      if (key === '\r' || key === '\n') {
        cleanup();
        if (renderedLineCount > 0) {
          stdout.write(`\x1b[${renderedLineCount}A`);
          stdout.write('\x1b[0J');
        }
        stdout.write(`${cyan('?')} ${message} ${green(choices[cursor].name)}\n`);
        resolve(choices[cursor].value);
        return;
      }

      if (key === '\x03') {
        cleanup();
        stdout.write('\n');
        process.exit(0);
      }
    }

    process.stdin.on('data', onKeypress);
  });
}
