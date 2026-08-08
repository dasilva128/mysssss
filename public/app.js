let busy = false;
const $ = id => document.getElementById(id);

function msg(text, error=false) {
  const el = $("message");
  el.textContent = text;
  el.className = "message show " + (error ? "error" : "");
  clearTimeout(msg.t);
  msg.t = setTimeout(() => el.className = "message", 5000);
}

function esc(v) {
  const d = document.createElement("div");
  d.textContent = String(v ?? "");
  return d.innerHTML;
}

function scoreClass(s) {
  return s >= 80 ? "excellent" : s >= 60 ? "good" : s >= 40 ? "medium" : "poor";
}

async function checkHealth() {
  try {
    const r = await fetch("/api/health");
    const d = await r.json();
    $("health").textContent = `✅ ${d.version} · ${d.colo}`;
  } catch {
    $("health").textContent = "❌ API در دسترس نیست";
  }
}

async function startScan() {
  if (busy) return;

  const ips = $("ips").value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const ports = $("ports").value.split(",").map(x => Number(x.trim())).filter(Number.isInteger);
  const configTypes = [...document.querySelectorAll(".checks input:checked")].map(x => x.value);

  if (!ips.length) return msg("حداقل یک IP وارد کنید", true);
  if (!ports.length) return msg("حداقل یک پورت وارد کنید", true);
  if (ips.length > 10 || ports.length > 5 || ips.length * ports.length > 15)
    return msg("محدودیت تعداد IP/Port رعایت نشده است", true);

  busy = true;
  $("scanBtn").disabled = true;
  $("scanBtn").textContent = "⏳ در حال اسکن...";

  try {
    const r = await fetch("/api/scan", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        ips, ports,
        timeout: Number($("timeout").value),
        threshold: Number($("threshold").value),
        concurrency: 3,
        configTypes
      })
    });

    const d = await r.json();
    if (!r.ok || !d.success) throw new Error(d.error || "Scan failed");

    showStats(d.summary);
    showResults(d.results);
    msg(`اسکن تمام شد؛ ${d.results.length} template تولید شد`);
  } catch(e) {
    msg("خطا: " + e.message, true);
  } finally {
    busy = false;
    $("scanBtn").disabled = false;
    $("scanBtn").textContent = "🚀 شروع اسکن";
  }
}

function showStats(s) {
  $("stats").classList.remove("hidden");
  $("statsContent").innerHTML = [
    ["کل تست‌ها",s.totalScanned],["قابل دسترس",s.reachable],
    ["امتیاز بالا",s.highScore],["بهترین",s.bestScore],
    ["میانگین",s.avgScore],["Template",s.configsGenerated],
    ["زمان",(s.duration/1000).toFixed(1)+"s"]
  ].map(x => `<div class="stat"><b>${esc(x[1])}</b><small>${esc(x[0])}</small></div>`).join("");
}

function showResults(results) {
  $("results").classList.remove("hidden");
  const c = $("resultsContent");

  if (!results?.length) {
    c.innerHTML = "<p>نتیجه‌ای با امتیاز انتخابی پیدا نشد.</p>";
    return;
  }

  c.innerHTML = results.map((x,i) => `
    <article class="result">
      <div class="score ${scoreClass(x.score)}">⭐ ${esc(x.score)} — ${esc(x.scoreLevel?.label)}</div>
      <div>🌐 <b>${esc(x.ip)}</b> : ${esc(x.port)}</div>
      <div>📡 ${esc(x.type)}</div>
      <pre>${esc(x.link)}</pre>
      <button class="copy" onclick="copyText(${JSON.stringify(x.link)})">📋 کپی</button>
      <small class="warningText">⚠️ ${esc(x.disclaimer)}</small>
    </article>
  `).join("");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    msg("✅ کپی شد");
  } catch {
    const i = document.createElement("input");
    i.value = text;
    document.body.appendChild(i);
    i.select();
    document.execCommand("copy");
    i.remove();
    msg("✅ کپی شد");
  }
}

async function manualGenerate() {
  const ip = $("manualIp").value.trim();
  const port = Number($("manualPort").value);
  const type = $("manualType").value;

  if (!ip) return msg("IP را وارد کنید", true);

  try {
    const r = await fetch("/api/generate", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ip, port, type})
    });
    const d = await r.json();
    if (!r.ok || !d.success) throw new Error(d.error || "Generation failed");
    showResults([d.config]);
    $("results").scrollIntoView({behavior:"smooth"});
    msg(`template با امتیاز ${d.config.score} آماده شد`);
  } catch(e) {
    msg("خطا: " + e.message, true);
  }
}

checkHealth();
setInterval(checkHealth, 30000);
