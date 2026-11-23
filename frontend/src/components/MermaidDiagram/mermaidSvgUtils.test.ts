import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  buildExportFilename,
  calculateActualSizePan,
  calculateFitScale,
  calculateSafeExportScale,
  calculateZoomTowardsPoint,
  clampZoom,
  encodeUtf8ToBase64,
  extractDimensionsFromAttributes,
  formatZoomPercent,
  isDangerousAttrName,
  isDangerousUrl,
  normalizeSvgXml,
  parseAndSanitizeSvg,
  parseViewBox,
  sanitizeExportPrefix,
  zoomByWheel,
  zoomIn,
  zoomOut,
} from './mermaidSvgUtils.ts';

describe('mermaidSvgUtils 视口缩放与尺寸计算', () => {
  it('clampZoom / zoomIn / zoomOut / zoomByWheel / formatZoomPercent 遵循上下界与浮点精度', () => {
    assert.equal(clampZoom(Number.NaN), 1);
    assert.equal(clampZoom(Number.POSITIVE_INFINITY), 1);
    assert.equal(clampZoom(0.05), MIN_ZOOM);
    assert.equal(clampZoom(10), MAX_ZOOM);
    assert.equal(clampZoom(1.2349), 1.23);

    assert.equal(zoomIn(1), 1.25);
    assert.equal(zoomIn(MAX_ZOOM), MAX_ZOOM);
    assert.equal(zoomOut(1), 0.75);
    assert.equal(zoomOut(MIN_ZOOM), MIN_ZOOM);

    assert.equal(zoomByWheel(1, 0), 1);
    assert.equal(zoomByWheel(1, -100), 1.12);
    assert.equal(zoomByWheel(1, 100), 0.88);
    assert.equal(formatZoomPercent(0.876), '88%');
  });

  it('calculateZoomTowardsPoint 保持光标锚点稳定', () => {
    const next = calculateZoomTowardsPoint({ x: 0, y: 0 }, 1, 2, { x: 100, y: -50 });
    assert.deepEqual(next, { x: -100, y: 50 });

    const invalid = calculateZoomTowardsPoint({ x: 12, y: 34 }, 0, 2, { x: 10, y: 10 });
    assert.deepEqual(invalid, { x: 12, y: 34 });
  });

  it('calculateFitScale 小图不拉伸，大图等比适应视口', () => {
    assert.equal(calculateFitScale({ width: 320, height: 180 }, { width: 900, height: 540 }, 28), 1);
    assert.equal(
      calculateFitScale({ width: 2000, height: 1000 }, { width: 1056, height: 540 }, 28),
      0.48
    );
    assert.equal(calculateFitScale({ width: 0, height: 100 }, { width: 800, height: 600 }), 1);
  });

  it('calculateActualSizePan 高于视口时顶对齐，否则居中', () => {
    assert.deepEqual(
      calculateActualSizePan({ width: 800, height: 1000 }, { width: 900, height: 500 }, 24),
      { x: 0, y: 226 }
    );
    assert.deepEqual(
      calculateActualSizePan({ width: 400, height: 300 }, { width: 900, height: 500 }, 24),
      { x: 0, y: 0 }
    );
  });

  it('parseViewBox 与 extractDimensionsFromAttributes 正确处理 viewBox、像素和百分比', () => {
    assert.deepEqual(parseViewBox('0, -10 1200.2 640.5'), {
      minX: 0,
      minY: -10,
      width: 1200.2,
      height: 640.5,
    });
    assert.equal(parseViewBox('0 0 0 100'), null);
    assert.equal(parseViewBox('invalid'), null);

    assert.deepEqual(
      extractDimensionsFromAttributes('0 0 1280.1 720.4', '100%', '100%'),
      { width: 1281, height: 721 }
    );
    assert.deepEqual(
      extractDimensionsFromAttributes(null, '640px', '360px'),
      { width: 640, height: 360 }
    );
    assert.deepEqual(
      extractDimensionsFromAttributes(null, '100%', '100%', { width: 800, height: 480 }),
      { width: 800, height: 480 }
    );
  });

  it('calculateSafeExportScale 在超大尺寸下自动降采样', () => {
    assert.equal(calculateSafeExportScale(800, 600), 3);
    assert.equal(calculateSafeExportScale(2000, 1000), 2);
    assert.equal(calculateSafeExportScale(6000, 6000) < 2, true);
  });
});

describe('mermaidSvgUtils XSS 防护与 XML/文件名净化', () => {
  it('isDangerousAttrName 与 isDangerousUrl 拦截事件属性和伪协议（含控制字符混淆）', () => {
    assert.equal(isDangerousAttrName('onclick'), true);
    assert.equal(isDangerousAttrName('ONERROR'), true);
    assert.equal(isDangerousAttrName('stroke-width'), false);

    assert.equal(isDangerousUrl('javascript:alert(1)'), true);
    assert.equal(isDangerousUrl('  java\u0000script:alert(1)'), true);
    assert.equal(isDangerousUrl('VbScript:msgbox(1)'), true);
    assert.equal(isDangerousUrl('data:text/html,<script>alert(1)</script>'), true);
    assert.equal(isDangerousUrl('https://example.com/docs'), false);
    assert.equal(isDangerousUrl('#node-1'), false);
  });

  it('normalizeSvgXml 规范化未闭合 HTML5 标签与空格实体', () => {
    const raw = '<svg><foreignObject><div>line1<br>line2<hr class="sep"><img src="a.png">&nbsp;ok</div></foreignObject></svg>';
    const normalized = normalizeSvgXml(raw);
    assert.equal(
      normalized,
      '<svg><foreignObject><div>line1<br/>line2<hr class="sep"/><img src="a.png"/>&#160;ok</div></foreignObject></svg>'
    );
  });

  it('parseAndSanitizeSvg 在无 DOMParser 环境或空输入时安全返回 null', () => {
    assert.equal(parseAndSanitizeSvg(''), null);
    assert.equal(parseAndSanitizeSvg('<svg></svg>'), null);
  });

  it('sanitizeExportPrefix 与 buildExportFilename 严格拦截路径穿越与非法字符', () => {
    assert.equal(sanitizeExportPrefix(undefined), 'mermaid-diagram');
    assert.equal(sanitizeExportPrefix('../../../'), 'mermaid-diagram');
    assert.equal(sanitizeExportPrefix('../evil/path:name'), 'evil-path-name');
    assert.equal(sanitizeExportPrefix('archdoc-mermaid'), 'archdoc-mermaid');

    const date = new Date(2026, 10, 23, 8, 5, 9);
    assert.equal(buildExportFilename('png', date, 'archdoc-mermaid'), 'archdoc-mermaid-20261123-080509.png');
    assert.equal(buildExportFilename('svg', date, '../bad/../../'), 'bad-20261123-080509.svg');
  });

  it('encodeUtf8ToBase64 正确编码中文字符', () => {
    const encoded = encodeUtf8ToBase64('架构文档图表');
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    assert.equal(decoded, '架构文档图表');
  });
});
