import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { copyTextSafe, copyTextWithResult } from './clipboard.ts';

type PropertyMap = Record<string, PropertyDescriptor | undefined>;

const originalDescriptors: PropertyMap = {
  window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
  navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
  document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
};

function setGlobalValue(key: 'window' | 'navigator' | 'document', value: unknown): void {
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
    writable: true,
  });
}

function restoreGlobals(): void {
  for (const key of ['window', 'navigator', 'document'] as const) {
    const desc = originalDescriptors[key];
    if (desc) {
      Object.defineProperty(globalThis, key, desc);
    } else {
      delete (globalThis as Record<string, unknown>)[key];
    }
  }
}

interface MockElement {
  tagName: string;
  value: string;
  tabIndex: number;
  style: Record<string, string>;
  attributes: Record<string, string>;
  parentNode: { removeChild: (node: MockElement) => void } | null;
  focused: number;
  selected: number;
  selectionRange: [number, number] | null;
  removed: boolean;
  setAttribute: (name: string, val: string) => void;
  focus: (opts?: { preventScroll?: boolean }) => void;
  select: () => void;
  setSelectionRange: (start: number, end: number) => void;
  remove: () => void;
}

function createMockDocument(execResult: boolean | (() => boolean)) {
  const appended: MockElement[] = [];
  const activeChildren: MockElement[] = [];
  let restoreFocusCalls = 0;

  const previousActiveElement = {
    focus(_opts?: { preventScroll?: boolean }) {
      restoreFocusCalls += 1;
    },
  };

  const body = {
    appendChild(el: MockElement) {
      el.parentNode = body;
      appended.push(el);
      activeChildren.push(el);
      return el;
    },
    removeChild(el: MockElement) {
      const idx = activeChildren.indexOf(el);
      if (idx !== -1) {
        activeChildren.splice(idx, 1);
      }
      el.parentNode = null;
    },
  };

  const doc = {
    body,
    documentElement: body,
    activeElement: previousActiveElement,
    createElement(tagName: string): MockElement {
      const el: MockElement = {
        tagName,
        value: '',
        tabIndex: 0,
        style: {},
        attributes: {},
        parentNode: null,
        focused: 0,
        selected: 0,
        selectionRange: null,
        removed: false,
        setAttribute(name: string, val: string) {
          this.attributes[name] = val;
        },
        focus() {
          this.focused += 1;
        },
        select() {
          this.selected += 1;
        },
        setSelectionRange(start: number, end: number) {
          this.selectionRange = [start, end];
        },
        remove() {
          this.removed = true;
          body.removeChild(this);
        },
      };
      return el;
    },
    execCommand(cmd: string): boolean {
      assert.equal(cmd, 'copy');
      if (typeof execResult === 'function') {
        return execResult();
      }
      return execResult;
    },
  };

  return {
    doc,
    appended,
    activeChildren,
    getRestoreFocusCalls: () => restoreFocusCalls,
  };
}

describe('clipboard 通用复制工具', () => {
  afterEach(() => {
    restoreGlobals();
  });

  it('安全上下文下优先使用 navigator.clipboard.writeText', async () => {
    const written: string[] = [];
    setGlobalValue('window', { isSecureContext: true });
    setGlobalValue('navigator', {
      clipboard: {
        writeText: async (text: string) => {
          written.push(text);
        },
      },
    });
    setGlobalValue('document', undefined);

    const res = await copyTextWithResult('# Hello Markdown');
    assert.deepEqual(res, { ok: true, method: 'clipboard-api' });
    assert.deepEqual(written, ['# Hello Markdown']);
  });

  it('非安全上下文（如内网 HTTP）navigator.clipboard 缺失时自动降级 execCommand 并清理 DOM 与恢复焦点', async () => {
    const mock = createMockDocument(true);
    setGlobalValue('window', { isSecureContext: false });
    setGlobalValue('navigator', {});
    setGlobalValue('document', mock.doc);

    const res = await copyTextWithResult('line1\nline2');
    assert.deepEqual(res, { ok: true, method: 'exec-command' });
    assert.equal(mock.appended.length, 1);

    const textarea = mock.appended[0];
    assert.equal(textarea.tagName, 'textarea');
    assert.equal(textarea.value, 'line1\nline2');
    assert.equal(textarea.attributes.readonly, '');
    assert.equal(textarea.attributes['aria-hidden'], 'true');
    assert.equal(textarea.tabIndex, -1);
    assert.equal(textarea.selected, 1);
    assert.deepEqual(textarea.selectionRange, [0, 'line1\nline2'.length]);
    assert.equal(textarea.removed, true);
    assert.equal(mock.activeChildren.length, 0);
    assert.equal(mock.getRestoreFocusCalls(), 1);
  });

  it('安全上下文下 Clipboard API 抛错时自动降级到 execCommand', async () => {
    const mock = createMockDocument(true);
    setGlobalValue('window', { isSecureContext: true });
    setGlobalValue('navigator', {
      clipboard: {
        writeText: async () => {
          throw new Error('NotAllowedError');
        },
      },
    });
    setGlobalValue('document', mock.doc);

    const res = await copyTextWithResult('fallback text');
    assert.deepEqual(res, { ok: true, method: 'exec-command' });
    assert.equal(mock.appended.length, 1);
    assert.equal(mock.activeChildren.length, 0);
  });

  it('window.isSecureContext === false 时即使存在 clipboard 对象也直接走 execCommand', async () => {
    let clipboardCalled = false;
    const mock = createMockDocument(true);
    setGlobalValue('window', { isSecureContext: false });
    setGlobalValue('navigator', {
      clipboard: {
        writeText: async () => {
          clipboardCalled = true;
        },
      },
    });
    setGlobalValue('document', mock.doc);

    const res = await copyTextWithResult('http-only');
    assert.equal(clipboardCalled, false);
    assert.deepEqual(res, { ok: true, method: 'exec-command' });
  });

  it('支持空字符串复制', async () => {
    const mock = createMockDocument(true);
    setGlobalValue('window', { isSecureContext: false });
    setGlobalValue('navigator', {});
    setGlobalValue('document', mock.doc);

    const ok = await copyTextSafe('');
    assert.equal(ok, true);
    assert.equal(mock.appended[0].value, '');
    assert.deepEqual(mock.appended[0].selectionRange, [0, 0]);
  });

  it('Clipboard API 与 execCommand 均失败或抛错时返回失败且清理临时节点', async () => {
    const mock = createMockDocument(() => {
      throw new Error('execCommand blocked');
    });
    setGlobalValue('window', { isSecureContext: true });
    setGlobalValue('navigator', {
      clipboard: {
        writeText: async () => {
          throw new Error('clipboard denied');
        },
      },
    });
    setGlobalValue('document', mock.doc);

    const res = await copyTextWithResult('fail');
    assert.equal(res.ok, false);
    assert.equal(res.method, 'none');
    assert.ok(res.error instanceof Error);
    assert.equal(mock.activeChildren.length, 0);

    const mockFalse = createMockDocument(false);
    setGlobalValue('window', { isSecureContext: false });
    setGlobalValue('navigator', {});
    setGlobalValue('document', mockFalse.doc);
    assert.equal(await copyTextSafe('fail2'), false);
    assert.equal(mockFalse.activeChildren.length, 0);
  });
});
