const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
function event() {
  const listeners = [];
  return {addListener(fn) {listeners.push(fn);}, emit(...args) {for (const fn of listeners) fn(...args);}, listeners};
}
function load(file, context) {
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  return context;
}
function background() {
  const data = {savedColors: []};
  const changes = event();
  const runtime = {onMessage: event(), onInstalled: event()};
  const tabs = {onActivated: event(), onUpdated: event()};
  const chrome = {runtime, tabs, windows: {onRemoved: event()}, action: {onClicked: event()}, storage: {
    onChanged: changes,
    local: {
      async get() {await new Promise(resolve => setImmediate(resolve)); return structuredClone(data);},
      async set(update) {
        const previous = structuredClone(data);
        await new Promise(resolve => setImmediate(resolve));
        Object.assign(data, structuredClone(update));
        changes.emit(Object.fromEntries(Object.keys(update).map(key => [key, {oldValue: previous[key], newValue: data[key]}])), 'local');
      }
    }
  }};
  const context = load('background/service-worker.js', {chrome, console});
  const send = (message, sender = {}) => new Promise(resolve => runtime.onMessage.listeners[0](message, sender, resolve));
  return {data, chrome, context, send};
}
function element() {
  const handlers = new Map();
  return {style: {}, children: [], textContent: '', disabled: false,
    classList: {add(){}, remove(){}, contains(){return false;}},
    addEventListener(name, fn) {handlers.set(name, fn);}, removeEventListener(name) {handlers.delete(name);},
    appendChild(child) {this.children.push(child);}, remove() {this.removed = true;},
    select() {}, focus() {}, querySelector() {return element();}, handlers,
    getContext() {return {drawImage(){},clearRect(){},strokeRect(){},getImageData(){return {data:[18,52,86,255]};}};}
  };
}
function ui(file, backend) {
  const nodes = new Map();
  const body = element(), doc = element(), win = element();
  Object.assign(doc, {body, documentElement: element(), hidden:false,
    createElement: () => element(), execCommand: () => false,
    getElementById(id) {if(!nodes.has(id)) nodes.set(id,element()); return nodes.get(id);}
  });
  const chrome = backend ? backend.chrome : {runtime: {onMessage:event()}, storage:{onChanged:event()}};
  if (backend) chrome.runtime.sendMessage = (message, callback) => backend.send(message).then(callback);
  Object.assign(win, {location:{search:''},innerWidth:100, innerHeight:80, devicePixelRatio:1, matchMedia() {return {matches:false,addEventListener(){},removeEventListener(){}};}});
  const context=load(file,{chrome,document:doc,window:win,navigator:{},URLSearchParams,console,setTimeout(){},requestAnimationFrame(){},
    innerWidth:100,innerHeight:80,scrollX:0,scrollY:0});
  if (file.startsWith('content')) {
    context.fp = Object.fromEntries(['btnPick','btnSave','favoriteList','favoriteCount'].map(key => [key,element()]));
  }
  vm.runInContext("colors.hex = '#123456'",context);
  const button=file.startsWith('content') ? context.fp.btnPick : nodes.get('btnPick');
  button.textContent='Pick';
  return {context,button,doc,win,nodes};
}
test('concurrent favorites preserve both additions and synchronize open UIs', async () => {
  const bg=background();
  const a=ui('content-scripts/content.js',bg), b=ui('popup/popup.js',bg);
  const results=await Promise.all(['#aabbcc','#123456'].map(color => bg.send({type:'FAVORITES_MUTATE',action:'add',color})));
  assert.ok(results.every(result=>result.ok));
  assert.deepEqual(bg.data.savedColors,['#123456','#AABBCC']);
  for(const panel of [a,b]) assert.equal(vm.runInContext('savedColors.join(",")',panel.context),'#123456,#AABBCC');
  await bg.send({type:'FAVORITES_MUTATE',action:'remove',color:'#aabbcc'});
  assert.deepEqual(bg.data.savedColors,['#123456']);
  await bg.send({type:'FAVORITES_MUTATE',action:'clear'});
  assert.equal(vm.runInContext('savedColors.length',a.context),0);
  assert.equal(vm.runInContext('savedColors.length',b.context),0);
});
test('favorites enforce limit and recover after rejected operation', async () => {
  const bg=background();
  const replies=await Promise.all(Array.from({length:13},(_,i)=>bg.send({type:'FAVORITES_MUTATE',action:'add',color:'#'+i.toString(16).padStart(6,'0')})));
  assert.equal(bg.data.savedColors.length,12);
  assert.equal(replies.filter(x=>!x.ok).length,1);
  assert.equal((await bg.send({type:'FAVORITES_MUTATE',action:'remove',color:'#000000'})).ok,true);
  assert.equal((await bg.send({type:'FAVORITES_MUTATE',action:'add',color:'#ffffff'})).ok,true);
});
for (const file of ['content-scripts/content.js','popup/popup.js']) {
  test(file+': clipboard failure never reports success', async()=>{
    const panel=ui(file);
    panel.context.navigator.clipboard={async writeText(){throw new Error('Denied');}};
    assert.equal(await panel.context.copyColorToClipboard('hex'),false);
    assert.match(panel.button.textContent,/Copy failed/);
    assert.ok(panel.doc.body.children[0].removed);
  });
  test(file+': waits for clipboard and accepts successful fallback',async()=>{
    const panel=ui(file);
    let resolve;
    panel.context.navigator.clipboard={writeText(){return new Promise(done=>{resolve=done;});}};
    const pending=panel.context.copyColorToClipboard('hex');
    assert.equal(panel.button.textContent,'Pick');
    resolve();
    assert.equal(await pending,true);
    assert.equal(panel.button.textContent,'Copied!');
    panel.context.navigator.clipboard.writeText=async()=>{throw Error('Denied');};
    panel.doc.execCommand=()=>true;
    assert.equal(await panel.context.copyColorToClipboard('hex'),true);
  });
}
test('capture uses sender window even when another window is focused',async()=>{
  const bg=background();
  bg.chrome.tabs.get=async id=>({id,windowId:42,active:true,url:'https://example.test/'});
  bg.chrome.tabs.captureVisibleTab=async windowId=>{assert.equal(windowId,42);return 'data:image/png;base64,test';};
  const result=await bg.send({type:'PICKER_STARTED'}, {tab:{id:7}});
  assert.equal(result.ok,true);
  assert.match(result.dataUrl,/data:image/);
});
test('inactive tab is rejected before capture',async()=>{
  const bg=background();
  bg.chrome.tabs.get=async id=>({id,windowId:42,active:false});
  bg.chrome.tabs.captureVisibleTab=async()=>{assert.fail('must not capture');};
  assert.equal((await bg.send({type:'CAPTURE_TAB',tabId:7})).ok,false);
});
test('tab switch away and back during capture discards screenshot',async()=>{
  const bg=background();
  bg.chrome.tabs.get=async id=>({id,windowId:42,active:true,url:'https://example.test/'});
  bg.chrome.tabs.captureVisibleTab=async()=>{
    bg.context.invalidateCapture(42);
    bg.context.invalidateCapture(42);
    return 'wrong screenshot';
  };
  assert.equal((await bg.send({type:'CAPTURE_TAB',tabId:7})).ok,false);
});
test('navigation during capture discards screenshot',async()=>{
  const bg=background();
  let count=0;
  bg.chrome.tabs.get=async id=>({id,windowId:42,active:true,url:++count===1?'https://a.test/':'https://b.test/'});
  bg.chrome.tabs.captureVisibleTab=async()=> 'stale screenshot';
  assert.equal((await bg.send({type:'CAPTURE_TAB',tabId:7})).ok,false);
});
test('picker displays sampled canvas, blocks wheel, cancels on resize and cleans listeners',()=>{
  const panel=ui('content-scripts/content.js');
  const ctx=panel.context, canvas=element();
  canvas.width=100;canvas.height=80;
  ctx.capturedCanvas=canvas;ctx.pickerActive=true;
  ctx.createPickerUI();
  assert.equal(ctx.overlayEl.children[0],canvas);
  let prevented=false;
  ctx.overlayEl.handlers.get('wheel')({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  let shown=false;
  ctx.showFloatPanel=()=>{shown=true;};
  panel.win.handlers.get('resize')();
  assert.equal(ctx.pickerActive,false);
  assert.equal(ctx.overlayEl,null);
  assert.equal(ctx.capturedCanvas,null);
  assert.equal(shown,true);
  assert.equal(panel.win.handlers.has('resize'),false);
  assert.equal(panel.doc.handlers.has('visibilitychange'),false);
});

test('favorite state matches existing colors regardless of HEX casing', () => {
  for (const file of ['content-scripts/content.js', 'popup/popup.js']) {
    const panel = ui(file);
    vm.runInContext("savedColors = ['#aAbBcC']", panel.context);
    assert.equal(panel.context.isFavoriteColor('#AABBCC'), true);
    assert.equal(panel.context.isFavoriteColor('#aabbcc'), true);
  }
});

test('X and Twitter use native popup while other websites retain the floating panel', () => {
  const bg=background();
  for(const url of ['https://x.com/home','https://www.x.com/','https://twitter.com/user','https://mobile.twitter.com/']) {
    assert.equal(bg.context.popupForUrl(url),'popup/popup.html?mode=native');
  }
  for(const url of ['https://example.com/','https://x.com.example.com/','https://notx.com/']) {
    assert.equal(bg.context.popupForUrl(url),'');
  }
  assert.equal(bg.context.popupForUrl('edge://extensions/'),'popup/popup.html');
});
test('X toolbar routing sets a popup without messaging the page', async () => {
  const bg=background();
  let configured, opened=false;
  bg.chrome.action.setPopup=async options=>{configured=options;};
  bg.chrome.action.openPopup=async()=>{opened=true;};
  bg.chrome.tabs.sendMessage=()=>assert.fail('X must not need a content script to show the panel');
  bg.context.updatePopupForTab({id:7,url:'https://x.com/home'});
  assert.equal(configured.popup,'popup/popup.html?mode=native');
  bg.chrome.action.onClicked.emit({id:7,url:'https://x.com/home'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(opened,true);
});
test('native mode starts within the click handler and resets after cancellation', async () => {
  const panel=ui('popup/popup.js');
  panel.win.location.search='?mode=native';
  let opened=false;
  panel.win.EyeDropper=class {open(){opened=true;return Promise.reject({name:'AbortError'});}};
  panel.button.handlers.get('click')();
  assert.equal(opened,true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(panel.button.disabled,false);
  assert.equal(panel.button.textContent,'Pick');
});
test('native mode reports missing browser support instead of silently failing', () => {
  const panel=ui('popup/popup.js');
  panel.context.console={error(){}};
  panel.win.location.search='?mode=native';
  panel.button.handlers.get('click')();
  assert.equal(panel.button.textContent,'Native picker unavailable');
  assert.equal(panel.button.disabled,false);
});

test('native selection persists the color and history while preserving favorites', async () => {
  const bg=background();
  bg.data.savedColors=['#AABBCC'];
  const panel=ui('popup/popup.js',bg);
  panel.win.location.search='?mode=native';
  panel.win.EyeDropper=class {open(){return Promise.resolve({sRGBHex:'#123456'});}};
  panel.button.handlers.get('click')();
  await new Promise(resolve=>setImmediate(resolve));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(bg.data.pickedColor,'#123456');
  assert.deepEqual(bg.data.colorHistory,['#123456']);
  assert.deepEqual(bg.data.savedColors,['#AABBCC']);
  assert.equal(panel.button.disabled,false);
});
