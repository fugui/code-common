import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OVERLAY_GLOBAL_KEY,
  escManager,
  lockBodyScroll,
  resetOverlayStateForTest,
  unlockBodyScroll,
  zIndexManager,
} from './overlay.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('overlay 跨应用单例与层级管理', () => {
  beforeEach(() => {
    resetOverlayStateForTest();
  });

  afterEach(() => {
    resetOverlayStateForTest();
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).document;
  });

  it('zIndexManager 严格递增，Modal 之上打开 Drawer 仍能压过 Modal 且支持乱序精确释放', () => {
    const d1 = zIndexManager.acquire('drawer');
    assert.equal(d1.container, 1200);
    assert.equal(d1.panel, 1205);

    const m1 = zIndexManager.acquire('modal');
    assert.equal(m1.container, 1500);
    assert.equal(m1.panel, 1505);

    // 在 Modal (1500) 之上再次打开 Drawer，必须比 1500 更高
    const d2 = zIndexManager.acquire('drawer');
    assert.ok(d2.container > m1.container, `d2(${d2.container}) 应高于 m1(${m1.container})`);
    assert.equal(d2.container, 1510);

    // 乱序先释放中间的 m1
    zIndexManager.release(m1.container);
    const d3 = zIndexManager.acquire('drawer');
    assert.equal(d3.container, 1520);

    zIndexManager.release(d3.container);
    zIndexManager.release(d2.container);
    zIndexManager.release(d1.container);

    // 全部释放后重新获取应回到基线 1200
    const dReset = zIndexManager.acquire('drawer');
    assert.equal(dReset.container, 1200);
  });

  it('在浏览器 window 下自动挂载并复用同一个全局共享状态槽位', () => {
    const listeners: Record<string, Array<(e: KeyboardEvent) => void>> = {};
    const mockWindow = {
      addEventListener(type: string, fn: (e: KeyboardEvent) => void) {
        listeners[type] = listeners[type] || [];
        listeners[type].push(fn);
      },
      removeEventListener(type: string, fn: (e: KeyboardEvent) => void) {
        listeners[type] = (listeners[type] || []).filter((item) => item !== fn);
      },
    };
    (globalThis as Record<string, unknown>).window = mockWindow;

    const first = zIndexManager.acquire('drawer');
    assert.equal(first.container, 1200);
    assert.ok(
      (mockWindow as Record<string, unknown>)[OVERLAY_GLOBAL_KEY],
      '应在 window 上初始化共享 overlay 状态'
    );

    // 模拟另一个微前端模块直接操作同一共享状态
    const shared = (mockWindow as Record<string, { zStack: number[] }>)[OVERLAY_GLOBAL_KEY];
    assert.deepEqual(shared.zStack, [1200]);

    const second = zIndexManager.acquire('drawer');
    assert.equal(second.container, 1210);
    assert.deepEqual(shared.zStack, [1200, 1210]);
  });

  it('escManager 遵循 LIFO 后进先出顺序且在空栈时注销全局监听', () => {
    const listeners: Array<(e: KeyboardEvent) => void> = [];
    (globalThis as Record<string, unknown>).window = {
      addEventListener(_type: string, fn: (e: KeyboardEvent) => void) {
        listeners.push(fn);
      },
      removeEventListener(_type: string, fn: (e: KeyboardEvent) => void) {
        const idx = listeners.indexOf(fn);
        if (idx !== -1) listeners.splice(idx, 1);
      },
    };

    const calls: string[] = [];
    const h1 = () => calls.push('first');
    const h2 = () => calls.push('second');

    escManager.push(h1);
    escManager.push(h2);
    assert.equal(listeners.length, 1, '多个 handler 应只绑定一次全局 keydown 监听');

    const fakeEvent = {
      key: 'Escape',
      stopPropagation() {},
      preventDefault() {},
    } as unknown as KeyboardEvent;

    listeners[0](fakeEvent);
    assert.deepEqual(calls, ['second']);

    escManager.pop(h2);
    listeners[0](fakeEvent);
    assert.deepEqual(calls, ['second', 'first']);

    escManager.pop(h1);
    assert.equal(listeners.length, 0, '栈空后应移除全局 keydown 监听');
  });

  it('theme.css 中顶栏 --z-index-header 必须严格低于抽屉与弹窗层级', () => {
    const themePath = path.resolve(__dirname, '../styles/theme.css');
    const css = fs.readFileSync(themePath, 'utf8');

    const getToken = (name: string): number => {
      const m = css.match(new RegExp(`${name}:\\s*(\\d+);`));
      assert.ok(m, `theme.css 缺少 ${name}`);
      return Number(m[1]);
    };

    const header = getToken('--z-index-header');
    const dropdown = getToken('--z-index-dropdown');
    const drawerMask = getToken('--z-index-drawer-mask');
    const drawerPanel = getToken('--z-index-drawer-panel');
    const modalMask = getToken('--z-index-modal-mask');
    const modalPanel = getToken('--z-index-modal-panel');

    assert.ok(header < dropdown, `header(${header}) 应小于 dropdown(${dropdown})`);
    assert.ok(header < drawerMask, `header(${header}) 应小于 drawerMask(${drawerMask})`);
    assert.ok(drawerMask < drawerPanel, `drawerMask(${drawerMask}) 应小于 drawerPanel(${drawerPanel})`);
    assert.ok(drawerPanel < modalMask, `drawerPanel(${drawerPanel}) 应小于 modalMask(${modalMask})`);
    assert.ok(modalMask < modalPanel, `modalMask(${modalMask}) 应小于 modalPanel(${modalPanel})`);
  });

  it('lockBodyScroll/unlockBodyScroll 按 overflowX/overflowY 分写保存并恢复，避免简写清空内联 overflowY', () => {
    function createCssomStyle(init: { overflowX?: string; overflowY?: string } = {}) {
      const state = {
        overflowX: init.overflowX ?? '',
        overflowY: init.overflowY ?? '',
        paddingRight: '',
      };
      return {
        get overflow() {
          // 模拟真实浏览器 CSSOM：当仅设置了其中一个分写属性时，简写 overflow 返回空字符串
          return state.overflowX === state.overflowY ? state.overflowX : '';
        },
        set overflow(val: string) {
          state.overflowX = val;
          state.overflowY = val;
        },
        get overflowX() {
          return state.overflowX;
        },
        set overflowX(val: string) {
          state.overflowX = val;
        },
        get overflowY() {
          return state.overflowY;
        },
        set overflowY(val: string) {
          state.overflowY = val;
        },
        get paddingRight() {
          return state.paddingRight;
        },
        set paddingRight(val: string) {
          state.paddingRight = val;
        },
      };
    }

    const bodyEl = { style: createCssomStyle({ overflowX: 'hidden' }) };
    const mainEl = { style: createCssomStyle({ overflowY: 'auto' }), isConnected: true };

    (globalThis as Record<string, unknown>).window = {
      innerWidth: 1440,
    };
    (globalThis as Record<string, unknown>).document = {
      documentElement: { clientWidth: 1425 },
      body: bodyEl,
      querySelector(selector: string) {
        if (selector === 'main.portal-content') return mainEl;
        return null;
      },
    };

    lockBodyScroll();
    assert.equal(bodyEl.style.overflowX, 'hidden');
    assert.equal(bodyEl.style.overflowY, 'hidden');
    assert.equal(bodyEl.style.paddingRight, '15px');
    assert.equal(mainEl.style.overflowX, 'hidden');
    assert.equal(mainEl.style.overflowY, 'hidden');

    unlockBodyScroll();
    assert.equal(bodyEl.style.overflowX, 'hidden');
    assert.equal(bodyEl.style.overflowY, '');
    assert.equal(bodyEl.style.paddingRight, '');
    assert.equal(mainEl.style.overflowX, '');
    assert.equal(mainEl.style.overflowY, 'auto');
  });

  it('嵌套多次 lockBodyScroll/unlockBodyScroll 保持引用计数，且解锁恢复最初锁定的 main 节点', () => {
    const bodyEl = { style: { overflow: '', overflowX: '', overflowY: '', paddingRight: '' } };
    const initialMain = { style: { overflow: '', overflowX: '', overflowY: 'auto' }, isConnected: true };
    const anotherMain = { style: { overflow: '', overflowX: '', overflowY: 'scroll' }, isConnected: true };
    let currentMain = initialMain;

    (globalThis as Record<string, unknown>).window = { innerWidth: 1280 };
    (globalThis as Record<string, unknown>).document = {
      documentElement: { clientWidth: 1280 },
      body: bodyEl,
      querySelector(selector: string) {
        if (selector === 'main.portal-content' || selector === 'main') return currentMain;
        return null;
      },
    };

    lockBodyScroll();
    lockBodyScroll();
    assert.equal(initialMain.style.overflowY, 'hidden');

    // 锁定期间模拟页面内出现了新的 main 节点
    currentMain = anotherMain;

    unlockBodyScroll();
    assert.equal(initialMain.style.overflowY, 'hidden', '未完全解锁前不应提前恢复滚动');

    unlockBodyScroll();
    assert.equal(initialMain.style.overflowY, 'auto', '完全解锁后应恢复最初被锁定的节点');
    assert.equal(anotherMain.style.overflowY, 'scroll', '不应误改后出现的其他 main 节点');
  });
});
