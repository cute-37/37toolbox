// @author: claude | phase: v0.5 | anime-tracker .37tool package
// 独立 .37tool 包 — 无需 JSX 编译，直接用 React.createElement
// yuc.wiki 数据源，带前端 UI + Canvas 日程表导出

var h = React.createElement;
var DAYS = ["周一","周二","周三","周四","周五","周六","周日"];
var Q_CACHE = "37toolbox:anime:v5:";

function getCurrentQuarterCode() {
  var m = new Date().getMonth() + 1;
  var y = new Date().getFullYear();
  if (m <= 3) return y + "01";
  if (m <= 6) return y + "04";
  if (m <= 9) return y + "07";
  return y + "10";
}

function getAvailableQuarters() {
  var y = new Date().getFullYear();
  var qs = [];
  for (var yr = y + 1; yr >= 2020; yr--) {
    qs.push({ code: yr + "10", label: yr + "年秋季" });
    qs.push({ code: yr + "07", label: yr + "年夏季" });
    qs.push({ code: yr + "04", label: yr + "年春季" });
    qs.push({ code: yr + "01", label: yr + "年冬季" });
  }
  return qs.filter(function (q) { return parseInt(q.code.slice(0,4)) <= y + 1; });
}

var DAY_CN = [
  ["周一","周一"],["周二","周二"],["周三","周三"],
  ["周四","周四"],["周五","周五"],["周六","周六"],["周日","周日"]
];

function parseDayFromComment(html) {
  var all = [];
  DAY_CN.forEach(function (entry) {
    var re = new RegExp("<!--" + entry[0] + "-->", "g");
    var m;
    while ((m = re.exec(html)) !== null) all.push({ day: entry[1], pos: m.index });
  });
  all.sort(function (a, b) { return a.pos - b.pos; });
  return all;
}

function parseCards(html) {
  var items = [];
  var chunks = html.split('<div style="float:left">').slice(1);
  chunks.forEach(function (chunk) {
    var endIdx = chunk.search(/<div style="float:left">|<div style="clear:both">|<!--/);
    var card = endIdx >= 0 ? chunk.slice(0, endIdx) : chunk;

    var imgM = card.match(/<img[^>]*data-src="([^"]+)"/);
    var poster = imgM ? imgM[1] : undefined;

    var timeM1 = card.match(/<p class="imgtext4">([^<]*)<\/p>/);
    var timeM5 = card.match(/<p class="imgtext5">([^<]*)<\/p>/);
    var statusTime = (timeM1 ? timeM1[1] : timeM5 ? timeM5[1] : "").trim();

    var epM1 = card.match(/<p class="imgep">([^<]*)<\/p>/);
    var epM2 = card.match(/<p class="imgep2">([^<]*)<\/p>/);
    var epNote = (epM1 ? epM1[1] : epM2 ? epM2[1] : "").trim();

    var titleM1 = card.match(/<td[^>]*class="date_title_"[^>]*>([\s\S]*?)<\/td>/);
    var titleM2 = card.match(/<td[^>]*class="date_title__"[^>]*>([\s\S]*?)<\/td>/);
    var titleRaw = titleM1 ? titleM1[1] : titleM2 ? titleM2[1] : "";
    var title = titleRaw.replace(/<br\s*\/?>/gi, "").replace(/\s+/g, "").trim();

    if (!title || title.length < 2) return;
    if (/^[\d\s\.,;:!?\[\]\(\)【】\-]+$/.test(title)) return;

    var group = "";
    var fullText = card.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    DAYS.forEach(function (d) {
      if (fullText.indexOf(d) >= 0) group = d;
    });

    items.push({ title: title, statusTime: statusTime, epNote: epNote, group: group, quarterCode: "", posterUrl: poster });
  });
  return items;
}

function fetchAnimeList(quarterCode) {
  var cacheKey = Q_CACHE + quarterCode;
  try {
    var cached = localStorage.getItem(cacheKey);
    if (cached) {
      var arr = JSON.parse(cached);
      if (Array.isArray(arr) && arr.length > 0) return Promise.resolve({ ok: true, items: arr });
    }
  } catch (e) {}

  var url = "https://yuc.wiki/" + quarterCode;
  return fetch(url).then(function (r) {
    if (!r.ok) return { ok: false, error: "HTTP " + r.status };
    return r.text().then(function (html) {
      if (html.length < 1000) return { ok: false, error: "页面过短" };
      return parseAnimeFromHtml(html, quarterCode);
    });
  }).catch(function (e) {
    return { ok: false, error: "请求失败: " + (e.message || "网络错误") };
  });
}

