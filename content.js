(() => {
  if (window.__smoothTranslatorV22) return;
  window.__smoothTranslatorV22 = true;

  const originalTextMap = new WeakMap();
  const originalAttrMap = new WeakMap();
  const translatedTextKey = new WeakMap();
  const translatedAttrKey = new WeakMap();
  const cache = new Map();

  let targetLang = "zh-CN";
  let enabled = false;
  let running = false;
  let observer = null;
  let lastUrl = location.href;
  let lastToast = 0;
  let pendingTimer = 0;
  let pendingRoot = null;
  let lastFullScan = 0;
  let lastPointerScan = 0;
  let selfChanging = 0;

  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE", "SVG", "CANVAS", "IFRAME"]);
  const ATTRS = ["placeholder", "title", "aria-label", "alt", "data-tooltip", "data-tooltip-text"];

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function idle(fn, timeout = 900) {
    if ("requestIdleCallback" in window) requestIdleCallback(fn, { timeout });
    else setTimeout(fn, 80);
  }

  function showToast(message, type = "info", quiet = false) {
    if (quiet && Date.now() - lastToast < 2200) return;
    lastToast = Date.now();
    let box = document.getElementById("__smooth_translator_toast");
    if (!box) {
      box = document.createElement("div");
      box.id = "__smooth_translator_toast";
      box.style.cssText = `position:fixed;top:18px;right:18px;z-index:2147483647;max-width:340px;padding:10px 14px;border-radius:12px;color:#fff;font-size:14px;line-height:1.45;font-family:Arial,Microsoft YaHei,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.22);opacity:0;transform:translateY(-8px);transition:opacity .18s ease,transform .18s ease;pointer-events:none;`;
      document.documentElement.appendChild(box);
    }
    const colors = { info: "#2563eb", success: "#16a34a", error: "#dc2626", restore: "#4b5563" };
    box.textContent = message;
    box.style.background = colors[type] || colors.info;
    clearTimeout(window.__smoothTranslatorToastTimer);
    requestAnimationFrame(() => { box.style.opacity = "1"; box.style.transform = "translateY(0)"; });
    window.__smoothTranslatorToastTimer = setTimeout(() => {
      box.style.opacity = "0";
      box.style.transform = "translateY(-8px)";
    }, 1900);
  }

  function ensureProgressBox() {
    let box = document.getElementById("__smooth_translator_progress");
    if (!box) {
      box = document.createElement("div");
      box.id = "__smooth_translator_progress";
      box.innerHTML = `
        <div class="stp-head">
          <span class="stp-spinner"></span>
          <span class="stp-text">准备翻译...</span>
        </div>
        <div class="stp-bar"><div class="stp-fill"></div></div>
      `;
      const style = document.createElement("style");
      style.id = "__smooth_translator_progress_style";
      style.textContent = `
        #__smooth_translator_progress{
          position:fixed;top:64px;right:18px;z-index:2147483646;width:260px;
          padding:12px 12px 11px;border-radius:14px;background:rgba(17,24,39,.94);color:#fff;
          font:13px/1.4 Arial,Microsoft YaHei,sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.25);
          opacity:0;transform:translateY(-8px);transition:opacity .18s ease,transform .18s ease;pointer-events:none;
        }
        #__smooth_translator_progress.show{opacity:1;transform:translateY(0)}
        #__smooth_translator_progress .stp-head{display:flex;align-items:center;gap:8px;margin-bottom:9px}
        #__smooth_translator_progress .stp-spinner{width:14px;height:14px;border:2px solid rgba(255,255,255,.35);border-top-color:#60a5fa;border-radius:50%;animation:stp-spin .75s linear infinite;flex:0 0 auto}
        #__smooth_translator_progress.done .stp-spinner{animation:none;border-color:#22c55e;background:#22c55e;box-shadow:inset 0 0 0 3px rgba(17,24,39,.94)}
        #__smooth_translator_progress .stp-text{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #__smooth_translator_progress .stp-bar{height:6px;border-radius:999px;background:rgba(255,255,255,.18);overflow:hidden}
        #__smooth_translator_progress .stp-fill{height:100%;width:0%;border-radius:999px;background:linear-gradient(90deg,#3b82f6,#22c55e);transition:width .16s ease}
        @keyframes stp-spin{to{transform:rotate(360deg)}}
      `;
      document.documentElement.appendChild(style);
      document.documentElement.appendChild(box);
    }
    return box;
  }

  function updateProgress(done, total, text) {
    const box = ensureProgressBox();
    const percent = total > 0 ? Math.min(100, Math.round(done / total * 100)) : 0;
    box.classList.add("show");
    box.classList.remove("done");
    box.querySelector(".stp-text").textContent = text || `正在翻译 ${done}/${total}`;
    box.querySelector(".stp-fill").style.width = percent + "%";
    clearTimeout(window.__smoothTranslatorProgressTimer);
  }

  function finishProgress(total, count) {
    const box = ensureProgressBox();
    box.classList.add("show", "done");
    box.querySelector(".stp-text").textContent = count > 0 ? `翻译完成：${count} 处文字` : "当前可见内容已处理";
    box.querySelector(".stp-fill").style.width = "100%";
    clearTimeout(window.__smoothTranslatorProgressTimer);
    window.__smoothTranslatorProgressTimer = setTimeout(() => {
      box.classList.remove("show", "done");
    }, 1800);
  }

  function hasCJK(text) { return /[\u3400-\u9fff]/.test(text); }
  function hasLetters(text) { return /[A-Za-zÀ-ÿА-Яа-яЁё]/.test(text); }
  function meaningful(text) {
    const t = (text || "").trim();
    if (!t) return false;
    if (t.length < 2 && !hasLetters(t)) return false;
    if (/^[\d\s\p{P}\p{S}]+$/u.test(t)) return false;
    if (targetLang.toLowerCase().startsWith("zh") && hasCJK(t) && !hasLetters(t)) return false;
    return true;
  }

  function isBadParent(el) {
    if (!el) return true;
    if (SKIP_TAGS.has(el.tagName)) return true;
    return !!el.closest("script,style,noscript,textarea,code,pre,svg,canvas,[contenteditable='true'],#__smooth_translator_toast,#__smooth_translator_progress,#__smooth_translator_progress_style");
  }

  function isVisibleEnough(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return true;
  }

  function inViewport(el) {
    const r = el.getBoundingClientRect();
    return r.bottom >= -120 && r.top <= innerHeight + 120 && r.right >= -120 && r.left <= innerWidth + 120;
  }

  function acceptTextNode(node, viewportOnly = false) {
    if (!meaningful(node.nodeValue)) return false;
    const parent = node.parentElement;
    if (isBadParent(parent) || !isVisibleEnough(parent)) return false;
    if (viewportOnly && !inViewport(parent)) return false;
    return true;
  }

  function collectTextNodes(root = document.body, limit = 900, viewportOnly = true) {
    if (!root) return [];
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) { return acceptTextNode(node, viewportOnly) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; }
    });
    while (walker.nextNode() && nodes.length < limit) nodes.push(walker.currentNode);
    return nodes;
  }

  function collectAttrJobs(root = document.body, limit = 500, viewportOnly = true) {
    if (!root) return [];
    const jobs = [];
    const els = root.querySelectorAll("[placeholder],[title],[aria-label],[alt],[data-tooltip],[data-tooltip-text],input[value],button[value]");
    for (const el of els) {
      if (jobs.length >= limit) break;
      if (isBadParent(el) || !isVisibleEnough(el)) continue;
      if (viewportOnly && !inViewport(el)) continue;
      for (const attr of ATTRS) {
        const val = el.getAttribute(attr);
        if (meaningful(val)) jobs.push({ el, attr, val });
      }
      if ((el.tagName === "INPUT" || el.tagName === "BUTTON") && meaningful(el.value)) jobs.push({ el, attr: "__value", val: el.value });
    }
    return jobs;
  }

  async function translateOne(text, lang) {
    const clean = text.trim();
    const key = lang + "\n" + clean;
    if (cache.has(key)) return cache.get(key);
    const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=" + encodeURIComponent(lang) + "&dt=t&q=" + encodeURIComponent(clean);
    const res = await fetch(url);
    if (!res.ok) throw new Error("接口请求失败 " + res.status);
    const data = await res.json();
    const out = (data?.[0] || []).map(x => x[0]).join("").trim();
    cache.set(key, out || clean);
    return out || clean;
  }

  async function runPool(items, worker, concurrency = 4, onProgress = null) {
    let index = 0, ok = 0, finished = 0;
    const total = items.length;
    const workers = Array.from({ length: concurrency }, async () => {
      while (index < items.length) {
        const item = items[index++];
        try { if (await worker(item)) ok++; } catch (e) { console.warn("网页翻译失败", e); }
        finished++;
        if (onProgress) onProgress(finished, total, ok);
        await sleep(0);
      }
    });
    await Promise.all(workers);
    return ok;
  }

  async function translatePagePass(root = document.body, opts = {}) {
    const viewportOnly = opts.viewportOnly !== false;
    const textLimit = opts.textLimit || 900;
    const attrLimit = opts.attrLimit || 500;
    const concurrency = opts.concurrency || 4;

    const textJobs = [];
    for (const node of collectTextNodes(root, textLimit, viewportOnly)) {
      const current = node.nodeValue;
      const clean = current.trim();
      const key = targetLang + "\n" + clean;
      if (translatedTextKey.get(node) === key) continue;
      if (!originalTextMap.has(node)) originalTextMap.set(node, current);
      textJobs.push({ node, current, clean });
    }

    const attrJobs = [];
    for (const j of collectAttrJobs(root, attrLimit, viewportOnly)) {
      const key = targetLang + "\n" + j.attr + "\n" + j.val.trim();
      if (translatedAttrKey.get(j.el)?.[j.attr] === key) continue;
      if (!originalAttrMap.has(j.el)) originalAttrMap.set(j.el, {});
      const old = originalAttrMap.get(j.el);
      if (!(j.attr in old)) old[j.attr] = j.val;
      attrJobs.push(j);
    }

    const totalJobs = textJobs.length + attrJobs.length;
    let completedJobs = 0;
    if (totalJobs > 0) updateProgress(0, totalJobs, `开始翻译，共 ${totalJobs} 处`);

    const textCount = await runPool(textJobs, async j => {
      if (!j.node.isConnected || j.node.nodeValue !== j.current) return false;
      const out = await translateOne(j.clean, targetLang);
      if (!out || out === j.clean) return false;
      selfChanging++;
      j.node.nodeValue = j.current.replace(j.clean, out);
      queueMicrotask(() => selfChanging--);
      translatedTextKey.set(j.node, targetLang + "\n" + out.trim());
      return true;
    }, concurrency, (done, total) => {
      completedJobs = done;
      updateProgress(completedJobs, totalJobs, `正在翻译文字 ${completedJobs}/${totalJobs}`);
    });

    const attrCount = await runPool(attrJobs, async j => {
      if (!j.el.isConnected) return false;
      const now = j.attr === "__value" ? j.el.value : j.el.getAttribute(j.attr);
      if (now !== j.val) return false;
      const out = await translateOne(j.val, targetLang);
      if (!out || out === j.val) return false;
      selfChanging++;
      if (j.attr === "__value") j.el.value = out;
      else j.el.setAttribute(j.attr, out);
      queueMicrotask(() => selfChanging--);
      const m = translatedAttrKey.get(j.el) || {};
      m[j.attr] = targetLang + "\n" + j.attr + "\n" + out.trim();
      translatedAttrKey.set(j.el, m);
      return true;
    }, Math.max(2, Math.floor(concurrency / 2)), (done, total) => {
      completedJobs = textJobs.length + done;
      updateProgress(completedJobs, totalJobs, `正在翻译提示/按钮 ${completedJobs}/${totalJobs}`);
    });

    const totalCount = textCount + attrCount;
    if (totalJobs > 0) finishProgress(totalJobs, totalCount);
    return totalCount;
  }

  function scheduleTranslate(delay = 260, root = document.body, opts = {}) {
    if (!enabled) return;
    pendingRoot = root || pendingRoot || document.body;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      idle(async () => {
        if (running) return scheduleTranslate(500, pendingRoot, opts);
        running = true;
        const chosenRoot = pendingRoot || document.body;
        pendingRoot = null;
        try {
          const count = await translatePagePass(chosenRoot, opts);
          if (count > 0) showToast(`翻译成功：${count} 处`, "success", true);
        } catch (e) {
          console.warn(e);
        }
        running = false;
      });
    }, delay);
  }

  function nearestPopupRoot(el) {
    if (!el || el.nodeType !== 1) return document.body;
    return el.closest("[role='menu'],[role='dialog'],[role='listbox'],[data-radix-popper-content-wrapper],[data-testid],.menu,.popover,.modal") || el.parentElement || document.body;
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(mutations => {
      if (selfChanging > 0) return;
      let root = null;
      for (const m of mutations) {
        if (m.target?.id === "__smooth_translator_toast") continue;
        if (m.type === "childList" && m.addedNodes.length) {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1 && n.id !== "__smooth_translator_toast") { root = n; break; }
          }
        }
        if (root) break;
      }
      if (root) scheduleTranslate(280, root, { textLimit: 260, attrLimit: 180, concurrency: 3 });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        lastFullScan = Date.now();
        scheduleTranslate(350, document.body, { textLimit: 900, attrLimit: 500, concurrency: 4 });
      }
    }, 700);

    window.addEventListener("scroll", () => {
      if (Date.now() - lastFullScan < 1200) return;
      lastFullScan = Date.now();
      scheduleTranslate(650, document.body, { textLimit: 700, attrLimit: 300, concurrency: 3 });
    }, { passive: true });

    document.addEventListener("mouseover", e => {
      if (Date.now() - lastPointerScan < 900) return;
      lastPointerScan = Date.now();
      scheduleTranslate(180, nearestPopupRoot(e.target), { textLimit: 160, attrLimit: 100, concurrency: 3 });
    }, { passive: true });

    document.addEventListener("click", e => {
      // 点击时不扫全页，只扫点击附近和弹出菜单，避免明显卡顿
      setTimeout(() => scheduleTranslate(120, nearestPopupRoot(e.target), { textLimit: 220, attrLimit: 160, concurrency: 3 }), 80);
    }, true);
  }

  async function loadSettingsAndMaybeStart(force = false) {
    const s = await chrome.storage.sync.get({ autoTranslate: true, targetLang: "zh-CN" });
    targetLang = s.targetLang || "zh-CN";
    enabled = !!s.autoTranslate;
    if (enabled || force) {
      enabled = true;
      startObserver();
      showToast("自动翻译已开启", "info", true);
      scheduleTranslate(150, document.body, { textLimit: 900, attrLimit: 500, concurrency: 4 });
      setTimeout(() => scheduleTranslate(1400, document.body, { textLimit: 1200, attrLimit: 600, concurrency: 3 }), 1400);
    }
  }

  function restorePage() {
    let count = 0;
    for (const node of collectTextNodes(document.body, 10000, false)) {
      if (originalTextMap.has(node)) {
        node.nodeValue = originalTextMap.get(node);
        translatedTextKey.delete(node);
        count++;
      }
    }
    document.querySelectorAll("*").forEach(el => {
      const attrs = originalAttrMap.get(el);
      if (!attrs) return;
      for (const [attr, val] of Object.entries(attrs)) {
        if (attr === "__value") el.value = val;
        else el.setAttribute(attr, val);
        count++;
      }
      translatedAttrKey.delete(el);
    });
    return count;
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "translateNow" || msg.action === "autoTranslate") {
      targetLang = msg.lang || targetLang || "zh-CN";
      enabled = true;
      startObserver();
      showToast("正在翻译当前可见内容...", "info");
      scheduleTranslate(60, document.body, { textLimit: 1500, attrLimit: 800, concurrency: 5 });
      sendResponse({ ok: true, message: "已开启低卡顿实时翻译" });
      return true;
    }

    if (msg.action === "settingsChanged") {
      loadSettingsAndMaybeStart(false).then(() => {
        sendResponse({ ok: true, message: enabled ? "自动翻译已开启" : "自动翻译已关闭" });
      });
      return true;
    }

    if (msg.action === "restore") {
      const count = restorePage();
      showToast(`已还原 ${count} 处文字`, "restore");
      sendResponse({ ok: true, message: `已还原 ${count} 处文字` });
      return true;
    }
  });

  loadSettingsAndMaybeStart(false);
})();

