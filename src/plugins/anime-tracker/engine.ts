// @author: claude | phase: anime-tracker | engine | v5: verified against yuc_202607.html
// ================================================================
// 追番日程表引擎 — yuc.wiki (长门番堂)
// ================================================================
// 【AI 维护手册 — 基于真实 HTML 验证 2026-06-27】
// yuc.wiki DOM 结构 (Hexo 生成):
//   <!--周一--> → <div><table class="date_"><tr><td class="date2">周一 (月)</td>...
//   每个番剧卡片: <div style="float:left">
//     <div class="div_date">
//       <p class="imgtext4">21:00~</p>           ← 播出时间
//       <p class="imgep2">6/29~</p> 或 <p class="imgep">(全24话)</p> ← 日期/话数
//       <img width="120px" data-src="https://i0.hdslb.com/..." referrerPolicy="no-referrer"> ← 海报
//     </div>
//     <div><table width="120px">
//       <tr><td class="date_title_">番剧名</td></tr>  ← 标题 (可能含 <br>)
//       <tr class="tr_area"><td>...</td></tr>          ← 版权区域
//     </table></div>
//   </div>
//   <div style="clear:both"></div>  ← 每天结束后清浮动
// 若结构变化: 打开 yuc.wiki/202607 Ctrl+S 保存 HTML，对比此注释修改。
// ================================================================

export interface AnimeItem {
  title: string;
  statusTime: string;
  epNote: string;
  group: string;
  quarterCode: string;
  posterUrl?: string;
}

export interface Quarter { code: string; label: string }

export function getCurrentQuarterCode(): string {
  const m = new Date().getMonth() + 1;
  const y = new Date().getFullYear();
  if (m <= 3) return `${y}01`; if (m <= 6) return `${y}04`;
  if (m <= 9) return `${y}07`; return `${y}10`;
}

export function getAvailableQuarters(): Quarter[] {
  const y = new Date().getFullYear();
  const m = new Date().getMonth() + 1;
  // 计算当前季度码
  const curY = m <= 3 ? y - 1 : y;
  const curM = m <= 3 ? '10' : m <= 6 ? '01' : m <= 9 ? '04' : '07';
  // 只显示到"当前季度 + 下一季度"（例如 7 月显示 07 和 10）
  const maxQuarterCode = m <= 3 ? `${y}04` : m <= 6 ? `${y}07` : m <= 9 ? `${y}10` : `${y + 1}01`;

  const qs: Quarter[] = [];
  const labels: Record<string, string> = { '01': '冬季', '04': '春季', '07': '夏季', '10': '秋季' };
  for (let yr = y; yr >= 2020; yr--) {
    for (const qm of ['10', '07', '04', '01']) {
      const code = `${yr}${qm}`;
      if (code > maxQuarterCode) continue;               // 跳过还没到的
      qs.push({ code, label: `${yr}年${labels[qm]}` });
    }
  }
  return qs;
}

// ======================================================================

const CACHE_VER = 'v5';
const CACHE_PFX = `37toolbox:anime:${CACHE_VER}:`;

// 清除旧版本缓存
(function cleanOld() {
  const olds = ['37toolbox:anime:', '37toolbox:anime:v2:', '37toolbox:anime:v3:', '37toolbox:anime:v4:'];
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && olds.some((p) => k.startsWith(p) && !k.startsWith(CACHE_PFX))) {
      localStorage.removeItem(k);
    }
  }
})();

const DAY_NAMES: [string, string][] = [
  ['周一', '周一'], ['周二', '周二'], ['周三', '周三'],
  ['周四', '周四'], ['周五', '周五'], ['周六', '周六'], ['周日', '周日'],
];

