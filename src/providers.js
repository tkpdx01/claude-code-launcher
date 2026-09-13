// Default endpoints and model choices shared by the create/edit commands and the store.

export const ANTHROPIC_DEFAULT_BASE_URL = 'https://api.anthropic.com';
export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/anthropic';

export const DEEPSEEK_MODELS = Object.freeze([
  { name: 'deepseek-chat (V3)', value: 'deepseek-chat' },
  { name: 'deepseek-reasoner (R1)', value: 'deepseek-reasoner' },
]);
