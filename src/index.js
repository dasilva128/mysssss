const UUID = "a527d6b3-2ce1-4dbe-8f75-c03c4318a66d";

// چند IP از رنج‌های Cloudflare
const CLOUDFLARE_IPS = [
  "104.24.237.249",
  "104.24.236.249",
  "172.67.74.226",
  "172.67.75.226",
  "188.114.96.1",
  "188.114.97.1"
];

function makeVlessConfig(ip, host) {
  const params = new URLSearchParams({
    encryption: "none",
    host: host,
    path: "/",
    security: "tls",
    sni: host,
    type: "ws"
  });

  return `vless://${UUID}@${ip}:8443?${params.toString()}`;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const host = url.hostname;

    // نمایش کانفیگ‌ها
    if (url.pathname === "/api/config") {
      const configs = CLOUDFLARE_IPS.map(ip =>
        makeVlessConfig(ip, host)
      );

      return new Response(
        JSON.stringify(
          {
            success: true,
            host: host,
            uuid: UUID,
            port: 8443,
            protocol: "vless",
            transport: "ws",
            security: "tls",
            configs: configs
          },
          null,
          2
        ),
        {
          headers: {
            "content-type": "application/json; charset=UTF-8",
            "cache-control": "no-store"
          }
        }
      );
    }

    // فقط خروجی متنی کانفیگ‌ها
    if (url.pathname === "/api/sub") {
      const configs = CLOUDFLARE_IPS.map(ip =>
        makeVlessConfig(ip, host)
      );

      return new Response(configs.join("\n"), {
        headers: {
          "content-type": "text/plain; charset=UTF-8",
          "cache-control": "no-store"
        }
      });
    }

    // صفحه اصلی
    return new Response(
      `Cloudflare VLESS Panel

Worker:
${host}

Config API:
${url.origin}/api/config

Subscription:
${url.origin}/api/sub
`,
      {
        headers: {
          "content-type": "text/plain; charset=UTF-8"
        }
      }
    );
  }
};}

function isValidIPv4(ip) {
  if (typeof ip !== "string") return false;
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return false;
  return parts.every(p => /^\d+$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

function isValidPort(port) {
  return Number.isInteger(port) && ALLOWED_PORTS.has(port);
}

function validateRequest(data, env) {
  const l = limits(env);
  const errors = [];

  if (!Array.isArray(data?.ips) || data.ips.length === 0) {
    errors.push("حداقل یک IPv4 وارد کنید");
  } else {
    if (data.ips.length > l.maxIPs) errors.push(`حداکثر ${l.maxIPs} IP مجاز است`);
    const bad = data.ips.filter(x => !isValidIPv4(String(x).trim()));
    if (bad.length) errors.push(`IP نامعتبر: ${bad.join(", ")}`);
  }

  if (!Array.isArray(data?.ports) || data.ports.length === 0) {
    errors.push("حداقل یک پورت وارد کنید");
  } else {
    if (data.ports.length > l.maxPorts) errors.push(`حداکثر ${l.maxPorts} پورت مجاز است`);
    const bad = data.ports.filter(x => !isValidPort(Number(x)));
    if (bad.length) errors.push(`پورت غیرمجاز: ${bad.join(", ")}`);
  }

  const total = (data?.ips?.length || 0) * (data?.ports?.length || 0);
  if (total > l.maxTargets) errors.push(`حداکثر ${l.maxTargets} ترکیب IP/Port مجاز است`);

  return errors;
}

async function fetchTimeout(url, init, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "manual" });
  } finally {
    clearTimeout(timer);
  }
}

async function testHTTP(ip, port, timeout) {
  const protocol = [80, 8080, 8880].includes(port) ? "http" : "https";
  const url = `${protocol}://${ip}:${port}/`;
  const start = Date.now();

  try {
    const response = await fetchTimeout(url, {
      method: "GET",
      headers: {
        "User-Agent": `Cloudflare-Scanner/${VERSION}`,
        "Accept": "*/*"
      }
    }, timeout);

    const latency = Date.now() - start;
    try { await response.arrayBuffer(); } catch {}
    return { success: true, status: response.status, latency, protocol };
  } catch (e) {
    return {
      success: false,
      latency: Date.now() - start,
      protocol,
      error: e?.message || "Connection failed",
      timeout: e?.name === "AbortError"
    };
  }
}

