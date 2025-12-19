// 解析 CC-Switch SQL 导出文件
export function parseCCSwitchSQL(content) {
  const providers = [];
  // 匹配 INSERT INTO "providers" 语句
  const insertRegex = /INSERT INTO "providers" \([^)]+\) VALUES \(([^;]+)\);/g;
  let match;

  while ((match = insertRegex.exec(content)) !== null) {
    try {
      const valuesStr = match[1];
      // 解析 VALUES 中的各个字段
      // 格式: 'id', 'app_type', 'name', 'settings_config', 'website_url', ...
      const values = [];
      let current = '';
      let inQuote = false;
      let quoteChar = '';
      let depth = 0;

      for (let i = 0; i < valuesStr.length; i++) {
        const char = valuesStr[i];

        if (!inQuote && (char === "'" || char === '"')) {
          inQuote = true;
          quoteChar = char;
          current += char;
        } else if (inQuote && char === quoteChar && valuesStr[i-1] !== '\\') {
          // 检查是否是转义的引号 ''
          if (valuesStr[i+1] === quoteChar) {
            current += char;
            i++; // 跳过下一个引号
            current += valuesStr[i];
          } else {
            inQuote = false;
            quoteChar = '';
            current += char;
          }
        } else if (!inQuote && char === ',' && depth === 0) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      if (current.trim()) {
        values.push(current.trim());
      }

      // 清理值（去除引号）
      const cleanValue = (v) => {
        if (!v || v === 'NULL') return null;
        if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
          return v.slice(1, -1).replace(/''/g, "'");
        }
        return v;
      };

      const id = cleanValue(values[0]);
      const appType = cleanValue(values[1]);
      const name = cleanValue(values[2]);
      const settingsConfigStr = cleanValue(values[3]);
      const websiteUrl = cleanValue(values[4]);

      // 只处理 claude 类型
      if (appType === 'claude' && settingsConfigStr) {
        try {
          const settingsConfig = JSON.parse(settingsConfigStr);
          providers.push({
            id,
            name,
            websiteUrl,
            settingsConfig
          });
        } catch (e) {
          // JSON 解析失败，跳过
        }
      }
    } catch (e) {
      // 解析失败，跳过
    }
  }

  return providers;
}

// 解析 All API Hub JSON 导出文件
export function parseAllApiHubJSON(content) {
  try {
    const data = JSON.parse(content);
    const accounts = data.accounts?.accounts || [];

    return accounts.map(account => {
      // 从 site_url 提取 base URL
      let baseUrl = account.site_url;
      if (!baseUrl.startsWith('http')) {
        baseUrl = 'https://' + baseUrl;
      }

      // access_token 需要解码（Base64）然后作为 API key
      let apiKey = '';
      if (account.account_info?.access_token) {
        // All API Hub 的 access_token 是加密的，我们使用原始值
        // 实际上需要生成 sk- 格式的 token
        // 这里我们用 site_url + username 来生成一个标识
        apiKey = `sk-${account.account_info.access_token.replace(/[^a-zA-Z0-9]/g, '')}`;
      }

      return {
        id: account.id,
        name: account.site_name,
        websiteUrl: baseUrl,
        settingsConfig: {
          env: {
            ANTHROPIC_AUTH_TOKEN: apiKey,
            ANTHROPIC_BASE_URL: baseUrl
          }
        },
        // 额外的元数据
        meta: {
          siteType: account.site_type,
          health: account.health?.status,
          quota: account.account_info?.quota,
          username: account.account_info?.username
        }
      };
    });
  } catch (e) {
    return [];
  }
}

// 检测文件格式
export function detectFileFormat(content) {
  // 检测 CC-Switch SQL 格式
  if (content.includes('INSERT INTO "providers"') && content.includes('app_type')) {
    return 'ccswitch';
  }

  // 检测 All API Hub JSON 格式
  try {
    const data = JSON.parse(content);
    if (data.accounts?.accounts && Array.isArray(data.accounts.accounts)) {
      // 检查是否有 All API Hub 特有的字段
      const firstAccount = data.accounts.accounts[0];
      if (firstAccount && (firstAccount.site_name || firstAccount.site_url || firstAccount.account_info)) {
        return 'allapihub';
      }
    }
  } catch {
    // 不是有效的 JSON
  }

  return null;
}

