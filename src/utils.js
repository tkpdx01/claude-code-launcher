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

// 从 URL 获取域名作为名称（去掉协议和www子域名）
export function getDomainName(url) {
  try {
    const urlObj = new URL(url);
    // 获取完整域名
    let hostname = urlObj.hostname;
    // 移除 www. 前缀
    hostname = hostname.replace(/^www\./, '');
    return hostname;
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

// 将导入的配置转换为影子配置格式（只包含 API 凭证）
export function convertToClaudeSettings(provider, template) {
  const config = provider.settingsConfig || {};

  // 从 env 中提取 API 信息
  const env = config.env || {};
  const apiKey = env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || config.apiKey || '';
  const apiUrl = env.ANTHROPIC_BASE_URL || config.apiUrl || provider.websiteUrl || '';

  // 影子配置只存储 API 凭证，不用 env 包裹
  return {
    ANTHROPIC_AUTH_TOKEN: apiKey,
    ANTHROPIC_BASE_URL: apiUrl
  };
}

// 格式化显示配置值
export function formatValue(key, value) {
  if ((key === 'apiKey' || key === 'ANTHROPIC_AUTH_TOKEN') && value) {
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

