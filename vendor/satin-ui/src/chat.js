// 聊天与 AI 对话（Chat）
// 1. 超多消息也流畅：只渲染视口上下各一屏多；行高先估、渲染后按实际量出来的缓存；视口上方的条目高度变了，就补偿滚动位置，看着的内容不动。
// 2. 已经在内存里的消息永远直接画真内容，滚得再快也不换骨架；渲染窗口外的空隙铺一层很淡的纹理兜底，不露白。
// 3. 往上快到顶时提前加载更早的一页，插入后把滚动位置补回去，视口不跳。
// 4. 发送：输入框里的字原地变成气泡，果断地飞进它在列表里的位置（弹簧曲线：一起步就是高速，再柔和停住；竖直略快于水平，带一点弧度）；影子每帧追着真实落点，
//    落地那一帧和真气泡完全重合。图片缩略图边飞边放大。原来的消息同时让位上移，输入框同时平滑收起。
// 5. AI 回复：等用户的消息落地再开始。先思考（灰字流出，结束后自动收起），再列步骤，再逐词流出正文、镜头卡片和生成的画面；随时可以停止。
//    流式文字先进缓冲，再按匀速放出来，网络一阵快一阵慢也不会忽快忽停；贴底时视口用弹簧平滑跟着往下走，没有速度突变。
// 让位、贴底、影子都在同一个 rAF 里算：同一帧里互相对得上，主线程慢了也是一起慢，不会彼此错位。
import { toast } from "./feedback.js";
import { fmtSize, midEllipsis, waveBars } from "./data.js";
import { scrollArea } from "./scroll.js";
import { openLightbox } from "./lightbox.js";
import { $, $$, reduced, injectIcons } from "./core.js";
import { icon } from "./icons.js";
import { scoped } from "./i18n.js";
import I18N_DEFAULTS from "./locales/zh-CN/chat.js";
const tt = /* @__PURE__ */ scoped(I18N_DEFAULTS);
import { composerHTML } from "./components.js";
import { mountComposer, syncComposerParts } from "./input.js";
import { defineComponent } from "./lifecycle.js";
// 对话框的标记（放进一个空的 .sn-chat 容器里）：顶栏（名字；写了 status 才有下面那行）、消息区（虚拟列表的画布、跳到最新）、底部提示词输入框。
// mountChat 遇到空容器会自己用它填好，一般不用直接调
// 新对话（empty）：还没有消息时，消息区正中放单色图标、标题、副标题、几个建议（点了填进输入框）；给 true 只留一个空的容器（框架里自己画，见实例的 emptyEl）。
// 不写 empty 也有一个默认的（对话图标 + "有什么可以帮你？"），给 false 才不要。给了 history 时先藏着，挂上以后没有消息才露出来。
// 有空状态时底部输入框带 sn-cm-new（新对话那一套交互）
const emptyOf = (empty) => (empty === undefined ? { icon: "message-circle", title: tt("chat.empty") } : empty);
const chatEmptyHTML = (e, hide) => {
  if (!e) return "";
  const o = e === true ? {} : e;
  return `<div class="sn-chat-empty" data-chat-empty${hide ? " hidden" : ""}>` +
    (o.icon ? `<span class="sn-chat-empty-ic" data-i="${esc(o.icon)}" aria-hidden="true"></span>` : "") +
    // 标题、说明用 div（标题带 role="heading"）：页面上给 h3、p 写的样式（比如设计稿的 .spec h3）管不到这里
    (o.title ? `<div class="sn-chat-empty-t" role="heading" aria-level="2">${esc(o.title)}</div>` : "") +
    (o.subtitle ? `<div class="sn-chat-empty-sub">${esc(o.subtitle)}</div>` : "") +
    (o.suggestions?.length ? `<div class="sn-chat-sugs">${o.suggestions.map((t) => `<button type="button" class="sn-chat-sug">${esc(t)}</button>`).join("")}</div>` : "") +
    `</div>`;
};
export const chatHTML = ({ title = "", status, placeholder = "", max = 500, maxLines = 5, attach = true, voice = true, submitKey = "enter", empty: em, history, context, mode, models, model, menu, newChat } = {}) => {
  const empty = emptyOf(em);
  // 顶栏两侧（可选）：左边会话列表、右边新对话，像 ChatGPT / Codex 的手机端；单色细线图标，点了发 menu / newChat
  const hb = (on, k, ic, label) => (on ? `<button type="button" class="sn-btn sn-ghost sn-ibtn sn-chat-hb" data-chat-${k} data-tip="${esc(label)}" aria-label="${esc(label)}" data-i="${ic}"></button>` : "");
  return `<div class="sn-chat-hd${menu || newChat ? " sn-has-btns" : ""}">${hb(menu, "menu", "menu", tt("chat.menu"))}<div class="sn-tx"><b>${esc(title)}</b><span class="sn-sub"><span data-chat-status>${esc(status ?? "")}</span></span></div>${hb(newChat, "new", "square-pen", tt("chat.newChat"))}</div>` +
  `<div class="sn-chat-body"><div class="sn-chat-vp"><div class="sn-chat-canvas"><div class="sn-chat-ph sn-top"></div><div class="sn-chat-ph sn-bot"></div></div></div><button class="sn-chat-jump" data-chat-jump aria-label="${esc(tt("chat.jump"))}"><span data-i="arrow-down"></span><span class="sn-badge" hidden>0</span></button>${chatEmptyHTML(empty, !!history)}</div>` +
  `<div class="sn-chat-foot">${composerHTML({ placeholder, max, maxLines, attach, voice, submitKey, external: true, context, mode, models, model, fresh: !!empty })}</div>`;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmtClock = () => new Date().toTimeString().slice(0, 5);
const fmtSec = (s) => (s < 10 ? s.toFixed(1).replace(/\.0$/, "") : String(Math.round(s)));
const fmtNum = (n) => Number(n || 0).toLocaleString("en-US");
const LD_MATRIX = '<span class="sn-ld sn-ld-matrix sn-xs" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>';
const LD_ARC = '<span class="sn-ld sn-ld-arc sn-xs" aria-hidden="true"><svg viewBox="0 0 24 24"><circle class="sn-ld-tr" cx="12" cy="12" r="9"/><circle class="sn-ld-hd" cx="12" cy="12" r="9"/></svg></span>';
const LD_ORB = '<span class="sn-act-orb" aria-hidden="true"><i></i><i></i><i></i></span>';
const IC_TERM = '<svg class="sn-ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 17 6-5-6-5"/><path d="M12 19h7"/></svg>';
const IC_THINK = '<svg class="sn-ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 4.5a3.3 3.3 0 0 0-3.1 4.4A3.1 3.1 0 0 0 5.3 15a3.2 3.2 0 0 0 4.2 3v1a2 2 0 0 0 2.5 1.8V4.5a2.4 2.4 0 0 0-2.5 0Z"/><path d="M14.5 4.5a3.3 3.3 0 0 1 3.1 4.4A3.1 3.1 0 0 1 18.7 15a3.2 3.2 0 0 1-4.2 3v1a2 2 0 0 1-2.5 1.8V4.5a2.4 2.4 0 0 1 2.5 0Z"/></svg>';
const IC_SUM = '<svg class="sn-ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14.7 6.3 3 3-9.8 9.8a2.1 2.1 0 0 1-3-3l9.8-9.8Z"/><path d="m13 4 7 7-1.8 1.8-7-7L13 4Z"/></svg>';

// ———— 安全轻量语法高亮器（JSON / Diff / Shell / JS / TS / CSS / HTML / Python / SQL）————
// 全程先分词再 esc() 转义，绝不输出任何未转义原始 HTML，彻底杜绝 XSS
const HL_FAMILY = { javascript: "js", jsx: "js", ts: "js", typescript: "js", tsx: "js", mjs: "js", cjs: "js", python: "py", golang: "go", jsonc: "json", scss: "css", less: "css", xml: "html", svg: "html", vue: "html", bash: "sh", zsh: "sh", shell: "sh", cmd: "sh", console: "sh", patch: "diff" };
const HL_LABEL = { js: "JS", ts: "TS", jsx: "JSX", tsx: "TSX", json: "JSON", diff: "DIFF", sh: "BASH", bash: "BASH", zsh: "ZSH", shell: "SHELL", css: "CSS", scss: "SCSS", html: "HTML", py: "PY", python: "PY", go: "GO", sql: "SQL", text: "TEXT", txt: "TEXT" };
const HL_KW = {
  js: new Set("break case catch class const continue default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while yield async await interface type enum implements readonly as keyof infer satisfies".split(" ")),
  py: new Set("and as assert async await break class continue def del elif else except finally for from global if import in is lambda not or pass raise return try while with yield match case self".split(" ")),
  go: new Set("break case chan const continue default defer else for func go goto if import interface map package range return select struct switch type var".split(" ")),
  sh: new Set("if then else elif fi for while until do done case esac function in return export local set unset echo cd source exit sudo".split(" ")),
  sql: new Set("select from where insert into values update set delete create table index view drop alter add join left right inner outer on group by order having limit offset as and or not is in like between distinct union all case when then else end primary key foreign unique asc desc".split(" ")),
};
const HL_LIT = { js: new Set(["true", "false", "null", "undefined", "NaN", "Infinity"]), py: new Set(["True", "False", "None"]), go: new Set(["true", "false", "nil", "iota"]), sql: new Set(["null", "true", "false"]) };
const HL_RULES = {
  json: [["prop", /"(?:\\.|[^"\\\n])*"(?=\s*:)/y], ["str", /"(?:\\.|[^"\\\n])*"?/y], ["num", /-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/iy], ["kw", /\b(?:true|false|null)\b/y], ["com", /\/\/[^\n]*/y]],
  js: [["com", /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y], ["str", /`(?:\\[\s\S]|[^`\\])*`?|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?/y], ["num", /\b(?:0[xob][\da-f_]+|\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?n?)\b/iy]],
  py: [["com", /#[^\n]*/y], ["str", /[rbfu]{0,2}(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)/iy], ["num", /\b\d[\d_]*(?:\.\d+)?\b/iy], ["attr", /@[\w.]+/y]],
  go: [["com", /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y], ["str", /`[^`]*`?|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?/y], ["num", /\b(?:0[xob][\da-f_]+|\d[\d_]*(?:\.\d+)?)\b/iy]],
  sh: [["com", /(?<![\w$])#[^\n]*/y], ["str", /"(?:\\.|[^"\\])*"?|'[^']*'?/y], ["prop", /\$\{[^}]*\}?|\$[\w@#?*!-]+/y], ["attr", /(?<=\s)--?[\w-]+/y], ["num", /\b\d+\b/y]],
  sql: [["com", /--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y], ["str", /'(?:''|[^'])*'?/y], ["num", /\b\d+(?:\.\d+)?\b/y]],
  css: [["com", /\/\*[\s\S]*?(?:\*\/|$)/y], ["str", /"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?/y], ["kw", /@[\w-]+/y], ["prop", /[\w-]+(?=\s*:(?!:))/y], ["num", /#[\da-f]{3,8}\b|-?\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms|deg|fr)?\b/iy], ["fn", /[\w-]+(?=\()/y], ["attr", /[.#][\w-]+|::?[\w-]+/y]],
  html: [["com", /<!--[\s\S]*?(?:-->|$)/y], ["tag", /<\/?[a-zA-Z][\w:-]*|\/?>/y], ["attr", /(?<=\s)[\w:@.-]+(?==)/y], ["str", /"[^"]*"?|'[^']*'?/y]],
};
const inferLang = (path, content) => {
  if (path) {
    const ext = String(path).split(".").pop()?.toLowerCase();
    if (ext && (HL_FAMILY[ext] || HL_RULES[ext])) return ext;
  }
  const s = String(content || "").trim();
  if (!s) return "text";
  if (/^(?:diff --git |---\s+\S|\+\+\+\s+\S|@@\s+-\d+)/m.test(s)) return "diff";
  if ((s[0] === "{" && s.at(-1) === "}") || (s[0] === "[" && s.at(-1) === "]")) { try { JSON.parse(s); return "json"; } catch { /* ignore */ } }
  return "text";
};
const diffCounts = (code) => {
  let add = 0, del = 0;
  for (const ln of String(code || "").split("\n")) {
    if (ln.startsWith("+") && !ln.startsWith("+++")) add++;
    else if (ln.startsWith("-") && !ln.startsWith("---")) del++;
  }
  return { add, del };
};
function highlightCode(raw, lang0 = "") {
  const code = String(raw ?? ""), l0 = String(lang0 || "").toLowerCase(), f = HL_FAMILY[l0] || l0;
  if (f === "diff") {
    return code.split("\n").map((ln) => {
      const cls = ln.startsWith("@@") ? "sn-dl sn-dl-hunk"
        : ln.startsWith("+++") || ln.startsWith("---") || ln.startsWith("diff ") || ln.startsWith("index ") ? "sn-dl sn-dl-meta"
        : ln.startsWith("+") ? "sn-dl sn-dl-add"
        : ln.startsWith("-") ? "sn-dl sn-dl-del" : "sn-dl";
      return `<span class="${cls}">${esc(ln) || " "}</span>`;
    }).join("");
  }
  const rules = HL_RULES[f];
  if (!rules) return code.split("\n").map((ln) => `<span class="sn-cl">${esc(ln) || " "}</span>`).join("");
  const toks = []; let i = 0; const n = code.length;
  const atLineStart = (pos) => { let k = pos - 1; while (k >= 0 && code[k] !== "\n" && /\s/.test(code[k])) k--; return k < 0 || code[k] === "\n"; };
  while (i < n) {
    if (f === "sh" && code[i] === "$" && code[i + 1] === " " && atLineStart(i)) { toks.push(["pun", "$ "]); i += 2; continue; }
    let matched = false;
    for (const [t, re] of rules) { re.lastIndex = i; const m = re.exec(code); if (m && m[0]) { toks.push([t, m[0]]); i += m[0].length; matched = true; break; } }
    if (matched) continue;
    const c = code[i];
    if (/[A-Za-z_$\u00c0-\uffff]/.test(c) && f !== "html" && f !== "json") {
      const reW = /[\w$\u00c0-\uffff]+/y; reW.lastIndex = i; const w = reW.exec(code)[0];
      let a = i + w.length; while (a < n && /\s/.test(code[a])) a++;
      let b = i - 1; while (b >= 0 && /\s/.test(code[b])) b--;
      const after = a < n ? code[a] : "", before = b >= 0 ? code[b] : "";
      const lw = f === "sql" ? w.toLowerCase() : w;
      const t = HL_KW[f]?.has(lw) ? "kw" : HL_LIT[f]?.has(lw) ? "kw" : before === "." ? "prop" : after === "(" ? "fn" : (f === "js" || f === "go") && /^[A-Z]/.test(w) ? "typ" : f === "sh" && (atLineStart(i) || before === "|" || before === "&" || before === ";") ? "fn" : "";
      toks.push([t, w]); i += w.length; continue;
    }
    if (/[+\-*/%=<>!&|^~?:]/.test(c)) { const reO = /[+\-*/%=<>!&|^~?:]+/y; reO.lastIndex = i; const o = reO.exec(code)[0]; toks.push(["op", o]); i += o.length; continue; }
    if (/[{}()[\];,.]/.test(c)) { toks.push(["pun", c]); i++; continue; }
    toks.push(["", c]); i++;
  }
  const lines = [""];
  for (const [t, s] of toks) {
    const parts = s.split("\n");
    for (let k = 0; k < parts.length; k++) {
      if (k) lines.push("");
      if (parts[k]) lines[lines.length - 1] += t ? `<span class="sn-t-${t}">${esc(parts[k])}</span>` : esc(parts[k]);
    }
  }
  return lines.map((ln) => `<span class="sn-cl">${ln || " "}</span>`).join("");
}

// ———— 安全轻量 Markdown 渲染（零原始 HTML 注入，支持标题/加粗/斜体/删除线/行内代码/安全链接/列表/引用/表格/高亮代码块）————
const MD_PROBE = /```|`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\[[^\]\n]+\]\([^)\n]+\)|(^|\n)\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+\.\s|>\s|-{3,}\s*$|\|[^|\n]+\|)/;
const hasMarkdown = (s) => typeof s === "string" && s.length > 1 && MD_PROBE.test(s);
const safeHref = (u) => {
  const s = String(u || "").replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, "").replace(/[\t\n\r]/g, "");
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s) || /^(https?:|mailto:)/i.test(s)) return s;
  return "#";
};
const mdInline = (raw) => {
  let out = "", i = 0; const s = String(raw ?? ""), n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === "`") {
      const m = /^(`+)([^`\n]+?)\1/.exec(s.slice(i));
      if (m) { out += `<code class="sn-md-code-in">${esc(m[2].trim())}</code>`; i += m[0].length; continue; }
    }
    if (c === "[") {
      const m = /^\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/.exec(s.slice(i));
      if (m) {
        const u = safeHref(m[2]), ext = /^https?:/i.test(u);
        out += `<a href="${esc(u)}"${m[3] ? ` title="${esc(m[3])}"` : ""}${ext ? ' target="_blank" rel="noopener noreferrer"' : ""}>${mdInline(m[1])}</a>`;
        i += m[0].length; continue;
      }
    }
    if (c === "*" || c === "_") {
      const m2 = /^(\*\*|__)(?=\S)([^\n]+?\S)\1/.exec(s.slice(i));
      if (m2) { out += `<strong>${mdInline(m2[2])}</strong>`; i += m2[0].length; continue; }
      const prev = s[i - 1] || "";
      if (c === "*" || !/[\w\u4e00-\u9fff]/.test(prev)) {
        const m1 = /^(\*|_)(?=\S)([^\n*]+?\S)\1/.exec(s.slice(i));
        if (m1 && (c === "*" || !/[\w\u4e00-\u9fff]/.test(s[i + m1[0].length] || ""))) { out += `<em>${mdInline(m1[2])}</em>`; i += m1[0].length; continue; }
      }
    }
    if (c === "~" && s[i + 1] === "~") {
      const m = /^~~(?=\S)([^\n]+?\S)~~/.exec(s.slice(i));
      if (m) { out += `<del>${mdInline(m[1])}</del>`; i += m[0].length; continue; }
    }
    if (c === "\n") { out += "<br>"; i++; continue; }
    out += esc(c); i++;
  }
  return out;
};
function renderChatCodeBox({ label = "", content = "", lang = "", showLines = false, badge = "" }) {
  const raw = String(content ?? "");
  const l = (lang || inferLang(label, raw)).toLowerCase();
  const f = HL_FAMILY[l] || l;
  const tag = HL_LABEL[l] || HL_LABEL[f] || (l ? l.toUpperCase() : "");
  let stat = "";
  if (f === "diff") {
    const { add, del } = diffCounts(raw);
    if (add || del) stat = `<span class="sn-tcode-stat sn-num">${add ? `<i class="sn-add">+${add}</i>` : ""}${del ? `<i class="sn-del">-${del}</i>` : ""}</span>`;
  }
  const hasHead = !!(label || tag || stat || badge);
  return `<div class="sn-tcode${showLines && f !== "diff" ? " sn-tcode-ln" : ""}${f === "diff" ? " sn-tcode-diff" : ""}">` +
    (hasHead
      ? `<div class="sn-tcode-hd">` +
        (label ? `<span class="sn-tcode-lbl">${esc(label)}</span>` : "") +
        (tag ? `<span class="sn-tcode-lang">${esc(tag)}</span>` : "") +
        (badge ? `<span class="sn-tcode-badge sn-num">${esc(badge)}</span>` : "") +
        stat +
        `<button type="button" class="sn-tcode-copy" data-copy-code aria-label="${esc(tt("chat.14"))}" data-tip="${esc(tt("chat.14"))}"><span class="sn-swap"><span class="sn-a">${icon("copy", 12)}</span><span class="sn-b">${icon("check", 12)}</span></span></button>` +
        `</div>`
      : "") +
    `<pre class="sn-tcode-pre"><code>${highlightCode(raw, l)}</code></pre></div>`;
}
function renderChatMD(raw) {
  const lines = String(raw ?? "").replace(/\r\n?/g, "\n").split("\n"), out = [];
  let i = 0;
  const isSep = (l) => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(l) && l.includes("|");
  const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    const fm = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)(?:\s+(.*))?$/.exec(l);
    if (fm) {
      const ch = fm[1][0], minLen = fm[1].length, lang = fm[2] || "", body = [];
      const closeRe = new RegExp(`^\\s{0,3}${ch === "`" ? "`" : "~"}{${minLen},}\\s*$`);
      i++;
      while (i < lines.length && !closeRe.test(lines[i])) { body.push(lines[i]); i++; }
      if (i < lines.length) i++;
      out.push(renderChatCodeBox({ label: (fm[3] || "").trim(), content: body.join("\n"), lang: lang || "text", showLines: true }));
      continue;
    }
    const hm = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l);
    if (hm) { const lv = Math.min(4, hm[1].length); out.push(`<div class="sn-md-h sn-md-h${lv}">${mdInline(hm[2])}</div>`); i++; continue; }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l)) { out.push('<hr class="sn-md-hr">'); i++; continue; }
    if (l.includes("|") && i + 1 < lines.length && isSep(lines[i + 1])) {
      const hd = cells(l); i += 2; const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) { rows.push(cells(lines[i])); i++; }
      out.push(`<div class="sn-md-tbl"><table><thead><tr>${hd.map((c) => `<th>${mdInline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${hd.map((_, k) => `<td>${mdInline(r[k] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (/^\s{0,3}>\s?/.test(l)) {
      const q = [];
      while (i < lines.length && /^\s{0,3}>\s?/.test(lines[i])) { q.push(lines[i].replace(/^\s{0,3}>\s?/, "")); i++; }
      out.push(`<blockquote class="sn-md-bq">${mdInline(q.join("\n"))}</blockquote>`);
      continue;
    }
    if (/^\s{0,3}(?:[-*+]|\d+\.)\s+/.test(l)) {
      const ord = /^\s{0,3}\d+\.\s+/.test(l), items = [];
      while (i < lines.length && (ord ? /^\s{0,3}\d+\.\s+/ : /^\s{0,3}[-*+]\s+/).test(lines[i])) {
        const txt = lines[i].replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+/, "");
        const tm = /^\[([ xX])\]\s+(.*)$/.exec(txt);
        items.push(tm ? `<li class="sn-md-task"><i class="sn-md-chk${tm[1] !== " " ? " sn-on" : ""}"></i><span>${mdInline(tm[2])}</span></li>` : `<li>${mdInline(txt)}</li>`);
        i++;
      }
      out.push(ord ? `<ol class="sn-md-ls">${items.join("")}</ol>` : `<ul class="sn-md-ls">${items.join("")}</ul>`);
      continue;
    }
    const para = [l]; i++;
    while (i < lines.length && lines[i].trim() && !/^\s{0,3}(?:`{3,}|~{3,}|#{1,6}\s|[-*+]\s|\d+\.\s|>\s|-{3,}\s*$)/.test(lines[i]) && !(lines[i].includes("|") && i + 1 < lines.length && isSep(lines[i + 1]))) { para.push(lines[i]); i++; }
    out.push(`<p>${mdInline(para.join("\n"))}</p>`);
  }
  return out.join("");
}

// 独立可复用的「侧边迷你定位刻度轨 + 悬停摘要浮窗」（Thread Rail / Minimap）
// 可挂进对话容器或任意长文档：每条对应一根细横线，激活与悬停时平滑伸长加亮，紧邻侧边淡入圆角摘要气泡，点击丝滑跳转。
// 选项：{ side: "left" | "right", max: 18, onSelect(item, index) }，所有尺寸/圆角/颜色/虚化均可经 --sn-rail-* CSS 变量自定义。
export function mountThreadRail(host, { side = "left", max = 18, onSelect } = {}) {
  const nav = document.createElement("nav");
  nav.className = "sn-rail";
  nav.dataset.side = side === "right" ? "right" : "left";
  nav.setAttribute("aria-label", tt("chat.31"));
  nav.innerHTML = '<div class="sn-rail-ticks"></div><div class="sn-rail-tip" aria-hidden="true"><span class="sn-rail-tip-txt"></span><span class="sn-rail-tip-meta sn-num"></span></div>';
  host.append(nav);
  const ticksEl = nav.firstElementChild, tipEl = nav.lastElementChild, tipTxt = tipEl.firstElementChild, tipMeta = tipEl.lastElementChild;
  let list = [], activeId = null, hoverIdx = -1, sig = "", hadActive = false;
  const WAVE_R = 2.6;
  const clearWave = () => {
    nav.classList.remove("sn-rail-track");
    for (const b of ticksEl.children) b.style.removeProperty("--sn-rp");
  };
  const applyWaveY = (clientY) => {
    const kids = ticksEl.children;
    if (!kids.length) return -1;
    let nearest = -1, minDist = Infinity;
    for (let i = 0; i < kids.length; i++) {
      const b = kids[i], r = b.getBoundingClientRect(), cy = r.top + r.height / 2, step = r.height || 14;
      const dist = Math.abs(cy - clientY), nd = dist / step;
      if (dist < minDist) { minDist = dist; nearest = i; }
      const p = nd < WAVE_R ? (0.5 + 0.5 * Math.cos((Math.PI * nd) / WAVE_R)) ** 1.35 : 0;
      if (p > 0.005) b.style.setProperty("--sn-rp", p.toFixed(3));
      else b.style.removeProperty("--sn-rp");
    }
    return nearest;
  };
  const applyWaveIdx = (idx) => {
    const kids = ticksEl.children;
    for (let i = 0; i < kids.length; i++) {
      const nd = Math.abs(i - idx), p = nd < WAVE_R ? (0.5 + 0.5 * Math.cos((Math.PI * nd) / WAVE_R)) ** 1.35 : 0;
      if (p > 0.005) kids[i].style.setProperty("--sn-rp", p.toFixed(3));
      else kids[i].style.removeProperty("--sn-rp");
    }
  };
  const syncNear = () => {
    const kids = ticksEl.children;
    let ai = -1;
    for (let i = 0; i < kids.length; i++) if (kids[i].classList.contains("sn-on")) { ai = i; break; }
    for (let i = 0; i < kids.length; i++) kids[i].classList.toggle("sn-near", ai >= 0 && Math.abs(i - ai) === 1);
  };
  const pulseTick = (btn, cls) => {
    if (!btn || reduced()) return;
    btn.classList.remove("sn-rail-hit", "sn-rail-pop");
    void btn.offsetWidth;
    btn.classList.add(cls);
  };
  const setTip = (idx) => {
    const wasOpen = tipEl.classList.contains("sn-on"), changed = idx !== hoverIdx;
    hoverIdx = idx;
    const it = list[idx], btn = ticksEl.children[idx];
    if (!it || !btn) { tipEl.classList.remove("sn-on", "sn-rail-glide"); return; }
    if (changed) {
      tipTxt.textContent = it.summary || "";
      tipMeta.textContent = it.meta || "";
      tipMeta.hidden = !it.meta;
    }
    const nr = nav.getBoundingClientRect(), br = btn.getBoundingClientRect();
    const ry = Math.round(br.top - nr.top + br.height / 2) + "px";
    if (!wasOpen) {
      // 首次出现时原地定格再淡入，避免从上次位置飞过来
      tipEl.classList.remove("sn-rail-glide");
      tipEl.style.setProperty("--sn-ry", ry);
      void tipEl.offsetWidth;
      tipEl.classList.add("sn-on");
    } else {
      tipEl.classList.add("sn-rail-glide");
      tipEl.style.setProperty("--sn-ry", ry);
    }
  };
  const setItems = (arr = []) => {
    const sliced = arr.length > max ? arr.slice(-max) : arr;
    const nextSig = sliced.map((x) => `${x.id}:${x.summary}`).join("\n");
    if (nextSig === sig) return;
    sig = nextSig; list = sliced;
    nav.hidden = list.length < 2;
    ticksEl.innerHTML = list.map((it, i) =>
      `<button type="button" class="sn-rail-tick${it.id === activeId ? " sn-on" : ""}" data-idx="${i}" data-id="${esc(it.id)}" aria-label="${esc(it.summary)}"><i></i></button>`
    ).join("");
    syncNear();
    if (hoverIdx >= 0) setTip(hoverIdx < list.length ? hoverIdx : -1);
  };
  const setActive = (id, fromClick = false) => {
    if (id === activeId) return;
    activeId = id;
    let activeBtn = null;
    for (const b of ticksEl.children) {
      const on = String(b.dataset.id) === String(id);
      b.classList.toggle("sn-on", on);
      if (on) activeBtn = b;
    }
    syncNear();
    if (hadActive && activeBtn && !fromClick) pulseTick(activeBtn, "sn-rail-pop");
    hadActive = true;
  };
  const setSide = (s) => {
    if (s === false || s === "off" || s === "none") { nav.classList.add("sn-off"); return; }
    nav.classList.remove("sn-off");
    nav.dataset.side = s === "right" ? "right" : "left";
  };
  ticksEl.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    nav.classList.add("sn-rail-track");
    const idx = applyWaveY(e.clientY);
    if (idx >= 0) setTip(idx);
  });
  ticksEl.addEventListener("pointerover", (e) => {
    if (e.pointerType === "touch") return;
    const b = e.target.closest(".sn-rail-tick");
    if (!b) return;
    nav.classList.add("sn-rail-track");
    const idx = applyWaveY(e.clientY);
    setTip(idx >= 0 ? idx : Number(b.dataset.idx));
  });
  ticksEl.addEventListener("focusin", (e) => {
    const b = e.target.closest(".sn-rail-tick");
    if (!b) return;
    const idx = Number(b.dataset.idx);
    applyWaveIdx(idx);
    setTip(idx);
  });
  nav.addEventListener("pointerleave", () => { clearWave(); setTip(-1); });
  nav.addEventListener("focusout", (e) => { if (!nav.contains(e.relatedTarget)) { clearWave(); setTip(-1); } });
  ticksEl.addEventListener("animationend", (e) => e.target.closest(".sn-rail-tick")?.classList.remove("sn-rail-hit", "sn-rail-pop"));
  ticksEl.addEventListener("click", (e) => {
    const b = e.target.closest(".sn-rail-tick"); if (!b) return;
    const idx = Number(b.dataset.idx), it = list[idx];
    if (it) { setActive(it.id, true); pulseTick(b, "sn-rail-hit"); onSelect?.(it, idx); }
  });
  return { el: nav, setItems, setActive, setSide, destroy() { nav.remove(); } };
}

