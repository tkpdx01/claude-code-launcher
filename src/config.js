import path from 'path';
import os from 'os';

export const HOME = os.homedir();
export const CONFIG_DIR = path.join(HOME, '.ccc');
export const PROFILES_DIR = path.join(CONFIG_DIR, 'profiles');
export const CODEX_PROFILES_DIR = path.join(CONFIG_DIR, 'codex-profiles');
export const TMP_DIR = path.join(CONFIG_DIR, 'tmp');
export const CLAUDE_SETTINGS_PATH = path.join(HOME, '.claude', 'settings.json');
export const CODEX_HOME_PATH = path.join(HOME, '.codex');
