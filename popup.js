const statusEl = document.getElementById("status");
const autoEl = document.getElementById("auto");
const langEl = document.getElementById("lang");

async function getSettings() {
  return await chrome.storage.sync.get({ autoTranslate: true, targetLang: "zh-CN" });
}

async function saveSettings() {
  await chrome.storage.sync.set({ autoTranslate: autoEl.checked, targetLang: langEl.value });
  await runOnPage("settingsChanged");
}

async function runOnPage(action) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  if (!/^https?:|^file:/.test(tab.url || "")) {
    statusEl.textContent = "这个页面不支持翻译，例如浏览器设置页。";
    return;
  }
  const res = await chrome.tabs.sendMessage(tab.id, { action, lang: langEl.value }).catch(async () => {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    return await chrome.tabs.sendMessage(tab.id, { action, lang: langEl.value });
  });
  if (res?.message) statusEl.textContent = res.message;
}

(async () => {
  const s = await getSettings();
  autoEl.checked = s.autoTranslate;
  langEl.value = s.targetLang;
})();

autoEl.addEventListener("change", saveSettings);
langEl.addEventListener("change", saveSettings);

document.getElementById("translate").addEventListener("click", async () => {
  statusEl.textContent = "正在翻译当前页...";
  await runOnPage("translateNow");
});

document.getElementById("restore").addEventListener("click", async () => {
  statusEl.textContent = "正在还原...";
  await runOnPage("restore");
});

const openSourceLink = document.getElementById('openSource');
if (openSourceLink) {
  openSourceLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://github.com/hezwl-1/smooth-web-translator' });
  });
}