export const createThreadRail = /* @__PURE__ */ defineComponent({
  name: "thread-rail",
  defaults: { side: "left", max: 18, items: [] },
  html: () => `<div class="sn-rail-host"></div>`,
  mount(el, o, api) {
    const r = mountThreadRail(el, { side: o.side, max: o.max, onSelect: (it, index) => api.emit("select", { item: it, index }) });
    r.setItems(o.items || []);
    if (o.activeId != null) r.setActive(o.activeId);
    return {
      setItems: r.setItems, setActive: r.setActive, setSide: r.setSide,
      update(n, p) {
        if (n.items !== p.items) r.setItems(n.items || []);
        if (n.activeId !== p.activeId) r.setActive(n.activeId);
        if (n.side !== p.side) r.setSide(n.side);
      },
      destroy() { r.destroy(); },
    };
  },
});

// mountChat(.chat, { respond, history, hiRes, rail, meta, actions, caret, traceMode, toolStyle, renderTool, historyMode, density, userMarkdown, markdown, submitKey })：
//   respond(问题, { stopped })：异步生成器，一段一段地 yield——
//     字符串或 { text }：正文；{ think: "…" }：思考（实时读秒，结束后收起）；
//     { tool: { id, name, kind, label, path, command, code, diff, lang, args, output, result, badge, status, ms, blocks } } / { toolUpdate: { id, ... } }：可定制高亮工具调用；
//     { step: { t, s, n } } / { stepUpdate: { index, s, n } }：步骤；
//     { card: [编号, 副信息, 说明, 背景] }：镜头卡片；{ image: { g } }、{ imageProgress: 0–1 }、{ imageDone: true }：生成画面。
//   traceMode："visible"（工具可见）| "collapsed"（思考与工具全收起活动流）| "active"（仅显示当前执行单行，完毕收起）| "expanded"（工具默认展开高亮详情）| "hidden"（纯净正文）
//   toolStyle："timeline"（紧凑活动时间流，默认）| "card"（精致卡片）| "minimal"（极简细导引线）
//   renderTool：(tool, ctx) => Node | string | { header?, body?, className? } | void（自定义单个工具调用外观与高亮）
//   historyMode："auto"（无缝自动预加载，默认）| "top"（置顶加载）| "demand"（按需加载，适配 10,000+ 条超长会话）
//   density："comfortable"（舒适，默认）| "compact"（紧凑高密度）
//   userMarkdown：boolean（用户输入含 Markdown 时是否渲染，默认 true）
//   markdown：boolean（AI 回复正文是否渲染 Markdown 与代码高亮，默认 true）
//   submitKey："enter"（默认：Enter 直接发送、Shift+Enter 换行）| "mod-enter"（⌘/Ctrl+Enter 发送、Enter 换行）
//   rail：false 关闭 | "left" | "right" | { side: "left" | "right", max: 18 }（默认 "left" 侧边迷你定位刻度轨）
//   meta：{ time?: true, duration?: true, tps?: true }（消息底部悬停操作栏元信息显示开关）
//   actions："hover"（默认：鼠标移入对应消息内容区域才显示）| "latest"（最新一条 AI 回复常显）| "always"（全部常显）| false / "none"（关闭）
//   caret："dot" | "bar"（流式输出光标样式，默认 "dot"）
//   composerBlur："none" | "sm" | "md" | "lg" | number | false（输入框高斯模糊级别，默认 "md"；底色不透明度强制 ≥78%/76%，绝不允许透明）
//   composerResizable：boolean（是否支持顶部微把手拖拽调整输入框高度，默认 true）
//   composerHeight：number（初始输入框文本区高度，自动钳制在安全范围内）
export function mountChat(box, { respond, history, hiRes = (g) => g, rail: railOpt = "left", meta: metaOpt, actions = "hover", caret = "dot", traceMode = "visible", toolStyle = "timeline", renderTool, historyMode = "auto", density = "comfortable", userMarkdown = true, markdown = true, submitKey = "enter", composerBlur = "md", composerResizable = true, composerHeight, composer: cmOpts, onModelChange, onModeChange, onContextChange, onContextClick, onMenu, onNewChat, ...view } = {}) {
  if (!box || box._chat) return box?._chat;
  const metaCfg = { time: true, duration: true, tps: true, ...metaOpt };
  const normActions = (v) => (v === false || v === "none" ? "none" : v === "always" || v === "latest" ? v : "hover");
  const normTraceMode = (v) => (v === "collapsed" || v === "active" || v === "expanded" || v === "hidden" ? v : "visible");
  const normToolStyle = (v) => (v === "card" || v === "minimal" ? v : "timeline");
  const normHistoryMode = (v) => (v === "top" || v === "demand" ? v : "auto");
  const normDensity = (v) => (v === "compact" ? "compact" : "comfortable");
  let curTraceMode = normTraceMode(traceMode);
  let curToolStyle = normToolStyle(toolStyle);
  let curHistoryMode = normHistoryMode(historyMode);
  let curDensity = normDensity(density);
  let curUserMd = userMarkdown !== false;
  let curAiMd = markdown !== false;
  let curRenderTool = typeof renderTool === "function" ? renderTool : null;
  const setActions = (v) => { box.dataset.actions = normActions(v); };
  const BLUR_PRESETS = { none: { px: 0, tint: 100 }, sm: { px: 8, tint: 46 }, md: { px: 14, tint: 23 }, lg: { px: 22, tint: 0 } };
  const setComposerBlur = (level) => {
    let key = "none", px = 0, tint = 100;
    if (level === false || level == null || level === "none" || level === "off" || level === 0) {
      key = "none"; px = 0; tint = 100;
    } else if (typeof level === "string" && Object.hasOwn(BLUR_PRESETS, level)) {
      key = level; ({ px, tint } = BLUR_PRESETS[level]);
    } else if (typeof level === "number" && Number.isFinite(level)) {
      px = Math.round(Math.max(0, Math.min(28, level)));
      if (px <= 0) { key = "none"; tint = 100; }
      else { key = px <= 10 ? "sm" : px <= 18 ? "md" : "lg"; tint = Math.round(55 - (px / 28) * 55); }
    } else {
      key = "md"; ({ px, tint } = BLUR_PRESETS.md);
    }
    box.dataset.composerBlur = key;
    if (px > 0) {
      box.style.setProperty("--sn-chat-foot-blur", px + "px");
      box.style.setProperty("--sn-chat-foot-tint", tint + "%");
    } else {
      box.style.removeProperty("--sn-chat-foot-blur");
      box.style.removeProperty("--sn-chat-foot-tint");
    }
  };
  // 空容器：先按选项（title、status、placeholder、max……）填好标记
  if (!box.querySelector(".sn-chat-vp")) { box.classList.add("sn-chat"); box.innerHTML = chatHTML({ ...view, submitKey }); injectIcons(box); }
  setActions(actions);
  setComposerBlur(composerBlur);
  box.dataset.traceMode = curTraceMode;
  box.dataset.toolStyle = curToolStyle;
  box.dataset.historyMode = curHistoryMode;
  box.dataset.density = curDensity;
  if (caret === "bar") box.dataset.caret = "bar";
  const bodyEl = $(".sn-chat-body", box), vp = $(".sn-chat-vp", box), canvas = $(".sn-chat-canvas", vp), phTop = $(".sn-chat-ph.sn-top", canvas), phBot = $(".sn-chat-ph.sn-bot", canvas);
  const jump = $("[data-chat-jump]", box), badge = $(".sn-badge", jump);
  // 顶栏两侧的按钮（menu、newChat 选项）：点了交给外面——打开会话列表、开一段新对话
  $(".sn-chat-hd", box)?.addEventListener("click", (e) => { const b = e.target.closest("[data-chat-menu], [data-chat-new]"); if (!b) return; if (b.hasAttribute("data-chat-menu")) onMenu?.(); else onNewChat?.(); });
  const composer = $(".sn-composer", box), ta = $("textarea", composer);
  const emptyEl = $("[data-chat-empty]", box); // 新对话那一块（见下面"新对话"）；先取好，发消息的路径里要用
  let emptyGone = !emptyEl;
  // 底部的提示词输入框（data-external：发送 / 停止交给对话）：还没人接就在这里接上——页面不用再调 bindInputs。
  // cmOpts：传给输入框的选项（upload 上传函数、attachments 预置附件）
  if (!composer._cm) mountComposer(composer, { ...cmOpts, voice: view.voice, submitKey, onModelChange, onModeChange, onContextChange, onContextClick });
  else if (submitKey) composer._cm.setSubmitKey?.(submitKey);
  // ———— 输入框可调高度（顶部微把手拖拽 + 双击/Home 恢复自动 + 安全上下限） ————
  const minTaH = () => {
    const cs = getComputedStyle(ta), lh = parseFloat(cs.lineHeight) || 22;
    return Math.round((Number(ta.getAttribute("rows")) || 1) * lh + (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0));
  };
  const maxTaH = () => {
    const chatH = box.clientHeight || 560;
    return Math.max(minTaH() + 44, Math.min(300, Math.round(chatH * 0.46) - 56));
  };
  const setComposerHeight = (h) => {
    if (h == null || h === "auto" || h === false || Number(h) <= 0) {
      delete composer.dataset.cmH;
      ta.dispatchEvent(new Event("input"));
      return;
    }
    const clamped = Math.round(Math.max(minTaH(), Math.min(maxTaH(), Number(h) || minTaH())));
    composer.dataset.cmH = String(clamped);
    ta.dispatchEvent(new Event("input"));
  };
  let resizeEl = null;
  if (composerResizable !== false) {
    const cardHost = $(".sn-cm-card", composer) || composer;
    resizeEl = document.createElement("div");
    resizeEl.className = "sn-cm-resize";
    resizeEl.setAttribute("role", "separator");
    resizeEl.setAttribute("aria-orientation", "horizontal");
    resizeEl.setAttribute("aria-label", tt("chat.resize"));
    resizeEl.dataset.tip = tt("chat.resize");
    resizeEl.tabIndex = 0;
    resizeEl.innerHTML = "<i></i>";
    cardHost.prepend(resizeEl);
    let dragging = false, pid = null, startY = 0, startH = 0;
    const stopDrag = () => {
      if (!dragging) return;
      dragging = false;
      composer.classList.remove("sn-cm-resizing");
      if (pid != null) { try { resizeEl.releasePointerCapture(pid); } catch { /* ignore */ } pid = null; }
    };
    resizeEl.addEventListener("pointerdown", (e) => {
      if (e.button && e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      dragging = true; pid = e.pointerId; startY = e.clientY; startH = ta.offsetHeight || minTaH();
      composer.classList.add("sn-cm-resizing");
      try { resizeEl.setPointerCapture(pid); } catch { /* ignore */ }
    });
    resizeEl.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const next = Math.round(Math.max(minTaH(), Math.min(maxTaH(), startH + (startY - e.clientY))));
      composer.dataset.cmH = String(next);
      ta.dispatchEvent(new Event("input"));
    });
    resizeEl.addEventListener("pointerup", stopDrag);
    resizeEl.addEventListener("pointercancel", stopDrag);
    resizeEl.addEventListener("dblclick", (e) => { e.preventDefault(); e.stopPropagation(); setComposerHeight("auto"); });
    resizeEl.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const cur = Number(composer.dataset.cmH) || ta.offsetHeight || minTaH();
        setComposerHeight(cur + (e.key === "ArrowUp" ? 22 : -22));
      } else if (e.key === "Home" || e.key === "Enter" || e.key === "Escape") {
        e.preventDefault(); setComposerHeight("auto");
      }
    });
  }
  if (composerHeight != null) setComposerHeight(composerHeight);
  const PAD_T = 12, GAP = 16; // GAP = 条目自己的下内边距（.ci 的 padding-bottom）
  // 列表一直延伸到输入框背后（零顶部白缝、零虚化渐变）：列表底部留出输入框高度 + 14px，停在最新一条时自然呼吸
  let PAD_B = 18; const foot = $(".sn-chat-foot", box);
  const sa = scrollArea(vp, { fade: "top", size: 16 }); Object.assign(sa.box.style, { height: "100%", minHeight: "0" });
  // 底部位置按算出来的内容高度，不用 scrollHeight：发送时画布在做让位动画，scrollHeight 会被 transform 临时撑大
  const maxTop = () => Math.max(0, PAD_T + off[items.length] + PAD_B - vp.clientHeight);
  // 顶栏标题下面那行只写选项 status（默认不写：AI 助手平时没什么状态可说；人和人聊天写"在线""正在输入…"，用 update({ status }) 换）。
  // 生成时不在顶栏再写"正在思考…"——消息里已经有思考、步骤和逐字出来的正文，顶栏再说一遍是重复

  // ———— 数据：从旧到新 ————
  let seq = 0, msgCount = 0;
  const items = [], index = new Map(); let off = [0];
  const reindex = () => { index.clear(); items.forEach((it, i) => index.set(it.id, i)); };
  const historyTotal = () => {
    const v = typeof history?.total === "function" ? history.total() : history?.total;
    return Number.isFinite(v) && v > 0 ? Math.max(Math.round(v), msgCount) : 0;
  };
  // 外面给的条目编上号（按顺序），顺便数消息条数
  const ingest = (arr) => (arr || []).map((it) => {
    if (it.kind === "msg" || it.kind === "ai") msgCount++;
    if (it.kind === "ai") return { ph: "done", think: null, secs: 0, open: false, traceOpen: false, thinkOpen: false, steps: [], tools: [], text: "", cards: 0, cardList: [], img: null, acts: true, stopped: false, ...it, id: ++seq };
    return { ...it, id: ++seq };
  });
  const more = { id: ++seq, kind: "more", state: "idle" };
  if (!history || !history.hasMore?.()) more.state = "end";
  items.push(more, ...(history ? ingest(history.initial()) : [])); reindex();

  // ———— 侧边迷你定位刻度轨（Thread Rail）：万级对话等距均匀采样 + O(log N) 二分激活 ————
  const railCfg = railOpt === false ? null : typeof railOpt === "object" ? { side: "left", max: 18, ...railOpt } : { side: railOpt === "right" ? "right" : "left", max: 18 };
  const rail = railCfg && bodyEl ? mountThreadRail(bodyEl, {
    side: railCfg.side,
    max: railCfg.max,
    onSelect: (entry) => scrollToId(entry.id),
  }) : null;
  const summaryOf = (it) => {
    if (it.text) return it.text.replace(/[`*_~#>]+/g, "").replace(/\s+/g, " ").trim();
    if (it.type === "image") return it.cap || `[${tt("chat.11")}]`;
    if (it.type === "video") return it.cap || `[${tt("chat.10")}]`;
    if (it.type === "audio") return it.name || `[${tt("chat.4")}]`;
    if (it.type === "file") return it.name || tt("chat.file");
    return "";
  };
  let railSamples = [];
  function syncRailItems() {
    if (!rail) return;
    const allIdx = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === "msg" && it.me) allIdx.push(i);
    }
    const maxN = railCfg.max || 18, totalTurns = allIdx.length;
    const picked = [];
    if (totalTurns <= maxN) {
      for (let k = 0; k < totalTurns; k++) picked.push({ i: allIdx[k], ord: k + 1 });
    } else {
      for (let k = 0; k < maxN; k++) {
        const pos = Math.round((k * (totalTurns - 1)) / (maxN - 1));
        picked.push({ i: allIdx[pos], ord: pos + 1 });
      }
    }
    railSamples = [];
    const turns = [];
    for (const { i, ord } of picked) {
      const it = items[i], s = summaryOf(it);
      if (!s) continue;
      const meta = totalTurns > maxN ? `#${ord}${it.time ? ` · ${it.time}` : ""}` : (it.time || "");
      turns.push({ id: it.id, summary: s, meta });
      railSamples.push({ id: it.id, i });
    }
    rail.setItems(turns);
    syncRailActive();
  }
  let railLockUntil = 0;
  function syncRailActive() {
    if (!rail || !railSamples.length || performance.now() < railLockUntil) return;
    const probe = vp.scrollTop + vp.clientHeight * .32 - PAD_T;
    let lo = 0, hi = railSamples.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (off[railSamples[m].i] <= probe) lo = m;
      else hi = m - 1;
    }
    rail.setActive(railSamples[lo].id);
  }
  function scrollToId(id) {
    const i = index.get(id); if (i == null) return;
    pinned = false;
    railLockUntil = performance.now() + 460;
    rail?.setActive(id);
    const target = Math.max(0, Math.min(maxTop(), PAD_T + off[i] - Math.min(80, vp.clientHeight * .18)));
    glide(target, 380);
    setTimeout(() => {
      const el = live.get(id);
      if (!el) return;
      el.classList.remove("sn-ci-flash"); void el.offsetWidth; el.classList.add("sn-ci-flash");
    }, reduced() ? 0 : 280);
  }
  const unlockRail = () => { railLockUntil = 0; };
  vp.addEventListener("wheel", unlockRail, { passive: true });
  vp.addEventListener("touchstart", unlockRail, { passive: true });

  // ———— 高度：先估，渲染后按实际量出来的缓存 ————
  let colW = 600;
  const meMax = () => Math.min(560, colW * .78);
  function est(it) {
    if (it.kind === "day") return curDensity === "compact" ? 36 : 44;
    if (it.kind === "more") return curHistoryMode === "demand" ? 66 : curHistoryMode === "top" ? 52 : 44;
    const gap = curDensity === "compact" ? 10 : GAP;
    if (it.kind === "ai") return (curTraceMode === "collapsed" || curTraceMode === "active" || curTraceMode === "hidden" ? 160 : 220 + (it.tools?.length || 0) * 38);
    if (it.type === "image" || it.type === "video") return 200 + (it.cap ? 28 : 0) + gap + 28;
    if (it.type === "audio") return 48 + gap + 28;
    if (it.type === "file") return 52 + gap + 28;
    const txt = String(it.text || "");
    const cjk = (txt.match(/[⺀-鿿　-〿＀-￯]/g) || []).length, w = cjk * 15.2 + (txt.length - cjk) * 8.1;
    const max = it.me ? meMax() - 32 : colW;
    return (it.me ? 20 : 0) + Math.max(1, Math.ceil(w / max)) * (it.me ? 24 : 26) + gap + 30;
  }
  const hOf = (it) => it.h ?? (it.e ??= est(it));
  function relayout(from = 1) {
    const n = items.length; off.length = n + 1; off[0] = 0;
    for (let i = Math.max(1, from); i <= n; i++) off[i] = off[i - 1] + hOf(items[i - 1]);
    canvas.style.height = PAD_T + off[n] + PAD_B + "px";
  }
  const find = (y) => { let lo = 0, hi = items.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (off[m] <= y) lo = m; else hi = m - 1; } return lo; };

  // ———— 条目的样子 ————
  // 不放头像：谁说的靠位置和样式区分（用户靠右、浅灰气泡；助手靠左、直接是正文）
  const CHECK = icon("check", 14), ALERT = icon("circle-alert", 14), PLAY = icon("play", 16), PAUSE = icon("pause", 16), CHEV = icon("chevron-down", 13), CHEV_R = icon("chevron-right", 13);
  const STATE = { sending: LD_ARC, sent: CHECK, fail: ALERT };
  const contOf = (i) => { const it = items[i], p = items[i - 1]; return !!p && (p.kind === "msg" || p.kind === "ai") && p.me === it.me; };
  const metaHTML = (it) => {
    const segs = [];
    if (metaCfg.time && it.time) segs.push(`<span>${esc(it.time)}</span>`);
    if (metaCfg.duration && it.durSec != null) segs.push(`<span>${esc(fmtSec(it.durSec))}s</span>`);
    if (metaCfg.tps && it.tps != null) segs.push(`<span>${esc(Number(it.tps).toFixed(1))} tok/s</span>`);
    return segs.length ? `<span class="sn-ai-meta sn-num">${segs.join('<i class="sn-ai-dot" aria-hidden="true"></i>')}</span>` : "";
  };
  const aiActsHTML = (it, keep) =>
    `<div class="sn-ai-acts${keep ? " sn-keep" : ""}">` +
    `<button class="sn-btn sn-ghost sn-sm sn-ibtn" data-act="copy" data-tip="${esc(tt("chat.14"))}" aria-label="${esc(tt("chat.14"))}"><span class="sn-swap"><span class="sn-a">${icon("copy", 14)}</span><span class="sn-b">${CHECK}</span></span></button>` +
    `<button class="sn-btn sn-ghost sn-sm sn-ibtn" data-act="up" data-tip="${esc(tt("chat.15"))}" aria-label="${esc(tt("chat.15"))}">${icon("thumbs-up", 14)}</button>` +
    `<button class="sn-btn sn-ghost sn-sm sn-ibtn" data-act="down" data-tip="${esc(tt("chat.16"))}" aria-label="${esc(tt("chat.16"))}">${icon("thumbs-down", 14)}</button>` +
    `<button class="sn-btn sn-ghost sn-sm sn-ibtn" data-act="regen" data-tip="${esc(tt("chat.17"))}" aria-label="${esc(tt("chat.17"))}">${icon("refresh-cw", 14)}</button>` +
    `<button class="sn-btn sn-ghost sn-sm sn-ibtn" data-act="more" data-tip="${esc(tt("chat.18"))}" aria-label="${esc(tt("chat.18"))}">${icon("ellipsis", 14)}</button>` +
    metaHTML(it) + `</div>`;
  const meActsHTML = (it) =>
    `<div class="sn-me-acts">` +
    (metaCfg.time && it.time ? `<span class="sn-ai-meta sn-num"><span>${esc(it.time)}</span></span>` : "") +
    `<button class="sn-btn sn-ghost sn-sm sn-ibtn" data-act="copy" data-tip="${esc(tt("chat.14"))}" aria-label="${esc(tt("chat.14"))}"><span class="sn-swap"><span class="sn-a">${icon("copy", 14)}</span><span class="sn-b">${CHECK}</span></span></button>` +
    (it.type === "text" || !it.type ? `<button class="sn-btn sn-ghost sn-sm sn-ibtn" data-act="edit" data-tip="${esc(tt("chat.28"))}" aria-label="${esc(tt("chat.28"))}">${icon("pencil", 14)}</button>` : "") +
    `</div>`;
  const isLastMsg = (i) => i === items.length - 1;
  const renderRichText = (text, allowMd) => (allowMd && hasMarkdown(text) ? renderChatMD(text) : esc(text));
  function msgHTML(it, cont, i) {
    let bub;
    const cap = it.cap ? `<span class="sn-cap2">${esc(it.cap)}</span>` : "";
    if (it.type === "image") bub = `<div class="sn-bubble sn-img"><span class="sn-ph" tabindex="0" role="button" aria-label="${tt("chat.2")}"><span class="sn-pic" style="--sn-g:${esc(it.g)}"></span></span>${cap}</div>`;
    else if (it.type === "video") bub = `<div class="sn-bubble sn-img sn-vid"><span class="sn-ph" tabindex="0" role="button" aria-label="${tt("chat.3")}"><span class="sn-pic" style="--sn-g:${esc(it.g)}"></span><span class="sn-play">${PLAY}</span><span class="sn-dur">${esc(it.dur ?? "")}</span></span>${cap}</div>`;
    else if (it.type === "audio") bub = `<div class="sn-bubble sn-aud"><button class="sn-ap" type="button" aria-label="${tt("chat.4")}"><span class="sn-swap"><span class="sn-a">${PLAY}</span><span class="sn-b">${PAUSE}</span></span></button><span class="sn-wf">${waveBars(28, it.seed || 1)}<span class="sn-wf-on">${waveBars(28, it.seed || 1)}</span></span><span class="sn-dur">${esc(it.dur ?? "")}</span></div>`;
    else if (it.type === "file") bub = `<div class="sn-bubble sn-fcard"><span class="sn-ext-card">${esc(it.ext ?? "")}</span><span class="sn-meta"><b class="sn-fname">${esc(midEllipsis(it.name, 20))}</b><span>${esc(it.ext ?? "")} · ${fmtSize(it.size)}</span></span></div>`;
    else {
      const useMd = it.me ? curUserMd : curAiMd;
      const isMd = useMd && hasMarkdown(it.text);
      bub = `<div class="sn-bubble${isMd ? " sn-md-msg" : ""}">${isMd ? renderChatMD(it.text) : esc(it.text)}</div>`;
    }
    const st = it.me && it.status === "fail" ? `<span class="sn-msg-state sn-bad" role="button" tabindex="0" title="${tt("chat.27")}">${STATE[it.status]}</span>` : "";
    const acts = it.status === "fail" ? tt("chat.5") : it.me ? meActsHTML(it) : it.type === "text" || !it.type ? aiActsHTML(it, isLastMsg(i)) : "";
    return `<div class="sn-msg ${it.me ? "sn-me" : "sn-ai"}${cont ? " sn-cont" : ""}${it.flying ? " sn-flying" : ""}"><div class="sn-msg-col">${bub}${acts}</div>${st}</div>`;
  }
  // 历史最上面那一行：按 historyMode 区分「无缝加载 / 置顶加载 / 按需加载」，清晰展现万级对话加载进度
  function moreHTML() {
    if (!history) return "";
    const total = historyTotal(), hasMore = !!history.hasMore?.();
    const loading = more.state === "loading";
    const pct = total > 0 ? Math.min(100, Math.round((msgCount / total) * 100)) : 0;
    const rem = total > 0 ? Math.max(0, total - msgCount) : 0;
    const statTxt = total > 0 ? tt("chat.histLoaded", { p0: fmtNum(msgCount), p1: fmtNum(total) }) : tt("chat.histLoadedOnly", { p0: fmtNum(msgCount) });
    if (!hasMore && !loading) {
      return msgCount >= 80 ? `<div class="sn-hist-end sn-num">${esc(tt("chat.histAll", { p0: fmtNum(msgCount) }))}</div>` : "";
    }
    if (curHistoryMode === "auto") {
      if (!loading) return "";
      return `<div class="sn-hist-auto">${LD_ARC}<span>${esc(tt("chat.histLoading"))}</span>${total > 0 ? `<span class="sn-hist-meta sn-num">${esc(statTxt)}</span>` : ""}</div>`;
    }
    if (curHistoryMode === "top") {
      return `<div class="sn-hist-bar sn-hist-top${loading ? " sn-loading" : ""}">` +
        `<button type="button" class="sn-hist-pill" data-hist-load="1"${loading ? " disabled" : ""}>` +
        `${loading ? LD_ARC : icon("arrow-up", 13)}` +
        `<span>${esc(loading ? tt("chat.histLoading") : tt("chat.histLoadTop"))}</span>` +
        (total > 0 ? `<span class="sn-hist-meta sn-num">${esc(rem > 0 ? tt("chat.histMoreLeft", { p0: fmtNum(rem) }) : statTxt)}</span>` : "") +
        `</button></div>`;
    }
    return `<div class="sn-hist-bar sn-hist-demand${loading ? " sn-loading" : ""}">` +
      (total > 0 ? `<div class="sn-hist-prog" aria-hidden="true"><i style="width:${pct}%"></i></div>` : "") +
      `<div class="sn-hist-row">` +
      `<span class="sn-hist-meta sn-num">${esc(statTxt)}</span>` +
      `<div class="sn-hist-acts">` +
      `<button type="button" class="sn-btn sn-secondary sn-sm sn-hist-btn" data-hist-load="1"${loading ? " disabled" : ""}>${loading ? LD_ARC : icon("history", 13)}<span>${esc(loading ? tt("chat.histLoading") : tt("chat.histLoadMore"))}</span></button>` +
      (rem >= 600 ? `<button type="button" class="sn-btn sn-ghost sn-sm sn-hist-btn" data-hist-load="4"${loading ? " disabled" : ""}>${esc(tt("chat.histLoadBatch"))}</button>` : "") +
      `</div></div></div>`;
  }
  function realEl(it, i) {
    const el = document.createElement("div"); el.className = "sn-ci";
    if (it.kind === "day") { el.classList.add("sn-ci-day"); el.innerHTML = `<span class="sn-day">${esc(it.text)}</span>`; }
    else if (it.kind === "more") { el.classList.add("sn-ci-more"); el.innerHTML = moreHTML(); }
    else if (it.kind === "ai") { el.classList.add("sn-ci-ai"); el.innerHTML = aiHTML(it, isLastMsg(i)); applyCustomTools(el, it); }
    else el.innerHTML = msgHTML(it, contOf(i), i);
    return el;
  }
  // ———— 渲染：只建视口上下各一屏多里的条目；数据在内存里就直接画真内容 ————
  // 让位动画期间画布整体往下挪了 cOff，算可见范围时要把它算进去
  const live = new Map();
  function drop(id, el) { ro.unobserve(el); el.remove(); live.delete(id); }
  function render() {
    const st = vp.scrollTop - cOff, vh = vp.clientHeight, over = Math.max(640, vh * 1.25);
    const i0 = find(Math.max(0, st - PAD_T - over)), i1 = find(st - PAD_T + vh + over);
    for (const [id, el] of live) { const i = index.get(id); if (i == null || i < i0 || i > i1) drop(id, el); }
    for (let i = i0; i <= i1; i++) {
      const it = items[i]; let el = live.get(it.id);
      if (!el) {
        el = realEl(it, i); el._it = it; el._y = null;
        canvas.append(el); live.set(it.id, el); ro.observe(el);
      }
      const y = PAD_T + off[i]; if (el._y !== y) { el.style.transform = `translateY(${y}px)`; el._y = y; }
    }
    const a = PAD_T + off[i0], b = PAD_T + off[Math.min(items.length, i1 + 1)];
    // 上方没有没画出来的条目（滚到最早）时不留占位：原来留着 PAD_T 那 12px，骨架条的第一截露出来，最上面多一道灰条
    phTop.style.height = (i0 > 0 ? a : 0) + "px"; phBot.style.transform = `translateY(${b}px)`; phBot.style.height = Math.max(0, PAD_T + off[items.length] - b) + "px";
  }
  // 量高度：视口上方的条目变了就补偿滚动位置；贴底时平滑跟随
  const ro = new ResizeObserver((ents) => {
    let first = Infinity, above = 0; const top = vp.scrollTop - PAD_T;
    for (const en of ents) {
      const el = en.target; if (!el.isConnected) continue;
      const it = el._it, i = index.get(it.id); if (i == null) continue;
      const h = Math.round(en.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight), old = hOf(it);
      if (Math.abs(h - old) < 1) { it.h = h; continue; }
      if (off[i] + old <= top + 1) above += h - old;
      it.h = h; first = Math.min(first, i);
    }
    if (first === Infinity) return;
    relayout(first + 1);
    if (pinned) follow(); else if (above) vp.scrollTop += above;
    render();
  });

  // ———— 滚动：用户自己往上滚就不再贴底；按 historyMode 控制自动预加载 / 置顶加载 / 按需加载 ————
  let pinned = true, userAt = 0, topReadyAt = 0;
  // 用捕获阶段：滚动条滑块按下时会 stopPropagation，冒泡阶段收不到——收不到就会以为还贴着底，跟随弹簧会和拖动对着干
  for (const ev of ["wheel", "touchstart", "keydown", "pointerdown"]) sa.box.addEventListener(ev, () => (userAt = performance.now()), { passive: true, capture: true });
  vp.addEventListener("scroll", () => {
    const st = vp.scrollTop;
    if (performance.now() - userAt < 400) pinned = maxTop() - st < 24;
    if (st <= 4) { if (!topReadyAt) topReadyAt = performance.now(); }
    else topReadyAt = 0;
    render(); syncJump(); syncRailActive();
    if (curHistoryMode === "auto" && st - PAD_T < vp.clientHeight * 2) loadOlder(1);
  }, { passive: true });
  // 置顶加载模式：已抵顶停顿后继续向上推滚轮，温和触发置顶加载（也可直接点击顶部按钮）
  vp.addEventListener("wheel", (e) => {
    if (curHistoryMode !== "top" || e.deltaY >= -18 || vp.scrollTop > 4 || loadingOld || !history?.hasMore?.()) return;
    if (topReadyAt && performance.now() - topReadyAt > 240) { topReadyAt = 0; loadOlder(1); }
  }, { passive: true });
  // 拖滚动条：同一个任务里画好新位置的内容，并重算是否贴底
  vp.addEventListener("sa-jump", () => { userAt = performance.now(); pinned = maxTop() - vp.scrollTop < 24; render(); syncJump(); syncRailActive(); });
  // 贴底跟随：临界阻尼弹簧。内容一下长高很多时，速度从 0 平滑加上去再平滑停下，不会第一帧就猛跳一大段
  let fRaf = 0, fv = 0, fy = 0, fLast = 0;
  function follow() {
    if (reduced()) { vp.scrollTop = maxTop(); return; }
    if (fRaf) return;
    fLast = 0; fy = vp.scrollTop;
    const W = 15;
    const step = (now) => {
      fRaf = 0; if (!pinned) { fv = 0; return; }
      if (Math.abs(vp.scrollTop - fy) > 2) fy = vp.scrollTop; // 别人（让位贴底、用户）动过就从当前位置接着走
      const dt = fLast ? Math.min(.034, (now - fLast) / 1000) : 1 / 60; fLast = now;
      let d = maxTop() - fy;
      if (d > vp.clientHeight * 2) { fy = maxTop() - vp.clientHeight; fv = 0; d = vp.clientHeight; } // 离底很远：先跳到最后一屏附近，再平滑走完
      if (Math.abs(d) < .5 && Math.abs(fv) < 10) { vp.scrollTop = maxTop(); fv = 0; render(); return; }
      fv += (W * W * d - 2 * W * fv) * dt; fy += fv * dt; vp.scrollTop = fy;
      render(); // 同一帧里画好新位置的内容，不等下一帧的 scroll 事件
      fRaf = requestAnimationFrame(step);
    };
    fRaf = requestAnimationFrame(step);
  }

  // ———— 动效引擎：画布让位、输入框收起期间贴底、发送的影子，同一个 rAF 里算 ————
  // 曲线：临界阻尼弹簧（按时长归一化，到时长刚好停住）。起步一两帧就加速到高速，100ms 走完一半多、150ms 走完约八成，再柔和停住——果断、有速度感，不是匀速滑过去。
  // 竖直 300ms（k=6.6）比水平 360ms（k=6.1）略快：先抬起一点再横移，路径带一点弧度。让位、贴底、输入框收起都用同一条曲线。
  const springEase = (k) => { const end = 1 - (1 + k) * Math.exp(-k); return (x) => (x <= 0 ? 0 : x >= 1 ? 1 : (1 - (1 + k * x) * Math.exp(-k * x)) / end); };
  const toLinear = (f, n = 24) => `linear(${Array.from({ length: n + 1 }, (_, i) => `${f(i / n).toFixed(4)} ${((i / n) * 100).toFixed(1)}%`).join(", ")})`; // CSS 的 linear() 精确采样同一条曲线
  const RISE = springEase(6.6), GLIDE = springEase(6.1), RISE_CSS = toLinear(RISE);
  const DY = 300, DX = 360, STAGGER = 28; // 多条依次出发，每条晚 28ms
  const fx = document.createElement("div"); fx.className = "sn-chat-fx"; box.append(fx);
  const now0 = () => document.timeline.currentTime ?? performance.now();
  let cOff = 0, cFrom = 0, cT0 = 0, cDur = 0, holdUntil = 0, mRaf = 0;
  const ghosts = new Set();
  const applyOff = () => { canvas.style.transform = Math.abs(cOff) > .01 ? `translateY(${cOff}px)` : ""; };
  const motion = () => { if (!mRaf) mRaf = requestAnimationFrame(tick); };
  function tick(now) {
    mRaf = 0;
    if (cDur) { const t = Math.min(1, Math.max(0, (now - cT0) / cDur)); cOff = cFrom * (1 - RISE(t)); if (t >= 1) { cOff = 0; cDur = 0; } applyOff(); render(); }
    if (pinned && now < holdUntil) vp.scrollTop = maxTop();
    for (const g of ghosts) g(now);
    if (cDur || ghosts.size || now < holdUntil) motion();
  }
  // 让位：新内容插进来、视口已经跳到底，先把画布往下挪回原来的样子，再和新内容一起平滑上移。连续插入时叠加，不跳
  function slide(shift, dur = DY) {
    if (reduced() || Math.abs(shift) < .5) return;
    cFrom = cOff + shift; cOff = cFrom; cT0 = now0(); cDur = dur; applyOff(); motion();
  }
  // 贴底时插入新条目：先量出真实高度，再滚到底并让位
  function insert(arr, { dur = DY } = {}) {
    hideEmpty();
    // "离底很远"只看插入前（用户原本翻到很久以前）；新内容本身再高，原本在底部就整段平滑让位
    const st0 = vp.scrollTop, far = maxTop() - st0 > vp.clientHeight; append(arr); render();
    for (const it of arr) { const el = live.get(it.id); if (el) it.h = el.offsetHeight; }
    relayout(index.get(arr[0].id));
    // 让得越远走得越久：200px 以内 400ms，再远每 100px 多 35ms，最多 640ms（一次插入好几张图时不会"嗖"一下）
    if (pinned) { vp.scrollTop = maxTop(); const sh = far ? vp.clientHeight * .5 : vp.scrollTop - st0; slide(sh, Math.min(440, dur + Math.max(0, sh - 200) * .3)); }
    render();
  }
  let gRaf = 0;
  function glide(to, D) {
    cancelAnimationFrame(gRaf); if (reduced()) { vp.scrollTop = to; return; }
    const from = vp.scrollTop, t0 = performance.now(), ease = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now) => { const t = Math.min(1, (now - t0) / D); vp.scrollTop = from + (to - from) * ease(t); if (t < 1) gRaf = requestAnimationFrame(step); };
    gRaf = requestAnimationFrame(step);
  }
  // 回到最新：很远时先跳到附近，再平滑滚完最后一段
  function toLatest() { pinned = true; if (maxTop() - vp.scrollTop > vp.clientHeight * 3) vp.scrollTop = maxTop() - vp.clientHeight * 1.5; glide(maxTop(), 420); }
  let unread = 0;
  function syncJump() { const away = maxTop() - vp.scrollTop > 120; jump.classList.toggle("sn-on", away); if (!away) unread = 0; badge.textContent = unread; badge.hidden = !unread; }
  jump.addEventListener("click", toLatest);

  // ———— 往上加载更早的（支持万级消息增量偏移 + 按需多批连续加载，插入后视口纹丝不动） ————
  let loadingOld = false;
  const patchMore = () => {
    const el = live.get(more.id);
    if (el) el.innerHTML = moreHTML();
    more.h = undefined; more.e = undefined;
  };
  async function loadOlder(batches = 1) {
    if (loadingOld || !history?.hasMore?.()) return 0;
    loadingOld = true; more.state = "loading"; patchMore();
    const collected = [];
    const nBatch = Math.max(1, Math.min(20, Math.round(Number(batches) || 1)));
    try {
      for (let step = 0; step < nBatch && history?.hasMore?.(); step++) {
        const chunk = await history.older(step);
        if (chunk?.length) collected.push(...chunk);
        else break;
      }
    } finally {
      if (collected.length) {
        const b = ingest(collected);
        const st = vp.scrollTop, oldLen = items.length;
        let added = 0; for (const it of b) added += hOf(it);
        items.splice(1, 0, ...b);
        reindex();
        // 万级优化：仅计算新插入批次的偏移量，旧有全部条目直接整体平移 +added
        const nextOff = new Array(items.length + 1);
        nextOff[0] = 0; nextOff[1] = hOf(items[0]);
        for (let k = 0; k < b.length; k++) nextOff[k + 2] = nextOff[k + 1] + hOf(b[k]);
        for (let k = 1; k < oldLen; k++) nextOff[b.length + k + 1] = off[k + 1] + added;
        off = nextOff;
        canvas.style.height = PAD_T + off[items.length] + PAD_B + "px";
        vp.scrollTop = st + added;
        const firstOld = items[1 + b.length], el = firstOld && live.get(firstOld.id);
        if (el) drop(firstOld.id, el); // 它前面的人变了，分组状态重算
      }
      more.state = history?.hasMore?.() ? "idle" : "end";
      loadingOld = false;
      patchMore();
      relayout(1);
      render();
      syncRailItems();
    }
    return collected.length;
  }

  // ———— 追加、更新与运行时模式切换 ————
  function append(arr) { const j = items.length; items.push(...arr); reindex(); relayout(j); syncRailItems(); }
  function measureItem(it) {
    const el = live.get(it.id), i = index.get(it.id);
    if (!el || i == null) return;
    const h = Math.round(el.offsetHeight);
    if (h > 0 && h !== it.h) {
      it.h = h;
      relayout(i + 1);
      if (pinned) follow();
      render();
    }
  }
  function patch(it) {
    const el = live.get(it.id); if (!el) return;
    const i = index.get(it.id);
    if (it.kind === "ai") { el.innerHTML = aiHTML(it, isLastMsg(i)); applyCustomTools(el, it); }
    else el.innerHTML = msgHTML(it, contOf(i), i);
    measureItem(it);
  }
  function refreshLive(filter) {
    const st = vp.scrollTop;
    for (const it of items) { if (!filter || filter(it)) { it.h = undefined; it.e = undefined; } }
    for (const [id, el] of live) {
      const it = el._it;
      if (!it || (filter && !filter(it))) continue;
      const i = index.get(id); if (i == null) continue;
      if (it.kind === "more") el.innerHTML = moreHTML();
      else if (it.kind === "ai") { el.innerHTML = aiHTML(it, isLastMsg(i)); applyCustomTools(el, it); }
      else if (it.kind === "msg") el.innerHTML = msgHTML(it, contOf(i), i);
      const h = Math.round(el.offsetHeight);
      if (h > 0) it.h = h;
    }
    relayout(1);
    if (pinned) vp.scrollTop = maxTop();
    else vp.scrollTop = Math.min(maxTop(), st);
    render();
  }
  const setTraceMode = (v) => {
    const next = normTraceMode(v);
    if (next === curTraceMode) return;
    curTraceMode = next; box.dataset.traceMode = next;
    refreshLive((it) => it.kind === "ai");
  };
  const setToolStyle = (v) => {
    const next = normToolStyle(v);
    if (next === curToolStyle) return;
    curToolStyle = next; box.dataset.toolStyle = next;
    refreshLive((it) => it.kind === "ai" && it.tools?.length > 0);
  };
  const setRenderTool = (fn) => {
    curRenderTool = typeof fn === "function" ? fn : null;
    refreshLive((it) => it.kind === "ai" && it.tools?.length > 0);
  };
  const setHistoryMode = (v) => {
    const next = normHistoryMode(v);
    if (next === curHistoryMode) return;
    curHistoryMode = next; box.dataset.historyMode = next;
    more.h = undefined; more.e = undefined;
    patchMore(); relayout(1); render();
  };
  const setDensity = (v) => {
    const next = normDensity(v);
    if (next === curDensity) return;
    curDensity = next; box.dataset.density = next;
    refreshLive();
  };
  const setUserMarkdown = (on) => {
    const next = on !== false;
    if (next === curUserMd) return;
    curUserMd = next;
    refreshLive((it) => it.kind === "msg" && it.me && (it.type === "text" || !it.type));
  };
  const setSubmitKey = (mode) => { composer._cm?.setSubmitKey?.(mode); };
  const setState = (it, s) => { it.status = s; patch(it); };
  function settle(it, fail) {
    setTimeout(() => {
      if (fail) { setState(it, "fail"); return; }
      setState(it, "sent"); setTimeout(() => { const el = live.get(it.id); const s = el?.querySelector(".sn-msg-state"); if (s && !reduced()) s.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" }).onfinish = () => { it.status = ""; }; else it.status = ""; }, 1400);
    }, 450 + Math.random() * 400);
  }
  canvas.addEventListener("click", (e) => {
    const ap = e.target.closest(".sn-bubble.sn-aud .sn-ap"); if (!ap) return; const b = ap.closest(".sn-bubble"), on = !b.classList.contains("sn-playing"), sw = ap.querySelector(".sn-swap");
    b.classList.toggle("sn-playing", on); sw.classList.toggle("sn-on", on);
    if (!b._a) { b._a = b.querySelector(".sn-wf-on").animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }], { duration: 6000, easing: "linear", fill: "both" }); b._a.onfinish = () => { b.classList.remove("sn-playing"); sw.classList.remove("sn-on"); b._a.cancel(); b._a = null; }; }
    else if (on) b._a.play(); else b._a.pause();
  });
  // 图片、视频、生成好的画面：点开用看图组件（图从气泡里长出来，关上缩回去）；列表里渲染着的这些按顺序能左右翻
  const MEDIA = ".sn-bubble.sn-img .sn-ph, .sn-ai-image.sn-done";
  function viewMedia(t) {
    const all = [...canvas.querySelectorAll(MEDIA)];
    const items = all.map((x) => {
      const it = x.closest(".sn-ci")?._it || {};
      if (x.classList.contains("sn-ai-image")) return { bg: hiRes(it.img?.g || ""), ratio: 16 / 9, alt: tt("chat.9") };
      if (it.type === "video" && it.src) return { type: "video", src: it.src, poster: it.poster, ratio: 16 / 9, alt: it.cap || tt("chat.10") };
      return { bg: hiRes(it.g || ""), ratio: 16 / 10, alt: it.cap || tt("chat.11") };
    });
    openLightbox(items, Math.max(0, all.indexOf(t)), { thumbOf: (i) => all[i] });
  }
  canvas.addEventListener("click", (e) => { const t = e.target.closest(MEDIA); if (t) viewMedia(t); });
  canvas.addEventListener("keydown", (e) => { const t = e.target.closest?.(".sn-bubble.sn-img .sn-ph"); if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); viewMedia(t); } });
  canvas.addEventListener("click", (e) => {
    const s = e.target.closest(".sn-msg-state.sn-bad"); if (!s) return; const el = s.closest(".sn-ci"), it = el?._it; if (!it) return;
    setState(it, "sending"); settle(it, false);
  });

  // ———— 发送：输入框里的字原地变成气泡，先升起、再滑进它在列表里的位置；图片缩略图边飞边放大 ————
  function send(text, { fail = false } = {}) {
    text = (text || "").trim();
    // 附件：图片、视频从缩略图块飞出去；音频、文档整条飞出去
    const KMAP = { img: "image", vid: "video", aud: "audio", doc: "file" };
    const files = (composer._cm.files() || []).map((el) => { const src = el.querySelector(".sn-clip") || el; return { type: KMAP[el.dataset.kind] || "image", g: el.style.getPropertyValue("--sn-g"), name: el.dataset.name, size: +el.dataset.size, dur: el.dataset.dur, ext: el.dataset.ext, seed: +el.dataset.seed || 1, src, r: src.getBoundingClientRect(), rad: parseFloat(getComputedStyle(src).borderTopLeftRadius) || 0 }; });
    if (!text && !files.length) return null;
    const anim = !reduced();
    // 1. 清空前先量：输入框里第一行字的位置、它换行用的宽度、输入框能看见的那一段
    const tr = ta.getBoundingClientRect(), tcs = getComputedStyle(ta), pl = parseFloat(tcs.paddingLeft), pt = parseFloat(tcs.paddingTop);
    const src = { x: tr.left + pl, y: tr.top + pt - ta.scrollTop, w: ta.clientWidth - pl - parseFloat(tcs.paddingRight), top: tr.top, bottom: tr.bottom };
    // 2. 清空输入框：附件淡出，附件行和输入框用和飞行同一条曲线收起；占位提示等字离开再出来
    composer._cm.clear({ smooth: anim, dur: DY, ease: RISE_CSS, phHold: 300 });
    // 3. 新消息先藏着进列表：量好真实高度，滚到底，原来的消息让位
    const nowTime = fmtClock();
    const news = files.map((f) => ({ id: ++seq, kind: "msg", me: true, type: f.type, g: f.g, name: f.name, size: f.size, dur: f.dur, ext: f.ext, seed: f.seed, cap: "", time: nowTime, status: "sending", flying: anim }));
    if (text) news.push({ id: ++seq, kind: "msg", me: true, type: "text", text, time: nowTime, status: "sending", flying: anim });
    pinned = true; msgCount += news.length;
    insert(news);
    if (!anim) { news.forEach((it) => settle(it, fail)); return { news, landed: Promise.resolve() }; }
    holdUntil = now0() + DY + 80; motion(); // 输入框收起期间视口在变高，每帧贴底
    // 4. 每条消息一个影子：放在落点上，用 transform 从起点挪过去；落点每帧重新算（让位、贴底、用户滚动都算进去）
    const fxR = fx.getBoundingClientRect(), vpTop = vp.getBoundingClientRect().top - fxR.top;
    const landed = Promise.all(news.map((it, k) => new Promise((done) => {
      const b = live.get(it.id)?.querySelector(".sn-bubble");
      let g = null, step = null;
      const land = () => {
        if (step) ghosts.delete(step); g?.remove(); it.flying = false;
        const m = live.get(it.id)?.querySelector(".sn-msg");
        if (m) { m.classList.remove("sn-flying"); for (const x of m.querySelectorAll(".sn-av, .sn-msg-state")) x.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: "ease-out" }); }
        settle(it, fail); done();
      };
      if (!b) { land(); return; }
      const r = b.getBoundingClientRect(), bcs = getComputedStyle(b);
      const slotX = r.left - fxR.left, slotY0 = r.top - fxR.top;
      const bOff = slotY0 - (vpTop + PAD_T + off[index.get(it.id)] - vp.scrollTop + cOff); // 气泡在它那一条里的偏移
      const media = it.type === "image" || it.type === "video", card = it.type === "audio" || it.type === "file";
      g = document.createElement("div"); g.className = "sn-fx-g" + (media ? " sn-img" : card ? " sn-card sn-fx-me" : "");
      Object.assign(g.style, { left: slotX + "px", top: slotY0 + "px", width: r.width + "px", height: r.height + "px", borderRadius: bcs.borderRadius });
      g.style.setProperty("--sn-fx-d", DX + "ms");
      const c = b.cloneNode(true);
      let Rx, Ry, sx0 = 1, sy0 = 1, r0 = 0, r1 = 0;
      if (card) {
        // 整条等比放大飞过去（以左上角为基准）；开头 140ms 从透明淡入，和输入框里那一条的淡出交叠
        const f = files[k]; f.src.style.visibility = "hidden";
        sx0 = sy0 = f.r.height / r.height; Rx = f.r.left - r.left; Ry = f.r.top - r.top; r0 = f.rad; r1 = parseFloat(bcs.borderTopLeftRadius) || 18;
        g.append(c); fx.append(g); g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 110, easing: "ease-out" });
      } else if (media) {
        const f = files[k]; f.src.style.visibility = "hidden";
        // 以左下角为基准放大：图片往上长，不会盖住在它下面飞的文字
        sx0 = f.r.width / r.width; sy0 = f.r.height / r.height; Rx = f.r.left - r.left; Ry = f.r.bottom - r.bottom; r0 = f.rad; r1 = parseFloat(bcs.borderTopLeftRadius) || 18;
        g.append(c); fx.append(g);
      } else {
        const bl = parseFloat(bcs.paddingLeft), bt = parseFloat(bcs.paddingTop), br = parseFloat(bcs.paddingRight), bb = parseFloat(bcs.paddingBottom), bw = r.width - bl - br, rad = bcs.borderRadius;
        Rx = src.x - (r.left + bl); Ry = src.y - (r.top + bt);
        // 结构：投影（气泡大小）+ 裁切层（实心底 + 按气泡换行的字 + 按输入框换行的字）。字一直在实心底上，任何时候都看得清
        const sh = document.createElement("i"); sh.className = "sn-fx-sh"; Object.assign(sh.style, { width: r.width + "px", height: r.height + "px", borderRadius: rad, animationDelay: k * STAGGER + "ms" });
        const clip = document.createElement("div"); clip.className = "sn-fx-clip";
        const bg = document.createElement("i"); bg.className = "sn-fx-bg";
        const s = document.createElement("div"); s.className = "sn-fx-src"; s.textContent = text; s.style.width = "max-content";
        c.style.width = r.width + "px"; clip.append(bg, c, s); g.append(sh, clip); fx.append(g);
        const natural = s.getBoundingClientRect().width;
        const isMdBub = b.classList.contains("sn-md-msg");
        if (!isMdBub && natural <= bw + .5 && natural <= src.w + .5) {
          // 两边都不用自动换行，排版一模一样：字原地直接变成气泡（底色从 55% 补满，字一直清楚，不经过"灰字灰底"）
          s.remove(); clip.style.clipPath = `inset(0 round ${rad})`;
          bg.animate([{ opacity: .55, transform: "scale(.97)" }, { opacity: 1, transform: "none" }], { duration: 110, easing: "ease-out" });
        } else {
          // 换行不一样或 Markdown 渲染气泡：实心底先贴着输入框里那块字，再收成真实气泡形状并平滑交叉淡化
          s.style.width = src.w + "px";
          const th = s.offsetHeight, vTop = Math.max(0, src.top - src.y), vBot = Math.min(th, src.bottom - src.y);
          const gw = Math.max(r.width, src.w + bl + br), gh = Math.max(r.height, th + bt + bb);
          g.style.width = gw + "px"; g.style.height = gh + "px";
          clip.animate([{ clipPath: `inset(${vTop}px ${gw - (src.w + bl + br)}px ${gh - (vBot + bt + bb)}px 0 round ${rad})` }, { clipPath: `inset(0 ${gw - r.width}px ${gh - r.height}px 0 round ${rad})` }], { duration: 200, easing: RISE_CSS, fill: "both" });
          s.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: "ease-out", fill: "forwards" });
          c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 130, delay: 40, easing: "ease-out", fill: "backwards" });
        }
      }
      const t0 = now0() + k * STAGGER;
      step = (now) => {
        const i = index.get(it.id); if (i == null) { land(); return; }
        const t = Math.max(0, now - t0), px = GLIDE(t / DX), py = RISE(t / DY);
        const dx = Rx * (1 - px), dy = vpTop + PAD_T + off[i] + bOff - vp.scrollTop + cOff - slotY0 + Ry * (1 - py);
        if (media || card) {
          const sx = sx0 + (1 - sx0) * py, sy = sy0 + (1 - sy0) * py, rad = r0 + (r1 - r0) * py;
          g.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`; g.style.borderRadius = `${rad / sx}px / ${rad / sy}px`;
        } else g.style.transform = `translate(${dx}px, ${dy}px)`;
        if (t >= Math.max(DX, DY)) land();
      };
      step(t0); ghosts.add(step); motion();
    })));
    return { news, landed };
  }

  // ———— AI 回复：5 种过程模式（active / collapsed / visible / expanded / hidden）+ 3 种工具样式 + 语法高亮 + 自定义渲染 ————
  const fmtJSON = (v) => (v == null ? "" : typeof v === "string" ? v : JSON.stringify(v, null, 2));
  const fmtMs = (ms) => (ms == null ? "" : ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`);
  const inferToolKind = (t) => {
    if (t.kind) return t.kind;
    if (t.command != null) return "bash";
    if (t.diff != null) return "edit";
    if (t.code != null) return "code";
    const n = String(t.name || "");
    if (/^(read|get|fetch|inspect|view|list|load|open)/i.test(n)) return "read";
    if (/^(edit|write|apply|patch|update|create|save|set|modify)/i.test(n)) return "edit";
    if (/^(run|exec|bash|shell|cmd|terminal|ffmpeg|pnpm|npm|git)/i.test(n)) return "bash";
    if (/^(search|grep|find|query|lookup)/i.test(n)) return "search";
    return "tool";
  };
  const toolKindIcon = (t, st) => {
    if (st === "run") return LD_ARC;
    if (st === "error" || st === "fail") return ALERT;
    if (st === "stop") return "";
    if (t.icon) return icon(t.icon, 14);
    const k = inferToolKind(t);
    if (k === "read") return icon("eye", 14);
    if (k === "edit") return icon("square-pen", 14);
    if (k === "bash") return IC_TERM;
    if (k === "search") return icon("search", 14);
    if (k === "code") return icon("code-xml", 14);
    return icon("blocks", 14);
  };
  const toolHasDetail = (t) => !!(t.blocks?.length || t.command != null || t.diff != null || t.code != null || t.args != null || t.output != null || t.result != null);
  const toolDiffBadge = (t) => {
    if (t.badge) return `<span class="sn-tool-badge sn-num">${esc(t.badge)}</span>`;
    if (t.diff != null) {
      const { add, del } = diffCounts(t.diff);
      if (add || del) return `<span class="sn-tool-diff-stat sn-num">${add ? `<i class="sn-add">+${add}</i>` : ""}${del ? `<i class="sn-del">-${del}</i>` : ""}</span>`;
    }
    return "";
  };
  function toolDetailHTML(t) {
    const secs = [];
    if (Array.isArray(t.blocks) && t.blocks.length) {
      for (const b of t.blocks) {
        if (!b || b.content == null) continue;
        secs.push(renderChatCodeBox({ label: b.label || b.path || "", content: typeof b.content === "object" ? fmtJSON(b.content) : String(b.content), lang: b.lang || (typeof b.content === "object" ? "json" : inferLang(b.path, b.content)), showLines: !!b.lines, badge: b.badge || "" }));
      }
    } else {
      if (t.command != null) secs.push(renderChatCodeBox({ label: tt("chat.toolCmd"), content: t.command, lang: t.lang || "sh", badge: t.exitCode != null ? `exit ${t.exitCode}` : "" }));
      if (t.diff != null) secs.push(renderChatCodeBox({ label: t.path || tt("chat.toolDiff"), content: t.diff, lang: "diff" }));
      if (t.code != null) secs.push(renderChatCodeBox({ label: t.path || tt("chat.toolCode"), content: t.code, lang: t.lang || inferLang(t.path, t.code), showLines: true }));
      if (t.args != null) secs.push(renderChatCodeBox({ label: tt("chat.29"), content: fmtJSON(t.args), lang: typeof t.args === "object" ? "json" : (t.argsLang || inferLang("", t.args)) }));
      if (t.output != null) secs.push(renderChatCodeBox({ label: tt("chat.toolOutput"), content: fmtJSON(t.output), lang: typeof t.output === "object" ? "json" : (t.outputLang || "text") }));
      if (t.result != null) secs.push(renderChatCodeBox({ label: tt("chat.30"), content: fmtJSON(t.result), lang: typeof t.result === "object" ? "json" : (t.resultLang || inferLang("", t.result)) }));
    }
    return secs.length ? `<div class="sn-tool-bd"><div class="sn-tool-bd-in">${secs.join("")}</div></div>` : "";
  }
  const isToolOpen = (t) => (t.open != null ? !!t.open : curTraceMode === "expanded");
  function toolHTML(t, k, compact = false) {
    const st = t.status || "run", hasDetail = toolHasDetail(t), open = isToolOpen(t);
    const msStr = fmtMs(t.ms), kind = inferToolKind(t);
    const sub = t.label || t.path || (t.command ? t.command.split("\n")[0] : "");
    const titlePrimary = compact
      ? (t.command ? `<code class="sn-tool-cmd">${esc(t.command.split("\n")[0])}</code>` : t.path ? `<span class="sn-tool-path">${esc(t.label ? `${t.label} · ${t.path}` : t.path)}</span>` : `<code class="sn-tool-name">${esc(t.name || "")}</code>${sub ? `<span class="sn-tool-sub">${esc(sub)}</span>` : ""}`)
      : `<code class="sn-tool-name">${esc(t.name || "")}</code>${sub ? `<span class="sn-tool-sub">${esc(sub)}</span>` : ""}`;
    return `<div class="${compact ? "sn-tr-item " : ""}sn-tool sn-${esc(st)} sn-tkind-${esc(kind)}${open ? " sn-open" : ""}" data-tool-i="${k}" data-tool-id="${esc(t.id ?? k)}">` +
      `<button class="sn-tool-hd" type="button" aria-expanded="${open}"${hasDetail ? "" : " disabled"}>` +
      `<span class="sn-tool-ic">${toolKindIcon(t, st)}</span>` +
      `<span class="sn-tool-main">${titlePrimary}</span>` +
      toolDiffBadge(t) +
      (msStr ? `<span class="sn-tool-ms sn-num">${esc(msStr)}</span>` : "") +
      (hasDetail ? `<span class="sn-tool-chev">${compact || curToolStyle !== "card" ? CHEV_R : CHEV}</span>` : "") +
      `</button>${hasDetail ? toolDetailHTML(t) : ""}</div>`;
  }
  function syncTraceFade(list) {
    if (!list) return;
    const ch = list.clientHeight, sh = list.scrollHeight, ov = sh - ch;
    if (ov <= 2 || ch <= 0) {
      list.style.setProperty("--sn-tr-ft", "0px");
      list.style.setProperty("--sn-tr-fb", "0px");
      return;
    }
    const st = list.scrollTop, rem = Math.max(0, ov - st), cap = Math.min(28, Math.round(ch * .18));
    const ft = st <= 1 ? 0 : Math.min(cap, Math.round(st * .9));
    const fb = rem <= 1 ? 0 : Math.min(cap, Math.round(rem * .9));
    list.style.setProperty("--sn-tr-ft", ft + "px");
    list.style.setProperty("--sn-tr-fb", fb + "px");
  }
  function syncTraceFades(root) {
    if (!root) return;
    if (root.classList?.contains("sn-trace-list")) { syncTraceFade(root); return; }
    for (const l of root.querySelectorAll(".sn-trace-list")) syncTraceFade(l);
  }
  function applyCustomTools(root, it) {
    if (root) requestAnimationFrame(() => syncTraceFades(root));
    if (!curRenderTool || !root || !it?.tools?.length) return;
    for (const node of root.querySelectorAll(".sn-tool[data-tool-i]")) {
      const k = Number(node.dataset.toolI), t = it.tools[k];
      if (!t) continue;
      const res = curRenderTool(t, { esc, icon, highlight: highlightCode, codeBox: renderChatCodeBox, formatJSON: fmtJSON, index: k, style: curToolStyle, traceMode: curTraceMode, expanded: isToolOpen(t) });
      if (res == null) continue;
      if (typeof Node !== "undefined" && res instanceof Node) {
        node.classList.add("sn-tool-custom"); node.replaceChildren(res);
      } else if (typeof res === "string") {
        node.classList.add("sn-tool-custom"); node.innerHTML = res;
      } else if (typeof res === "object") {
        if (res.className) node.classList.add(...String(res.className).split(/\s+/).filter(Boolean));
        if (res.header != null) {
          const hd = node.querySelector(".sn-tool-main");
          if (hd) { if (typeof Node !== "undefined" && res.header instanceof Node) hd.replaceChildren(res.header); else hd.innerHTML = String(res.header); }
        }
        if (res.body != null) {
          const bd = node.querySelector(".sn-tool-bd-in");
          if (bd) { if (typeof Node !== "undefined" && res.body instanceof Node) bd.replaceChildren(res.body); else bd.innerHTML = String(res.body); }
        }
      }
    }
  }
  const traceCount = (it) => (it.tools?.length || 0) + (it.steps?.length || 0);
  const traceTotalSec = (it) => {
    const toolSec = (it.tools || []).reduce((a, t) => a + (Number(t.ms) || 0), 0) / 1000;
    const sum = (it.secs || 0) + toolSec;
    return sum > 0 ? sum : (it.durSec || 0);
  };
  function traceActiveLabel(it) {
    if (it.ph === "wait") return tt("chat.26");
    if (it.ph === "think") return `${tt("chat.26")} · ${fmtSec(it.secs || 0)}s`;
    const runningTool = [...(it.tools || [])].reverse().find((t) => t.status === "run") || it.tools?.at(-1);
    if (runningTool) return runningTool.label || runningTool.name || tt("chat.traceRun");
    const runningStep = [...(it.steps || [])].reverse().find((s) => s.s === "run") || it.steps?.at(-1);
    if (runningStep) return runningStep.t || tt("chat.traceRun");
    return tt("chat.traceRun");
  }
  function traceHeadLabel(it, liveNow) {
    const n = traceCount(it), hasThink = it.think != null && it.think.length > 0;
    if (liveNow) return traceActiveLabel(it);
    if (hasThink && n > 0) return tt("chat.traceDoneThink", { p0: n });
    if (n > 0) return tt("chat.traceDone", { p0: n });
    if (hasThink) return tt("chat.traceThinkOnly", { p0: fmtSec(it.secs || 1) });
    return "";
  }
  function traceGroupHTML(it) {
    const n = traceCount(it), hasThink = it.think != null;
    if (!hasThink && n === 0) return "";
    const liveNow = it.ph === "think" || it.ph === "tools" || it.ph === "steps";
    // 「仅当前执行」模式（active）：运行中且未手动展开时，只呈现极简单行（灵动三点轨道 + 当前执行动作）
    if (curTraceMode === "active" && liveNow && !it.traceOpen) {
      return `<div class="sn-trace sn-trace-active sn-live"><button class="sn-act-row" type="button" data-trace-toggle aria-expanded="false">${LD_ORB}<span class="sn-act-txt">${esc(traceActiveLabel(it))}</span><span class="sn-act-chev">${CHEV}</span></button></div>`;
    }
    const secTotal = traceTotalSec(it);
    const secTag = !liveNow && n > 0 && secTotal > 0 ? `<span class="sn-trace-sec sn-num">${esc(fmtSec(secTotal))}s</span>` : "";
    const rows = [];
    if (hasThink) {
      const snippet = String(it.think || "").replace(/\s+/g, " ").trim() || tt("chat.traceThinking");
      rows.push(
        `<div class="sn-tr-item sn-tr-think${it.thinkOpen ? " sn-open" : ""}">` +
        `<button class="sn-tr-hd" type="button" data-tr-think aria-expanded="${!!it.thinkOpen}">` +
        `<span class="sn-tool-ic">${it.ph === "think" ? LD_MATRIX : IC_THINK}</span>` +
        `<span class="sn-tool-main"><span class="sn-tr-snip">${esc(snippet)}</span></span>` +
        (it.secs ? `<span class="sn-tool-ms sn-num">${esc(fmtSec(it.secs))}s</span>` : "") +
        `<span class="sn-tool-chev">${CHEV_R}</span>` +
        `</button>` +
        `<div class="sn-tr-bd"><div><p class="sn-tr-think-txt">${esc(it.think)}</p></div></div></div>`
      );
    }
    (it.tools || []).forEach((t, k) => rows.push(toolHTML(t, k, true)));
    (it.steps || []).forEach((s) => rows.push(
      `<div class="sn-tr-item sn-tr-step ${Object.hasOwn(SI, s.s) ? "sn-" + esc(s.s) : "sn-done"}">` +
      `<div class="sn-tr-hd sn-static"><span class="sn-tool-ic">${SI[s.s] ?? ""}</span><span class="sn-tool-main"><span class="sn-tr-snip">${esc(s.t)}</span></span>${s.n ? `<span class="sn-tool-ms sn-num">${esc(s.n)}</span>` : ""}</div></div>`
    ));
    const totalOps = (hasThink ? 1 : 0) + n;
    return `<div class="sn-trace${it.traceOpen ? " sn-open" : ""}${liveNow ? " sn-live" : ""}">` +
      `<button class="sn-trace-hd" type="button" data-trace-toggle aria-expanded="${!!it.traceOpen}">` +
      (liveNow ? LD_ORB : "") +
      `<span class="sn-trace-t">${esc(traceHeadLabel(it, liveNow))}</span>` +
      secTag +
      `<span class="sn-trace-chev">${CHEV}</span>` +
      `</button>` +
      `<div class="sn-trace-bd"><div><div class="sn-trace-panel">` +
      `<div class="sn-trace-sum"><span class="sn-tool-ic">${IC_SUM}</span><span class="sn-trace-sum-t">${esc(tt("chat.traceSummary", { p0: totalOps }))}</span>${it.time ? `<span class="sn-tool-ms sn-num">${esc(it.time)}</span>` : ""}</div>` +
      `<div class="sn-trace-list">${rows.join("")}</div>` +
      `</div></div></div></div>`;
  }
  function aiHTML(it, keep) {
    const waitEl = it.ph === "wait"
      ? (curTraceMode === "active"
        ? `<div class="sn-trace sn-trace-active sn-live sn-ai-wait"><div class="sn-act-row">${LD_ORB}<span class="sn-act-txt">${esc(tt("chat.26"))}</span></div></div>`
        : `<div class="sn-ai-wait" role="status">${LD_MATRIX}<span class="sn-ai-wait-bars" aria-hidden="true"><i></i><i></i></span><span class="sn-ci-sr">${esc(tt("chat.26"))}</span></div>`)
      : "";
    let proc = "";
    if (curTraceMode === "collapsed" || curTraceMode === "active") {
      proc = traceGroupHTML(it);
    } else if (curTraceMode !== "hidden") {
      const thinkIc = it.ph === "think" ? LD_MATRIX : '<span class="sn-think-dot" aria-hidden="true"></span>';
      const thinkLbl = it.ph === "think" ? `${esc(tt("chat.26"))} <span class="sn-think-sec sn-num">${esc(fmtSec(it.secs || 0))}s</span>` : esc(tt("chat.23", { p0: fmtSec(it.secs || 1) }));
      const think = it.think == null ? "" : `<div class="sn-think${it.open ? " sn-open" : ""}${it.ph === "think" ? " sn-live" : ""}"><button class="sn-think-hd" type="button">${thinkIc}<span class="sn-think-t">${thinkLbl}</span>${icon("chevron-down", 14)}</button><div class="sn-think-bd"><div><p class="sn-think-txt">${esc(it.think)}</p></div></div></div>`;
      const tools = it.tools?.length ? `<div class="sn-tools">${it.tools.map((t, k) => toolHTML(t, k, false)).join("")}</div>` : "";
      const steps = it.steps?.length ? `<ol class="sn-ai-plan">${it.steps.map(stepHTML).join("")}</ol>` : "";
      proc = `${think}${tools}${steps}`;
    }
    const useAiMd = curAiMd && it.ph !== "text" && hasMarkdown(it.text);
    const text = it.text || it.ph === "text"
      ? `<div class="sn-ai-text${useAiMd ? " sn-md-msg" : ""}">${useAiMd ? renderChatMD(it.text) : esc(it.text)}${it.ph === "text" ? '<span class="sn-caret"></span>' : ""}</div>`
      : "";
    const cards = it.cards ? `<div class="sn-ai-cards">${it.cardList.slice(0, it.cards).map(cardHTML).join("")}</div>` : "";
    const img = it.img ? imgHTML(it.img) : "";
    return `<div class="sn-msg sn-ai sn-rich"><div class="sn-ai-body">${waitEl}${proc}${text}${cards}${img}${it.stopped ? STOPPED : ""}${it.acts ? aiActsHTML(it, keep) : ""}</div></div>`;
  }
  const imgHTML = (m) => `<div class="sn-ai-image${m.done ? " sn-done" : ""}"><span class="sn-blur" style="--sn-g:${esc(m.g)}"></span><span class="sn-pic" style="--sn-g:${esc(m.g)}"></span><span class="sn-gen-l">${LD_ARC}${tt("chat.12")} <b class="sn-num">${Math.round(m.p * 100)}%</b></span></div>`;
  const STOPPED = tt("chat.13");
  // ———— 编辑回溯：撤销当前用户消息及后续全部对话（逆序错峰柔撤），原气泡镜像弹簧飞回输入框，保留历史平滑落位 ————
  let rewinding = false, rewindTimer = 0;
  composer.addEventListener("animationend", (e) => { if (e.target === composer) composer.classList.remove("sn-cm-catch"); });
  function editMessage(it) {
    if (!it || rewinding) return;
    const idx = index.get(it.id);
    if (idx == null || !it.me || typeof it.text !== "string") return;
    // 若 AI 正在回复中，立即静默中止（不追加“已停止”）
    if (job) { job.stop = true; job.rewound = true; job = null; composer._cm?.setBusy(false); }
    cancelAnimationFrame(fRaf); fRaf = 0; fv = 0;
    cancelAnimationFrame(gRaf); gRaf = 0;
    let cutAt = idx;
    while (cutAt > 1 && items[cutAt - 1]?.kind === "day") cutAt--;
    const text = it.text, removed = items.slice(cutAt);
    const commit = () => {
      const oldScroll = vp.scrollTop;
      for (const r of removed) { const el = live.get(r.id); if (el) drop(r.id, el); }
      items.splice(cutAt); reindex();
      msgCount = 0; for (const x of items) if (x.kind === "msg" || x.kind === "ai") msgCount++;
      relayout(1);
      const newMax = maxTop(), clamped = Math.max(0, oldScroll - newMax);
      pinned = true;
      if (clamped > 1 && !reduced()) { vp.scrollTop = newMax; slide(-clamped, 280); }
      else if (vp.scrollTop < newMax - 2) glide(newMax, 260);
      else vp.scrollTop = newMax;
      render();
      for (const prev of canvas.querySelectorAll(".sn-ai-acts.sn-keep")) prev.classList.remove("sn-keep");
      const lastIt = items[items.length - 1];
      if (lastIt && (lastIt.kind === "ai" || (lastIt.kind === "msg" && !lastIt.me))) live.get(lastIt.id)?.querySelector(".sn-ai-acts")?.classList.add("sn-keep");
      if (msgCount === 0) showEmpty();
      syncRailItems(); syncJump();
      rewinding = false;
    };
    if (reduced()) { composer._cm?.fill(text); commit(); return; }
    rewinding = true;
    const editEl = live.get(it.id), editBubble = editEl?.querySelector(".sn-bubble");
    const br = editBubble?.getBoundingClientRect(), bcs = editBubble ? getComputedStyle(editBubble) : null;
    // 静默回填让输入框提前算好目标高度与文本坐标，文字先藏起等待飞行影子落地无缝交接
    ta.style.opacity = "0";
    ta.value = text;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    const tr = ta.getBoundingClientRect(), tcs = getComputedStyle(ta);
    const tpl = parseFloat(tcs.paddingLeft), tpt = parseFloat(tcs.paddingTop), tpr = parseFloat(tcs.paddingRight);
    const dst = { x: tr.left + tpl, y: tr.top + tpt - ta.scrollTop, w: ta.clientWidth - tpl - tpr };
    // 后续对话与孤立日期条：从最新往回逆序错峰柔撤（像时间倒流优雅收卷）
    const tailEls = [];
    for (let i = items.length - 1; i >= cutAt; i--) {
      const r = items[i]; if (r.id === it.id) continue;
      const el = live.get(r.id); if (el) tailEls.push(el);
    }
    const RETRACT_DUR = 220, RETRACT_STEP = 26, MAX_STAGGER = 110;
    let maxEnd = 0;
    tailEls.forEach((el, k) => {
      el.classList.add("sn-rewinding");
      const inner = el.firstElementChild || el, delay = Math.min(MAX_STAGGER, k * RETRACT_STEP);
      maxEnd = Math.max(maxEnd, delay + RETRACT_DUR);
      inner.animate(
        [{ opacity: 1, transform: "translateY(0) scale(1)" }, { opacity: 0, transform: "translateY(-10px) scale(.982)" }],
        { duration: RETRACT_DUR, delay, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards" }
      );
    });
    // 镜像对称上凸抛物线：水平（285ms）略快于竖直（335ms），从右侧轻盈横移再温柔落进输入框第一行
    const FLY_X = 285, FLY_Y = 335;
    let ghost = null, step = null, taAnim = null;
    const finishEdit = () => {
      if (step) { ghosts.delete(step); step = null; }
      ghost?.remove(); ghost = null;
      taAnim?.cancel(); taAnim = null;
      ta.style.opacity = "";
      ta.focus({ preventScroll: true });
      const n = ta.value.length; ta.setSelectionRange(n, n);
      composer.classList.remove("sn-cm-catch"); void composer.offsetWidth; composer.classList.add("sn-cm-catch");
      commit();
    };
    if (editEl && editBubble && br && bcs && br.width > 0 && br.height > 0) {
      editEl.classList.add("sn-rewinding");
      editBubble.style.visibility = "hidden";
      const fxR = fx.getBoundingClientRect();
      const bl = parseFloat(bcs.paddingLeft), bt = parseFloat(bcs.paddingTop), brp = parseFloat(bcs.paddingRight), bb = parseFloat(bcs.paddingBottom);
      const bw = br.width - bl - brp, rad = bcs.borderRadius;
      const slotX = br.left - fxR.left, slotY = br.top - fxR.top;
      const dxTotal = dst.x - (br.left + bl), dyTotal = dst.y - (br.top + bt);
      ghost = document.createElement("div"); ghost.className = "sn-fx-g sn-fx-back";
      Object.assign(ghost.style, { left: slotX + "px", top: slotY + "px", width: br.width + "px", height: br.height + "px", borderRadius: rad });
      ghost.style.setProperty("--sn-fx-d", FLY_Y + "ms");
      const sh = document.createElement("i"); sh.className = "sn-fx-sh";
      Object.assign(sh.style, { width: br.width + "px", height: br.height + "px", borderRadius: rad });
      const clip = document.createElement("div"); clip.className = "sn-fx-clip";
      const bg = document.createElement("i"); bg.className = "sn-fx-bg";
      const c = editBubble.cloneNode(true); c.style.visibility = ""; c.style.width = br.width + "px";
      const s = document.createElement("div"); s.className = "sn-fx-src"; s.textContent = text;
      Object.assign(s.style, { left: bl + "px", top: bt + "px", font: tcs.font, lineHeight: tcs.lineHeight, width: "max-content" });
      clip.append(bg, c, s); ghost.append(sh, clip); fx.append(ghost);
      const natural = s.getBoundingClientRect().width;
      const isMdBub = editBubble.classList.contains("sn-md-msg");
      if (!isMdBub && natural <= bw + .5 && natural <= dst.w + .5) {
        s.remove(); clip.style.clipPath = `inset(0 round ${rad})`;
        c.style.lineHeight = tcs.lineHeight;
        bg.animate([{ opacity: 1 }, { opacity: .45, offset: .45 }, { opacity: 0 }], { duration: Math.round(FLY_Y * .72), easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards" });
        c.animate([{ opacity: 1 }, { opacity: 1, offset: .86 }, { opacity: 0 }], { duration: FLY_Y, easing: "ease-out", fill: "forwards" });
      } else {
        s.style.width = dst.w + "px";
        const th = s.offsetHeight, gw = Math.max(br.width, dst.w + bl + brp), gh = Math.max(br.height, th + bt + bb);
        ghost.style.width = gw + "px"; ghost.style.height = gh + "px";
        clip.animate(
          [{ clipPath: `inset(0 ${gw - br.width}px ${gh - br.height}px 0 round ${rad})` }, { clipPath: `inset(0 ${gw - (dst.w + bl + brp)}px ${gh - (th + bt + bb)}px 0 round 12px)` }],
          { duration: 240, easing: RISE_CSS, fill: "both" }
        );
        bg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 210, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards" });
        c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: "ease-out", fill: "forwards" });
        s.animate([{ opacity: 0 }, { opacity: 1, offset: .45 }, { opacity: 1, offset: .86 }, { opacity: 0 }], { duration: FLY_Y, delay: 40, easing: "ease-out", fill: "both" });
      }
      taAnim = ta.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 42, delay: Math.round(FLY_Y * .86), easing: "ease-out", fill: "forwards" });
      const t0 = now0(), totalDur = Math.max(FLY_X, FLY_Y, maxEnd);
      step = (now) => {
        const elapsed = Math.max(0, now - t0);
        const px = GLIDE(Math.min(1, elapsed / FLY_X)), py = RISE(Math.min(1, elapsed / FLY_Y));
        ghost.style.transform = `translate(${dxTotal * px}px, ${dyTotal * py}px)`;
        if (elapsed >= totalDur) finishEdit();
      };
      step(t0); ghosts.add(step); motion();
    } else {
      ta.style.opacity = "";
      ta.animate([{ opacity: .15 }, { opacity: 1 }], { duration: 220, easing: "ease-out" });
      rewindTimer = setTimeout(() => { rewindTimer = 0; finishEdit(); }, Math.max(120, maxEnd));
    }
  }
  // 活动流内部滚动与展开收起过渡实时同步上下柔和渐隐（到顶/到底严格清零，绝不遮挡首末行内容）
  canvas.addEventListener("scroll", (e) => {
    const l = e.target;
    if (l?.classList?.contains("sn-trace-list")) syncTraceFade(l);
  }, true);
  canvas.addEventListener("transitionend", (e) => {
    const t = e.target;
    if (t?.classList?.contains("sn-trace-bd") || t?.classList?.contains("sn-tool-bd") || t?.classList?.contains("sn-tr-bd")) {
      const ci = t.closest(".sn-ci");
      if (ci) { syncTraceFades(ci); if (ci._it) measureItem(ci._it); }
    }
  });
  // 复制、赞/踩、编辑、重新生成、过程汇总/工具展开、代码复制、置顶/按需历史加载：全委托在 canvas 上
  canvas.addEventListener("click", (e) => {
    const histBtn = e.target.closest("[data-hist-load]");
    if (histBtn && !histBtn.disabled) {
      userAt = performance.now();
      loadOlder(Number(histBtn.dataset.histLoad) || 1);
      return;
    }
    const copyCode = e.target.closest("[data-copy-code]");
    if (copyCode) {
      const pre = copyCode.closest(".sn-tcode")?.querySelector(".sn-tcode-pre code");
      if (pre) {
        navigator.clipboard?.writeText(pre.textContent || "").catch(() => {});
        const sw = copyCode.querySelector(".sn-swap");
        if (sw) { sw.classList.add("sn-on"); clearTimeout(copyCode._t); copyCode._t = setTimeout(() => sw.classList.remove("sn-on"), 1500); }
      }
      return;
    }
    const trToggle = e.target.closest("[data-trace-toggle]");
    if (trToggle) {
      const ci = trToggle.closest(".sn-ci"), it = ci?._it;
      if (it) {
        it.traceOpen = !it.traceOpen;
        const wrap = trToggle.closest(".sn-trace");
        if (wrap?.classList.contains("sn-trace-active")) {
          // 专注单行模式点开 → 立即展开完整活动流面板
          const tmp = document.createElement("div"); tmp.innerHTML = traceGroupHTML(it);
          const next = tmp.firstElementChild;
          if (next) { wrap.replaceWith(next); applyCustomTools(next, it); }
        } else if (wrap) {
          wrap.classList.toggle("sn-open", it.traceOpen);
          trToggle.setAttribute("aria-expanded", String(it.traceOpen));
          requestAnimationFrame(() => syncTraceFades(wrap));
        }
        userAt = performance.now();
      }
      return;
    }
    const trThink = e.target.closest("[data-tr-think]");
    if (trThink) {
      const ci = trThink.closest(".sn-ci"), it = ci?._it, item = trThink.closest(".sn-tr-think");
      if (it && item) {
        it.thinkOpen = !it.thinkOpen;
        item.classList.toggle("sn-open", it.thinkOpen);
        trThink.setAttribute("aria-expanded", String(it.thinkOpen));
        requestAnimationFrame(() => syncTraceFades(ci));
        userAt = performance.now();
      }
      return;
    }
    const thd = e.target.closest(".sn-tool-hd");
    if (thd && !thd.disabled) {
      const card = thd.closest(".sn-tool"), ci = thd.closest(".sn-ci"), it = ci?._it, k = Number(card?.dataset.toolI);
      if (it?.tools?.[k]) {
        const nextOpen = !isToolOpen(it.tools[k]);
        it.tools[k].open = nextOpen;
        card.classList.toggle("sn-open", nextOpen);
        thd.setAttribute("aria-expanded", String(nextOpen));
        requestAnimationFrame(() => syncTraceFades(ci));
        userAt = performance.now();
      }
      return;
    }
    const b = e.target.closest(".sn-ai-acts [data-act], .sn-me-acts [data-act]"); if (!b) return;
    const ci = b.closest(".sn-ci"), it = ci?._it;
    if (b.dataset.act === "copy") {
      const t = it?.text || ci?.querySelector(".sn-ai-text, .sn-bubble")?.textContent || "";
      navigator.clipboard?.writeText(t).catch(() => {});
      const sw = b.querySelector(".sn-swap"); if (sw) { sw.classList.add("sn-on"); clearTimeout(b._t); b._t = setTimeout(() => sw.classList.remove("sn-on"), 1500); }
      return;
    }
    if (b.dataset.act === "edit" && it?.text) { editMessage(it); return; }
    if (b.dataset.act === "regen" && respond && !job) {
      const i = it ? index.get(it.id) : -1;
      let q = ""; for (let k = i - 1; k >= 0; k--) if (items[k].me && items[k].text) { q = items[k].text; break; }
      if (q) reply(q, Promise.resolve());
      return;
    }
    if (b.dataset.act === "up" || b.dataset.act === "down") {
      const on = !b.classList.contains("sn-is-on"); for (const x of b.parentElement.querySelectorAll('[data-act="up"], [data-act="down"]')) x.classList.remove("sn-is-on"); b.classList.toggle("sn-is-on", on);
      if (on && !reduced()) b.querySelector(".sn-ic")?.animate([{ transform: "scale(1)" }, { transform: "scale(1.22) rotate(-8deg)", offset: .4 }, { transform: "scale(1)" }], { duration: 360, easing: "cubic-bezier(.34,1.56,.64,1)" });
    }
  });
  const SI = { run: LD_ARC, done: CHECK, stop: "", wait: "" };
  const stepHTML = (s) => `<li class="${Object.hasOwn(SI, s.s) ? "sn-" + s.s : ""}"><span class="sn-si">${SI[s.s] ?? ""}</span><span>${esc(s.t)}</span><span class="sn-sn sn-num">${esc(s.n || "")}</span></li>`;
  const cardHTML = ([n, m, t, g]) => `<div class="sn-ai-card"><i style="--sn-g:${esc(g)}"></i><div><b>${tt("chat.19")}${esc(n)}</b><span>${esc(m)}</span><span>${esc(t)}</span></div></div>`;
  canvas.addEventListener("click", (e) => {
    const hd = e.target.closest(".sn-think-hd"); if (hd) { const el = hd.closest(".sn-ci"), it = el?._it; if (!it) return; it.open = !it.open; hd.parentElement.classList.toggle("sn-open", it.open); userAt = performance.now(); return; }
    // 触屏无悬停设备：点按对应消息内容区展开该条操作栏，点空白处收起
    if (typeof matchMedia === "function" && matchMedia("(hover: none)").matches && !e.target.closest("button, a, .sn-ph, .sn-ai-image, .sn-tool-hd, [data-trace-toggle], [data-tr-think]")) {
      const col = e.target.closest(".sn-msg-col, .sn-ai-body");
      for (const x of canvas.querySelectorAll(".sn-act-open")) if (x !== col) x.classList.remove("sn-act-open");
      if (col) col.classList.toggle("sn-act-open");
    }
  });
  const liveEl = (it) => live.get(it.id) || null;
  // 匀速放字：网络来的字先进缓冲，每帧按积压多少放出几个字（每秒 45～160 个），每段新字温柔显影
  function revealer(it, key, sel) {
    let buf = "", raf = 0, acc = 0, last = 0, resolve = null;
    const tick = (now) => {
      raf = 0; if (!buf) { resolve?.(); resolve = null; return; }
      const dt = last ? Math.min(50, now - last) : 16; last = now;
      acc += dt / 1000 * Math.min(160, 45 + buf.length * 1.5); const n = Math.floor(acc); if (n < 1) { raf = requestAnimationFrame(tick); return; }
      acc -= n; const chunk = [...buf].slice(0, n).join(""); buf = buf.slice(chunk.length); it[key] += chunk;
      const el = liveEl(it)?.querySelector(sel);
      if (el) {
        const s = document.createElement("span"); s.className = "sn-tk"; s.textContent = chunk; const c = el.querySelector(".sn-caret"); el.insertBefore(s, c);
        if (el.scrollHeight > el.clientHeight + 1) el.scrollTop = el.scrollHeight;
        if (key === "think") el.classList.toggle("sn-think-fade", el.scrollTop > 2);
      }
      raf = requestAnimationFrame(tick);
    };
    return {
      push(s) { buf += s; if (!raf) { last = 0; raf = requestAnimationFrame(tick); } },
      drain() { return new Promise((r) => { if (!buf && !raf) r(); else resolve = r; }); },
      stop() { buf = ""; cancelAnimationFrame(raf); raf = 0; resolve?.(); resolve = null; },
    };
  }
  // 淡入结束的字合并回纯文本，DOM 节点不会越积越多
  canvas.addEventListener("animationend", (e) => { const s = e.target; if (s.classList?.contains("sn-tk")) { const p = s.parentNode; s.replaceWith(s.textContent); if (p && p.childNodes.length > 40) p.normalize(); } });
  let job = null;
  // 回答：按 respond 给的一段段内容画——思考（实时读秒）、工具调用（多样式+高亮）、步骤、正文（实时测算 TPS）、镜头卡片、生成画面；停止、出错都在原地收尾
  async function reply(prompt, after) {
    if (!respond) return;
    const me = { stop: false }; job = me;
    const it = { id: ++seq, kind: "ai", me: false, keep: true, ph: "text", think: null, secs: 0, open: true, traceOpen: false, thinkOpen: false, tools: [], steps: [], text: "", cards: 0, cardList: [], img: null, acts: false, stopped: false, time: fmtClock(), durSec: null, tps: null };
    composer._cm?.setBusy(true);
    await after; await wait(90); if (me.rewound) return; if (me.stop) return finish(it, me);
    let inserted = false, th = null, tx = null, t0 = 0, runStart = performance.now(), textStart = 0, thinkIv = 0, lastActText = "";
    const isGroupedMode = () => curTraceMode === "collapsed" || curTraceMode === "active";
    const syncTraceDOM = () => {
      if (!isGroupedMode()) return;
      const el = liveEl(it), body = el?.querySelector(".sn-ai-body");
      if (!body) return;
      const cur = body.querySelector(".sn-trace");
      // 仅当前执行单行模式且未展开时：只丝滑替换单行文案（带柔和上滑切换动效），不重建 DOM
      if (curTraceMode === "active" && !it.traceOpen && cur?.classList.contains("sn-trace-active") && (it.ph === "think" || it.ph === "tools" || it.ph === "steps")) {
        const nextTxt = traceActiveLabel(it), txtEl = cur.querySelector(".sn-act-txt");
        if (txtEl && nextTxt !== lastActText) {
          lastActText = nextTxt;
          txtEl.textContent = nextTxt;
          if (!reduced()) {
            txtEl.animate([{ opacity: 0, transform: "translateY(5px)" }, { opacity: 1, transform: "none" }], { duration: 200, easing: "cubic-bezier(.22,1,.36,1)" });
          }
        }
        return;
      }
      const html = traceGroupHTML(it);
      if (!html) { cur?.remove(); return; }
      const tmp = document.createElement("div"); tmp.innerHTML = html;
      const next = tmp.firstElementChild;
      if (cur) cur.replaceWith(next);
      else body.prepend(next);
      applyCustomTools(next, it);
      lastActText = traceActiveLabel(it);
      measureItem(it);
    };
    const stopThinkTimer = () => { if (thinkIv) { clearInterval(thinkIv); thinkIv = 0; } };
    const startThinkTimer = () => {
      stopThinkTimer(); t0 = performance.now();
      thinkIv = setInterval(() => {
        if (it.ph !== "think") { stopThinkTimer(); return; }
        it.secs = (performance.now() - t0) / 1000;
        const secEl = liveEl(it)?.querySelector(".sn-think-sec");
        if (secEl) secEl.textContent = fmtSec(it.secs) + "s";
        if (isGroupedMode()) {
          const actTxt = liveEl(it)?.querySelector(".sn-act-txt, .sn-trace-t");
          if (actTxt) actTxt.textContent = traceActiveLabel(it);
        }
      }, 140);
    };
    const unwait = (ph) => { if (it.ph !== "wait") return false; it.ph = ph; liveEl(it)?.querySelector(".sn-ai-wait")?.remove(); return true; };
    const show = (ph) => {
      if (inserted) return; inserted = true; it.ph = ph; if (ph === "think") it.think = "";
      for (const prev of canvas.querySelectorAll(".sn-ai-acts.sn-keep")) prev.classList.remove("sn-keep");
      insert([it], { dur: DY }); msgCount++;
      const el = liveEl(it); if (el) { el.classList.add("sn-streaming"); if (!reduced()) el.classList.add("sn-reveal"); }
      if (!pinned) { unread++; syncJump(); }
      if (ph === "think") startThinkTimer();
    };
    const closeThink = async (ph) => {
      if (it.ph !== "think") return;
      stopThinkTimer();
      await th?.drain(); it.ph = ph; it.open = false; it.secs = Math.max(.4, (performance.now() - t0) / 1000);
      if (isGroupedMode()) { syncTraceDOM(); return; }
      const el = liveEl(it), t = el?.querySelector(".sn-think");
      if (t) {
        t.classList.remove("sn-live", "sn-open");
        const txEl = t.querySelector(".sn-think-txt"); if (txEl) { txEl.classList.remove("sn-think-fade"); txEl.scrollTop = 0; }
        const ld = t.querySelector(".sn-think-hd .sn-ld");
        if (ld) ld.outerHTML = '<span class="sn-think-dot" aria-hidden="true"></span>';
        const ttEl = t.querySelector(".sn-think-t"); if (ttEl) ttEl.textContent = tt("chat.23", { p0: fmtSec(it.secs) });
      }
    };
    const toText = async () => {
      if (tx) return tx;
      if (!inserted) show("text");
      else { unwait("text"); await closeThink("text"); it.ph = "text"; if (isGroupedMode()) syncTraceDOM(); liveEl(it)?.querySelector(".sn-ai-body")?.insertAdjacentHTML("beforeend", '<div class="sn-ai-text"><span class="sn-caret"></span></div>'); }
      textStart = performance.now();
      tx = revealer(it, "text", ".sn-ai-text"); return tx;
    };
    const endText = async () => { if (tx && it.ph === "text") { await tx.drain(); if (me.stop) return; it.ph = "cards"; liveEl(it)?.querySelector(".sn-ai-text .sn-caret")?.remove(); } };
    const addTool = async (tool) => {
      if (!inserted) show("tools"); else { unwait("tools"); await closeThink("tools"); it.ph = "tools"; }
      if (me.stop) return;
      const entry = { status: "run", open: curTraceMode === "expanded" ? true : undefined, _t0: performance.now(), ...tool };
      const k = it.tools.push(entry) - 1;
      if (curTraceMode === "hidden") return;
      if (isGroupedMode()) { syncTraceDOM(); return; }
      const el = liveEl(it); if (!el) return;
      let wrap = el.querySelector(".sn-tools");
      if (!wrap) { wrap = document.createElement("div"); wrap.className = "sn-tools"; const thEl = el.querySelector(".sn-think"); if (thEl) thEl.after(wrap); else el.querySelector(".sn-ai-body").prepend(wrap); }
      wrap.insertAdjacentHTML("beforeend", toolHTML(entry, k, false));
      applyCustomTools(wrap, it);
    };
    const setTool = (patchObj) => {
      const k = patchObj.id != null ? it.tools.findIndex((x) => x.id === patchObj.id) : (patchObj.index ?? it.tools.length - 1);
      const entry = it.tools[k]; if (!entry) return;
      for (const f of ["status", "label", "path", "command", "code", "diff", "lang", "args", "output", "result", "badge", "exitCode", "blocks", "kind", "icon"]) {
        if (patchObj[f] != null) entry[f] = patchObj[f];
      }
      if (patchObj.ms != null) entry.ms = patchObj.ms;
      else if (entry.status === "done" && entry.ms == null && entry._t0) entry.ms = Math.round(performance.now() - entry._t0);
      if (curTraceMode === "hidden") return;
      if (isGroupedMode()) { syncTraceDOM(); return; }
      const card = liveEl(it)?.querySelectorAll(".sn-tools > .sn-tool")[k];
      if (!card) return;
      card.outerHTML = toolHTML(entry, k, false);
      applyCustomTools(liveEl(it)?.querySelector(".sn-tools"), it);
    };
    const addStep = async (st) => {
      if (!inserted) show("steps"); else { unwait("steps"); await closeThink("steps"); it.ph = "steps"; }
      if (me.stop) return;
      it.steps.push(st);
      if (curTraceMode === "hidden") return;
      if (isGroupedMode()) { syncTraceDOM(); return; }
      const el = liveEl(it); if (!el) return; let ol = el.querySelector(".sn-ai-plan"); if (!ol) { ol = document.createElement("ol"); ol.className = "sn-ai-plan"; const prev = el.querySelector(".sn-tools") || el.querySelector(".sn-think"); if (prev) prev.after(ol); else el.querySelector(".sn-ai-body").prepend(ol); } ol.insertAdjacentHTML("beforeend", stepHTML(st));
    };
    const setStep = ({ index: k, s: st, n }) => {
      const x = it.steps[k]; if (!x) return; if (st != null) x.s = st; if (n != null) x.n = n;
      if (curTraceMode === "hidden") return;
      if (isGroupedMode()) { syncTraceDOM(); return; }
      const li = liveEl(it)?.querySelectorAll(".sn-ai-plan li")[k]; if (!li) return; li.className = x.s ? "sn-" + x.s : ""; li.querySelector(".sn-si").innerHTML = SI[x.s]; li.querySelector(".sn-sn").textContent = x.n || "";
    };
    const addCard = async (c) => {
      await endText(); if (me.stop) return; if (!inserted) show("cards"); else unwait("cards");
      it.cardList.push(c); it.cards = it.cardList.length;
      const el = liveEl(it); if (el) { let row = el.querySelector(".sn-ai-cards"); if (!row) { row = document.createElement("div"); row.className = "sn-ai-cards"; el.querySelector(".sn-ai-body").append(row); } row.insertAdjacentHTML("beforeend", cardHTML(c)); }
    };
    const image = async (part) => {
      if (part.image) { await endText(); if (me.stop) return; if (!inserted) show("cards"); else unwait("cards"); it.img = { g: part.image.g, p: 0, done: false }; liveEl(it)?.querySelector(".sn-ai-body").insertAdjacentHTML("beforeend", imgHTML(it.img)); }
      else if (part.imageProgress != null && it.img) { it.img.p = part.imageProgress; const b = liveEl(it)?.querySelector(".sn-ai-image b"); if (b) b.textContent = Math.round(it.img.p * 100) + "%"; }
      else if (part.imageDone && it.img) { it.img.done = true; liveEl(it)?.querySelector(".sn-ai-image")?.classList.add("sn-done"); }
    };
    show("wait");
    try {
      const out = respond(prompt, { get stopped() { return me.stop; } });
      if (out && typeof out[Symbol.asyncIterator] === "function") {
        for await (const part of out) {
          if (me.stop) break;
          if (part == null) continue;
          if (typeof part !== "object") (await toText()).push(String(part));
          else if (part.think != null) {
            if (tx) continue;
            if (!inserted) show("think");
            else if (unwait("think")) {
              it.think = ""; startThinkTimer();
              if (isGroupedMode()) syncTraceDOM();
              else if (curTraceMode !== "hidden") {
                const el = liveEl(it);
                if (el) { const tmp = document.createElement("div"); tmp.innerHTML = aiHTML(it); const tn = tmp.querySelector(".sn-think"); if (tn) el.querySelector(".sn-ai-body")?.prepend(tn); }
              }
            }
            if (isGroupedMode() || curTraceMode === "hidden") {
              it.think = (it.think || "") + String(part.think);
              if (isGroupedMode() && it.traceOpen) {
                const p = liveEl(it)?.querySelector(".sn-tr-think-txt"); if (p) p.textContent = it.think;
                const sn = liveEl(it)?.querySelector(".sn-tr-think .sn-tr-snip"); if (sn) sn.textContent = it.think.replace(/\s+/g, " ").trim();
              }
            } else {
              th ??= revealer(it, "think", ".sn-think-txt"); th.push(String(part.think));
            }
          }
          else if (part.tool) await addTool(part.tool);
          else if (part.toolUpdate) setTool(part.toolUpdate);
          else if (part.text != null) (await toText()).push(String(part.text));
          else if (part.step) await addStep(part.step);
          else if (part.stepUpdate) setStep(part.stepUpdate);
          else if (part.card) await addCard(part.card);
          else if (part.image || part.imageProgress != null || part.imageDone) await image(part);
          if (me.stop) break;
        }
      } else { const text = await out; if (!me.stop && text) (await toText()).push(String(text)); }
    } catch (e) { if (!me.stop) { (await toText()).push(tt("chat.24")); } }
    stopThinkTimer();
    if (me.rewound) { th?.stop(); tx?.stop(); return; }
    if (!inserted && !me.stop) show("text");
    unwait("text");
    await th?.drain(); await tx?.drain();
    if (me.rewound) return;
    const nowEnd = performance.now();
    it.time = fmtClock();
    it.durSec = Math.max(.2, (nowEnd - runStart) / 1000);
    const totalChars = (it.think?.length || 0) + (it.text?.length || 0);
    if (totalChars > 0) {
      const genSec = Math.max(.25, (nowEnd - (textStart || runStart)) / 1000);
      it.tps = Math.min(240, Math.max(12, (totalChars * 1.15) / genSec));
    }
    liveEl(it)?.querySelector(".sn-ai-text .sn-caret")?.remove();
    finish(it, me);
  }
  // 收尾：原地收拢过程条、补上 Markdown 排版、已停止与操作按钮（含真实时间、耗时、TPS）
  function finish(it, me) {
    if (job === me) job = null;
    if (it.ph === "wait") { it.ph = "text"; liveEl(it)?.querySelector(".sn-ai-wait")?.remove(); }
    if (index.has(it.id)) {
      if (me.stop) {
        it.stopped = true;
        it.steps.forEach((s) => { if (s.s === "run") s.s = "stop"; });
        it.tools.forEach((t) => { if (t.status === "run") t.status = "stop"; });
        if (it.img && !it.img.done) it.img = null;
        if (it.ph === "think") { it.open = false; it.secs = it.secs || 1; }
      }
      it.ph = "done"; it.acts = true; it.keep = false;
      const el = liveEl(it);
      if (el) {
        el.querySelector(".sn-ai-text .sn-caret")?.remove();
        if (curTraceMode === "collapsed" || curTraceMode === "active") {
          const curTr = el.querySelector(".sn-trace");
          const html = traceGroupHTML(it);
          if (html) {
            const tmp = document.createElement("div"); tmp.innerHTML = html;
            const next = tmp.firstElementChild;
            if (curTr) curTr.replaceWith(next); else el.querySelector(".sn-ai-body")?.prepend(next);
            applyCustomTools(next, it);
          } else curTr?.remove();
        } else {
          const t = el.querySelector(".sn-think");
          if (t?.classList.contains("sn-live")) {
            t.classList.remove("sn-live", "sn-open");
            const txEl = t.querySelector(".sn-think-txt"); if (txEl) { txEl.classList.remove("sn-think-fade"); txEl.scrollTop = 0; }
            const ld = t.querySelector(".sn-think-hd .sn-ld"); if (ld) ld.outerHTML = '<span class="sn-think-dot" aria-hidden="true"></span>';
            const ttEl = t.querySelector(".sn-think-t"); if (ttEl) ttEl.textContent = tt("chat.23", { p0: fmtSec(it.secs || 1) });
          }
          el.querySelectorAll(".sn-tools .sn-tool.sn-run").forEach((c) => { c.className = "sn-tool sn-stop"; const ic = c.querySelector(".sn-tool-ic"); if (ic) ic.innerHTML = ""; });
          el.querySelectorAll(".sn-ai-plan li.sn-run").forEach((li) => { li.className = "sn-stop"; li.querySelector(".sn-si").innerHTML = ""; });
        }
        // 流式结束后若正文含 Markdown，就地无闪烁升级为安全 Markdown 高亮排版
        if (curAiMd && it.text && hasMarkdown(it.text)) {
          const txNode = el.querySelector(".sn-ai-text");
          if (txNode) { txNode.classList.add("sn-md-msg"); txNode.innerHTML = renderChatMD(it.text); }
        }
        if (!it.img) el.querySelector(".sn-ai-image:not(.sn-done)")?.remove();
        el.querySelector(".sn-ai-body").insertAdjacentHTML("beforeend", (it.stopped ? STOPPED : "") + aiActsHTML(it, true));
        el.classList.remove("sn-streaming");
      }
    }
    composer._cm?.setBusy(false);
  }
  composer.addEventListener("compose", (e) => { const sent = send(e.detail.text); if (sent) reply(e.detail.text || tt("chat.25"), sent.landed); });
  composer.addEventListener("compose-stop", () => { if (job) job.stop = true; });

  // ———— 外面驱动：收到一条消息、程序发一条（可以模拟发送失败）、平滑滚到最早 ————
  function receive(raw) {
    const [it] = ingest([{ kind: "msg", me: false, type: "text", time: fmtClock(), durSec: 1.4, tps: 68.5, ...raw }]);
    for (const prev of canvas.querySelectorAll(".sn-ai-acts.sn-keep")) prev.classList.remove("sn-keep");
    insert([it]); if (!pinned) { unread++; syncJump(); }
    const el = liveEl(it); if (el && !reduced()) el.classList.add("sn-reveal");
    return it;
  }
  const sendText = (text, opt) => { ta.value = text; return send(text, opt); };
  const scrollToOldest = () => { pinned = false; glide(0, 900); };
  const getStats = () => ({ loaded: msgCount, total: historyTotal() || msgCount, hasMore: !!history?.hasMore?.(), liveNodes: live.size });

  // ———— 尺寸变化：容器窄于 560px 自动收紧边距并隐藏刻度轨，保证消息与输入框宽度比例舒展 ————
  const syncNarrow = () => {
    const bw = box.clientWidth || vp.clientWidth;
    const narrow = bw > 0 && bw < 560;
    box.classList.toggle("sn-chat-narrow", narrow);
    return narrow;
  };
  new ResizeObserver(() => {
    const narrow = syncNarrow();
    syncTraceFades(canvas);
    const w = Math.min(740, vp.clientWidth - (narrow ? 24 : 40));
    if (Math.abs(w - colW) < 2) { if (pinned) vp.scrollTop = maxTop(); render(); return; } // 输入框变高时，贴着底就继续贴底，最后一条不被挡住
    colW = w; for (const it of items) { it.e = undefined; } relayout(1); if (pinned) vp.scrollTop = maxTop(); render();
  }).observe(vp);

  // ———— 新对话（empty）：一条消息都没有时显示；第一条进来（发出去、收到）就淡出——只动透明度和位移，输入框原地不动 ————
  // 进场：第一次露出来时图标、标题、说明、建议依次淡入、往上走一点（错开 50ms）；露出来之前先藏着，免得先闪一下全貌再播
  const PARTS = () => (emptyEl ? [...emptyEl.children].flatMap((c) => (c.classList.contains("sn-chat-sugs") ? [...c.children] : [c])) : []);
  function enter() {
    emptyEl.classList.remove("sn-enter-wait");
    if (reduced() || emptyGone) return;
    PARTS().forEach((el, i) => el.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 480, delay: i * 50, easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" }));
  }
  function showEmpty() {
    if (!emptyEl) return;
    emptyGone = false; emptyEl.hidden = false; box.classList.add("sn-fresh");
    if (!reduced()) { emptyEl.classList.add("sn-enter-wait"); requestAnimationFrame(() => enter()); }
  }
  function hideEmpty() {
    if (emptyGone) return; emptyGone = true; box.classList.remove("sn-fresh"); emptyEl.classList.remove("sn-enter-wait");
    if (reduced()) { emptyEl.hidden = true; return; }
    for (const a of emptyEl.getAnimations({ subtree: true })) a.finish();
    const a = emptyEl.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-12px)" }], { duration: 220, easing: "cubic-bezier(.42,0,1,1)", fill: "forwards" });
    a.onfinish = () => { emptyEl.hidden = true; a.cancel(); };
  }
  if (emptyEl) {
    if (msgCount > 0) { emptyGone = true; emptyEl.hidden = true; }
    else {
      emptyEl.hidden = false; box.classList.add("sn-fresh");
      if (!reduced()) { emptyEl.classList.add("sn-enter-wait"); new IntersectionObserver((es, io) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); enter(); } }, { threshold: .15 }).observe(emptyEl); }
    }
    // 建议：点了填进输入框（不直接发，用户还能改），字淡入、光标在最后
    emptyEl.addEventListener("click", (e) => { const b = e.target.closest(".sn-chat-sug"); if (b && emptyEl.contains(b)) composer._cm?.fill(b.textContent); });
  }
  // 新对话那一套的输入框：点附件里的图片缩略图看大图（看图从缩略图展开）
  if (composer.classList.contains("sn-cm-new")) composer.addEventListener("click", (e) => {
    const t = e.target.closest(".sn-cm-file.sn-tile"); if (!t || e.target.closest(".sn-x") || t.dataset.kind !== "img" || t.classList.contains("sn-leaving")) return;
    const tiles = [...composer.querySelectorAll('.sn-cm-file.sn-tile[data-kind="img"]:not(.sn-leaving)')];
    openLightbox(tiles.map((x) => ({ bg: hiRes(x.style.getPropertyValue("--sn-g")), ratio: 16 / 10, alt: x.dataset.name })), tiles.indexOf(t), { thumbOf: (i) => tiles[i]?.querySelector(".sn-clip") || tiles[i] });
  });

  // ———— 开始：停在最新一条 ————
  const initNarrow = syncNarrow();
  colW = Math.min(740, vp.clientWidth - (initNarrow ? 24 : 40)); relayout(1); // 内容一栏最宽 740（与输入框左右轴线严格对齐）
  if (foot) {
    const syncFoot = () => { const h = foot.offsetHeight; box.style.setProperty("--sn-foot-h", h + "px"); const nb = h + 14; if (nb === PAD_B) return; PAD_B = nb; relayout(1); if (pinned && !rewinding) vp.scrollTop = maxTop(); render(); };
    new ResizeObserver(syncFoot).observe(foot); syncFoot();
  }
  const toBottom = () => { vp.scrollTop = maxTop(); render(); syncRailActive(); };
  syncRailItems();
  toBottom();
  new IntersectionObserver((es, io) => { if (es.some((x) => x.isIntersecting)) { toBottom(); requestAnimationFrame(toBottom); io.disconnect(); } }).observe(box);
  void $$; void injectIcons; void toast; void renderRichText;
  // 销毁：停掉正在生成的回答、放开实例（同一个容器可以再挂一次）。挂载时加的监听、观察器由 createChat 一起撤
  const destroy = () => { if (job) { job.stop = true; job.rewound = true; } job = null; clearTimeout(rewindTimer); rewindTimer = 0; ghosts.clear(); fx.replaceChildren(); ta.style.opacity = ""; resizeEl?.remove(); delete composer.dataset.cmH; composer.classList.remove("sn-cm-resizing"); delete box.dataset.composerBlur; delete box.dataset.traceMode; delete box.dataset.toolStyle; delete box.dataset.historyMode; delete box.dataset.density; box.style.removeProperty("--sn-chat-foot-blur"); box.style.removeProperty("--sn-chat-foot-tint"); rail?.destroy(); composer?._cm?.stopVoice?.(true); if (box._chat === api) delete box._chat; };
  // 程序里发一条（和用户在输入框里发一样：飞进列表、然后回复）
  const api = { send: (text) => { ta.value = text; ta.dispatchEvent(new Event("input")); composer._cm && composer.dispatchEvent(new CustomEvent("compose", { detail: { text } })); }, receive, sendText, scrollToOldest, scrollToId, loadOlder, getStats, setRail: (s) => rail?.setSide(s), setActions, setTraceMode, setToolStyle, setRenderTool, setHistoryMode, setDensity, setUserMarkdown, setSubmitKey, setComposerBlur, setComposerHeight, destroy,
    fill: (text) => composer._cm?.fill(text), get emptyEl() { return emptyEl; } };
  return (box._chat = api);
}

