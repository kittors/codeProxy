import { useEffect, useState } from "react";
import { imageGenerationApi } from "@code-proxy/api-client";
import { buildImageModelCatalog, type ImageModelCatalog } from "@features/image-model-picker";

export interface ImageGenerationChannelsState {
  loading: boolean;
  /** Channel names that can serve the image model, as reported by the server. */
  channels: string[];
  /** True when availability could not be determined, which is not the same as "no channels". */
  failed: boolean;
  /** Providers and models the tenant can actually use, derived from the same response. */
  catalog: ImageModelCatalog;
}

const EMPTY_CATALOG: ImageModelCatalog = { providers: [], models: [], legacy: false };

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
    catalog: EMPTY_CATALOG,
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await imageGenerationApi.getChannels();
        if (cancelled) return;
        setState({
          loading: false,
          channels: response.channels ?? [],
          failed: false,
          catalog: buildImageModelCatalog(response),
        });
      } catch {
        // A failed lookup must not masquerade as "no channels configured": the two need
        // different guidance, and conflating them is what made the original bug invisible.
        if (!cancelled) {
          setState({ loading: false, channels: [], failed: true, catalog: EMPTY_CATALOG });
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
