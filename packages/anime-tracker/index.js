// packages/react-global-shim.js
var React = window.__37toolbox_react || window.React;
if (!React) {
  throw new Error("React runtime is not available for external plugin");
}
var react_global_shim_default = React;
var Fragment = React.Fragment;
var useCallback = React.useCallback;
var useEffect = React.useEffect;
var useMemo = React.useMemo;
var useRef = React.useRef;
var useState = React.useState;

// src/plugins/anime-tracker/manifest.ts
var manifest = {
  id: "anime-tracker",
  name: "\u8FFD\u756A\u65E5\u7A0B",
  description: "\u5236\u4F5C\u4F60\u7684\u5B63\u5EA6\u8FFD\u756A\u65E5\u7A0B\u8868",
  category: "daily",
  version: "1.0.0",
  icon: "tv",
  tags: ["anime", "schedule", "season", "calendar", "tracker"],
  hasSettings: false
};

// src/plugins/anime-tracker/engine.ts
function getCurrentQuarterCode() {
  const m = (/* @__PURE__ */ new Date()).getMonth() + 1;
  const y = (/* @__PURE__ */ new Date()).getFullYear();
  if (m <= 3) return `${y}01`;
  if (m <= 6) return `${y}04`;
  if (m <= 9) return `${y}07`;
  return `${y}10`;
}
function getAvailableQuarters() {
  const y = (/* @__PURE__ */ new Date()).getFullYear();
  const m = (/* @__PURE__ */ new Date()).getMonth() + 1;
  const curY = m <= 3 ? y - 1 : y;
  const curM = m <= 3 ? "10" : m <= 6 ? "01" : m <= 9 ? "04" : "07";
  const maxQuarterCode = m <= 3 ? `${y}04` : m <= 6 ? `${y}07` : m <= 9 ? `${y}10` : `${y + 1}01`;
  const qs = [];
  const labels = { "01": "\u51AC\u5B63", "04": "\u6625\u5B63", "07": "\u590F\u5B63", "10": "\u79CB\u5B63" };
  for (let yr = y; yr >= 2020; yr--) {
    for (const qm of ["10", "07", "04", "01"]) {
      const code = `${yr}${qm}`;
      if (code > maxQuarterCode) continue;
      qs.push({ code, label: `${yr}\u5E74${labels[qm]}` });
    }
  }
  return qs;
}
var CACHE_VER = "v5";
var CACHE_PFX = `37toolbox:anime:${CACHE_VER}:`;
(function cleanOld() {
  const olds = ["37toolbox:anime:", "37toolbox:anime:v2:", "37toolbox:anime:v3:", "37toolbox:anime:v4:"];
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && olds.some((p) => k.startsWith(p) && !k.startsWith(CACHE_PFX))) {
      localStorage.removeItem(k);
    }
  }
})();
var DAY_NAMES = [
  ["\u5468\u4E00", "\u5468\u4E00"],
  ["\u5468\u4E8C", "\u5468\u4E8C"],
  ["\u5468\u4E09", "\u5468\u4E09"],
  ["\u5468\u56DB", "\u5468\u56DB"],
  ["\u5468\u4E94", "\u5468\u4E94"],
  ["\u5468\u516D", "\u5468\u516D"],
  ["\u5468\u65E5", "\u5468\u65E5"]
];
async function fetchAnimeList(quarterCode) {
  const cacheKey = `${CACHE_PFX}${quarterCode}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const items = JSON.parse(cached);
      if (Array.isArray(items) && items.length > 0) {
        console.log(`[AnimeTracker] \u7F13\u5B58: ${items.length} \u90E8`);
        return { ok: true, items };
      }
    } catch {
    }
  }
  const url = `https://yuc.wiki/${quarterCode}`;
  console.log(`[AnimeTracker] GET ${url}`);
  try {
    const r = await fetch(url);
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const html = await r.text();
    if (html.length < 1e3) return { ok: false, error: "\u9875\u9762\u8FC7\u77ED" };
    return parse(html, quarterCode, url, cacheKey);
  } catch (e) {
    return { ok: false, error: `\u8BF7\u6C42: ${e instanceof Error ? e.message : ""}` };
  }
}
function parse(html, qc, url, cacheKey) {
  const D = [url, qc, `size:${html.length}`];
  const dayPositions = [];
  for (const [cn, day] of DAY_NAMES) {
    const re = new RegExp(`<!--${cn}-->`, "g");
    let m;
    while ((m = re.exec(html)) !== null) {
      dayPositions.push({ day, pos: m.index });
    }
  }
  dayPositions.sort((a, b) => a.pos - b.pos);
  D.push(`day markers: ${dayPositions.map((d) => d.day).join(",")}`);
  if (dayPositions.length < 2) {
    const date2Re = /<td class="date2">(.*?)<\/td>/g;
    let dm;
    while ((dm = date2Re.exec(html)) !== null) {
      const text = dm[1];
      for (const [cn, day] of DAY_NAMES) {
        if (text.includes(cn) || text.includes(cn.replace("\u5468", "\u66DC"))) {
          dayPositions.push({ day, pos: dm.index });
          break;
        }
      }
    }
    dayPositions.sort((a, b) => a.pos - b.pos);
    D.push(`fallback markers: ${dayPositions.map((d) => d.day).join(",")}`);
  }
  const allItems = [];
  for (let i = 0; i < dayPositions.length; i++) {
    const start = dayPositions[i].pos;
    const end = i + 1 < dayPositions.length ? dayPositions[i + 1].pos : html.length;
    const section = html.slice(start, end);
    const items = parseCards(section, dayPositions[i].day, qc);
    allItems.push(...items);
    D.push(`${dayPositions[i].day}: ${items.length} \u90E8`);
  }
  D.push(`\u5408\u8BA1: ${allItems.length} \u90E8`);
  const diag = D.join("\n");
  console.log("[AnimeTracker]\n" + diag);
  const seen = /* @__PURE__ */ new Set();
  const uniq = allItems.filter((a) => {
    const key = a.title.slice(0, 25);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (uniq.length === 0) {
    return { ok: false, error: `\u89E3\u6790\u5230 0 \u90E8\u756A\u5267`, diagnostics: diag };
  }
  try {
    localStorage.setItem(cacheKey, JSON.stringify(uniq));
  } catch {
  }
  return { ok: true, items: uniq };
}
function parseCards(html, day, qc) {
  const items = [];
  const chunks = html.split('<div style="float:left">').slice(1);
  for (const chunk of chunks) {
    const endIdx = chunk.search(/<div style="float:left">|<div style="clear:both">|<!--/);
    const cardHtml = endIdx >= 0 ? chunk.slice(0, endIdx) : chunk;
    const item = parseCard(cardHtml, day, qc);
    if (item) items.push(item);
  }
  return items;
}
function parseCard(cardHtml, day, qc) {
  const imgM = cardHtml.match(/<img[^>]*data-src="([^"]+)"/);
  const posterUrl = imgM ? imgM[1] : void 0;
  const timeM1 = cardHtml.match(/<p class="imgtext4">([^<]*)<\/p>/);
  const timeM5 = cardHtml.match(/<p class="imgtext5">([^<]*)<\/p>/);
  const statusTime = (timeM1 ? timeM1[1] : timeM5 ? timeM5[1] : "").trim();
  const epM1 = cardHtml.match(/<p class="imgep">([^<]*)<\/p>/);
  const epM2 = cardHtml.match(/<p class="imgep2">([^<]*)<\/p>/);
  const epNote = (epM1 ? epM1[1] : epM2 ? epM2[1] : "").trim();
  let title = "";
  const titleM1 = cardHtml.match(/<td[^>]*class="date_title_"[^>]*>([\s\S]*?)<\/td>/);
  const titleM2 = cardHtml.match(/<td[^>]*class="date_title__"[^>]*>([\s\S]*?)<\/td>/);
  const titleRaw = titleM1 ? titleM1[1] : titleM2 ? titleM2[1] : "";
  if (titleRaw) {
    title = titleRaw.replace(/<br\s*\/?>/gi, "").replace(/\s+/g, "").trim();
  }
  if (!title || title.length < 2) return null;
  if (/^[\d\s\.\,\;\:\!\?\[\]\(\)【】\-–—]+$/.test(title)) return null;
  return { title, statusTime, epNote, group: day, quarterCode: qc, posterUrl };
}
var DAYS = ["\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D", "\u5468\u65E5"];
function wrapText(ctx, text, maxW, maxLines, fontPx) {
  const lines = [];
  let line = "";
  for (const ch of text) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line.length > 0) {
      lines.push(line);
      if (lines.length >= maxLines) {
        const last = lines[maxLines - 1];
        lines[maxLines - 1] = last.slice(0, -1) + "\u2026";
        return lines;
      }
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}
async function renderScheduleCanvas(items, opts) {
  const DPR = 3;
  const GAP = 10 * DPR;
  const PAD = 28 * DPR;
  const HEADER_H = 90 * DPR;
  const DAY_HDR = 42 * DPR;
  const POSTER_W = 160 * DPR;
  const POSTER_H = 224 * DPR;
  const INFO_H = 72 * DPR;
  const CARD_W = POSTER_W;
  const CARD_H = POSTER_H + INFO_H;
  const CARD_GAP_V = 6 * DPR;
  const TOTAL_W = PAD * 2 + DAYS.length * (CARD_W + GAP) - GAP;
  const grouped = {};
  DAYS.forEach((d) => {
    grouped[d] = [];
  });
  items.forEach((item) => {
    const d = DAYS.includes(item.group) ? item.group : "\u5468\u65E5";
    grouped[d].push(item);
  });
  DAYS.forEach((d) => {
    grouped[d].sort((a, b) => (a.statusTime || "99:99").localeCompare(b.statusTime || "99:99"));
  });
  const maxCards = Math.max(1, ...DAYS.map((d) => grouped[d].length));
  const bodyH = DAY_HDR + CARD_GAP_V + maxCards * (CARD_H + CARD_GAP_V);
  const TOTAL_H = HEADER_H + bodyH + 40 * DPR;
  const canvas = document.createElement("canvas");
  canvas.width = TOTAL_W;
  canvas.height = TOTAL_H;
  const ctx = canvas.getContext("2d");
  ctx.scale(DPR, DPR);
  const W = TOTAL_W / DPR;
  const H = TOTAL_H / DPR;
  const px = PAD / DPR;
  const gap = GAP / DPR;
  const cw = CARD_W / DPR;
  const ch = CARD_H / DPR;
  const pw = POSTER_W / DPR;
  const ph = POSTER_H / DPR;
  const ih = INFO_H / DPR;
  const dh = DAY_HDR / DPR;
  const hh = HEADER_H / DPR;
  const cardGapV = CARD_GAP_V / DPR;
  ctx.fillStyle = "#f6f0df";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#202027";
  ctx.font = "bold 28px Inter, -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(opts.title, px, 48);
  if (opts.subtitle) {
    ctx.fillStyle = "#67542f";
    ctx.font = "18px Inter, sans-serif";
    ctx.fillText(opts.subtitle, px, 70);
  }
  ctx.fillStyle = "#2f9ca8";
  ctx.font = '14px "JetBrains Mono", monospace';
  ctx.textAlign = "right";
  ctx.fillText("37\u5DE5\u5177\u7BB1 \xB7 yuc.wiki", W - px, 44);
  ctx.strokeStyle = "#e8a850";
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.12;
  ctx.beginPath();
  ctx.moveTo(px, hh);
  ctx.lineTo(W - px, hh);
  ctx.stroke();
  ctx.globalAlpha = 1;
  const posterCache = /* @__PURE__ */ new Map();
  const fetchImg = window.toolbox?.file?.fetchImage;
  await Promise.all(
    items.map(
      (item) => new Promise((resolve) => {
        if (!item.posterUrl || posterCache.has(item.posterUrl)) {
          resolve();
          return;
        }
        const load = (dataUrl) => {
          const img = new Image();
          img.onload = () => {
            posterCache.set(item.posterUrl, img);
            resolve();
          };
          img.onerror = () => {
            posterCache.set(item.posterUrl, null);
            resolve();
          };
          img.src = dataUrl;
        };
        if (fetchImg) {
          fetchImg(item.posterUrl).then((dataUrl) => {
            if (dataUrl) load(dataUrl);
            else {
              posterCache.set(item.posterUrl, null);
              resolve();
            }
          }).catch(() => {
            posterCache.set(item.posterUrl, null);
            resolve();
          });
        } else {
          const img = new Image();
          img.onload = () => {
            posterCache.set(item.posterUrl, img);
            resolve();
          };
          img.onerror = () => {
            posterCache.set(item.posterUrl, null);
            resolve();
          };
          img.src = item.posterUrl;
        }
        setTimeout(() => {
          if (!posterCache.has(item.posterUrl)) posterCache.set(item.posterUrl, null);
          resolve();
        }, 8e3);
      })
    )
  );
  DAYS.forEach((day, ci) => {
    const cx = px + ci * (cw + gap);
    const list = grouped[day];
    const cy = hh + 11;
    ctx.fillStyle = "#e8a850";
    ctx.beginPath();
    ctx.roundRect(cx, cy, cw, dh, 6);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${day} \xB7 ${list.length}\u90E8`, cx + cw / 2, cy + dh / 2 + 6);
    list.forEach((item, ri) => {
      const cardY = cy + dh + 4 + ri * (ch + cardGapV);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#e6e3d8";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.roundRect(cx, cardY, cw, ch, 5);
      ctx.fill();
      ctx.stroke();
      const poster = item.posterUrl ? posterCache.get(item.posterUrl) ?? null : null;
      if (poster) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(cx + 1, cardY + 1, pw - 2, ph - 2, [4, 4, 0, 0]);
        ctx.clip();
        const ir = poster.naturalWidth / poster.naturalHeight;
        const br = pw / ph;
        let sx = 0, sy = 0, sw = poster.naturalWidth, sh = poster.naturalHeight;
        if (ir > br) {
          sw = sh * br;
          sx = (poster.naturalWidth - sw) / 2;
        } else {
          sh = sw / br;
          sy = (poster.naturalHeight - sh) / 2;
        }
        ctx.drawImage(poster, sx, sy, sw, sh, cx + 1, cardY + 1, pw - 2, ph - 2);
        ctx.restore();
      } else {
        ctx.fillStyle = "#e0ddd5";
        ctx.beginPath();
        ctx.roundRect(cx + 1, cardY + 1, pw - 2, ph - 2, [4, 4, 0, 0]);
        ctx.fill();
        ctx.fillStyle = "#858592";
        ctx.font = "11px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("\u6682\u65E0\u6D77\u62A5", cx + pw / 2, cardY + ph / 2);
      }
      const titleY = cardY + ph + 5;
      const maxW = cw - 8;
      ctx.textAlign = "left";
      let fs;
      if (item.title.length > 22) fs = 12;
      else if (item.title.length > 16) fs = 14;
      else fs = 16;
      ctx.font = `bold ${fs}px Inter, -apple-system, sans-serif`;
      const lines = wrapText(ctx, item.title, maxW, 2, fs);
      lines.forEach((line, li) => {
        ctx.fillStyle = "#202027";
        ctx.fillText(line, cx + 4, titleY + (li + 1) * (fs + 2));
      });
      const timeY = titleY + lines.length * (fs + 2) + 2;
      const hasTime = item.statusTime && item.statusTime.length > 0;
      if (hasTime) {
        ctx.fillStyle = "#2f9ca8";
        ctx.font = "bold 12px Inter, sans-serif";
        ctx.fillText(item.statusTime, cx + 4, timeY + 12);
      }
      if (item.epNote) {
        const epY = hasTime ? timeY + 12 + 10 : timeY + 12;
        ctx.fillStyle = "#858592";
        ctx.font = "10px Inter, sans-serif";
        ctx.fillText(item.epNote, cx + 4, epY);
      }
      if (!hasTime && !item.epNote) {
        ctx.fillStyle = "#858592";
        ctx.font = "10px Inter, sans-serif";
        ctx.fillText("\u65F6\u95F4\u5F85\u5B9A", cx + 4, timeY + 12);
      }
    });
  });
  ctx.fillStyle = "#858592";
  ctx.font = "12px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("yuc.wiki \xB7 37\u5DE5\u5177\u7BB1", W / 2, H - 10);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("\u5BFC\u51FA\u5931\u8D25"));
    }, "image/png");
  });
}
function getSavedSelections(qc) {
  try {
    const raw = localStorage.getItem("37toolbox:anime-selections");
    return new Set(raw ? JSON.parse(raw)[qc] ?? [] : []);
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
function saveSelections(qc, titles) {
  try {
    const raw = localStorage.getItem("37toolbox:anime-selections");
    const data = raw ? JSON.parse(raw) : {};
    data[qc] = titles;
    localStorage.setItem("37toolbox:anime-selections", JSON.stringify(data));
  } catch {
  }
}

// packages/react-jsx-runtime-shim.js
var Fragment2 = react_global_shim_default.Fragment;
function jsx(type, props, key) {
  const nextProps = props ? { ...props } : {};
  if (key !== void 0) {
    nextProps.key = key;
  }
  return react_global_shim_default.createElement(type, nextProps);
}
var jsxs = jsx;

// src/plugins/anime-tracker/Tool.tsx
var DAYS2 = ["\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D", "\u5468\u65E5"];
var PixivTool = ({ onStatusChange }) => {
  const [quarters] = useState(() => getAvailableQuarters());
  const [selectedQuarter, setSelectedQuarter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [diagnostics, setDiagnostics] = useState("");
  const [items, setItems] = useState([]);
  const [selections, setSelections] = useState(/* @__PURE__ */ new Set());
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [showDiag, setShowDiag] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const doFetch = useCallback(async (qCode) => {
    if (!qCode) return;
    setLoading(true);
    setError("");
    setDiagnostics("");
    setItems([]);
    setPreviewUrl("");
    onStatusChange("running", "\u6293\u53D6\u756A\u5267\u5217\u8868...");
    const result = await fetchAnimeList(qCode);
    if (result.ok) {
      setItems(result.items);
      const saved = getSavedSelections(qCode);
      setSelections(saved);
      onStatusChange("success", `${result.items.length} \u90E8\u756A\u5267`);
    } else {
      setError(result.error);
      if ("diagnostics" in result && result.diagnostics) {
        setDiagnostics(result.diagnostics);
      }
      onStatusChange("error", result.error);
    }
    setLoading(false);
  }, [onStatusChange]);
  useEffect(() => {
    if (initialized) return;
    const last = localStorage.getItem("37toolbox:anime:last-quarter");
    const availableCodes = new Set(quarters.map((quarter) => quarter.code));
    setSelectedQuarter(last && availableCodes.has(last) ? last : quarters[0]?.code ?? getCurrentQuarterCode());
    setInitialized(true);
  }, [initialized, quarters]);
  useEffect(() => {
    if (!selectedQuarter || !initialized) return;
    localStorage.setItem("37toolbox:anime:last-quarter", selectedQuarter);
    doFetch(selectedQuarter);
  }, [selectedQuarter, initialized, doFetch]);
  const toggleItem = useCallback((title) => {
    setSelections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }, []);
  const toggleDay = useCallback((dayItems) => {
    setSelections((prev) => {
      const next = new Set(prev);
      const allSelected = dayItems.every((a) => next.has(a.title));
      if (allSelected) {
        dayItems.forEach((a) => next.delete(a.title));
      } else {
        dayItems.forEach((a) => next.add(a.title));
      }
      return next;
    });
  }, []);
  const handleSave = useCallback(() => {
    saveSelections(selectedQuarter, [...selections]);
    onStatusChange("success", `\u5DF2\u4FDD\u5B58 ${selections.size} \u90E8`);
  }, [selectedQuarter, selections, onStatusChange]);
  const handleGenerate = useCallback(async () => {
    const selected = items.filter((a) => selections.has(a.title));
    if (selected.length === 0) {
      setError("\u8BF7\u5148\u9009\u62E9\u81F3\u5C11\u4E00\u90E8\u756A\u5267");
      return;
    }
    setGenerating(true);
    setError("");
    onStatusChange("running", "\u751F\u6210\u65E5\u7A0B\u8868...");
    try {
      const q = quarters.find((q2) => q2.code === selectedQuarter);
      const blob = await renderScheduleCanvas(selected, {
        title: q?.label ?? selectedQuarter,
        subtitle: `${selected.length} \u90E8\u8FFD\u756A`
      });
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      onStatusChange("success", "\u65E5\u7A0B\u8868\u5DF2\u751F\u6210");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "\u6E32\u67D3\u5931\u8D25";
      setError(msg);
      onStatusChange("error", msg);
    }
    setGenerating(false);
  }, [items, selections, selectedQuarter, quarters, onStatusChange]);
  const grouped = useMemo(() => {
    const map = {};
    DAYS2.forEach((d) => {
      map[d] = [];
    });
    const others = [];
    items.forEach((item) => {
      if (DAYS2.includes(item.group)) map[item.group].push(item);
      else others.push(item);
    });
    if (others.length > 0) map["\u5176\u4ED6"] = others;
    return map;
  }, [items]);
  const dayKeys = [...DAYS2, ...grouped["\u5176\u4ED6"]?.length ? ["\u5176\u4ED6"] : []];
  const selectedCount = selections.size;
  const totalCount = items.length;
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-4", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-end gap-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-1", children: [
        /* @__PURE__ */ jsx("label", { className: "text-xs text-text-secondary", children: "\u9009\u62E9\u5B63\u5EA6" }),
        /* @__PURE__ */ jsxs(
          "select",
          {
            value: selectedQuarter,
            onChange: (e) => {
              setSelectedQuarter(e.target.value);
              setPreviewUrl("");
            },
            className: "rounded-sm border border-border bg-bg-sidebar px-3 py-2 text-sm text-text-primary min-w-[180px]",
            children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "-- \u9009\u62E9\u5B63\u5EA6 --" }),
              quarters.map((q) => /* @__PURE__ */ jsx("option", { value: q.code, children: q.label }, q.code))
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsx(
        "button",
        {
          disabled: !selectedQuarter || loading,
          onClick: () => doFetch(selectedQuarter),
          className: "inline-flex h-9 items-center rounded-sm bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50",
          children: loading ? "\u6293\u53D6\u4E2D..." : "\u83B7\u53D6\u756A\u5267\u5217\u8868"
        }
      )
    ] }),
    error && /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
      /* @__PURE__ */ jsx("div", { className: "rounded-md border border-status-error/30 bg-status-error/10 p-3 text-xs text-status-error", children: error }),
      diagnostics && /* @__PURE__ */ jsxs("details", { className: "rounded-md border border-border bg-bg-secondary", children: [
        /* @__PURE__ */ jsx(
          "summary",
          {
            className: "cursor-pointer px-3 py-2 text-xs text-text-secondary hover:text-text-primary",
            onClick: () => setShowDiag(!showDiag),
            children: "\u89E3\u6790\u8BCA\u65AD\u4FE1\u606F\uFF08\u7ED9 AI \u770B\u7684\uFF09"
          }
        ),
        showDiag && /* @__PURE__ */ jsx("pre", { className: "max-h-64 overflow-auto border-t border-border p-3 font-mono text-2xs text-text-muted whitespace-pre-wrap", children: diagnostics })
      ] })
    ] }),
    items.length > 0 && /* @__PURE__ */ jsxs(Fragment2, { children: [
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-3 rounded-md border border-border bg-bg-secondary px-4 py-2", children: [
        /* @__PURE__ */ jsxs("span", { className: "text-xs text-text-secondary", children: [
          "\u5DF2\u9009 ",
          /* @__PURE__ */ jsx("span", { className: "font-semibold text-accent", children: selectedCount }),
          " / ",
          totalCount,
          " \u90E8"
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex-1" }),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: handleSave,
            className: "inline-flex h-8 items-center rounded-sm border border-border bg-bg-secondary px-3 text-xs text-text-secondary hover:bg-bg-hover",
            children: "\u4FDD\u5B58\u9009\u62E9"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            disabled: selectedCount === 0 || generating,
            onClick: handleGenerate,
            className: "inline-flex h-8 items-center rounded-sm bg-accent px-4 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50",
            children: generating ? "\u751F\u6210\u4E2D..." : "\u751F\u6210\u65E5\u7A0B\u8868"
          }
        ),
        previewUrl && /* @__PURE__ */ jsx(
          "a",
          {
            href: previewUrl,
            download: `\u8FFD\u756A\u65E5\u7A0B_${selectedQuarter}.png`,
            className: "inline-flex h-8 items-center rounded-sm border border-border bg-bg-secondary px-3 text-xs text-text-secondary hover:bg-bg-hover",
            children: "\u4E0B\u8F7D PNG"
          }
        )
      ] }),
      /* @__PURE__ */ jsx("div", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", children: dayKeys.map((day) => {
        const dayItems = grouped[day] ?? [];
        if (dayItems.length === 0) return null;
        const allChecked = dayItems.every((a) => selections.has(a.title));
        const someChecked = dayItems.some((a) => selections.has(a.title));
        return /* @__PURE__ */ jsxs("div", { className: "flex flex-col rounded-md border border-border bg-bg-secondary", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 border-b border-border px-3 py-2", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "checkbox",
                checked: allChecked,
                ref: (el) => {
                  if (el) el.indeterminate = someChecked && !allChecked;
                },
                onChange: () => toggleDay(dayItems),
                className: "accent-[var(--accent)]"
              }
            ),
            /* @__PURE__ */ jsx("span", { className: "text-sm font-medium text-text-primary", children: day }),
            /* @__PURE__ */ jsxs("span", { className: "text-2xs text-text-muted", children: [
              dayItems.length,
              "\u90E8"
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "flex-1 space-y-0.5 overflow-y-auto p-1.5", children: dayItems.map((item) => /* @__PURE__ */ jsxs(
            "label",
            {
              className: `flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 transition hover:bg-bg-hover ${selections.has(item.title) ? "bg-accent-subtle" : ""}`,
              children: [
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "checkbox",
                    checked: selections.has(item.title),
                    onChange: () => toggleItem(item.title),
                    className: "mt-0.5 accent-[var(--accent)]"
                  }
                ),
                /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
                  /* @__PURE__ */ jsx("div", { className: "truncate text-xs font-medium text-text-primary", children: item.title }),
                  /* @__PURE__ */ jsxs("div", { className: "flex gap-2 text-2xs text-text-muted", children: [
                    item.statusTime && /* @__PURE__ */ jsx("span", { children: item.statusTime }),
                    item.epNote && /* @__PURE__ */ jsx("span", { children: item.epNote })
                  ] })
                ] })
              ]
            },
            item.title
          )) })
        ] }, day);
      }) })
    ] }),
    previewUrl && /* @__PURE__ */ jsxs("div", { className: "rounded-md border border-border bg-bg-secondary p-4", children: [
      /* @__PURE__ */ jsx("p", { className: "mb-2 text-xs text-text-secondary", children: "\u65E5\u7A0B\u8868\u9884\u89C8" }),
      /* @__PURE__ */ jsx(
        "img",
        {
          src: previewUrl,
          alt: "\u8FFD\u756A\u65E5\u7A0B\u8868",
          className: "max-w-full rounded-sm border border-border shadow-sm"
        }
      )
    ] }),
    !loading && !error && items.length === 0 && /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-center", children: [
      /* @__PURE__ */ jsx("div", { className: "text-4xl mb-3 opacity-30", children: "\u{1F4FA}" }),
      /* @__PURE__ */ jsx("p", { className: "text-sm font-medium text-text-secondary", children: "\u9009\u62E9\u5B63\u5EA6\u83B7\u53D6\u756A\u5267\u5217\u8868" }),
      /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-text-muted", children: "\u6570\u636E\u6765\u81EA yuc.wiki \u957F\u95E8\u756A\u5802" })
    ] })
  ] });
};
var Tool_default = PixivTool;
export {
  Tool_default as default,
  manifest
};
