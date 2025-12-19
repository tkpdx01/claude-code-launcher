// 从文本中提取 URL 和 token
export function extractFromText(text) {
  // 提取 URL
  const urlRegex = /https?:\/\/[^\s"'<>]+/gi;
  const urls = text.match(urlRegex) || [];

  // 提取 sk token
  const tokenRegex = /sk-[a-zA-Z0-9_-]+/g;
  const tokens = text.match(tokenRegex) || [];

  return { urls, tokens };
}

// 从 URL 获取域名作为名称
export function getDomainName(url) {
  try {
    const urlObj = new URL(url);
    // 获取完整域名（包括子域名）
    let hostname = urlObj.hostname;
    // 移除 www. 前缀
    hostname = hostname.replace(/^www\./, '');
    // 将点替换为下划线，使其成为有效的文件名
    return hostname.replace(/\./g, '_');
  } catch {
    return null;
  }
}

// 生成安全的 profile 名称
export function sanitizeProfileName(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')  // 替换 Windows 非法字符
    .replace(/\s+/g, '_')           // 替换空格
    .replace(/_+/g, '_')            // 合并多个下划线
    .replace(/^_|_$/g, '')          // 去除首尾下划线
    .substring(0, 50);              // 限制长度
}

// 将导入的配置转换为 Claude Code settings 格式
export function convertToClaudeSettings(provider, template) {
  const baseSettings = template || {};
  const config = provider.settingsConfig || {};

  // 从 env 中提取 API 信息
  const env = config.env || {};
  const apiKey = env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || config.apiKey || '';
  const apiUrl = env.ANTHROPIC_BASE_URL || config.apiUrl || provider.websiteUrl || '';

  // 构建完整的 settings
  const settings = {
    ...baseSettings,
    apiUrl: apiUrl,
    apiKey: apiKey
  };

  // 保留原始配置中的其他设置
  if (config.model) settings.model = config.model;
  if (config.alwaysThinkingEnabled !== undefined) settings.alwaysThinkingEnabled = config.alwaysThinkingEnabled;
  if (config.includeCoAuthoredBy !== undefined) settings.includeCoAuthoredBy = config.includeCoAuthoredBy;
  if (config.permissions) settings.permissions = config.permissions;

  // 保留 env 中的其他环境变量
  if (env) {
    if (!settings.env) settings.env = {};
    for (const [key, value] of Object.entries(env)) {
      if (key !== 'ANTHROPIC_AUTH_TOKEN' && key !== 'ANTHROPIC_API_KEY' && key !== 'ANTHROPIC_BASE_URL') {
        settings.env[key] = value;
      }
    }
    // 如果 env 为空，删除它
    if (Object.keys(settings.env).length === 0) {
      delete settings.env;
    }
  }

  return settings;
}

// 格式化显示配置值
export function formatValue(key, value) {
  if (key === 'apiKey' && value) {
    return value.substring(0, 15) + '...';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2).split('\n').join('\n      ');
  }
  return String(value);
}

