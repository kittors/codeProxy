import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * 在途请求每 5 秒刷新一次。以前每次刷新整张表都闪一下：表格按行集合整体重挂，所有行重播入场。
 * 这里在一次真实的刷新里逐帧采样（requestAnimationFrame）每一行的不透明度和位置，断言：
 * - 留下的行任何一帧都不变淡；
 * - 新请求从最上面浮入，旧的往下让；
 * - 结束的请求原地淡出再收起；
 * - 表格不会因为动画冒出滚动条。
 * 设了 INFLIGHT_FRAMES_DIR 时，再用 CDP 截屏流把每一帧存成 JPEG，供逐帧检查。
 */

type Snapshot = { id: string; startedAgoMs: number; stage: string; model: string; path: string; account: string }[];

const BEFORE: Snapshot = [
  { id: "r-old", startedAgoMs: 95_000, stage: "streaming", model: "gpt-6.1-sol", path: "/v1/chat/completions", account: "lanlanjiaxin@proton.me" },
  { id: "r-mid", startedAgoMs: 40_000, stage: "streaming", model: "gpt-6.1-sol", path: "/v1/responses", account: "rojasteresita717@gmail.com" },
  { id: "r-done", startedAgoMs: 21_000, stage: "first_token", model: "gpt-6.1-terra", path: "/v1/chat/completions", account: "jd7njnb5nh@privaterelay.appleid.com" },
];
// One request finished (r-done), one started (r-new): the newest goes on top.
const AFTER: Snapshot = [
  BEFORE[0],
  BEFORE[1],
  { id: "r-new", startedAgoMs: 800, stage: "upstream", model: "gpt-6.1-sol", path: "/v1/chat/completions", account: "lanlanjiaxin@proton.me" },
];

function inFlightBody(snapshot: Snapshot) {
  const now = Date.now();
  return {
    requests: snapshot.map((item) => ({
      request_id: item.id,
      method: "POST",
      path: `/deepseekv4flash-chatgpt/cs_3e13ca9880fc${item.path}`,
      started_at: new Date(now - item.startedAgoMs).toISOString(),
      elapsed_ms: item.startedAgoMs,
      stage: item.stage,
      stage_elapsed_ms: Math.max(0, item.startedAgoMs - 2_000),
      model: item.model,
      stream: true,
      attempt: 1,
      account: { auth_id: `${item.id}.json`, label: item.account, provider: "codex", group: "deepseekv4flash+chatgpt" },
      api_key_id: `key-${item.id}`,
      api_key_name: "张军宝",
    })),
    total: snapshot.length,
    generated_at: new Date(now).toISOString(),
  };
}

async function openMonitor(page: Page, current: () => Snapshot) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "test-management-key",
        rememberPassword: true,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      }),
    );
    localStorage.setItem("cli-proxy-language", JSON.stringify("zh-CN"));
  });
  await page.route("**/v0/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/v0\/management/, "");
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/config") return json({});
    if (path === "/update/check") return json({ has_update: false });
    if (path === "/usage/monitor/overview") {
      return json({
        generated_at: new Date().toISOString(),
        range: { key: "24h", step_seconds: 3600, timezone: "Asia/Shanghai" },
        summary: { current: { requests: 120, success: 118, failed: 2 }, previous: { requests: 100 } },
        capabilities: { "in-flight-requests": true },
      });
    }
    if (path === "/usage/monitor/realtime") return json({ points: [] });
    if (path === "/usage/monitor/in-flight") return json(inFlightBody(current()));
    return json({ items: [], files: [], data: [], total: 0 });
  });
  await page.goto("/#/runtime/monitor");
}

type Frame = { t: number; overflow: number; rows: { key: string; opacity: number; top: number; height: number }[] };

