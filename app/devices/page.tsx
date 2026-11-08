"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";

interface Device {
  id: string;
  name: string;
  trusted: boolean;
  created_at: string;
  last_seen_at: string;
  current: boolean;
}

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/devices", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't load devices.");
      setDevices(json.devices);
      setEnabled(json.enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load devices.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(device: Device) {
    setBusy(device.id);
    setError(null);
    try {
      if (device.current) {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.replace("/login");
        return;
      }
      const res = await fetch(`/api/auth/devices?id=${device.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't sign that device out.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader title="Devices" subtitle="Where the app is signed in." />
      <div className="space-y-2 px-4">
        {!enabled && (
          <p className="rounded-lg bg-fuel/10 p-3 text-xs text-fuel">
            Sign-in is off: no passcode is set, so anyone with the link can open the app. Add APP_PASSCODE in the Vercel
            project&apos;s environment variables to turn it on.
          </p>
        )}
        {devices?.length === 0 && enabled && <p className="text-sm text-muted">No devices signed in.</p>}
        {devices?.map((d) => (
          <div key={d.id} className="card flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">
                {d.name}
                {d.current && <span className="ml-2 text-xs font-medium text-accent">this device</span>}
              </p>
              <p className="text-xs text-muted">
                Signed in {when(d.created_at)} · last used {when(d.last_seen_at)}
                {!d.trusted && " · this session only"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => remove(d)}
              disabled={busy === d.id}
              className="min-h-[44px] shrink-0 rounded-lg px-3 text-sm text-muted active:text-danger"
            >
              {d.current ? "Sign out" : "Remove"}
            </button>
          </div>
        ))}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
