/**
 * logger.js — 统一的服务端日志输出
 *
 * 所有错误日志通过此处集中输出（带时间戳与来源标签），便于排查定位。
 */

/**
 * 输出一条错误日志。
 * @param {string} source 日志来源标签（如 'ssh'、'ws'、'uncaughtException'）
 * @param {unknown} error 错误对象或任意可字符串化的值
 */
export function logServerError(source, error) {
  const detail = error instanceof Error ? `${error.message}\n${error.stack || ''}` : String(error);
  console.error(`[${new Date().toISOString()}] [${source}] ${detail}`);
}