function parseAnimeFromHtml(html, qc) {
  var dayPositions = parseDayFromComment(html);
  if (dayPositions.length < 2) {
    var date2Re = /<td class="date2">(.*?)<\/td>/g;
    var dm;
    while ((dm = date2Re.exec(html)) !== null) {
      var text = dm[1];
      DAY_CN.forEach(function (entry) {
        if (text.indexOf(entry[0]) >= 0 || text.indexOf(entry[0].replace("周","曜")) >= 0) {
          dayPositions.push({ day: entry[1], pos: dm.index });
        }
      });
    }
    dayPositions.sort(function (a, b) { return a.pos - b.pos; });
  }

  var all = [];
  for (var i = 0; i < dayPositions.length; i++) {
    var start = dayPositions[i].pos;
    var end = i + 1 < dayPositions.length ? dayPositions[i + 1].pos : html.length;
    var items = parseCards(html.slice(start, end));
    var day = dayPositions[i].day;
    items.forEach(function (item) { item.group = day; item.quarterCode = qc; });
    all = all.concat(items);
  }

  var seen = {};
  var uniq = all.filter(function (a) {
    var k = a.title.slice(0, 25);
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });

  if (uniq.length === 0) return { ok: false, error: "未能解析出番剧数据" };

  try { localStorage.setItem(Q_CACHE + qc, JSON.stringify(uniq)); } catch (e) {}
  return { ok: true, items: uniq };
}

// ===================== React Component =====================

function StatCard(props) {
  return h("div", { className: "rounded-md border border-border bg-bg-secondary p-3 text-center flex-1" },
    h("div", { className: "text-sm font-semibold text-text-primary" }, String(props.value)),
    h("div", { className: "text-2xs text-text-secondary" }, props.label)
  );
}

function DayCard(props) {
  var item = props.item;
  var selected = props.selected;
  var toggle = props.toggle;
  return h("div", {
    className: "rounded-md border border-border bg-bg-secondary p-2 cursor-pointer transition " +
      (selected ? "border-accent bg-accent-subtle" : "hover:bg-bg-hover"),
    onClick: function () { toggle(item.title); }
  },
    h("div", { className: "text-xs font-medium text-text-primary truncate" }, item.title),
    h("div", { className: "text-2xs text-text-secondary mt-0.5" },
      (item.statusTime || "?") + " " + (item.epNote || "")
    )
  );
}

