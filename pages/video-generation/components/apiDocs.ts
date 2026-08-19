/**
 * Static API reference shown on the video-generation page.
 *
 * Pure data: entries carry translation keys rather than translated strings, so this
 * module stays free of React and i18n wiring.
 *
 * The two-step shape is deliberate and mirrors the upstream: a clip takes minutes
 * to render, so the submit call answers with a request id and the caller polls.
 */

export type SpecRow = {
  name: string;
  type: string;
  required: boolean;
  descriptionKey: string;
  defaultValue?: string;
};

export type VideoEndpointDoc = {
  mode: "text" | "image";
  titleKey: string;
  descriptionKey: string;
  method: string;
  path: string;
  contentType: string;
  requestRows: SpecRow[];
  responseRows: SpecRow[];
  curl: string;
};

export const VIDEO_STATUS_PATH = "/v1/videos/{request_id}";

const textToVideoCurl = [
  "# 1. 提交生成任务，拿到 request_id",
  "curl http://127.0.0.1:8317/v1/videos/generations \\",
  '  -H "Authorization: Bearer $API_KEY" \\',
  '  -H "Content-Type: application/json" \\',
  "  -d '{",
  '    "model": "grok-imagine-video-1.5",',
  '    "prompt": "日落时分的海浪，镜头缓慢拉远",',
  '    "duration": 10,',
  '    "aspect_ratio": "16:9",',
  '    "resolution": "720p"',
  "  }'",
  "",
  "# 2. 轮询任务状态，status 为 done 时取 video.url",
  'curl http://127.0.0.1:8317/v1/videos/$REQUEST_ID \\',
  '  -H "Authorization: Bearer $API_KEY"',
].join("\n");

const imageToVideoCurl = [
  "# 图生视频：附上源图，模型以它作为首帧",
  "curl http://127.0.0.1:8317/v1/videos/generations \\",
  '  -H "Authorization: Bearer $API_KEY" \\',
  '  -H "Content-Type: application/json" \\',
  "  -d '{",
  '    "model": "grok-imagine-video-1.5",',
  '    "prompt": "让瀑布流动起来，镜头缓慢拉远",',
  '    "image": { "url": "https://example.com/still.png" },',
  '    "duration": 12',
  "  }'",
  "",
  "# 同样轮询 request_id",
  'curl http://127.0.0.1:8317/v1/videos/$REQUEST_ID \\',
  '  -H "Authorization: Bearer $API_KEY"',
].join("\n");

const sharedResponseRows: SpecRow[] = [
  { name: "request_id", type: "string", required: false, descriptionKey: "response_request_id_desc" },
  { name: "status", type: "string", required: false, descriptionKey: "response_status_desc" },
  { name: "video.url", type: "string", required: false, descriptionKey: "response_video_url_desc" },
  {
    name: "video.duration",
    type: "number",
    required: false,
    descriptionKey: "response_video_duration_desc",
  },
];

export const VIDEO_ENDPOINT_DOCS: VideoEndpointDoc[] = [
  {
    mode: "text",
    titleKey: "text_to_video_title",
    descriptionKey: "text_to_video_desc",
    method: "POST",
    path: "/v1/videos/generations",
    contentType: "application/json",
    requestRows: [
      { name: "model", type: "string", required: true, descriptionKey: "param_model_desc" },
      { name: "prompt", type: "string", required: true, descriptionKey: "param_prompt_desc" },
      {
        name: "duration",
        type: "number",
        required: false,
        descriptionKey: "param_duration_desc",
        defaultValue: "6",
      },
      {
        name: "aspect_ratio",
        type: "string",
        required: false,
        descriptionKey: "param_aspect_ratio_desc",
        defaultValue: "16:9",
      },
      {
        name: "resolution",
        type: "string",
        required: false,
        descriptionKey: "param_resolution_desc",
        defaultValue: "480p",
      },
    ],
    responseRows: sharedResponseRows,
    curl: textToVideoCurl,
  },
  {
    mode: "image",
    titleKey: "image_to_video_title",
    descriptionKey: "image_to_video_desc",
    method: "POST",
    path: "/v1/videos/generations",
    contentType: "application/json",
    requestRows: [
      { name: "model", type: "string", required: true, descriptionKey: "param_model_desc" },
      { name: "prompt", type: "string", required: true, descriptionKey: "param_image_prompt_desc" },
      { name: "image", type: "object | string", required: true, descriptionKey: "param_image_desc" },
      {
        name: "duration",
        type: "number",
        required: false,
        descriptionKey: "param_duration_desc",
        defaultValue: "6",
      },
    ],
    responseRows: sharedResponseRows,
    curl: imageToVideoCurl,
  },
];

export const VIDEO_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"];
export const VIDEO_RESOLUTIONS = ["480p", "720p", "1080p"];
