/**
 * 全局遮罩、层叠上下文与弹层交互单例管理器
 * 提供跨微前端共享的动态 Z-Index 栈分配、LIFO 键盘 ESC 监听栈、以及带滚动条跳动补偿的 Body 滚动锁定
 */

export const OVERLAY_GLOBAL_KEY = '__CODE_COMMON_OVERLAY_STATE__';

export interface ZIndexLevels {
  container: number;
  mask: number;
  panel: number;
}

export type OverlayType = 'drawer' | 'modal' | 'confirm' | 'popover';

interface SharedOverlayState {
  zStack: number[];
  escHandlers: (() => void)[];
  escListening: boolean;
  escBoundTarget: Window | null;
  onKeyDown: (e: KeyboardEvent) => void;
  lockCount: number;
  prevBodyOverflow: string;
  prevBodyPaddingRight: string;
  prevMainOverflow: string;
}

function createSharedOverlayState(): SharedOverlayState {
  const state: SharedOverlayState = {
    zStack: [],
    escHandlers: [],
    escListening: false,
    escBoundTarget: null,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state.escHandlers.length > 0) {
        e.stopPropagation();
        e.preventDefault();
        const topHandler = state.escHandlers[state.escHandlers.length - 1];
        if (topHandler) {
          topHandler();
        }
      }
    },
    lockCount: 0,
    prevBodyOverflow: '',
    prevBodyPaddingRight: '',
    prevMainOverflow: '',
  };
  return state;
}

function getSharedOverlayState(): SharedOverlayState {
  if (typeof window !== 'undefined') {
    const win = window as unknown as Record<string, SharedOverlayState | undefined>;
    let existing = win[OVERLAY_GLOBAL_KEY];
    if (!existing) {
      existing = createSharedOverlayState();
      win[OVERLAY_GLOBAL_KEY] = existing;
    }
    return existing;
  }
  return fallbackState;
}

const fallbackState = createSharedOverlayState();

/** 仅用于单元测试重置共享 Overlay 状态 */
export function resetOverlayStateForTest() {
  const state = getSharedOverlayState();
  if (state.escListening && state.escBoundTarget) {
    state.escBoundTarget.removeEventListener('keydown', state.onKeyDown, true);
  }
  state.zStack.length = 0;
  state.escHandlers.length = 0;
  state.escListening = false;
  state.escBoundTarget = null;
  state.lockCount = 0;
  state.prevBodyOverflow = '';
  state.prevBodyPaddingRight = '';
  state.prevMainOverflow = '';
}

// 1. 动态 Z-Index 栈分配器
class ZIndexManager {
  private drawerBase = 1200;
  private modalBase = 1500;
  private step = 10;

  acquire(type: OverlayType = 'drawer', customBase?: number): ZIndexLevels {
    const state = getSharedOverlayState();
    const base = customBase !== undefined
      ? customBase
      : (type === 'modal' || type === 'confirm' ? this.modalBase : this.drawerBase);
    const maxInStack = state.zStack.length > 0 ? Math.max(...state.zStack) : -Infinity;
    const currentBase = state.zStack.length === 0
      ? base
      : Math.max(base, maxInStack + this.step);
    state.zStack.push(currentBase);
    return {
      container: currentBase,
      mask: currentBase,
      panel: currentBase + 5,
    };
  }

  release(level?: number) {
    const state = getSharedOverlayState();
    if (level !== undefined) {
      const idx = state.zStack.lastIndexOf(level);
      if (idx !== -1) {
        state.zStack.splice(idx, 1);
        return;
      }
    }
    state.zStack.pop();
  }
}

export const zIndexManager = new ZIndexManager();

// 2. 全局后进先出 (LIFO) ESC 键盘监听栈
class EscManager {
  push(handler: () => void) {
    const state = getSharedOverlayState();
    state.escHandlers.push(handler);
    if (!state.escListening && typeof window !== 'undefined') {
      window.addEventListener('keydown', state.onKeyDown, true);
      state.escListening = true;
      state.escBoundTarget = window;
    }
  }

  pop(handler: () => void) {
    const state = getSharedOverlayState();
    state.escHandlers = state.escHandlers.filter(h => h !== handler);
    if (state.escHandlers.length === 0 && state.escListening && typeof window !== 'undefined') {
      const target = state.escBoundTarget || window;
      target.removeEventListener('keydown', state.onKeyDown, true);
      state.escListening = false;
      state.escBoundTarget = null;
    }
  }
}

export const escManager = new EscManager();

// 3. 滚动锁定与 Scrollbar 宽度补偿机制（兼容宿主与微前端容器）
export function lockBodyScroll() {
  if (typeof document === 'undefined') return;
  const state = getSharedOverlayState();
  if (state.lockCount === 0) {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    state.prevBodyOverflow = document.body.style.overflow;
    state.prevBodyPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    // 兼容微前端宿主：同时锁定当前处于视窗下的宿主主要滚动容器，防止长表格背景滚动穿透
    const hostMain = document.querySelector('main.portal-content') || document.querySelector('main');
    if (hostMain) {
      state.prevMainOverflow = (hostMain as HTMLElement).style.overflow;
      (hostMain as HTMLElement).style.overflow = 'hidden';
    }
  }
  state.lockCount++;
}

export function unlockBodyScroll() {
  if (typeof document === 'undefined') return;
  const state = getSharedOverlayState();
  state.lockCount = Math.max(0, state.lockCount - 1);
  if (state.lockCount === 0) {
    document.body.style.overflow = state.prevBodyOverflow;
    document.body.style.paddingRight = state.prevBodyPaddingRight;

    const hostMain = document.querySelector('main.portal-content') || document.querySelector('main');
    if (hostMain) {
      (hostMain as HTMLElement).style.overflow = state.prevMainOverflow;
    }
  }
}
