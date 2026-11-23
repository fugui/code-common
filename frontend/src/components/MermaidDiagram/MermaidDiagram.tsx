import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  escManager,
  lockBodyScroll,
  unlockBodyScroll,
  zIndexManager,
  type ZIndexLevels,
} from '../../utils/overlay';
import {
  AlertTriangleIcon,
  CheckIcon,
  CloseIcon,
  CodeIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  FileCodeIcon,
  ImageIcon,
  MaximizeIcon,
  MinimizeIcon,
  RotateCcwIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from './MermaidIcons';
import {
  ClipboardImageUnsupportedError,
  MAX_ZOOM,
  MIN_ZOOM,
  calculateActualSizePan,
  calculateFitScale,
  calculateZoomTowardsPoint,
  clampZoom,
  copyPngToClipboard,
  copyTextSafe,
  downloadPngDiagram,
  downloadSvgDiagram,
  extractSvgDimensions,
  formatZoomPercent,
  parseAndSanitizeSvg,
  zoomByWheel,
  zoomIn,
  zoomOut,
  type Point2D,
  type SvgDimensions,
} from './mermaidSvgUtils';
import './MermaidDiagram.css';

export interface MermaidInitConfig {
  startOnLoad?: boolean;
  theme?: 'default' | 'dark';
  securityLevel?: 'strict' | 'loose' | 'antiscript' | 'sandbox';
  fontFamily?: string;
  themeVariables?: Record<string, string>;
}

export interface MermaidEngine {
  initialize: (config: MermaidInitConfig) => void;
  render: (id: string, text: string) => Promise<{ svg: string }>;
}

export type MermaidEngineProvider =
  | MermaidEngine
  | (() => Promise<MermaidEngine | { default: MermaidEngine }>);

export interface MermaidDiagramProps {
  chart: string;
  /** Mermaid 渲染引擎实例或动态加载函数（如 `mermaid` 或 `() => import('mermaid')`） */
  mermaid: MermaidEngineProvider;
  /** 可选：显式指定亮/暗主题；省略时自动监听 documentElement 的 light-theme / data-theme */
  isLightTheme?: boolean;
  /** 可选：内联视图工具栏扩展插槽（如批注按钮） */
  headerExtra?: React.ReactNode;
  /** 可选：是否显示 PNG/SVG/复制图片导出组，默认 true */
  enableExport?: boolean;
  /** 可选：内联模式最大高度（px），默认 540 */
  inlineMaxHeight?: number;
  /** 可选：导出文件名前缀，默认 'mermaid-diagram' */
  exportFilenamePrefix?: string;
  /** 可选：卡片外层自定义类名 */
  className?: string;
}

interface NoticeState {
  kind: 'success' | 'warning' | 'error';
  text: string;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originPan: Point2D;
}

interface ViewportMetrics {
  width: number;
  height: number;
  fullscreen: boolean;
}

interface GlobalMermaidQueueState {
  queue: Promise<void>;
  seq: number;
}

const INLINE_MIN_HEIGHT = 170;
const INLINE_LARGE_MIN_HEIGHT = 340;
const DEFAULT_INLINE_MAX_HEIGHT = 540;
const VIEWPORT_PADDING = 28;
const GLOBAL_QUEUE_KEY = '__CODE_COMMON_MERMAID_STATE__';

// 挂载到 globalThis 的串行渲染队列与递增序号，避免微前端宿主与子应用并发调用 mermaid.initialize / render 产生竞态
function getGlobalMermaidState(): GlobalMermaidQueueState {
  const host = globalThis as unknown as Record<string, GlobalMermaidQueueState | undefined>;
  let state = host[GLOBAL_QUEUE_KEY];
  if (!state) {
    state = { queue: Promise.resolve(), seq: 0 };
    host[GLOBAL_QUEUE_KEY] = state;
  }
  return state;
}

function nextMermaidRenderId(): string {
  const state = getGlobalMermaidState();
  state.seq += 1;
  return `code-mermaid-diag-${state.seq}`;
}

function enqueueMermaidRender<T>(task: () => Promise<T>): Promise<T> {
  const state = getGlobalMermaidState();
  const result = state.queue.then(task, task);
  state.queue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

async function resolveMermaidEngine(provider: MermaidEngineProvider): Promise<MermaidEngine> {
  if (typeof provider === 'function') {
    const loaded = await provider();
    return 'default' in loaded ? loaded.default : loaded;
  }
  return provider;
}

function detectLightTheme(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  const root = document.documentElement;
  return root.getAttribute('data-theme') === 'light' || root.classList.contains('light-theme');
}

function removeMermaidTempElements(id: string): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.getElementById(id)?.remove();
  document.getElementById(`d${id}`)?.remove();
}

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({
  chart,
  mermaid: mermaidProvider,
  isLightTheme: isLightThemeProp,
  headerExtra,
  enableExport = true,
  inlineMaxHeight = DEFAULT_INLINE_MAX_HEIGHT,
  exportFilenamePrefix,
  className = '',
}) => {
  const safeInlineMaxHeight = Math.max(160, inlineMaxHeight);

  const [observedLightTheme, setObservedLightTheme] = useState<boolean>(() => detectLightTheme());
  const isLightTheme = isLightThemeProp ?? observedLightTheme;

  const [svgMarkup, setSvgMarkup] = useState<string>('');
  const [naturalSize, setNaturalSize] = useState<SvgDimensions | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [rendering, setRendering] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'diagram' | 'code'>('diagram');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [modalZIndex, setModalZIndex] = useState<ZIndexLevels | null>(null);

  const [zoom, setZoom] = useState<number>(1);
  const [fitScale, setFitScale] = useState<number>(1);
  const [pan, setPan] = useState<Point2D>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [viewportMetrics, setViewportMetrics] = useState<ViewportMetrics>({
    width: 0,
    height: 0,
    fullscreen: false,
  });

  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [exportingPng, setExportingPng] = useState<boolean>(false);
  const [copyingImage, setCopyingImage] = useState<boolean>(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const svgHostRef = useRef<HTMLDivElement | null>(null);
  const renderedSvgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const zoomRef = useRef<number>(zoom);
  const panRef = useRef<Point2D>(pan);
  const noticeTimerRef = useRef<number | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const hasInitializedViewRef = useRef<boolean>(false);
  const mermaidProviderRef = useRef<MermaidEngineProvider>(mermaidProvider);

  zoomRef.current = zoom;
  panRef.current = pan;
  mermaidProviderRef.current = mermaidProvider;

  const exportBgColor = isLightTheme ? '#ffffff' : '#0f172a';

  const showNotice = useCallback((kind: NoticeState['kind'], text: string, duration = 2600) => {
    setNotice({ kind, text });
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, duration);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  // 未显式传入 isLightTheme 时，自动监听宿主根节点的主题切换
  useEffect(() => {
    if (isLightThemeProp !== undefined || typeof document === 'undefined') {
      return;
    }
    setObservedLightTheme(detectLightTheme());
    if (typeof MutationObserver === 'undefined') {
      return;
    }
    const observer = new MutationObserver(() => {
      setObservedLightTheme(detectLightTheme());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
    return () => observer.disconnect();
  }, [isLightThemeProp]);

  // 1. 串行调用 Mermaid 安全渲染（securityLevel: 'strict' 防止 XSS）
  useEffect(() => {
    let isMounted = true;
    const renderId = nextMermaidRenderId();
    setRendering(true);
    setRenderError(null);
    setSvgMarkup('');
    setNaturalSize(null);
    hasInitializedViewRef.current = false;

    const runRender = async () => {
      try {
        const renderedSvg = await enqueueMermaidRender(async () => {
          if (!isMounted) {
            return '';
          }
          const engine = await resolveMermaidEngine(mermaidProviderRef.current);
          if (!isMounted) {
            return '';
          }
          engine.initialize({
            startOnLoad: false,
            theme: isLightTheme ? 'default' : 'dark',
            securityLevel: 'strict',
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            themeVariables: isLightTheme
              ? {
                  primaryColor: '#e0e7ff',
                  primaryTextColor: '#1e1b4b',
                  primaryBorderColor: '#6366f1',
                  lineColor: '#64748b',
                  secondaryColor: '#f1f5f9',
                  tertiaryColor: '#ffffff',
                }
              : {
                  primaryColor: '#1e293b',
                  primaryTextColor: '#f8fafc',
                  primaryBorderColor: '#3b82f6',
                  lineColor: '#94a3b8',
                  secondaryColor: '#0f172a',
                  tertiaryColor: '#1e293b',
                },
          });

          const cleanChart = chart.trim();
          const { svg } = await engine.render(renderId, cleanChart);
          return svg;
        });

        if (!isMounted) {
          removeMermaidTempElements(renderId);
          return;
        }

        setSvgMarkup(renderedSvg);
        setRenderError(null);
        setRendering(false);
      } catch (err: unknown) {
        removeMermaidTempElements(renderId);
        if (isMounted) {
          const errMsg = err instanceof Error && err.message ? err.message : 'Mermaid 语法格式无法解析';
          setRenderError(errMsg);
          setSvgMarkup('');
          setNaturalSize(null);
          setRendering(false);
        }
      }
    };

    void runRender();

    return () => {
      isMounted = false;
      removeMermaidTempElements(renderId);
    };
  }, [chart, isLightTheme]);

  // 2. 通过 DOMParser 安全解析并挂载唯一 SVG 实例（无 dangerouslySetInnerHTML，且全屏与内联不重复挂双份 SVG）
  useEffect(() => {
    const host = svgHostRef.current;
    if (!host || !svgMarkup || viewMode !== 'diagram' || renderError) {
      if (host) {
        host.replaceChildren();
      }
      renderedSvgRef.current = null;
      return;
    }

    const sanitizedSvg = parseAndSanitizeSvg(svgMarkup);
    if (!sanitizedSvg) {
      setRenderError('渲染结果不是有效的 SVG 文档');
      renderedSvgRef.current = null;
      return;
    }

    const dims = extractSvgDimensions(sanitizedSvg);
    sanitizedSvg.setAttribute('width', String(dims.width));
    sanitizedSvg.setAttribute('height', String(dims.height));
    sanitizedSvg.style.maxWidth = 'none';
    sanitizedSvg.style.width = `${dims.width}px`;
    sanitizedSvg.style.height = `${dims.height}px`;

    host.replaceChildren(sanitizedSvg);
    renderedSvgRef.current = sanitizedSvg;
    setNaturalSize(dims);

    return () => {
      host.replaceChildren();
      renderedSvgRef.current = null;
    };
  }, [svgMarkup, viewMode, renderError, isFullscreen]);

  // 3. 监听当前活跃画布容器的尺寸变化（如拖动侧边栏或切换全屏）
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || viewMode !== 'diagram' || renderError) {
      return;
    }

    const updateSize = () => {
      const rect = viewport.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewportMetrics((prev) =>
          prev.fullscreen === isFullscreen &&
          Math.abs(prev.width - rect.width) < 1 &&
          Math.abs(prev.height - rect.height) < 1
            ? prev
            : { width: rect.width, height: rect.height, fullscreen: isFullscreen }
        );
      }
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [viewMode, renderError, isFullscreen, rendering]);

  // 4. 计算当前适应视口缩放比，并在图表首次加载或切换全屏模式后自动适配居中
  useEffect(() => {
    if (
      !naturalSize ||
      viewportMetrics.fullscreen !== isFullscreen ||
      viewportMetrics.width <= 0 ||
      viewportMetrics.height <= 0
    ) {
      return;
    }

    const targetHeight = isFullscreen ? viewportMetrics.height : safeInlineMaxHeight;
    const computedFit = calculateFitScale(
      naturalSize,
      { width: viewportMetrics.width, height: targetHeight },
      VIEWPORT_PADDING
    );
    setFitScale(computedFit);

    if (!hasInitializedViewRef.current) {
      hasInitializedViewRef.current = true;
      setZoom(computedFit);
      setPan({ x: 0, y: 0 });
    }
  }, [naturalSize, viewportMetrics, isFullscreen, safeInlineMaxHeight]);

  const handleToggleFullscreen = useCallback((nextFullscreen: boolean) => {
    hasInitializedViewRef.current = false;
    setIsFullscreen(nextFullscreen);
  }, []);

  const handleResetFit = useCallback(() => {
    if (naturalSize && viewportRef.current) {
      const rect = viewportRef.current.getBoundingClientRect();
      const targetHeight = isFullscreen ? rect.height : safeInlineMaxHeight;
      const computed = calculateFitScale(
        naturalSize,
        { width: rect.width, height: targetHeight },
        VIEWPORT_PADDING
      );
      setFitScale(computed);
      setZoom(computed);
      setPan({ x: 0, y: 0 });
      return;
    }
    setZoom(fitScale);
    setPan({ x: 0, y: 0 });
  }, [fitScale, isFullscreen, naturalSize, safeInlineMaxHeight]);

  const handleActualSize = useCallback(() => {
    setZoom(1);
    if (naturalSize && viewportRef.current) {
      const rect = viewportRef.current.getBoundingClientRect();
      setPan(calculateActualSizePan(naturalSize, { width: rect.width, height: rect.height }));
    } else {
      setPan({ x: 0, y: 0 });
    }
  }, [naturalSize]);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => zoomIn(prev));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => zoomOut(prev));
  }, []);

  // 5. 注册原生非 passive 滚轮事件（内联需按 Ctrl/Cmd 避免打断页面滚动；全屏支持直接滚轮以鼠标为中心缩放）
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || viewMode !== 'diagram' || renderError || rendering) {
      return;
    }

    const handleWheel = (e: WheelEvent) => {
      const shouldZoom = isFullscreen || e.ctrlKey || e.metaKey;
      if (!shouldZoom) {
        return;
      }

      e.preventDefault();
      const oldScale = zoomRef.current;
      const nextScale = zoomByWheel(oldScale, e.deltaY);
      if (nextScale === oldScale) {
        return;
      }

      const rect = viewport.getBoundingClientRect();
      const cursorFromCenter: Point2D = {
        x: e.clientX - rect.left - rect.width / 2,
        y: e.clientY - rect.top - rect.height / 2,
      };
      const nextPan = calculateZoomTowardsPoint(
        panRef.current,
        oldScale,
        nextScale,
        cursorFromCenter
      );
      setZoom(nextScale);
      setPan(nextPan);
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      viewport.removeEventListener('wheel', handleWheel);
    };
  }, [isFullscreen, viewMode, renderError, rendering]);

  // 6a. 全屏模式接入全局遮罩层管理：动态 Z-Index、宿主滚动锁定与 LIFO Esc 监听
  useEffect(() => {
    if (!isFullscreen) {
      return;
    }

    const levels = zIndexManager.acquire('modal');
    setModalZIndex(levels);
    lockBodyScroll();

    const handleEsc = () => {
      handleToggleFullscreen(false);
    };
    escManager.push(handleEsc);

    return () => {
      escManager.pop(handleEsc);
      unlockBodyScroll();
      zIndexManager.release();
      setModalZIndex(null);
    };
  }, [isFullscreen, handleToggleFullscreen]);

  // 6b. 全屏模式缩放快捷键支持（+ / - / 0 / 1）
  useEffect(() => {
    if (!isFullscreen) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomIn();
        return;
      }
      if (e.key === '-') {
        e.preventDefault();
        handleZoomOut();
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        handleResetFit();
        return;
      }
      if (e.key === '1') {
        e.preventDefault();
        handleActualSize();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen, handleZoomIn, handleZoomOut, handleResetFit, handleActualSize]);

  // 7. Pointer Events 拖拽平移
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || rendering || Boolean(renderError)) {
      return;
    }
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originPan: panRef.current,
    };
    setIsPanning(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 忽略部分合成事件不支持 pointer capture 的情况
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) {
      return;
    }
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setPan({
      x: Math.round((drag.originPan.x + dx) * 100) / 100,
      y: Math.round((drag.originPan.y + dy) * 100) / 100,
    });
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) {
      return;
    }
    dragRef.current = null;
    setIsPanning(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // 忽略释放异常
    }
  };

  const handleViewportDoubleClick = () => {
    if (rendering || renderError) {
      return;
    }
    if (isFullscreen) {
      handleResetFit();
    } else {
      handleToggleFullscreen(true);
    }
  };

  // 8. 复制与导出操作
  const handleCopyCode = async () => {
    const ok = await copyTextSafe(chart);
    if (ok) {
      setCopiedCode(true);
      showNotice('success', '已复制 Mermaid 源码');
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => {
        setCopiedCode(false);
        copiedTimerRef.current = null;
      }, 2000);
    } else {
      showNotice('error', '复制失败，请手动选中源码复制');
    }
  };

  const handleDownloadSvg = () => {
    const svgEl = renderedSvgRef.current;
    if (!svgEl) {
      showNotice('warning', '请切换至图表视图后再导出');
      return;
    }
    try {
      downloadSvgDiagram(svgEl, exportBgColor, exportFilenamePrefix);
      showNotice('success', '已保存 SVG 矢量图');
    } catch {
      showNotice('error', 'SVG 导出失败，请重试');
    }
  };

  const handleDownloadPng = async () => {
    const svgEl = renderedSvgRef.current;
    if (!svgEl) {
      showNotice('warning', '请切换至图表视图后再导出');
      return;
    }
    if (exportingPng) {
      return;
    }
    setExportingPng(true);
    try {
      await downloadPngDiagram(svgEl, exportBgColor, exportFilenamePrefix);
      showNotice('success', '已保存高清 PNG 图片');
    } catch (err: unknown) {
      const msg = err instanceof Error && err.message ? err.message : 'PNG 导出失败，可尝试下载 SVG';
      showNotice('error', msg, 3600);
    } finally {
      setExportingPng(false);
    }
  };

  const handleCopyImage = async () => {
    const svgEl = renderedSvgRef.current;
    if (!svgEl) {
      showNotice('warning', '请切换至图表视图后再复制图片');
      return;
    }
    if (copyingImage) {
      return;
    }
    setCopyingImage(true);
    try {
      await copyPngToClipboard(svgEl, exportBgColor);
      showNotice('success', '已复制高清图片到剪贴板');
    } catch (err: unknown) {
      if (err instanceof ClipboardImageUnsupportedError) {
        showNotice('warning', err.message, 4000);
      } else {
        showNotice('warning', '复制图片受浏览器权限限制，请直接点击“PNG”下载', 4000);
      }
    } finally {
      setCopyingImage(false);
    }
  };

  const canOperateDiagram = viewMode === 'diagram' && !rendering && !renderError && Boolean(svgMarkup);
  const isAtActualSize = Math.abs(zoom - 1) < 0.015;
  const isAtFitScale = Math.abs(zoom - fitScale) < 0.015 && Math.abs(pan.x) < 1 && Math.abs(pan.y) < 1;

  // 计算内联画布的智能高度：小图紧凑包裹，大图提供充裕操作空间
  const computedInlineHeight = (() => {
    if (!naturalSize) {
      return Math.min(safeInlineMaxHeight, 220);
    }
    const isLargeDiagram = fitScale < 0.98 || naturalSize.height > 440;
    const minH = Math.min(
      safeInlineMaxHeight,
      isLargeDiagram ? INLINE_LARGE_MIN_HEIGHT : INLINE_MIN_HEIGHT
    );
    const desired = Math.ceil(naturalSize.height * fitScale + 64);
    return Math.min(safeInlineMaxHeight, Math.max(minH, desired));
  })();

  const renderHeader = (inModal: boolean) => (
    <div className="code-mermaid-header">
      <div className="code-mermaid-header-left">
        <span className="code-mermaid-badge">Mermaid</span>
        {naturalSize && !renderError && (
          <span className="code-mermaid-size-tag" title="图表原始像素尺寸">
            {naturalSize.width} × {naturalSize.height}
          </span>
        )}
        {renderError && (
          <span className="code-mermaid-error-badge">
            <AlertTriangleIcon size={13} /> 解析异常
          </span>
        )}
        {notice && (
          <span className={`code-mermaid-notice code-mermaid-notice--${notice.kind}`}>
            {notice.text}
          </span>
        )}
      </div>

      <div className="code-mermaid-toolbar">
        {/* 内联模式下提供图表/源码切换 */}
        {!inModal && (
          <div className="code-mermaid-segment">
            <button
              type="button"
              onClick={() => setViewMode('diagram')}
              className={`code-mermaid-segment-btn ${
                viewMode === 'diagram' ? 'code-mermaid-segment-btn--active' : ''
              }`}
              title="查看渲染图表"
            >
              <EyeIcon size={12} /> 图表
            </button>
            <button
              type="button"
              onClick={() => setViewMode('code')}
              className={`code-mermaid-segment-btn ${
                viewMode === 'code' ? 'code-mermaid-segment-btn--active' : ''
              }`}
              title="查看 Mermaid 源码"
            >
              <CodeIcon size={12} /> 源码
            </button>
          </div>
        )}

        {/* 缩放与视口控制组 */}
        {canOperateDiagram && (
          <>
            {!inModal && <span className="code-mermaid-divider" aria-hidden="true" />}
            <div className="code-mermaid-group" role="group" aria-label="图表缩放控制">
              <button
                type="button"
                className="code-mermaid-tool-btn code-mermaid-tool-btn--icon"
                onClick={handleZoomOut}
                disabled={clampZoom(zoom) <= MIN_ZOOM}
                title="缩小 (-)"
                aria-label="缩小图表"
              >
                <ZoomOutIcon size={14} />
              </button>
              <button
                type="button"
                className="code-mermaid-zoom-readout"
                onClick={handleResetFit}
                title="点击重置并适应窗口 (0)"
                aria-label={`当前缩放比例 ${formatZoomPercent(zoom)}，点击适应窗口`}
              >
                {formatZoomPercent(zoom)}
              </button>
              <button
                type="button"
                className="code-mermaid-tool-btn code-mermaid-tool-btn--icon"
                onClick={handleZoomIn}
                disabled={clampZoom(zoom) >= MAX_ZOOM}
                title="放大 (+)"
                aria-label="放大图表"
              >
                <ZoomInIcon size={14} />
              </button>
              <button
                type="button"
                className={`code-mermaid-tool-btn ${
                  isAtActualSize && fitScale < 0.98 ? 'code-mermaid-tool-btn--active' : ''
                }`}
                onClick={handleActualSize}
                title="按 1:1 原始清晰尺寸查看 (1)"
              >
                1:1
              </button>
              <button
                type="button"
                className={`code-mermaid-tool-btn ${
                  isAtFitScale ? 'code-mermaid-tool-btn--active' : ''
                }`}
                onClick={handleResetFit}
                title="居中并适应当前视口 (0)"
              >
                <RotateCcwIcon size={13} />
                <span className="code-mermaid-btn-label">适应</span>
              </button>
            </div>

            {enableExport && (
              <>
                <span className="code-mermaid-divider" aria-hidden="true" />
                <div className="code-mermaid-group" role="group" aria-label="图表导出操作">
                  <button
                    type="button"
                    className="code-mermaid-tool-btn"
                    onClick={() => void handleDownloadPng()}
                    disabled={exportingPng}
                    title="保存为高清 PNG 图片"
                  >
                    <DownloadIcon size={13} />
                    <span className="code-mermaid-btn-label">{exportingPng ? '导出中...' : 'PNG'}</span>
                  </button>
                  <button
                    type="button"
                    className="code-mermaid-tool-btn"
                    onClick={handleDownloadSvg}
                    title="保存为无损 SVG 矢量图"
                  >
                    <FileCodeIcon size={13} />
                    <span className="code-mermaid-btn-label">SVG</span>
                  </button>
                  <button
                    type="button"
                    className="code-mermaid-tool-btn"
                    onClick={() => void handleCopyImage()}
                    disabled={copyingImage}
                    title="复制高清 PNG 图片到剪贴板"
                  >
                    <ImageIcon size={13} />
                    <span className="code-mermaid-btn-label">
                      {copyingImage ? '复制中...' : '复制图片'}
                    </span>
                  </button>
                </div>
              </>
            )}
          </>
        )}

        <span className="code-mermaid-divider" aria-hidden="true" />

        {/* 复制源码 */}
        <button
          type="button"
          onClick={() => void handleCopyCode()}
          className={`code-mermaid-tool-btn ${copiedCode ? 'code-mermaid-tool-btn--success' : ''}`}
          title="复制 Mermaid 源码"
        >
          {copiedCode ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
          <span className="code-mermaid-btn-label">{copiedCode ? '已复制' : '源码'}</span>
        </button>

        {/* 调用方扩展操作（例如审阅批注） */}
        {!inModal && headerExtra && (
          <>
            <span className="code-mermaid-divider" aria-hidden="true" />
            {headerExtra}
          </>
        )}

        {/* 全屏 / 关闭全屏 */}
        {inModal ? (
          <button
            type="button"
            className="code-mermaid-modal-close"
            onClick={() => handleToggleFullscreen(false)}
            title="退出全屏预览 (Esc)"
          >
            <CloseIcon size={14} />
            <span>关闭</span>
          </button>
        ) : (
          canOperateDiagram && (
            <button
              type="button"
              className="code-mermaid-tool-btn"
              onClick={() => handleToggleFullscreen(true)}
              title="全屏沉浸式查看大图"
            >
              <MaximizeIcon size={13} />
              <span className="code-mermaid-btn-label">全屏</span>
            </button>
          )
        )}
      </div>
    </div>
  );

  const renderInteractiveCanvas = (inModal: boolean) => (
    <div
      ref={viewportRef}
      className={[
        'code-mermaid-viewport',
        inModal ? 'code-mermaid-viewport--fullscreen' : '',
        isPanning ? 'code-mermaid-viewport--panning' : '',
        rendering ? 'code-mermaid-viewport--loading' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={inModal ? undefined : { height: `${computedInlineHeight}px` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onDoubleClick={handleViewportDoubleClick}
    >
      {rendering ? (
        <div className="code-mermaid-loading">图表渲染中...</div>
      ) : (
        <>
          <div
            className="code-mermaid-stage"
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
            }}
          >
            <div ref={svgHostRef} className="code-mermaid-svg-host" />
          </div>
          <div className="code-mermaid-hint">
            {inModal
              ? '滚轮缩放 · 按住拖拽 · 双击适应 · 快捷键 +/-/1/0/Esc'
              : '按住拖拽 · Ctrl+滚轮缩放 · 双击全屏'}
          </div>
        </>
      )}
    </div>
  );

  const fullscreenModal =
    isFullscreen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="code-mermaid-modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Mermaid 图表全屏预览"
            style={modalZIndex ? { zIndex: modalZIndex.mask } : undefined}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                handleToggleFullscreen(false);
              }
            }}
          >
            <div
              className="code-mermaid-modal"
              style={modalZIndex ? { zIndex: modalZIndex.panel } : undefined}
            >
              {renderHeader(true)}
              {renderInteractiveCanvas(true)}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div className={`code-mermaid-card ${className}`.trim()}>
        {renderHeader(false)}

        {viewMode === 'code' || renderError ? (
          <div className="code-mermaid-code-body">
            {renderError && (
              <div className="code-mermaid-error-box">
                <strong>图表语法解析失败：</strong>
                <div className="code-mermaid-error-detail">{renderError}</div>
              </div>
            )}
            <pre className="code-mermaid-pre">
              <code>{chart}</code>
            </pre>
          </div>
        ) : isFullscreen ? (
          <div className="code-mermaid-inline-placeholder">
            <span>正在全屏预览此图表</span>
            <button
              type="button"
              className="code-mermaid-restore-btn"
              onClick={() => handleToggleFullscreen(false)}
            >
              <MinimizeIcon size={14} /> 返回内联视图
            </button>
          </div>
        ) : (
          renderInteractiveCanvas(false)
        )}
      </div>

      {fullscreenModal}
    </>
  );
};

export default MermaidDiagram;
