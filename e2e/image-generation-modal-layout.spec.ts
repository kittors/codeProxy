import { deflateSync } from "node:zlib";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Layout of the image test dialog, in a real browser.
 *
 * The bugs this covers only show up with real layout, which jsdom does not do:
 * a long model name pushed its selector out of its grid column and over the next
 * control, and a generated image took its height from its own aspect ratio, so a
 * 1:8 strip filled the canvas with its top slice and an 8:1 banner hugged the top
 * edge. The dialog must keep its shape whatever comes back.
 */

const RATIOS = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "5:4",
  "4:5",
  "21:9",
  "4:1",
  "1:4",
  "8:1",
  "1:8",
];

// A solid-colour PNG of the given size, built here so the spec carries no binary
// fixtures. Only the dimensions matter to the layout under test.
function solidPng(width: number, height: number): string {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x5a)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}

const tenant = {
  id: "t-1",
  slug: "design",
  name: "Design",
  type: "standard",
  status: "active",
  effective_status: "active",
  expires_at: null,
  description: "",
  version: 1,
  created_at: "",
  updated_at: "",
};

async function openDialog(page: Page, result: { width: number; height: number }) {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "cps_test",
        rememberPassword: false,
        expiresAt: Date.now() + 3_600_000,
      }),
    );
    localStorage.setItem(
      "cli-proxy-language",
      JSON.stringify({ language: "zh-CN", state: { language: "zh-CN" } }),
    );
  });
  await page.route("**/v0/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        principal: {
          kind: "user_session",
          user: {
            id: "u-admin",
            tenant_id: "t-1",
            username: "admin",
            display_name: "Super Administrator",
            status: "active",
            must_change_password: false,
            last_login_at: null,
            role_ids: ["r"],
            role_codes: ["platform_super_admin"],
            version: 1,
            created_at: "",
            updated_at: "",
          },
          home_tenant: tenant,
          effective_tenant: tenant,
          roles: [],
          permissions: ["system.config.read", "dashboard.read"],
          platform_admin: true,
        },
      }),
    }),
  );
  // Registered first so the specific routes below take precedence.
  await page.route("**/v0/management/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.route("**/v0/management/image-generation/channels", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        model: "gpt-image-2",
        channels: ["law010922@gmail.com"],
        providers: [
          {
            provider: "antigravity",
            channels: ["law010922@gmail.com"],
            models: ["gemini-3.1-flash-image"],
          },
        ],
        models: [
          {
            id: "gemini-3.1-flash-image",
            provider: "antigravity",
            display_name: "Gemini 3.1 Flash Image",
            supports_edit: true,
            aspect_ratios: RATIOS,
            image_sizes: ["512", "1K", "2K", "4K"],
          },
        ],
      }),
    }),
  );
  await page.route("**/v0/management/image-generation/test", (route) =>
    route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ task_id: "task-1", status: "queued" }),
    }),
  );
  await page.route("**/v0/management/image-generation/test/task-1", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        task_id: "task-1",
        status: "succeeded",
        phase: "completed",
        result: {
          created: 1,
          data: [{ b64_json: solidPng(result.width, result.height) }],
          output_format: "png",
        },
      }),
    }),
  );

  await page.goto("/#/models/image-generation");
  const open = page.getByRole("button", { name: "测试生成" });
  await expect(open).toBeEnabled();
  await open.click();
  const dialog = page.getByRole("dialog", { name: "测试生成" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  if (!value) throw new Error("element has no layout box");
  return value;
}

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) =>
  a.x < b.x + b.width - 0.5 &&
  b.x < a.x + a.width - 0.5 &&
  a.y < b.y + b.height - 0.5 &&
  b.y < a.y + a.height - 0.5;

for (const viewport of [
  { width: 1470, height: 720 },
  { width: 1280, height: 720 },
]) {
  test(`controls never overlap at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const dialog = await openDialog(page, { width: 64, height: 64 });
    const comboboxes = dialog.getByRole("combobox");
    await expect(comboboxes).toHaveCount(4);
    const boxes = await Promise.all((await comboboxes.all()).map(box));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlaps(boxes[i], boxes[j]), `combobox ${i} overlaps combobox ${j}`).toBe(false);
      }
    }
  });

  for (const shape of [
    // Larger than the canvas in their long dimension, like every real result, so
    // the image has to be scaled down to fit.
    { name: "1:8 strip", width: 120, height: 960 },
    { name: "8:1 banner", width: 960, height: 120 },
  ]) {
    test(`a ${shape.name} fits the canvas and keeps the dialog's size at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const dialog = await openDialog(page, shape);
      const stage = dialog.getByTestId("image-generation-stage");
      const before = { dialog: await box(dialog), stage: await box(stage) };

      await dialog.getByRole("textbox", { name: "提示词" }).fill("a lighthouse");
      await dialog.getByRole("button", { name: "生成图片" }).click();
      const image = stage.getByRole("img");
      await expect(image).toBeVisible();
      await expect(dialog.getByTestId("image-generation-pixel-size")).toHaveText(
        `${shape.width} × ${shape.height} · PNG`,
      );

      const after = { dialog: await box(dialog), stage: await box(stage), image: await box(image) };
      expect(after.dialog.height).toBeCloseTo(before.dialog.height, 0);
      expect(after.stage.height).toBeCloseTo(before.stage.height, 0);
      expect(after.image.x).toBeGreaterThanOrEqual(after.stage.x);
      expect(after.image.y).toBeGreaterThanOrEqual(after.stage.y);
      expect(after.image.x + after.image.width).toBeLessThanOrEqual(
        after.stage.x + after.stage.width + 0.5,
      );
      expect(after.image.y + after.image.height).toBeLessThanOrEqual(
        after.stage.y + after.stage.height + 0.5,
      );
      // Centred: an 8:1 banner used to hug the top edge over a band of empty canvas.
      const centre = (b: { x: number; y: number; width: number; height: number }) => ({
        x: b.x + b.width / 2,
        y: b.y + b.height / 2,
      });
      expect(Math.abs(centre(after.image).x - centre(after.stage).x)).toBeLessThan(2);
      expect(Math.abs(centre(after.image).y - centre(after.stage).y)).toBeLessThan(2);
      // Scaled up to use the canvas, not left at its natural size in a corner.
      expect(
        Math.max(after.image.width / after.stage.width, after.image.height / after.stage.height),
      ).toBeGreaterThan(0.8);
    });
  }
}