function AnimeTrackerTool(props) {
  var onStatusChange = props.onStatusChange || function () {};
  var quarters = React.useMemo(function () { return getAvailableQuarters(); }, []);
  var [selectedQuarter, setSelectedQuarter] = React.useState("");
  var [items, setItems] = React.useState([]);
  var [selections, setSelections] = React.useState({});
  var [loading, setLoading] = React.useState(false);
  var [error, setError] = React.useState("");
  var [exporting, setExporting] = React.useState(false);

  React.useEffect(function () {
    var last = localStorage.getItem("37toolbox:anime:last-quarter");
    setSelectedQuarter(last || getCurrentQuarterCode());
  }, []);

  React.useEffect(function () {
    if (!selectedQuarter) return;
    localStorage.setItem("37toolbox:anime:last-quarter", selectedQuarter);
    setLoading(true); setError(""); setItems([]);
    onStatusChange("running", "正在抓取...");
    fetchAnimeList(selectedQuarter).then(function (result) {
      if (result.ok) {
        setItems(result.items);
        var saved = {};
        try {
          var raw = localStorage.getItem("37toolbox:anime-selections");
          if (raw) {
            var data = JSON.parse(raw);
            var arr = data[selectedQuarter] || [];
            arr.forEach(function (t) { saved[t] = true; });
          }
        } catch (e) {}
        setSelections(saved);
        onStatusChange("success", result.items.length + " 部番剧");
      } else {
        setError(result.error);
        onStatusChange("error", result.error);
      }
      setLoading(false);
    });
  }, [selectedQuarter]);

  var grouped = React.useMemo(function () {
    var g = {};
    DAYS.forEach(function (d) { g[d] = []; });
    items.forEach(function (item) {
      var day = DAYS.indexOf(item.group) >= 0 ? item.group : "周日";
      g[day].push(item);
    });
    DAYS.forEach(function (d) { g[d].sort(function (a, b) { return (a.statusTime || "99:99").localeCompare(b.statusTime || "99:99"); }); });
    return g;
  }, [items]);

  var selectedCount = Object.keys(selections).length;

  var toggleItem = function (title) {
    setSelections(function (prev) {
      var next = Object.assign({}, prev);
      if (next[title]) delete next[title];
      else next[title] = true;
      var titles = Object.keys(next);
      if (titles.length > 0) {
        try { localStorage.setItem("37toolbox:anime-selections", JSON.stringify((((_c) => { var d; try { var r = localStorage.getItem("37toolbox:anime-selections"); d = r ? JSON.parse(r) : {}; } catch(e) { d = {}; } d[selectedQuarter] = titles; return d; })()))); } catch (e) {}
      }
      return next;
    });
  };

  var toggleDay = function (dayItems) {
    setSelections(function (prev) {
      var allSelected = dayItems.every(function (a) { return prev[a.title]; });
      var next = Object.assign({}, prev);
      dayItems.forEach(function (a) {
        if (allSelected) delete next[a.title];
        else next[a.title] = true;
      });
      return next;
    });
  };

  var exportImage = function () {
    if (selectedCount === 0) return;
    setExporting(true);
    var sel = items.filter(function (item) { return selections[item.title]; });
    var q = quarters.find(function (qq) { return qq.code === selectedQuarter; });
    var title = (q ? q.label : selectedQuarter) + " 追番日程";
    var subtitle = selectedCount + "部追番";
    renderScheduleCanvas(sel, { title: title, subtitle: subtitle }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = (q ? q.label : "schedule") + ".png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExporting(false);
    }).catch(function () { setExporting(false); });
  };

  if (loading) return h("div", { className: "flex items-center justify-center py-12" },
    h("p", { className: "text-sm text-text-secondary" }, "正在抓取番剧列表...")
  );

  return h("div", { className: "flex flex-col gap-4" },
    // season selector + export button
    h("div", { className: "flex flex-wrap items-center gap-3" },
      h("select", {
        value: selectedQuarter,
        onChange: function (e) { setSelectedQuarter(e.target.value); },
        className: "rounded-sm border border-border bg-bg-secondary px-3 py-1.5 text-sm text-text-primary"
      },
        quarters.map(function (q) {
          return h("option", { key: q.code, value: q.code }, q.label);
        })
      ),
      h("button", {
        disabled: selectedCount === 0 || exporting,
        onClick: exportImage,
        className: "inline-flex h-8 items-center rounded-sm bg-accent px-4 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
      }, exporting ? "生成中..." : "导出日程表 (" + selectedCount + "部)")
    ),

    // stats
    items.length > 0 && h("div", { className: "flex flex-wrap gap-2" },
      StatCard({ label: "番剧", value: items.length }),
      StatCard({ label: "已选", value: selectedCount })
    ),

    // error
    error && h("div", { className: "rounded-md border border-status-error/30 bg-status-error/10 p-3 text-xs text-status-error" }, error),

    // day grid
    items.length > 0 && h("div", { className: "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7" },
      DAYS.map(function (day) {
        var list = grouped[day];
        return h("div", { key: day, className: "space-y-1" },
          h("div", {
            className: "flex items-center justify-between rounded-sm px-2 py-1 text-xs font-bold text-white",
            style: { background: "var(--accent)" }
          },
            h("span", null, day),
            h("span", null, list.length)
          ),
          list.map(function (item) {
            return h(DayCard, {
              key: item.title,
              item: item,
              selected: !!selections[item.title],
              toggle: toggleItem
            });
          }),
          list.length === 0 && h("div", { className: "text-2xs text-text-muted px-2" }, "—")
        );
      })
    ),

    // empty
    items.length === 0 && !error && h("div", { className: "flex flex-col items-center py-8 text-text-muted" },
      h("p", { className: "text-sm" }, "选择一个季度开始浏览番剧"),
      h("p", { className: "text-xs mt-1" }, "数据来源：yuc.wiki 长门番堂")
    )
  );
}

// ===================== Canvas export =====================

