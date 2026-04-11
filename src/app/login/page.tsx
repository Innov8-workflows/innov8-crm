"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError(data.error || "Login failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative" style={{ background: "var(--bg)" }}>
      {/* Background image */}
      <div className="absolute inset-0" style={{
        backgroundImage: "url(/login-bg.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        opacity: 0.4,
      }} />
      {/* Dark overlay */}
      <div className="absolute inset-0" style={{
        background: "radial-gradient(circle at 50% 40%, rgba(234,88,12,0.1) 0%, rgba(0,0,0,0.7) 100%)"
      }} />

      <div className="w-full max-w-sm relative z-10">
        <div className="rounded-xl p-8" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center font-mono text-sm font-medium text-white"
                style={{ background: "var(--accent)" }}>
                i8
              </div>
              <div>
                <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>innov8 CRM</h1>
                <p className="text-xs" style={{ color: "var(--text-dim)" }}>Smarter Workflows. Built for Growth.</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>Username</label>
              <input
                type="text"
                className="w-full px-3 py-2.5 rounded-lg text-sm"
                style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>Password</label>
              <input
                type="password"
                className="w-full px-3 py-2.5 rounded-lg text-sm"
                style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444" }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-sm font-semibold rounded-lg transition-all"
              style={{
                background: loading ? "var(--border-light)" : "var(--accent)",
                color: "#fff",
                opacity: loading ? 0.6 : 1,
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = "var(--accent-hover)"; }}
              onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = "var(--accent)"; }}
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center mt-4 text-xs" style={{ color: "var(--text-quaternary)" }}>
          innov8workflows.co.uk
        </p>
      </div>
    </div>
  );
}
