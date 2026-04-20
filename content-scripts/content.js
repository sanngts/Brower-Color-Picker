// ============================================================
// content.js —— 内容脚本（取色器核心）
//
// 职责：接收来自 popup 的截图数据，创建取色器 overlay，
//       处理鼠标移动/点击事件，实现放大镜预览和颜色拾取。
//
// 消息协议：
//   popup → content: { type: "START_PICKER", dataUrl }
//   content → storage: { pickedColor: "#RRGGBB", pickedColorNew: true }
// ============================================================

// ----- 全局状态 -----
var pickerActive = false;
var capturedCanvas = null;    // 离屏 canvas，存储截图用于像素读取
var overlayEl = null;         // 全屏遮罩层（接收鼠标事件）
var magnifierEl = null;       // 放大镜浮层（pointer-events:none）
var magnifierCanvas = null;
var magnifierCtx = null;
var colorLabelEl = null;
var colorBarEl = null;
var sourceDpr = 1;            // 截图时的设备像素比

var ZOOM = 10;               // 放大倍数
var LENS_SIZE = 150;          // 放大镜圆形直径
var CURSOR_OFFSET = 20;       // 光标与放大镜的间距

// ============================================================
// 消息监听：接收 popup 的 START_PICKER 指令
// ============================================================
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.type === "START_PICKER") {
    // 如果已经在取色模式，忽略重复请求
    if (pickerActive) {
      sendResponse({ ok: true, status: "already_active" });
      return false;
    }

    try {
      // 使用网页自身的 devicePixelRatio，而非 popup 传入的
      // popup 和网页可能在不同的显示器上（不同 DPR），导致截图像素坐标错位
      sourceDpr = window.devicePixelRatio || 1;
      initPicker(message.dataUrl);
      sendResponse({ ok: true, status: "started" });
    } catch (err) {
      console.error("[颜色拾取器] 初始化失败:", err);
      sendResponse({ ok: false, error: err.message });
    }
    return false;
  }
  return true;
});

// ============================================================
// 初始化取色器
// ============================================================
function initPicker(dataUrl) {
  pickerActive = true;

  var img = new Image();
  img.onload = function () {
    // 将截图绘制到离屏 canvas，用于后续像素采样
    capturedCanvas = document.createElement("canvas");
    capturedCanvas.width = img.naturalWidth;
    capturedCanvas.height = img.naturalHeight;
    var ctx = capturedCanvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);

    // 截图已就绪，创建 UI
    createPickerUI();
  };

  img.onerror = function () {
    console.error("[颜色拾取器] 截图图片加载失败");
    pickerActive = false;
  };

  img.src = dataUrl;
}

// ============================================================
// 创建取色器 UI（遮罩 + 放大镜）
// ============================================================
function createPickerUI() {
  // --- 遮罩层：全屏覆盖，接收所有鼠标事件 ---
  overlayEl = document.createElement("div");
  overlayEl.id = "__cp_overlay__";
  Object.assign(overlayEl.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    zIndex: "2147483647",
    cursor: buildCrosshairCursor(),
  });

  // --- 放大镜容器：放在 overlay 内部，确保不受页面 stacking context 影响 ---
  magnifierEl = document.createElement("div");
  magnifierEl.id = "__cp_magnifier__";
  Object.assign(magnifierEl.style, {
    position: "fixed",
    width: (LENS_SIZE + 16) + "px",
    height: (LENS_SIZE + 38) + "px",
    borderRadius: "10px",
    overflow: "hidden",
    pointerEvents: "none",
    display: "none",
    boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
    background: "#fff",
    padding: "8px",
    opacity: "0",
    transition: "opacity 0.12s ease",
    zIndex: "999999999",
  });

  // --- 圆形透镜区域 ---
  var lensWrapper = document.createElement("div");
  Object.assign(lensWrapper.style, {
    width: LENS_SIZE + "px",
    height: LENS_SIZE + "px",
    borderRadius: "50%",
    overflow: "hidden",
    border: "2px solid rgba(255,255,255,0.95)",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.1)",
    position: "relative",
  });

  // --- 放大镜 canvas（绘制像素化缩放图） ---
  magnifierCanvas = document.createElement("canvas");
  magnifierCanvas.width = LENS_SIZE;
  magnifierCanvas.height = LENS_SIZE;
  magnifierCtx = magnifierCanvas.getContext("2d", { willReadFrequently: true });
  Object.assign(magnifierCanvas.style, {
    display: "block",
    width: LENS_SIZE + "px",
    height: LENS_SIZE + "px",
    imageRendering: "pixelated",
  });

  lensWrapper.appendChild(magnifierCanvas);
  magnifierEl.appendChild(lensWrapper);

  // --- 颜色信息区 ---
  var infoArea = document.createElement("div");
  Object.assign(infoArea.style, {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginTop: "8px",
    padding: "0 2px",
  });

  colorBarEl = document.createElement("div");
  Object.assign(colorBarEl.style, {
    width: "14px",
    height: "14px",
    borderRadius: "3px",
    border: "1px solid rgba(0,0,0,0.1)",
    flexShrink: "0",
  });

  colorLabelEl = document.createElement("span");
  Object.assign(colorLabelEl.style, {
    fontSize: "10px",
    fontFamily: "Consolas, 'Courier New', monospace",
    color: "#333",
    fontWeight: "600",
    letterSpacing: "0.3px",
  });

  infoArea.appendChild(colorBarEl);
  infoArea.appendChild(colorLabelEl);
  magnifierEl.appendChild(infoArea);

  // --- 插入 DOM ---
  document.documentElement.appendChild(overlayEl);
  overlayEl.appendChild(magnifierEl);

  // --- 绑定事件（使用 capture 阶段确保优先于页面其他事件） ---
  overlayEl.addEventListener("mousemove", handleMouseMove, true);
  overlayEl.addEventListener("click", handleClick, true);
  overlayEl.addEventListener("contextmenu", handleRightClick, true);
  document.addEventListener("keydown", handleKeyDown, true);
}

