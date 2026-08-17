import { useState } from 'react';

export interface UsePaginationStateOptions {
  defaultPage?: number;
  defaultPageSize?: number;
}

export function usePaginationState(options: UsePaginationStateOptions = {}) {
  const { defaultPage = 1, defaultPageSize = 15 } = options;
  const [page, setPage] = useState<number>(defaultPage);
  const [pageSize, setPageSize] = useState<number>(defaultPageSize);

  const resetPage = () => setPage(1);

  return {
    page,
    pageSize,
    setPage,
    setPageSize,
    resetPage,
  };
}

export default usePaginationState;
