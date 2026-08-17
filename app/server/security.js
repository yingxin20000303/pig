/**
 * security.js — 请求来源（Origin）安全校验
 *
 * 对会修改服务器状态的 REST 请求与 WebSocket 连接进行来源校验，
 * 防止跨站请求伪造（CSRF）与恶意跨站 WebSocket 劫持。
 */

/**
 * 解析并校验 Origin 是否属于受信任来源。
 * 受信任来源 = 当前请求 Host 对应的 http/https + 环境变量 WEBSSH_TRUSTED_ORIGINS 配置的列表。
 * @param {string} origin 请求的 Origin 头
 * @param {string} requestHost 请求的 Host 头
 * @returns {boolean} 是否可信
 */
function isTrustedOrigin(origin, requestHost) {
  try {
    const parsedOrigin = new URL(origin);
    const normalizedHost = String(requestHost || '').toLowerCase();
    const trustedOrigins = new Set([
      `http://${normalizedHost}`,
      `https://${normalizedHost}`,
      ...String(process.env.WEBSSH_TRUSTED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean)
    ]);
    return trustedOrigins.has(parsedOrigin.origin);
  } catch {
    return false;
  }
}

/**
 * 校验会修改服务器状态的 REST 请求（POST/PUT/PATCH/DELETE）来源是否可信。
 * @param {import('express').Request} request Express 请求对象
 * @returns {boolean} 是否可信
 */
export function isTrustedMutationOrigin(request) {
  const origin = request.get('origin');
  if (!origin) return false;
  return isTrustedOrigin(origin, request.headers.host || '');
}

/**
 * 校验 WebSocket 升级请求的来源是否可信。
 * @param {string} origin 请求的 Origin 头
 * @param {import('express').Request} request Express 请求对象
 * @returns {boolean} 是否可信
 */
export function isTrustedWebSocketOrigin(origin, request) {
  if (!origin) return false;
  return isTrustedOrigin(origin, request.headers.host || '');
}
