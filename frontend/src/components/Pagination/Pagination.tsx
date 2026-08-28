import React from 'react';
import { usePagination } from '../../hooks/usePagination';
import './pagination.css';

export interface PaginationProps {
  totalItems: number;
  pageSizeOptions?: number[];
  defaultPageSize?: number;
  pageKey?: string;
  pageSizeKey?: string;
  // 支持受控模式
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  className?: string;
}

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [15, 25, 50, 100];
const WINDOW_SIZE = 5;

interface PaginationRendererProps {
  totalItems: number;
  page: number;
  pageSize: number;
  pageSizeOptions: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  className?: string;
}

const PaginationRenderer: React.FC<PaginationRendererProps> = ({
  totalItems,
  page,
  pageSize,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
  className = '',
}) => {
  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  // 极简平滑连续 5 个数字滑动窗口计算
  const getPageNumbers = () => {
    if (totalPages <= WINDOW_SIZE) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    let start = page - Math.floor(WINDOW_SIZE / 2);
    let end = page + Math.floor(WINDOW_SIZE / 2);

    if (start < 1) {
      start = 1;
      end = WINDOW_SIZE;
    } else if (end > totalPages) {
      end = totalPages;
      start = totalPages - WINDOW_SIZE + 1;
    }

    if (start < 1) {
      start = 1;
    }

    const pages: number[] = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  if (totalItems <= 0) return null;

  return (
    <div className={`code-pagination ${className}`.trim()}>
      <div className="code-pagination-info">
        共 {totalItems} 条记录，当前第 {page} / {totalPages} 页
      </div>
      <div className="code-pagination-controls">
        {/* 首页 */}
        <button
          type="button"
          disabled={page === 1}
          onClick={() => onPageChange(1)}
          className="code-pagination-btn code-pagination-btn--nav"
          title="首页"
        >
          首页
        </button>

        {/* 上一页 */}
        <button
          type="button"
          disabled={page === 1}
          onClick={() => onPageChange(Math.max(page - 1, 1))}
          className="code-pagination-btn code-pagination-btn--nav"
          title="上一页"
        >
          上一页
        </button>

        {/* 5页连续数字滑动窗口 */}
        {getPageNumbers().map(pageNum => {
          const isCurrent = page === pageNum;
          return (
            <button
              key={pageNum}
              type="button"
              onClick={() => onPageChange(pageNum)}
              className={`code-pagination-btn code-pagination-btn--num ${isCurrent ? 'code-pagination-btn--active' : ''}`}
            >
              {pageNum}
            </button>
          );
        })}

        {/* 下一页 */}
        <button
          type="button"
          disabled={page === totalPages || totalPages === 0}
          onClick={() => onPageChange(Math.min(page + 1, totalPages))}
          className="code-pagination-btn code-pagination-btn--nav"
          title="下一页"
        >
          下一页
        </button>

        {/* 末页 */}
        <button
          type="button"
          disabled={page === totalPages || totalPages === 0}
          onClick={() => onPageChange(totalPages)}
          className="code-pagination-btn code-pagination-btn--nav"
          title="末页"
        >
          末页
        </button>

        {/* 条/页下拉框 */}
        <select
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          className="code-pagination-select"
          aria-label="每页显示条数"
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
  className,
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
      className={className}
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
        className={props.className}
      />
    );
  }

  return <UrlPagination {...props} />;
};
