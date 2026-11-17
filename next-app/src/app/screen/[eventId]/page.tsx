"use client";

import { use } from "react";
import { ScreenInner } from "./ScreenInner";

export default function ScreenPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  return <ScreenInner eventId={eventId} />;
}
