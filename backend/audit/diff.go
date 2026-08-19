package audit

import (
	"encoding/json"
	"sort"
	"strings"
)

// FieldDiff 字段级变更明细
type FieldDiff struct {
	Field  string `json:"field"`
	OldVal any    `json:"old_val"`
	NewVal any    `json:"new_val"`
	Action string `json:"action"` // "added", "modified", "removed"
}

// CalculateDiff 计算变更差异，支持 Create(before为空)、Delete(after为空) 以及 Update
func CalculateDiff(beforeJSON, afterJSON string) string {
	beforeJSON = strings.TrimSpace(beforeJSON)
	afterJSON = strings.TrimSpace(afterJSON)

	if beforeJSON == "" && afterJSON == "" {
		return ""
	}

	var beforeMap, afterMap map[string]any
	if beforeJSON != "" {
		_ = json.Unmarshal([]byte(beforeJSON), &beforeMap)
	}
	if afterJSON != "" {
		_ = json.Unmarshal([]byte(afterJSON), &afterMap)
	}

	diffs := make([]FieldDiff, 0)

	// 1. 纯新建操作 (Create): 全字段 added
	if len(beforeMap) == 0 && len(afterMap) > 0 {
		// 为了结果稳定有序，按 key 排序
		keys := make([]string, 0, len(afterMap))
		for k := range afterMap {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			diffs = append(diffs, FieldDiff{Field: k, OldVal: nil, NewVal: afterMap[k], Action: "added"})
		}
		b, _ := json.Marshal(diffs)
		return string(b)
	}

	// 2. 纯删除操作 (Delete): 全字段 removed
	if len(beforeMap) > 0 && len(afterMap) == 0 {
		keys := make([]string, 0, len(beforeMap))
		for k := range beforeMap {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			diffs = append(diffs, FieldDiff{Field: k, OldVal: beforeMap[k], NewVal: nil, Action: "removed"})
		}
		b, _ := json.Marshal(diffs)
		return string(b)
	}

	// 3. 修改对比 (Update)
	allKeysMap := make(map[string]struct{})
	for k := range beforeMap {
		allKeysMap[k] = struct{}{}
	}
	for k := range afterMap {
		allKeysMap[k] = struct{}{}
	}

	keys := make([]string, 0, len(allKeysMap))
	for k := range allKeysMap {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for _, k := range keys {
		oldVal, oldExists := beforeMap[k]
		newVal, newExists := afterMap[k]

		if !oldExists && newExists {
			diffs = append(diffs, FieldDiff{Field: k, OldVal: nil, NewVal: newVal, Action: "added"})
		} else if oldExists && !newExists {
			diffs = append(diffs, FieldDiff{Field: k, OldVal: oldVal, NewVal: nil, Action: "removed"})
		} else if !jsonEqual(oldVal, newVal) {
			diffs = append(diffs, FieldDiff{Field: k, OldVal: oldVal, NewVal: newVal, Action: "modified"})
		}
	}

	if len(diffs) == 0 {
		return ""
	}

	b, _ := json.Marshal(diffs)
	return string(b)
}

func jsonEqual(a, b any) bool {
	ba, _ := json.Marshal(a)
	bb, _ := json.Marshal(b)
	return string(ba) == string(bb)
}
