/**
 * 一次失败的登录：既是 toast / 提示条的文案，也带着服务端给的锁定信息。
 *
 * 管理端登录页和门户登录弹窗共用这一个形状。以前两边只拿到一句话，服务端即使
 * 给了「还剩几次」「还要锁多久」也传不到界面上，用户只能盲试，一直试到被锁、
 * 锁了还接着试。
 */
export interface LoginFailure {
  /** 已本地化的失败原因，给 toast 和表单里的提示条用。 */
  message: string;
  /**
   * 锁定解除的时间点（毫秒时间戳）。只有服务端说明了锁多久才会有；
   * 没给时长的锁仍然只是一句提示，不做倒计时。
   */
  lockedUntil?: number;
  /** 再输错几次会被锁定（包含触发锁定的那一次）。服务端没报就没有。 */
  remainingAttempts?: number;
  /**
   * 这次失败对应的账号（已规范化）。锁和剩余次数都是按账号算的：
   * 换成别的账号时，不能拿上一个账号的锁把登录按钮禁掉。
   */
  username?: string;
}

/** 与后端 NormalizeUsername 一致：去掉首尾空白再转小写。 */
export function normalizeLoginUsername(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * 这条失败是否属于表单里当前填写的账号。没记账号的失败（比如按 IP 限流）
 * 对谁都算数。
 */
export function isFailureForUsername(failure: LoginFailure | null, username: string): boolean {
  if (!failure) return false;
  if (failure.username === undefined) return true;
  return failure.username === normalizeLoginUsername(username);
}
