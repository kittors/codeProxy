// Satin 组件与样式分片依赖清单（Single Source of Truth）：
// 供 satin-ui/vite 自动按需 CSS 注入、unplugin-vue-components / unplugin-auto-import Resolver 以及 satin-cli 按需分析共用。
// 纯数据 + 纯函数，无任何 DOM / Node 依赖，可安全在构建期、浏览器或 Node 中运行。

/** 全部分片的标准层叠顺序（与 css/page.css、css/satin.css 严格一致） */
export const CSS_ORDER = [
  "tokens.css",
  "reset.css",
  "base.css",
  "buttons.css",
  "form.css",
  "input.css",
  "overlay.css",
  "feedback.css",
  "table.css",
  "display.css",
  "media.css",
  "nav.css",
  "scroll.css",
  "list.css",
  "chat.css",
  "flow.css",
  "editorial.css",
  "picker.css",
  "number.css",
  "grid.css",
  "charts.css",
  "md.css",
  "tree.css",
  "volumetric.css",
  "carousel.css",
  "header.css",
  "shell.css",
];

const ORDER_IDX = new Map(CSS_ORDER.map((f, i) => [f, i]));
export const ALL_COMPONENT_CSS = CSS_ORDER.filter((f) => f !== "tokens.css" && f !== "reset.css" && f !== "base.css");

/** 重组件 / 独立子路径 → 对应 CSS 分片 */
export const SUBPATH_STYLES = {
  "satin-ui/grid": ["buttons.css", "form.css", "input.css", "overlay.css", "scroll.css", "display.css", "grid.css"],
  "satin-ui/react/grid": ["buttons.css", "form.css", "input.css", "overlay.css", "scroll.css", "display.css", "grid.css"],
  "satin-ui/vue/grid": ["buttons.css", "form.css", "input.css", "overlay.css", "scroll.css", "display.css", "grid.css"],
  "satin-ui/canvas-grid": ["buttons.css", "form.css", "input.css", "overlay.css", "scroll.css", "display.css", "grid.css"],
  "satin-ui/react/canvas-grid": ["buttons.css", "form.css", "input.css", "overlay.css", "scroll.css", "display.css", "grid.css"],
  "satin-ui/vue/canvas-grid": ["buttons.css", "form.css", "input.css", "overlay.css", "scroll.css", "display.css", "grid.css"],
  "satin-ui/charts": ["charts.css"],
  "satin-ui/react/charts": ["charts.css"],
  "satin-ui/vue/charts": ["charts.css"],
  "satin-ui/chat": ["buttons.css", "input.css", "overlay.css", "feedback.css", "scroll.css", "display.css", "media.css", "md.css", "chat.css"],
  "satin-ui/react/chat": ["buttons.css", "input.css", "overlay.css", "feedback.css", "scroll.css", "display.css", "media.css", "md.css", "chat.css"],
  "satin-ui/vue/chat": ["buttons.css", "input.css", "overlay.css", "feedback.css", "scroll.css", "display.css", "media.css", "md.css", "chat.css"],
  "satin-ui/flow": ["buttons.css", "overlay.css", "flow.css"],
  "satin-ui/react/flow": ["buttons.css", "overlay.css", "flow.css"],
  "satin-ui/vue/flow": ["buttons.css", "overlay.css", "flow.css"],
  "satin-ui/markdown": ["buttons.css", "scroll.css", "media.css", "md.css"],
  "satin-ui/react/markdown": ["buttons.css", "scroll.css", "media.css", "md.css"],
  "satin-ui/vue/markdown": ["buttons.css", "scroll.css", "media.css", "md.css"],
  "satin-ui/tree": ["buttons.css", "form.css", "input.css", "overlay.css", "scroll.css", "tree.css"],
  "satin-ui/react/tree": ["buttons.css", "form.css", "input.css", "overlay.css", "scroll.css", "tree.css"],
  "satin-ui/vue/tree": ["buttons.css", "form.css", "input.css", "overlay.css", "scroll.css", "tree.css"],
  "satin-ui/lightbox": ["buttons.css", "media.css"],
  "satin-ui/media": ["buttons.css", "media.css"],
  "satin-ui/theme-panel": ["buttons.css", "form.css", "overlay.css", "shell.css"],
};

