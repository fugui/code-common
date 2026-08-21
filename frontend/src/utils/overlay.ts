/**
 * 全局遮罩、层叠上下文与弹层交互单例管理器
 * 提供动态 Z-Index 栈分配、LIFO 键盘 ESC 监听栈、以及带滚动条跳动补偿的 Body 滚动锁定
 */

// 1. 动态 Z-Index 栈分配器
export interface ZIndexLevels {
  container: number;
  mask: number;
  panel: number;
}

class ZIndexManager {
  private base = 99900;
  private step = 10;
  private stack: number[] = [];

  acquire(): ZIndexLevels {
    const currentBase = this.base + this.stack.length * this.step;
    this.stack.push(currentBase);
    return {
      container: currentBase,
      mask: currentBase + 1,
      panel: currentBase + 5,
    };
  }

  release() {
    this.stack.pop();
  }
}

export const zIndexManager = new ZIndexManager();

// 2. 全局后进先出 (LIFO) ESC 键盘监听栈
class EscManager {
  private handlers: (() => void)[] = [];
  private listening = false;

  push(handler: () => void) {
    this.handlers.push(handler);
    if (!this.listening && typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onKeyDown, true);
      this.listening = true;
    }
  }

  pop(handler: () => void) {
    this.handlers = this.handlers.filter(h => h !== handler);
    if (this.handlers.length === 0 && this.listening && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onKeyDown, true);
      this.listening = false;
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.handlers.length > 0) {
      e.stopPropagation();
      e.preventDefault();
      const topHandler = this.handlers[this.handlers.length - 1];
      if (topHandler) {
        topHandler();
      }
    }
  };
}

export const escManager = new EscManager();

// 3. 滚动锁定与 Scrollbar 宽度补偿机制
let lockCount = 0;
let prevBodyOverflow = '';
let prevBodyPaddingRight = '';

export function lockBodyScroll() {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    prevBodyOverflow = document.body.style.overflow;
    prevBodyPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
  lockCount++;
}

export function unlockBodyScroll() {
  if (typeof document === 'undefined') return;
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = prevBodyOverflow;
    document.body.style.paddingRight = prevBodyPaddingRight;
  }
}
