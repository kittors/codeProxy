import "satin-ui/css/md.css";
import { Markdown } from "satin-ui/react/markdown";

/**
 * 基于 Satin `<Markdown />`（零第三方依赖）的富文本渲染器：
 * 内置 GFM 表格、语法高亮、行号、一键复制、长代码块折展、XSS 白名单过滤与图片放大预览。
 */
export function RichMarkdown({ proseClasses, text }: { proseClasses: string; text: string }) {
  return (
    <div className={proseClasses}>
      <Markdown source={text} />
    </div>
  );
}
