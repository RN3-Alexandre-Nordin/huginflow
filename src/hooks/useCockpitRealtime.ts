"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { playNotificationSound } from "@/utils/notifications";

export function useCockpitRealtime(userId: string, userName: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [lastEvent, setLastEvent] = useState<{ id: string; type: "message" | "card" } | null>(null);

  useEffect(() => {
    if (!userId) return;

    const myMention = `[${userName}]`;

    // 1. Channel for Chat Messages
    const chatChannel = supabase
      .channel("cockpit-messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
        },
        (payload) => {
          const content = payload.new.content as string;
          if (content.includes(myMention) && payload.new.sender_id !== userId) {
            playNotificationSound();
            setLastEvent({ id: payload.new.id, type: "message" });
            
            // Invalidate caches (Sidebar and Dashboard feeds)
            queryClient.invalidateQueries({ queryKey: ["recent-conversations"] });
            queryClient.invalidateQueries({ queryKey: ["cockpit-stats"] });
            queryClient.invalidateQueries({ queryKey: ["manager-dashboard-metrics"] });
            queryClient.invalidateQueries({ queryKey: ["manager-dashboard-chart"] });
          }
        }
      )
      .subscribe();

    // 2. Channel for Card Assignments
    const cardChannel = supabase
      .channel("cockpit-cards")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "crm_cards",
        },
        (payload) => {
          // If the card was assigned to ME now
          if (payload.new.responsavel_id === userId && payload.old.responsavel_id !== userId) {
            playNotificationSound();
            setLastEvent({ id: payload.new.id, type: "card" });

            // Invalidate all CRM/Cockpit related data
            queryClient.invalidateQueries({ queryKey: ["my-cards"] });
            queryClient.invalidateQueries({ queryKey: ["cockpit-stats"] });
            queryClient.invalidateQueries({ queryKey: ["cockpit-omni-preview"] });
            queryClient.invalidateQueries({ queryKey: ["cockpit-metrics"] });
          }
        }
      )
      .subscribe();

    const conversaChannel = supabase
      .channel("cockpit-conversas-assign")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "crm_conversas",
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
  }, [userId, userName, queryClient, supabase]);

  return { lastEvent };
}
