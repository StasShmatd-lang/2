"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandFooter } from "@/components/BrandFooter";
import { Snow } from "@/components/Snow";
import { readJson } from "@/lib/apiClient";

export default function HomePage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function createEvent() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyName }),
      });
      const data = await readJson<{
        id: string;
        hostToken: string;
        screenToken?: string;
        guestAccessToken?: string;
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || "Ошибка");
      sessionStorage.setItem(`hostToken:${data.id}`, data.hostToken);
      if (data.screenToken) sessionStorage.setItem(`screenToken:${data.id}`, data.screenToken);
      if (data.guestAccessToken) {
        sessionStorage.setItem(`guestAccess:${data.id}`, data.guestAccessToken);
      }
      router.push(`/host/${data.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось создать");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Snow />
      <div className="shell relative-z flex flex-col">
        <div className="flex flex-1 flex-col justify-center gap-7">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.png" alt="Schmidt" className="brand-mark anim-rise mx-auto" />
          <div className="anim-rise-delay text-center">
            <p className="chip mx-auto mb-4">Новогодний зал</p>
            <h1 className="display text-4xl leading-none sm:text-5xl">Кто это сказал</h1>
            <p className="mt-4 text-base leading-relaxed" style={{ color: "var(--mute)" }}>
              Тосты, фразы босса и обещания коллег — угадай автора.
            </p>
          </div>
          <div className="anim-rise-delay-2 space-y-3">
            <label className="label" htmlFor="company">
              Компания (опционально)
            </label>
            <input
              id="company"
              className="field"
              placeholder="Например, Acme NY 2026"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              maxLength={80}
            />
            <button type="button" className="btn-ice w-full" disabled={busy} onClick={createEvent}>
              {busy ? "Создаём…" : "Создать игру"}
            </button>
            {err && (
              <p className="text-center text-sm" style={{ color: "var(--coral)" }}>
                {err}
              </p>
            )}
          </div>
        </div>
        <BrandFooter />
      </div>
    </>
  );
}
