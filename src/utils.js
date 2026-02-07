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

