package main

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/trilogys/sub2api-mate/integrations/cliproxy-group-router/router"
	"gopkg.in/yaml.v3"
)

const (
	abiVersion              uint32 = 1
	schemaVersion           uint32 = 3
	methodPluginRegister           = "plugin.register"
	methodPluginReconfigure        = "plugin.reconfigure"
	methodSchedulerPick            = "scheduler.pick"
)

var groupRouter = router.New()

type envelope struct {
	OK     bool            `json:"ok"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  *envelopeError  `json:"error,omitempty"`
}

type envelopeError struct {
	Code       string `json:"code"`
	Message    string `json:"message"`
	HTTPStatus int    `json:"http_status,omitempty"`
}

type lifecycleRequest struct {
	ConfigYAML []byte `json:"config_yaml"`
}

type wireConfig struct {
	DenyUnmapped     *bool          `yaml:"deny_unmapped"`
	AllowSharedAuths bool           `yaml:"allow_shared_auths"`
	Groups           []router.Group `yaml:"groups"`
}

type metadata struct {
	Name             string
	Version          string
	Author           string
	GitHubRepository string
	Logo             string
	ConfigFields     []configField
}

type configField struct {
	Name        string
	Type        string
	EnumValues  []string
	Description string
}

type registration struct {
	SchemaVersion uint32                 `json:"schema_version"`
	Metadata      metadata               `json:"metadata"`
	Capabilities  registrationCapability `json:"capabilities"`
}

type registrationCapability struct {
	Scheduler bool `json:"scheduler"`
}

type schedulerRequest struct {
	Provider   string
	Providers  []string
	Model      string
	Stream     bool
	Options    schedulerOptions
	Candidates []schedulerCandidate
}

type schedulerOptions struct {
	Headers  map[string][]string
	Metadata map[string]any
}

type schedulerCandidate struct {
	ID       string
	Provider string
	Priority int
	Status   string
}

type schedulerResponse struct {
	AuthID  string
	Handled bool
}

func handleMethod(method string, request []byte) ([]byte, error) {
	switch method {
	case methodPluginRegister, methodPluginReconfigure:
		if errConfigure := configure(request); errConfigure != nil {
			return nil, errConfigure
		}
		return okEnvelope(pluginRegistration())
	case methodSchedulerPick:
		return pickAuth(request)
	default:
		return errorEnvelope("unknown_method", "unknown method: "+method, 0), nil
	}
}

func configure(raw []byte) error {
	var request lifecycleRequest
	if len(raw) > 0 {
		if errUnmarshal := json.Unmarshal(raw, &request); errUnmarshal != nil {
			return errUnmarshal
		}
	}
	decoded := wireConfig{}
	if len(request.ConfigYAML) > 0 {
		if errUnmarshal := yaml.Unmarshal(request.ConfigYAML, &decoded); errUnmarshal != nil {
			return fmt.Errorf("decode group router config: %w", errUnmarshal)
		}
	}
	denyUnmapped := true
	if decoded.DenyUnmapped != nil {
		denyUnmapped = *decoded.DenyUnmapped
	}
	return groupRouter.Apply(router.Config{
		DenyUnmapped:     denyUnmapped,
		AllowSharedAuths: decoded.AllowSharedAuths,
		Groups:           decoded.Groups,
	})
}

func pluginRegistration() registration {
	return registration{
		SchemaVersion: schemaVersion,
		Metadata: metadata{
			Name:             "CLIProxy Group Router",
			Version:          "0.1.0",
			Author:           "trilogys contributors",
			GitHubRepository: "https://github.com/trilogys/sub2api-mate",
			ConfigFields: []configField{
				{Name: "deny_unmapped", Type: "boolean", Description: "Reject client keys that are not assigned to a CLIProxy group."},
				{Name: "allow_shared_auths", Type: "boolean", Description: "Allow one upstream credential to be assigned to multiple groups."},
				{Name: "groups", Type: "array", Description: "CLIProxy groups with client API keys, auth IDs, and a scheduling strategy."},
			},
		},
		Capabilities: registrationCapability{Scheduler: true},
	}
}

func metadataString(metadata map[string]any, key string) string {
	if len(metadata) == 0 {
		return ""
	}
	value, exists := metadata[key]
	if !exists || value == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

func pickAuth(raw []byte) ([]byte, error) {
	var request schedulerRequest
	if errUnmarshal := json.Unmarshal(raw, &request); errUnmarshal != nil {
		return nil, errUnmarshal
	}
	candidates := make([]router.Candidate, 0, len(request.Candidates))
	for _, candidate := range request.Candidates {
		candidates = append(candidates, router.Candidate{
			ID:       candidate.ID,
			Provider: candidate.Provider,
			Priority: candidate.Priority,
			Status:   candidate.Status,
		})
	}
	decision := groupRouter.Pick(router.Request{
		CallerScope: metadataString(request.Options.Metadata, "caller_scope"),
		Provider:    request.Provider,
		Model:       request.Model,
		Candidates:  candidates,
	})
	if decision.ErrorCode != "" {
		return errorEnvelope(decision.ErrorCode, decision.Message, 403), nil
	}
	return okEnvelope(schedulerResponse{AuthID: decision.AuthID, Handled: decision.Handled})
}

func okEnvelope(value any) ([]byte, error) {
	raw, errMarshal := json.Marshal(value)
	if errMarshal != nil {
		return nil, errMarshal
	}
	return json.Marshal(envelope{OK: true, Result: raw})
}

func errorEnvelope(code, message string, status int) []byte {
	raw, _ := json.Marshal(envelope{OK: false, Error: &envelopeError{Code: code, Message: message, HTTPStatus: status}})
	return raw
}
