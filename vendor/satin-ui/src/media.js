// Satin：视频播放器、音频条。接真实的 <video> / 音频：时长、缓冲、音量、画中画、全屏都是真的。
// 展示页"视频与音频"、Markdown 里的视频和音频、对话里的媒体都用这一份（样式在 data.css 的 .player / .audio-row）。
//   playerHTML({ src, poster, label })  → 播放器的标记；mountPlayer(el) 接上交互（返回 { play, pause, destroy }）
//   audioHTML({ src, title, sub, wave }) → 音频条的标记；mountAudio(el) 接上交互（波形：给了 wave 地址就用它，没给就从音频本身算）
// 规矩照 09 号 §10：控制条叠在画面上（玻璃）；播放时指针停 2 秒不动，控制条和指针一起淡出；进度每帧连续往前走，只改 scale；
// 点进度条平滑跳过去（150ms），拖动时跟手；播放 / 暂停、全屏的图标互相转换（.swap），不硬切。
import { reduced, retip } from "./core.js";
import { icon } from "./icons.js";
import { scoped } from "./i18n.js";
import I18N_DEFAULTS from "./locales/zh-CN/media.js";
const tt = /* @__PURE__ */ scoped(I18N_DEFAULTS);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const mmss = (s) => { s = Math.max(0, s || 0); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`; };
const setV = (el, name, v) => el.style.setProperty(name, (Number.isFinite(v) ? v : 0).toFixed(4));
const SWAP = (a, b) => `<span class="sn-swap"><span class="sn-a">${icon(a, 18)}</span><span class="sn-b">${icon(b, 18)}</span></span>`;
const VOL = '<svg class="sn-ic sn-vol-ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path class="sn-w1" d="M16 9a5 5 0 0 1 0 6"/><path class="sn-w2" d="M19.364 18.364a9 9 0 0 0 0-12.728"/><path class="sn-x" d="m16 9 6 6m0-6-6 6"/></svg>';
// ———————————————— 视频 ————————————————
export function playerHTML({ src = "", poster = "", label = tt("media.0") } = {}) {
  return `<div class="sn-player" tabindex="0" aria-label="${esc(label)}"><video class="sn-frame" playsinline preload="metadata" disableremoteplayback src="${esc(src)}"${poster ? ` poster="${esc(poster)}"` : ""}></video>`
    + `<div class="sn-pip-note">${icon("picture-in-picture-2", 18)}<b>${tt("media.1")}</b><button class="sn-btn sn-secondary sn-sm" data-pip-back>${tt("media.2")}</button></div>`
    + `<div class="sn-hud" aria-live="polite"></div><span class="sn-spinner sn-pl-spin" aria-hidden="true"></span>`
    + `<button class="sn-big-play sn-glass" aria-label="${tt("media.3")}">${icon("play", 26)}</button>`
    + `<div class="sn-ctrl sn-glass"><button class="sn-pb" data-play aria-label="${tt("media.3")}" data-tip="${tt("media.3")}" data-kbd="${tt("media.4")}">${SWAP("play", "pause")}</button>`
    + `<span class="sn-time"><span data-cur>0:00</span> / <span data-dur>0:00</span></span>`
    + `<div class="sn-scrub" data-scrub role="slider" aria-label="${tt("media.5")}" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0"><span class="sn-buf"></span><span class="sn-fill"></span><span class="sn-knob"></span><span class="sn-hover-t">0:00</span></div>`
    + `<div class="sn-vol" data-lv="2"><button class="sn-pb" data-mute aria-label="${tt("media.6")}" data-tip="${tt("media.6")}" data-kbd="M">${VOL}</button><div class="sn-vs" role="slider" tabindex="0" aria-label="${tt("media.7")}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="80"><span class="sn-fill"></span><span class="sn-knob"></span></div></div>`
    + `<button class="sn-pb" data-pip aria-label="${tt("media.8")}" data-tip="${tt("media.8")}" data-kbd="P">${icon("picture-in-picture-2", 18)}</button>`
    + `<button class="sn-pb" data-fs aria-label="${tt("media.9")}" data-tip="${tt("media.9")}" data-kbd="F">${SWAP("maximize-2", "minimize-2")}</button></div></div>`;
}
export function mountPlayer(pl, { onError } = {}) {
  if (pl._player) return pl._player;
  const $ = (s) => pl.querySelector(s), video = $("video"), scrub = $("[data-scrub]"), hoverT = $(".sn-hover-t"), cur = $("[data-cur]"), durEl = $("[data-dur]");
  const playBtn = $("[data-play]"), muteBtn = $("[data-mute]"), vol = $(".sn-vol"), vs = $(".sn-vs"), pipBtn = $("[data-pip]"), fsBtn = $("[data-fs]"), hud = $(".sn-hud"), ctrl = $(".sn-ctrl");
  let raf = 0, seekAnim = null, dragging = false, downX = 0, idleT = 0, hudT = 0, bufT = 0, level = .8, muted = false, shown = 0;
  const D = () => (Number.isFinite(video.duration) ? video.duration : 0);
  const buffered = () => { const b = video.buffered, t = video.currentTime; for (let i = 0; i < b.length; i++) if (b.start(i) <= t + .5 && b.end(i) >= t) return b.end(i); return t; };
  // 进度条显示的时间：平常就是 currentTime；点进度条跳过去时，150ms 内从旧位置缓到新位置（只是显示，视频已经跳过去了）
  function render(now = performance.now()) {
    let t = video.currentTime;
    if (seekAnim) { const k = Math.min(1, (now - seekAnim.t0) / 150); t = seekAnim.from + (seekAnim.to - seekAnim.from) * (1 - Math.pow(1 - k, 3)); if (k >= 1) seekAnim = null; }
    if (dragging) t = shown;
    const d = D(), p = d ? t / d : 0; setV(scrub, "--sn-p", p); setV(scrub, "--sn-b", d ? Math.min(1, buffered() / d) : 0);
    const s = mmss(t); if (cur.textContent !== s) { cur.textContent = s; scrub.setAttribute("aria-valuenow", String(Math.floor(t))); }
  }
  const loop = (now) => { raf = 0; render(now); if (!video.paused || seekAnim) raf = requestAnimationFrame(loop); };
  const run = () => { if (!raf) raf = requestAnimationFrame(loop); };
  const syncPlay = () => {
    const on = !video.paused && !video.ended; pl.classList.toggle("sn-playing", on); playBtn.querySelector(".sn-swap").classList.toggle("sn-on", on);
    playBtn.setAttribute("aria-label", on ? tt("media.10") : tt("media.3")); playBtn.dataset.tip = on ? tt("media.10") : tt("media.3"); retip(playBtn); if (on) run(); wake();
  };
  const play = () => video.play().catch((e) => { if (e?.name !== "AbortError") onError?.(e); });
  const pause = () => video.pause();
  const toggle = () => (video.paused || video.ended ? play() : pause());
  for (const ev of ["play", "pause", "ended"]) video.addEventListener(ev, syncPlay);
  video.addEventListener("loadedmetadata", () => { durEl.textContent = mmss(D()); scrub.setAttribute("aria-valuemax", String(Math.floor(D()))); render(); });
  video.addEventListener("progress", () => render());
  // 缓冲：300ms 内接上什么都不显示；超过才在正中转圈
  video.addEventListener("waiting", () => { clearTimeout(bufT); bufT = setTimeout(() => pl.classList.add("sn-buffering"), 300); });
  for (const ev of ["playing", "pause", "canplay", "error"]) video.addEventListener(ev, () => { clearTimeout(bufT); pl.classList.remove("sn-buffering"); });
  video.addEventListener("error", () => { pl.classList.add("sn-bad"); onError?.(video.error); });
  // 播放时指针停 2 秒不动，控制条和指针一起淡出；指针停在控制条上、或正在拖进度 / 音量时不淡出
  const wake = () => { pl.classList.remove("sn-idle"); clearTimeout(idleT); if (!video.paused) idleT = setTimeout(function hide() { if (ctrl.matches(":hover") || dragging || vs.classList.contains("sn-drag")) idleT = setTimeout(hide, 2000); else pl.classList.add("sn-idle"); }, 2000); };
  const showHud = (text) => { hud.textContent = text; hud.classList.add("sn-on"); clearTimeout(hudT); hudT = setTimeout(() => hud.classList.remove("sn-on"), 700); };
  const seekTo = (to, smooth) => { const d = D(); if (!d) return; to = Math.max(0, Math.min(d, to)); if (smooth && !reduced()) seekAnim = { from: video.currentTime, to, t0: performance.now() }; video.currentTime = to; run(); render(); };
  pl.addEventListener("pointermove", wake);
  $(".sn-big-play").addEventListener("click", play);
  playBtn.addEventListener("click", toggle);
  // 进度条：按下先平滑跳到按下的位置；移动超过 3px 算拖动，之后跟手
  const at = (x) => { const r = scrub.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left) / r.width)); };
  scrub.addEventListener("pointermove", (e) => {
    const p = at(e.clientX); hoverT.style.left = p * 100 + "%"; hoverT.textContent = mmss(p * D());
    if (!dragging && scrub.classList.contains("sn-down") && Math.abs(e.clientX - downX) > 3) { dragging = true; seekAnim = null; scrub.classList.add("sn-drag"); }
    if (dragging) { shown = p * D(); video.fastSeek ? video.fastSeek(shown) : (video.currentTime = shown); render(); }
  });
  scrub.addEventListener("pointerdown", (e) => { scrub.setPointerCapture(e.pointerId); scrub.classList.add("sn-down"); downX = e.clientX; seekTo(at(e.clientX) * D(), true); });
  for (const ev of ["pointerup", "pointercancel"]) scrub.addEventListener(ev, () => { if (dragging) video.currentTime = shown; scrub.classList.remove("sn-down", "sn-drag"); dragging = false; run(); });
  // 音量：点喇叭静音 / 取消静音（回到原来的音量）；悬停展开音量条，拖动或方向键调；拖到 0 就是静音
  function setVolume(v, mute) {
    level = Math.max(0, Math.min(1, v)); muted = mute || level === 0;
    const s = muted ? 0 : level; setV(vol, "--sn-v", s); vol.dataset.lv = s === 0 ? 0 : s < .5 ? 1 : 2;
    vs.setAttribute("aria-valuenow", String(Math.round(s * 100))); muteBtn.setAttribute("aria-label", muted ? tt("media.11") : tt("media.6")); muteBtn.dataset.tip = muted ? tt("media.11") : tt("media.6"); retip(muteBtn);
    video.volume = level; video.muted = muted;
  }
  const volText = () => (muted ? tt("media.6") : tt("media.12", { p0: Math.round(level * 100) }));
  muteBtn.addEventListener("click", () => setVolume(muted ? level || .5 : level, !muted));
  const volAt = (x) => { const r = vs.getBoundingClientRect(); return (x - r.left - 6) / (r.width - 12); };
  vs.addEventListener("pointerdown", (e) => { vs.setPointerCapture(e.pointerId); vs.classList.add("sn-drag"); setVolume(volAt(e.clientX), false); });
  vs.addEventListener("pointermove", (e) => { if (vs.classList.contains("sn-drag")) setVolume(volAt(e.clientX), false); });
  for (const ev of ["pointerup", "pointercancel"]) vs.addEventListener(ev, () => vs.classList.remove("sn-drag"));
  // 全屏：整个播放器（控制条跟着进去）；Esc 退出时同步按钮
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  const toggleFs = () => { if (fsEl() === pl) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document); else (pl.requestFullscreen || pl.webkitRequestFullscreen)?.call(pl)?.catch?.(() => {}); };
  const syncFs = () => { const on = fsEl() === pl; pl.classList.toggle("sn-fs", on); fsBtn.querySelector(".sn-swap").classList.toggle("sn-on", on); fsBtn.setAttribute("aria-label", on ? tt("media.13") : tt("media.9")); fsBtn.dataset.tip = on ? tt("media.13") : tt("media.9"); retip(fsBtn); wake(); };
  fsBtn.addEventListener("click", toggleFs);
  for (const ev of ["fullscreenchange", "webkitfullscreenchange"]) document.addEventListener(ev, syncFs);
  // 点画面：播放 / 暂停来回切（全屏用按钮或 F 键）；控制条、大播放键、画中画提示自己处理
  pl.addEventListener("click", (e) => { if (e.target.closest(".sn-ctrl, .sn-pip-note, .sn-big-play")) return; toggle(); pl.focus({ preventScroll: true }); });
  // 画中画：标准接口；不支持就不显示按钮
  if (!(document.pictureInPictureEnabled && video.requestPictureInPicture)) pipBtn.hidden = true;
  const togglePip = async () => { try { if (document.pictureInPictureElement === video) await document.exitPictureInPicture(); else { await video.play(); await video.requestPictureInPicture(); } } catch (e) { onError?.(e); } };
  pipBtn.addEventListener("click", togglePip); $("[data-pip-back]").addEventListener("click", togglePip);
  video.addEventListener("enterpictureinpicture", () => { pl.classList.add("sn-in-pip"); pipBtn.dataset.tip = tt("media.14"); retip(pipBtn); });
  video.addEventListener("leavepictureinpicture", () => { pl.classList.remove("sn-in-pip"); pipBtn.dataset.tip = tt("media.8"); retip(pipBtn); });
  pl.addEventListener("keydown", (e) => {
    if (e.target === vs) { const d = { ArrowRight: .05, ArrowUp: .05, ArrowLeft: -.05, ArrowDown: -.05 }[e.key]; if (d) { e.preventDefault(); setVolume((muted ? 0 : level) + d, false); } return; }
    if (e.target.closest("button") && (e.key === " " || e.key === "Enter")) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === " " || k === "k") { e.preventDefault(); toggle(); }
    else if (k === "ArrowRight" || k === "ArrowLeft") { e.preventDefault(); const d = k === "ArrowRight" ? 5 : -5; seekTo(video.currentTime + d, true); showHud(d > 0 ? tt("media.15") : tt("media.16")); wake(); }
    else if (k === "ArrowUp" || k === "ArrowDown") { e.preventDefault(); setVolume((muted ? 0 : level) + (k === "ArrowUp" ? .1 : -.1), false); showHud(volText()); wake(); }
    else if (k === "m") { muteBtn.click(); showHud(volText()); }
    else if (k === "f") toggleFs();
    else if (k === "p" && !pipBtn.hidden) togglePip();
  });
  setVolume(video.muted ? 0 : .8, video.muted); render();
  return (pl._player = { play, pause, toggle, video, destroy() { cancelAnimationFrame(raf); clearTimeout(idleT); video.pause(); video.removeAttribute("src"); video.load(); } });
}
// ———————————————— 音频 ————————————————
// 三层同样的波形叠在一起——底层灰、悬停预览一层、播放过的一层；后两层按进度裁出来，进度每帧连续推进
export function audioHTML({ src = "", title = "", sub = "", wave = "" } = {}) {
  return `<div class="sn-audio-row" data-src="${esc(src)}"${wave ? ` data-wave="${esc(wave)}"` : ""}><button class="sn-play" aria-label="${tt("media.3")}">${SWAP("play", "pause")}</button>`
    + `<div class="sn-who"><b>${esc(title || tt("media.19"))}</b>${sub ? `<span>${esc(sub)}</span>` : ""}</div>`
    + `<div class="sn-wave" role="slider" tabindex="0" aria-label="${tt("media.17")}" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0"></div><span class="sn-time">0:00</span></div>`;
}
// 波形：Mixkit 的音乐有现成的波形数据；别的地址从音频本身解码算峰值（要能跨域读），都拿不到就画一条平线，不编造波形
const mixkitWave = (src) => { const m = /assets\.mixkit\.co\/music\/(\d+)\/\1\.mp3/.exec(src); return m ? `https://assets.mixkit.co/music/${m[1]}/${m[1]}-waveform.json` : ""; };
async function peaksOf(src, wave, n) {
  const url = wave || mixkitWave(src);
  if (url) { const w = await (await fetch(url)).json(), d = w.data, pairs = d.length / 2, per = pairs / n, out = []; for (let i = 0; i < n; i++) { let pk = 0; for (let j = Math.floor(i * per); j < Math.floor((i + 1) * per); j++) pk = Math.max(pk, Math.abs(d[2 * j]), Math.abs(d[2 * j + 1])); out.push(pk); } return out; }
  const buf = await (await fetch(src)).arrayBuffer(), ac = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 2, 44100), ab = await ac.decodeAudioData(buf), ch = ab.getChannelData(0), per = Math.floor(ch.length / n), out = [];
  for (let i = 0; i < n; i++) { let pk = 0; for (let j = i * per; j < (i + 1) * per; j += 16) pk = Math.max(pk, Math.abs(ch[j])); out.push(pk); }
  return out;
}
export function mountAudio(au, { onError } = {}) {
  if (au._audio) return au._audio;
  const wave = au.querySelector(".sn-wave"), time = au.querySelector(".sn-time"), btn = au.querySelector(".sn-play"), sw = btn.querySelector(".sn-swap"), src = au.dataset.src;
  // 波形条数跟着宽度走（每条 2px 宽、2px 缝，平均 5.5px 一条）：先取 192 个峰值，宽度变了按最大值合并重画，变窄也不会伸出去
  const count = () => Math.max(12, Math.min(96, Math.floor(((wave.clientWidth || 360) + 2) / 5.5)));
  let N = count(), peaks = null;
  const a = new Audio(); a.preload = "metadata"; a.src = src;
  let raf = 0, seekAnim = null, drag = false, downX = 0, shown = 0;
  const D = () => (Number.isFinite(a.duration) ? a.duration : 0);
  const bars = (pk) => { const hi = Math.max(...pk) || 1; return pk.map((p) => `<i style="height:${(18 + 82 * p / hi).toFixed(1)}%"></i>`).join(""); };
  const fill = (html) => { wave.innerHTML = `<div class="sn-wv">${html}</div><div class="sn-wv sn-pv">${html}</div><div class="sn-wv sn-lit">${html}</div>`; };
  const pool = (pk, n) => Array.from({ length: n }, (_, i) => { let m = 0; for (let j = Math.floor(i * pk.length / n); j < Math.max(Math.floor(i * pk.length / n) + 1, Math.floor((i + 1) * pk.length / n)); j++) m = Math.max(m, pk[j]); return m; });
  const flat = () => fill(Array.from({ length: N }, () => '<i style="height:12%"></i>').join(""));
  wave.classList.add("sn-flat"); flat();
  new ResizeObserver(() => { const n = count(); if (n === N) return; N = n; if (peaks) fill(bars(pool(peaks, N))); else flat(); }).observe(wave);
  new IntersectionObserver((es, io) => { if (!es[0].isIntersecting) return; io.disconnect(); peaksOf(src, au.dataset.wave, 192).then((pk) => { peaks = pk; wave.classList.remove("sn-flat"); fill(bars(pool(pk, N))); if (!reduced()) wave.animate([{ opacity: .3 }, { opacity: 1 }], { duration: 360, easing: "cubic-bezier(0,0,.58,1)" }); }, () => {}); }).observe(au);
  // 时间显示剩下多少（和展示页一致）；没载入时长前显示 0:00
  function render(now = performance.now()) {
    const d = D(); let t = a.currentTime;
    if (seekAnim) { const k = Math.min(1, (now - seekAnim.t0) / (seekAnim.d || 150)); t = seekAnim.from + (seekAnim.to - seekAnim.from) * (1 - Math.pow(1 - k, 3)); if (k >= 1) seekAnim = null; }
    if (drag) t = shown;
    const p = d ? t / d : 0; setV(wave, "--sn-p", p);
    const s = mmss(d ? Math.max(0, Math.ceil(d - t - 1e-6)) : 0); if (time.textContent !== s) { time.textContent = s; wave.setAttribute("aria-valuenow", String(Math.floor(t))); }
  }
  const loop = (now) => { raf = 0; render(now); if (!a.paused || seekAnim) raf = requestAnimationFrame(loop); };
  const run = () => { if (!raf) raf = requestAnimationFrame(loop); };
  const sync = () => { const on = !a.paused && !a.ended; sw.classList.toggle("sn-on", on); au.classList.toggle("sn-playing", on); btn.setAttribute("aria-label", on ? tt("media.10") : tt("media.3")); if (on) { if (playingAudio && playingAudio !== a) playingAudio.pause(); playingAudio = a; run(); } };
  for (const ev of ["play", "pause"]) a.addEventListener(ev, sync);
  // 播完停一下，再平滑回到开头
  a.addEventListener("ended", () => { sync(); setTimeout(() => { seekAnim = { from: D(), to: 0, t0: performance.now(), d: 320 }; a.currentTime = 0; run(); }, 400); });
  a.addEventListener("loadedmetadata", () => { wave.setAttribute("aria-valuemax", String(Math.floor(D()))); render(); });
  a.addEventListener("error", () => { au.classList.add("sn-bad"); time.textContent = tt("media.18"); onError?.(a.error); });
  const toggle = () => (a.paused ? a.play().catch((e) => onError?.(e)) : a.pause());
  btn.addEventListener("click", toggle);
  const at = (x) => { const r = wave.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left) / r.width)); };
  const seekTo = (p, smooth) => { const go = () => { const to = p * D(); if (smooth && !reduced()) seekAnim = { from: a.currentTime, to, t0: performance.now() }; a.currentTime = to; run(); render(); }; D() ? go() : (a.addEventListener("loadedmetadata", go, { once: true }), a.load()); };
  wave.addEventListener("pointerdown", (e) => { wave.setPointerCapture(e.pointerId); wave.classList.add("sn-down"); downX = e.clientX; seekTo(at(e.clientX), true); });
  wave.addEventListener("pointermove", (e) => {
    const p = at(e.clientX); setV(wave, "--sn-h", p);
    if (!drag && wave.classList.contains("sn-down") && Math.abs(e.clientX - downX) > 3) { drag = true; seekAnim = null; }
    if (drag) { shown = p * D(); render(); }
  });
  for (const ev of ["pointerup", "pointercancel"]) wave.addEventListener(ev, () => { if (drag && D()) a.currentTime = shown; wave.classList.remove("sn-down"); drag = false; run(); });
  wave.addEventListener("pointerleave", () => { if (!drag) setV(wave, "--sn-h", 0); });
  wave.addEventListener("keydown", (e) => { const d = { ArrowRight: 5, ArrowLeft: -5 }[e.key]; if (d && D()) { e.preventDefault(); seekTo((a.currentTime + d) / D(), true); } else if (e.key === " ") { e.preventDefault(); toggle(); } });
  render();
  return (au._audio = { toggle, audio: a, destroy() { cancelAnimationFrame(raf); a.pause(); a.removeAttribute("src"); a.load(); } });
}
let playingAudio = null;
