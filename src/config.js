import path from 'path';
import os from 'os';

// 配置文件存储目录
export const CONFIG_DIR = path.join(os.homedir(), '.ccc');
export const PROFILES_DIR = path.join(CONFIG_DIR, 'profiles');
export const CODEX_PROFILES_DIR = path.join(CONFIG_DIR, 'codex-profiles');
export const DEFAULT_FILE = path.join(CONFIG_DIR, 'default');
export const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');
export const CODEX_HOME_PATH = path.join(os.homedir(), '.codex');