/** Samples every animation frame of the in-flight table until stopped. */
async function startSampling(page: Page) {
  await page.evaluate(() => {
    const heading = [...document.querySelectorAll("h1,h2,h3,h4,[role=heading]")].find((el) => el.textContent?.startsWith("在途请求"));
    const table = heading?.closest("section")?.querySelector("table");
    if (!table) throw new Error("in-flight table not found");
    const scroller = table.parentElement as HTMLElement;
    const w = window as unknown as { __frames: Frame[]; __sampling: boolean };
    w.__frames = [];
    w.__sampling = true;
    const sample = () => {
      w.__frames.push({
        t: performance.now(),
        overflow: scroller.scrollHeight - scroller.clientHeight,
        rows: [...table.querySelectorAll<HTMLElement>("tbody > tr[data-row-key]")].map((row) => {
          const box = row.getBoundingClientRect();
          return { key: row.dataset.rowKey ?? "", opacity: Number(getComputedStyle(row).opacity), top: box.top, height: box.height };
        }),
      });
      if (w.__sampling) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function stopSampling(page: Page): Promise<Frame[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __frames: Frame[]; __sampling: boolean };
    w.__sampling = false;
    return w.__frames;
  });
}

const rowKeys = (page: Page) =>
  page.evaluate(() => {
    const heading = [...document.querySelectorAll("h1,h2,h3,h4,[role=heading]")].find((el) => el.textContent?.startsWith("在途请求"));
    return [...(heading?.closest("section")?.querySelectorAll<HTMLElement>("tbody > tr[data-row-key]") ?? [])].map(
      (row) => row.dataset.rowKey,
    );
  });

for (const width of [1470, 1280]) {
  test(`in-flight requests refresh without flashing, newest on top, at ${width}×800`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 800 });
    let snapshot = BEFORE;
    await openMonitor(page, () => snapshot);

    // First load: newest first.
    await expect.poll(() => rowKeys(page)).toEqual(["r-done", "r-mid", "r-old"]);
    await page
      .getByRole("heading", { name: /^在途请求/ })
      .locator("xpath=ancestor::section[1]")
      .scrollIntoViewIfNeeded();
    // Let the first entrance finish before watching the refresh.
    await page.waitForTimeout(800);

    const framesDir = process.env.INFLIGHT_FRAMES_DIR ? join(process.env.INFLIGHT_FRAMES_DIR, String(width)) : "";
    const cdp = framesDir ? await page.context().newCDPSession(page) : null;
    let frameNo = 0;
    if (cdp) {
      mkdirSync(framesDir, { recursive: true });
      cdp.on("Page.screencastFrame", async (event) => {
        frameNo += 1;
        writeFileSync(join(framesDir, `f${String(frameNo).padStart(5, "0")}.jpg`), Buffer.from(event.data, "base64"));
        await cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => undefined);
      });
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, everyNthFrame: 1 });
    }

    await startSampling(page);
    snapshot = AFTER;
    // The next poll (every 5s) brings r-new in and takes r-done out.
    await expect.poll(() => rowKeys(page), { timeout: 8_000 }).toEqual(["r-new", "r-mid", "r-old"]);
    await page.waitForTimeout(700);
    const frames = await stopSampling(page);
    if (cdp) await cdp.send("Page.stopScreencast");

    expect(frames.length).toBeGreaterThan(30);
    const series = (key: string) => frames.flatMap((frame) => frame.rows.filter((row) => row.key === key));

    // The rows that stayed never fade, not even for a frame: no whole-table flash.
    for (const key of ["r-mid", "r-old"]) {
      const lowest = Math.min(...series(key).map((row) => row.opacity));
      expect(lowest, `${key} opacity`).toBeGreaterThan(0.99);
    }
    // The new request comes in on top with its entrance.
    const entering = series("r-new");
    expect(entering.length).toBeGreaterThan(0);
    expect(Math.min(...entering.map((row) => row.opacity))).toBeLessThan(0.9);
    expect(entering.at(-1)?.opacity).toBeGreaterThan(0.99);
    // The finished one fades where it was and folds away before it goes.
    const leaving = series("r-done");
    expect(Math.min(...leaving.map((row) => row.opacity))).toBeLessThan(0.2);
    expect(Math.min(...leaving.map((row) => row.height))).toBeLessThan(8);
    // A few rows fit the card: the animation never makes the table scroll.
    expect(Math.max(...frames.map((frame) => frame.overflow))).toBeLessThanOrEqual(1);
  });
}