async function testHTTPS(ip, port, timeout) {
  if (![443, 8443, 2053, 2083, 2087, 2096].includes(port)) {
    return { success: false, tls: false, reason: "Port is not an HTTPS port" };
  }

  const start = Date.now();
  const url = `https://${ip}:${port}/`;

  try {
    const response = await fetchTimeout(url, {
      method: "GET",
      headers: {
        "User-Agent": `Cloudflare-Scanner/${VERSION}`,
        "Accept": "*/*"
      }
    }, timeout);

    const latency = Date.now() - start;
    try { await response.arrayBuffer(); } catch {}

    return {
      success: true,
      status: response.status,
      latency,
      tls: true
    };
  } catch (e) {
    return {
      success: false,
      latency: Date.now() - start,
      tls: false,
      error: e?.message || "HTTPS failed",
      certificateError: /certificate|cert/i.test(e?.message || "")
    };
  }
}

async function testWebSocket(ip, port, timeout) {
  const secure = [443, 8443, 2053, 2083, 2087, 2096].includes(port);
  const protocol = secure ? "wss" : "ws";
  const url = `${protocol}://${ip}:${port}/`;
  const start = Date.now();

  try {
    const response = await fetchTimeout(url, {
      headers: {
        "Upgrade": "websocket",
        "Connection": "Upgrade",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
        "Sec-WebSocket-Version": "13",
        "User-Agent": `Cloudflare-Scanner/${VERSION}`
      }
    }, timeout);

    const latency = Date.now() - start;
    const upgrade = (response.headers.get("upgrade") || "").toLowerCase();

    try { await response.arrayBuffer(); } catch {}

    return {
      success: true,
      accepted: response.status === 101 || upgrade === "websocket",
      status: response.status,
      latency,
      protocol
    };
  } catch (e) {
    return {
      success: false,
      accepted: false,
      latency: Date.now() - start,
      error: e?.message || "WebSocket test failed"
    };
  }
}

function score(result) {
  let s = 0;

  if (result.http.success) {
    s += 20;
    if (result.http.status >= 200 && result.http.status < 400) s += 15;
    else if (result.http.status >= 400 && result.http.status < 500) s += 5;
    else if (result.http.status >= 500) s += 2;

    if (result.http.latency < 50) s += 5;
    else if (result.http.latency < 100) s += 3;
    else if (result.http.latency < 200) s += 1;
  }

  if (result.https.success && result.https.tls) {
    s += 20;
    if (result.https.status >= 200 && result.https.status < 400) s += 10;

    if (result.https.latency < 50) s += 5;
    else if (result.https.latency < 100) s += 3;
    else if (result.https.latency < 200) s += 1;
  }

  if (result.websocket.success) {
    s += 10;
    if (result.websocket.accepted) s += 15;

    if (result.websocket.latency < 100) s += 5;
    else if (result.websocket.latency < 200) s += 3;
  }

  const count = [
    result.http.success,
    result.https.success && result.https.tls,
    result.websocket.success && result.websocket.accepted
  ].filter(Boolean).length;

  if (count === 3) s += 20;
  else if (count === 2) s += 12;
  else if (count === 1) s += 5;

  return Math.min(100, Math.round(s));
}

function scoreLevel(s) {
  if (s >= 80) return { level: "excellent", label: "عالی" };
  if (s >= 60) return { level: "good", label: "خوب" };
  if (s >= 40) return { level: "medium", label: "متوسط" };
  return { level: "poor", label: "ضعیف" };
}

