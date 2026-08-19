package audit

import (
	"encoding/json"
	"testing"
)

func TestCalculateDiff(t *testing.T) {
	// 1. 测试纯新建 (Create)
	before := ""
	after := `{"name":"新设备","code":"DEV-01"}`
	diffJSON := CalculateDiff(before, after)
	if diffJSON == "" {
		t.Fatalf("expected non-empty diff for create")
	}
	var diffs []FieldDiff
	if err := json.Unmarshal([]byte(diffJSON), &diffs); err != nil {
		t.Fatalf("failed to unmarshal diff: %v", err)
	}
	if len(diffs) != 2 {
		t.Errorf("expected 2 diff items, got %d", len(diffs))
	}
	for _, d := range diffs {
		if d.Action != "added" || d.OldVal != nil {
			t.Errorf("expected added action with nil OldVal, got %+v", d)
		}
	}

	// 2. 测试纯删除 (Delete)
	before = `{"name":"旧设备","code":"DEV-01"}`
	after = ""
	diffJSON = CalculateDiff(before, after)
	diffs = nil
	if err := json.Unmarshal([]byte(diffJSON), &diffs); err != nil {
		t.Fatalf("failed to unmarshal diff: %v", err)
	}
	if len(diffs) != 2 {
		t.Errorf("expected 2 diff items, got %d", len(diffs))
	}
	for _, d := range diffs {
		if d.Action != "removed" || d.NewVal != nil {
			t.Errorf("expected removed action with nil NewVal, got %+v", d)
		}
	}

	// 3. 测试更新 (Update): 包含 modified, added, removed
	before = `{"name":"旧名称","status":"inactive","extra":"to_be_deleted"}`
	after = `{"name":"新名称","status":"inactive","new_field":"added_value"}`
	diffJSON = CalculateDiff(before, after)
	diffs = nil
	if err := json.Unmarshal([]byte(diffJSON), &diffs); err != nil {
		t.Fatalf("failed to unmarshal diff: %v", err)
	}
	if len(diffs) != 3 {
		t.Fatalf("expected 3 diff items, got %d: %s", len(diffs), diffJSON)
	}

	diffMap := make(map[string]FieldDiff)
	for _, d := range diffs {
		diffMap[d.Field] = d
	}

	if d, exists := diffMap["name"]; !exists || d.Action != "modified" || d.OldVal != "旧名称" || d.NewVal != "新名称" {
		t.Errorf("unexpected name diff: %+v", d)
	}
	if d, exists := diffMap["extra"]; !exists || d.Action != "removed" || d.OldVal != "to_be_deleted" {
		t.Errorf("unexpected extra diff: %+v", d)
	}
	if d, exists := diffMap["new_field"]; !exists || d.Action != "added" || d.NewVal != "added_value" {
		t.Errorf("unexpected new_field diff: %+v", d)
	}

	// 4. 测试无变化
	same := `{"a":1,"b":"hello"}`
	if diff := CalculateDiff(same, same); diff != "" {
		t.Errorf("expected empty diff for identical objects, got %s", diff)
	}
}
