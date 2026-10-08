import { useTranslation } from "react-i18next";
import { surface } from "@code-proxy/ui";
import { parseJsonObject } from "./parsers";

/**
 * 生图请求（gpt-image-2）的结构化视图：输入拆成「模型 / 提示词 / 参数」，输出只显示图片。
 * 从 LogContentModal 拆出来（那个文件卡在行数棘轮上）；「原始数据」视图仍显示原文。
 */

export type ImageGenerationInputView = {
  model: string;
  prompt: string;
  parameters: Array<{ key: string; value: string }>;
};
export type ImageGenerationOutputImage = { src: string; revisedPrompt?: string };
export type ImageGenerationOutputView = {
  created?: number;
  images: ImageGenerationOutputImage[];
};

function stringifyFieldValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (value === null || value === undefined) return "";
  return JSON.stringify(value, null, 2);
}

export function parseImageGenerationInput(
  raw: string,
): ImageGenerationInputView | null {
  const parsed = parseJsonObject(raw);
  if (!parsed) return null;
  const model = typeof parsed.model === "string" ? parsed.model : "";
  const prompt = typeof parsed.prompt === "string" ? parsed.prompt : "";
  if (!model && !prompt) return null;

  const parameters = Object.entries(parsed)
    .filter(([key]) => key !== "model" && key !== "prompt")
    .map(([key, value]) => ({ key, value: stringifyFieldValue(value) }))
    .filter((item) => item.value);

  return {
    model,
    prompt,
    parameters,
  };
}

export function parseImageGenerationOutput(
  raw: string,
): ImageGenerationOutputView | null {
  const parsed = parseJsonObject(raw);
  if (!parsed || !Array.isArray(parsed.data)) return null;

  const images = parsed.data
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const b64Json =
        typeof record.b64_json === "string" ? record.b64_json.trim() : "";
      if (!b64Json) return null;
      const src = `data:image/png;base64,${b64Json}`;
      const revisedPrompt =
        typeof record.revised_prompt === "string" &&
        record.revised_prompt.trim()
          ? record.revised_prompt.trim()
          : "";
      return revisedPrompt ? { src, revisedPrompt } : { src };
    })
    .filter((item): item is ImageGenerationOutputImage => item !== null);

  if (images.length === 0) return null;

  return {
    created: typeof parsed.created === "number" ? parsed.created : undefined,
    images,
  };
}

export function StructuredRequestCard({
  view,
  testId,
}: {
  view: ImageGenerationInputView;
  testId?: string;
}) {
  const { t } = useTranslation();
  const { model, prompt, parameters } = view;
  // 一块无描边的淡底：模型、提示词、参数之间靠留白分开，参数也不再各套一张描边小卡。
  return (
    <div
      data-testid={testId}
      className={[surface({ tone: "inset", radius: "2xl" }), "px-5 py-4 sm:px-6"].join(" ")}
    >
      <div className="space-y-5">
        {model ? (
          <div>
            <p className="text-xs font-medium text-ink-3">{t("log_content.field_model")}</p>
            <p className="mt-2 break-words text-sm font-semibold text-ink">{model}</p>
          </div>
        ) : null}
        {prompt ? (
          <div>
            <p className="text-xs font-medium text-ink-3">{t("log_content.field_prompt")}</p>
            <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm leading-7 text-ink">
              {prompt}
            </pre>
          </div>
        ) : null}
        {parameters.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-ink-3">{t("log_content.field_parameters")}</p>
            <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {parameters.map((item) => (
                <div key={item.key} className="min-w-0">
                  <p className="font-mono text-xs text-ink-3">{item.key}</p>
                  <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-ink">
                    {item.value}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** 生成结果的一张图：点图或右下角按钮打开大图预览；有修订后的提示词时附在下面。 */
export function OutputImageCard({
  image,
  onPreview,
}: {
  image: ImageGenerationOutputImage;
  onPreview: () => void;
}) {
  const { t } = useTranslation();
  // 图片本身就是内容，不再外面再套一块淡底框：底色只在图片加载出来之前垫在图片位置上。
  return (
    <div className="space-y-2">
      <div className="relative min-h-[160px] overflow-hidden rounded-2xl bg-subtle">
        <img
          src={image.src}
          alt={t("log_content.output")}
          className="block h-auto w-full cursor-zoom-in"
          onClick={onPreview}
        />
        {/* 浮在图片上：固定用半透明黑底白字，任何底色的图上都看得清。 */}
        <button
          type="button"
          onClick={onPreview}
          className="absolute right-3 bottom-3 z-20 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white/90 shadow-sm backdrop-blur transition-colors hover:bg-black/75 hover:text-white"
        >
          {t("image_generation.open_preview")}
        </button>
      </div>
      {image.revisedPrompt ? (
        <div className="px-1">
          <p className="text-xs font-medium text-ink-3">{t("image_generation.revised_prompt_label")}</p>
          <p className="mt-1 text-sm text-ink-2">{image.revisedPrompt}</p>
        </div>
      ) : null}
    </div>
  );
}
