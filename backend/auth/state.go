package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"sync"
	"time"
)

const (
	stateTTL             = 10 * time.Minute
	stateCleanupInterval = 2 * time.Minute
)

// StateEntry holds PKCE CodeVerifier and creation time
type StateEntry struct {
	CodeVerifier string
	CreatedAt    time.Time
}

// StateStore provides concurrent-safe in-memory state and PKCE verifier management
type StateStore struct {
	mu     sync.RWMutex
	states map[string]*StateEntry
}

// NewStateStore creates and initializes a StateStore with periodic cleanup
func NewStateStore() *StateStore {
	s := &StateStore{
		states: make(map[string]*StateEntry),
	}
	go s.cleanupLoop()
	return s
}

// GenerateState generates a random OAuth2 state, PKCE codeVerifier and codeChallenge (S256)
func (s *StateStore) GenerateState() (state, codeVerifier, codeChallenge string, err error) {
	stateBytes := make([]byte, 32)
	if _, err = rand.Read(stateBytes); err != nil {
		return
	}
	state = hex.EncodeToString(stateBytes)

	verifierBytes := make([]byte, 32)
	if _, err = rand.Read(verifierBytes); err != nil {
		return
	}
	codeVerifier = base64.RawURLEncoding.EncodeToString(verifierBytes)

	h := sha256.Sum256([]byte(codeVerifier))
	codeChallenge = base64.RawURLEncoding.EncodeToString(h[:])

	s.mu.Lock()
	s.states[state] = &StateEntry{
		CodeVerifier: codeVerifier,
		CreatedAt:    time.Now(),
	}
	s.mu.Unlock()

	return
}

// ValidateAndConsume validates if state exists and is not expired, returning codeVerifier and consuming the state
func (s *StateStore) ValidateAndConsume(state string) (codeVerifier string, ok bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	entry, exists := s.states[state]
	if !exists {
		return "", false
	}
	delete(s.states, state)

	if time.Since(entry.CreatedAt) > stateTTL {
		return "", false
	}

	return entry.CodeVerifier, true
}

func (s *StateStore) cleanupLoop() {
	ticker := time.NewTicker(stateCleanupInterval)
	defer ticker.Stop()

	for range ticker.C {
		s.mu.Lock()
		now := time.Now()
		for k, v := range s.states {
			if now.Sub(v.CreatedAt) > stateTTL {
				delete(s.states, k)
			}
		}
		s.mu.Unlock()
	}
}
