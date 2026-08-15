import { useState, useCallback } from 'react';
import { DEFAULT_PAGE_SIZE } from '../utils/constants';

export interface UsePaginationStateOptions {
  defaultPageSize?: number;
  initialPage?: number;
}

export function usePaginationState(options: UsePaginationStateOptions = {}) {
  const { defaultPageSize = DEFAULT_PAGE_SIZE, initialPage = 1 } = options;
  const [page, setPage] = useState<number>(initialPage);
  const [pageSize, setPageSize] = useState<number>(defaultPageSize);

  const resetPage = useCallback(() => {
    setPage(1);
  }, []);

  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setPageSize(newPageSize);
    setPage(1);
  }, []);

  return {
    page,
    pageSize,
    setPage,
    setPageSize,
    resetPage,
    handlePageSizeChange
  };
}
