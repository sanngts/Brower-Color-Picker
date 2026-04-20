// ========== DOM 引入 ==========
const colorPreview = document.getElementById('colorPreview');
const btnHex = document.getElementById('btnHex');
const btnRgb = document.getElementById('btnRgb');
const btnHsl = document.getElementById('btnHsl');
const btnHsv = document.getElementById('btnHsv');
const btnPick = document.getElementById("btnPick");
const btnPageLeft = document.getElementById('btnPageLeft');
const btnPageRight = document.getElementById('btnPageRight');
const historyList = document.getElementById('historyList');
const colorHistory = [];
const PAGE_SIZE = 5;     
const MAX_HISTORY = 10;  
let currentPage = 0;    

// 全局颜色对象，存储当前取色结果的颜色信息
let colors = {'hex': '', 'rgb': '', 'hsl': '', 'hsv': ''};

function showColor(color) {
    colorPreview.style.backgroundColor = color;
}

// 添加事件监听器
btnPick.addEventListener("click", pickcolor);
btnHex.addEventListener("click", () => copyColorToClipboard('hex'));
btnRgb.addEventListener("click", () => copyColorToClipboard('rgb'));
btnHsl.addEventListener("click", () => copyColorToClipboard('hsl'));
btnHsv.addEventListener("click", () => copyColorToClipboard('hsv'));

async function pickcolor() 
{
    try 
    {
        const dropper = new EyeDropper();
        const result = await dropper.open();
        const color = result.sRGBHex;

        updateColorInfo(color);
        // 默认自动复制 HEX 颜色代码到剪贴板
        copyColorToClipboard('hex');
    } catch (error) 
    {
        console.error(error);
    }
}
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
function updateColorInfo(hex, addToHistory = true) {
    const rgb = hexToRgb(hex);
    const hsl = rgbToHsl(rgb);
    const hsv = rgbToHsv(rgb);

    // 更新全局颜色对象
    // 语法糖: 属性简写(Shorthand Properties): 当对象的键名和变量名相同时，可以只写一次。
    colors = { hex, rgb, hsl, hsv };

    btnHex.textContent = `HEX: ${hex}`;
    btnRgb.textContent = `RGB: ${rgb.r}, ${rgb.g}, ${rgb.b}`;
    btnHsl.textContent = `HSL: ${hsl.h}, ${hsl.s}%, ${hsl.l}%`;
    btnHsv.textContent = `HSV: ${hsv.h}, ${hsv.s}%, ${hsv.v}%`;

    colorPreview.style.backgroundColor = hex;
    colorPreview.querySelector('.card__preview-text').style.display = 'none';
    if (addToHistory) {
        addHistoryColor(hex);
    }
}

function copyColorToClipboard(colorCode) {
    if(!colors.hex) {
        return; // 如果没有颜色信息，直接返回，不执行复制操作
    }
    if(colorCode == 'hex') {
        navigator.clipboard.writeText(colors.hex);
    } else if(colorCode == 'rgb') {
        navigator.clipboard.writeText(`${colors.rgb.r}, ${colors.rgb.g}, ${colors.rgb.b}`);
    } else if(colorCode == 'hsl') {
        navigator.clipboard.writeText(`${colors.hsl.h}, ${colors.hsl.s}%, ${colors.hsl.l}%`);
    } else if(colorCode == 'hsv') {
        navigator.clipboard.writeText(`${colors.hsv.h}, ${colors.hsv.s}%, ${colors.hsv.v}%`);
    }
    // 提示用户已复制
    btnPick.textContent = 'Copied!';
    // 1秒后恢复按钮文本
    setTimeout(() => {
        btnPick.textContent = 'Pick';
    }, 1000);
}

function renderHistoryPage() {
    historyList.innerHTML = ''; 

    const start = currentPage * PAGE_SIZE;
    const pageItems = colorHistory.slice(start, start + PAGE_SIZE);

    pageItems.forEach(hex => {
        const li = document.createElement('li');
        li.className = 'card__list-item';
        li.title = hex;
        li.style.backgroundColor = hex;
        li.addEventListener('click', () => updateColorInfo(hex, false));
        historyList.appendChild(li);
    });

    const totalPages = Math.ceil(colorHistory.length / PAGE_SIZE);
    btnPageLeft.disabled  = currentPage <= 0;
    btnPageRight.disabled = currentPage >= totalPages - 1;
}

function addHistoryColor(hex) {
    colorHistory.unshift(hex); 

    if (colorHistory.length > MAX_HISTORY) {
        colorHistory.pop();
    }

    currentPage = 0;
    renderHistoryPage();
}

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

