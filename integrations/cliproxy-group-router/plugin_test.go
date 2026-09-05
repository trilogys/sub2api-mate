package main

import (
	"encoding/json"
	"testing"

	"github.com/trilogys/GateNest/integrations/cliproxy-group-router/router"
)

func configureTestPlugin(t *testing.T) {
	t.Helper()
	groupRouter = router.New()
	request, errMarshal := json.Marshal(lifecycleRequest{ConfigYAML: []byte(`
deny_unmapped: true
groups:
  - id: team-a
    name: Team A
    enabled: true
    strategy: round-robin
    api_keys: [key-a]
    auth_ids: [auth-a]
`)})
	if errMarshal != nil {
		t.Fatal(errMarshal)
	}
	if _, errHandle := handleMethod(methodPluginReconfigure, request); errHandle != nil {
		t.Fatal(errHandle)
	}
}

func decodeEnvelope(t *testing.T, raw []byte) envelope {
	t.Helper()
	var decoded envelope
	if errUnmarshal := json.Unmarshal(raw, &decoded); errUnmarshal != nil {
		t.Fatal(errUnmarshal)
	}
	return decoded
}

func TestHandleMethodRegistersScheduler(t *testing.T) {
	configureTestPlugin(t)
	raw, errHandle := handleMethod(methodPluginRegister, nil)
	if errHandle != nil {
		t.Fatal(errHandle)
	}
	decoded := decodeEnvelope(t, raw)
	if !decoded.OK {
		t.Fatalf("envelope = %#v", decoded)
	}
	var result registration
	if errUnmarshal := json.Unmarshal(decoded.Result, &result); errUnmarshal != nil {
		t.Fatal(errUnmarshal)
	}
	if result.SchemaVersion != schemaVersion || !result.Capabilities.Scheduler {
		t.Fatalf("registration = %#v", result)
	}
}

func TestSchedulerAdapterUsesCallerScope(t *testing.T) {
	configureTestPlugin(t)
	request, errMarshal := json.Marshal(schedulerRequest{
		Provider: "codex",
		Model:    "gpt-5",
		Options: schedulerOptions{Metadata: map[string]any{
			"caller_scope": router.CallerScope("key-a"),
		}},
		Candidates: []schedulerCandidate{{ID: "auth-a", Provider: "codex"}, {ID: "auth-b", Provider: "codex"}},
	})
	if errMarshal != nil {
		t.Fatal(errMarshal)
	}
	raw, errHandle := handleMethod(methodSchedulerPick, request)
	if errHandle != nil {
		t.Fatal(errHandle)
	}
	decoded := decodeEnvelope(t, raw)
	if !decoded.OK {
		t.Fatalf("envelope = %#v", decoded)
	}
	var result schedulerResponse
	if errUnmarshal := json.Unmarshal(decoded.Result, &result); errUnmarshal != nil {
		t.Fatal(errUnmarshal)
	}
	if !result.Handled || result.AuthID != "auth-a" {
		t.Fatalf("scheduler response = %#v", result)
	}
}

func TestSchedulerAdapterRejectsUnknownGroup(t *testing.T) {
	configureTestPlugin(t)
	request, _ := json.Marshal(schedulerRequest{Options: schedulerOptions{Metadata: map[string]any{
		"caller_scope": router.CallerScope("unknown"),
	}}})
	raw, errHandle := handleMethod(methodSchedulerPick, request)
	if errHandle != nil {
		t.Fatal(errHandle)
	}
	decoded := decodeEnvelope(t, raw)
	if decoded.OK || decoded.Error == nil || decoded.Error.Code != "group_not_found" || decoded.Error.HTTPStatus != 403 {
		t.Fatalf("envelope = %#v", decoded)
	}
}