function wrapText(ctx, text, maxW, maxLines, fs) {
  var lines = [];
  var line = "";
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    var test = line + ch;
    if (ctx.measureText(test).width > maxW && line.length > 0) {
      lines.push(line);
      if (lines.length >= maxLines) return lines;
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function renderScheduleCanvas(items, opts) {
  var DPR = 2;
  var GAP = 10 * DPR, PAD = 24 * DPR, HEADER_H = 70 * DPR, DAY_HDR = 36 * DPR;
  var PW = 120 * DPR, PH = 168 * DPR, IH = 50 * DPR;
  var CW = PW, CH = PH + IH, CARD_GAP = 6 * DPR;
  var TW = PAD * 2 + DAYS.length * (CW + GAP) - GAP;

  var grouped = {};
  DAYS.forEach(function (d) { grouped[d] = []; });
  items.forEach(function (item) {
    var d = DAYS.indexOf(item.group) >= 0 ? item.group : "周日";
    grouped[d].push(item);
  });
  DAYS.forEach(function (d) { grouped[d].sort(function (a, b) { return (a.statusTime || "99:99").localeCompare(b.statusTime || "99:99"); }); });

  var maxCards = Math.max.apply(null, DAYS.map(function (d) { return grouped[d].length; }));
  var TH = HEADER_H + DAY_HDR + GAP + maxCards * (CH + CARD_GAP) + 30 * DPR;

  var canvas = document.createElement("canvas");
  canvas.width = TW;
  canvas.height = TH;
  var ctx = canvas.getContext("2d");
  ctx.scale(DPR, DPR);

  var W = TW / DPR, H = TH / DPR;
  var px = PAD / DPR, gap = GAP / DPR, cw = CW / DPR, ch = CH / DPR;
  var pw = PW / DPR, ph = PH / DPR, dh = DAY_HDR / DPR, hh = HEADER_H / DPR;
  var cardGap = CARD_GAP / DPR;

  ctx.fillStyle = "#f6f0df";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#202027";
  ctx.font = "bold 24px Inter, -apple-system, sans-serif";
  ctx.fillText(opts.title, px, 42);
  if (opts.subtitle) {
    ctx.fillStyle = "#67542f";
    ctx.font = "15px Inter, sans-serif";
    ctx.fillText(opts.subtitle, px, 66);
  }

  ctx.fillStyle = "#2f9ca8";
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textAlign = "right";
  ctx.fillText("37工具箱 · yuc.wiki", W - px, 40);

  // preload posters
  var posterCache = {};
  var loadPromises = items.map(function (item) {
    return new Promise(function (resolve) {
      if (!item.posterUrl || posterCache[item.posterUrl]) return resolve();
      var img = new Image();
      img.onload = function () { posterCache[item.posterUrl] = img; resolve(); };
      img.onerror = function () { posterCache[item.posterUrl] = null; resolve(); };
      img.src = item.posterUrl;
      setTimeout(function () { if (!posterCache[item.posterUrl]) { posterCache[item.posterUrl] = null; resolve(); } }, 4000);
    });
  });

  return Promise.all(loadPromises).then(function () {
    DAYS.forEach(function (day, ci) {
      var cx = px + ci * (cw + gap);
      var cy = hh + 8;
      var list = grouped[day];

      ctx.fillStyle = "#e8a850";
      ctx.beginPath();
      ctx.roundRect(cx, cy, cw, dh, 5);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 13px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(day + " · " + list.length, cx + cw / 2, cy + dh / 2 + 5);

      list.forEach(function (item, ri) {
        var cardY = cy + dh + 4 + ri * (ch + cardGap);

        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#e6e3d8";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.roundRect(cx, cardY, cw, ch, 4);
        ctx.fill();
        ctx.stroke();

        var poster = item.posterUrl ? posterCache[item.posterUrl] : null;
        if (poster) {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(cx + 1, cardY + 1, pw - 2, ph - 2, [4, 4, 0, 0]);
          ctx.clip();
          var ir = poster.naturalWidth / poster.naturalHeight;
          var br = pw / ph;
          var sx = 0, sy = 0, sw = poster.naturalWidth, sh = poster.naturalHeight;
          if (ir > br) { sw = sh * br; sx = (poster.naturalWidth - sw) / 2; }
          else { sh = sw / br; sy = (poster.naturalHeight - sh) / 2; }
          ctx.drawImage(poster, sx, sy, sw, sh, cx + 1, cardY + 1, pw - 2, ph - 2);
          ctx.restore();
        } else {
          ctx.fillStyle = "#e0ddd5";
          ctx.beginPath();
          ctx.roundRect(cx + 1, cardY + 1, pw - 2, ph - 2, [4, 4, 0, 0]);
          ctx.fill();
          ctx.fillStyle = "#858592";
          ctx.font = "10px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("暂无海报", cx + pw / 2, cardY + ph / 2);
        }

        var titleY = cardY + ph + 5;
        var maxW = cw - 6;
        ctx.textAlign = "left";
        ctx.font = "bold 11px Inter, sans-serif";
        var lines = wrapText(ctx, item.title, maxW, 2, 11);
        lines.forEach(function (line, li) {
          ctx.fillStyle = "#202027";
          ctx.fillText(line, cx + 3, titleY + (li + 1) * 12);
        });

        var subY = titleY + lines.length * 12 + 2;
        ctx.fillStyle = "#2f9ca8";
        ctx.font = "bold 9px Inter, sans-serif";
        ctx.fillText(item.statusTime || "", cx + 3, subY + 10);
      });
    });

    ctx.fillStyle = "#858592";
    ctx.font = "9px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("yuc.wiki · 37工具箱", W / 2, H - 10);

    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error("导出失败"));
      }, "image/png");
    });
  });
}

// ===================== Module exports =====================

var manifest = {
  id: "anime-tracker",
  name: "追番日程表",
  description: "制作属于自己的追番列表",
  category: "daily",
  version: "1.0.0",
  icon: "calendar",
  tags: ["anime", "tracker", "schedule", "yuc"],
  hasSettings: false
};

export { manifest };
export default AnimeTrackerTool;
