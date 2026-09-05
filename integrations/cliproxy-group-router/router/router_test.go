package router

import "testing"

func validConfig() Config {
	return Config{
		DenyUnmapped: true,
		Groups: []Group{
			{ID: "team-a", Name: "Team A", APIKeys: []string{"key-a"}, AuthIDs: []string{"auth-a1", "auth-a2"}, Strategy: StrategyRoundRobin, Enabled: true},
			{ID: "team-b", Name: "Team B", APIKeys: []string{"key-b"}, AuthIDs: []string{"auth-b"}, Strategy: StrategyFillFirst, Enabled: true},
		},
	}
}

func TestCallerScopeMatchesCLIProxyContract(t *testing.T) {
	got := CallerScope("key-a")
	const want = "af70e8906d9c3ada560f20bab4cc5d3c5ad609c7391d0c28ca50c5d386b47dfd"
	if got != want {
		t.Fatalf("CallerScope() = %q, want %q", got, want)
	}
}

func TestRoundRobinStaysInsideGroup(t *testing.T) {
	router := New()
	if err := router.Apply(validConfig()); err != nil {
		t.Fatal(err)
	}
	request := Request{
		CallerScope: CallerScope("key-a"),
		Provider:    "codex",
		Model:       "gpt-5",
		Candidates: []Candidate{
			{ID: "auth-a1", Priority: 0},
			{ID: "auth-a2", Priority: 0},
			{ID: "auth-b", Priority: 0},
		},
	}
	first := router.Pick(request)
	second := router.Pick(request)
	third := router.Pick(request)
	if first.AuthID != "auth-a1" || second.AuthID != "auth-a2" || third.AuthID != "auth-a1" {
		t.Fatalf("round robin picks = %q, %q, %q", first.AuthID, second.AuthID, third.AuthID)
	}
}

func TestUnknownKeyDenied(t *testing.T) {
	router := New()
	if err := router.Apply(validConfig()); err != nil {
		t.Fatal(err)
	}
	decision := router.Pick(Request{CallerScope: CallerScope("unknown")})
	if !decision.Handled || decision.ErrorCode != "group_not_found" {
		t.Fatalf("decision = %#v", decision)
	}
}

func TestNoCrossGroupFallback(t *testing.T) {
	router := New()
	if err := router.Apply(validConfig()); err != nil {
		t.Fatal(err)
	}
	decision := router.Pick(Request{
		CallerScope: CallerScope("key-a"),
		Candidates:  []Candidate{{ID: "auth-b"}},
	})
	if decision.ErrorCode != "group_no_available_auth" || decision.AuthID != "" {
		t.Fatalf("decision = %#v", decision)
	}
}

func TestFillFirstUsesConfiguredAuthOrder(t *testing.T) {
	config := validConfig()
	config.Groups[1].AuthIDs = []string{"auth-b2", "auth-b1"}
	router := New()
	if err := router.Apply(config); err != nil {
		t.Fatal(err)
	}
	decision := router.Pick(Request{
		CallerScope: CallerScope("key-b"),
		Candidates:  []Candidate{{ID: "auth-b1"}, {ID: "auth-b2"}},
	})
	if decision.AuthID != "auth-b2" {
		t.Fatalf("decision = %#v", decision)
	}
}

func TestDuplicateAuthRejectedByDefault(t *testing.T) {
	config := validConfig()
	config.Groups[1].AuthIDs = []string{"auth-a1"}
	if err := New().Apply(config); err == nil {
		t.Fatal("expected duplicate auth assignment to fail")
	}
}

func TestDuplicateKeyRejected(t *testing.T) {
	config := validConfig()
	config.Groups[1].APIKeys = []string{"key-a"}
	if err := New().Apply(config); err == nil {
		t.Fatal("expected duplicate key assignment to fail")
	}
}

func TestSharedAuthAllowedWhenExplicit(t *testing.T) {
	config := validConfig()
	config.AllowSharedAuths = true
	config.Groups[1].AuthIDs = []string{"auth-a1"}
	if err := New().Apply(config); err != nil {
		t.Fatal(err)
	}
}

func TestDisabledGroupDenied(t *testing.T) {
	config := validConfig()
	config.Groups[0].Enabled = false
	router := New()
	if err := router.Apply(config); err != nil {
		t.Fatal(err)
	}
	decision := router.Pick(Request{CallerScope: CallerScope("key-a"), Candidates: []Candidate{{ID: "auth-a1"}}})
	if decision.ErrorCode != "group_disabled" {
		t.Fatalf("decision = %#v", decision)
	}
}
