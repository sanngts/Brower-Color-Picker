// ========== 颜色转换工具 ==========

/**
 * 随机生成一个 HEX 颜色
 * @returns {string} 如 "#A3F2C1"
 */
function randomHex() {
    const hex = Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0');
    return '#' + hex.toUpperCase();
}

/**
 * HEX → RGB
 * @param {string} hex 如 "#FF5500"
 * @returns {{ r: number, g: number, b: number }}
 */
function hexToRgb(hex) {
    const num = parseInt(hex.slice(1), 16);
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255,
    };
}

/**
 * RGB → HSL
 * @param {{ r: number, g: number, b: number }} rgb
 * @returns {{ h: number, s: number, l: number }}
 */
function rgbToHsl({ r, g, b }) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;

    if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    let h;
    switch (max) {
        case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; break;
        case gn: h = ((bn - rn) / d + 2) / 6; break;
        default:  h = ((rn - gn) / d + 4) / 6; break;
    }

    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100),
    };
}

/**
 * RGB → HSV
 * @param {{ r: number, g: number, b: number }} rgb
 * @returns {{ h: number, s: number, v: number }}
 */
function rgbToHsv({ r, g, b }) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const v = max;

    if (max === min) return { h: 0, s: 0, v: Math.round(v * 100) };

    const d = max - min;
    const s = d / max;

    let h;
    switch (max) {
        case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; break;
        case gn: h = ((bn - rn) / d + 2) / 6; break;
        default:  h = ((rn - gn) / d + 4) / 6; break;
    }

    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        v: Math.round(v * 100),
    };
}


// ========== DOM 引用 ==========

const btnPick       = document.getElementById('btnPick');
const btnHex        = document.getElementById('btnHex');
const btnRgb        = document.getElementById('btnRgb');
const btnHsl        = document.getElementById('btnHsl');
const btnHsv        = document.getElementById('btnHsv');
const colorPreview  = document.getElementById('colorPreview');
const historyList   = document.getElementById('historyList');
const btnPageLeft   = document.getElementById('btnPageLeft');
const btnPageRight  = document.getElementById('btnPageRight');

const colorHistory = [];
const PAGE_SIZE = 5;     // 每页显示数量
const MAX_HISTORY = 10;  // 最大存储数量
let currentPage = 0;     // 当前页码（从 0 开始）


// ========== 更新颜色信息卡片 ==========

function updateColorInfo(hex) {
    const rgb = hexToRgb(hex);
    const hsl = rgbToHsl(rgb);
    const hsv = rgbToHsv(rgb);

    btnHex.textContent = `HEX: ${hex}`;
    btnRgb.textContent = `RGB: ${rgb.r}, ${rgb.g}, ${rgb.b}`;
    btnHsl.textContent = `HSL: ${hsl.h}, ${hsl.s}%, ${hsl.l}%`;
    btnHsv.textContent = `HSV: ${hsv.h}, ${hsv.s}%, ${hsv.v}%`;

    colorPreview.style.backgroundColor = hex;
    colorPreview.querySelector('.card__preview-text').style.display = 'none';
}


// ========== 历史记录分页渲染 ==========

function renderHistoryPage() {
    historyList.innerHTML = ''; // 清空当前页

    const start = currentPage * PAGE_SIZE;
    const pageItems = colorHistory.slice(start, start + PAGE_SIZE);

    pageItems.forEach(hex => {
        const li = document.createElement('li');
        li.className = 'card__list-item';
        li.title = hex;
        li.style.backgroundColor = hex;
        historyList.appendChild(li);
    });

    // 更新翻页按钮状态
    const totalPages = Math.ceil(colorHistory.length / PAGE_SIZE);
    btnPageLeft.disabled  = currentPage <= 0;
    btnPageRight.disabled = currentPage >= totalPages - 1;
}

function addHistoryColor(hex) {
    colorHistory.unshift(hex); // 最新颜色放在最前面

    // 超过上限则移除最旧的
    if (colorHistory.length > MAX_HISTORY) {
        colorHistory.pop();
    }

    // 新增颜色后跳回第一页，方便用户立即看到
    currentPage = 0;
    renderHistoryPage();
}


// ========== 翻页按钮事件 ==========

btnPageLeft.addEventListener('click', () => {
    if (currentPage > 0) {
        currentPage--;
        renderHistoryPage();
    }
});

btnPageRight.addEventListener('click', () => {
    const totalPages = Math.ceil(colorHistory.length / PAGE_SIZE);
    if (currentPage < totalPages - 1) {
        currentPage++;
        renderHistoryPage();
    }
});


// ========== Pick 按钮事件 ==========

btnPick.addEventListener('click', () => {
    const hex = randomHex();
    updateColorInfo(hex);
    addHistoryColor(hex);
});

