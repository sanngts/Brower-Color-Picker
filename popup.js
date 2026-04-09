// ============================================================
// popup.js —— 弹出页面脚本（两阶段模式）
//
// 阶段一：只显示居中的 Pick 按钮
// 阶段二：取色完成后展开完整界面（颜色管理 + 收藏夹）
// ============================================================

// ----- 阶段一：Pick 按钮 -----
var pickStage = document.getElementById("pickStage");
var pickBtn = document.getElementById("pickBtn");

// ----- 阶段二：完整界面元素 -----
var mainStage = document.getElementById("mainStage");
var pickBtnAgain = document.getElementById("pickBtnAgain");
var colorPicker = document.getElementById("colorPicker");
var colorPreview = document.getElementById("colorPreview");
var hexInput = document.getElementById("hexInput");
var rgbInput = document.getElementById("rgbInput");
var saveBtn = document.getElementById("saveBtn");
var savedColors = document.getElementById("savedColors");
var copyBtns = document.querySelectorAll(".copy-btn");

// ----- 工具函数 -----

function hexToRgb(hex) {
  var h = hex.replace("#", "");
  var r = parseInt(h.substring(0, 2), 16);
  var g = parseInt(h.substring(2, 4), 16);
  var b = parseInt(h.substring(4, 6), 16);
  return "rgb(" + r + ", " + g + ", " + b + ")";
}

function normalizeHex(hex) {
  if (!hex.startsWith("#")) hex = "#" + hex;
  return hex.toUpperCase();
}

function updateColorDisplay(hex) {
  hex = normalizeHex(hex);
  colorPicker.value = hex;
  colorPreview.style.backgroundColor = hex;
  hexInput.value = hex;
  rgbInput.value = hexToRgb(hex);
}

// ----- 阶段切换 -----

function showMainStage() {
  pickStage.classList.add("hidden");
  mainStage.classList.add("visible");
}

function showPickStage() {
  mainStage.classList.remove("visible");
  pickStage.classList.remove("hidden");
  // 重置按钮状态
  pickBtn.disabled = false;
  pickBtn.innerHTML = '<span class="pick-icon">&#9678;</span> Pick';
}

// ----- 颜色选择器事件 -----
colorPicker.addEventListener("input", function (e) {
  updateColorDisplay(e.target.value);
});

// ----- HEX 输入框事件 -----
hexInput.addEventListener("input", function (e) {
  if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
    updateColorDisplay(e.target.value);
  }
});

// ----- 复制按钮 -----
copyBtns.forEach(function (btn) {
  btn.addEventListener("click", function () {
    var targetInput = document.getElementById(this.getAttribute("data-target"));
    var text = targetInput.value;
    var originalText = btn.textContent;

    navigator.clipboard.writeText(text).then(function () {
      btn.textContent = "已复制";
      setTimeout(function () {
        btn.textContent = originalText;
      }, 1200);
    }).catch(function () {
      btn.textContent = "失败";
      setTimeout(function () {
        btn.textContent = originalText;
      }, 1200);
    });
  });
});

// ----- 取色逻辑（两个 Pick 按钮共用） -----
function startPicker(triggerBtn, fallbackBtn) {
  triggerBtn.disabled = true;
  triggerBtn.textContent = "截图中...";

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var tab = tabs[0];
    if (!tab) {
      resetBtn(triggerBtn, fallbackBtn, "失败");
      return;
    }

    chrome.tabs.captureVisibleTab(null, { format: "png" }, function (dataUrl) {
      if (chrome.runtime.lastError || !dataUrl) {
        console.error("[Pick] 截图失败:", chrome.runtime.lastError);
        resetBtn(triggerBtn, fallbackBtn, "失败");
        return;
      }

      sendPickerMessage(tab.id, dataUrl, triggerBtn, fallbackBtn, 0);
    });
  });
}

