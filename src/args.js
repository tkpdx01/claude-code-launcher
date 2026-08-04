const DANGEROUS_FLAGS = new Set(['-d', '--dangerous', '--ddd']);
const MANAGEMENT_COMMANDS = new Set([
  'list', 'ls', 'new', 'edit', 'delete', 'rm', 'show', 'apply',
  'models', 'model', 'doctor',
]);

export function parseInvocation(rawArgs) {
  const args = [...rawArgs];
  let dangerous = false;
  let index = 0;

  while (index < args.length && DANGEROUS_FLAGS.has(args[index])) {
    dangerous = true;
    index += 1;
  }

  const first = args[index];
  if (!first) return { kind: 'menu', dangerous, args: [] };

  if (['-h', '--help', 'help'].includes(first)) {
    return { kind: 'help', dangerous: false, args: args.slice(index + 1) };
  }
  if (['-v', '-V', '--version'].includes(first)) {
    return { kind: 'version', dangerous: false, args: [] };
  }
  if (MANAGEMENT_COMMANDS.has(first)) {
    return {
      kind: 'command',
      command: first,
      dangerous,
      args: args.slice(index + 1),
    };
  }

  const passthrough = [];
  let literal = false;
  for (const token of args.slice(index + 1)) {
    if (!literal && token === '--') {
      literal = true;
      passthrough.push(token);
      continue;
    }
    if (!literal && DANGEROUS_FLAGS.has(token)) {
      dangerous = true;
      continue;
    }
    passthrough.push(token);
  }

  return {
    kind: 'launch',
    profile: first,
    dangerous,
    args: passthrough,
  };
}

export function hasOption(args, names) {
  const options = new Set(names);
  for (const arg of args) {
    if (arg === '--') break;
    if (options.has(arg) || [...options].some((name) => arg.startsWith(`${name}=`))) return true;
  }
  return false;
}

export function hasClaudeModelOverride(args) {
  return hasOption(args, ['--model']);
}

export function getCodexModelOverride(args) {
  let model = null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') break;
    if (arg === '-m' || arg === '--model') {
      model = args[index + 1] ?? '';
      index += 1;
    } else if (arg.startsWith('-m=') || arg.startsWith('--model=')) {
      model = arg.slice(arg.indexOf('=') + 1);
    }
  }
  return model;
}

export function hasCodexModelOverride(args) {
  return getCodexModelOverride(args) !== null;
}
