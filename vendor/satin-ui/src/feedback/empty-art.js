// 空状态场景 SVG 插画：6 款纯中性灰度微缩产品场景（projects / search / error / inbox / folder / lock）。
// 全程读取 Satin 语义 CSS 变量（深浅主题自动适配，零渐变、零彩色污染），用于替代单薄的「圆角灰块 + 小图标」AI 模板写法。
// 导入无副作用（Node / SSR 安全），按需引入可完整摇树，不影响 setup() 或按钮体积。

const BG_GROUND = "color-mix(in srgb,var(--sn-label) 5.5%,transparent)";
const FILL_BACK = "var(--sn-sunken)";
const FILL_MID = "color-mix(in srgb,var(--sn-label) 3%,var(--sn-raised))";
const FILL_FRONT = "var(--sn-ea-front,var(--sn-raised))";
const STROKE_MAIN = "var(--sn-line-control)";
const STROKE_SOFT = "var(--sn-line)";
const BAR_STRONG = "color-mix(in srgb,var(--sn-label) 13%,transparent)";
const BAR_SOFT = "color-mix(in srgb,var(--sn-label) 7.5%,transparent)";
const INK = "var(--sn-label)";
const INK2 = "var(--sn-label2)";

// 每一款画在 144 × 104 坐标系中，视觉重心严格居中，底部留一枚极柔和的椭圆着陆面
const ARTS = {
  // 1. 首次使用 / 还没有项目：三层微倾分镜卡片栈 + 主卡缩略画幅与骨架行 + 右下角悬浮加号徽章
  projects:
    `<ellipse cx="72" cy="93" rx="48" ry="4.5" style="fill:${BG_GROUND}"/>`
    // 周边克制几何坐标点（非 AI 星星）
    + `<circle cx="20" cy="36" r="2.2" fill="none" stroke-width="1.2" style="stroke:${STROKE_MAIN}"/>`
    + `<circle cx="123" cy="28" r="1.8" style="fill:${BAR_STRONG}"/>`
    // 后景左卡（微倾 -10°）
    + `<g transform="rotate(-10 44 56)">`
    + `<rect x="20" y="27" width="48" height="56" rx="8" stroke-width="1.15" style="fill:${FILL_BACK};stroke:${STROKE_MAIN}"/>`
    + `<rect x="27" y="35" width="34" height="18" rx="4" style="fill:${BAR_SOFT}"/>`
    + `<rect x="27" y="59" width="24" height="3.5" rx="1.75" style="fill:${BAR_STRONG}"/>`
    + `<rect x="27" y="66" width="16" height="3" rx="1.5" style="fill:${BAR_SOFT}"/>`
    + `</g>`
    // 后景右卡（微倾 +9°）
    + `<g transform="rotate(9 100 56)">`
    + `<rect x="76" y="25" width="48" height="56" rx="8" stroke-width="1.15" style="fill:${FILL_MID};stroke:${STROKE_MAIN}"/>`
    + `<rect x="83" y="33" width="34" height="18" rx="4" style="fill:${BAR_SOFT}"/>`
    + `<rect x="83" y="57" width="22" height="3.5" rx="1.75" style="fill:${BAR_STRONG}"/>`
    + `<rect x="83" y="64" width="14" height="3" rx="1.5" style="fill:${BAR_SOFT}"/>`
    + `</g>`
    // 前景主卡片（正中清晰抬起）
    + `<g class="sn-ea-lift">`
    + `<rect x="39" y="14" width="66" height="72" rx="10" stroke-width="1.25" style="fill:${FILL_FRONT};stroke:${STROKE_MAIN}"/>`
    // 内部 16:9 微缩分镜画面框
    + `<rect x="46" y="21" width="52" height="30" rx="5.5" stroke-width="1" style="fill:${BAR_SOFT};stroke:${STROKE_SOFT}"/>`
    + `<path d="M51 46.5 L61 36.5 L69 43.5 L78 33.5 L93 46.5" fill="none" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" style="stroke:${STROKE_MAIN}"/>`
    + `<circle cx="58" cy="29.5" r="2.8" style="fill:${BAR_STRONG}"/>`
    // 标题与副信息微缩条
    + `<rect x="46" y="58" width="38" height="4.5" rx="2.25" style="fill:${BAR_STRONG}"/>`
    + `<rect x="46" y="66.5" width="24" height="3.5" rx="1.75" style="fill:${BAR_SOFT}"/>`
    + `</g>`
    // 右下角悬浮新建徽章（+）
    + `<g class="sn-ea-badge">`
    + `<circle cx="105" cy="75" r="13.5" stroke-width="1.25" style="fill:${FILL_FRONT};stroke:${STROKE_MAIN}"/>`
    + `<path d="M105 69.5V80.5M99.5 75H110.5" fill="none" stroke-width="1.8" stroke-linecap="round" style="stroke:${INK}"/>`
    + `</g>`,

  // 2. 搜索 / 筛选没有结果：淡化虚线结果列表卡 + 前景立体精密放大镜与空匹配短横
  search:
    `<ellipse cx="72" cy="93" rx="46" ry="4.5" style="fill:${BG_GROUND}"/>`
    + `<circle cx="21" cy="28" r="2" fill="none" stroke-width="1.2" style="stroke:${STROKE_MAIN}"/>`
    + `<circle cx="122" cy="36" r="1.8" style="fill:${BAR_STRONG}"/>`
    // 底层错位底卡（增加纵深）
    + `<rect x="27" y="21" width="70" height="63" rx="10" stroke-width="1.1" style="fill:${FILL_BACK};stroke:${STROKE_SOFT}"/>`
    // 主筛选列表卡（轻柔虚线边提示结果为空）
    + `<g class="sn-ea-lift">`
    + `<rect x="33" y="14" width="70" height="66" rx="10" stroke-width="1.25" style="fill:${FILL_FRONT};stroke:${STROKE_MAIN}"/>`
    // 顶栏微缩搜索槽
    + `<rect x="41" y="22" width="54" height="10" rx="5" style="fill:${BAR_SOFT}"/>`
    + `<rect x="46" y="25.5" width="22" height="3" rx="1.5" style="fill:${BAR_STRONG}"/>`
    // 列表虚化占位行（逐行变浅）
    + `<rect x="41" y="39" width="8" height="8" rx="2.5" style="fill:${BAR_STRONG}"/>`
    + `<rect x="53" y="40.5" width="32" height="3.5" rx="1.75" style="fill:${BAR_STRONG}"/>`
    + `<rect x="53" y="46" width="20" height="2.5" rx="1.25" style="fill:${BAR_SOFT}"/>`
    + `<g opacity="0.65">`
    + `<rect x="41" y="54" width="8" height="8" rx="2.5" style="fill:${BAR_SOFT}"/>`
    + `<rect x="53" y="55.5" width="26" height="3.5" rx="1.75" style="fill:${BAR_SOFT}"/>`
    + `<rect x="53" y="61" width="16" height="2.5" rx="1.25" style="fill:${BAR_SOFT}"/>`
    + `</g>`
    + `<line x1="41" y1="71" x2="72" y2="71" stroke-width="1.25" stroke-dasharray="3 3" stroke-linecap="round" style="stroke:${STROKE_MAIN}"/>`
    + `</g>`
    // 前景立体放大镜（双层同心镜圈 + 镜面高光弧 + 斜柄 + 镜心短横）
    + `<g class="sn-ea-badge">`
    + `<path d="M107.5 69.5 L120.5 82.5" fill="none" stroke-width="5.2" stroke-linecap="round" style="stroke:${FILL_FRONT}"/>`
    + `<path d="M107.5 69.5 L120.5 82.5" fill="none" stroke-width="2.6" stroke-linecap="round" style="stroke:${INK}"/>`
    + `<circle cx="95" cy="57" r="19" stroke-width="1.5" style="fill:${FILL_FRONT};stroke:${INK}"/>`
    + `<circle cx="95" cy="57" r="14.5" stroke-width="1" style="fill:${BAR_SOFT};stroke:${STROKE_SOFT}"/>`
    + `<path d="M85.5 51.5 A11.5 11.5 0 0 1 93.5 46" fill="none" stroke-width="1.4" stroke-linecap="round" style="stroke:${STROKE_MAIN}"/>`
    + `<path d="M90.5 57 H99.5" fill="none" stroke-width="1.8" stroke-linecap="round" style="stroke:${INK2}"/>`
    + `</g>`,

  // 3. 加载失败 / 网络中断：双层几何云片 + 底部断裂节点连线 + 离线断连徽章
  error:
    `<ellipse cx="72" cy="93" rx="48" ry="4.5" style="fill:${BG_GROUND}"/>`
    + `<circle cx="24" cy="40" r="2" fill="none" stroke-width="1.2" style="stroke:${STROKE_MAIN}"/>`
    + `<circle cx="122" cy="30" r="1.8" style="fill:${BAR_STRONG}"/>`
    // 后景偏右副云片（建立清晰前后景深）
    + `<path d="M68 48 H112 A11 11 0 0 0 110 26.2 A15 15 0 0 0 82 22.5 A12 12 0 0 0 68 36 Z" stroke-width="1.15" style="fill:${FILL_BACK};stroke:${STROKE_MAIN}"/>`
    // 底部断开的数据链路与左右端点
    + `<line x1="36" y1="81" x2="62" y2="81" stroke-width="1.35" stroke-linecap="round" style="stroke:${STROKE_MAIN}"/>`
    + `<line x1="82" y1="81" x2="108" y2="81" stroke-width="1.35" stroke-linecap="round" style="stroke:${STROKE_MAIN}"/>`
    + `<path d="M68.5 77.5 L75.5 84.5 M75.5 77.5 L68.5 84.5" fill="none" stroke-width="1.5" stroke-linecap="round" style="stroke:${INK2}"/>`
    + `<circle cx="36" cy="81" r="3" stroke-width="1.25" style="fill:${FILL_FRONT};stroke:${STROKE_MAIN}"/>`
    + `<circle cx="108" cy="81" r="3" stroke-width="1.25" style="fill:${FILL_FRONT};stroke:${STROKE_MAIN}"/>`
    + `<line x1="72" y1="64" x2="72" y2="73" stroke-width="1.25" stroke-dasharray="2.5 2.5" stroke-linecap="round" style="stroke:${STROKE_MAIN}"/>`
    // 前景主云片
    + `<g class="sn-ea-lift">`
    + `<path d="M40 65 H96 A13.5 13.5 0 0 0 94.5 38.2 A19.5 19.5 0 0 0 57.5 32.5 A14 14 0 0 0 40 46.5 A12 12 0 0 0 40 65 Z" stroke-width="1.3" stroke-linejoin="round" style="fill:${FILL_FRONT};stroke:${STROKE_MAIN}"/>`
    // 云片内部轻柔信号断波纹
    + `<path d="M56 50.5 A17 17 0 0 1 80 50.5" fill="none" stroke-width="1.4" stroke-linecap="round" style="stroke:${BAR_STRONG}"/>`
    + `<path d="M61 55.5 A10 10 0 0 1 75 55.5" fill="none" stroke-width="1.4" stroke-linecap="round" style="stroke:${BAR_STRONG}"/>`
    + `<circle cx="68" cy="59.5" r="1.6" style="fill:${INK2}"/>`
    + `</g>`
    // 右下角离线斜杠圆徽章
    + `<g class="sn-ea-badge">`
    + `<circle cx="100" cy="61" r="13.5" stroke-width="1.25" style="fill:${FILL_FRONT};stroke:${STROKE_MAIN}"/>`
    + `<path d="M100 55.2 V62.2" fill="none" stroke-width="1.85" stroke-linecap="round" style="stroke:${INK}"/>`
    + `<circle cx="100" cy="66.2" r="1.2" style="fill:${INK}"/>`
    + `</g>`,

  // 4. 空收件箱 / 暂无通知：微立体托盘盒 + 悬浮折叠信封
  inbox:
    `<ellipse cx="72" cy="93" rx="48" ry="4.5" style="fill:${BG_GROUND}"/>`
    + `<circle cx="22" cy="34" r="2" fill="none" stroke-width="1.2" style="stroke:${STROKE_MAIN}"/>`
    + `<circle cx="122" cy="30" r="1.8" style="fill:${BAR_STRONG}"/>`
    // 后景悬浮轻柔折纸信封
    + `<g class="sn-ea-lift" transform="rotate(-5 72 34)">`
    + `<rect x="47" y="16" width="50" height="34" rx="6" stroke-width="1.2" style="fill:${FILL_FRONT};stroke:${STROKE_MAIN}"/>`
    + `<path d="M50 20 L72 35 L94 20" fill="none" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" style="stroke:${STROKE_MAIN}"/>`
    + `</g>`
    // 托盘后腔体
    + `<path d="M35 45 L42 36 H102 L109 45 V77 A9 9 0 0 1 100 86 H44 A9 9 0 0 1 35 77 Z" stroke-width="1.2" stroke-linejoin="round" style="fill:${FILL_BACK};stroke:${STROKE_MAIN}"/>`
    // 托盘前景带拿取凹口挡板
    + `<path d="M35 55 H54 A6 6 0 0 0 60 61 H84 A6 6 0 0 0 90 55 H109 V77 A9 9 0 0 1 100 86 H44 A9 9 0 0 1 35 77 Z" stroke-width="1.25" stroke-linejoin="round" style="fill:${FILL_FRONT};stroke:${STROKE_MAIN}"/>`
    // 右上角清零圆徽章
    + `<g class="sn-ea-badge">`
    + `<circle cx="104" cy="48" r="12" stroke-width="1.25" style="fill:${FILL_FRONT};stroke:${STROKE_MAIN}"/>`
    + `<path d="M99.2 48.2 L102.4 51.4 L109 44.8" fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="stroke:${INK}"/>`
    + `</g>`,

  // 5. 空文件夹 / 暂无素材：双层立体文件夹 + 探出虚线空页
  folder:
    `<ellipse cx="72" cy="93" rx="48" ry="4.5" style="fill:${BG_GROUND}"/>`
    + `<circle cx="23" cy="36" r="2" fill="none" stroke-width="1.2" style="stroke:${STROKE_MAIN}"/>`
    + `<circle cx="122" cy="34" r="1.8" style="fill:${BAR_STRONG}"/>`
    // 文件夹背板（带顶部标签耳片）
    + `<path d="M33 32 A7 7 0 0 1 40 25 H58 L64 32 H104 A7 7 0 0 1 111 39 V77 A8 8 0 0 1 103 85 H41 A8 8 0 0 1 33 77 Z" stroke-width="1.2" stroke-linejoin="round" style="fill:${FILL_BACK};stroke:${STROKE_MAIN}"/>`
    // 中间探出的空白文档页
    + `<g class="sn-ea-lift">`
    + `<rect x="44" y="18" width="56" height="52" rx="7" stroke-width="1.2" stroke-dasharray="3.5 3" style="fill:${FILL_FRONT};stroke:${STROKE_MAIN}"/>`
    + `<rect x="54" y="29" width="32" height="4" rx="2" style="fill:${BAR_STRONG}"/>`
    + `<rect x="54" y="37" width="22" height="3.5" rx="1.75" style="fill:${BAR_SOFT}"/>`
    + `</g>`
    // 文件夹前景折页
    + `<path d="M31 48 A6 6 0 0 1 37 42 H107 A6 6 0 0 1 113 48 L110 78 A8 8 0 0 1 102 85 H42 A8 8 0 0 1 34 78 Z" stroke-width="1.25" stroke-linejoin="round" style="fill:${FILL_FRONT};stroke:${STROKE_MAIN}"/>`
    + `<rect x="56" y="61" width="32" height="4" rx="2" style="fill:${BAR_SOFT}"/>`,

  // 6. 无权限 / 需授权：受保护微缩卡片 + 精密盾锁徽章
  lock:
    `<ellipse cx="72" cy="93" rx="46" ry="4.5" style="fill:${BG_GROUND}"/>`
    + `<circle cx="24" cy="34" r="2" fill="none" stroke-width="1.2" style="stroke:${STROKE_MAIN}"/>`
    + `<circle cx="121" cy="36" r="1.8" style="fill:${BAR_STRONG}"/>`
    + `<rect x="33" y="21" width="70" height="63" rx="10" stroke-width="1.15" style="fill:${FILL_BACK};stroke:${STROKE_SOFT}"/>`
    + `<g class="sn-ea-lift">`
    + `<rect x="39" y="15" width="66" height="67" rx="10" stroke-width="1.25" style="fill:${FILL_FRONT};stroke:${STROKE_MAIN}"/>`
    + `<rect x="48" y="27" width="36" height="4.5" rx="2.25" style="fill:${BAR_STRONG}"/>`
    + `<rect x="48" y="36" width="46" height="3.5" rx="1.75" style="fill:${BAR_SOFT}"/>`
    + `<rect x="48" y="44" width="30" height="3.5" rx="1.75" style="fill:${BAR_SOFT}"/>`
    + `<rect x="48" y="56" width="48" height="16" rx="4" stroke-width="1" stroke-dasharray="3 3" style="fill:none;stroke:${STROKE_MAIN}"/>`
    + `</g>`
    // 右下角精密锁形圆徽章
    + `<g class="sn-ea-badge">`
    + `<circle cx="101" cy="69" r="16" stroke-width="1.25" style="fill:${FILL_FRONT};stroke:${STROKE_MAIN}"/>`
    + `<path d="M96.5 67 V64.5 A4.5 4.5 0 0 1 105.5 64.5 V67" fill="none" stroke-width="1.6" stroke-linecap="round" style="stroke:${INK}"/>`
    + `<rect x="94" y="67" width="14" height="10.5" rx="2.8" stroke-width="1.5" style="fill:${BAR_SOFT};stroke:${INK}"/>`
    + `<circle cx="101" cy="72" r="1.4" style="fill:${INK}"/>`
    + `</g>`,
};

/** 全部内置空状态场景插画名 */
export const EMPTY_ART_IDS = Object.freeze(Object.keys(ARTS));

/** 取某一款空状态场景插画的纯 SVG 字符串（默认 projects） */
export function emptyArtSvg(name = "projects") {
  const body = ARTS[name] || ARTS.projects;
  return `<svg class="sn-ea-svg" data-empty-art="${name in ARTS ? name : "projects"}" viewBox="0 0 144 104" width="144" height="104" fill="none" aria-hidden="true">${body}</svg>`;
}

/** 空状态场景插画标记（Node / SSR 安全） */
export function emptyArtHTML({ name = "projects", label } = {}) {
  const safe = name in ARTS ? name : "projects";
  const a = label ? ` role="img" aria-label="${String(label).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])}"` : ` aria-hidden="true"`;
  return `<span class="sn-empty-art"${a}>${emptyArtSvg(safe)}</span>`;
}
