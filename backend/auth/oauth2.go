package auth

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"code-common/backend/models"
)

// ExchangeCodeForToken performs OAuth2 authorization_code token exchange
func ExchangeCodeForToken(cfg models.OAuth2Config, code, codeVerifier string) (map[string]interface{}, error) {
	data := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {cfg.RedirectURL},
		"client_id":     {cfg.ClientID},
		"client_secret": {cfg.ClientSecret},
		"code_verifier": {codeVerifier},
	}

	resp, err := http.PostForm(cfg.TokenURL, data)
	if err != nil {
		return nil, fmt.Errorf("token request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read token response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token endpoint returned %d: %s", resp.StatusCode, string(body))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse token response: %w", err)
	}

	return result, nil
}

// FetchUserInfo requests user profile from OAuth2/OIDC userinfo endpoint
func FetchUserInfo(userInfoURL, clientID string, scopes []string, accessToken string) (map[string]interface{}, error) {
	requestBody, err := json.Marshal(map[string]string{
		"client_id":    clientID,
		"access_token": accessToken,
		"scope":        strings.Join(scopes, " "),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to marshal userinfo request body: %w", err)
	}

	req, err := http.NewRequest("POST", userInfoURL, strings.NewReader(string(requestBody)))
	if err != nil {
		return nil, fmt.Errorf("failed to create userinfo request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+accessToken)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("userinfo request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read userinfo response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("userinfo endpoint returned %d: %s", resp.StatusCode, string(body))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse userinfo response: %w", err)
	}

	return result, nil
}

// GetStringField extracts string value from map
func GetStringField(data map[string]interface{}, key string) string {
	if val, ok := data[key]; ok {
		if str, ok := val.(string); ok {
			return str
		}
	}
	return ""
}

// ParseSSOAttribute extracts CN or EN name from LDAP/SSO strings (e.g. cn=张三,ou=...)
func ParseSSOAttribute(val string) string {
	if val == "" {
		return ""
	}
	if idx := strings.Index(val, "cn="); idx != -1 {
		sub := val[idx+3:]
		if end := strings.IndexAny(sub, ", "); end != -1 {
			return sub[:end]
		}
		return sub
	}
	if idx := strings.Index(val, "en="); idx != -1 {
		sub := val[idx+3:]
		if end := strings.IndexAny(sub, ", "); end != -1 {
			return sub[:end]
		}
		return sub
	}
	return val
}

// ParseSSOEnglishName extracts english username/email from string (e.g. en=zhangsan,...)
func ParseSSOEnglishName(val string) string {
	if val == "" {
		return ""
	}
	if idx := strings.Index(val, "en="); idx != -1 {
		sub := val[idx+3:]
		if end := strings.IndexAny(sub, ", "); end != -1 {
			return sub[:end]
		}
		return sub
	}
	if idx := strings.Index(val, "cn="); idx != -1 {
		sub := val[idx+3:]
		if end := strings.IndexAny(sub, ", "); end != -1 {
			return sub[:end]
		}
		return sub
	}
	return val
}

// IsEmailDomainAllowed checks if the email matches configured domain whitelist
func IsEmailDomainAllowed(email string, allowedDomains []string) bool {
	if len(allowedDomains) == 0 {
		return true
	}
	emailLower := strings.ToLower(strings.TrimSpace(email))
	for _, domain := range allowedDomains {
		domain = strings.ToLower(strings.TrimSpace(domain))
		if domain == "" {
			continue
		}
		if !strings.HasPrefix(domain, "@") {
			domain = "@" + domain
		}
		if strings.HasSuffix(emailLower, domain) {
			return true
		}
	}
	return false
}
