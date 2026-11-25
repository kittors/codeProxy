<!-- 空状态场景插画：<EmptyArt name="projects" />（projects / search / error / inbox / folder / lock） -->
<script>
  import { emptyArtSvg } from "../src/feedback/empty-art.js";

  let { name = "projects", label = undefined, class: className = "", ...rest } = $props();
</script>

<span {...rest} class={className ? `sn-empty-art ${className}` : "sn-empty-art"} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : "true"}>{@html emptyArtSvg(name)}</span>
