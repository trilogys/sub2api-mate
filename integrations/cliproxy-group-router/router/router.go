package router

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"sync"
)

const (
	StrategyRoundRobin = "round-robin"
	StrategyFillFirst  = "fill-first"
)

type Group struct {
	ID       string   `json:"id" yaml:"id"`
	Name     string   `json:"name" yaml:"name"`
	APIKeys  []string `json:"api_keys" yaml:"api_keys"`
	AuthIDs  []string `json:"auth_ids" yaml:"auth_ids"`
	Strategy string   `json:"strategy" yaml:"strategy"`
	Enabled  bool     `json:"enabled" yaml:"enabled"`
}

type Config struct {
	DenyUnmapped     bool    `json:"deny_unmapped" yaml:"deny_unmapped"`
	AllowSharedAuths bool    `json:"allow_shared_auths" yaml:"allow_shared_auths"`
	Groups           []Group `json:"groups" yaml:"groups"`
}

type Candidate struct {
	ID       string
	Provider string
	Priority int
	Status   string
}

type Request struct {
	CallerScope string
	Provider    string
	Model       string
	Candidates  []Candidate
}

type Decision struct {
	Handled   bool
	AuthID    string
	ErrorCode string
	Message   string
}

type groupSnapshot struct {
	group Group
}

type Router struct {
	mu           sync.Mutex
	denyUnmapped bool
	byScope      map[string]groupSnapshot
	cursors      map[string]int
}

func New() *Router {
	return &Router{
		denyUnmapped: true,
		byScope:      make(map[string]groupSnapshot),
		cursors:      make(map[string]int),
	}
}

func CallerScope(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	sum := sha256.Sum256([]byte("cli-proxy-api:caller-scope:v1\x00" + value))
	return hex.EncodeToString(sum[:])
}

func normalizeUnique(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}

func normalizeGroup(group Group) Group {
	group.ID = strings.TrimSpace(group.ID)
	group.Name = strings.TrimSpace(group.Name)
	group.APIKeys = normalizeUnique(group.APIKeys)
	group.AuthIDs = normalizeUnique(group.AuthIDs)
	group.Strategy = strings.ToLower(strings.TrimSpace(group.Strategy))
	if group.Strategy == "" {
		group.Strategy = StrategyRoundRobin
	}
	return group
}

func (r *Router) Apply(config Config) error {
	if r == nil {
		return fmt.Errorf("router is nil")
	}
	byScope := make(map[string]groupSnapshot)
	groupIDs := make(map[string]struct{}, len(config.Groups))
	authOwners := make(map[string]string)
	for index, rawGroup := range config.Groups {
		group := normalizeGroup(rawGroup)
		if group.ID == "" {
			return fmt.Errorf("groups[%d].id is required", index)
		}
		if group.Name == "" {
			return fmt.Errorf("group %q name is required", group.ID)
		}
		if _, exists := groupIDs[group.ID]; exists {
			return fmt.Errorf("duplicate group id %q", group.ID)
		}
		groupIDs[group.ID] = struct{}{}
		if group.Strategy != StrategyRoundRobin && group.Strategy != StrategyFillFirst {
			return fmt.Errorf("group %q has invalid strategy %q", group.ID, group.Strategy)
		}
		if len(group.APIKeys) == 0 {
			return fmt.Errorf("group %q requires at least one api key", group.ID)
		}
		if len(group.AuthIDs) == 0 {
			return fmt.Errorf("group %q requires at least one auth id", group.ID)
		}
		for _, authID := range group.AuthIDs {
			if owner, exists := authOwners[authID]; exists && !config.AllowSharedAuths {
				return fmt.Errorf("auth id %q is already assigned to group %q", authID, owner)
			}
			authOwners[authID] = group.ID
		}
		for _, apiKey := range group.APIKeys {
			scope := CallerScope(apiKey)
			if previous, exists := byScope[scope]; exists {
				return fmt.Errorf("api key is already assigned to group %q", previous.group.ID)
			}
			byScope[scope] = groupSnapshot{group: group}
		}
	}

	r.mu.Lock()
	r.denyUnmapped = config.DenyUnmapped
	r.byScope = byScope
	r.cursors = make(map[string]int)
	r.mu.Unlock()
	return nil
}

func (r *Router) Pick(request Request) Decision {
	if r == nil {
		return Decision{Handled: true, ErrorCode: "group_router_unavailable", Message: "group router is unavailable"}
	}
	scope := strings.TrimSpace(request.CallerScope)
	r.mu.Lock()
	defer r.mu.Unlock()
	snapshot, exists := r.byScope[scope]
	if !exists {
		if r.denyUnmapped {
			return Decision{Handled: true, ErrorCode: "group_not_found", Message: "client key is not assigned to a CLIProxy group"}
		}
		return Decision{Handled: false}
	}
	if !snapshot.group.Enabled {
		return Decision{Handled: true, ErrorCode: "group_disabled", Message: "CLIProxy group is disabled"}
	}

	candidatesByID := make(map[string]Candidate, len(request.Candidates))
	for _, candidate := range request.Candidates {
		candidatesByID[strings.TrimSpace(candidate.ID)] = candidate
	}
	eligible := make([]Candidate, 0, len(snapshot.group.AuthIDs))
	for _, authID := range snapshot.group.AuthIDs {
		if candidate, available := candidatesByID[authID]; available {
			eligible = append(eligible, candidate)
		}
	}
	if len(eligible) == 0 {
		return Decision{Handled: true, ErrorCode: "group_no_available_auth", Message: "no available credential belongs to this CLIProxy group"}
	}
	if snapshot.group.Strategy == StrategyFillFirst || len(eligible) == 1 {
		return Decision{Handled: true, AuthID: eligible[0].ID}
	}
	cursorKey := strings.Join([]string{snapshot.group.ID, strings.ToLower(strings.TrimSpace(request.Provider)), strings.TrimSpace(request.Model)}, "|")
	index := r.cursors[cursorKey] % len(eligible)
	r.cursors[cursorKey] = (index + 1) % len(eligible)
	return Decision{Handled: true, AuthID: eligible[index].ID}
}
