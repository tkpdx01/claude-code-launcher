import * as store from '../store.js';
import { input, select } from '../prompt.js';
import { promptCodexModel } from '../models.js';
import { cyan, green, gray, red, yellow, blue, magenta } from '../color.js';

export async function editCommand(args) {
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
    profileInfo = await select('Select profile to edit:', choices);
  } else {
    profileInfo = store.resolveProfile(args[0]);
    if (!profileInfo) {
      console.log(red(`Profile "${args[0]}" does not exist`));
      process.exit(1);
    }
  }

  if (profileInfo.type === 'codex') {
    const { apiKey: curKey, baseUrl: curUrl, model: curModel } = store.getCodexCredentials(profileInfo.name);

    console.log(cyan(`\nCurrent config (${profileInfo.name}) ${blue('[Codex]')}:`));
    console.log(gray(`  Base URL: ${curUrl || 'not set'}`));
    console.log(gray(`  OPENAI_API_KEY: ${curKey ? curKey.substring(0, 10) + '...' : 'not set'}`));
    console.log(gray(`  Model: ${curModel || '(default)'}`));
    console.log();

    const baseUrl = await input('Base URL:', curUrl || 'https://api.openai.com/v1');
    const apiKey = await input('OPENAI_API_KEY:', curKey || '');
    const newName = await input('Profile name:', profileInfo.name);
    const model = await promptCodexModel(baseUrl, apiKey, curModel || '');

    if (newName && newName !== profileInfo.name) {
      const check = store.anyProfileExists(newName);
      if (check.exists) {
        console.log(red(`Profile "${newName}" already exists`));
        process.exit(1);
      }
      store.createCodexProfile(newName, apiKey, baseUrl, model);
      store.deleteCodexProfile(profileInfo.name);
      if (store.getDefault() === profileInfo.name) store.setDefault(newName);
      console.log(green(`\nRenamed to "${newName}" and saved`));
    } else {
      store.createCodexProfile(profileInfo.name, apiKey, baseUrl, model);
      console.log(green(`\nProfile "${profileInfo.name}" updated`));
    }
  } else {
    const { apiKey: curKey, apiUrl: curUrl } = store.getClaudeCredentials(profileInfo.name);

    console.log(cyan(`\nCurrent config (${profileInfo.name}) ${magenta('[Claude]')}:`));
    console.log(gray(`  ANTHROPIC_BASE_URL: ${curUrl || 'not set'}`));
    console.log(gray(`  ANTHROPIC_AUTH_TOKEN: ${curKey ? curKey.substring(0, 10) + '...' : 'not set'}`));
    console.log();

    const apiUrl = await input('ANTHROPIC_BASE_URL:', curUrl || '');
    const apiKey = await input('ANTHROPIC_AUTH_TOKEN:', curKey || '');
    const newName = await input('Profile name:', profileInfo.name);

    if (newName && newName !== profileInfo.name) {
      const check = store.anyProfileExists(newName);
      if (check.exists) {
        console.log(red(`Profile "${newName}" already exists`));
        process.exit(1);
      }
      store.saveClaudeProfile(newName, { apiUrl, apiKey });
      store.deleteClaudeProfile(profileInfo.name);
      if (store.getDefault() === profileInfo.name) store.setDefault(newName);
      console.log(green(`\nRenamed to "${newName}" and saved`));
    } else {
      store.saveClaudeProfile(profileInfo.name, { apiUrl, apiKey });
      console.log(green(`\nProfile "${profileInfo.name}" updated`));
    }
  }
}
