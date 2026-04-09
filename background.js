// ============================================================
// background.js —— 后台脚本（Service Worker）
//
// 职责：扩展安装/更新时的初始化
// ============================================================

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === "install") {
    console.log("[颜色拾取器] 扩展首次安装完成！");
    chrome.storage.local.set({
      savedColors: [],
      installDate: new Date().toISOString(),
    });
  }
  if (details.reason === "update") {
    console.log("[颜色拾取器] 扩展已更新。");
  }
});
