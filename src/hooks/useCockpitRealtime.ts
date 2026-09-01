"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { playNotificationSound } from "@/utils/notifications";

export function useCockpitRealtime(
  userId: string,
  userName: string,
  empresaId?: string,
) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [lastEvent, setLastEvent] = useState<{ id: string; type: "message" | "card" } | null>(null);

  useEffect(() => {
    if (!userId) return;

    const myMention = `[${userName}]`;

    const chatFilter = empresaId ? `empresa_id=eq.${empresaId}` : undefined;

    const chatChannel = supabase
      .channel(`cockpit-messages-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          ...(chatFilter ? { filter: chatFilter } : {}),
        },
        (payload) => {
          const content = payload.new.content as string;
          if (content.includes(myMention) && payload.new.sender_id !== userId) {
            playNotificationSound();
            setLastEvent({ id: payload.new.id, type: "message" });

            queryClient.invalidateQueries({ queryKey: ["recent-conversations"] });
            queryClient.invalidateQueries({ queryKey: ["cockpit-stats"] });
            queryClient.invalidateQueries({ queryKey: ["manager-dashboard-metrics"] });
            queryClient.invalidateQueries({ queryKey: ["manager-dashboard-chart"] });
          }
        }
      )
      .subscribe();

    const invalidateCardAssignment = (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
      const assignedNow = payload.new.responsavel_id === userId;
      const wasAssigned = payload.old?.responsavel_id === userId;

      if (!assignedNow) return;

      queryClient.invalidateQueries({ queryKey: ["workflow-activities", userId] });
      queryClient.invalidateQueries({ queryKey: ["my-cards"] });
      queryClient.invalidateQueries({ queryKey: ["cockpit-stats"] });
      queryClient.invalidateQueries({ queryKey: ["cockpit-omni-preview"] });
      queryClient.invalidateQueries({ queryKey: ["cockpit-metrics"] });

      if (!wasAssigned) {
        playNotificationSound();
        setLastEvent({ id: payload.new.id as string, type: "card" });
      }
    };

    const cardChannel = supabase
      .channel(`cockpit-cards-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "crm_cards",
          filter: `responsavel_id=eq.${userId}`,
        },
        (payload) => {
          invalidateCardAssignment({ new: payload.new, old: {} });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "crm_cards",
          filter: `responsavel_id=eq.${userId}`,
        },
        (payload) => {
          invalidateCardAssignment({ new: payload.new, old: payload.old ?? {} });
        }
      )
      .subscribe();

    const conversaChannel = supabase
      .channel(`cockpit-conversas-assign-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "crm_conversas",
          filter: `atribuido_a_id=eq.${userId}`,
        },
        (payload) => {
          if (
            payload.new.atribuido_a_id === userId &&
            payload.old.atribuido_a_id !== userId
          ) {
            playNotificationSound();
            setLastEvent({ id: payload.new.id, type: "message" });
            queryClient.invalidateQueries({ queryKey: ["cockpit-omni-preview"] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chatChannel);
      supabase.removeChannel(cardChannel);
      supabase.removeChannel(conversaChannel);
    };
  }, [userId, userName, empresaId, queryClient, supabase]);

  return { lastEvent };
}
