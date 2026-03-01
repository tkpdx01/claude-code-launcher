import chalk from 'chalk';
import inquirer from 'inquirer';

const REQUEST_TIMEOUT_MS = 8000;
const MANUAL_INPUT_VALUE = '__manual_input__';

function normalizeBaseUrl(baseUrl) {
  const trimmed = (baseUrl || '').trim();
  return trimmed || 'https://api.openai.com/v1';
}

function buildModelsEndpoint(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl).replace(/\/+$/, '');
  if (normalized.endsWith('/models')) {
    return normalized;
  }

  let url;
  try {
    url = new URL(normalized);
  } catch {
    return `${normalized}/models`;
  }

  const path = url.pathname || '/';
  if (path === '/' || path === '') {
    url.pathname = '/v1/models';
  } else {
    url.pathname = `${path.replace(/\/+$/, '')}/models`;
  }
  return url.toString();
}

export async function fetchOpenAIModelIds(baseUrl, apiKey) {
  const token = (apiKey || '').trim();
  if (!token) {
    throw new Error('API Key 为空');
  }

  const endpoint = buildModelsEndpoint(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text();
      const snippet = body.replace(/\s+/g, ' ').slice(0, 120);
      throw new Error(`HTTP ${response.status}${snippet ? `: ${snippet}` : ''}`);
    }

    const data = await response.json();
    const models = Array.isArray(data?.data) ? data.data : [];

    return models
      .map(item => (typeof item?.id === 'string' ? item.id.trim() : ''))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  } finally {
    clearTimeout(timer);
  }
}

export async function promptCodexModel(baseUrl, apiKey, currentModel = '') {
  const current = (currentModel || '').trim();

  if (!(apiKey || '').trim()) {
    const { model } = await inquirer.prompt([
      {
        type: 'input',
        name: 'model',
        message: 'Model (留空使用默认):',
        default: current
      }
    ]);
    return model;
  }

  console.log(chalk.gray('正在获取模型列表...'));

  try {
    const modelIds = await fetchOpenAIModelIds(baseUrl, apiKey);
    if (modelIds.length === 0) {
      throw new Error('返回了空模型列表');
    }

    const choices = [
      { name: '(默认模型)', value: '' },
      ...modelIds.map(id => ({ name: id, value: id })),
      { name: '手动输入模型 ID', value: MANUAL_INPUT_VALUE }
    ];

    let defaultChoice = '';
    if (current) {
      defaultChoice = modelIds.includes(current) ? current : MANUAL_INPUT_VALUE;
    }

    const { selectedModel } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedModel',
        message: '选择模型:',
        choices,
        default: defaultChoice
      }
    ]);

    if (selectedModel !== MANUAL_INPUT_VALUE) {
      return selectedModel;
    }
  } catch (error) {
    const reason = error?.name === 'AbortError' ? '请求超时' : (error?.message || '未知错误');
    console.log(chalk.yellow(`获取模型列表失败，改为手动输入（${reason}）`));
  }

  const { model } = await inquirer.prompt([
    {
      type: 'input',
      name: 'model',
      message: 'Model (留空使用默认):',
      default: current
    }
  ]);
  return model;
}