export async function fetchAnimeList(quarterCode: string): Promise<{ ok: true; items: AnimeItem[] } | { ok: false; error: string; diagnostics?: string }> {
  const cacheKey = `${CACHE_PFX}${quarterCode}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const items: AnimeItem[] = JSON.parse(cached);
      if (Array.isArray(items) && items.length > 0) {
        console.log(`[AnimeTracker] 缓存: ${items.length} 部`);
        return { ok: true, items };
      }
    } catch {}
  }

  const url = `https://yuc.wiki/${quarterCode}`;
  console.log(`[AnimeTracker] GET ${url}`);
  try {
    const r = await fetch(url);
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const html = await r.text();
    if (html.length < 1000) return { ok: false, error: '页面过短' };
    return parse(html, quarterCode, url, cacheKey);
  } catch (e: unknown) {
    return { ok: false, error: `请求: ${e instanceof Error ? e.message : ''}` };
  }
}

// ======================================================================
// 核心解析 — 基于 comment 标记定位星期
// ======================================================================

function parse(html: string, qc: string, url: string, cacheKey: string): { ok: true; items: AnimeItem[] } | { ok: false; error: string; diagnostics?: string } {
  const D: string[] = [url, qc, `size:${html.length}`];

  // 找所有 <!--周X--> 注释位置
  const dayPositions: { day: string; pos: number }[] = [];
  for (const [cn, day] of DAY_NAMES) {
    const re = new RegExp(`<!--${cn}-->`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      dayPositions.push({ day, pos: m.index });
    }
  }
  dayPositions.sort((a, b) => a.pos - b.pos);

  D.push(`day markers: ${dayPositions.map((d) => d.day).join(',')}`);

  if (dayPositions.length < 2) {
    // fallback: try matching <td class="date2">
    const date2Re = /<td class="date2">(.*?)<\/td>/g;
    let dm: RegExpExecArray | null;
    while ((dm = date2Re.exec(html)) !== null) {
      const text = dm[1];
      for (const [cn, day] of DAY_NAMES) {
        if (text.includes(cn) || text.includes(cn.replace('周', '曜'))) {
          dayPositions.push({ day, pos: dm.index });
          break;
        }
      }
    }
    dayPositions.sort((a, b) => a.pos - b.pos);
    D.push(`fallback markers: ${dayPositions.map((d) => d.day).join(',')}`);
  }

  // 为每个星期区段提取卡片
  const allItems: AnimeItem[] = [];

  for (let i = 0; i < dayPositions.length; i++) {
    const start = dayPositions[i].pos;
    const end = i + 1 < dayPositions.length ? dayPositions[i + 1].pos : html.length;
    const section = html.slice(start, end);
    const items = parseCards(section, dayPositions[i].day, qc);
    allItems.push(...items);
    D.push(`${dayPositions[i].day}: ${items.length} 部`);
  }

  D.push(`合计: ${allItems.length} 部`);

  const diag = D.join('\n');
  console.log('[AnimeTracker]\n' + diag);

  // 去重
  const seen = new Set<string>();
  const uniq = allItems.filter((a) => {
    const key = a.title.slice(0, 25);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (uniq.length === 0) {
    return { ok: false, error: `解析到 0 部番剧`, diagnostics: diag };
  }

  try { localStorage.setItem(cacheKey, JSON.stringify(uniq)); } catch {}
  return { ok: true, items: uniq };
}

/**
 * 从一段星期区段的 HTML 中提取所有番剧卡片。
 * 卡片特征: <div style="float:left"> 内含 div_date + date_title_
 */
function parseCards(html: string, day: string, qc: string): AnimeItem[] {
  const items: AnimeItem[] = [];

  // 按 <div style="float:left"> 切分, 每段是一个卡片
  const chunks = html.split('<div style="float:left">').slice(1);
  for (const chunk of chunks) {
    // 卡片内容止于下一个 float:left 或 clear:both 或 <!-- 注释
    const endIdx = chunk.search(/<div style="float:left">|<div style="clear:both">|<!--/);
    const cardHtml = endIdx >= 0 ? chunk.slice(0, endIdx) : chunk;
    const item = parseCard(cardHtml, day, qc);
    if (item) items.push(item);
  }
  return items;
}

function parseCard(cardHtml: string, day: string, qc: string): AnimeItem | null {
  // 海报 URL (data-src)
  const imgM = cardHtml.match(/<img[^>]*data-src="([^"]+)"/);
  const posterUrl = imgM ? imgM[1] : undefined;

  // 时间: p.imgtext4 或 p.imgtext5
  const timeM1 = cardHtml.match(/<p class="imgtext4">([^<]*)<\/p>/);
  const timeM5 = cardHtml.match(/<p class="imgtext5">([^<]*)<\/p>/);
  const statusTime = (timeM1 ? timeM1[1] : timeM5 ? timeM5[1] : '').trim();

  // 话数/日期: p.imgep 或 p.imgep2
  const epM1 = cardHtml.match(/<p class="imgep">([^<]*)<\/p>/);
  const epM2 = cardHtml.match(/<p class="imgep2">([^<]*)<\/p>/);
  const epNote = (epM1 ? epM1[1] : epM2 ? epM2[1] : '').trim();

  // 标题: td.date_title_ 或 td.date_title__ (可能含 <br>)
  let title = '';
  const titleM1 = cardHtml.match(/<td[^>]*class="date_title_"[^>]*>([\s\S]*?)<\/td>/);
  const titleM2 = cardHtml.match(/<td[^>]*class="date_title__"[^>]*>([\s\S]*?)<\/td>/);
  const titleRaw = titleM1 ? titleM1[1] : titleM2 ? titleM2[1] : '';
  if (titleRaw) {
    title = titleRaw.replace(/<br\s*\/?>/gi, '').replace(/\s+/g, '').trim();
  }

  if (!title || title.length < 2) return null;
  // 过滤非番名（纯标点、纯数字）
  if (/^[\d\s\.\,\;\:\!\?\[\]\(\)【】\-–—]+$/.test(title)) return null;

  return { title, statusTime, epNote, group: day, quarterCode: qc, posterUrl };
}

// ======================================================================
// Canvas 日程表 — 高清 2x, 7 列横排, 海报大图在上, 标题和播出时间在下
// ======================================================================

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export interface RenderOptions { title: string; subtitle?: string }

/**
 * Canvas 文本自动换行: 逐字测量宽度, 超出 maxW 则换行。最多 maxLines 行, 超出加 "…"。
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number, fontPx: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxW && line.length > 0) {
      lines.push(line);
      if (lines.length >= maxLines) {
        // 最后一行裁剪加省略号
        const last = lines[maxLines - 1];
        lines[maxLines - 1] = last.slice(0, -1) + '…';
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

export async function renderScheduleCanvas(items: AnimeItem[], opts: RenderOptions): Promise<Blob> {
  const DPR = 3;                    // 3x 高清
  const GAP = 10 * DPR;            // 列间距
  const PAD = 28 * DPR;            // 页边距
  const HEADER_H = 90 * DPR;       // [改] 拉高避开subtitle与分割线紧贴
  const DAY_HDR = 42 * DPR;        // 星期标题行 (微增以容纳更大字号)
  const POSTER_W = 160 * DPR;      // 海报宽
  const POSTER_H = 224 * DPR;      // 海报高 (14:10 比例)
  const INFO_H = 72 * DPR;         // [改] epNote 另起一行需要更多空间
  const CARD_W = POSTER_W;
  const CARD_H = POSTER_H + INFO_H;
  const CARD_GAP_V = 6 * DPR;      // 卡片垂直间距 (紧凑)
  const TOTAL_W = PAD * 2 + DAYS.length * (CARD_W + GAP) - GAP;

  // 分组
  const grouped: Record<string, AnimeItem[]> = {};
  DAYS.forEach((d) => { grouped[d] = []; });
  items.forEach((item) => {
    const d = DAYS.includes(item.group) ? item.group : '周日';
    grouped[d].push(item);
  });
  DAYS.forEach((d) => {
    grouped[d].sort((a, b) => (a.statusTime || '99:99').localeCompare(b.statusTime || '99:99'));
  });

  const maxCards = Math.max(1, ...DAYS.map((d) => grouped[d].length));
  const bodyH = DAY_HDR + CARD_GAP_V + maxCards * (CARD_H + CARD_GAP_V);
  const TOTAL_H = HEADER_H + bodyH + 40 * DPR;

  const canvas = document.createElement('canvas');
  canvas.width = TOTAL_W;
  canvas.height = TOTAL_H;
  const ctx = canvas.getContext('2d')!;
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

  // 背景
  ctx.fillStyle = '#f6f0df';
  ctx.fillRect(0, 0, W, H);

  // 标题
  ctx.fillStyle = '#202027';
  ctx.font = 'bold 28px Inter, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(opts.title, px, 48);
  if (opts.subtitle) {
    ctx.fillStyle = '#67542f';
    ctx.font = '18px Inter, sans-serif';                   // [改5] subtitle 字号加大
    ctx.fillText(opts.subtitle, px, 70);                   // [改5] 整体上移 2px (74→70)
  }
  ctx.fillStyle = '#2f9ca8';
  ctx.font = '14px "JetBrains Mono", monospace';           // [改4] 顶部右侧字号 12→14
  ctx.textAlign = 'right';
  ctx.fillText('37工具箱 · yuc.wiki', W - px, 44);        // [改4] 同步微调垂直位置

  ctx.strokeStyle = '#e8a850';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.12;
  ctx.beginPath();
  ctx.moveTo(px, hh);
  ctx.lineTo(W - px, hh);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 预加载海报: 通过 Electron 主进程下载 (绕过浏览器 CORS 限制)
  const posterCache = new Map<string, HTMLImageElement | null>();
  const fetchImg = (window as any).toolbox?.file?.fetchImage as ((url: string) => Promise<string | null>) | undefined;

  await Promise.all(
    items.map((item) =>
      new Promise<void>((resolve) => {
        if (!item.posterUrl || posterCache.has(item.posterUrl)) { resolve(); return; }
        const load = (dataUrl: string) => {
          const img = new Image();
          img.onload = () => { posterCache.set(item.posterUrl!, img); resolve(); };
          img.onerror = () => { posterCache.set(item.posterUrl!, null); resolve(); };
          img.src = dataUrl;
        };
        if (fetchImg) {
          fetchImg(item.posterUrl!).then((dataUrl) => {
            if (dataUrl) load(dataUrl);
            else { posterCache.set(item.posterUrl!, null); resolve(); }
          }).catch(() => { posterCache.set(item.posterUrl!, null); resolve(); });
        } else {
          // 浏览器环境 fallback: 直接加载 (可能因 CORS 失败)
          const img = new Image();
          img.onload = () => { posterCache.set(item.posterUrl!, img); resolve(); };
          img.onerror = () => { posterCache.set(item.posterUrl!, null); resolve(); };
          img.src = item.posterUrl!;
        }
        setTimeout(() => { if (!posterCache.has(item.posterUrl!)) posterCache.set(item.posterUrl!, null); resolve(); }, 8000);
      }),
    ),
  );

  // 绘制每列
  DAYS.forEach((day, ci) => {
    const cx = px + ci * (cw + gap);
    const list = grouped[day];
    const cy = hh + 11;             // [改5] 标题→星期行间距 +5px (6→11)

    // 星期标题 — 文字放大
    ctx.fillStyle = '#e8a850';
    ctx.beginPath();
    ctx.roundRect(cx, cy, cw, dh, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Inter, sans-serif';              // [改1] 14→16px
    ctx.textAlign = 'center';
    ctx.fillText(`${day} · ${list.length}部`, cx + cw / 2, cy + dh / 2 + 6);

    // 每张卡片
    list.forEach((item, ri) => {
      const cardY = cy + dh + 4 + ri * (ch + cardGapV);

      // 卡片背景
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#e6e3d8';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.roundRect(cx, cardY, cw, ch, 5);
      ctx.fill();
      ctx.stroke();

      // 海报
      const poster = item.posterUrl ? (posterCache.get(item.posterUrl) ?? null) : null;
      if (poster) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(cx + 1, cardY + 1, pw - 2, ph - 2, [4, 4, 0, 0]);
        ctx.clip();
        const ir = poster.naturalWidth / poster.naturalHeight;
        const br = pw / ph;
        let sx = 0, sy = 0, sw = poster.naturalWidth, sh = poster.naturalHeight;
        if (ir > br) { sw = sh * br; sx = (poster.naturalWidth - sw) / 2; }
        else { sh = sw / br; sy = (poster.naturalHeight - sh) / 2; }
        ctx.drawImage(poster, sx, sy, sw, sh, cx + 1, cardY + 1, pw - 2, ph - 2);
        ctx.restore();
      } else {
        ctx.fillStyle = '#e0ddd5';
        ctx.beginPath();
        ctx.roundRect(cx + 1, cardY + 1, pw - 2, ph - 2, [4, 4, 0, 0]);
        ctx.fill();
        ctx.fillStyle = '#858592';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('暂无海报', cx + pw / 2, cardY + ph / 2);
      }

      // 标题 — 基准字号整体上调: 短16/中14/超长12 (从 13/11/9)
      const titleY = cardY + ph + 5;
      const maxW = cw - 8;
      ctx.textAlign = 'left';
      let fs: number;
      if (item.title.length > 22) fs = 12;                   // [改3] 超长 9→12
      else if (item.title.length > 16) fs = 14;              // [改3] 长标题 11→14
      else fs = 16;                                          // [改3] 短标题 13→16
      ctx.font = `bold ${fs}px Inter, -apple-system, sans-serif`;

      // 手动换行: 逐字测量, 超出则换行, 最多2行
      const lines = wrapText(ctx, item.title, maxW, 2, fs);
      lines.forEach((line, li) => {
        ctx.fillStyle = '#202027';
        ctx.fillText(line, cx + 4, titleY + (li + 1) * (fs + 2));
      });

      // 播出时间 (主要辅助信息)
      const timeY = titleY + lines.length * (fs + 2) + 2;
      const hasTime = item.statusTime && item.statusTime.length > 0;
      if (hasTime) {
        ctx.fillStyle = '#2f9ca8';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.fillText(item.statusTime, cx + 4, timeY + 12);
      }

      // 集数/备注 — 始终另起一行，避免长括号文字溢出
      if (item.epNote) {
        const epY = hasTime ? timeY + 12 + 10 : timeY + 12;   // [改] 时间下方独立一行
        ctx.fillStyle = '#858592';
        ctx.font = '10px Inter, sans-serif';
        ctx.fillText(item.epNote, cx + 4, epY);
      }

      if (!hasTime && !item.epNote) {
        ctx.fillStyle = '#858592';
        ctx.font = '10px Inter, sans-serif';
        ctx.fillText('时间待定', cx + 4, timeY + 12);
      }
    });
  });

  // 水印 — 字号放大
  ctx.fillStyle = '#858592';
  ctx.font = '12px Inter, sans-serif';                       // [改4] 10→12px
  ctx.textAlign = 'center';
  ctx.fillText('yuc.wiki · 37工具箱', W / 2, H - 10);       // [改4] -12→-10 微调垂直

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('导出失败'));
    }, 'image/png');
  });
}

// ======================================================================

export function getSavedSelections(qc: string): Set<string> {
  try {
    const raw = localStorage.getItem('37toolbox:anime-selections');
    return new Set(raw ? ((JSON.parse(raw) as Record<string, string[]>)[qc] ?? []) : []);
  } catch { return new Set(); }
}

export function saveSelections(qc: string, titles: string[]): void {
  try {
    const raw = localStorage.getItem('37toolbox:anime-selections');
    const data: Record<string, string[]> = raw ? JSON.parse(raw) : {};
    data[qc] = titles;
    localStorage.setItem('37toolbox:anime-selections', JSON.stringify(data));
  } catch {}
}
