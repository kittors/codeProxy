import { Feather, Shrimp } from "lucide-react";
import { cn, iconHueClass } from "@code-proxy/ui";
import iconClaude from "@code-proxy/assets/icons/claude.svg";
import iconCodex from "@code-proxy/assets/icons/codex.svg";
import iconGemini from "@code-proxy/assets/icons/gemini.svg";
import iconOpenCodeDark from "@code-proxy/assets/icons/opencode-dark.svg";
import iconOpenCodeLight from "@code-proxy/assets/icons/opencode-light.svg";
import type { CcSwitchClientType } from "@code-proxy/domain/ccswitch/ccswitchClients";

const IMAGE_ICONS: Partial<Record<CcSwitchClientType, string>> = {
  claude: iconClaude,
  codex: iconCodex,
  gemini: iconGemini,
};

/**
 * The app's mark. OpenCode has a light and a dark logo; OpenClaw and Hermes ship no mark in
 * this repo, so they get a glyph that reads as the app (OpenClaw's claw, Hermes' wing) — the
 * way the provider tabs fall back to a terminal or cloud glyph.
 */
export function CcSwitchClientIcon({
  clientType,
  className = "h-4 w-4",
}: {
  clientType: CcSwitchClientType;
  className?: string;
}) {
  const image = IMAGE_ICONS[clientType];
  if (image) {
    return (
      <img
        src={image}
        alt=""
        data-testid={`ccswitch-client-icon-${clientType}`}
        className={`shrink-0 ${className}`}
      />
    );
  }
  if (clientType === "opencode") {
    return (
      <span
        data-testid="ccswitch-client-icon-opencode"
        className={`inline-flex shrink-0 ${className}`}
      >
        <img src={iconOpenCodeLight} alt="" className="h-full w-full dark:hidden" />
        <img src={iconOpenCodeDark} alt="" className="hidden h-full w-full dark:block" />
      </span>
    );
  }
  const Glyph = clientType === "openclaw" ? Shrimp : Feather;
  return (
    <Glyph
      aria-hidden="true"
      data-testid={`ccswitch-client-icon-${clientType}`}
      // 「多彩」图标着色时按全站的图标色相上色，「单色」时保持中性。
      className={cn("shrink-0 text-ink-2", iconHueClass(Glyph), className)}
    />
  );
}
