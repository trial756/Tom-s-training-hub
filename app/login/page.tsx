"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const params = useSearchParams();
  const [passcode, setPasscode] = useState("");
  const [trust, setTrust] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, trust }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Couldn't sign in.");
      const next = params.get("next");
      // Only same-site paths, never a full URL.
      window.location.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-16 max-w-sm px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink">Training Hub</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Enter your passcode to use the app on this device.</p>

      <label htmlFor="passcode" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
        Passcode
      </label>
      <input
        id="passcode"
        name="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        className="input-field"
        value={passcode}
        onChange={(e) => setPasscode(e.target.value)}
        disabled={busy}
      />

      <label className="mt-4 flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-ink">
        <input type="checkbox" className="h-5 w-5 accent-[#00e676]" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
        <span>
          Trust this device
          <span className="block text-xs text-muted">
            {trust ? "Stays signed in while you keep using it." : "Signs out when you close the browser."}
          </span>
        </span>
      </label>

      <button type="submit" className="btn-primary mt-5 w-full" disabled={busy || !passcode}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
