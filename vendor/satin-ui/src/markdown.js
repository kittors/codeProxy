// Satin：Markdown 渲染（不依赖第三方库）。
// 支持：标题（带锚点）、段落、粗体 / 斜体 / 删除线、行内代码、链接、自动链接、列表（有序 / 无序 / 任务 / 嵌套）、引用、提示块（> [!NOTE]）、
// 表格（对齐、表头吸顶、限高滚动）、分隔线、代码块（高亮、行号、复制、换行开关、文件名、超高折叠）、图片（定高 / 定宽 / 比例、占位、失败、图注、点开放大）、
// 公式（TeX 常用写法 → 浏览器原生 MathML：行内 $…$，块级 $$…$$；写法不认识时原样显示源码，不报错）。
// 高度都能定：renderMarkdown(el, md, { codeMax, imgH, tableMax })，或容器上的 CSS 变量 --sn-md-code-max / --sn-md-img-h / --sn-md-table-max；
// 单个块在 Markdown 里写：```js title=app.js maxh=120 wrap nonum   ![说明](url "图注" =x160)   =320x  =320x180  =16:9
// 媒体：图片的写法，地址是视频（mp4 / webm / mov）就是视频播放器，是音频（mp3 / m4a / wav / ogg）就是音频条。
// HTML：白名单里的标签（折叠块、图、视频、音频、表格、kbd、mark……）照样渲染，属性也只放行白名单；script / style / iframe 连内容一起去掉。
// 能动的 HTML：```html preview 的代码块在沙箱 iframe 里运行（脚本、动画都能跑，碰不到外面的页面），可以在"预览 / 代码"之间切换，高度跟着内容走。
// 安全：Markdown 的文字都转义；链接只放行 http(s)、mailto、站内地址，图片、海报另外放行 data:image。
// 半截的 Markdown（流式输出时）也能渲：没闭合的代码块按代码块显示，没闭合的公式按原文显示。
import { playerHTML, audioHTML, mountPlayer, mountAudio } from "./media.js";
import { scrollArea } from "./scroll.js";
import { openLightbox } from "./lightbox.js";
import { scoped } from "./i18n.js";
import { defineComponent, useShared } from "./lifecycle.js";
import I18N_DEFAULTS from "./locales/zh-CN/markdown.js";
const tt = /* @__PURE__ */ scoped(I18N_DEFAULTS);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// 链接、图片地址只放行 http(s)、mailto、相对地址（图片另外放行 data:image/）。
// 先按浏览器解析 URL 的规则归一：去掉首尾的控制字符和空格、去掉中间所有的 Tab 和换行——不然 "java\tscript:"、"\u0001javascript:"
// 在这里看着不像协议，到了浏览器手里就成了 javascript:（2026-11-21 XSS 测试抓到的）。返回归一后的地址，浏览器拿到的和这里判断的是同一个
const safeUrl = (u, img) => { u = String(u || "").replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, "").replace(/[\t\n\r]/g, ""); if (!/^[a-z][a-z0-9+.-]*:/i.test(u) || /^(https?:|mailto:)/i.test(u) || (img && /^data:image\//i.test(u))) return u; return "#"; };
const CJK = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]/;
// ———————————————— 原始 HTML：白名单里的标签和属性照样渲染，别的去掉 ————————————————
const HTML_TAGS = new Set("a abbr b bdi bdo blockquote br caption center cite code col colgroup dd del details dfn div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i img ins kbd li mark ol p picture pre q rp rt ruby s samp small source span strong sub summary sup table tbody td tfoot th thead time tr track u ul var video audio wbr".split(" "));
const HTML_BLOCK = new Set("blockquote center details div dl figure h1 h2 h3 h4 h5 h6 hr ol p picture pre table ul video audio img".split(" "));
// 一行以这些开头：整段按 HTML 渲染
const HTML_DROP = new Set("script style iframe object embed template noscript textarea select form svg math link meta base frame frameset applet button input".split(" "));
// 连里面的内容一起去掉
const HTML_ATTRS = new Set("align alt autoplay cite class colspan controls datetime decoding default dir height href kind label lang loading loop muted name open playsinline poster preload reversed rowspan span src srclang srcset start style title type width".split(" "));
const TAG_RE = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
const unent = (v) => v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
function htmlAttrs(tag, raw) {
  const out = []; let ext = false;
  raw.replace(/([^\s"'>\/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g, (_, n, v) => {
    n = n.toLowerCase(); if (!HTML_ATTRS.has(n)) return "";
    if (v == null) { out.push(n); return ""; }
    let val = unent(v.replace(/^(["'])([\s\S]*)\1$/, "$2"));
    if (n === "href") { val = safeUrl(val); ext = /^https?:/i.test(val); }
    else if (n === "src" || n === "poster") val = safeUrl(val, true);
    else if (n === "srcset") val = val.split(",").map((p) => { const [u, d] = p.trim().split(/\s+/); return safeUrl(u, true) + (d ? " " + d : ""); }).join(", ");
    else if (n === "style") val = val.replace(/(?:^|;)\s*(?:position|behavior|-moz-binding)\s*:[^;]*/gi, "").replace(/(?:url|expression|image-set)\s*\(/gi, "(");
    out.push(`${n}="${esc(val)}"`); return "";
  });
  if (tag === "a" && ext) out.push('target="_blank"', 'rel="noopener noreferrer"');
  if (tag === "video" && !out.includes("playsinline")) out.push("playsinline");
  if (tag === "img" && !out.some((a) => a.startsWith("loading="))) out.push('loading="lazy"', 'decoding="async"');
  return out.length ? " " + out.join(" ") : "";
}
function rawHTML(s) {
  let out = "", last = 0, drop = null, m; TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(s))) {
    if (!drop) out += s.slice(last, m.index).replace(/</g, "&lt;");
    last = TAG_RE.lastIndex;
    if (m[0].startsWith("<!--")) continue;
    const close = m[1] === "/", tag = m[2].toLowerCase();
    if (drop) { if (close && tag === drop) drop = null; continue; }
    if (HTML_DROP.has(tag)) { if (!close && !m[4]) drop = tag; continue; }
    if (HTML_TAGS.has(tag)) out += close ? `</${tag}>` : `<${tag}${htmlAttrs(tag, m[3])}>`;
  }
  if (!drop) out += s.slice(last).replace(/</g, "&lt;");
  return out;
}
// ———————————————— 行内 ————————————————
const R = (s) => new RegExp(s, "y");
const RE = {
  esc: R("\\\\([\\\\`*_{}\\[\\]()#+\\-.!|~$>])"), code: R("(`+)([\\s\\S]*?[^`])\\1(?!`)"), math: R("\\$([^\\s$](?:[^$\\n]*?[^\\s$\\\\])?)\\$(?![\\d$])"),
  img: R("!\\[([^\\]]*)\\]\\(\\s*((?:[^\\s()]|\\([^\\s()]*\\))+?)(?:\\s+\"([^\"]*)\")?(?:\\s+=(\\d*x\\d*|\\d+:\\d+))?\\s*\\)"), link: R("\\[((?:\\\\.|[^\\]\\\\])+)\\]\\(\\s*((?:[^\\s()]|\\([^\\s()]*\\))+?)(?:\\s+\"([^\"]*)\")?\\s*\\)"), // 地址里允许成对的括号
  tag: R("<\\/?([a-zA-Z][\\w-]*)(?:\\s+[^\\s\"'>\\/=]+(?:\\s*=\\s*(?:\"[^\"]*\"|'[^']*'|[^\\s\"'=<>`]+))?)*\\s*\\/?>"),
  auto: R("<(https?:\\/\\/[^>\\s]+)>"), url: R("https?:\\/\\/[^\\s<>\"'`，。；：！？（）、]+[^\\s<>\"'`，。；：！？（）、.,;:!?)]"),
  strong: R("(\\*\\*|__)(?=\\S)([\\s\\S]*?\\S)\\1"), em: R("(\\*|_)(?=\\S)([\\s\\S]*?\\S)\\1(?!\\1)"), del: R("~~(?=\\S)([\\s\\S]*?\\S)~~"),
};
const hit = (re, s, i) => { re.lastIndex = i; return re.exec(s); };
function inline(s, ctx) {
  let out = "", i = 0; const n = s.length;
  while (i < n) {
    const c = s[i], prev = s[i - 1] || ""; let m;
    if (c === "\\" && (m = hit(RE.esc, s, i))) { out += esc(m[1]); i += m[0].length; continue; }
    if (c === "\\" && s[i + 1] === "\n") { out += "<br>"; i += 2; continue; }
    if (c === "`" && (m = hit(RE.code, s, i))) { out += `<code class="sn-md-ic">${esc(m[2].replace(/^ ([\s\S]*) $/, "$1"))}</code>`; i += m[0].length; continue; }
    if (c === "$" && s[i + 1] !== "$" && (m = hit(RE.math, s, i))) { out += tex(m[1], false); i += m[0].length; continue; }
    if (c === "!" && s[i + 1] === "[" && (m = hit(RE.img, s, i))) { out += image(m[1], m[2], m[3], m[4], false, ctx); i += m[0].length; continue; }
    if (c === "[" && (m = hit(RE.link, s, i))) { out += link(m[2], inline(m[1], ctx), m[3]); i += m[0].length; continue; }
    if (c === "<" && (m = hit(RE.auto, s, i))) { out += link(m[1], esc(m[1])); i += m[0].length; continue; }
    if (c === "<" && (m = hit(RE.tag, s, i)) && (HTML_TAGS.has(m[1].toLowerCase()) || HTML_DROP.has(m[1].toLowerCase()))) { out += rawHTML(m[0]); i += m[0].length; continue; } // 行内 HTML：<kbd>、<mark>、<sub>……
    if (c === "h" && !/[\w/]/.test(prev) && (m = hit(RE.url, s, i))) { out += link(m[0], esc(m[0])); i += m[0].length; continue; }
    // 强调：下划线不认词中间的（snake_case 不算斜体）
    if ((c === "*" || (c === "_" && !/[\p{L}\p{N}]/u.test(prev))) && (m = hit(RE.strong, s, i))) { out += `<strong>${inline(m[2], ctx)}</strong>`; i += m[0].length; continue; }
    if ((c === "*" || (c === "_" && !/[\p{L}\p{N}]/u.test(prev))) && (m = hit(RE.em, s, i)) && (c === "*" || !/[\p{L}\p{N}]/u.test(s[i + m[0].length] || ""))) { out += `<em>${inline(m[2], ctx)}</em>`; i += m[0].length; continue; }
    if (c === "~" && s[i + 1] === "~" && (m = hit(RE.del, s, i))) { out += `<del>${inline(m[1], ctx)}</del>`; i += m[0].length; continue; }
    // 换行：行尾两个空格是硬换行；普通换行在中文之间直接接上，其余变成一个空格
    if (c === "\n") { if (/ {2,}$/.test(s.slice(Math.max(0, i - 4), i))) { out = out.replace(/ +$/, ""); out += "<br>"; } else if (!(CJK.test(prev) && CJK.test(s[i + 1] || ""))) out += " "; i++; continue; }
    out += esc(c); i++;
  }
  return out;
}
const link = (href, inner, title) => { const u = safeUrl(href), ext = /^https?:/i.test(u); return `<a href="${esc(u)}"${title ? ` title="${esc(title)}"` : ""}${ext ? ' target="_blank" rel="noopener noreferrer"' : ""}>${inner}</a>`; };
// 图片：=x160 定高、=320x 定宽、=320x180 都定、=16:9 定比例；块级图片默认用 --sn-md-img-h 的高度，图片在框里完整显示（contain）
const VIDEO = /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i, AUDIO = /\.(mp3|m4a|aac|wav|ogg|oga|flac)(?:[?#]|$)/i;
// 视频、音频直接用组件库的播放器和音频条（和展示页"视频与音频"同一个组件）
function media(alt, src, title, st, ctx) {
  const u = safeUrl(src);
  if (VIDEO.test(src)) return `<figure class="sn-md-fig sn-md-media">${playerHTML({ src: u, label: alt || title || tt("markdown.30") })}${title || alt ? `<figcaption>${inline(title || alt, ctx)}</figcaption>` : ""}</figure>`;
  return `<figure class="sn-md-fig sn-md-media">${audioHTML({ src: u, title: alt || tt("markdown.31"), sub: title && title !== alt ? title : "" })}</figure>`;
}
function image(alt, src, title, size, block, ctx) {
  let st = "";
  if (size) { if (size.includes(":")) st = `aspect-ratio:${size.replace(":", "/")};height:auto;`; else { const [w, h] = size.split("x"); if (h) st += `height:${+h}px;`; if (w) st += `width:${+w}px;`; } }
  if (block && (VIDEO.test(src) || AUDIO.test(src))) return media(alt, src, title, st, ctx);
  const box = `<span class="sn-md-img${block ? " sn-blk" : ""}${size ? " sn-sized" : ""}" style="${st}"><img src="${esc(safeUrl(src, true))}" alt="${esc(alt)}" loading="lazy" decoding="async"${block ? ` tabindex="0" role="button" aria-label="${esc(tt("markdown.36", { p0: alt || title || tt("markdown.32") }))}"` : ""}><span class="sn-md-img-bad" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M21 15V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21M17 17l4 4m0-4-4 4"/></svg>${esc(alt || tt("markdown.33"))}</span></span>`;
  return block ? `<figure class="sn-md-fig">${box}${title || alt ? `<figcaption>${inline(title || alt, ctx)}</figcaption>` : ""}</figure>` : box;
}
// ———————————————— 块 ————————————————
const LIST = /^(\s*)([-*+]|\d{1,9}[.)])(\s+|$)(.*)$/;
const FENCE = /^(\s{0,3})(`{3,}|~{3,})\s*(.*)$/;
const indentOf = (l) => l.match(/^\s*/)[0].replace(/\t/g, "    ").length;
const isTableSep = (l) => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(l) && l.includes("|");
// 一个短横也算（:-: 居中）
function startsBlock(l, next) {
  return FENCE.test(l) || /^\s*\$\$/.test(l) || /^\s{0,3}#{1,6}\s/.test(l) || /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l) || /^\s{0,3}>/.test(l) || LIST.test(l) || (l.includes("|") && next != null && isTableSep(next));
}
const cells = (l) => { const t = l.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, ""); return t.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|")); };
const CALLOUT = { NOTE: ["markdown.0", "info"], TIP: ["markdown.1", "lightbulb"], IMPORTANT: ["markdown.2", "flag"], WARNING: ["markdown.3", "triangle-alert"], CAUTION: ["markdown.4", "octagon-alert"] }; // 名字用的时候再 t()
const CALLOUT_ICON = {
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>', lightbulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>',
  flag: '<path d="M4 22V4a1 1 0 0 1 1-1h12l-2 4 2 4H5"/>', "triangle-alert": '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3zM12 9v4M12 17h.01"/>',
  "octagon-alert": '<path d="M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9zM12 8v4M12 16h.01"/>',
};
function slug(text, ctx) { let s = text.replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/gi, "").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "section"; const k = ctx.ids.get(s) || 0; ctx.ids.set(s, k + 1); return k ? `${s}-${k}` : s; }
function blocks(lines, ctx) {
  const out = []; let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    // 代码块（没闭合的也按代码块显示，流式输出时不会闪成一大段正文）
    if ((m = FENCE.exec(l))) {
      const fence = m[2], ind = m[1].length, close = new RegExp(`^\\s{0,3}${fence[0] === "`" ? "`" : "~"}{${fence.length},}\\s*$`), body = []; i++;
      while (i < lines.length && !close.test(lines[i])) { body.push(lines[i].replace(new RegExp(`^ {0,${ind}}`), "")); i++; }
      const closed = i < lines.length; if (closed) i++;
      out.push(codeBlock(body.join("\n"), m[3].trim(), ctx, closed)); continue;
    }
    // 块级公式：$$ 单独一行开头，到下一个 $$ 结束；也可以一行写完 $$…$$
    if (/^\s*\$\$/.test(l)) {
      let src = l.trim().slice(2), closed = false;
      if (/\$\$\s*$/.test(src)) { src = src.replace(/\$\$\s*$/, ""); closed = true; i++; }
      else { i++; const body = [src]; while (i < lines.length) { if (/\$\$\s*$/.test(lines[i])) { body.push(lines[i].replace(/\$\$\s*$/, "")); closed = true; i++; break; } body.push(lines[i]); i++; } src = body.join("\n"); }
      out.push(`<div class="sn-md-math">${closed ? tex(src.trim(), true) : `<code class="sn-md-math-err">$$${esc(src)}</code>`}</div>`); continue;
    }
    // HTML 块：一行以块级标签（或注释）开头，到空行为止整段按 HTML 渲染；中间空一行再写的 Markdown 照常渲染（<details> 里放正文就这么写）
    if ((m = /^\s{0,3}<\/?([a-zA-Z][\w-]*)(?=[\s/>]|$)/.exec(l)) && (HTML_BLOCK.has(m[1].toLowerCase()) || HTML_TAGS.has(m[1].toLowerCase()) && /^\s{0,3}<\/?[a-zA-Z][\w-]*[^>]*>\s*$/.test(l) && !/^\s{0,3}<(kbd|mark|sub|sup|b|i|em|strong|code|span|a|abbr|small|s|u|del|ins|q|cite|var|samp|time)\b/i.test(l) || HTML_DROP.has(m[1].toLowerCase())) || /^\s{0,3}<!--/.test(l)) {
      const body = []; while (i < lines.length && lines[i].trim()) { body.push(lines[i]); i++; }
      out.push(rawHTML(body.join("\n"))); continue;
    }
    if ((m = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l))) { const n = m[1].length, h = inline(m[2], ctx), id = slug(h, ctx); out.push(`<h${n} id="${esc(id)}">${h}<a class="sn-md-anchor" href="#${esc(id)}" aria-label="${tt("markdown.5")}">#</a></h${n}>`); i++; continue; }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
    // 表格：表头 + 分隔行（:-- 左对齐、:-: 居中、--: 右对齐）
    if (l.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(l), al = cells(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? "center" : /-+:$/.test(c) ? "right" : "")); i += 2;
      const rows = []; while (i < lines.length && lines[i].trim() && lines[i].includes("|")) { rows.push(cells(lines[i])); i++; }
      const td = (t, c, k) => `<${t}${al[k] ? ` style="text-align:${al[k]}"` : ""}>${inline(c ?? "", ctx)}</${t}>`;
      out.push(`<div class="sn-md-table"><table><thead><tr>${head.map((c, k) => td("th", c, k)).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, k) => td("td", r[k], k)).join("")}</tr>`).join("")}</tbody></table></div>`); continue;
    }
    // 引用；第一行是 [!NOTE] 这类就是提示块
    if (/^\s{0,3}>/.test(l)) {
      const body = []; while (i < lines.length && (/^\s{0,3}>/.test(lines[i]) || (lines[i].trim() && !startsBlock(lines[i], lines[i + 1]) && body.length && body.at(-1).trim()))) { body.push(lines[i].replace(/^\s{0,3}>\s?/, "")); i++; }
      const c = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i.exec(body[0] || "");
      if (c) { const [nameKey, icon] = CALLOUT[c[1].toUpperCase()], name = tt(nameKey); out.push(`<div class="sn-md-callout sn-${c[1].toLowerCase()}" role="note"><p class="sn-md-callout-t"><svg viewBox="0 0 24 24" aria-hidden="true">${CALLOUT_ICON[icon]}</svg>${c[2] ? inline(c[2], ctx) : name}</p>${blocks(body.slice(1), ctx)}</div>`); }
      else out.push(`<blockquote>${blocks(body, ctx)}</blockquote>`);
      continue;
    }
    if ((m = LIST.exec(l))) { i = list(lines, i, ctx, out); continue; }
    // 段落：到空行或者别的块开始为止；整段只有一张图就当成带图注的图
    const para = [l]; i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1])) { para.push(lines[i]); i++; }
    const text = para.join("\n").trim(), only = hit(RE.img, text, 0);
    if (only && only[0].length === text.length) out.push(image(only[1], only[2], only[3], only[4], true, ctx));
    else out.push(`<p>${inline(text, ctx)}</p>`);
  }
  return out.join("");
}
const sameList = (l, ind, ordered) => { const m = LIST.exec(l); return !!m && indentOf(l) === ind && /\d/.test(m[2]) === ordered; };
// 空一行后接的是同一种列表才算"松散"，换成有序 / 无序就是另一个列表
function list(lines, i, ctx, out) {
  const first = LIST.exec(lines[i]), ind = indentOf(lines[i]), ordered = /\d/.test(first[2]), items = []; let loose = false;
  while (i < lines.length) {
    const m = LIST.exec(lines[i]); if (!m || indentOf(lines[i]) !== ind || /\d/.test(m[2]) !== ordered) break;
    const body = [m[4]], cont = ind + m[2].length + (m[3].length || 1); i++;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) { let j = i + 1; while (j < lines.length && !lines[j].trim()) j++; if (j < lines.length && indentOf(lines[j]) > ind) { body.push(""); loose = loose || !LIST.test(lines[j]); i++; continue; } if (j < lines.length && sameList(lines[j], ind, ordered)) loose = true; break; }
      if (indentOf(l) > ind) { body.push(l.replace(new RegExp(`^ {0,${cont}}`), "")); i++; continue; }
      if (!startsBlock(l, lines[i + 1]) && body.at(-1).trim()) { body.push(l); i++; continue; } // 懒续行
      break;
    }
    items.push(body);
    if (i < lines.length && !lines[i].trim()) { let j = i; while (j < lines.length && !lines[j].trim()) j++; if (j < lines.length && sameList(lines[j], ind, ordered)) { loose = true; i = j; } }
  }
  const lis = items.map((b) => {
    const t = /^\[([ xX])\]\s+/.exec(b[0]); if (t) b[0] = b[0].slice(t[0].length);
    let html = blocks(b, ctx); if (!loose) html = html.replace(/^<p>([\s\S]*?)<\/p>/, "$1");
    return t ? `<li class="sn-md-task"><span class="sn-md-check${t[1] !== " " ? " sn-on" : ""}" role="img" aria-label="${t[1] !== " " ? tt("markdown.34") : tt("markdown.35")}"></span><div>${html}</div></li>` : `<li>${html}</li>`;
  }).join("");
  const n = ordered ? parseInt(first[2], 10) : 1;
  out.push(ordered ? `<ol${n !== 1 ? ` start="${n}"` : ""}>${lis}</ol>` : `<ul${items.some((b) => /^\[[ xX]\]\s/.test(b[0])) ? ' class="sn-md-tasks"' : ""}>${lis}</ul>`);
  return i;
}
// ———————————————— 代码块：高亮 + 行号 + 复制 + 换行 + 折叠 ————————————————
const LANG = { js: "JavaScript", javascript: "JavaScript", jsx: "JSX", ts: "TypeScript", typescript: "TypeScript", tsx: "TSX", py: "Python", python: "Python", go: "Go", golang: "Go", json: "JSON", jsonc: "JSON", css: "CSS", scss: "SCSS", html: "HTML", xml: "XML", vue: "Vue", svelte: "Svelte", svg: "SVG", sh: "Shell", bash: "Bash", zsh: "Zsh", shell: "Shell", get console() { return tt("markdown.6"); }, sql: "SQL", get text() { return tt("markdown.7"); }, get txt() { return tt("markdown.7"); }, md: "Markdown", markdown: "Markdown" };
const FAMILY = { javascript: "js", jsx: "js", ts: "js", typescript: "js", tsx: "js", python: "py", golang: "go", jsonc: "json", scss: "css", less: "css", xml: "html", vue: "html", svelte: "html", svg: "html", bash: "sh", zsh: "sh", shell: "sh", console: "sh" };
const words = (s) => new Set(s.split(" "));
const KW = {
  js: words("break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await as interface type enum implements private public protected readonly declare namespace abstract keyof infer satisfies get set"),
  py: words("and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case self"),
  go: words("break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var"),
  sh: words("if then else elif fi for while until do done case esac function in return export local readonly set unset echo cd source alias exit sudo"),
  sql: words("select from where insert into values update set delete create table index view drop alter add join left right inner outer full on group by order having limit offset as and or not is in like between distinct union all case when then else end primary key foreign references default unique asc desc count sum avg min max"),
};
const LIT = { js: words("true false null undefined NaN Infinity"), py: words("True False None"), go: words("true false nil iota"), sh: words(""), sql: words("null true false") };
const TYPES = { go: words("string int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 float32 float64 bool byte rune error any"), js: words("string number boolean bigint symbol object unknown never void any Promise Array Record Map Set") };
// i 前面到行首（或开头）都是空白：往回走，不切整段字符串
const lineStart = (code, i) => { let k = i - 1; while (k >= 0 && code[k] !== "\n" && /\s/.test(code[k])) k--; return k < 0 || code[k] === "\n"; };
function lex(code, lang) {
  const f = FAMILY[lang] || lang, toks = []; let i = 0; const n = code.length;
  const push = (t, s) => toks.push([t, s]);
  const rules = {
    js: [["com", /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y], ["str", /`(?:\\[\s\S]|[^`\\])*`?|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?/y], ["num", /\b(?:0[xob][\da-f_]+|\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?n?)\b/iy]],
    py: [["com", /#[^\n]*/y], ["str", /[rbfu]{0,2}(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)/iy], ["num", /\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?j?\b/iy], ["dec", /@[\w.]+/y]],
    go: [["com", /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y], ["str", /`[^`]*`?|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?/y], ["num", /\b(?:0[xob][\da-f_]+|\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?)\b/iy]],
    sh: [["com", /(?<![\w$])#[^\n]*/y], ["str", /"(?:\\.|[^"\\])*"?|'[^']*'?/y], ["var", /\$\{[^}]*\}?|\$[\w@#?*!-]+/y], ["attr", /(?<=\s)--?[\w-]+/y], ["num", /\b\d+\b/y]],
    sql: [["com", /--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y], ["str", /'(?:''|[^'])*'?/y], ["num", /\b\d+(?:\.\d+)?\b/y]],
    json: [["prop", /"(?:\\.|[^"\\\n])*"(?=\s*:)/y], ["str", /"(?:\\.|[^"\\\n])*"?/y], ["num", /-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/iy], ["lit", /\b(?:true|false|null)\b/y], ["com", /\/\/[^\n]*/y]],
    css: [["com", /\/\*[\s\S]*?(?:\*\/|$)/y], ["str", /"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?/y], ["kw", /@[\w-]+/y], ["prop", /[\w-]+(?=\s*:(?!:))/y], ["num", /#[\da-f]{3,8}\b|-?\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms|deg|fr)?\b/iy], ["fn", /[\w-]+(?=\()/y], ["sel", /[.#][\w-]+|::?[\w-]+/y]],
    html: [["com", /<!--[\s\S]*?(?:-->|$)/y], ["tag", /<\/?[a-zA-Z][\w:-]*|\/?>/y], ["attr", /(?<=\s)[\w:@.-]+(?==)/y], ["str", /"[^"]*"?|'[^']*'?/y]],
    md: [["com", /(?<=^|\n)```[^\n]*/y], ["kw", /(?<=^|\n)#{1,6} [^\n]*/y], ["com", /(?<=^|\n)> ?(?:\[![A-Z]+\])?/y], ["pun", /(?<=^|\n)[ \t]*(?:[-*+]|\d+\.)[ \t](?:\[[ xX]\][ \t])?/y],
      ["str", /`[^`\n]+`/y], ["prop", /\*\*[^*\n]+\*\*|__[^_\n]+__/y], ["attr", /!?\[[^\]\n]*\]\([^)\n]*\)/y], ["tag", /<\/?[a-zA-Z][\w-]*(?:\s[^>\n]*)?>/y], ["pun", /\||(?<=^|\n)-{3,}(?=\n|$)/y]],
  }[f];
  if (!rules) { push("", code); return toks; }
  while (i < n) {
    let done = false;
    for (const [t, re] of rules) { re.lastIndex = i; const m = re.exec(code); if (m && m[0]) { push(t, m[0]); i += m[0].length; done = true; break; } }
    if (done) continue;
    const c = code[i];
    if (/[A-Za-z_$\u00c0-\uffff]/.test(c) && f !== "html" && f !== "json") {
      // 前后第一个不是空白的字：往两边走着找（原来每个词都切一次整段代码再匹配，几百 KB 的代码要好几秒）
      const m = /[\w$\u00c0-\uffff]+/y; m.lastIndex = i; const w = m.exec(code)[0];
      let a = i + w.length; while (a < n && /\s/.test(code[a])) a++;
      let b = i - 1; while (b >= 0 && /\s/.test(code[b])) b--;
      const after = a < n ? code[a] : undefined, before = b >= 0 ? code[b] : undefined;
      const lw = f === "sql" ? w.toLowerCase() : w;
      const t = KW[f]?.has(lw) ? "kw" : LIT[f]?.has(lw) ? "lit" : TYPES[f]?.has(w) ? "typ" : before === "." ? "prop" : after === "(" ? "fn" : (f === "js" || f === "go") && /^[A-Z]/.test(w) ? "typ" : f === "sh" && (lineStart(code, i) || before === "|") ? "fn" : "";
      push(t, w); i += w.length; continue;
    }
    if (/[+\-*/%=<>!&|^~?:]/.test(c)) { const m = /[+\-*/%=<>!&|^~?:]+/y; m.lastIndex = i; const o = m.exec(code)[0]; push("op", o); i += o.length; continue; }
    if (/[{}()[\];,.]/.test(c)) { push("pun", c); i++; continue; }
    push("", c); i++;
  }
  return toks;
}
// 高亮后按行切：跨行的记号（块注释、模板字符串）每一行各包一层，行号和换行模式都按行来
export function highlightLines(code, lang) {
  const lines = [""]; for (const [t, s] of lex(code, (lang || "").toLowerCase())) { const parts = s.split("\n"); parts.forEach((p, k) => { if (k) lines.push(""); if (p) lines[lines.length - 1] += t ? `<span class="sn-t-${t}">${esc(p)}</span>` : esc(p); }); }
  return lines;
}
let liveSeq = 0;
// 沙箱里的文档：带上当前主题的几个颜色变量（换主题时外面会发新的进来），内容高度变了告诉外面
const liveDoc = (code, id, vars) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>:root{${vars}}html,body{margin:0;background:transparent;color:var(--sn-label);font:14px/22px -apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",sans-serif;-webkit-font-smoothing:antialiased}body{padding:20px}*{box-sizing:border-box}button{white-space:nowrap;flex:none}img,video{max-width:100%}</style>`
  + `<script>addEventListener("message",function(e){var v=e.data&&e.data.mdTheme;if(v)for(var k in v)document.documentElement.style.setProperty(k,v[k]);if(e.data&&e.data.mdAsk&&send)send()});var send=function(){parent.postMessage({mdLive:"${id}",h:Math.ceil(document.documentElement.getBoundingClientRect().height)},"*")};addEventListener("load",function(){new ResizeObserver(send).observe(document.documentElement);send()})<\/script></head><body>${code}</body></html>`;
const LIVE_VARS = ["--sn-label", "--sn-label2", "--sn-label3", "--sn-raised", "--sn-canvas", "--sn-line", "--sn-line-control", "--sn-fill-subtle", "--sn-fill-active", "--sn-accent", "--sn-on-primary", "--sn-success", "--sn-warning", "--sn-danger"];
const themeVars = () => { const cs = getComputedStyle(document.documentElement); return Object.fromEntries(LIVE_VARS.map((k) => [k, cs.getPropertyValue(k).trim()])); };
function liveBlock(code, ctx, closed) {
  const id = "mdlive" + ++liveSeq, vars = Object.entries(themeVars()).map(([k, v]) => `${k}:${v}`).join(";");
  return `<div class="sn-md-live" data-live="${id}"><div class="sn-md-live-hd"><div class="sn-md-live-tabs" role="tablist" aria-label="${tt("markdown.8")}"><span class="sn-md-live-thumb"></span><button type="button" role="tab" aria-selected="true" data-md="live-view">${tt("markdown.9")}</button><button type="button" role="tab" aria-selected="false" data-md="live-code">${tt("markdown.10")}</button></div><button type="button" class="sn-md-code-btn" data-md="live-replay">${tt("markdown.11")}</button></div>`
    + `<div class="sn-md-live-view"><iframe class="sn-md-live-frame" sandbox="allow-scripts" title="${tt("markdown.8")}" srcdoc="${esc(liveDoc(code, id, vars))}"></iframe></div><div class="sn-md-live-code" hidden>${codeBlock(code, "html nonum", ctx, closed)}</div></div>`;
}
function codeBlock(code, info, ctx, closed) {
  const [lang0 = "", ...rest] = info.split(/\s+/), attrs = {}; for (const r of rest) { const k = r.indexOf("="); if (k > 0) attrs[r.slice(0, k)] = r.slice(k + 1); else if (r) attrs[r] = true; }
  if (/^html$/i.test(lang0) && (attrs.preview || attrs.live)) return liveBlock(code, ctx, closed);
  const lang = lang0.toLowerCase(), label = LANG[lang] || lang0 || tt("markdown.7"), lines = highlightLines(code, lang), maxh = attrs.maxh ?? attrs.h;
  const k = ctx.codes.push(code) - 1, digits = String(lines.length).length;
  const title = attrs.title ? `<span class="sn-md-code-file">${esc(attrs.title)}</span><span class="sn-md-code-lang">${esc(label)}</span>` : `<span class="sn-md-code-file">${esc(label)}</span>`;
  return `<div class="sn-md-code${attrs.wrap ? " sn-wrap" : ""}${attrs.nonum ? " sn-nonum" : ""}${closed ? "" : " open-end"}" data-k="${k}" style="--sn-md-gw:${digits}ch${maxh ? `;--sn-md-code-max:${+maxh}px` : ""}">`
    + `<div class="sn-md-code-hd">${title}<span class="sn-md-code-n">${lines.length}${tt("markdown.12")}</span><button type="button" class="sn-md-code-btn" data-md="wrap" aria-pressed="${attrs.wrap ? "true" : "false"}">${tt("markdown.13")}</button><button type="button" class="sn-md-code-btn" data-md="copy">${tt("markdown.14")}</button></div>`
    + `<div class="sn-md-code-bd"><pre tabindex="0"><code>${lines.map((l) => `<span class="sn-l">${l || " "}</span>`).join("")}</code></pre></div>`
    + `<button type="button" class="sn-md-code-more" data-md="more" hidden><span>${tt("markdown.15", { p0: lines.length })}</span></button></div>`;
}
// ———————————————— 公式：TeX 常用写法 → MathML ————————————————
const GREEK = { alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ϵ", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", varpi: "ϖ", rho: "ρ", varrho: "ϱ", sigma: "σ", varsigma: "ς", tau: "τ", upsilon: "υ", phi: "ϕ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω", ell: "ℓ", hbar: "ℏ", aleph: "ℵ", infty: "∞", partial: "∂", nabla: "∇", emptyset: "∅", varnothing: "∅", Re: "ℜ", Im: "ℑ", wp: "℘" };
const MO = { cdot: "⋅", times: "×", div: "÷", pm: "±", mp: "∓", ast: "∗", star: "⋆", circ: "∘", bullet: "∙", le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", ll: "≪", gg: "≫", approx: "≈", equiv: "≡", sim: "∼", simeq: "≃", cong: "≅", propto: "∝", in: "∈", notin: "∉", ni: "∋", subset: "⊂", supset: "⊃", subseteq: "⊆", supseteq: "⊇", cup: "∪", cap: "∩", setminus: "∖", forall: "∀", exists: "∃", neg: "¬", lnot: "¬", land: "∧", lor: "∨", wedge: "∧", vee: "∨", oplus: "⊕", otimes: "⊗", to: "→", rightarrow: "→", leftarrow: "←", gets: "←", leftrightarrow: "↔", Rightarrow: "⇒", Leftarrow: "⇐", Leftrightarrow: "⇔", implies: "⟹", iff: "⟺", mapsto: "↦", uparrow: "↑", downarrow: "↓", ldots: "…", cdots: "⋯", vdots: "⋮", ddots: "⋱", dots: "…", prime: "′", angle: "∠", perp: "⊥", parallel: "∥", mid: "∣", deg: "°", triangle: "△", square: "□", dagger: "†", langle: "⟨", rangle: "⟩", lfloor: "⌊", rfloor: "⌋", lceil: "⌈", rceil: "⌉", vert: "|", Vert: "‖", lbrace: "{", rbrace: "}", colon: ":", lt: "<", gt: ">" };
const BIG = { sum: "∑", prod: "∏", coprod: "∐", int: "∫", iint: "∬", iiint: "∭", oint: "∮", bigcup: "⋃", bigcap: "⋂", bigoplus: "⨁", bigotimes: "⨂", bigvee: "⋁", bigwedge: "⋀" };
const FN = words("sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh log ln lg exp max min sup inf lim limsup liminf det dim ker arg gcd Pr mod");
const LIMFN = words("lim limsup liminf max min sup inf det gcd Pr");
const ACC = { hat: "^", widehat: "^", bar: "‾", overline: "‾", vec: "→", overrightarrow: "→", dot: "˙", ddot: "¨", tilde: "~", widetilde: "~", check: "ˇ", breve: "˘", acute: "´", grave: "`" };
const SPACE = { ",": "0.1667em", ":": "0.2222em", ">": "0.2222em", ";": "0.2778em", "!": "-0.1667em", quad: "1em", qquad: "2em", " ": "0.25em", enspace: "0.5em" };
const BB = { C: "ℂ", H: "ℍ", N: "ℕ", P: "ℙ", Q: "ℚ", R: "ℝ", Z: "ℤ" }, CAL = { B: "ℬ", E: "ℰ", F: "ℱ", H: "ℋ", I: "ℐ", L: "ℒ", M: "ℳ", R: "ℛ" };
const alpha = (ch, base, special) => special[ch] || (/[A-Z]/.test(ch) ? String.fromCodePoint(base + ch.charCodeAt(0) - 65) : ch);
const ENVS = { matrix: ["", ""], pmatrix: ["(", ")"], bmatrix: ["[", "]"], Bmatrix: ["{", "}"], vmatrix: ["|", "|"], Vmatrix: ["‖", "‖"], cases: ["{", ""], aligned: ["", ""], align: ["", ""], gathered: ["", ""], array: ["", ""], smallmatrix: ["", ""] };
function tex(src, display) {
  try { const p = { s: src, i: 0, display }; const body = seq(p, () => false); if (p.i < p.s.length) throw new Error(tt("markdown.16") + p.s[p.i]); return `<math${display ? ' display="block"' : ""}><mrow>${body}</mrow></math>`; }
  catch { return `<code class="sn-md-math-err" title="${tt("markdown.17")}">${esc(display ? src : "$" + src + "$")}</code>`; }
}
const ws = (p) => { while (p.i < p.s.length && /\s/.test(p.s[p.i])) p.i++; };
function cmdName(p) { const m = /^\\([A-Za-z]+|.)/.exec(p.s.slice(p.i)); if (!m) throw new Error(tt("markdown.18")); p.i += m[0].length; return m[1]; }
function group(p) { ws(p); if (p.s[p.i] !== "{") throw new Error(tt("markdown.19")); p.i++; const body = seq(p, (q) => q.s[q.i] === "}"); if (p.s[p.i] !== "}") throw new Error(tt("markdown.20")); p.i++; return body; }
function rawGroup(p) { ws(p); if (p.s[p.i] !== "{") throw new Error(tt("markdown.19")); let d = 0, j = p.i; for (; j < p.s.length; j++) { if (p.s[j] === "{") d++; else if (p.s[j] === "}" && --d === 0) break; } if (j >= p.s.length) throw new Error(tt("markdown.20")); const t = p.s.slice(p.i + 1, j); p.i = j + 1; return t; }
// 一个参数：{…}、一个命令、或者一个字符
function arg(p) { ws(p); const c = p.s[p.i]; if (c === "{") return `<mrow>${group(p)}</mrow>`; if (c === "\\") return atom(p); if (c == null) throw new Error(tt("markdown.21")); p.i++; return /\d/.test(c) ? `<mn>${c}</mn>` : /[A-Za-z]/.test(c) ? `<mi>${c}</mi>` : `<mo>${esc(c)}</mo>`; }
function seq(p, end) {
  let out = "";
  for (;;) {
    ws(p); if (p.i >= p.s.length || end(p) || p.s[p.i] === "}" || p.s[p.i] === "&" || p.s.startsWith("\\\\", p.i) || p.s.startsWith("\\right", p.i) || p.s.startsWith("\\end", p.i)) break;
    let a = atom(p); const big = a.startsWith("<mo largeop") || a.startsWith("<mi lim>"), fn = a.startsWith("<mi fn>"); if (fn) a = a.replace("<mi fn>", "<mi>");
    let sub = null, sup = null;
    for (;;) { ws(p); const c = p.s[p.i]; if (c === "_") { p.i++; sub = arg(p); } else if (c === "^") { p.i++; sup = arg(p); } else if (c === "'") { p.i++; sup = (sup ? sup.replace(/^<mrow>|<\/mrow>$/g, "") : "") + "<mo>′</mo>"; sup = `<mrow>${sup}</mrow>`; } else break; }
    if (big) a = a.replace("<mi lim>", "<mi>");
    if (sub != null || sup != null) {
      const under = big && p.display;
      a = sub != null && sup != null ? `<${under ? "munderover" : "msubsup"}>${a}${sub}${sup}</${under ? "munderover" : "msubsup"}>` : sub != null ? `<${under ? "munder" : "msub"}>${a}${sub}</${under ? "munder" : "msub"}>` : `<${under ? "mover" : "msup"}>${a}${sup}</${under ? "mover" : "msup"}>`;
    }
    out += a + (fn ? '<mspace width="0.1667em"/>' : "");
  }
  return out;
}
function atom(p) {
  ws(p); const c = p.s[p.i];
  if (c === "{") return `<mrow>${group(p)}</mrow>`;
  if (/\d/.test(c) || (c === "." && /\d/.test(p.s[p.i + 1] || ""))) { const m = /^\d*\.?\d+|^\d+/.exec(p.s.slice(p.i)); p.i += m[0].length; return `<mn>${m[0]}</mn>`; }
  if (c === ".") { p.i++; return "<mo>.</mo>"; }
  if (/[A-Za-z]/.test(c)) { p.i++; return `<mi>${c}</mi>`; }
  if (c !== "\\") { p.i++; if ("()[]|".includes(c)) return `<mo stretchy="false">${c}</mo>`; if ("+-=<>,;:!/*".includes(c) || c === "?") return `<mo>${esc(c === "-" ? "−" : c === "*" ? "∗" : c)}</mo>`; /* 普通括号不拉伸，只有 \left \right 才随内容长高 */ if (c === "~") return '<mspace width="0.25em"/>'; return `<mi>${esc(c)}</mi>`; }
  const name = cmdName(p);
  if (GREEK[name]) return /^[A-Z]/.test(name) ? `<mi mathvariant="normal">${GREEK[name]}</mi>` : `<mi>${GREEK[name]}</mi>`; // 大写希腊字母正体
  if (MO[name]) return `<mo>${MO[name]}</mo>`;
  if (BIG[name]) return `<mo largeop="true" movablelimits="true">${BIG[name]}</mo>`;
  if (FN.has(name)) return LIMFN.has(name) ? `<mi lim>${name}</mi>` : `<mi fn>${name}</mi>`; // 函数名后面的细空白等上下标挂完再补（\sin^2 x）
  if (SPACE[name] != null) return `<mspace width="${SPACE[name]}"/>`;
  if (name === "{" || name === "}" || name === "|" || name === "%" || name === "$" || name === "&" || name === "#" || name === "_") return `<mo>${esc(name === "|" ? "‖" : name)}</mo>`;
  if (name === "frac" || name === "dfrac" || name === "tfrac" || name === "cfrac") { const a = arg(p), b = arg(p); return `<mfrac${name === "dfrac" ? ' displaystyle="true"' : name === "tfrac" ? ' displaystyle="false"' : ""}>${a}${b}</mfrac>`; }
  if (name === "binom") { const a = arg(p), b = arg(p); return `<mrow><mo>(</mo><mfrac linethickness="0">${a}${b}</mfrac><mo>)</mo></mrow>`; }
  if (name === "sqrt") { ws(p); if (p.s[p.i] === "[") { const j = p.s.indexOf("]", p.i); const idx = tex2(p.s.slice(p.i + 1, j), p.display); p.i = j + 1; return `<mroot>${arg(p)}<mrow>${idx}</mrow></mroot>`; } return `<msqrt>${arg(p)}</msqrt>`; }
  if (ACC[name]) { const a = arg(p); return `<mover accent="true">${a}<mo stretchy="${name.startsWith("wide") || name === "overline" || name === "overrightarrow"}">${ACC[name]}</mo></mover>`; }
  if (name === "underline") return `<munder accentunder="true">${arg(p)}<mo stretchy="true">_</mo></munder>`;
  if (name === "overbrace" || name === "underbrace") { const a = arg(p); return name === "overbrace" ? `<mover>${a}<mo stretchy="true">⏞</mo></mover>` : `<munder>${a}<mo stretchy="true">⏟</mo></munder>`; }
  if (name === "text" || name === "textrm" || name === "mbox" || name === "textbf" || name === "textit") return `<mtext${name === "textbf" ? ' style="font-weight:700"' : name === "textit" ? ' style="font-style:italic"' : ""}>${esc(rawGroup(p))}</mtext>`;
  if (name === "operatorname") return `<mi fn>${esc(rawGroup(p))}</mi>`;
  if (name === "mathrm" || name === "mathbf" || name === "mathit" || name === "boldsymbol" || name === "mathsf") { const t = rawGroup(p), st = name === "mathbf" || name === "boldsymbol" ? ' style="font-weight:700"' : name === "mathsf" ? ' style="font-family:var(--sn-sans)"' : ""; return t.length === 1 && name !== "mathit" ? `<mi mathvariant="normal"${st}>${esc(t)}</mi>` : `<mrow${st}>${tex2(t, p.display, name === "mathrm" || name === "mathbf" ? "normal" : "")}</mrow>`; }
  if (name === "mathbb" || name === "mathcal") { const t = [...rawGroup(p)].map((ch) => `<mi>${name === "mathbb" ? alpha(ch, 0x1d538, BB) : alpha(ch, 0x1d49c, CAL)}</mi>`).join(""); return t.split("<mi>").length > 2 ? `<mrow>${t}</mrow>` : t; }
  if (name === "left") { const l = fence(p); const body = seq(p, () => false); if (!p.s.startsWith("\\right", p.i)) throw new Error(tt("markdown.22")); p.i += 6; const r = fence(p); return `<mrow>${l ? `<mo fence="true" stretchy="true">${l}</mo>` : ""}${body}${r ? `<mo fence="true" stretchy="true">${r}</mo>` : ""}</mrow>`; }
  if (name === "big" || name === "Big" || name === "bigg" || name === "Bigg" || name === "bigl" || name === "bigr" || name === "Bigl" || name === "Bigr") { const f = fence(p), sz = { big: "1.2em", Big: "1.8em", bigg: "2.4em", Bigg: "3em" }[name.replace(/[lr]$/, "")]; return `<mo stretchy="true" minsize="${sz}" maxsize="${sz}">${f}</mo>`; }
  if (name === "begin") {
    const env = rawGroup(p).replace(/\*$/, ""); if (!ENVS[env]) throw new Error(tt("markdown.23")); if (env === "array") rawGroup(p);
    const rows = [[]];
    for (;;) { const cell = seq(p, () => false); rows.at(-1).push(cell); ws(p); if (p.s[p.i] === "&") { p.i++; continue; } if (p.s.startsWith("\\\\", p.i)) { p.i += 2; ws(p); if (p.s[p.i] === "[") p.i = p.s.indexOf("]", p.i) + 1; rows.push([]); continue; } if (p.s.startsWith("\\end", p.i)) { p.i += 4; rawGroup(p); break; } throw new Error(tt("markdown.24")); }
    if (rows.length > 1 && rows.at(-1).length === 1 && !rows.at(-1)[0]) rows.pop();
    const al = env === "cases" ? ' columnalign="left left"' : env.startsWith("align") ? ' columnalign="right left" columnspacing="0"' : "";
    const [l, r] = ENVS[env], tbl = `<mtable class="${env.startsWith("align") ? "sn-aligned" : env === "cases" ? "sn-cases" : env === "gathered" ? "gathered" : "sn-matrix"}"${al}${env === "smallmatrix" ? ' style="font-size:.8em"' : ""}>${rows.map((rw) => `<mtr>${rw.map((c) => `<mtd>${c}</mtd>`).join("")}</mtr>`).join("")}</mtable>`;
    return l || r ? `<mrow>${l ? `<mo fence="true" stretchy="true">${l}</mo>` : ""}${tbl}${r ? `<mo fence="true" stretchy="true">${r}</mo>` : ""}</mrow>` : tbl;
  }
  throw new Error(tt("markdown.25") + name);
}
function fence(p) { ws(p); const c = p.s[p.i]; if (c === "\\") { const n = cmdName(p); if (n === "{" || n === "}") return n; if (n === "|") return "‖"; if (MO[n]) return MO[n]; throw new Error(tt("markdown.26")); } p.i++; return c === "." ? "" : esc(c); }
function tex2(src, display, variant) { const p = { s: src, i: 0, display }; let out = seq(p, () => false); if (variant === "normal") out = out.replace(/<mi>/g, '<mi mathvariant="normal">'); return out; }
// ———————————————— 渲染 + 交互 ————————————————
/**
 * renderMarkdown(el, md, opt)
 *  codeMax   代码块超过多高就折叠（px，0 不折叠），默认 240
 *  imgH      块级图片的高度（px 或 "auto" 按原比例），默认 220
 *  tableMax  表格超过多高就在框里滚（px，0 不限），默认 0
 * 返回 { set(opt), update(md) }：set 改高度设置（不重渲），update 换内容
 */
export function renderMarkdown(el, md, opt = {}) {
  const o = { codeMax: 240, imgH: 220, tableMax: 0, reduced: () => matchMedia("(prefers-reduced-motion: reduce)").matches, ...opt };
  let ctx = null, liveRelease = null;
  el.classList.add("sn-md");
  const vars = () => { el.style.setProperty("--sn-md-code-max", o.codeMax ? o.codeMax + "px" : "none"); el.style.setProperty("--sn-md-img-h", o.imgH === "auto" ? "auto" : o.imgH + "px"); el.style.setProperty("--sn-md-table-max", o.tableMax ? o.tableMax + "px" : "none"); el.classList.toggle("sn-img-auto", o.imgH === "auto"); };
  function render(src) { for (const a of el.querySelectorAll(".sn-audio-row")) a._audio?.destroy(); for (const p of el.querySelectorAll(".sn-player")) p._player?.destroy(); ctx = { codes: [], ids: new Map() }; el.innerHTML = blocks(String(src || "").replace(/\r\n?/g, "\n").split("\n"), ctx); vars(); enhance(); }
  // 代码块：内容比上限高（多出一行以上）才折叠；图片：加载中有占位、失败给提示
  function enhance() {
    for (const b of el.querySelectorAll(".sn-md-code")) clip(b);
    // 会溢出滚动的地方都用滚动区域：表格（不回弹：滚到头停住，新的一次滚动交给页面）、代码（横向；行号吸附在左边，不加渐隐）、公式（横向）
    for (const t of el.querySelectorAll(".sn-md-table")) scrollArea(t, { fade: "none" });
    for (const pre of el.querySelectorAll(".sn-md-code pre")) scrollArea(pre, { fade: "none" });
    for (const m of el.querySelectorAll(".sn-md-math")) scrollArea(m, { fade: "x", size: 20 });
    for (const p of el.querySelectorAll(".sn-player")) mountPlayer(p);
    for (const a of el.querySelectorAll(".sn-audio-row")) mountAudio(a);
    const lives = el.querySelectorAll(".sn-md-live iframe");
    // 载完以后外面再问一次高度（外面的监听已经装好，不会丢）；框的尺寸变了（从隐藏到显示、换宽度）也再问
    if (lives.length) { liveRelease ??= wireLive(); for (const f of lives) { f.addEventListener("load", () => f.contentWindow?.postMessage({ mdTheme: themeVars(), mdAsk: 1 }, "*")); liveRO?.observe(f); } }
    for (const img of el.querySelectorAll(".sn-md-img img")) {
      const box = img.parentElement; const ok = () => box.classList.add("sn-ok"), bad = () => box.classList.add("sn-bad");
      if (img.complete) (img.naturalWidth ? ok : bad)(); else { img.addEventListener("load", ok, { once: true }); img.addEventListener("error", bad, { once: true }); }
    }
  }
  function clip(b) {
    const bd = b.querySelector(".sn-md-code-bd"), more = b.querySelector(".sn-md-code-more"), max = parseFloat(getComputedStyle(b).getPropertyValue("--sn-md-code-max"));
    const need = max > 0 && bd.firstElementChild.scrollHeight > max + 20;
    if (!need) { b.classList.remove("sn-clip", "sn-expanded"); more.hidden = true; bd.style.maxHeight = ""; return; }
    more.hidden = false; if (!b.classList.contains("sn-expanded")) b.classList.add("sn-clip");
  }
  // 展开 / 收起：高度从当前值缓到目标值（240ms），收起后代码块顶部跑到窗口外时把它拉回来
  function toggle(b) {
    const bd = b.querySelector(".sn-md-code-bd"), more = b.querySelector(".sn-md-code-more span"), n = b.querySelectorAll(".sn-l").length, full = bd.firstElementChild.scrollHeight, max = parseFloat(getComputedStyle(b).getPropertyValue("--sn-md-code-max"));
    const open = !b.classList.contains("sn-expanded"), from = bd.getBoundingClientRect().height, to = open ? full : max;
    b.classList.toggle("sn-expanded", open); b.classList.toggle("sn-clip", !open); more.textContent = open ? tt("markdown.27") : tt("markdown.15", { p0: n });
    if (o.reduced()) { bd.style.maxHeight = ""; return; }
    bd.style.maxHeight = "none"; const a = bd.animate([{ height: from + "px" }, { height: to + "px" }], { duration: Math.max(200, Math.min(420, 160 + Math.abs(to - from) * .35)), easing: "cubic-bezier(.25,.8,.25,1)" }); bd.style.overflow = "hidden";
    a.onfinish = a.oncancel = () => { bd.style.maxHeight = ""; bd.style.overflow = ""; };
    if (!open) { const top = b.getBoundingClientRect().top; if (top < 0) scrollBy({ top: top - 16, behavior: "instant" }); }
  }
  el.addEventListener("click", (e) => {
    const lb = e.target.closest('[data-md^="live"]'), live = lb?.closest(".sn-md-live");
    if (lb && live) {
      if (lb.dataset.md === "live-replay") { const f = live.querySelector("iframe"); f.srcdoc = f.srcdoc; /* eslint-disable-line no-self-assign -- 重新赋值让 iframe 重新载入（重播） */ if (live.classList.contains("sn-code")) live.querySelector('[data-md="live-view"]').click(); return; }
      const code = lb.dataset.md === "live-code"; if (live.classList.contains("sn-code") === code) return;
      for (const t of live.querySelectorAll('[role="tab"]')) t.setAttribute("aria-selected", String(t === lb));
      const view = live.querySelector(".sn-md-live-view"), src = live.querySelector(".sn-md-live-code");
      live.classList.toggle("sn-code", code); view.hidden = code; src.hidden = !code; if (code) clip(src.querySelector(".sn-md-code"));
      if (!o.reduced()) (code ? src : view).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: "cubic-bezier(0,0,.58,1)" });
      return;
    }
    const btn = e.target.closest("[data-md]"); const b = btn?.closest(".sn-md-code");
    if (btn && b) {
      if (btn.dataset.md === "copy") {
        const done = (ok) => { btn.textContent = ok ? tt("markdown.28") : tt("markdown.29"); btn.classList.toggle("sn-ok", ok); clearTimeout(btn._t); btn._t = setTimeout(() => { btn.textContent = tt("markdown.14"); btn.classList.remove("sn-ok"); }, 1600); };
        const pr = navigator.clipboard?.writeText(ctx.codes[+b.dataset.k]); if (pr) pr.then(() => done(true), () => done(false)); else done(false);
      } else if (btn.dataset.md === "wrap") { const on = !b.classList.contains("sn-wrap"); b.classList.toggle("sn-wrap", on); btn.setAttribute("aria-pressed", String(on)); clip(b); }
      else if (btn.dataset.md === "more") toggle(b);
      return;
    }
    const img = e.target.closest(".sn-md-img.sn-blk.sn-ok img"); if (img) zoom(img);
  });
  el.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".sn-md-img.sn-blk.sn-ok img")) { e.preventDefault(); zoom(e.target); } });
  // 点开放大：用看图组件——图从原位置长到窗口中间，整篇文档里加载好的图左右翻；能放大缩小、拖动、旋转、还原
  function zoom(img) {
    const imgs = [...el.querySelectorAll(".sn-md-img.sn-blk.sn-ok img")];
    openLightbox(imgs.map((m) => ({ src: m.currentSrc || m.src, size: [m.naturalWidth, m.naturalHeight], alt: m.alt })), Math.max(0, imgs.indexOf(img)), {
      thumbOf: (i) => imgs[i], enabled: (i) => !!imgs[i]?.closest(".sn-md-img.sn-ok"),
    });
  }
  render(md);
  // 销毁：停掉文档里的播放器、放开实时预览的共享接线（挂载时加的监听由 createMarkdown 一起撤）
  const destroy = () => {
    for (const p of el.querySelectorAll(".sn-player")) p._player?.destroy?.();
    for (const a of el.querySelectorAll(".sn-audio-row")) a._audio?.destroy();
    for (const f of el.querySelectorAll(".sn-md-live iframe")) liveRO?.unobserve(f);
    liveRelease?.(); liveRelease = null;
  };
  return { el, set(next) { Object.assign(o, next); vars(); for (const b of el.querySelectorAll(".sn-md-code")) clip(b); }, update: render, destroy, get options() { return { ...o }; } };
}
// ———————————————— 沙箱预览：高度跟着内容，主题换了把新颜色发进去（整页只挂一次） ————————————————
// 整页共用一份（useShared 引用计数）：哪个文档先用到就装上，最后一个用它的文档销毁时撤掉
let liveRO = null;
const wireLive = () => useShared("satin:md-live", () => {
  liveRO = typeof ResizeObserver === "function" ? new ResizeObserver((es) => { for (const e of es) e.target.contentWindow?.postMessage({ mdAsk: 1 }, "*"); }) : null;
  addEventListener("message", (e) => { const d = e.data; if (!d || !d.mdLive) return; for (const f of document.querySelectorAll(`.sn-md-live[data-live="${d.mdLive}"] iframe`)) if (f.contentWindow === e.source) f.style.height = Math.max(48, Math.ceil(d.h)) + "px"; });
  new MutationObserver(() => { const v = themeVars(); for (const f of document.querySelectorAll(".sn-md-live iframe")) f.contentWindow?.postMessage({ mdTheme: v }, "*"); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
});

// createMarkdown(空容器, { source, codeMax, imgH, tableMax }) → { update({ source }), destroy, ... }：统一的组件写法。
// update 给了新的 source 就重新渲染，改了 codeMax / imgH / tableMax 就只改高度设置；destroy 时撤掉挂载时加的监听、停掉文档里的播放器
export const createMarkdown = /* @__PURE__ */ defineComponent({
  name: "markdown",
  html: () => `<div class="sn-md"></div>`,
  defaults: { source: "" },
  mount(el, o) {
    const { source, ...opt } = o, md = renderMarkdown(el, source, opt);
    let cur = source;
    return {
      update(next, prev) {
        const set = {}; for (const k of ["codeMax", "imgH", "tableMax"]) if (next[k] !== prev[k]) set[k] = next[k];
        if (Object.keys(set).length) md.set(set);
        if (next.source !== prev.source) { cur = next.source; md.update(cur); }
      },
      destroy: md.destroy,
      get source() { return cur; },
    };
  },
});