// createChat(空容器或 .sn-chat, 选项) → { send, receive, sendText, scrollToOldest, update, destroy, on, off }：统一的组件写法。
// 空容器按选项渲染（标题、状态、占位、字数上限……），destroy 时撤掉挂载时加的全部监听、观察器，清空容器；
// update({ status, traceMode, toolStyle, historyMode, density, userMarkdown, submitKey, ... }) 动态更新配置。React / Vue 里在 effect 里创建、卸载时 destroy
export const createChat = /* @__PURE__ */ defineComponent({
  name: "chat",
  html: (o) => `<div class="sn-chat">${chatHTML(o)}</div>`,
  mount(el, o, api) {
    if (!el.querySelector(".sn-chat-vp")) { el.classList.add("sn-chat"); el.innerHTML = chatHTML(o); }
    injectIcons(el);
    const c = mountChat(el, { ...o, onModelChange: (v) => api.emit("modelChange", v), onModeChange: (v) => api.emit("modeChange", v),
      onContextChange: (e) => api.emit("contextChange", { ...e, item: api.options.context?.[e.index] }), onContextClick: (index) => api.emit("contextClick", { index, item: api.options.context?.[index] }),
      onMenu: () => api.emit("menu"), onNewChat: () => api.emit("newChat") });
    const cm = () => el.querySelector(".sn-composer")?._cm;
    return {
      send: c.send, receive: c.receive, sendText: c.sendText, scrollToOldest: c.scrollToOldest, scrollToId: c.scrollToId, loadOlder: c.loadOlder, getStats: c.getStats,
      setRail: c.setRail, setActions: c.setActions, setTraceMode: c.setTraceMode, setToolStyle: c.setToolStyle, setRenderTool: c.setRenderTool, setHistoryMode: c.setHistoryMode, setDensity: c.setDensity, setUserMarkdown: c.setUserMarkdown, setSubmitKey: c.setSubmitKey, setComposerBlur: c.setComposerBlur, setComposerHeight: c.setComposerHeight, fill: c.fill,
      get emptyEl() { return c.emptyEl; },
      update(next, prev) {
        if (next.status !== prev.status) { const s = el.querySelector("[data-chat-status]"); if (s) s.textContent = next.status ?? ""; }
        if (next.actions !== prev.actions) c.setActions(next.actions);
        if (next.traceMode !== prev.traceMode) c.setTraceMode(next.traceMode);
        if (next.toolStyle !== prev.toolStyle) c.setToolStyle(next.toolStyle);
        if (next.renderTool !== prev.renderTool) c.setRenderTool(next.renderTool);
        if (next.historyMode !== prev.historyMode) c.setHistoryMode(next.historyMode);
        if (next.density !== prev.density) c.setDensity(next.density);
        if (next.userMarkdown !== prev.userMarkdown) c.setUserMarkdown(next.userMarkdown);
        if (next.submitKey !== prev.submitKey) c.setSubmitKey(next.submitKey);
        if (next.composerBlur !== prev.composerBlur) c.setComposerBlur(next.composerBlur);
        if (next.composerHeight !== prev.composerHeight) c.setComposerHeight(next.composerHeight);
        // 底部输入框的上下文、模式、模型：只是选中项换了就只改选中（不发事件）；结构变了才换那一块
        syncComposerParts(cm(), next, prev);
      },
      destroy() { c.destroy(); for (const h of el.querySelectorAll(".sn-select")) h._select?.dispose?.(); },
    };
  },
});
