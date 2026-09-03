/**
 * Utilities for masking sensitive identities such as emails,
 * Chinese names, and alphanumeric usernames/identifiers.
 */

/**
 * Mask an email address, e.g. "pcamtu927@gmail.com" -> "pc***27@gmail.com".
 */
export function maskEmail(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) return email;

  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex);

  if (localPart.length <= 1) {
    return `*${domain}`;
  }
  if (localPart.length <= 2) {
    return `${localPart[0]}***${domain}`;
  }
  if (localPart.length <= 5) {
    return `${localPart[0]}***${localPart.slice(-1)}${domain}`;
  }
  return `${localPart.slice(0, 2)}***${localPart.slice(-2)}${domain}`;
}

/**
 * Mask a Chinese name according to common conventions:
 * 2 characters: "袁蔚" -> "袁*"
 * 3 characters: "陈红光" -> "陈*光"
 * 4+ characters: "欧阳六七" -> "欧**七"
 */
export function maskChineseName(name: string): string {
  const chars = Array.from(name);
  if (chars.length <= 1) return name;
  if (chars.length === 2) {
    return `${chars[0]}*`;
  }
  if (chars.length === 3) {
    return `${chars[0]}*${chars[2]}`;
  }
  const maskedMiddle = "*".repeat(chars.length - 2);
  return `${chars[0]}${maskedMiddle}${chars[chars.length - 1]}`;
}

/**
 * Mask a general identifier/username, e.g. "zhouyujie" -> "zh***ie",
 * "77f3f55egang" -> "77***ng".
 */
export function maskIdentifier(identifier: string): string {
  const chars = Array.from(identifier);
  if (chars.length <= 1) return identifier;
  if (chars.length === 2) {
    return `${chars[0]}*`;
  }
  if (chars.length <= 4) {
    return `${chars[0]}**${chars[chars.length - 1]}`;
  }
  return `${chars.slice(0, 2).join("")}***${chars.slice(-2).join("")}`;
}

/**
 * Regex matching strings composed entirely of Chinese characters (Han script).
 */
const HAN_REGEX = /^[\p{Script=Han}]+$/u;

/**
 * Unified masking function for identities displayed in the console:
 * emails, Chinese names, and usernames/account IDs.
 */
export function maskSensitiveIdentity(value: string | undefined | null): string {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === "--") return trimmed;

  if (trimmed.includes("@")) {
    return maskEmail(trimmed);
  }
  if (HAN_REGEX.test(trimmed)) {
    return maskChineseName(trimmed);
  }
  return maskIdentifier(trimmed);
}
