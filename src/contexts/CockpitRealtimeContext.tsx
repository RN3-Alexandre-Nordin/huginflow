"use client";

import { createContext, useContext } from "react";
import { useCockpitRealtime } from "@/hooks/useCockpitRealtime";

type CockpitLastEvent = { id: string; type: "message" | "card" } | null;

const CockpitRealtimeContext = createContext<CockpitLastEvent>(null);

export function CockpitRealtimeProvider({
  userId,
  userName,
  empresaId,
  children,
}: {
  userId: string;
  userName: string;
  empresaId?: string;
  children: React.ReactNode;
}) {
  const { lastEvent } = useCockpitRealtime(userId, userName, empresaId);

  return (
    <CockpitRealtimeContext.Provider value={lastEvent}>
      {children}
    </CockpitRealtimeContext.Provider>
  );
}

export function useCockpitLastEvent() {
  return useContext(CockpitRealtimeContext);
}
