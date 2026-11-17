"use client";

import { Suspense } from "react";
import { use } from "react";
import { JoinInner } from "./JoinInner";

export default function JoinPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  return (
    <Suspense fallback={<div className="shell">Загрузка…</div>}>
      <JoinInner eventId={eventId} />
    </Suspense>
  );
}