// ============================================================
// 自定义十字准星光标（内联 SVG data URL）
// ============================================================
function buildCrosshairCursor() {
  // SVG 十字准星：外白内黑，中心留空，在浅色/深色背景均清晰可见
  var svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='21' height='21'>" +
    "<line x1='10' y1='0' x2='10' y2='7' stroke='white' stroke-width='2.5'/>" +
    "<line x1='10' y1='13' x2='10' y2='20' stroke='white' stroke-width='2.5'/>" +
    "<line x1='0' y1='10' x2='7' y2='10' stroke='white' stroke-width='2.5'/>" +
    "<line x1='13' y1='10' x2='20' y2='10' stroke='white' stroke-width='2.5'/>" +
    "<line x1='10' y1='0' x2='10' y2='7' stroke='black' stroke-width='1'/>" +
    "<line x1='10' y1='13' x2='10' y2='20' stroke='black' stroke-width='1'/>" +
    "<line x1='0' y1='10' x2='7' y2='10' stroke='black' stroke-width='1'/>" +
    "<line x1='13' y1='10' x2='20' y2='10' stroke='black' stroke-width='1'/>" +
    "</svg>";
  return "url(\"data:image/svg+xml," + svg + "\") 10 10, crosshair";
}

// ============================================================
// 鼠标移动：实时更新放大镜内容和颜色信息
// ============================================================
function handleMouseMove(e) {
  if (!pickerActive || !capturedCanvas) return;

  var x = e.clientX;
  var y = e.clientY;

  // 用截图时的 DPR 将屏幕坐标映射到截图像素坐标
  var pixelX = Math.round(x * sourceDpr);
  var pixelY = Math.round(y * sourceDpr);

  // 边界保护
  pixelX = Math.max(0, Math.min(pixelX, capturedCanvas.width - 1));
  pixelY = Math.max(0, Math.min(pixelY, capturedCanvas.height - 1));

  var hex = readPixelColor(pixelX, pixelY);

  drawMagnifiedView(pixelX, pixelY);
  positionMagnifier(x, y);

  colorBarEl.style.backgroundColor = hex;
  colorLabelEl.textContent = hex + " " + hexToRgb(hex);

  magnifierEl.style.display = "block";
  requestAnimationFrame(function () {
    magnifierEl.style.opacity = "1";
  });
}

// ============================================================
// 从截图 canvas 读取指定像素的 RGB 值
// ============================================================
function readPixelColor(px, py) {
  var ctx = capturedCanvas.getContext("2d", { willReadFrequently: true });
  var data = ctx.getImageData(px, py, 1, 1).data;
  return rgbToHex(data[0], data[1], data[2]);
}

// ============================================================
// RGB 分量转大写 HEX 字符串
// ============================================================
function rgbToHex(r, g, b) {
  return "#" +
    [r, g, b].map(function (v) {
      return v.toString(16).padStart(2, "0");
    }).join("").toUpperCase();
}

