/**
 * Static API reference shown on the image-generation page.
 *
 * Pure data: entries carry translation keys rather than translated strings, so this
 * module stays free of React and i18n wiring. It lives apart from the page
 * component because that file is at its frozen line budget and may only shrink.
 */

export type SpecRow = {
  name: string;
  type: string;
  required: boolean;
  descriptionKey: string;
  defaultValue?: string;
};

export type EndpointDoc = {
  mode: "generations" | "edits";
  titleKey: string;
  descriptionKey: string;
  method: string;
  path: string;
  contentType: string;
  requestRows: SpecRow[];
  responseRows: SpecRow[];
  curl: string;
};

/** Image editing is served by every currently supported provider. */
export const IMAGE_EDITS_ENABLED = true;

const textToImageCurl = [
  "curl http://127.0.0.1:8317/v1/images/generations \\",
  '  -H "Authorization: Bearer $API_KEY" \\',
  '  -H "Content-Type: application/json" \\',
  "  -d '{",
  '    "model": "gpt-image-2",',
  '    "prompt": "你的中文描述",',
  '    "size": "1024x1024",',
  '    "quality": "high",',
  '    "n": 1',
  "  }'",
].join("\n");

const imageToImageCurl = [
  "curl http://127.0.0.1:8317/v1/images/edits \\",
  '  -H "Authorization: Bearer $API_KEY" \\',
  '  -F "model=gpt-image-2" \\',
  '  -F "prompt=把这张图改成蓝色图标风格" \\',
  '  -F "size=1024x1024" \\',
  '  -F "quality=high" \\',
  '  -F "n=1" \\',
  '  -F "image=@/path/to/image.png"',
].join("\n");

export const RESPONSE_ROWS: SpecRow[] = [
  {
    name: "created",
    type: "number",
    required: false,
    descriptionKey: "image_generation.response_created_desc",
  },
  {
    name: "data[].b64_json",
    type: "string",
    required: true,
    descriptionKey: "image_generation.response_b64_desc",
  },
  {
    name: "data[].revised_prompt",
    type: "string",
    required: false,
    descriptionKey: "image_generation.response_revised_prompt_desc",
  },
];

const ENDPOINT_DOCS: EndpointDoc[] = [
  {
    mode: "generations",
    titleKey: "image_generation.text_to_image_title",
    descriptionKey: "image_generation.text_to_image_desc",
    method: "POST",
    path: "/v1/images/generations",
    contentType: "application/json",
    requestRows: [
      {
        name: "model",
        type: "string",
        required: true,
        descriptionKey: "image_generation.param_model_desc",
      },
      {
        name: "prompt",
        type: "string",
        required: true,
        descriptionKey: "image_generation.param_prompt_desc",
      },
      {
        name: "size",
        type: "string",
        required: false,
        descriptionKey: "image_generation.param_size_desc",
      },
      {
        name: "quality",
        type: "string",
        required: false,
        descriptionKey: "image_generation.param_quality_desc",
      },
      {
        name: "n",
        type: "number",
        required: false,
        descriptionKey: "image_generation.param_n_desc",
      },
    ],
    responseRows: RESPONSE_ROWS,
    curl: textToImageCurl,
  },
  {
    mode: "edits",
    titleKey: "image_generation.image_to_image_title",
    descriptionKey: "image_generation.image_to_image_desc",
    method: "POST",
    path: "/v1/images/edits",
    contentType: "multipart/form-data",
    requestRows: [
      {
        name: "model",
        type: "string",
        required: true,
        descriptionKey: "image_generation.param_model_desc",
      },
      {
        name: "prompt",
        type: "string",
        required: true,
        descriptionKey: "image_generation.param_edit_prompt_desc",
      },
      {
        name: "image",
        type: "file",
        required: true,
        descriptionKey: "image_generation.param_images_desc",
      },
      {
        name: "size",
        type: "string",
        required: false,
        descriptionKey: "image_generation.param_size_desc",
      },
      {
        name: "quality",
        type: "string",
        required: false,
        descriptionKey: "image_generation.param_quality_desc",
      },
      {
        name: "n",
        type: "number",
        required: false,
        descriptionKey: "image_generation.param_n_desc",
      },
    ],
    responseRows: RESPONSE_ROWS,
    curl: imageToImageCurl,
  },
];
export const VISIBLE_ENDPOINT_DOCS = IMAGE_EDITS_ENABLED
  ? ENDPOINT_DOCS
  : ENDPOINT_DOCS.filter((doc) => doc.mode === "generations");