/** Svelte 单文件组件 → 对应 CSS 分片 */
export const SVELTE_STYLES = {
  "Avatar.svelte": ["display.css"],
  "Collapse.svelte": ["display.css"],
  "DataGrid.svelte": ["buttons.css", "form.css", "input.css", "overlay.css", "scroll.css", "display.css", "grid.css"],
  "DatePicker.svelte": ["buttons.css", "form.css", "overlay.css", "picker.css"],
  "Dialog.svelte": ["buttons.css", "overlay.css"],
  "EmptyArt.svelte": ["feedback.css"],
  "Icon.svelte": [],
  "NumberFlow.svelte": ["number.css"],
  "Otp.svelte": ["form.css"],
  "Pager.svelte": ["buttons.css", "nav.css"],
  "Satin.svelte": ["overlay.css"],
  "Segmented.svelte": ["buttons.css"],
  "Select.svelte": ["buttons.css", "form.css"],
  "Slider.svelte": ["form.css"],
  "Stepper.svelte": ["buttons.css", "input.css"],
  "Tabs.svelte": ["nav.css"],
  "TagInput.svelte": ["form.css", "input.css"],
};

/** 符号级精确映射（覆盖纯 JS、React、Vue、Elements 全部具名导出） */
export const SYMBOL_STYLES = {
  // —— 基础设施 / 无额外组件样式（仅需 tokens.css + base.css） ——
  setup: ["overlay.css"],
  showTip: ["overlay.css"],
  hideTip: ["overlay.css"],
  tipTarget: ["overlay.css"],
  resetTipLayer: ["overlay.css"],
  Tooltip: ["overlay.css"],
  SatinProvider: ["overlay.css"],
  createSatin: ["overlay.css"],
  ThemeScope: [],
  useTheme: [],
  useLocale: [],
  useSatin: [],
  wrapSatin: [],
  Icon: [],
  icon: [],
  Text: [],
  t: [], setLocale: [], addLocale: [], getLocale: [], intlLocale: [], onLocaleChange: [],
  defineComponent: [], track: [], useShared: [], $: [], $$: [], reduced: [], TICK: [],
  injectIcons: [], edgeFrames: [], fitScroll: [], fitStack: [], esc: [],
  presetAvatar: [], avatarSvg: [], AVATAR_IDS: [],
  emptyArtSvg: [], EMPTY_ART_IDS: [], LOADER_VARIANTS: [],
  sortRows: [], flipSnapshot: [], insertWithFlip: [], removeWithFlip: [], optimistic: [],
  autoGrow: [], longCount: [], defineElement: [],

  // —— 按钮与分段控件 ——
  Button: ["buttons.css"],
  buttonHTML: ["buttons.css"],
  busy: ["buttons.css"],
  succeed: ["buttons.css"],
  copied: ["buttons.css"],
  prepBusy: ["buttons.css"],
  Segmented: ["buttons.css"],
  createSegmented: ["buttons.css"],
  initSeg: ["buttons.css"],
  defineSegmented: ["buttons.css"],

  // —— 表单控件 ——
  Input: ["form.css"],
  Textarea: ["form.css"],
  inputHTML: ["form.css"],
  Field: ["form.css"],
  fieldHTML: ["form.css"],
  validateForm: ["form.css"],
  setFieldError: ["form.css"],
  clearFieldError: ["form.css"],
  bindForms: ["form.css"],
  Checkbox: ["form.css"],
  checkHTML: ["form.css"],
  Radio: ["form.css"],
  Switch: ["form.css"],
  switchHTML: ["form.css"],
  Chip: ["form.css"],
  chipHTML: ["form.css"],
  removeChip: ["form.css"],
  Slider: ["form.css"],
  createSlider: ["form.css"],
  initSlider: ["form.css"],
  defineSlider: ["form.css"],
  Select: ["buttons.css", "form.css"],
  createSelect: ["buttons.css", "form.css"],
  mountSelect: ["buttons.css", "form.css"],
  bindSelects: ["buttons.css", "form.css"],
  defineSelect: ["buttons.css", "form.css"],
  Otp: ["form.css"],
  createOtp: ["form.css"],
  defineOtp: ["form.css"],

  // —— 高级输入（密码、邮箱、搜索、计数、长文本、步进器、标签输入、提示词框） ——
  Password: ["form.css", "input.css"],
  passwordHTML: ["form.css", "input.css"],
  createPassword: ["form.css", "input.css"],
  Email: ["form.css", "input.css"],
  emailHTML: ["form.css", "input.css"],
  createEmail: ["form.css", "input.css"],
  Search: ["form.css", "input.css"],
  searchHTML: ["form.css", "input.css"],
  createSearch: ["form.css", "input.css"],
  CountInput: ["form.css", "input.css"],
  countHTML: ["form.css", "input.css"],
  createCount: ["form.css", "input.css"],
  LongText: ["form.css", "input.css"],
  longTextHTML: ["form.css", "input.css"],
  createLongText: ["form.css", "input.css"],
  Stepper: ["buttons.css", "input.css"],
  createStepper: ["buttons.css", "input.css"],
  defineStepper: ["buttons.css", "input.css"],
  TagInput: ["form.css", "input.css"],
  createTagInput: ["form.css", "input.css"],
  defineTagInput: ["form.css", "input.css"],
  Composer: ["buttons.css", "form.css", "input.css", "overlay.css"],
  composerHTML: ["buttons.css", "form.css", "input.css", "overlay.css"],
  createComposer: ["buttons.css", "form.css", "input.css", "overlay.css"],
  bindInputs: ["form.css", "input.css"],

  // —— 浮层（弹窗、抽屉、菜单、气泡、命令面板） ——
  Dialog: ["buttons.css", "overlay.css"],
  openDialog: ["buttons.css", "overlay.css"],
  closeDialog: ["buttons.css", "overlay.css"],
  wireDialog: ["buttons.css", "overlay.css"],
  Drawer: ["buttons.css", "overlay.css"],
  openDrawer: ["buttons.css", "overlay.css"],
  closeDrawer: ["buttons.css", "overlay.css"],
  Menu: ["buttons.css", "overlay.css"],
  ContextMenu: ["buttons.css", "overlay.css"],
  openMenu: ["buttons.css", "overlay.css"],
  closeMenu: ["buttons.css", "overlay.css"],
  Popover: ["buttons.css", "overlay.css"],
  Popconfirm: ["buttons.css", "overlay.css"],
  openPopover: ["buttons.css", "overlay.css"],
  openPopoverAt: ["buttons.css", "overlay.css"],
  popoverOf: ["buttons.css", "overlay.css"],
  CommandPalette: ["buttons.css", "input.css", "overlay.css", "scroll.css"],
  createCommandPalette: ["buttons.css", "input.css", "overlay.css", "scroll.css"],
  bindOverlays: ["buttons.css", "overlay.css"],

  // —— 反馈（Toast、通知、横幅、进度、加载器、空状态、骨架） ——
  toast: ["buttons.css", "feedback.css"],
  useToast: ["buttons.css", "feedback.css"],
  setToastPos: ["feedback.css"],
  notify: ["buttons.css", "feedback.css"],
  bindBanners: ["feedback.css"],
  closeBanner: ["feedback.css"],
  Progress: ["feedback.css"],
  progressHTML: ["feedback.css"],
  mountProgress: ["feedback.css"],
  createProgressCard: ["buttons.css", "feedback.css"],
  Loader: ["feedback.css"],
  loaderHTML: ["feedback.css"],
  createLoader: ["feedback.css"],
  defineLoader: ["feedback.css"],
  Spinner: ["feedback.css"],
  spinnerHTML: ["feedback.css"],
  EmptyArt: ["feedback.css"],
  emptyArtHTML: ["feedback.css"],
  createEmptyArt: ["feedback.css"],
  defineEmptyArt: ["feedback.css"],
  loadWithSkeleton: ["feedback.css"],

  // —— 数据表格 ——
  Table: ["buttons.css", "form.css", "scroll.css", "table.css", "nav.css"],
  createTable: ["buttons.css", "form.css", "scroll.css", "table.css", "nav.css"],
  tableHTML: ["buttons.css", "form.css", "scroll.css", "table.css", "nav.css"],

  // —— 数据展示（头像、折叠面板、重排） ——
  Avatar: ["display.css"],
  avatarHTML: ["display.css"],
  createAvatar: ["display.css"],
  defineAvatar: ["display.css"],
  Collapse: ["display.css"],
  createCollapse: ["display.css"],
  bindCollapses: ["display.css"],
  defineCollapse: ["display.css"],
  createReorder: ["display.css"],

  // —— 媒体与上传 ——
  Lightbox: ["buttons.css", "media.css"],
  openLightbox: ["buttons.css", "media.css"],
  closeLightbox: ["buttons.css", "media.css"],
  Player: ["buttons.css", "media.css"],
  createPlayer: ["buttons.css", "media.css"],
  AudioPlayer: ["buttons.css", "media.css"],
  createAudio: ["buttons.css", "media.css"],
  Upload: ["buttons.css", "media.css"],
  createUpload: ["buttons.css", "media.css"],

  // —— 导航（标签页、分页、步骤、侧栏） ——
  Tabs: ["nav.css"],
  createTabs: ["nav.css"],
  defineTabs: ["nav.css"],
  Pager: ["buttons.css", "nav.css"],
  createPager: ["buttons.css", "nav.css"],
  definePager: ["buttons.css", "nav.css"],
  Steps: ["nav.css"],
  stepsHTML: ["nav.css"],
  setStep: ["nav.css"],
  Sidebar: ["buttons.css", "scroll.css", "nav.css"],
  createSidebar: ["buttons.css", "scroll.css", "nav.css"],

  // —— 布局（顶栏、侧栏、滚动区域、浏览器标签页） ——
  Header: ["buttons.css", "header.css"],
  createHeader: ["buttons.css", "header.css"],
  headerHTML: ["buttons.css", "header.css"],
  mountHeader: ["buttons.css", "header.css"],
  ScrollArea: ["scroll.css"],
  createScrollArea: ["scroll.css"],
  InfiniteList: ["buttons.css", "scroll.css", "list.css"],
  createInfiniteList: ["buttons.css", "scroll.css", "list.css"],
  DatePicker: ["buttons.css", "form.css", "overlay.css", "picker.css"],
  createPicker: ["buttons.css", "form.css", "overlay.css", "picker.css"],
  bindPickers: ["buttons.css", "form.css", "overlay.css", "picker.css"],
  NumberFlow: ["number.css"],
  createNumberFlow: ["number.css"],
  defineNumberFlow: ["number.css"],
  createCarousel: ["buttons.css", "carousel.css"],
  carouselHTML: ["buttons.css", "carousel.css"],
  mountCarousel: ["buttons.css", "carousel.css"],
  bindVolumetric: ["volumetric.css"],
  createBrowserTabs: ["buttons.css", "shell.css"],
  browserTabsHTML: ["buttons.css", "shell.css"],
  mountBrowserTabs: ["buttons.css", "shell.css"],

  // —— 重组件符号（通过重组件子路径导入或 Resolver 使用） ——
  DataGrid: ["buttons.css", "form.css", "input.css", "overlay.css", "scroll.css", "display.css", "grid.css"],
  CanvasGrid: ["buttons.css", "form.css", "input.css", "overlay.css", "scroll.css", "display.css", "grid.css"],
  AreaChart: ["charts.css"],
  BarChart: ["charts.css"],
  DonutChart: ["charts.css"],
  Chart3D: ["charts.css"],
  Sparkline: ["charts.css"],
  Icon3D: ["charts.css"],
  Chat: ["buttons.css", "input.css", "overlay.css", "feedback.css", "scroll.css", "display.css", "media.css", "md.css", "chat.css"],
  ThreadRail: ["chat.css"],
  Flow: ["buttons.css", "overlay.css", "flow.css"],
  Markdown: ["buttons.css", "scroll.css", "media.css", "md.css"],
  Tree: ["buttons.css", "form.css", "input.css", "overlay.css", "scroll.css", "tree.css"],
  FileExplorer: ["buttons.css", "form.css", "input.css", "overlay.css", "scroll.css", "tree.css"],
};

