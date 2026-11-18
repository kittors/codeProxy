import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type CDPSession, type Page } from "@playwright/test";

/**
 * 在途请求每 5 秒刷新一次。以前每次刷新整张表都闪一下：表格按行集合整体重挂，所有行重播入场。
 * 这里在真实的刷新里逐帧采样（requestAnimationFrame）每一行的不透明度和位置，断言：
 * - 留下的行任何一帧都不变淡，只朝该去的方向移动，不回跳；
 * - 新请求从最上面进来，把旧的往下推；一次来好几个时一个接一个落到顶上；
 * - 结束的请求原地淡出再收起；一出一进时卡片高度不变；
 * - 表格每帧只变几像素，不会因为动画冒出滚动条。
 * 设了 INFLIGHT_FRAMES_DIR 时，再用 CDP 截屏流把每一帧存成 JPEG，供逐帧检查。
 */

type Request = { id: string; startedAgoMs: number; stage: string; model: string; path: string; account: string };
type Snapshot = Request[];

const ACCOUNTS = ["lanlanjiaxin@proton.me", "rojasteresita717@gmail.com", "jd7njnb5nh@privaterelay.appleid.com"];
const STAGES = ["streaming", "first_token", "upstream", "preparing"];

/** A request that started `startedAgoMs` ago; the rest of its fields vary with its number only. */
function req(id: string, startedAgoMs: number, n = id.length): Request {
  return {
    id,
    startedAgoMs,
    stage: STAGES[n % STAGES.length],
    model: n % 2 ? "gpt-6.1-sol" : "gpt-6.1-terra",
    path: n % 2 ? "/v1/chat/completions" : "/v1/responses",
    account: ACCOUNTS[n % ACCOUNTS.length],
  };
}