async function scanTarget(ip, port, timeout) {
  const started = Date.now();
  const [http, https, websocket] = await Promise.all([
    testHTTP(ip, port, timeout),
    testHTTPS(ip, port, timeout),
    testWebSocket(ip, port, timeout)
  ]);

  const result = {
    ip, port,
    timestamp: new Date().toISOString(),
    http, https, websocket,
    duration: Date.now() - started
  };

  result.score = score(result);
  result.scoreLevel = scoreLevel(result.score);
  result.reachable =
    http.success ||
    (https.success && https.tls) ||
    websocket.success;

  return result;
}

async function scanAll(targets, concurrency, timeout) {
  const results = new Array(targets.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= targets.length) return;

      try {
        results[i] = await scanTarget(targets[i].ip, targets[i].port, timeout);
      } catch (e) {
        results[i] = {
          ip: targets[i].ip,
          port: targets[i].port,
          score: 0,
          reachable: false,
          error: e?.message || "Unknown error"
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, targets.length) }, worker)
  );

  return results;
}

function generateUUID() {
  return crypto.randomUUID();
}

function generateTemplate(result, type) {
  const uuid = generateUUID();
  const path = encodeURIComponent("/");
  const ip = result.ip;
  const port = result.port;

  const link = type === "vless_ws_tls"
    ? `vless://${uuid}@${ip}:${port}?type=ws&security=tls&sni=cloudflare.com&host=cloudflare.com&path=${path}#CF-${ip}`
    : `vless://${uuid}@${ip}:${port}?type=ws&security=none&path=${path}#CF-${ip}`;

  return {
    type,
    ip,
    port,
    uuid,
    link,
    score: result.score,
    scoreLevel: result.scoreLevel,
    verified: false,
    disclaimer: "این VLESS واقعی را تأیید نمی‌کند؛ فقط یک template بر اساس نتیجه تست شبکه است."
  };
}

