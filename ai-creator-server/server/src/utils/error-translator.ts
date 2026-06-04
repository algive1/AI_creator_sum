export interface FriendlyError {
  rawCode: string;
  friendlyMessage: string;
  suggestion: string;
}

const SENSITIVE_PATTERN = /(password|secret|token|private[_-]?key|api[_-]?key|authorization|access[_-]?key)/ig;

function cleanMessage(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value || '');
  return raw.replace(SENSITIVE_PATTERN, '[已隐藏]').slice(0, 300);
}

function detectCode(err: any): string {
  return String(
    err?.code ||
    err?.response?.data?.code ||
    err?.response?.data?.Code ||
    err?.response?.status ||
    err?.name ||
    'UNKNOWN',
  );
}

export function translateError(err: any, domain = 'general'): FriendlyError {
  const rawCode = detectCode(err);
  const rawMessage = cleanMessage(err?.response?.data?.message || err?.response?.data?.Message || err?.message || rawCode);
  const code = rawCode.toLowerCase();
  const message = rawMessage.toLowerCase();

  if (code.includes('invalidaccesskeyid')) {
    return {
      rawCode,
      friendlyMessage: 'AccessKey 可能填写错误，当前密钥没有被对象存储平台识别。',
      suggestion: '请重新复制 AccessKeyId / SecretId，并确认没有多余空格。',
    };
  }
  if (code.includes('signaturedoesnotmatch') || message.includes('signature')) {
    return {
      rawCode,
      friendlyMessage: '签名校验失败，通常是 SecretKey、Bucket、Region 或 Endpoint 不匹配。',
      suggestion: '建议重新复制 SecretKey，并确认 Bucket 所在地域和页面填写的 Region 一致。',
    };
  }
  if (code.includes('nosuchbucket')) {
    return {
      rawCode,
      friendlyMessage: 'Bucket 不存在，或者 Bucket 所在地域和当前配置不一致。',
      suggestion: '请到对象存储控制台核对 Bucket 名称和 Region。',
    };
  }
  if (code.includes('accessdenied') || rawCode === '403') {
    return {
      rawCode,
      friendlyMessage: '权限不足，当前密钥可能没有上传、读取或删除测试文件的权限。',
      suggestion: '请检查密钥权限策略和 Bucket 访问策略。',
    };
  }
  if (code.includes('enotfound')) {
    return {
      rawCode,
      friendlyMessage: '域名无法解析，Endpoint 或访问域名可能填写错误。',
      suggestion: '请检查 Endpoint、Domain 是否写错，并确认服务器可以访问外网 DNS。',
    };
  }
  if (code.includes('econnrefused')) {
    return {
      rawCode,
      friendlyMessage: '服务器无法连接到该地址，目标服务可能不可达或端口被拦截。',
      suggestion: '请检查 Endpoint、端口、防火墙和服务状态。',
    };
  }
  if (code.includes('timeout') || message.includes('timeout')) {
    return {
      rawCode,
      friendlyMessage: '连接超时，服务地址可能不可达或接口响应过慢。',
      suggestion: '请检查网络连通性、Base URL、Endpoint 和服务商状态。',
    };
  }
  if (domain === 'wechat-pay' && (message.includes('private key') || message.includes('pem'))) {
    return {
      rawCode,
      friendlyMessage: '商户私钥格式不正确，必须包含完整 PEM 头尾。',
      suggestion: '请粘贴 apiclient_key.pem 的完整内容，包括 BEGIN PRIVATE KEY 和 END PRIVATE KEY。',
    };
  }
  if (domain === 'ai-model') {
    return {
      rawCode,
      friendlyMessage: '模型接口测试失败，可能是 Base URL、API Key、模型名称或接口协议不匹配。',
      suggestion: '请先确认供应商类型和 Base URL，再复制新的 API Key 测试。',
    };
  }
  return {
    rawCode,
    friendlyMessage: rawMessage || '配置检测失败，请检查填写内容是否完整。',
    suggestion: '请根据错误摘要检查配置项；敏感字段不会在这里展示明文。',
  };
}