// ============================================================
// HEX 转 RGB 字符串
// ============================================================
function hexToRgb(hex) {
  var h = hex.replace("#", "");
  var r = parseInt(h.substring(0, 2), 16);
  var g = parseInt(h.substring(2, 4), 16);
  var b = parseInt(h.substring(4, 6), 16);
  return "rgb(" + r + ", " + g + ", " + b + ")";
}

// ============================================================
// 绘制放大镜内的像素化缩放视图
// ============================================================
function drawMagnifiedView(centerPx, centerPy) {
  var size = LENS_SIZE;
  var srcSize = size / ZOOM;
  var srcX = centerPx - srcSize / 2;
  var srcY = centerPy - srcSize / 2;

  magnifierCtx.imageSmoothingEnabled = false;
  magnifierCtx.clearRect(0, 0, size, size);
  magnifierCtx.drawImage(
    capturedCanvas,
    srcX, srcY, srcSize, srcSize,
    0, 0, size, size
  );

  // --- 中心像素指示框 ---
  var half = size / 2;
  var pxSize = ZOOM;

  // 外层白色框
  magnifierCtx.strokeStyle = "rgba(255,255,255,0.95)";
  magnifierCtx.lineWidth = 2;
  magnifierCtx.strokeRect(half - pxSize / 2, half - pxSize / 2, pxSize, pxSize);

  // 内层黑色框
  magnifierCtx.strokeStyle = "rgba(0,0,0,0.5)";
  magnifierCtx.lineWidth = 1;
  magnifierCtx.strokeRect(
    half - pxSize / 2 - 1.5,
    half - pxSize / 2 - 1.5,
    pxSize + 3,
    pxSize + 3
  );
}

// ============================================================
// 定位放大镜：自动适配屏幕边缘
// ============================================================
function positionMagnifier(cursorX, cursorY) {
  var magW = LENS_SIZE + 16;
  var magH = LENS_SIZE + 38;
  var gap = CURSOR_OFFSET;
  var vw = window.innerWidth;
  var vh = window.innerHeight;

  // 优先放在光标右上方
  var left = cursorX + gap;
  var top = cursorY - gap - magH;

  // 右侧放不下 → 翻到左侧
  if (left + magW > vw - 8) {
    left = cursorX - gap - magW;
  }
  // 上方放不下 → 放到下方
  if (top < 8) {
    top = cursorY + gap;
  }
  // 左侧也放不下 → 兜底到右下方
  if (left < 8) {
    left = Math.min(cursorX + gap, vw - magW - 8);
    top = cursorY + gap;
  }

  magnifierEl.style.left = left + "px";
  magnifierEl.style.top = top + "px";
}

// ============================================================
// 点击取色：保存到 storage 并清理
// ============================================================
function handleClick(e) {
  if (!pickerActive || !capturedCanvas) return;

  var pixelX = Math.round(e.clientX * sourceDpr);
  var pixelY = Math.round(e.clientY * sourceDpr);
  pixelX = Math.max(0, Math.min(pixelX, capturedCanvas.width - 1));
  pixelY = Math.max(0, Math.min(pixelY, capturedCanvas.height - 1));

  var hex = readPixelColor(pixelX, pixelY);

  // 保存拾取的颜色到扩展存储
  // pickedColorNew 标记为 true，供 popup 判断是否为本次新取色
  chrome.storage.local.set({ pickedColor: hex, pickedColorNew: true });

  // 取色成功的视觉反馈（放大镜边框闪烁）
  magnifierEl.style.boxShadow = "0 0 0 3px #e67e22, 0 4px 24px rgba(0,0,0,0.45)";
  setTimeout(function () {
    cleanupPicker();
  }, 120);
}

// ============================================================
// 右键 / ESC 取消取色
// ============================================================
function handleRightClick(e) {
  e.preventDefault();
  cleanupPicker();
}

function handleKeyDown(e) {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    cleanupPicker();
  }
}

// ============================================================
// 清理取色器：移除所有 DOM 和事件监听
// ============================================================
function cleanupPicker() {
  pickerActive = false;

  if (overlayEl) {
    overlayEl.removeEventListener("mousemove", handleMouseMove, true);
    overlayEl.removeEventListener("click", handleClick, true);
    overlayEl.removeEventListener("contextmenu", handleRightClick, true);
    overlayEl.remove();
    overlayEl = null;
  }
  if (magnifierEl) {
    magnifierEl.remove();
    magnifierEl = null;
  }

  document.removeEventListener("keydown", handleKeyDown, true);

  capturedCanvas = null;
  magnifierCanvas = null;
  magnifierCtx = null;
}
