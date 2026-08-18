import React from 'react';
import { usePagination } from '../../hooks/usePagination';
import { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from '../../utils/constants';

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
   * The default page size if not present in URL or props
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

  /**
   * Optional controlled page number (for state/memory pagination)
   */
  page?: number;
  /**
   * Optional controlled page size (for state/memory pagination)
   */
  pageSize?: number;
  /**
   * Optional callback when page changes (for state/memory pagination)
   */
  onPageChange?: (newPage: number) => void;
  /**
   * Optional callback when page size changes (for state/memory pagination)
   */
  onPageSizeChange?: (newPageSize: number) => void;
}

interface PaginationRendererProps {
  totalItems: number;
  page: number;
  pageSize: number;
  pageSizeOptions: number[];
  onPageChange: (newPage: number) => void;
  onPageSizeChange: (newPageSize: number) => void;
}

const PaginationRenderer: React.FC<PaginationRendererProps> = ({
  totalItems,
  page,
  pageSize,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
}) => {
  const totalPages = Math.ceil(totalItems / pageSize) || 1;

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
      background: 'var(--card-bg, var(--color-bg-surface))', 
      border: '1px solid var(--border-color, var(--color-border-primary))', 
      borderRadius: 'var(--radius-sm, 6px)' 
    }}>
      <div style={{ color: 'var(--text-secondary, var(--color-text-secondary))', fontSize: '0.875rem' }}>
        共 {totalItems} 条记录，当前第 {page} / {totalPages} 页
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'nowrap', minWidth: 0, maxWidth: '100%', overflowX: 'auto' }}>
        {/* 首页 */}
        <button
          disabled={page === 1}
          onClick={() => onPageChange(1)}
          style={{
            padding: '0.3rem 0.6rem', border: '1px solid var(--border-color, var(--color-border-primary))', background: 'transparent',
            borderRadius: 'var(--radius-xs, 4px)', cursor: page === 1 ? 'not-allowed' : 'pointer',
            color: page === 1 ? 'var(--text-secondary, var(--color-text-secondary))' : 'var(--text-color, var(--color-text-primary))', fontSize: '0.825rem',
            transition: 'all 0.2s', whiteSpace: 'nowrap', opacity: page === 1 ? 0.5 : 1
          }}
          onMouseEnter={e => { if (page !== 1) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          首页
        </button>
        {/* 上一页 */}
        <button
          disabled={page === 1}
          onClick={() => onPageChange(Math.max(page - 1, 1))}
          style={{
            padding: '0.3rem 0.6rem', border: '1px solid var(--border-color, var(--color-border-primary))', background: 'transparent',
            borderRadius: 'var(--radius-xs, 4px)', cursor: page === 1 ? 'not-allowed' : 'pointer',
            color: page === 1 ? 'var(--text-secondary, var(--color-text-secondary))' : 'var(--text-color, var(--color-text-primary))', fontSize: '0.825rem',
            transition: 'all 0.2s', whiteSpace: 'nowrap', opacity: page === 1 ? 0.5 : 1
          }}
          onMouseEnter={e => { if (page !== 1) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
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
              onClick={() => onPageChange(pageNum)}
              style={{
                minWidth: '28px', height: '28px', padding: '0 0.3rem',
                border: '1px solid',
                borderColor: isCurrent ? 'var(--primary-color, var(--color-primary))' : 'var(--border-color, var(--color-border-primary))',
                background: isCurrent ? 'var(--primary-color, var(--color-primary))' : 'transparent',
                color: isCurrent ? 'var(--color-text-white, #ffffff)' : 'var(--text-color, var(--color-text-primary))',
                borderRadius: 'var(--radius-xs, 4px)', cursor: 'pointer', fontSize: '0.825rem', fontWeight: isCurrent ? 600 : 400,
                transition: 'all 0.2s', whiteSpace: 'nowrap'
              }}
              onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = 'var(--color-primary-subtle)'; }}
              onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
            >
              {pageNum}
            </button>
          );
        })}

        {/* 下一页 */}
        <button
          disabled={page === totalPages || totalPages === 0}
          onClick={() => onPageChange(Math.min(page + 1, totalPages))}
          style={{
            padding: '0.3rem 0.6rem', border: '1px solid var(--border-color, var(--color-border-primary))', background: 'transparent',
            borderRadius: 'var(--radius-xs, 4px)', cursor: (page === totalPages || totalPages === 0) ? 'not-allowed' : 'pointer',
            color: (page === totalPages || totalPages === 0) ? 'var(--text-secondary, var(--color-text-secondary))' : 'var(--text-color, var(--color-text-primary))', fontSize: '0.825rem',
            transition: 'all 0.2s', whiteSpace: 'nowrap', opacity: (page === totalPages || totalPages === 0) ? 0.5 : 1
          }}
          onMouseEnter={e => { if (page !== totalPages && totalPages > 0) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          下一页
        </button>

        {/* 末页 */}
        <button
          disabled={page === totalPages || totalPages === 0}
          onClick={() => onPageChange(totalPages)}
          style={{
            padding: '0.3rem 0.6rem', border: '1px solid var(--border-color, var(--color-border-primary))', background: 'transparent',
            borderRadius: 'var(--radius-xs, 4px)', cursor: (page === totalPages || totalPages === 0) ? 'not-allowed' : 'pointer',
            color: (page === totalPages || totalPages === 0) ? 'var(--text-secondary, var(--color-text-secondary))' : 'var(--text-color, var(--color-text-primary))', fontSize: '0.825rem',
            transition: 'all 0.2s', whiteSpace: 'nowrap', opacity: (page === totalPages || totalPages === 0) ? 0.5 : 1
          }}
          onMouseEnter={e => { if (page !== totalPages && totalPages > 0) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          末页
        </button>

        {/* 条/页下拉框 */}
        <select
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          style={{
            width: 'auto',
            minWidth: '92px',
            height: '28px',
            lineHeight: '26px',
            padding: '0 0.5rem',
            borderRadius: 'var(--radius-xs, 4px)',
            border: '1px solid var(--border-color, var(--color-border-primary))',
            fontSize: '0.825rem',
            outline: 'none',
            background: 'var(--card-bg, transparent)',
            color: 'var(--text-color, var(--color-text-primary))',
            marginLeft: '0.5rem',
            cursor: 'pointer',
            boxSizing: 'border-box',
            flexShrink: 0
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

const UrlPagination: React.FC<PaginationProps> = ({
  totalItems,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  defaultPageSize = DEFAULT_PAGE_SIZE,
  pageKey = 'page',
  pageSizeKey = 'pageSize',
}) => {
  const { page, pageSize, updateParams } = usePagination({
    defaultPageSize,
    pageKey,
    pageSizeKey,
  });

  const handlePageChange = (newPage: number) => {
    updateParams({ [pageKey]: newPage });
  };

  const handlePageSizeChange = (newPageSize: number) => {
    updateParams({ [pageSizeKey]: newPageSize, [pageKey]: 1 });
  };

  return (
    <PaginationRenderer
      totalItems={totalItems}
      page={page}
      pageSize={pageSize}
      pageSizeOptions={pageSizeOptions}
      onPageChange={handlePageChange}
      onPageSizeChange={handlePageSizeChange}
    />
  );
};

export const Pagination: React.FC<PaginationProps> = (props) => {
  const isControlled = props.onPageChange !== undefined || props.page !== undefined;

  if (isControlled) {
    const controlledPage = props.page || 1;
    const controlledPageSize = props.pageSize || props.defaultPageSize || DEFAULT_PAGE_SIZE;
    const pageSizeOptions = props.pageSizeOptions || PAGE_SIZE_OPTIONS;

    const handlePageChange = (newPage: number) => {
      props.onPageChange?.(newPage);
    };

    const handlePageSizeChange = (newPageSize: number) => {
      if (props.onPageSizeChange) {
        props.onPageSizeChange(newPageSize);
      } else {
        props.onPageChange?.(1);
      }
    };

    return (
      <PaginationRenderer
        totalItems={props.totalItems}
        page={controlledPage}
        pageSize={controlledPageSize}
        pageSizeOptions={pageSizeOptions}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />
    );
  }

  return <UrlPagination {...props} />;
};
