"use client";

import { useQuery } from "@tanstack/react-query";
import { getTodayMovementsDetails } from "../actions";
import { X, ArrowRight, ExternalLink, TrendingUp, History } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";
import { useEffect } from "react";
import { getDashboardRefetchInterval } from "@/lib/query/polling";
import { createClient } from "@/utils/supabase/client";

interface ProductivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

export default function ProductivityModal({ isOpen, onClose, userId }: ProductivityModalProps) {
  const { data: movementsResult, refetch, isLoading } = useQuery({
    queryKey: ["today-movements", userId],
    queryFn: () => getTodayMovementsDetails(userId),
    enabled: isOpen,
    refetchInterval: getDashboardRefetchInterval(),
  });

  // Realtime subscription for history updates
  useEffect(() => {
    if (!isOpen) return;

    const supabase = createClient();
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'crm_cards_history',
          filter: `usuario_id=eq.${userId}`
        },
        () => {
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, userId, refetch]);

  if (!isOpen) return null;

  const movements = movementsResult?.data || [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-[#111111] border border-[#ffffff10] rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden relative">
        
        {/* Decorative background glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-600/10 blur-[100px] rounded-full" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-600/10 blur-[100px] rounded-full" />

        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#ffffff0a] relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tighter italic">Extrato de Produtividade</h3>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest flex items-center gap-1.5">
                <History className="w-3 h-3" /> Movimentações realizadas hoje
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-[#ffffff0a] flex items-center justify-center text-gray-500 hover:text-white transition-colors border border-transparent hover:border-[#ffffff0a]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / List */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar-activity space-y-4 relative z-10">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
               <div className="w-8 h-8 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
               <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Carregando histórico...</p>
            </div>
          ) : movements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-[#ffffff0a] rounded-3xl">
              <TrendingUp className="w-10 h-10 text-gray-700 mb-4" />
              <p className="text-sm font-bold text-gray-400 uppercase tracking-tight">Nenhuma movimentação registrada hoje</p>
              <p className="text-[10px] text-gray-600 mt-2 font-medium">Os cards que você mover no Kanban aparecerão aqui.</p>
            </div>
          ) : (
            movements.map((item: any) => (
              <div 
                key={item.id} 
                className="group flex flex-col md:flex-row md:items-center justify-between p-4 rounded-2xl bg-[#ffffff03] hover:bg-[#ffffff08] border border-[#ffffff05] hover:border-cyan-500/30 transition-all duration-300"
              >
                <div className="flex-1 min-w-0 pr-4">
                  <h4 className="text-sm font-bold text-white mb-1.5 truncate group-hover:text-cyan-400 transition-colors">
                    {item.crm_cards?.titulo || 'Card sem título'}
                  </h4>
                  
                  <div className="flex items-center gap-2 text-[10px] text-gray-500 font-medium">
                    <span className="px-2 py-0.5 rounded bg-[#ffffff05] bg-red-500/5 text-red-400/80 line-through decoration-red-500/30">
                       {item.de_stage?.nome || 'Início'}
                    </span>
                    <ArrowRight className="w-3 h-3 text-gray-700" />
                    <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-bold border border-cyan-500/20">
                       {item.para_stage?.nome || 'Destino'}
                    </span>
                    <span className="ml-2 text-gray-600 font-bold tracking-tighter">
                       • {format(new Date(item.created_at), "HH:mm'h'", { locale: ptBR })}
                    </span>
                  </div>
                </div>

                <Link
                  href={`/cockpit/crm/funis/${item.crm_cards?.pipeline_id}?cardId=${item.card_id}`}
                  onClick={onClose}
                  className="mt-4 md:mt-0 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#ffffff05] hover:bg-cyan-500 text-[10px] font-black uppercase text-gray-400 hover:text-white border border-[#ffffff10] hover:border-cyan-500 transition-all active:scale-95 group/btn shrink-0"
                >
                  Gestão <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-[#80B828]/5 border-t border-[#ffffff0a] text-center">
           <p className="text-[9px] font-bold text-[#80B828] uppercase tracking-[0.2em]">
              Sua produtividade diária é atualizada em tempo real ⚡
           </p>
        </div>

      </div>
    </div>
  );
}
