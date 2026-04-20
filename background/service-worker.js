// ============================================================
// service-worker.js —— 后台脚本（Service Worker）
//
// 职责：扩展安装/更新时的初始化，确保 storage 中存在所需键
// ============================================================

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === "install") {
    // 首次安装，初始化存储
    chrome.storage.local.set({
      colorHistory: [],       // 颜色历史记录
      savedColors: [],        // 收藏的颜色
    });
  }
  if (details.reason === "update") {
    // 扩展更新时，补齐缺失的 storage 键
    chrome.storage.local.get(["colorHistory", "savedColors"], function (result) {
      var updates = {};
      if (!result.colorHistory) updates.colorHistory = [];
      if (!result.savedColors) updates.savedColors = [];
      if (Object.keys(updates).length > 0) {
        chrome.storage.local.set(updates);
      }
    });
  }
});
