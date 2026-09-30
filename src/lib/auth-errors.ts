/** Better Auth 客户端返回的错误 */
export type AuthError = { code?: string; message?: string; status: number };

const MESSAGES: Record<string, string> = {
  INVALID_PASSWORD: "密码不正确",
  INVALID_EMAIL_OR_PASSWORD: "邮箱或密码不正确",
  PASSWORD_TOO_SHORT: "密码至少需要 8 位",
  INVALID_CODE: "动态码不正确。如果确认输入无误，请检查手机时间是否准确",
  INVALID_BACKUP_CODE: "备用码不正确，或者已经用过了",
  TOTP_ALREADY_ENABLED: "两步验证已经开启",
  TWO_FACTOR_NOT_ENABLED: "两步验证没有开启",
  ACCOUNT_TEMPORARILY_LOCKED: "验证失败次数太多，账号已临时锁定，请 15 分钟后再试",
  INVALID_TWO_FACTOR_COOKIE: "验证已过期，请重新输入密码登录",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "验证失败次数太多，请重新输入密码登录",
};

/** 需要回到第一步重新输入密码的错误 */
export const RESTART_CODES = new Set([
  "INVALID_TWO_FACTOR_COOKIE",
  "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE",
]);

export function authErrorMessage(error: AuthError, fallback = "操作失败，请稍后再试"): string {
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
  if (error.status === 429) return "尝试太频繁了，请稍等片刻再试";
  // 自定义的中文错误（例如设置令牌不正确）直接显示
  if (error.message && /[一-鿿]/.test(error.message)) return error.message;
  return fallback;
}
