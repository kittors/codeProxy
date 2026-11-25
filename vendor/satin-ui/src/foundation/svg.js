// 把一个图标（satin-ui/icons 的具名导出：SVG 里面的那几段 path）包成 <svg class="sn-ic">。和 icon(名字) 生成的一模一样，只是不用查名字表
export const svg = (paths, size = 16, name = "") => `<svg class="sn-ic"${name ? ` data-icon="${name}"` : ""} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
