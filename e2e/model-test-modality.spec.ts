import { expect, test, type Page } from "@playwright/test";

/**
 * The model catalog probe, in a real browser.
 *
 * The bug this covers: the probe sent a chat completion for every model, so
 * opening it on gpt-image-2.5-flare offered a chat box prefilled with "How is
 * the weather in Los Angeles today?" and reported the resulting prose as a pass.
 * These specs assert the modality-shaped form, the rendered image, and the
 * evidence panels that make a media result checkable.
 */

const IMAGE_MODEL_ID = "gpt-image-2.5-flare";

// A 1x1 PNG. The panel only has to render it; provenance is reported by the
// server, which is mocked below.
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const seedAuth = async (page: Page) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "cps_test",
        rememberPassword: false,
        expiresAt: Date.now() + 60_000,
      }),
    );
    localStorage.setItem(
      "cli-proxy-language",
      JSON.stringify({ language: "zh-CN", state: { language: "zh-CN" } }),
    );
  });
};

const tenant = {
  id: "t-system",
  slug: "system",
  name: "System Administration",
  type: "system",
  status: "active",
  effective_status: "active",
  expires_at: null,
  description: "",
  version: 1,
  created_at: "",
  updated_at: "",
};

const mockApis = async (page: Page) => {
  await page.route("**/v0/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        principal: {
          kind: "user_session",
          user: {
            id: "u-admin",
            tenant_id: "t-system",
            username: "admin",
            display_name: "Super Administrator",
            status: "active",
            must_change_password: false,
            last_login_at: null,
            role_ids: ["r-platform-admin"],
            role_codes: ["platform_super_admin"],
            version: 1,
            created_at: "",
            updated_at: "",
          },
          home_tenant: tenant,
          effective_tenant: tenant,
          roles: [],
          permissions: ["models.read", "models.write", "system.config.read", "dashboard.read"],
          platform_admin: true,
        },
      }),
    }),
  );

  // Order matters: Playwright tries the most recently registered route first, so
  // the catch-all has to be registered before the specific ones it must not shadow.
  await page.route("**/v0/management/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );

  await page.route("**/v0/management/model-configs**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: IMAGE_MODEL_ID,
            owned_by: "openai",
            description: "GPT Image 2.5 Flare",
            enabled: true,
            input_modalities: ["text"],
            output_modalities: ["image"],
            pricing: { mode: "call", price_per_call: 0.04 },
          },
        ],
      }),
    }),
  );

  // Channels come from the availability endpoint; without one the run button
  // stays disabled, exactly as it does for a model no account serves.
  await page.route("**/v0/management/models/configured-availability**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: IMAGE_MODEL_ID,
            owned_by: "openai",
            enabled: true,
            input_modalities: ["text"],
            output_modalities: ["image"],
            sources: [
              {
                label: "codex · jd7@privaterelay.appleid.com",
                provider: "codex",
                channel: "jd7@privaterelay.appleid.com",
                client_id: "codex-1",
              },
            ],
          },
        ],
      }),
    }),
  );

  await page.route("**/v0/management/models/test/options**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        model: IMAGE_MODEL_ID,
        modes: [
          {
            mode: "image",
            default_prompt: "A red ceramic teapot on a white marble table, soft window light",
            requires_image: false,
          },
          {
            mode: "image_edit",
            default_prompt: "Replace the background with a snowy mountain range.",
            requires_image: true,
          },
        ],
        sizes: ["1024x1024", "1792x1024"],
        qualities: ["low", "medium", "high"],
        max_images: 5,
      }),
    }),
  );

  // The probe answers as a task, then the poll returns the finished picture with
  // the provenance the file claims.
  await page.route("**/v0/management/models/test", (route) =>
    route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        mode: "image",
        task_id: "task-1",
        status: "running",
        phase: "generating",
        request: {
          model: IMAGE_MODEL_ID,
          prompt: "A red ceramic teapot on a white marble table, soft window light",
          size: "1024x1024",
          quality: "high",
          n: 1,
        },
      }),
    }),
  );

  await page.route("**/v0/management/models/test/task-1", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        task_id: "task-1",
        status: "succeeded",
        phase: "completed",
        duration_ms: 32113,
        result: {
          kind: "image",
          images: [
            {
              b64_json: TINY_PNG,
              format: "png",
              width: 1024,
              height: 1024,
              bytes: 2097672,
              revised_prompt: "A small red ceramic teapot on polished white marble",
              c2pa: {
                present: true,
                generator: "gpt-image",
                generator_version: "2.0",
                issuer: "OpenAI Media Service API",
                digital_source_type:
                  "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
                actions: ["c2pa.created"],
                fields: [{ key: "name", value: "gpt-image" }],
              },
            },
          ],
        },
        metadata: {
          mode: "image",
          requested_model: IMAGE_MODEL_ID,
          upstream_endpoint: "/v1/images/generations",
          channel: "jd7@privaterelay.appleid.com",
          provenance_model: "gpt-image",
          provenance_version: "2.0",
          provenance_matches: false,
        },
      }),
    }),
  );
};

