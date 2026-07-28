chrome.runtime.onInstalled.addListener(async () => {
  const old = await chrome.storage.sync.get(["autoTranslate", "targetLang"]);
  await chrome.storage.sync.set({
    autoTranslate: old.autoTranslate ?? true,
    targetLang: old.targetLang || "zh-CN"
  });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url || !/^https?:|^file:/.test(tab.url)) return;
  const s = await chrome.storage.sync.get({ autoTranslate: true, targetLang: "zh-CN" });
  if (!s.autoTranslate) return;
  chrome.tabs.sendMessage(tabId, { action: "autoTranslate", lang: s.targetLang }).catch(() => {});
});
