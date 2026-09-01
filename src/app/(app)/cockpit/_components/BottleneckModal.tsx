"use client";

import { useQuery } from "@tanstack/react-query";
import { getCockpitBottleneck } from "../actions";
import { X, Filter, ArrowRight, LayoutGrid, BarChart3, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { getDashboardRefetchInterval } from "@/lib/query/polling";
import { createClient } from "@/utils/supabase/client";

interface BottleneckModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

export default function BottleneckModal({ isOpen, onClose, userId }: BottleneckModalProps) {
  const { data: bottleneckResult, refetch, isLoading } = useQuery({
    queryKey: ["cockpit-bottleneck", userId],
    queryFn: () => getCockpitBottleneck(userId),
    enabled: isOpen,
    refetchInterval: getDashboardRefetchInterval(),
  });

  // Realtime coverage
  useEffect(() => {
    if (!isOpen) return;
    const supabase = createClient();
    const channel = supabase
      .channel('bottleneck-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'crm_cards',
          filter: `responsavel_id=eq.${userId}`
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

  const data = (bottleneckResult?.data as any[]) || [];
  const maxCount = data.length > 0 ? Math.max(...data.map(d => d.count)) : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-[#111111] border border-[#ffffff10] rounded-3xl w-full max-w-xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden relative">
        
        {/* Urgent Glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-red-600/10 blur-[100px] rounded-full" />

        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#ffffff0a] relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tighter italic">Análise de Gargalo</h3>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest flex items-center gap-1.5">
                <Filter className="w-3 h-3" /> Distribuição de carga por estágio
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar-activity space-y-6 relative z-10">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
               <div className="w-8 h-8 border-2 border-red-500/20 border-t-red-500 rounded-full animate-spin" />
               <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Analisando volumes...</p>
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-[#ffffff0a] rounded-3xl">
              <LayoutGrid className="w-10 h-10 text-gray-700 mb-4" />
              <p className="text-sm font-bold text-gray-400 uppercase tracking-tight">Carga de trabalho zerada</p>
              <p className="text-[10px] text-gray-600 mt-2 font-medium">Você não possui cards ativos vinculados ao seu perfil.</p>
            </div>
          ) : (
            <div className="space-y-5">
               {data.map((item, idx) => (
                  <div key={item.stageId} className="group space-y-2">
                     <div className="flex items-center justify-between text-xs font-bold uppercase tracking-tighter">
                        <span className="text-gray-400 group-hover:text-white transition-colors flex items-center gap-2">
                           {idx === 0 && <AlertCircle className="w-3 h-3 text-red-500 animate-pulse" />}
                           {item.stageName}
                        </span>
                        <span className={idx === 0 ? "text-red-500" : "text-gray-600"}>{item.count} Cards</span>
                     </div>
                     
                     <div className="h-6 flex items-center gap-3">
                        <div className="flex-1 h-2 bg-[#ffffff05] rounded-full overflow-hidden border border-[#ffffff0a]">
                           <div 
                              className={`h-full rounded-full transition-all duration-1000 ease-out ${idx === 0 ? 'bg-red-500' : 'bg-gray-700'}`}
                              style={{ width: `${(item.count / maxCount) * 100}%` }}
                           />
                        </div>
                        
                        <Link
                           href={`/cockpit/crm/funis/${item.pipelineId}`}
                           onClick={onClose}
                           className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#ffffff05] hover:bg-red-500/20 text-[9px] font-black uppercase text-gray-500 hover:text-red-500 border border-[#ffffff0a] hover:border-red-500/30 transition-all active:scale-95 whitespace-nowrap"
                        >
                           Funil <ArrowRight className="w-2.5 h-2.5" />
                        </Link>
                     </div>
                  </div>
               ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-red-500/5 border-t border-[#ffffff0a] text-center">
           <p className="text-[9px] font-bold text-red-500/60 uppercase tracking-[0.2em]">
              O gargalo indica onde o seu trabalho está mais retido 🚨
           </p>
        </div>

      </div>
    </div>
  );
}