/** 触发全量样式兜底的符号（如 HTML 渐进增强、全量 Vue 插件、全量自定义元素注册） */
const FULL_CSS_SYMBOLS = new Set(["enhance", "vEnhance", "defineElements", "defineEnhance"]);

/** Vue 组件名 → 所在子路径（供 satinResolver 自动按需解析 <SnButton> / <SnDataGrid> / <SnAreaChart> 等） */
export const VUE_COMPONENT_ENTRIES = {
  // 轻组件（satin-ui/vue）
  Avatar: "satin-ui/vue",
  Button: "satin-ui/vue",
  Checkbox: "satin-ui/vue",
  Chip: "satin-ui/vue",
  Collapse: "satin-ui/vue",
  Composer: "satin-ui/vue",
  CountInput: "satin-ui/vue",
  DatePicker: "satin-ui/vue",
  Dialog: "satin-ui/vue",
  Drawer: "satin-ui/vue",
  Email: "satin-ui/vue",
  EmptyArt: "satin-ui/vue",
  Field: "satin-ui/vue",
  Icon: "satin-ui/vue",
  Input: "satin-ui/vue",
  Loader: "satin-ui/vue",
  LongText: "satin-ui/vue",
  NumberFlow: "satin-ui/vue",
  Otp: "satin-ui/vue",
  Pager: "satin-ui/vue",
  Password: "satin-ui/vue",
  Progress: "satin-ui/vue",
  Radio: "satin-ui/vue",
  Search: "satin-ui/vue",
  Segmented: "satin-ui/vue",
  Select: "satin-ui/vue",
  Slider: "satin-ui/vue",
  Spinner: "satin-ui/vue",
  Stepper: "satin-ui/vue",
  Steps: "satin-ui/vue",
  Switch: "satin-ui/vue",
  Table: "satin-ui/vue",
  Tabs: "satin-ui/vue",
  TagInput: "satin-ui/vue",
  Text: "satin-ui/vue",
  ThemeScope: "satin-ui/vue",
  Tooltip: "satin-ui/vue",
  // 扩展轻组件（satin-ui/vue 同样再导出）
  Menu: "satin-ui/vue",
  ContextMenu: "satin-ui/vue",
  Popover: "satin-ui/vue",
  Popconfirm: "satin-ui/vue",
  CommandPalette: "satin-ui/vue",
  Lightbox: "satin-ui/vue",
  Upload: "satin-ui/vue",
  Sidebar: "satin-ui/vue",
  InfiniteList: "satin-ui/vue",
  ScrollArea: "satin-ui/vue",
  Player: "satin-ui/vue",
  AudioPlayer: "satin-ui/vue",
  // 重组件（自动导向各自独立子路径）
  DataGrid: "satin-ui/vue/grid",
  CanvasGrid: "satin-ui/vue/canvas-grid",
  AreaChart: "satin-ui/vue/charts",
  BarChart: "satin-ui/vue/charts",
  DonutChart: "satin-ui/vue/charts",
  Chart3D: "satin-ui/vue/charts",
  Sparkline: "satin-ui/vue/charts",
  Icon3D: "satin-ui/vue/charts",
  Chat: "satin-ui/vue/chat",
  ThreadRail: "satin-ui/vue/chat",
  Flow: "satin-ui/vue/flow",
  Markdown: "satin-ui/vue/markdown",
  Tree: "satin-ui/vue/tree",
  FileExplorer: "satin-ui/vue/tree",
};