const openProbe = async (page: Page) => {
  await seedAuth(page);
  await mockApis(page);
  await page.goto("/#/models");
  await page.getByRole("button", { name: `测试 ${IMAGE_MODEL_ID}` }).click();
  return page.getByRole("dialog");
};

test("an image model opens on image generation, not on a chat prompt", async ({ page }) => {
  const dialog = await openProbe(page);

  // Both directions of the image modality are offered.
  await expect(dialog.getByRole("tab", { name: "文生图" })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "图生图" })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "文生图" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // The prompt is the image one, not the weather question the chat probe used.
  const prompt = dialog.getByLabel("测试提示词");
  await expect(prompt).toHaveValue(/teapot/);
  await expect(prompt).not.toHaveValue(/weather/);

  // Image-only controls are present; chat has none of these.
  await expect(dialog.getByLabel("尺寸")).toBeVisible();
  await expect(dialog.getByLabel("质量")).toBeVisible();
  await expect(dialog.getByLabel("数量")).toBeVisible();
});

test("switching to image-to-image asks for a reference frame", async ({ page }) => {
  const dialog = await openProbe(page);
  await dialog.getByRole("tab", { name: "图生图" }).click();

  await expect(dialog.getByText("参考图", { exact: true })).toBeVisible();
  await expect(dialog.getByText("该测试类型至少需要一张参考图。")).toBeVisible();
  // Running an edit with nothing attached would only produce an upstream 400.
  await expect(dialog.getByRole("button", { name: /开始图生图/ })).toBeDisabled();
});

test("renders the generated image, the request sent, and the provenance mismatch", async ({
  page,
}) => {
  const dialog = await openProbe(page);
  await dialog.getByRole("button", { name: /开始文生图/ }).click();

  // The picture itself, not base64 in a text box.
  const images = dialog.getByTestId("model-test-images");
  await expect(images.locator("img")).toBeVisible();
  await expect(images).toContainText("1024×1024");

  // A 2.5 request answered by a 2.0 manifest is called out rather than reported
  // as a clean pass — the endpoint ignores the model field, so this is the only
  // signal that says which model actually served the request.
  const warning = dialog.getByTestId("model-test-provenance-warning");
  await expect(warning).toContainText("gpt-image 2.0");
  await expect(warning).toContainText(IMAGE_MODEL_ID);

  // What was sent, with the credential-free body an operator can paste into a report.
  const request = dialog.getByTestId("model-test-request");
  await request.getByRole("button").click();
  await expect(request).toContainText('"quality": "high"');

  const metadata = dialog.getByTestId("model-test-metadata");
  await metadata.getByRole("button").click();
  await expect(metadata).toContainText("/v1/images/generations");
  await expect(metadata).toContainText("OpenAI Media Service API");
  await expect(metadata).toContainText("trainedAlgorithmicMedia");
});
