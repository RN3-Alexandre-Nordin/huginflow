"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { getWorkflowActivities } from "@/app/(app)/cockpit/actions";
import { getDashboardRefetchInterval } from "@/lib/query/polling";
import { playNotificationSound } from "@/utils/notifications";

export function useWorkflowActivity(userId: string) {
  const queryClient = useQueryClient();
  const supabase = createClient();
  const prevDataCount = useRef<number>(0);
  const [isSynced, setIsSynced] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["workflow-activities", userId],
    queryFn: () => getWorkflowActivities(userId).then(res => res.data || []),
    refetchInterval: getDashboardRefetchInterval(),
    staleTime: 0,
  });

  useEffect(() => {
    if (!userId) return;

    // Sincronização em Tempo Real (Realtime)
    const channel = supabase
      .channel(`workflow_activity_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "crm_cards",
          filter: `responsavel_id=eq.${userId}`,
        },
        async (payload) => {
          console.log("Realtime: Card change detected", payload);
          await queryClient.invalidateQueries({ queryKey: ["workflow-activities", userId] });

          const isNewAssignment =
            payload.eventType === "INSERT" ||
            (payload.eventType === "UPDATE" &&
              payload.new?.responsavel_id === userId &&
              payload.old?.responsavel_id !== userId);

          if (isNewAssignment) {
            playNotificationSound();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks", // Inscrição na tabela de tasks conforme solicitado
        },
        async (payload) => {
          console.log("Realtime: Task change detected", payload);
          await queryClient.invalidateQueries({ queryKey: ["workflow-activities", userId] });
          // Notificamos sempre para tarefas, assumindo que se chegou aqui é relevante
          playNotificationSound();
        }
      )
      .subscribe((status) => {
        setIsSynced(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient, supabase]);

  // Monitoramento para Beep em novas entradas (mesmo via polling/invalidação)
  useEffect(() => {
    if (data && data.length > prevDataCount.current) {
        if (prevDataCount.current > 0) {
            playNotificationSound(); 
        }
    }
    if (data) prevDataCount.current = data.length;
  }, [data]);

  return { 
    activities: data || [], 
    isLoading,
    isSynced 
  };
}
