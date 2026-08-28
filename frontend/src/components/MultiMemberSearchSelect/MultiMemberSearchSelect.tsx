import React, { useState, useEffect, useRef } from 'react';
import { User } from '../../types/user';
import { useOutsideClick } from '../../hooks/useOutsideClick';
import '../MemberSearchSelect/member-search-select.css';

export interface MultiMemberSearchSelectProps {
  value: string[]; // array of member IDs as strings
  onChange: (memberIds: string[]) => void;
  style?: React.CSSProperties;
  className?: string;
  maxSelections?: number;
  fetchFn?: (url: string, options?: RequestInit) => Promise<Response>;
  searchEndpoint?: string;
}

const defaultFetchFn = (url: string, options?: RequestInit) => window.fetch(url, options);

export const MultiMemberSearchSelect: React.FC<MultiMemberSearchSelectProps> = ({
  value = [],
  onChange,
  style,
  className = '',
  maxSelections = 20,
  fetchFn = defaultFetchFn,
  searchEndpoint = '/api/users'
}) => {
  const [query, setQuery] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<User[]>([]);
  const [results, setResults] = useState<User[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);

  useOutsideClick(containerRef, () => setShowDropdown(false));

  // Initialize selected members from value array
  useEffect(() => {
    if (value && value.length > 0) {
      // Find members missing in our current state to avoid excessive fetching
      const missingIds = value.filter(id => !selectedMembers.some(m => m.id.toString() === id || m.employee_id === id));
      if (missingIds.length > 0) {
        setSelectedMembers(prev => {
          const combined = [...prev];
          missingIds.forEach(id => {
            const foundInResults = results.find(r => r.id.toString() === id || r.employee_id === id);
            if (foundInResults && !combined.some(c => c.id.toString() === id || c.employee_id === id)) {
              combined.push(foundInResults);
            } else if (!combined.some(c => c.id.toString() === id || c.employee_id === id)) {
              // Temporary placeholder
              combined.push({ id: Number(id) || 0, employee_id: id, name: `User (${id})` });
            }
          });
          return combined;
        });
      }
    } else {
      setSelectedMembers([]);
    }
  }, [value, results]);

  // Optionally fetch fully resolved members on mount if value is not empty (async cleanup)
  useEffect(() => {
    if (value && value.length > 0) {
      const sep = searchEndpoint.includes('?') ? '&' : '?';
      fetchFn(`${searchEndpoint}${sep}pageSize=1000`)
        .then(res => res.json())
        .then(data => {
          const list: User[] = data.items || [];
          setSelectedMembers(prev => {
            return value.map(id => {
              const match = list.find(m => m.id.toString() === id || m.employee_id === id);
              return match || prev.find(p => p.id.toString() === id || p.employee_id === id) || { id: Number(id) || 0, employee_id: id, name: id };
            });
          });
        }).catch(() => {});
    }
  }, [fetchFn, searchEndpoint]);

  const doSearch = (q: string) => {
    setLoading(true);
    const sep = searchEndpoint.includes('?') ? '&' : '?';
    const url = q.trim() ? `${searchEndpoint}${sep}search=${encodeURIComponent(q)}&pageSize=20` : `${searchEndpoint}${sep}pageSize=20`;
    fetchFn(url)
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
    const userKey = user.id ? user.id.toString() : user.employee_id;
    if (value.includes(userKey)) return; // Already selected
    if (value.length >= maxSelections) {
      alert(`最多只能选择 ${maxSelections} 名相关人员`);
      return;
    }
    const newValues = [...value, userKey];
    onChange(newValues);
    setQuery('');
  };

  const handleRemove = (userToRemove: User, e: React.MouseEvent) => {
    e.stopPropagation();
    const userKey = userToRemove.id ? userToRemove.id.toString() : userToRemove.employee_id;
    const newValues = value.filter(id => id !== userKey && id !== userToRemove.employee_id && id !== userToRemove.id.toString());
    onChange(newValues);
  };

  return (
    <div ref={containerRef} className={`code-member-select-wrapper ${className}`.trim()} style={style}>
      <div 
        className="code-member-select-multi-box"
        onClick={() => setShowDropdown(true)}
      >
        {selectedMembers.filter(m => value.includes(m.id.toString()) || value.includes(m.employee_id)).map(m => {
          const mKey = m.id ? m.id.toString() : m.employee_id;
          return (
            <span 
              key={mKey} 
              className="code-member-select-tag"
            >
              {m.name}
              <span 
                onClick={(e) => handleRemove(m, e)}
                className="code-member-select-tag-remove"
                title="移除"
              >
                ×
              </span>
            </span>
          );
        })}
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder={value.length === 0 ? "输入姓名或工号搜索相关人员..." : ""}
          className="code-member-select-multi-input"
          onKeyDown={e => {
            if (e.key === 'Escape') setShowDropdown(false);
          }}
        />
      </div>

      {showDropdown && (
        <div className="code-member-select-dropdown">
          {loading ? (
            <div className="code-member-select-status-tip">搜索中...</div>
          ) : results.length === 0 ? (
            <div className="code-member-select-status-tip">
              {query ? '未找到匹配的人员' : '输入关键字开始搜索'}
            </div>
          ) : (
            results.map(m => {
              const isSelected = value.includes(m.id.toString()) || value.includes(m.employee_id);
              const deptName = typeof m.department === 'string' ? m.department : (m.department && typeof m.department === 'object' ? m.department.name : '');
              return (
                <div
                  key={m.id}
                  onClick={() => !isSelected && handleSelect(m)}
                  className={`code-member-select-item ${isSelected ? 'code-member-select-item--selected code-member-select-item--disabled' : ''}`}
                >
                  <span>
                    <span style={{ fontWeight: 500 }}>{m.name}</span>
                    <span style={{ marginLeft: '0.4rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>({m.employee_id || m.id})</span>
                  </span>
                  {deptName && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{deptName}</span>
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
