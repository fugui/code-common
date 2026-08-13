import React, { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface PaginationProps {
  /**
   * Data total items count
   */
  totalItems: number;
  /**
   * The page size options to display
   * @default [15, 25, 50, 100]
   */
  pageSizeOptions?: number[];
  /**
   * The default page size if not present in URL
   * @default 25
   */
  defaultPageSize?: number;
  /**
   * Override the search params key for page. Default is 'page'
   */
  pageKey?: string;
  /**
   * Override the search params key for pageSize. Default is 'pageSize'
   */
  pageSizeKey?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  totalItems,
  pageSizeOptions = [15, 25, 50, 100],
  defaultPageSize = 25,
  pageKey = 'page',
  pageSizeKey = 'pageSize'
}) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const pageParam = parseInt(searchParams.get(pageKey) || '1', 10);
  const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;

  const pageSizeParam = parseInt(searchParams.get(pageSizeKey) || String(defaultPageSize), 10);
  const pageSize = isNaN(pageSizeParam) || pageSizeParam < 1 ? defaultPageSize : pageSizeParam;

  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  const updateParams = useCallback((newParams: Record<string, string | number>) => {
    const nextParams = new URLSearchParams(searchParams);
    Object.keys(newParams).forEach(key => {
      nextParams.set(key, String(newParams[key]));
    });
    setSearchParams(nextParams);
  }, [searchParams, setSearchParams]);

  const getPageNumbers = () => {
    const maxVisible = 5;
    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    let start = Math.max(1, page - 2);
    let end = Math.min(totalPages, start + maxVisible - 1);
    
    // Adjust window if we are near the start or end
    if (end - start + 1 < maxVisible) {
      if (start === 1) {
        end = Math.min(totalPages, start + maxVisible - 1);
      } else {
        start = Math.max(1, end - maxVisible + 1);
      }
    }
    
    const pages: number[] = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  if (totalItems <= 0) return null;

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      flexWrap: 'wrap', 
      gap: '0.75rem', 
      marginTop: '1rem', 
      padding: '0.5rem 1rem', 
      background: 'var(--card-bg, #ffffff)', 
      border: '1px solid var(--border-color, #e2e8f0)', 
      borderRadius: '6px' 
    }}>
      <div style={{ color: '#64748b', fontSize: '0.875rem' }}>
        共 {totalItems} 条记录，当前第 {page} / {totalPages} 页
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
        {/* 首页 */}
        <button
          disabled={page === 1}
          onClick={() => updateParams({ [pageKey]: 1 })}
          style={{
            padding: '0.3rem 0.6rem', border: '1px solid var(--border-color, #e2e8f0)', background: 'transparent',
            borderRadius: '4px', cursor: page === 1 ? 'not-allowed' : 'pointer',
            color: page === 1 ? 'var(--text-secondary, #94a3b8)' : 'var(--text-color, #334155)', fontSize: '0.825rem',
            transition: 'all 0.2s', whiteSpace: 'nowrap', opacity: page === 1 ? 0.5 : 1
          }}
          onMouseEnter={e => { if (page !== 1) e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          首页
        </button>
        {/* 上一页 */}
        <button
          disabled={page === 1}
          onClick={() => updateParams({ [pageKey]: Math.max(page - 1, 1) })}
          style={{
            padding: '0.3rem 0.6rem', border: '1px solid var(--border-color, #e2e8f0)', background: 'transparent',
            borderRadius: '4px', cursor: page === 1 ? 'not-allowed' : 'pointer',
            color: page === 1 ? 'var(--text-secondary, #94a3b8)' : 'var(--text-color, #334155)', fontSize: '0.825rem',
            transition: 'all 0.2s', whiteSpace: 'nowrap', opacity: page === 1 ? 0.5 : 1
          }}
          onMouseEnter={e => { if (page !== 1) e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          上一页
        </button>
        
        {/* 5页连续数字滑动窗口 */}
        {getPageNumbers().map(pageNum => {
          const isCurrent = page === pageNum;
          return (
            <button
              key={pageNum}
              onClick={() => updateParams({ [pageKey]: pageNum })}
              style={{
                minWidth: '28px', height: '28px', padding: '0 0.3rem',
                border: '1px solid',
                borderColor: isCurrent ? 'var(--primary-color, #2563eb)' : 'var(--border-color, #e2e8f0)',
                background: isCurrent ? 'var(--primary-color, #2563eb)' : 'transparent',
                color: isCurrent ? '#ffffff' : 'var(--text-color, #334155)',
                borderRadius: '4px', cursor: 'pointer', fontSize: '0.825rem', fontWeight: isCurrent ? 600 : 400,
                transition: 'all 0.2s', whiteSpace: 'nowrap'
              }}
              onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = 'rgba(37,99,235,0.04)'; }}
              onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
            >
              {pageNum}
            </button>
          );
        })}

        {/* 下一页 */}
        <button
          disabled={page === totalPages || totalPages === 0}
          onClick={() => updateParams({ [pageKey]: Math.min(page + 1, totalPages) })}
          style={{
            padding: '0.3rem 0.6rem', border: '1px solid var(--border-color, #e2e8f0)', background: 'transparent',
            borderRadius: '4px', cursor: (page === totalPages || totalPages === 0) ? 'not-allowed' : 'pointer',
            color: (page === totalPages || totalPages === 0) ? 'var(--text-secondary, #94a3b8)' : 'var(--text-color, #334155)', fontSize: '0.825rem',
            transition: 'all 0.2s', whiteSpace: 'nowrap', opacity: (page === totalPages || totalPages === 0) ? 0.5 : 1
          }}
          onMouseEnter={e => { if (page !== totalPages && totalPages > 0) e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          下一页
        </button>

        {/* 末页 */}
        <button
          disabled={page === totalPages || totalPages === 0}
          onClick={() => updateParams({ [pageKey]: totalPages })}
          style={{
            padding: '0.3rem 0.6rem', border: '1px solid var(--border-color, #e2e8f0)', background: 'transparent',
            borderRadius: '4px', cursor: (page === totalPages || totalPages === 0) ? 'not-allowed' : 'pointer',
            color: (page === totalPages || totalPages === 0) ? 'var(--text-secondary, #94a3b8)' : 'var(--text-color, #334155)', fontSize: '0.825rem',
            transition: 'all 0.2s', whiteSpace: 'nowrap', opacity: (page === totalPages || totalPages === 0) ? 0.5 : 1
          }}
          onMouseEnter={e => { if (page !== totalPages && totalPages > 0) e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          末页
        </button>

        {/* 条/页下拉框 */}
        <select
          value={pageSize}
          onChange={e => updateParams({ [pageSizeKey]: Number(e.target.value), [pageKey]: 1 })}
          style={{
            padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-color, #e2e8f0)',
            fontSize: '0.825rem', outline: 'none', background: 'transparent', color: 'var(--text-color, #334155)', marginLeft: '0.5rem',
            cursor: 'pointer'
          }}
        >
          {pageSizeOptions.map(size => (
            <option key={size} value={size}>{size} 条/页</option>
          ))}
        </select>
      </div>
    </div>
  );
};