function sendPickerMessage(tabId, dataUrl, triggerBtn, fallbackBtn, retryCount) {
  chrome.tabs.sendMessage(tabId, {
    type: "START_PICKER",
    dataUrl: dataUrl,
  }, function (response) {
    if (chrome.runtime.lastError) {
      if (retryCount === 0) {
        // 首次失败，尝试动态注入 content script
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ["content.js"],
        }, function () {
          if (chrome.runtime.lastError) {
            resetBtn(triggerBtn, fallbackBtn, "此页面不支持");
            return;
          }
          // 注入成功，重试发送
          sendPickerMessage(tabId, dataUrl, triggerBtn, fallbackBtn, 1);
        });
        return;
      }
      resetBtn(triggerBtn, fallbackBtn, "启动失败");
      return;
    }
    // 消息发送成功，关闭 popup 让用户在页面上操作
    window.close();
  });
}

function resetBtn(triggerBtn, fallbackBtn, text) {
  pickerInProgress = false;
  triggerBtn.disabled = false;
  if (fallbackBtn) {
    fallbackBtn.innerHTML = '<span class="pick-icon">&#9678;</span> Pick';
  } else {
    triggerBtn.innerHTML = '<span class="pick-icon">&#9678;</span> Pick';
  }
  if (text) {
    triggerBtn.textContent = text;
    setTimeout(function () {
      triggerBtn.innerHTML = '<span class="pick-icon">&#9678;</span> Pick';
      if (fallbackBtn) {
        fallbackBtn.innerHTML = '<span class="pick-icon">&#9678;</span> Pick';
      }
    }, 2000);
  }
}

// ----- Pick 按钮事件绑定 -----
pickBtn.addEventListener("click", function () {
  startPicker(pickBtn, null);
});

pickBtnAgain.addEventListener("click", function () {
  pickBtnAgain.disabled = true;
  pickBtnAgain.textContent = "截图中...";

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var tab = tabs[0];
    if (!tab) {
      pickBtnAgain.disabled = false;
      pickBtnAgain.innerHTML = '<span class="pick-icon">&#9678;</span> Pick';
      return;
    }

    chrome.tabs.captureVisibleTab(null, { format: "png" }, function (dataUrl) {
      if (chrome.runtime.lastError || !dataUrl) {
        pickBtnAgain.disabled = false;
        pickBtnAgain.innerHTML = '<span class="pick-icon">&#9678;</span> Pick';
        return;
      }

      sendPickerMessage(tab.id, dataUrl, pickBtnAgain, pickBtnAgain, 0);
    });
  });
});

// ----- 本地存储 -----
function saveColorsToStorage(colors) {
  chrome.storage.local.set({ savedColors: colors });
}

function renderSavedColorsFromStorage() {
  chrome.storage.local.get(["savedColors"], function (result) {
    renderSavedColors(result.savedColors || []);
  });
}

// ----- 保存颜色 -----
saveBtn.addEventListener("click", function () {
  var currentColor = hexInput.value;
  chrome.storage.local.get(["savedColors"], function (result) {
    var colors = result.savedColors || [];
    if (colors.includes(currentColor)) return;
    colors.push(currentColor);
    if (colors.length > 28) colors.shift();
    saveColorsToStorage(colors);
    renderSavedColors(colors);
  });
});

// ----- 渲染收藏颜色 -----
function renderSavedColors(colors) {
  savedColors.innerHTML = "";
  if (colors.length === 0) {
    var hint = document.createElement("p");
    hint.className = "empty-hint";
    hint.textContent = "暂无收藏";
    savedColors.appendChild(hint);
    return;
  }

  colors.forEach(function (color, index) {
    var card = document.createElement("div");
    card.className = "color-card";
    card.style.backgroundColor = color;
    card.title = color;

    card.addEventListener("click", function (e) {
      if (e.target.classList.contains("delete-btn")) return;
      updateColorDisplay(color);
    });

    var deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "\u00d7";
    deleteBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      colors.splice(index, 1);
      saveColorsToStorage(colors);
      renderSavedColors(colors);
    });

    card.appendChild(deleteBtn);
    savedColors.appendChild(card);
  });
}

// ----- 页面初始化 -----
document.addEventListener("DOMContentLoaded", function () {
  chrome.storage.local.get(["pickedColor", "savedColors"], function (result) {
    renderSavedColors(result.savedColors || []);

    if (result.pickedColor) {
      // 上次已取色，直接显示结果界面
      updateColorDisplay(result.pickedColor);
      showMainStage();
    } else {
      // 尚未取色，显示 Pick 按钮
      updateColorDisplay("#FF6B6B");
      showPickStage();
    }
  });
});