/** 忽略非 UI 样式子路径（如纯主题数据、图标、语言包、vite 插件等） */
const NON_STYLE_SUBPATHS = /^satin-ui\/(css|dist|tokens|locales|icons|svg|theme|theme-boot|theme-boot-script|vite|style-map|resolver|package\.json)(\/|$)/;

/**
 * 解析单条 satin-ui import 所需的 CSS 分片文件名（不含 tokens/reset/base，也不含 satin-ui/css/ 前缀）。
 * @param {string} specifier 模块路径，如 "satin-ui/react"、"satin-ui/react/grid"、"satin-ui/svelte/Select.svelte"
 * @param {string[]} [names] 导入的具名符号列表；传 ["*"] 表示命名空间导入，传 ["default"] 表示默认导入
 * @returns {{ files: string[], matched: boolean }}
 */
export function resolveImportStyles(specifier, names = []) {
  if (!specifier || (specifier !== "satin-ui" && !specifier.startsWith("satin-ui/"))) {
    return { files: [], matched: false };
  }
  if (NON_STYLE_SUBPATHS.test(specifier)) {
    return { files: [], matched: false };
  }
  if (SUBPATH_STYLES[specifier]) {
    return { files: SUBPATH_STYLES[specifier], matched: true };
  }
  if (specifier.startsWith("satin-ui/svelte/")) {
    const file = specifier.slice("satin-ui/svelte/".length);
    const list = SVELTE_STYLES[file];
    return { files: list ?? ALL_COMPONENT_CSS, matched: true };
  }
  // 主入口 / components / react / vue / elements / setup
  if (specifier === "satin-ui/setup") return { files: ["overlay.css"], matched: true };
  const out = new Set();
  let matched = false;
  for (const name of names) {
    if (name === "*" || FULL_CSS_SYMBOLS.has(name) || (name === "default" && specifier === "satin-ui/vue")) {
      return { files: ALL_COMPONENT_CSS, matched: true };
    }
    const list = SYMBOL_STYLES[name];
    if (list) {
      matched = true;
      for (const f of list) out.add(f);
    }
  }
  return { files: [...out], matched };
}

