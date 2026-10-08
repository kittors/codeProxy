import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Zap, Loader2 } from "lucide-react";
import { Button, HoverTooltip, toast } from "@code-proxy/ui";
import { authFilesApi } from "@code-proxy/api-client";
import type { AuthFileItem } from "@code-proxy/domain";

interface AuthFileWarmupButtonProps {
  file: AuthFileItem;
  actionSize: "xs" | "sm";
  actionIconSize: number;
}

export function AuthFileWarmupButton({ file, actionSize, actionIconSize }: AuthFileWarmupButtonProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  return (
    <HoverTooltip content={t("antigravity_quota.warmup")}>
      <Button
        variant="ghost"
        size={actionSize}
        disabled={loading}
        onClick={() => {
          setLoading(true);
          const key = String(file.id || file.name);
          authFilesApi
            .runWarmup(key)
            .then(() => toast.success(t("antigravity_quota.warmup_success")))
            .catch((e: unknown) =>
              toast.error(
                t("antigravity_quota.warmup_failed", { message: String(e) }),
              ),
            )
            .finally(() => {
              setLoading(false);
            });
        }}
        title={t("antigravity_quota.warmup")}
        aria-label={t("antigravity_quota.warmup")}
      >
        {loading ? (
          <Loader2 size={actionIconSize} className="animate-spin" />
        ) : (
          <Zap size={actionIconSize} />
        )}
      </Button>
    </HoverTooltip>
  );
}
