import { describe, expect, it } from "vitest";
import {
  maskChineseName,
  maskEmail,
  maskIdentifier,
  maskSensitiveIdentity,
} from "../masking";

describe("maskEmail", () => {
  it("masks standard emails by preserving first 2 and last 2 characters of local part", () => {
    expect(maskEmail("pcamtu927@gmail.com")).toBe("pc***27@gmail.com");
    expect(maskEmail("sokygarrett60@gmail.com")).toBe("so***60@gmail.com");
    expect(maskEmail("xieray5@gmail.com")).toBe("xi***y5@gmail.com");
    expect(maskEmail("yuan364299311@gmail.com")).toBe("yu***11@gmail.com");
  });

  it("handles short emails properly", () => {
    expect(maskEmail("a@b.com")).toBe("*@b.com");
    expect(maskEmail("ab@b.com")).toBe("a***@b.com");
    expect(maskEmail("abc@b.com")).toBe("a***c@b.com");
    expect(maskEmail("abcde@b.com")).toBe("a***e@b.com");
  });

  it("returns non-email string as-is", () => {
    expect(maskEmail("not-an-email")).toBe("not-an-email");
  });
});

describe("maskChineseName", () => {
  it("masks 2-character Chinese names by masking the second char", () => {
    expect(maskChineseName("袁蔚")).toBe("袁*");
    expect(maskChineseName("马瑞")).toBe("马*");
  });

  it("masks 3-character Chinese names by masking the middle char", () => {
    expect(maskChineseName("陈红光")).toBe("陈*光");
    expect(maskChineseName("周禹杰")).toBe("周*杰");
    expect(maskChineseName("姜子豪")).toBe("姜*豪");
    expect(maskChineseName("谢俊伟")).toBe("谢*伟");
    expect(maskChineseName("张妞妞")).toBe("张*妞");
    expect(maskChineseName("安振刚")).toBe("安*刚");
    expect(maskChineseName("申大峰")).toBe("申*峰");
    expect(maskChineseName("葛骏峰")).toBe("葛*峰");
  });

  it("masks 4+-character Chinese names by masking all middle chars", () => {
    expect(maskChineseName("欧阳六七")).toBe("欧**七");
    expect(maskChineseName("诸葛孔明亮")).toBe("诸***亮");
  });

  it("handles single-character names", () => {
    expect(maskChineseName("王")).toBe("王");
  });
});

describe("maskIdentifier", () => {
  it("masks standard alphanumeric usernames preserving first 2 and last 2", () => {
    expect(maskIdentifier("zhouyujie")).toBe("zh***ie");
    expect(maskIdentifier("jiangzihao")).toBe("ji***ao");
    expect(maskIdentifier("77f3f55egang")).toBe("77***ng");
    expect(maskIdentifier("380fef37feng")).toBe("38***ng");
  });

  it("handles short usernames", () => {
    expect(maskIdentifier("a")).toBe("a");
    expect(maskIdentifier("ab")).toBe("a*");
    expect(maskIdentifier("abc")).toBe("a**c");
    expect(maskIdentifier("abcd")).toBe("a**d");
  });
});

describe("maskSensitiveIdentity", () => {
  it("routes emails, Chinese names, and identifiers to their respective masking rules", () => {
    expect(maskSensitiveIdentity("pcamtu927@gmail.com")).toBe("pc***27@gmail.com");
    expect(maskSensitiveIdentity("袁蔚")).toBe("袁*");
    expect(maskSensitiveIdentity("陈红光")).toBe("陈*光");
    expect(maskSensitiveIdentity("zhouyujie")).toBe("zh***ie");
    expect(maskSensitiveIdentity("77f3f55egang")).toBe("77***ng");
  });

  it("handles empty and special values safely", () => {
    expect(maskSensitiveIdentity("")).toBe("");
    expect(maskSensitiveIdentity(null)).toBe("");
    expect(maskSensitiveIdentity(undefined)).toBe("");
    expect(maskSensitiveIdentity("--")).toBe("--");
  });
});
