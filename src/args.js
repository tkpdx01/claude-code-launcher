const launcherFlags = new Set(['-d', '--ddd', '-h', '--help', '-v', '--version', '-V']);

// Keep legacy launcher flags, and preserve child argument order and quoting.
// Everything after -- belongs to the child, including flags shared with ccc.
export function parseArgs(args) {
  const flags = new Set();
  const positional = [];
  let passthrough = false;
  for (const arg of args) {
    if (!passthrough && arg === '--') {
      passthrough = true;
    } else if (!passthrough && launcherFlags.has(arg)) {
      flags.add(arg);
    } else {
      positional.push(arg);
    }
  }
  const [cmd, ...rest] = positional;
  return { cmd, rest, flags };
}
