import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  imageGenerationApi,
  type ImageEditTestRequest,
  type ImageGenerationTestRequest,
} from "@code-proxy/api-client";

/**
 * 一次测试生成的生命周期：提交任务 → 轮询 → 拿到图片或错误，外加「进行中」的阶段文案与计时。
 *
 * 从 ImageGenerationPageContent 拆出（那个文件卡在行数棘轮上），逻辑原样搬过来。
 * 每次生成和每次重新打开弹窗都换一个会话号：关掉弹窗后旧任务的轮询结果不会再写回界面。
 */

export type GeneratedImage = { src: string; revisedPrompt?: string };

export const GENERATION_STATUS_KEYS = [
  "image_generation.generation_status_drafting",
  "image_generation.generation_status_creating",
  "image_generation.generation_status_refining",
  "image_generation.generation_status_starting",
] as const;
const GENERATION_STATUS_INTERVAL_MS = 1800;
const IMAGE_GENERATION_TASK_POLL_INTERVAL_MS = 1200;
const IMAGE_GENERATION_PHASE_STATUS_INDEX: Record<string, number> = {
  queued: 0,
  bootstrap: 0,
  chat_requirements: 0,
  conversation_init: 0,
  conversation_prepare: 0,
  conversation_request: 1,
  conversation_stream: 1,
  conversation_poll: 2,
  image_download: 3,
  completed: 3,
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function extractImageGenerationTaskError(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const body =
    "body" in error && error.body && typeof error.body === "object"
      ? (error.body as Record<string, unknown>)
      : null;
  const nested =
    body?.error && typeof body.error === "object" && !Array.isArray(body.error)
      ? (body.error as Record<string, unknown>)
      : null;
  const message = nested?.message;
  return typeof message === "string" && message.trim() ? message.trim() : null;
}

export function formatGenerationElapsed(ms: number | null): string | null {
  if (ms === null) return null;
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function useImageGenerationTask(open: boolean) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusIndex, setStatusIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const generationStartedAtRef = useRef<number | null>(null);
  const generationSessionRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    generationSessionRef.current += 1;
    setSubmitting(false);
    setImages([]);
    setActiveImageIndex(0);
    setErrorMessage("");
    setStatusIndex(0);
    setElapsedMs(null);
    generationStartedAtRef.current = null;
  }, [open]);

  useEffect(() => {
    if (!submitting) return;

    setStatusIndex(0);
    const id = window.setInterval(() => {
      setStatusIndex((current) => {
        if (current >= GENERATION_STATUS_KEYS.length - 1) {
          window.clearInterval(id);
          return current;
        }
        return current + 1;
      });
    }, GENERATION_STATUS_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [submitting]);

  useEffect(() => {
    if (!submitting || generationStartedAtRef.current === null) return;

    const updateElapsed = () => {
      if (generationStartedAtRef.current === null) return;
      setElapsedMs(Date.now() - generationStartedAtRef.current);
    };

    updateElapsed();
    const id = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(id);
  }, [submitting]);

  const generate = useCallback(
    async (payload: ImageGenerationTestRequest | ImageEditTestRequest) => {
      const sessionId = generationSessionRef.current + 1;
      generationSessionRef.current = sessionId;
      generationStartedAtRef.current = Date.now();
      setElapsedMs(0);
      setSubmitting(true);
      setImages([]);
      setActiveImageIndex(0);
      setErrorMessage("");

      try {
        const startTask = await imageGenerationApi.startTestTask(payload);
        if (generationSessionRef.current !== sessionId) return;
        if (!startTask.task_id) {
          throw new Error(t("image_generation.test_failed_generic"));
        }

        let task = await imageGenerationApi.getTestTask(startTask.task_id);
        while (generationSessionRef.current === sessionId) {
          const phaseIndex =
            task.phase && task.phase in IMAGE_GENERATION_PHASE_STATUS_INDEX
              ? IMAGE_GENERATION_PHASE_STATUS_INDEX[task.phase]
              : null;
          if (phaseIndex !== null) {
            setStatusIndex((current) => Math.max(current, phaseIndex));
          }

          if (task.status === "succeeded") {
            if (!task.result) {
              throw new Error(t("image_generation.test_empty_result"));
            }
            const nextImages = (task.result.data ?? [])
              .map<GeneratedImage | null>((item) => {
                const b64Json = item.b64_json?.trim() ?? "";
                if (!b64Json) return null;
                return {
                  src: `data:image/png;base64,${b64Json}`,
                  revisedPrompt: item.revised_prompt?.trim() || undefined,
                };
              })
              .filter((item): item is GeneratedImage => item !== null);

            if (nextImages.length === 0) {
              throw new Error(t("image_generation.test_empty_result"));
            }

            setImages(nextImages);
            setActiveImageIndex(0);
            return;
          }

          if (task.status === "failed") {
            throw new Error(
              extractImageGenerationTaskError(task.error) ??
                t("image_generation.test_failed_generic"),
            );
          }

          await wait(IMAGE_GENERATION_TASK_POLL_INTERVAL_MS);
          if (generationSessionRef.current !== sessionId) return;
          task = await imageGenerationApi.getTestTask(startTask.task_id);
        }
      } catch (error) {
        if (generationSessionRef.current !== sessionId) return;
        setErrorMessage(
          error instanceof Error ? error.message : t("image_generation.test_failed_generic"),
        );
      } finally {
        if (generationSessionRef.current === sessionId) {
          if (generationStartedAtRef.current !== null) {
            setElapsedMs(Date.now() - generationStartedAtRef.current);
          }
          setSubmitting(false);
        }
      }
    },
    [t],
  );

  return {
    submitting,
    images,
    activeImageIndex,
    setActiveImageIndex,
    errorMessage,
    statusKey: GENERATION_STATUS_KEYS[statusIndex],
    elapsedLabel: formatGenerationElapsed(elapsedMs),
    generate,
  };
}
