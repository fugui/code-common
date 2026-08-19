package audit

import (
	"encoding/json"
	"strings"
)

// exactSensitiveKeys 精确敏感 Key 集合 (全小写匹配)
var exactSensitiveKeys = map[string]bool{
	"password":    true,
	"passwd":      true,
	"pwd":         true,
	"token":       true,
	"jwt":         true,
	"secret":      true,
	"access_key":  true,
	"secret_key":  true,
	"private_key": true,
	"api_key":     true,
	"auth_code":   true,
}

// IsSensitiveKey 判定一个键是否包含敏感信息 (精准词典 + 后缀匹配)
func IsSensitiveKey(key string) bool {
	lower := strings.ToLower(strings.TrimSpace(key))
	if exactSensitiveKeys[lower] {
		return true
	}
	// 组合词后缀匹配规则 (例如 db_password, client_secret, access_token, user_key 等)
	if strings.HasSuffix(lower, "_token") ||
		strings.HasSuffix(lower, "_secret") ||
		strings.HasSuffix(lower, "_key") ||
		strings.HasSuffix(lower, "_pwd") ||
		strings.HasSuffix(lower, "_password") {
		return true
	}
	return false
}

// MaskData 递归脱敏 Map、Slice 或基础类型
func MaskData(input any) any {
	if input == nil {
		return nil
	}
	switch v := input.(type) {
	case map[string]any:
		output := make(map[string]any, len(v))
		for k, val := range v {
			if IsSensitiveKey(k) {
				output[k] = "******"
			} else {
				output[k] = MaskData(val)
			}
		}
		return output
	case []any:
		output := make([]any, len(v))
		for i, val := range v {
			output[i] = MaskData(val)
		}
		return output
	default:
		return v
	}
}

// MaskJSONString 将传入的对象或 JSON 字符串转换为脱敏后的 JSON 字符串
func MaskJSONString(v any) string {
	if v == nil {
		return ""
	}

	var rawBytes []byte
	switch val := v.(type) {
	case string:
		if strings.TrimSpace(val) == "" {
			return ""
		}
		rawBytes = []byte(val)
	case []byte:
		if len(val) == 0 {
			return ""
		}
		rawBytes = val
	default:
		b, err := json.Marshal(v)
		if err != nil {
			return ""
		}
		rawBytes = b
	}

	var raw any
	if err := json.Unmarshal(rawBytes, &raw); err != nil {
		// 若无法解析为 JSON，返回原始字符串（非 JSON 纯文本）
		return string(rawBytes)
	}

	masked := MaskData(raw)
	res, err := json.Marshal(masked)
	if err != nil {
		return string(rawBytes)
	}
	return string(res)
}
