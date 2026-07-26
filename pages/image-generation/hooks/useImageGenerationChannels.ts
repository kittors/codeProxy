import { useEffect, useState } from "react";
import { imageGenerationApi } from "@code-proxy/api-client";

export interface ImageGenerationChannelsState {
  loading: boolean;
  /** Channel names that can serve the image model, as reported by the server. */
  channels: string[];
  /** True when availability could not be determined, which is not the same as "no channels". */
  failed: boolean;
}

/**
 * Loads image-generation channel availability from the dedicated management endpoint.
 *
 * The page previously derived this from the auth-files list and filtered client-side for
 * `account_type === "oauth" && provider === "codex"`. That coupled the page to the
 * `auth_files.read` permission even though the page itself is granted by
 * `image_generation.read`, so a role holding only the latter got a 403 that was swallowed
 * and rendered as "no channels available" regardless of configuration.
 *
 * `/image-generation/channels` is guarded by `image_generation.read` and already filters
 * out disabled channels server-side, so availability now matches what the backend would
 * actually route to.
 */
export function useImageGenerationChannels(): ImageGenerationChannelsState {
  const [state, setState] = useState<ImageGenerationChannelsState>({
    loading: true,
    channels: [],
    failed: false,
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await imageGenerationApi.getChannels();
        if (cancelled) return;
        setState({ loading: false, channels: response.channels ?? [], failed: false });
      } catch {
        // A failed lookup must not masquerade as "no channels configured": the two need
        // different guidance, and conflating them is what made the original bug invisible.
        if (!cancelled) {
          setState({ loading: false, channels: [], failed: true });
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
