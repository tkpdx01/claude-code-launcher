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
  });
}

// --- Password input (masked with *) ---
export function password(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const stdout = process.stdout;
    let value = '';

    // Mute default output
    const origWrite = stdout.write.bind(stdout);
    stdout.write = (chunk) => {
      // Only suppress echoed characters from the question prompt input
      // Allow the initial question prompt through
      return origWrite('');
    };

    rl.question(`${cyan('?')} ${message} `, () => {
      stdout.write = origWrite;
      origWrite('\n');
      rl.close();
      resolve(value);
    });

    // Restore write temporarily for prompt display
    stdout.write = origWrite;
    origWrite(`${cyan('?')} ${message} `);
    stdout.write = (chunk) => {
      // Intercept echoed input, print * instead
      const s = typeof chunk === 'string' ? chunk : chunk.toString();
      if (s === '\n' || s === '\r\n' || s === '\r') {
        return origWrite(s);
      }
      return origWrite('');
    };

    process.stdin.on('data', function handler(data) {
      const str = data.toString();
      for (const ch of str) {
        if (ch === '\r' || ch === '\n') continue;
        if (ch === '\x7f' || ch === '\b') {
          // Backspace
          if (value.length > 0) {
            value = value.slice(0, -1);
            origWrite('\b \b');
          }
        } else if (ch.charCodeAt(0) >= 32) {
          value += ch;
          origWrite('*');
        }
      }
    });
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

    const stdout = process.stdout;
    let cursor = defaultIndex >= 0 && defaultIndex < choices.length ? defaultIndex : 0;

    // Calculate visible window for long lists
    const maxVisible = Math.min(choices.length, Math.max(5, (stdout.rows || 24) - 4));

    function getWindowStart() {
      // Keep cursor centered in window when possible
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
      // Clear previously rendered lines
      if (renderedLineCount > 0) {
        stdout.write(`\x1b[${renderedLineCount}A`); // Move up
        stdout.write('\x1b[0J'); // Clear from cursor to end
      }
      const lines = render();
      renderedLineCount = lines.length;
      stdout.write(lines.join('\n') + '\n');
    }

    // Enter raw mode for keypress detection
    const wasRaw = process.stdin.isRaw;
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    draw();

    function cleanup() {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(wasRaw || false);
      }
      process.stdin.removeListener('data', onKeypress);
      process.stdin.pause();
    }

    function onKeypress(data) {
      const key = data.toString();

      // Arrow up / k
      if (key === '\x1b[A' || key === 'k') {
        if (cursor > 0) {
          cursor--;
          draw();
        }
        return;
      }

      // Arrow down / j
      if (key === '\x1b[B' || key === 'j') {
        if (cursor < choices.length - 1) {
          cursor++;
          draw();
        }
        return;
      }

      // Enter
      if (key === '\r' || key === '\n') {
        cleanup();
        // Show selected result
        if (renderedLineCount > 0) {
          stdout.write(`\x1b[${renderedLineCount}A`);
          stdout.write('\x1b[0J');
        }
        stdout.write(`${cyan('?')} ${message} ${green(choices[cursor].name)}\n`);
        resolve(choices[cursor].value);
        return;
      }

      // Ctrl+C
      if (key === '\x03') {
        cleanup();
        stdout.write('\n');
        process.exit(0);
      }
    }

    process.stdin.on('data', onKeypress);
  });
}
