import * as store from '../store.js';
import { select } from '../prompt.js';
import { cyan, green, gray, red, yellow, white, blue, magenta, bold } from '../color.js';

function maskKey(key) {
  if (!key) return 'not set';
  return key.substring(0, 15) + '...';
}

export async function showCommand(args) {
  const all = store.getAllProfiles();
  if (all.length === 0) {
    console.log(yellow('No profiles available'));
    process.exit(0);
  }

  let profileInfo;

  if (!args[0]) {
    const choices = all.map((p) => {
      const tag = p.type === 'codex' ? blue('[Codex]') : magenta('[Claude]');
      return { name: `${tag} ${p.name}`, value: p };
    });
    profileInfo = await select('Select profile to view:', choices);
  } else {
    profileInfo = store.resolveProfile(args[0]);
    if (!profileInfo) {
      console.log(red(`Profile "${args[0]}" does not exist`));
      process.exit(1);
    }
  }

  if (profileInfo.type === 'codex') {
    const { apiKey, baseUrl, model } = store.getCodexCredentials(profileInfo.name);
    const profile = store.readCodexProfile(profileInfo.name);

    console.log(`\n  ${bold(cyan(`Profile: ${profileInfo.name}`))} ${blue('[Codex]')}`);
    console.log(gray(`  Path: ${store.getCodexProfileDir(profileInfo.name)}\n`));
    console.log(`  ${cyan('OPENAI_API_KEY')}: ${yellow(maskKey(apiKey))}`);
    console.log(`  ${cyan('Base URL')}: ${white(baseUrl)}`);
    console.log(`  ${cyan('Model')}: ${white(model || '(default)')}`);

    if (profile?.configToml) {
      console.log(`\n  ${cyan('config.toml')}:`);
      for (const line of profile.configToml.split('\n')) {
        console.log(`    ${gray(line)}`);
      }
    }
  } else {
    const { apiKey, apiUrl } = store.getClaudeCredentials(profileInfo.name);
    const profile = store.readClaudeProfile(profileInfo.name);

    console.log(`\n  ${bold(cyan(`Profile: ${profileInfo.name}`))} ${magenta('[Claude]')}`);
    console.log();
    console.log(`  ${cyan('ANTHROPIC_BASE_URL')}: ${white(apiUrl || 'not set')}`);
    console.log(`  ${cyan('ANTHROPIC_AUTH_TOKEN')}: ${yellow(maskKey(apiKey))}`);

    if (profile?.env && Object.keys(profile.env).length > 0) {
      console.log(`\n  ${cyan('Extra env')}:`);
      for (const [k, v] of Object.entries(profile.env)) {
        console.log(`    ${gray(k)}: ${gray(v)}`);
      }
    }

    if (profile?.settings && Object.keys(profile.settings).length > 0) {
      console.log(`\n  ${cyan('Settings overrides')}:`);
      console.log(`    ${gray(JSON.stringify(profile.settings, null, 2).split('\n').join('\n    '))}`);
    }
  }

  console.log();
}