/**
 * 合并多条导入解析结果，按标准层叠顺序返回完整 CSS 导入路径列表（如 "satin-ui/css/tokens.css"）。
 * @param {Array<{ specifier: string, names?: string[] }>} entries
 * @param {{ base?: boolean, reset?: boolean, prefix?: string }} [options]
 * @returns {string[]}
 */
export function resolveStyles(entries, { base = true, reset = false, prefix = "satin-ui/css/" } = {}) {
  const set = new Set();
  let anyMatched = false;
  for (const e of entries) {
    const { files, matched } = resolveImportStyles(e.specifier, e.names);
    if (matched) anyMatched = true;
    for (const f of files) set.add(f);
  }
  if (!anyMatched && set.size === 0) return [];
  if (base) {
    set.add("tokens.css");
    if (reset) set.add("reset.css");
    set.add("base.css");
  }
  return [...set]
    .sort((a, b) => (ORDER_IDX.get(a) ?? 999) - (ORDER_IDX.get(b) ?? 999))
    .map((f) => `${prefix}${f}`);
}

/**
 * 按单个组件/符号名获取其依赖的完整 CSS 路径列表（供 unplugin Resolver、CLI 与工具脚本使用）。
 * @param {string} name 组件或函数名，如 "Button"、"DataGrid"、"createSelect"
 * @param {{ base?: boolean, reset?: boolean, prefix?: string }} [options]
 */
export function stylesForSymbol(name, { base = true, reset = false, prefix = "satin-ui/css/" } = {}) {
  const list = SYMBOL_STYLES[name];
  if (!list) return [];
  const set = new Set(list);
  if (base) {
    set.add("tokens.css");
    if (reset) set.add("reset.css");
    set.add("base.css");
  }
  return [...set]
    .sort((a, b) => (ORDER_IDX.get(a) ?? 999) - (ORDER_IDX.get(b) ?? 999))
    .map((f) => `${prefix}${f}`);
}