const BEFORE: Snapshot = [
  { id: "r-old", startedAgoMs: 95_000, stage: "streaming", model: "gpt-6.1-sol", path: "/v1/chat/completions", account: ACCOUNTS[0] },
  { id: "r-mid", startedAgoMs: 40_000, stage: "streaming", model: "gpt-6.1-sol", path: "/v1/responses", account: ACCOUNTS[1] },
  { id: "r-done", startedAgoMs: 21_000, stage: "first_token", model: "gpt-6.1-terra", path: "/v1/chat/completions", account: ACCOUNTS[2] },
];
// One request finished (r-done), one started (r-new): the newest goes on top.
const AFTER: Snapshot = [
  BEFORE[0],
  BEFORE[1],
  { id: "r-new", startedAgoMs: 800, stage: "upstream", model: "gpt-6.1-sol", path: "/v1/chat/completions", account: ACCOUNTS[0] },
];
// Then one more starts and none finishes: the older rows have to make room.
const MORE: Snapshot = [
  ...AFTER,
  { id: "r-newer", startedAgoMs: 600, stage: "preparing", model: "gpt-6.1-sol", path: "/v1/responses", account: ACCOUNTS[1] },
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

type Row = { key: string; opacity: number; top: number; height: number; mode: string; delay: string };
type Frame = { t: number; overflow: number; card: number; rows: Row[] };

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
    // The frame's own timestamp, not performance.now(): animations advance with it, so a callback
    // that runs late in its frame does not read as a fast step.
    const sample = (time: number) => {
      w.__frames.push({
        t: time,
        overflow: scroller.scrollHeight - scroller.clientHeight,
        card: (table.closest("section") as HTMLElement).getBoundingClientRect().height,
        rows: [...table.querySelectorAll<HTMLElement>("tbody > tr[data-row-key]")].map((row) => {
          const box = row.getBoundingClientRect();
          const style = getComputedStyle(row);
          const mode = row.dataset.leaving ? "leaving" : (row.dataset.entering ?? "");
          return {
            key: row.dataset.rowKey ?? "",
            opacity: Number(style.opacity),
            top: box.top,
            height: box.height,
            mode,
            delay: mode ? style.animationDelay : "",
          };
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

/** Opens the monitor on `first` and waits until its rows have entered. */
async function openOn(page: Page, width: number, first: Snapshot, state: { snapshot: Snapshot }) {
  await page.setViewportSize({ width, height: 800 });
  state.snapshot = first;
  await openMonitor(page, () => state.snapshot);
  await expect.poll(() => rowKeys(page)).toEqual(newestFirst(first));
  await page
    .getByRole("heading", { name: /^在途请求/ })
    .locator("xpath=ancestor::section[1]")
    .scrollIntoViewIfNeeded();
  // Let the first entrance finish before watching a refresh.
  await page.waitForTimeout(800);
}

const newestFirst = (snapshot: Snapshot) => [...snapshot].sort((a, b) => a.startedAgoMs - b.startedAgoMs).map((r) => r.id);

/** Switches the next poll (every 5s) to `next` and samples every frame until its rows have settled. */
async function refreshTo(page: Page, state: { snapshot: Snapshot }, next: Snapshot): Promise<Frame[]> {
  await startSampling(page);
  state.snapshot = next;
  // The rows still leaving are drawn too: this holds once they have folded and gone.
  await expect.poll(() => rowKeys(page), { timeout: 8_000 }).toEqual(newestFirst(next));
  // A burst unfolds for up to ~0.8s; the last new row's fade ends after that.
  await page.waitForTimeout(900);
  return stopSampling(page);
}

/** Writes a scenario's sampled frames as JSON while INFLIGHT_FRAMES_DIR is set. */
function saveFrames(name: string, frames: unknown) {
  if (!process.env.INFLIGHT_FRAMES_DIR) return;
  mkdirSync(process.env.INFLIGHT_FRAMES_DIR, { recursive: true });
  writeFileSync(join(process.env.INFLIGHT_FRAMES_DIR, `${name}.json`), JSON.stringify(frames));
}

/** Saves every painted frame as a JPEG while INFLIGHT_FRAMES_DIR is set, for a frame-by-frame look. */
async function recordFrames(page: Page, name: string): Promise<CDPSession | null> {
  if (!process.env.INFLIGHT_FRAMES_DIR) return null;
  const dir = join(process.env.INFLIGHT_FRAMES_DIR, name);
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  let frameNo = 0;
  cdp.on("Page.screencastFrame", async (event) => {
    frameNo += 1;
    writeFileSync(join(dir, `f${String(frameNo).padStart(5, "0")}.jpg`), Buffer.from(event.data, "base64"));
    await cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => undefined);
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, everyNthFrame: 1 });
  return cdp;
}

const series = (frames: Frame[], key: string) => frames.flatMap((frame) => frame.rows.filter((row) => row.key === key));

/**
 * How far something moved from one sample to the next, per 60 Hz frame: a sample that came late
 * (a dropped frame) does not count as a jump.
 */
function perFrame<T>(items: T[], value: (item: T) => number, time: (item: T) => number): number[] {
  return items.slice(1).map((item, i) => {
    const frames = Math.max(1, (time(item) - time(items[i])) / (1000 / 60));
    return (value(item) - value(items[i])) / frames;
  });
}

/** Tops of one row over the frames, with the time of each, for per-frame steps. */
function track(frames: Frame[], key: string) {
  return frames.flatMap((frame) => frame.rows.filter((row) => row.key === key).map((row) => ({ t: frame.t, ...row })));
}

/** A staying row moved `rows` rows one way (or not at all), only that way, and never by much in one frame. */
function expectMoves(frames: Frame[], key: string, direction: "down" | "up" | "still", rowHeight: number, rows = 1) {
  const samples = track(frames, key);
  expect(samples.length, `${key} sampled`).toBeGreaterThan(10);
  expect(Math.min(...samples.map((row) => row.opacity)), `${key} opacity`).toBeGreaterThan(0.99);
  const steps = perFrame(samples, (row) => row.top, (row) => row.t);
  const travel = samples.at(-1)!.top - samples[0].top;
  if (direction === "still") {
    expect(Math.max(...samples.map((row) => Math.abs(row.top - samples[0].top))), `${key} stays put`).toBeLessThanOrEqual(1);
    return;
  }
  const sign = direction === "down" ? 1 : -1;
  expect(sign * travel, `${key} moved ${direction} ${rows} row(s)`).toBeGreaterThan(rowHeight * rows * 0.9);
  expect(sign * travel, `${key} moved ${direction} ${rows} row(s), no more`).toBeLessThan(rowHeight * rows * 1.1);
  expect(Math.min(...steps.map((step) => sign * step)), `${key} only moves ${direction}`).toBeGreaterThanOrEqual(-0.5);
  expect(Math.max(...steps.map((step) => Math.abs(step))), `${key} largest step in one frame`).toBeLessThan(rowHeight * 0.3);
}

/**
 * No row grows or shrinks by much in one frame. A row that leaves without its fold measured used
 * to drop to its content height at once (about a quarter of a row) before it started to fold.
 */
function expectSmoothRows(frames: Frame[], rowHeight: number) {
  let worst = 0;
  for (let i = 1; i < frames.length; i++) {
    const scale = Math.max(1, (frames[i].t - frames[i - 1].t) / (1000 / 60));
    for (const row of frames[i].rows) {
      const before = frames[i - 1].rows.find((item) => item.key === row.key);
      if (before) worst = Math.max(worst, Math.abs(row.height - before.height) / scale);
    }
  }
  expect(worst, "largest change of a row's height in one frame").toBeLessThan(rowHeight * 0.15);
}

function cardSteps(frames: Frame[]) {
  return perFrame(frames, (frame) => frame.card, (frame) => frame.t);
}

for (const width of [1470, 1280]) {
  test(`in-flight requests refresh without flashing, newest on top, at ${width}×800`, async ({ page }) => {
    test.setTimeout(60_000);
    const state = { snapshot: BEFORE };
    await openOn(page, width, BEFORE, state);
    const cdp = await recordFrames(page, String(width));

    const frames = await refreshTo(page, state, AFTER);
    expect(frames.length).toBeGreaterThan(30);
    // The rows that stayed never fade, not even for a frame: no whole-table flash.
    for (const key of ["r-mid", "r-old"]) {
      expect(Math.min(...series(frames, key).map((row) => row.opacity)), `${key} opacity`).toBeGreaterThan(0.99);
    }
    // The new request comes in on top with its entrance.
    const entering = series(frames, "r-new");
    expect(entering.length).toBeGreaterThan(0);
    expect(Math.min(...entering.map((row) => row.opacity))).toBeLessThan(0.9);
    expect(entering.at(-1)?.opacity).toBeGreaterThan(0.99);
    // The finished one fades where it was and folds away before it goes.
    const leaving = series(frames, "r-done");
    expect(Math.min(...leaving.map((row) => row.opacity))).toBeLessThan(0.2);
    expect(Math.min(...leaving.map((row) => row.height))).toBeLessThan(8);
    // A few rows fit the card: the animation never makes the table scroll.
    expect(Math.max(...frames.map((frame) => frame.overflow))).toBeLessThanOrEqual(1);
    // One request out, one in: the new row unfolds as the old one folds, so the card, and the page
    // under it, keeps its height in every frame instead of growing a row and shrinking back.
    const heights = frames.map((frame) => frame.card);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(2);
    expectSmoothRows(frames, series(frames, "r-mid")[0].height);

    // One more starts, none finishes: the new one unfolds on top and pushes the older ones down,
    // a few pixels a frame, never in one jump, and they never fade.
    const rowHeight = series(frames, "r-mid")[0].height;
    const pushed = await refreshTo(page, state, MORE);
    for (const key of ["r-new", "r-mid", "r-old"]) expectMoves(pushed, key, "down", rowHeight);
    expectSmoothRows(pushed, rowHeight);
    expect(Math.max(...cardSteps(pushed)), "card grows a little each frame").toBeLessThan(rowHeight * 0.3);
    if (cdp) await cdp.send("Page.stopScreencast");
  });
}

test("a request that ends under the top while new ones start never makes a row jump back", async ({ page }) => {
  test.setTimeout(90_000);
  const b1 = req("b1", 95_000, 1);
  const b2 = req("b2", 40_000, 2);
  const b3 = req("b3", 21_000, 3);
  const c1 = req("c1", 900, 4);
  const c2 = req("c2", 700, 5);
  const c3 = req("c3", 600, 6);
  const state = { snapshot: [b1, b2, b3] };
  await openOn(page, 1470, state.snapshot, state);
  const cdp = await recordFrames(page, "middle");

  // b2 ends between b3 and b1 while c1 starts on top: b3 moves down a row, b1 holds still, the card
  // keeps its height. Remembered positions made b3 jump back up a row when b2 had gone.
  const middle = await refreshTo(page, state, [b1, b3, c1]);
  saveFrames("middle-middle", middle);
  const rowHeight = series(middle, "b1")[0].height;
  expectMoves(middle, "b3", "down", rowHeight);
  expectMoves(middle, "b1", "still", rowHeight);
  const heights = middle.map((frame) => frame.card);
  expect(Math.max(...heights) - Math.min(...heights), "card keeps its height").toBeLessThanOrEqual(2);

  // Two refreshes that only add a row each: every older row moves down a row each time, only
  // down. On the second one, positions kept from the first made every row jump back up a row.
  const once = await refreshTo(page, state, [b1, b3, c1, c2]);
  saveFrames("middle-once", once);
  for (const key of ["c1", "b3", "b1"]) expectMoves(once, key, "down", rowHeight);
  const twice = await refreshTo(page, state, [b1, b3, c1, c2, c3]);
  saveFrames("middle-twice", twice);
  for (const key of ["c2", "c1", "b3", "b1"]) expectMoves(twice, key, "down", rowHeight);
  for (const frames of [middle, once, twice]) {
    expectSmoothRows(frames, rowHeight);
    expect(Math.max(...frames.map((frame) => frame.overflow)), "no scrollbar").toBeLessThanOrEqual(1);
  }
  if (cdp) await cdp.send("Page.stopScreencast");
});

test("a burst of requests comes in one at a time and goes a few pixels a frame", async ({ page }) => {
  test.setTimeout(90_000);
  const a1 = req("a1", 95_000, 1);
  const burst = [req("n1", 4_000, 2), req("n2", 3_000, 3), req("n3", 2_000, 4), req("n4", 1_000, 5)];
  const state = { snapshot: [a1] };
  await openOn(page, 1470, state.snapshot, state);
  const cdp = await recordFrames(page, "burst");

  // Four start at once. They land one after another, the oldest first, each on top of the last,
  // pushing a1 down four rows a few pixels a frame. It used to be all four in about three frames.
  const arrived = await refreshTo(page, state, [a1, ...burst]);
  saveFrames("burst-arrived", arrived);
  const rowHeight = series(arrived, "a1")[0].height;
  expectMoves(arrived, "a1", "down", rowHeight, 4);
  // In every frame an older new request is at least as far in as a newer one (a dropped frame can
  // skip a step, never swap the order), and there is a frame with the oldest in and the newest not.
  const opacityOf = (frame: Frame, id: string) => frame.rows.find((row) => row.key === id)?.opacity ?? 0;
  for (const frame of arrived) {
    const opacities = burst.map((request) => opacityOf(frame, request.id));
    for (let i = 1; i < opacities.length; i++) {
      expect(opacities[i], `at ${Math.round(frame.t)}ms ${burst[i].id} is not ahead of ${burst[i - 1].id}`).toBeLessThanOrEqual(
        opacities[i - 1] + 0.02,
      );
    }
  }
  expect(
    arrived.some((frame) => opacityOf(frame, "n1") > 0.9 && opacityOf(frame, "n4") < 0.1),
    "they come in one after another, not together",
  ).toBe(true);
  expect(arrived.at(-1)!.rows.every((row) => row.opacity > 0.99), "all in at the end").toBe(true);
  expect(Math.max(...cardSteps(arrived)), "card grows a little each frame").toBeLessThan(rowHeight * 0.3);

  // Two end, two start: each fold runs with an unfold, so the card keeps its height; n3 moves down a
  // row as the new ones come in above it and n4 above it goes, n1 and a1 under it hold still.
  const m = [req("m1", 800, 6), req("m2", 500, 7)];
  const swapped = await refreshTo(page, state, [a1, burst[0], burst[2], ...m]);
  saveFrames("burst-swapped", swapped);
  const heights = swapped.map((frame) => frame.card);
  expect(Math.max(...heights) - Math.min(...heights), "card keeps its height").toBeLessThanOrEqual(2);
  expectMoves(swapped, "n3", "down", rowHeight);
  expectMoves(swapped, "n1", "still", rowHeight);
  expectMoves(swapped, "a1", "still", rowHeight);

  // All four end at once: they fade together, then fold one after another; the card shrinks a
  // few pixels a frame and a1 rises four rows.
  const gone = await refreshTo(page, state, [a1]);
  saveFrames("burst-gone", gone);
  expectMoves(gone, "a1", "up", rowHeight, 4);
  expect(Math.min(...cardSteps(gone)), "card shrinks a little each frame").toBeGreaterThan(-rowHeight * 0.3);
  for (const frames of [arrived, swapped, gone]) {
    expectSmoothRows(frames, rowHeight);
    expect(Math.max(...frames.map((frame) => frame.overflow)), "no scrollbar").toBeLessThanOrEqual(1);
  }
  if (cdp) await cdp.send("Page.stopScreencast");
});

type CardFrame = { t: number; card: number; table: number; notice: number };

/** Samples the card's height and how visible its table and its empty notice are, every frame. */
async function startCardSampling(page: Page) {
  await page.evaluate(() => {
    const heading = [...document.querySelectorAll("h1,h2,h3,h4,[role=heading]")].find((el) => el.textContent?.startsWith("在途请求"));
    const section = heading?.closest("section");
    if (!section) throw new Error("in-flight card not found");
    // How visible an element is: its own opacity times that of every box around it, up to the card.
    const shown = (el: Element | null) => {
      let value = el ? 1 : 0;
      for (let node = el; node && node !== section; node = node.parentElement) value *= Number(getComputedStyle(node).opacity);
      return value;
    };
    const w = window as unknown as { __cards: CardFrame[]; __sampling: boolean };
    w.__cards = [];
    w.__sampling = true;
    const sample = (time: number) => {
      const notice = [...section.querySelectorAll("p")].find((p) => p.textContent === "当前没有进行中的请求") ?? null;
      w.__cards.push({
        t: time,
        card: section.getBoundingClientRect().height,
        table: shown(section.querySelector("table")),
        notice: shown(notice),
      });
      if (w.__sampling) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function stopCardSampling(page: Page): Promise<CardFrame[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __cards: CardFrame[]; __sampling: boolean };
    w.__sampling = false;
    return w.__cards;
  });
}

test("the card eases between no requests and some instead of jumping", async ({ page }) => {
  test.setTimeout(60_000);
  const x = req("x1", 30_000, 1);
  const y = req("y1", 900, 2);
  const state = { snapshot: [x] };
  await openOn(page, 1470, state.snapshot, state);
  const rowHeight = (await page.locator('tr[data-row-key="x1"]').boundingBox())!.height;
  const cdp = await recordFrames(page, "empty");
  const notice = page.getByText("当前没有进行中的请求");

  for (const [next, expectNotice] of [
    [[], true],
    [[y], false],
  ] as const) {
    await startCardSampling(page);
    state.snapshot = [...next];
    if (expectNotice) await expect(notice).toBeVisible({ timeout: 8_000 });
    else await expect(page.locator('tr[data-row-key="y1"]')).toBeVisible({ timeout: 8_000 });
    await page.waitForTimeout(700);
    const frames = await stopCardSampling(page);
    // The table and the notice cross-fade while one folds and the other unfolds: the card changes
    // height a few pixels a frame, not in one jump.
    const steps = perFrame(frames, (frame) => frame.card, (frame) => frame.t);
    expect(Math.max(...steps.map(Math.abs)), "card height changes a little each frame").toBeLessThan(rowHeight * 0.3);
    const crossing = frames.filter((frame) => frame.table > 0.05 && frame.notice > 0.05);
    expect(crossing.length, "the two cross-fade").toBeGreaterThan(2);
    const last = frames.at(-1)!;
    expect(expectNotice ? last.notice : last.table, "the new view is fully in").toBeGreaterThan(0.99);
    expect(expectNotice ? last.table : last.notice, "the old one is gone").toBe(0);
  }
  if (cdp) await cdp.send("Page.stopScreencast");
});