async function persistScan(env, request, summary, configs) {
  if (!env.DB) return null;

  try {
    const cf = request.cf || {};
    const inserted = await env.DB.prepare(`
      INSERT INTO scans (
        created_at, source_ip, total_targets, reachable, high_score,
        best_score, avg_score, duration, configs_generated, user_agent, cf_colo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      new Date().toISOString(),
      request.headers.get("CF-Connecting-IP") || "unknown",
      summary.totalScanned,
      summary.reachable,
      summary.highScore,
      summary.bestScore,
      summary.avgScore,
      summary.duration,
      summary.configsGenerated,
      request.headers.get("User-Agent") || "unknown",
      cf.colo || "unknown"
    ).run();

    return inserted.meta?.last_row_id || null;
  } catch (e) {
    console.error("D1 write failed:", e);
    return null;
  }
}

async function handleScan(request, env) {
  let data;
  try {
    data = await request.json();
  } catch {
    return error("JSON نامعتبر است");
  }

  const errors = validateRequest(data, env);
  if (errors.length) return error(errors.join("، "));

  const l = limits(env);
  const ips = data.ips.map(x => String(x).trim());
  const ports = data.ports.map(Number);
  const timeout = Math.min(Math.max(Number(data.timeout) || l.defaultTimeout, 1000), 5000);
  const concurrency = Math.min(Math.max(Number(data.concurrency) || 3, 1), 4);
  const threshold = Math.min(Math.max(Number(data.threshold) || 50, 0), 100);

  const types = Array.isArray(data.configTypes) && data.configTypes.length
    ? data.configTypes.filter(x => x === "vless_ws" || x === "vless_ws_tls")
    : ["vless_ws"];

  const targets = [];
  for (const ip of ips) {
    for (const port of ports) targets.push({ ip, port });
  }

  const started = Date.now();
  const scanResults = await scanAll(targets, concurrency, timeout);
  const duration = Date.now() - started;

  const filtered = scanResults
    .filter(r => r && r.score >= threshold)
    .sort((a, b) => b.score - a.score);

  const configs = [];
  for (const result of filtered) {
    for (const type of types) {
      if (type === "vless_ws_tls" && !(result.https?.success && result.https?.tls)) continue;
      configs.push(generateTemplate(result, type));
    }
  }

  const summary = {
    totalScanned: scanResults.length,
    reachable: scanResults.filter(r => r.reachable).length,
    highScore: filtered.length,
    configsGenerated: configs.length,
    bestScore: Math.max(...scanResults.map(r => r.score || 0), 0),
    avgScore: scanResults.length
      ? Math.round(scanResults.reduce((a, r) => a + (r.score || 0), 0) / scanResults.length)
      : 0,
    duration
  };

  const scanId = await persistScan(env, request, summary, configs);

  return json({
    success: true,
    results: configs,
    scanResults,
    summary,
    scanId,
    meta: {
      version: VERSION,
      cloudflareOnly: true,
      verified: false,
      disclaimer: "تست از Cloudflare Worker انجام شده و وجود VLESS روی مقصد را تأیید نمی‌کند."
    }
  });
}

async function handleGenerate(request, env) {
  let data;
  try { data = await request.json(); } catch { return error("JSON نامعتبر است"); }

  const ip = String(data.ip || "").trim();
  const port = Number(data.port);
  const type = data.type || "vless_ws";

  if (!isValidIPv4(ip)) return error("IPv4 نامعتبر است");
  if (!isValidPort(port)) return error("پورت مجاز نیست");

  const timeout = Math.min(Math.max(Number(data.timeout) || limits(env).defaultTimeout, 1000), 5000);
  const result = await scanTarget(ip, port, timeout);

  if (result.score < 50) {
    return json({
      success: false,
      error: `امتیاز ${result.score} است و کمتر از 50 می‌باشد`,
      scanResult: result
    }, 400);
  }

  if (type === "vless_ws_tls" && !(result.https?.success && result.https?.tls)) {
    return json({
      success: false,
      error: "تست HTTPS موفق نبود؛ template TLS ساخته نشد",
      scanResult: result
    }, 400);
  }

  return json({
    success: true,
    config: {
      ...generateTemplate(result, type),
      scanResult: result
    }
  });
}

async function handleHistory(env) {
  if (!env.DB) return error("D1 متصل نشده است", 503);

  try {
    const { results } = await env.DB.prepare(`
      SELECT id, created_at, total_targets, reachable, high_score,
             best_score, avg_score, duration, configs_generated, cf_colo
      FROM scans
      ORDER BY id DESC
      LIMIT 20
    `).all();

    return json({ success: true, history: results || [] });
  } catch (e) {
    return error(e?.message || "Database error", 500);
  }
}

async function handleHistoryDetail(env, id) {
  if (!env.DB) return error("D1 متصل نشده است", 503);

  const scan = await env.DB.prepare(
    "SELECT * FROM scans WHERE id = ?"
  ).bind(id).first();

  if (!scan) return error("اسکن پیدا نشد", 404);

  const { results } = await env.DB.prepare(
    "SELECT * FROM scan_details WHERE scan_id = ? ORDER BY score DESC"
  ).bind(id).all();

  return json({ success: true, scan, details: results || [] });
}

function health(request, env) {
  return json({
    status: "healthy",
    version: VERSION,
    platform: "Cloudflare Workers",
    vps: false,
    timestamp: new Date().toISOString(),
    environment: env.ENVIRONMENT || "production",
    colo: request.cf?.colo || "unknown",
    limits: limits(env)
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        return health(request, env);
      }

      if (url.pathname === "/api/scan" && request.method === "POST") {
        return await handleScan(request, env);
      }

      if (url.pathname === "/api/generate" && request.method === "POST") {
        return await handleGenerate(request, env);
      }

      if (url.pathname === "/api/history" && request.method === "GET") {
        return await handleHistory(env);
      }

      if (url.pathname.startsWith("/api/history/") && request.method === "GET") {
        const id = Number(url.pathname.split("/").pop());
        if (Number.isInteger(id) && id > 0) return await handleHistoryDetail(env, id);
        return error("شناسه نامعتبر است", 400);
      }

      if (env.ASSETS) return env.ASSETS.fetch(request);

      return new Response("Not Found", { status: 404 });
    } catch (e) {
      console.error("Worker error:", e);
      return json({ success: false, error: e?.message || "Internal Server Error" }, 500);
    }
  }
};
