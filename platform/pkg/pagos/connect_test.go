package pagos

import "testing"

func TestPlatformKeyModoPorEntorno(t *testing.T) {
	cases := []struct{ env, sandbox, produccion, want string }{
		{"qa", "rk_test_a", "rk_live_b", "rk_test_a"},
		{"qa", "rk_live_a", "", ""},
		{"dev", "sk_test_a", "", "sk_test_a"},
		{"prod", "rk_test_a", "rk_live_b", "rk_live_b"},
		{"prod", "", "sk_live_b", "sk_live_b"},
		{"prod", "rk_test_a", "rk_test_b", ""},
		{"prod", "", "", ""},
	}
	for _, c := range cases {
		t.Setenv("SERVICE_ENV", c.env)
		t.Setenv("STRIPE_CONNECT_SANDBOX_KEY", c.sandbox)
		t.Setenv("STRIPE_CONNECT_PRODUCTION_KEY", c.produccion)
		if got := PlatformKey(); got != c.want {
			t.Errorf("%s sandbox=%q prod=%q: %q, quiero %q", c.env, c.sandbox, c.produccion, got, c.want)
		}
		if Live() != (c.env == "prod") {
			t.Errorf("%s: Live()=%v", c.env, Live())
		}
	}
}
