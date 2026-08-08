"use client";

import { useState, useEffect, useCallback } from "react";
import Icon from "./Icon";
import { useToast } from "./Toast";

// Account security: enrol / remove the authenticator-app second factor.
// Enrolment is a three-beat flow inside the modal:
//   status → (Set up) → scan/enter secret + confirm a code → backup codes shown once.

type Stage = "loading" | "off" | "enrolling" | "backup" | "on";

export default function SecurityModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>("loading");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disableCode, setDisableCode] = useState("");
  const [showDisable, setShowDisable] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const d = await fetch("/api/auth/me").then((r) => r.json());
      setStage(d.mfa_enabled ? "on" : "off");
    } catch {
      setStage("off");
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const beginSetup = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/mfa/setup", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setQr(d.qr);
      setSecret(d.secret);
      setCode("");
      setStage("enrolling");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't start setup", "error");
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/mfa/enable", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setBackupCodes(d.backup_codes || []);
      setStage("backup");
      toast("Two-factor is on", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't enable", "error");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/mfa/disable", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: disableCode }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast("Two-factor turned off", "info");
      setShowDisable(false);
      setDisableCode("");
      setStage("off");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't disable", "error");
    } finally {
      setBusy(false);
    }
  };

  const copyBackup = () => {
    navigator.clipboard?.writeText(backupCodes.join("\n")).then(
      () => toast("Backup codes copied", "success"),
      () => toast("Copy failed — select and copy manually", "error"),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}>
      <div className="w-full max-w-md rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <Icon name="shield-check" className="w-5 h-5" style={{ color: "var(--accent)" }} />
            <h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>Account Security</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded" style={{ color: "var(--text-muted)" }}>
            <Icon name="x-mark" className="w-5 h-5" />
          </button>
        </div>

        {stage === "loading" && <p className="text-sm py-6 text-center" style={{ color: "var(--text-dim)" }}>Loading…</p>}

        {stage === "off" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg"
              style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
              <span className="w-2 h-2 rounded-full" style={{ background: "var(--text-quaternary)" }} />
              Two-factor authentication is <span style={{ fontWeight: 600 }}>off</span>
            </div>
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>
              Add a second step at login using an authenticator app (Google Authenticator, Authy, 1Password).
              A leaked or guessed password won&apos;t be enough on its own.
            </p>
            <button onClick={beginSetup} disabled={busy}
              className="w-full py-2.5 text-sm font-semibold rounded-lg" style={{ background: "var(--accent)", color: "#fff", opacity: busy ? 0.6 : 1 }}>
              {busy ? "Starting…" : "Set up two-factor"}
            </button>
          </div>
        )}

        {stage === "enrolling" && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              1. Scan this with your authenticator app, or enter the key by hand.
            </p>
            {qr && (
              <div className="flex justify-center">
                {/* data: URL from the server, not a remote image */}
                <img src={qr} alt="Authenticator QR code" width={200} height={200}
                  className="rounded-lg" style={{ background: "#fff", padding: 8 }} />
              </div>
            )}
            <div>
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>Manual entry key</p>
              <code className="block text-xs p-2 rounded break-all font-mono select-all"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>{secret}</code>
            </div>
            <div>
              <p className="text-sm mb-1.5" style={{ color: "var(--text-secondary)" }}>2. Enter the 6-digit code it shows:</p>
              <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code"
                placeholder="123456" maxLength={6}
                className="w-full px-3 py-2.5 rounded-lg text-sm text-center tracking-widest font-mono"
                style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStage("off")} className="flex-1 py-2.5 text-sm font-semibold rounded-lg"
                style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-dim)" }}>Cancel</button>
              <button onClick={confirmEnable} disabled={busy || code.length < 6}
                className="flex-1 py-2.5 text-sm font-semibold rounded-lg" style={{ background: "var(--accent)", color: "#fff", opacity: busy || code.length < 6 ? 0.6 : 1 }}>
                {busy ? "Verifying…" : "Turn on"}
              </button>
            </div>
          </div>
        )}

        {stage === "backup" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg"
              style={{ background: "#22c55e14", border: "1px solid #22c55e55", color: "#22c55e" }}>
              <Icon name="check" className="w-4 h-4" /> Two-factor is now on.
            </div>
            <div>
              <p className="text-sm font-semibold mb-1" style={{ color: "var(--text)" }}>Save your backup codes</p>
              <p className="text-xs mb-2" style={{ color: "var(--text-dim)" }}>
                Each works once. They&apos;re the only way in if you lose your phone — store them somewhere safe.
                <span style={{ color: "var(--accent)" }}> They won&apos;t be shown again.</span>
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {backupCodes.map((c) => (
                  <code key={c} className="text-xs p-1.5 rounded text-center font-mono select-all"
                    style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>{c}</code>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={copyBackup} className="flex-1 py-2.5 text-sm font-semibold rounded-lg"
                style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-secondary)" }}>
                <span className="inline-flex items-center gap-1.5"><Icon name="clipboard-copy" className="w-4 h-4" /> Copy</span>
              </button>
              <button onClick={() => setStage("on")} className="flex-1 py-2.5 text-sm font-semibold rounded-lg"
                style={{ background: "var(--accent)", color: "#fff" }}>I&apos;ve saved them</button>
            </div>
          </div>
        )}

        {stage === "on" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg"
              style={{ background: "#22c55e14", border: "1px solid #22c55e55", color: "#22c55e" }}>
              <span className="w-2 h-2 rounded-full" style={{ background: "#22c55e" }} />
              Two-factor authentication is <span style={{ fontWeight: 600 }}>on</span>
            </div>
            {!showDisable ? (
              <button onClick={() => setShowDisable(true)} className="w-full py-2.5 text-sm font-semibold rounded-lg"
                style={{ background: "transparent", border: "1px solid #ef444455", color: "#ef4444" }}>Turn off two-factor</button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Enter a current code to confirm:</p>
                <input value={disableCode} onChange={(e) => setDisableCode(e.target.value)} inputMode="numeric"
                  placeholder="123456 or backup code"
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-center font-mono"
                  style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
                <div className="flex gap-2">
                  <button onClick={() => { setShowDisable(false); setDisableCode(""); }} className="flex-1 py-2 text-sm rounded-lg"
                    style={{ background: "var(--surface2)", border: "1px solid var(--border-light)", color: "var(--text-dim)" }}>Cancel</button>
                  <button onClick={disable} disabled={busy || !disableCode} className="flex-1 py-2 text-sm font-semibold rounded-lg"
                    style={{ background: "#ef4444", color: "#fff", opacity: busy || !disableCode ? 0.6 : 1 }}>Turn off</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
