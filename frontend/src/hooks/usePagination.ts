import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DEFAULT_PAGE_SIZE } from '../utils/constants';

export interface UsePaginationOptions {
  defaultPageSize?: number;
  pageKey?: string;
  pageSizeKey?: string;
}

export function usePagination(options: UsePaginationOptions = {}) {
  const {
    defaultPageSize = DEFAULT_PAGE_SIZE,
    pageKey = 'page',
    pageSizeKey = 'pageSize'
  } = options;

  const [searchParams, setSearchParams] = useSearchParams();

  const pageParam = parseInt(searchParams.get(pageKey) || '1', 10);
  const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;

  const pageSizeParam = parseInt(searchParams.get(pageSizeKey) || String(defaultPageSize), 10);
  const pageSize = isNaN(pageSizeParam) || pageSizeParam < 1 ? defaultPageSize : pageSizeParam;

  const updateParams = useCallback((newParams: Record<string, string | number>) => {
    const nextParams = new URLSearchParams(searchParams);
    Object.keys(newParams).forEach(key => {
      nextParams.set(key, String(newParams[key]));
    });
    setSearchParams(nextParams);
  }, [searchParams, setSearchParams]);

  const setPage = useCallback((newPage: number) => {
    updateParams({ [pageKey]: newPage });
  }, [pageKey, updateParams]);

  const setPageSize = useCallback((newPageSize: number) => {
    updateParams({ [pageSizeKey]: newPageSize, [pageKey]: 1 });
  }, [pageKey, pageSizeKey, updateParams]);

  return {
    page,
    pageSize,
    setPage,
    setPageSize,
    updateParams,
    pageKey,
    pageSizeKey
  };
}
