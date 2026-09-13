// Interactive prompts — zero dependencies, replaces inquirer
// Uses Node built-in readline + raw mode for arrow-key selection

import readline from 'readline';
import { cyan, green, gray, dim, bold, inverse } from './color.js';
import { clip, pad, width, plain, columns, graphemes } from './ui.js';
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

function searchText(value) {
  return plain(value).normalize('NFKC').toLowerCase();
}

function backspace(value) {
  let last = 0;
  for (const { index } of graphemes(value)) last = index;
  return value.slice(0, last);
}

// Keep the newest input visible without splitting CJK or emoji characters.
function queryTail(value, limit) {
  if (limit <= 0) return '';
  if (width(value) <= limit) return value;
  const parts = Array.from(graphemes(value), ({ segment }) => segment);
  let result = '';
  let used = 1;
  for (let i = parts.length - 1; i >= 0; i--) {
    const size = width(parts[i]);
    if (used + size > limit) break;
    result = parts[i] + result;
    used += size;
  }
  return '…' + result;
}

// --- Searchable list selection ---
// Type to filter, or press / to search for text beginning with j, k, or q.
export function select(message, choices, defaultIndex = 0) {
  return new Promise((resolve) => {
    const allIndices = choices.map((_, i) => i);
    const selectableIndices = allIndices.filter((i) => !choices[i].separator);
    if (selectableIndices.length === 0) {
      resolve(undefined);
      return;
    }
    let cursorPos = Number.isInteger(defaultIndex)
      ? Math.max(0, Math.min(defaultIndex, selectableIndices.length - 1)) : 0;
    let filteredIndices = selectableIndices;
    const getCursor = () => filteredIndices[cursorPos];

    // Preserve piped-answer behavior without cursor controls in redirected output.
    if (!process.stdin.isTTY || !process.stdout.isTTY || process.env.TERM === 'dumb') {
      if (!Number.isInteger(defaultIndex) || defaultIndex < 0 || defaultIndex >= selectableIndices.length) cursorPos = 0;
      resolve(choices[getCursor()].value);
      return;
    }

    const stdout = process.stdout;
    let renderedLines = [];
    let done = false;
    let drawScheduled = false;
    let searching = false;
    let query = '';
    let displayIndices = allIndices;
    // Cache searchable labels, descriptions, and optional aliases once per menu.
    const searchable = new Map(selectableIndices.map((i) => [i, searchText(
      [choices[i].name, choices[i].description, choices[i].searchText].filter(Boolean).join(' '),
    )]));
    const labelWidth = Math.min(26, selectableIndices.reduce((max, i) => Math.max(max, width(choices[i].name)), 16)) + 2;

    function updateQuery(value) {
      const selected = getCursor();
      query = value;
      const words = searchText(query).trim().split(/\s+/u).filter(Boolean);
      filteredIndices = words.length
        ? selectableIndices.filter((i) => words.every((word) => searchable.get(i).includes(word)))
        : selectableIndices;
      // Hide group separators while filtering, and retain focus when it still matches.
      displayIndices = words.length ? filteredIndices : allIndices;
      cursorPos = Math.max(0, filteredIndices.indexOf(selected));
      scheduleDraw();
    }

    function layout() {
      const size = Math.max(1, Math.min(columns() + 2, (stdout.columns || 80) - 1));
      // Leave a row for the cursor so the menu can always be erased in place.
      const height = Math.max(1, (stdout.rows || 24) - 1);
      const showDescriptions = size >= 58;
      const showDetail = !showDescriptions && !!choices[getCursor()]?.description && height >= 6;
      const showHeading = height >= 4 || (!searching && height === 2);
      const showSearch = height >= 3 || (searching && height === 2);
      const showHelp = height >= 3;
      const visible = Math.max(1, Math.min(12, height - showHeading - showSearch - showHelp - showDetail));
      return { size, showDescriptions, showDetail, showHeading, showSearch, showHelp, visible };
    }

    function render() {
      const { size, showDescriptions, showDetail, showHeading, showSearch, showHelp, visible } = layout();
      const cursor = getCursor();
      const displayCursor = Math.max(0, displayIndices.indexOf(cursor));
      const start = Math.max(0, Math.min(displayIndices.length - visible, displayCursor - Math.floor(visible / 2)));
      const end = Math.min(start + visible, displayIndices.length);
      const position = `${String(filteredIndices.length ? cursorPos + 1 : 0).padStart(2, '0')} / ${String(filteredIndices.length).padStart(2, '0')}`;
      const title = message || t('ui.actions');
      const titleSpace = size - width(position) - 6;
      const heading = titleSpace > 4
        ? `${pad(bold(title), titleSpace)} ${gray(position)}` : clip(bold(title), size - 5);
      const lines = showHeading ? [`  ${cyan('╭─')} ${heading}`] : [];

      if (showSearch) {
        const count = searching ? t('ui.matches', { count: filteredIndices.length, total: selectableIndices.length }) : '';
        const showCount = count && size >= width(count) + 16;
        const inputWidth = Math.max(0, size - 6 - (showCount ? width(count) + 2 : 0));
        const text = searching ? queryTail(query, inputWidth - 1) + cyan('▏') : dim(t('ui.search_hint'));
        const content = showCount ? `${pad(text, inputWidth)}  ${dim(count)}` : clip(text, inputWidth);
        lines.push(`  ${gray('│')} ${cyan('/')} ${content}`);
      }

      for (const i of displayIndices.slice(start, end)) {
        const choice = choices[i];
        if (choice.separator) {
          lines.push(`  ${gray('│')} ${clip(dim(choice.name || ''), size - 4)}`);
          continue;
        }
        let label = choice.name;
        if (showDescriptions && choice.description) {
          label = pad(label, labelWidth) + dim(choice.description);
        }
        if (i === cursor) {
          lines.push(`  ${cyan('│')}${inverse(cyan(pad(' › ' + plain(label), size - 3)))}`);
        } else {
          lines.push(`  ${gray('│')}   ${clip(label, size - 6)}`);
        }
      }

      if (!filteredIndices.length) lines.push(`  ${gray('│')}   ${dim(t('ui.no_matches'))}`);
      if (showDetail) lines.push(`  ${gray('│')}   ${clip(dim(choices[cursor].description), size - 6)}`);
      if (showHelp) {
        const helpKey = searching ? 'ui.search_keys' : 'ui.keys';
        const help = t(size < 54 ? helpKey + '_short' : helpKey);
        lines.push(`  ${cyan('╰─')} ${clip(gray(help), size - 5)}`);
      }
      return lines.map((line) => clip(line, size));
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

    // Pasted text emits many keypresses in one turn; paint only the final state.
    function scheduleDraw() {
      if (drawScheduled || done) return;
      drawScheduled = true;
      queueMicrotask(() => {
        drawScheduled = false;
        if (!done) draw();
      });
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
      stdout.removeListener('resize', scheduleDraw);
      process.removeListener('exit', restoreCursor);
      process.removeListener('SIGTERM', terminate);
      process.removeListener('SIGHUP', hangup);
      restoreCursor();
    }

    function onKeypress(str, key = {}) {
      if (done) return;
      let next = cursorPos;
      if ((key.ctrl && key.name === 'c') || (!searching && (key.name === 'escape' || str === 'q'))) {
        cleanup();
        stdout.write('\n');
        process.exit(0);
        return;
      }
      if (key.name === 'escape') {
        searching = false;
        updateQuery('');
        return;
      }
      if (key.name === 'up' || (!searching && str === 'k')) next--;
      else if (key.name === 'down' || (!searching && str === 'j')) next++;
      else if (key.name === 'home') next = 0;
      else if (key.name === 'end') next = filteredIndices.length - 1;
      else if (key.name === 'pageup') next -= layout().visible;
      else if (key.name === 'pagedown') next += layout().visible;
      else if (key.name === 'return' || key.name === 'enter') {
        const choice = choices[getCursor()];
        if (!choice) return;
        erase();
        cleanup();
        stdout.write(clip(`  ${green('✓')} ${message ? message + '  ' : ''}${bold(plain(choice.name))}`, layout().size) + '\n');
        resolve(choice.value);
        return;
      } else if (key.name === 'backspace' && searching) {
        updateQuery(backspace(query));
        return;
      } else if (key.ctrl && key.name === 'u' && searching) {
        updateQuery('');
        return;
      } else if (!searching && str === '/') {
        searching = true;
        scheduleDraw();
        return;
      } else if (str && !key.ctrl && !key.meta && !/[\x00-\x1f\x7f-\x9f]/u.test(str)) {
        searching = true;
        updateQuery(query + str);
        return;
      }
      next = Math.max(0, Math.min(next, filteredIndices.length - 1));
      if (next !== cursorPos) { cursorPos = next; scheduleDraw(); }
    }

    readline.emitKeypressEvents(process.stdin);
    process.stdin.on('keypress', onKeypress);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    stdout.on('resize', scheduleDraw);
    process.once('exit', restoreCursor);
    process.once('SIGTERM', terminate);
    process.once('SIGHUP', hangup);
    stdout.write('\x1b[?25l');
    draw();
  });
}
