import { parseHTML } from "linkedom";

const CHANNEL = "noavinetorbat";
const CHANNEL_URL = `https://eitaa.com/${CHANNEL}`;
const ALLOWED_METHODS = "GET,POST,OPTIONS";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": ALLOWED_METHODS,
      "access-control-allow-headers": "content-type, authorization"
    }
  });
}

function clean(s = "") {
  return String(s)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function textOf(node) {
  if (!node) return "";
  return clean(node.textContent || "");
}

function attr(node, name) {
  return node?.getAttribute?.(name) || "";
}

function absoluteUrl(u) {
  if (!u) return "";
  try {
    return new URL(u, "https://eitaa.com").href;
  } catch {
    return "";
  }
}

function categorize(text) {
  const t = text.toLowerCase();

  const rules = [
    ["ولاگ", /#ولاگ|ولاگ/],
    ["مستند و روایت", /#مستند|#روایت|مستند|روایت/],
    ["نماهنگ", /#نماهنگ|نماهنگ/],
    ["راویوم", /#راویوم|راویوم/],
    ["نوجوان‌گردی", /#نوجوان_گردی|نوجوان‌گردی|نوجوان گردی/],
    ["تیزر و معرفی", /#تیزر|#پیشنهاد_تماشا|تیزر/],
    ["چالش و سرگرمی", /#چالش|چالش/],
    ["رویدادها", /#رویداد|#گزارش|رزمایش|همایش|مراسم|گزارش تصویری/],
    ["مصاحبه", /#مصاحبه|مصاحبه|گفت‌وگو|گفتگو/],
    ["آموزش", /#آموزش|آموزش|کارگاه/],
    ["گرافیک و پوستر", /#پوستر|#اینفوگرافیک|پوستر|اینفوگرافیک/]
  ];

  for (const [name, re] of rules) {
    if (re.test(t)) return name;
  }

  return "سایر روایت‌ها";
}

function hashtags(text) {
  return [
    ...new Set(
      (text.match(/#[\p{L}\p{N}_‌]+/gu) || []).map(x => x.slice(1))
    )
  ];
}

function getMedia(node) {
  const found = new Map();
  if (!node?.querySelectorAll) return [];

  for (const el of node.querySelectorAll("img[src], video[src], video source[src], audio[src], a[href]")) {
    const raw = attr(el, "src") || attr(el, "href");
    const url = absoluteUrl(raw);
    if (!url || !/^https?:/.test(url)) continue;

    try {
      const parsed = new URL(url);
      if (parsed.hostname.endsWith("eitaa.com") &&
          (/^\/s\/noavinetorbat\/\d+$/.test(parsed.pathname) ||
           /^\/noavinetorbat\/\d+$/.test(parsed.pathname))) continue;
    } catch {}

    let cls = "";
    let parent = el;
    for (let i = 0; i < 4 && parent; i++, parent = parent.parentElement) {
      cls += " " + attr(parent, "class");
    }
    cls = cls.toLowerCase();
    if (/avatar|profile|userpic|logo/.test(cls)) continue;

    const tag = el.tagName?.toLowerCase();
    const isVideo = tag === "video" ||
      /\.(mp4|webm|mov)(?:[?#]|$)/i.test(url) ||
      /video_player|message_video|video_wrap/.test(cls);
    const isAudio = tag === "audio" || /\.(mp3|m4a|ogg|wav)(?:[?#]|$)/i.test(url);
    const isImage = tag === "img" ||
      /\.(jpg|jpeg|png|webp|gif)(?:[?#]|$)/i.test(url) ||
      /photo_wrap|message_photo/.test(cls);

    if (!isVideo && !isAudio && !isImage) continue;
    found.set(url, { url, type: isVideo ? "video" : isAudio ? "audio" : "image" });
  }
  return [...found.values()].slice(0, 12);
}

function isOnlyTime(text) {
  return /^\d{1,2}:\d{2}$/.test(clean(text));
}

function extractBestText(node) {
  if (!node) return "";

  const selectors = [
    '[class*="message_text"]',
    '[class*="message-text"]',
    '[class*="text_content"]',
    '[class*="post_text"]',
    '[class*="caption"]',
    '[class*="message"]'
  ];

  const options = [];

  for (const selector of selectors) {
    for (const el of node.querySelectorAll(selector)) {
      const value = textOf(el);

      if (value && !isOnlyTime(value)) {
        options.push(value);
      }
    }
  }

  const fullText = textOf(node);

  if (fullText && !isOnlyTime(fullText)) {
    options.push(fullText);
  }

  options.sort((a, b) => b.length - a.length);

  return options[0] || "";
}

function postScore(post) {
  return post.text.length + post.media.length * 150;
}

function extractPosts(html) {
  const { document } = parseHTML(html);

  const candidates = [];

  const selectors = [
    '[class*="etme_widget_message_wrap"]',
    '[class*="tgme_widget_message_wrap"]',
    '[class*="etme_widget_message"]',
    '[class*="tgme_widget_message"]',
    '[data-post]'
  ];

  for (const selector of selectors) {
    for (const el of document.querySelectorAll(selector)) {
      if (!candidates.includes(el)) {
        candidates.push(el);
      }
    }
  }

  const out = new Map();

  function addCandidate(node) {
    if (!node) return;

    const links = [...node.querySelectorAll("a[href]")]
      .map(a => absoluteUrl(attr(a, "href")));

    const permalink = links.find(u => {
      try {
        const x = new URL(u);

        return (
          x.hostname.endsWith("eitaa.com") &&
          (
            x.pathname.includes(CHANNEL + "/") ||
            x.pathname.includes("/s/" + CHANNEL + "/")
          )
        );
      } catch {
        return false;
      }
    }) || "";

    let id = "";

    if (permalink) {
      const m = permalink.match(
        new RegExp("(?:/s/)?" + CHANNEL + "/(\\d+)")
      );

      if (m) id = m[1];
    }

    if (!id) {
      const dataPost =
        attr(node, "data-post") ||
        attr(node, "data-message-id") ||
        attr(node, "id");

      const m = dataPost.match(/(\d{3,})/);

      if (m) id = m[1];
    }

    if (!id) return;

    const body = extractBestText(node)
      .replace(/مشاهده در ایتا/g, "")
      .replace(/^🎬\s*نو\+آوینه تربت‌حیدریه 📺\s*/u, "")
      .trim();

    const media = getMedia(node);

    if (!body && !media.length) return;

    const title =
      body.split(/\n/).map(clean).find(Boolean) ||
      (media[0]?.type === "video" ? "ویدئو" : "محتوای رسانه‌ای");

    // فقط نشانگر تاریخ پست؛ مدت ویدئو نباید به‌عنوان ساعت ذخیره شود.
    const dateEl =
      node.querySelector(".etme_widget_message_date[datetime]") ||
      node.querySelector(".etme_widget_message_date") ||
      node.querySelector("time[datetime]") ||
      node.querySelector("time");
    const dateText = textOf(dateEl);
    const publishedAt =
      attr(dateEl, "datetime") ||
      (/^\d{1,2}:\d{2}$/.test(dateText) ? dateText : "");

    const sourceUrl =
      permalink || `${CHANNEL_URL}/${id}`;

    const post = {
      id,
      title: title.slice(0, 180),
      text: body,
      publishedAt,
      category: categorize(body),
      hashtags: hashtags(body),
      media,
      sourceUrl,
      syncedAt: new Date().toISOString()
    };

    // اگر چند بخش از یک پست پیدا شد،
    // اطلاعات کامل‌تر حفظ می‌شود.
    const previous = out.get(id);

    if (
      !previous ||
      postScore(post) > postScore(previous)
    ) {
      out.set(id, post);
    }
  }

  candidates.forEach(addCandidate);

  // روش جایگزین برای ساختارهای متفاوت صفحه ایتا
  if (out.size === 0) {
    for (const a of document.querySelectorAll("a[href]")) {
      const href = absoluteUrl(attr(a, "href"));

      let m;

      try {
        m = new URL(href).pathname.match(
          new RegExp("(?:/s/)?" + CHANNEL + "/(\\d+)")
        );
      } catch {}

      if (!m) continue;

      let node = a;

      for (let i = 0; i < 7 && node; i++, node = node.parentElement) {
        const body = extractBestText(node);

        if (body.length > 12) {
          addCandidate(node);

          if (out.has(m[1])) break;
        }
      }
    }
  }

  return [...out.values()]
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, 30);
}

async function fetchChannel() {
  const res = await fetch(CHANNEL_URL, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; NoavineMediaSync/1.0)",
      "accept": "text/html,application/xhtml+xml"
    },
    redirect: "follow"
  });

  if (!res.ok) {
    throw new Error(`Eitaa returned HTTP ${res.status}`);
  }

  return await res.text();
}

async function sha256(s) {
  const bytes = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sync(env) {
  const html = await fetchChannel();
  const posts = extractPosts(html);

  if (!posts.length) {
    await env.DB.prepare(
      "INSERT INTO sync_log(status, detail, created_at) VALUES('warning', ?, ?)"
    ).bind(
      "Parser found no posts. Eitaa page markup may have changed.",
      new Date().toISOString()
    ).run();

    return {
      ok: false,
      found: 0,
      message: "هیچ پستی استخراج نشد؛ احتمالاً ساختار صفحه ایتا تغییر کرده است."
    };
  }

  let inserted = 0;
  let updated = 0;

  for (const p of posts) {
    const existing = await env.DB.prepare(
      "SELECT id, fingerprint FROM posts WHERE id=?"
    ).bind(p.id).first();

    const fingerprint = await sha256(
      JSON.stringify({
        text: p.text,
        media: p.media
      })
    );

    const values = [
      p.id,
      p.title,
      p.text,
      p.publishedAt,
      p.category,
      JSON.stringify(p.hashtags),
      JSON.stringify(p.media),
      p.sourceUrl,
      fingerprint,
      p.syncedAt
    ];

    if (!existing) {
      await env.DB.prepare(`
        INSERT INTO posts
        (
          id, title, body, published_at, category,
          hashtags_json, media_json, source_url,
          fingerprint, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(...values).run();

      inserted++;
    } else if (existing.fingerprint !== fingerprint) {
      await env.DB.prepare(`
        UPDATE posts SET
          title=?,
          body=?,
          published_at=?,
          category=?,
          hashtags_json=?,
          media_json=?,
          source_url=?,
          fingerprint=?,
          updated_at=?
        WHERE id=?
      `).bind(
        p.title,
        p.text,
        p.publishedAt,
        p.category,
        JSON.stringify(p.hashtags),
        JSON.stringify(p.media),
        p.sourceUrl,
        fingerprint,
        p.syncedAt,
        p.id
      ).run();

      updated++;
    }
  }

  await env.DB.prepare(
    "INSERT INTO sync_log(status, detail, created_at) VALUES('ok', ?, ?)"
  ).bind(
    `found=${posts.length}; inserted=${inserted}; updated=${updated}`,
    new Date().toISOString()
  ).run();

  return {
    ok: true,
    found: posts.length,
    inserted,
    updated
  };
}

function authorized(request, env) {
  const key =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    new URL(request.url).searchParams.get("key");

  return !!env.ADMIN_KEY && key === env.ADMIN_KEY;
}

async function handle(request, env) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": ALLOWED_METHODS,
        "access-control-allow-headers": "content-type, authorization"
      }
    });
  }

  if (url.pathname === "/api/health") {
    const row = await env.DB.prepare(
      "SELECT status, detail, created_at FROM sync_log ORDER BY id DESC LIMIT 1"
    ).first();

    return json({
      ok: true,
      channel: CHANNEL,
      lastSync: row || null,
      now: new Date().toISOString()
    });
  }

  if (url.pathname === "/api/posts" && request.method === "GET") {
    const category = url.searchParams.get("category");
    const q = (url.searchParams.get("q") || "").trim().slice(0, 100);

    const limit = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("limit") || 50))
    );

    let sql = `
      SELECT id, title, body, published_at, category,
      hashtags_json, media_json, source_url, updated_at
      FROM posts
    `;

    const clauses = [];
    const params = [];

    if (category) {
      clauses.push("category=?");
      params.push(category);
    }

    if (q) {
      clauses.push("(title LIKE ? OR body LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }

    if (clauses.length) {
      sql += " WHERE " + clauses.join(" AND ");
    }

    sql += " ORDER BY CAST(id AS INTEGER) DESC LIMIT ?";
    params.push(limit);

    const result = await env.DB.prepare(sql)
      .bind(...params)
      .all();

    const posts = (result.results || []).map(p => ({
      ...p,
      hashtags: JSON.parse(p.hashtags_json || "[]"),
      media: JSON.parse(p.media_json || "[]")
    }));

    return json({
      ok: true,
      channel: CHANNEL,
      source: CHANNEL_URL,
      posts
    });
  }

  if (url.pathname === "/api/categories") {
    const r = await env.DB.prepare(
      "SELECT category, COUNT(*) AS count FROM posts GROUP BY category ORDER BY count DESC"
    ).all();

    return json({
      ok: true,
      categories: r.results || []
    });
  }

  if (url.pathname === "/api/sync" && request.method === "POST") {
    if (!authorized(request, env)) {
      return json({
        ok: false,
        error: "unauthorized"
      }, 401);
    }

    try {
      return json(await sync(env));
    } catch (e) {
      return json({
        ok: false,
        error: String(e.message || e)
      }, 502);
    }
  }

  if (url.pathname === "/api/inspect" && request.method === "GET") {
    try {
      const html = await fetchChannel();
      const { document } = parseHTML(html);
      const anchors = [...document.querySelectorAll("a[href]")].slice(0, 100).map(a => ({
        href: attr(a, "href").slice(0, 300),
        text: textOf(a).slice(0, 100),
        className: attr(a, "class").slice(0, 160)
      }));
      const classes = [...new Set([...document.querySelectorAll("[class]")].map(x => attr(x, "class")).filter(Boolean))].slice(0, 100);
      const mediaSamples = [...document.querySelectorAll(
        ".etme_widget_message_video_player, .etme_widget_message_video_thumb, .etme_widget_message_video_wrap, .etme_widget_message_photo_wrap"
      )].slice(0, 12).map(el => ({
        className: attr(el, "class"),
        tag: el.tagName?.toLowerCase() || "",
        href: attr(el, "href"),
        src: attr(el, "src"),
        style: attr(el, "style"),
        html: (el.outerHTML || "").slice(0, 1800)
      }));
      const messageSamples = [...document.querySelectorAll(".etme_widget_message_wrap")].slice(0, 15).map(el => ({
        id: (el.querySelector('a[href*="/noavinetorbat/"], a[href*="/s/noavinetorbat/"]')?.getAttribute("href") || "").match(/(\\d+)\\/?$/)?.[1] || "",
        text: textOf(el.querySelector(".etme_widget_message_text")).slice(0, 240),
        date: textOf(el.querySelector(".etme_widget_message_date"))
      }));
      return json({
        ok: true,
        htmlLength: html.length,
        pageTitle: document.title,
        anchorCount: document.querySelectorAll("a[href]").length,
        anchors,
        classes,
        mediaSamples,
        messageSamples
      });
    } catch (e) {
      return json({ ok: false, error: String(e.message || e) }, 502);
    }
  }

  if (url.pathname === "/api/debug" && request.method === "GET") {
    if (!authorized(request, env)) {
      return json({
        ok: false,
        error: "unauthorized"
      }, 401);
    }

    try {
      const html = await fetchChannel();
      const { document } = parseHTML(html);

      const sample = [
        ...document.querySelectorAll("[class]")
      ]
        .map(x => attr(x, "class"))
        .filter(x => /message|post|media/i.test(x))
        .slice(0, 60);

      return json({
        ok: true,
        htmlLength: html.length,
        title: document.title,
        matchingClasses: [...new Set(sample)]
      });
    } catch (e) {
      return json({
        ok: false,
        error: String(e.message || e)
      }, 502);
    }
  }

  return json({
    ok: false,
    error: "not_found"
  }, 404);
}

export default {
  async fetch(request, env) {
    return handle(request, env);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      sync(env).catch(async e => {
        await env.DB.prepare(
          "INSERT INTO sync_log(status, detail, created_at) VALUES('error', ?, ?)"
        ).bind(
          String(e.message || e).slice(0, 500),
          new Date().toISOString()
        ).run();
      })
    );
  }
};
