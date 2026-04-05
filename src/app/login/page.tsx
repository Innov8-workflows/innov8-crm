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
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0f0f0f" }}>
      {/* Subtle radial glow */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(circle at 50% 40%, rgba(234,88,12,0.08) 0%, transparent 60%)"
      }} />

      <div className="w-full max-w-sm relative z-10">
        <div className="rounded-xl p-8" style={{ background: "#161616", border: "1px solid #2a2a2a" }}>
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center font-mono text-sm font-medium text-white"
                style={{ background: "#ea580c" }}>
                i8
              </div>
              <div>
                <h1 className="text-xl font-bold" style={{ color: "#f0f0f0" }}>innov8 CRM</h1>
                <p className="text-xs" style={{ color: "#666" }}>Smarter Workflows. Built for Growth.</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#888" }}>Username</label>
              <input
                type="text"
                className="w-full px-3 py-2.5 rounded-lg text-sm"
                style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#f0f0f0" }}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#888" }}>Password</label>
              <input
                type="password"
                className="w-full px-3 py-2.5 rounded-lg text-sm"
                style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", color: "#f0f0f0" }}
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
                background: loading ? "#333" : "#ea580c",
                color: "#fff",
                opacity: loading ? 0.6 : 1,
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = "#f97316"; }}
              onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = "#ea580c"; }}
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center mt-4 text-xs" style={{ color: "#444" }}>
          innov8workflows.co.uk
        </p>
      </div>
    </div>
  );
}
