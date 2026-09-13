// Interactive prompts — zero dependencies, replaces inquirer
// Uses Node built-in readline + raw mode for arrow-key selection

import readline from 'readline';
import { cyan, green, gray, dim, bold, inverse } from './color.js';
import { clip, pad, width, plain, columns } from './ui.js';
import { t } from './i18n.js';

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

// Show a prompt and read one trimmed line; piped stdin consumes answers in order.
function ask(prompt, defaultValue = '') {
  if (!process.stdin.isTTY) {
    process.stdout.write(prompt);
    return readNonTtyAnswer(defaultValue).then((answer) => {
      process.stdout.write('\n');
      return answer;
    });
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultValue);
      rl.close();
    });
    rl.on('close', () => resolve(defaultValue));
  });
}

// --- Text input ---
export function input(message, defaultValue = '') {
  const suffix = defaultValue ? ` ${dim(`(${defaultValue})`)}` : '';
  return ask(`  ${cyan('◆')} ${bold(message)}${suffix} `, defaultValue);
}

// --- Confirm (y/n) ---
export async function confirm(message, defaultValue = false) {
  const hint = defaultValue ? 'Y/n' : 'y/N';
  const answer = (await ask(`  ${cyan('◆')} ${bold(message)} ${dim(`(${hint})`)} `)).toLowerCase();
  if (answer === '') return defaultValue;
  return answer === 'y' || answer === 'yes';
}

// --- List selection (arrow keys, j/k, Home/End, Page Up/Down) ---
// Descriptions collapse into a focused hint in narrow terminals.
export function select(message, choices, defaultIndex = 0) {
  return new Promise((resolve) => {
    const selectableIndices = choices.map((choice, i) => choice.separator ? -1 : i).filter((i) => i >= 0);
    if (selectableIndices.length === 0) {
      resolve(undefined);
      return;
    }
    let cursorPos = Number.isInteger(defaultIndex)
      ? Math.max(0, Math.min(defaultIndex, selectableIndices.length - 1)) : 0;
    const getCursor = () => selectableIndices[cursorPos];

    // Preserve piped-answer behavior without cursor controls in redirected output.
    if (!process.stdin.isTTY || !process.stdout.isTTY || process.env.TERM === 'dumb') {
      if (!Number.isInteger(defaultIndex) || defaultIndex < 0 || defaultIndex >= selectableIndices.length) cursorPos = 0;
      resolve(choices[getCursor()].value);
      return;
    }

    const stdout = process.stdout;
    let renderedLines = [];
    let done = false;
    const maxVisible = () => Math.min(choices.length, Math.max(1, Math.min(12, (stdout.rows || 24) - 10)));
    // Choices never change while the menu is open, so measure their labels once.
    const labelWidth = Math.min(26, Math.max(16, ...selectableIndices.map((i) => width(choices[i].name)))) + 2;

    function render() {
      const size = columns();
      const rowSize = size - 2;
      const showDescriptions = size >= 54;
      const cursor = getCursor();
      const visible = maxVisible();
      const start = Math.max(0, Math.min(choices.length - visible, cursor - Math.floor(visible / 2)));
      const end = Math.min(start + visible, choices.length);
      const position = `${String(cursorPos + 1).padStart(2, '0')} / ${String(selectableIndices.length).padStart(2, '0')}`;
      const title = message || t('ui.actions');
      const titleSpace = size - width(position) - 5;
      const heading = titleSpace > 4
        ? `${pad(bold(title), titleSpace)} ${gray(position)}` : clip(bold(title), size - 3);
      const lines = [`  ${cyan('╭─')} ${heading}`];

      for (let i = start; i < end; i++) {
        const choice = choices[i];
        if (choice.separator) {
          lines.push(`  ${gray('│')} ${clip(dim(choice.name || ''), rowSize)}`);
          continue;
        }
        let label = choice.name;
        if (showDescriptions && choice.description) {
          label = pad(label, labelWidth) + dim(choice.description);
        }
        if (i === cursor) {
          lines.push(`  ${cyan('│')}${inverse(cyan(pad(' › ' + plain(label), rowSize + 1)))}`);
        } else {
          lines.push(`  ${gray('│')}   ${clip(label, rowSize - 2)}`);
        }
      }

      const detail = !showDescriptions && choices[cursor].description;
      if (detail) lines.push(`  ${gray('│')}   ${clip(dim(detail), rowSize - 2)}`);
      const help = size < 44 ? t('ui.keys_short') : t('ui.keys');
      lines.push(`  ${cyan('╰─')} ${clip(gray(help), size - 3)}`);
      return lines;
    }

    function erase() {
      // A terminal may reflow old rows after a resize; clear their physical
      // height at the new width, not just the previous logical row count.
      const terminalColumns = stdout.columns || 80;
      const rows = renderedLines.reduce((sum, line) => sum + Math.max(1, Math.ceil(width(line) / terminalColumns)), 0);
      if (rows > 0) stdout.write(`\x1b[${rows}A\r\x1b[0J`);
    }

    function draw() {
      erase();
      const lines = render();
      renderedLines = lines;
      stdout.write(lines.join('\n') + '\n');
    }

    const restoreCursor = () => stdout.write('\x1b[?25h');
    const terminate = () => { cleanup(); process.exit(143); };
    const hangup = () => { cleanup(); process.exit(129); };

    function cleanup() {
      if (done) return;
      done = true;
      try {
        process.stdin.setRawMode(false);
      } catch { /* TTY may already be restored. */ }
      process.stdin.removeListener('keypress', onKeypress);
      process.stdin.pause();
      stdout.removeListener('resize', draw);
      process.removeListener('exit', restoreCursor);
      process.removeListener('SIGTERM', terminate);
      process.removeListener('SIGHUP', hangup);
      restoreCursor();
    }

    function onKeypress(str, key = {}) {
      if (done) return;
      let next = cursorPos;
      if (key.name === 'up' || str === 'k') next--;
      else if (key.name === 'down' || str === 'j') next++;
      else if (key.name === 'home') next = 0;
      else if (key.name === 'end') next = selectableIndices.length - 1;
      else if (key.name === 'pageup') next -= maxVisible();
      else if (key.name === 'pagedown') next += maxVisible();
      else if (key.name === 'return' || key.name === 'enter') {
        const choice = choices[getCursor()];
        erase();
        cleanup();
        stdout.write(`  ${green('✓')} ${clip(`${message ? message + '  ' : ''}${bold(plain(choice.name))}`, columns() - 2)}\n`);
        resolve(choice.value);
        return;
      } else if ((key.ctrl && key.name === 'c') || key.name === 'escape' || str === 'q') {
        cleanup();
        stdout.write('\n');
        process.exit(0);
      }
      next = Math.max(0, Math.min(next, selectableIndices.length - 1));
      if (next !== cursorPos) { cursorPos = next; draw(); }
    }

    readline.emitKeypressEvents(process.stdin);
    process.stdin.on('keypress', onKeypress);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    stdout.on('resize', draw);
    process.once('exit', restoreCursor);
    process.once('SIGTERM', terminate);
    process.once('SIGHUP', hangup);
    stdout.write('\x1b[?25l');
    draw();
  });
}
