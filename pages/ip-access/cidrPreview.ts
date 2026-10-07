/**
 * 已通过 rules.cidr() 的地址 → 「单个地址 / 网段 + 覆盖多少地址」，给新增规则时的实时预览用。
 * 单个 IP 由服务端补成 /32（IPv6 为 /128），这里按同样的规则推断，让用户提交前就看到会存成什么。
 */
export interface CidrPreview {
  family: 4 | 6;
  prefix: number;
  single: boolean;
  /** 规范化后的写法（单个 IP 补上前缀长度）。 */
  normalized: string;
  /** IPv4 覆盖的地址数；IPv6 数量太大，不给。 */
  addresses?: number;
}

export function describeCidr(raw: string): CidrPreview | null {
  const value = raw.trim();
  if (!value) return null;
  const [ip, prefixText] = value.split("/");
  if (!ip) return null;
  const family = ip.includes(":") ? 6 : 4;
  const max = family === 4 ? 32 : 128;
  const prefix = prefixText === undefined ? max : Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > max) return null;
  return {
    family,
    prefix,
    single: prefix === max,
    normalized: `${ip}/${prefix}`,
    addresses: family === 4 ? 2 ** (32 - prefix) : undefined,
  };
}
