import React, { useState, useEffect, useRef } from 'react';
import { User } from '../../types/user';
import { useOutsideClick } from '../../hooks/useOutsideClick';
import './member-search-select.css';

export interface MemberSearchSelectProps {
  value: number | string | '';
  onChange: (userId: number | '', selectedUser?: User) => void;
  style?: React.CSSProperties;
  className?: string;
  fetchFn?: (url: string, options?: RequestInit) => Promise<Response>;
  searchEndpoint?: string;
  meEndpoint?: string;
}

const defaultFetchFn = (url: string, options?: RequestInit) => window.fetch(url, options);
let cachedMeUser: User | null = null;
const userDisplayCache = new Map<string, string>();

export const MemberSearchSelect: React.FC<MemberSearchSelectProps> = ({
  value,
  onChange,
  style,
  className = '',
  fetchFn = defaultFetchFn,
  searchEndpoint = '/api/users',
  meEndpoint = '/api/me'
}) => {
  const [query, setQuery] = useState('');
  const [displayText, setDisplayText] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);

  const [currentUser, setCurrentUser] = useState<User | null>(cachedMeUser);

  useOutsideClick(containerRef, () => setShowDropdown(false));

  // Fetch current user info for quick selection
  useEffect(() => {
    if (!meEndpoint) return;
    if (cachedMeUser) {
      setCurrentUser(cachedMeUser);
      return;
    }
    fetchFn(meEndpoint)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data && data.id) {
          const u: User = {
            id: data.id,
            name: data.name,
            employee_id: data.employee_id || ''
          };
          cachedMeUser = u;
          setCurrentUser(u);
        }
      })
      .catch(() => {});
  }, [fetchFn, meEndpoint]);

  const lastValueRef = useRef(value);
  // When value changes externally, resolve the display name
  useEffect(() => {
    lastValueRef.current = value;
    if (value !== undefined && value !== null && value !== '') {
      const strVal = value.toString();
      if (userDisplayCache.has(strVal)) {
        setDisplayText(userDisplayCache.get(strVal)!);
        return;
      }
      const isIdOnly = /^\d+$/.test(strVal);
      const queryParam = isIdOnly ? `id=${value}` : `search=${encodeURIComponent(strVal)}`;
      const sep = searchEndpoint.includes('?') ? '&' : '?';
      fetchFn(`${searchEndpoint}${sep}${queryParam}&pageSize=5`)
        .then(res => res.json())
        .then(data => {
          if (lastValueRef.current !== value) return;
          const list: User[] = data.items || [];
          const match = list.find((m: User) => m.id === Number(value) || m.employee_id === strVal);
          if (match) {
            const text = `${match.name} (${match.employee_id || match.id})`;
            userDisplayCache.set(strVal, text);
            setDisplayText(text);
          } else {
            setDisplayText(strVal);
          }
        })
        .catch(() => setDisplayText(strVal));
    } else {
      setDisplayText('');
    }
  }, [value, fetchFn, searchEndpoint]);

  const doSearch = (q: string) => {
    const sep = searchEndpoint.includes('?') ? '&' : '?';
    if (!q.trim()) {
      setLoading(true);
      fetchFn(`${searchEndpoint}${sep}pageSize=20`)
        .then(res => res.json())
        .then(data => setResults(data.items || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
      return;
    }
    setLoading(true);
    fetchFn(`${searchEndpoint}${sep}search=${encodeURIComponent(q)}&pageSize=20`)
      .then(res => res.json())
      .then(data => setResults(data.items || []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setShowDropdown(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => doSearch(val), 250);
  };

  const handleFocus = () => {
    setShowDropdown(true);
    doSearch(query);
  };

  const handleSelect = (user: User) => {
    onChange(user.id, user);
    setDisplayText(`${user.name} (${user.employee_id || user.id})`);
    setQuery('');
    setShowDropdown(false);
  };

  const handleClear = () => {
    onChange('');
    setDisplayText('');
    setQuery('');
    setResults([]);
  };

  return (
    <div ref={containerRef} className={`code-member-select-wrapper ${className}`.trim()} style={style}>
      <div className="code-member-select-input-box">
        <input
          type="text"
          value={showDropdown ? (query || displayText) : (displayText || query)}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder={displayText || '输入姓名或工号搜索...'}
          className="code-member-select-input"
          onKeyDown={e => {
            if (e.key === 'Escape') setShowDropdown(false);
          }}
        />
        {displayText ? (
          <button
            type="button"
            onClick={handleClear}
            className="code-member-select-clear-btn"
            title="清空"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="code-member-select-icon">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        )}
      </div>

      {showDropdown && (
        <div className="code-member-select-dropdown">
          {currentUser && (!query || currentUser.name.includes(query) || (currentUser.employee_id && currentUser.employee_id.includes(query))) && (
            <div
              onClick={() => handleSelect(currentUser)}
              className="code-member-select-me-item"
            >
              <span>
                <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>⭐ 我 (当前账号: {currentUser.name})</span>
                <span style={{ color: 'var(--color-text-muted)', marginLeft: '0.4rem', fontSize: '0.8rem' }}>({currentUser.employee_id || currentUser.id})</span>
              </span>
              <span className="code-member-select-me-tag">
                快捷指派
              </span>
            </div>
          )}
          {loading ? (
            <div className="code-member-select-status-tip">搜索中...</div>
          ) : results.length === 0 && !currentUser ? (
            <div className="code-member-select-status-tip">
              {query ? '未找到匹配的人员' : '输入关键字开始搜索'}
            </div>
          ) : (
            results.filter(m => !currentUser || m.id !== currentUser.id).map(m => {
              const deptName = typeof m.department === 'string' ? m.department : (m.department && typeof m.department === 'object' ? m.department.name : '');
              const isSelected = m.id === Number(value);
              return (
                <div
                  key={m.id}
                  onClick={() => handleSelect(m)}
                  className={`code-member-select-item ${isSelected ? 'code-member-select-item--selected' : ''}`}
                >
                  <span>
                    <span style={{ fontWeight: 500 }}>{m.name}</span>
                    <span style={{ color: 'var(--color-text-muted)', marginLeft: '0.4rem', fontSize: '0.8rem' }}>({m.employee_id || m.id})</span>
                  </span>
                  {deptName && (
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{deptName}</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
