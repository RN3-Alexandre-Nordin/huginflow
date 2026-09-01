"use client";

import { useState, useEffect } from "react";
import { X, ChevronRight, Zap, CheckCircle2, Layout, Loader2 } from "lucide-react";
import { getPipelinesAndStages, createLandingPageChannel, updateLandingPageDestination } from "./actions";
import { createClient } from "@/utils/supabase/client";

interface LandingPageEditModalProps {
  canal: any;
  onClose: () => void;
  onUpdated: (canal: any) => void;
}

export default function LandingPageEditModal({ canal, onClose, onUpdated }: LandingPageEditModalProps) {
  const supabase = createClient();

  const [nome, setNome] = useState(canal.nome || "");
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [selectedStageId, setSelectedStageId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        // 1. Buscar pipelines disponíveis
        console.log('[Modal] Buscando pipelines para empresa:', canal.empresa_id);
        const res = await getPipelinesAndStages(canal.empresa_id);
        if (res.success && res.data) {
          console.log('[Modal] Pipelines carregados:', res.data.length);
          setPipelines(res.data);
          if (res.data.length === 0) {
            setError("Nenhum quadro de CRM encontrado para esta empresa. Crie um quadro no menu CRM primeiro.");
          }
        } else {
          setError(res.error || "Erro ao carregar pipelines");
        }

        // 2. Buscar roteamento atual do canal
        const { data: routing } = await supabase
          .from("crm_canais_roteamento")
          .select("pipeline_id, stage_id")
          .eq("canal_id", canal.id)
          .single();

        if (routing) {
          setSelectedPipelineId(routing.pipeline_id || "");
          setSelectedStageId(routing.stage_id || "");
        }
      } catch (e) {
        console.error("Erro ao carregar dados de edição:", e);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [canal.id, canal.empresa_id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome || !selectedPipelineId || !selectedStageId) return;

    setIsSaving(true);
    setError("");

    try {
      const res = await updateLandingPageDestination(canal.id, canal.empresa_id, nome, selectedPipelineId, selectedStageId);
      if (!res.success) throw new Error(res.error);

      // 3. Notificar o componente pai
      onUpdated({ ...canal, nome });
      setSaved(true);

      // Fechar após feedback visual
      setTimeout(onClose, 1500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass =
    "w-full bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-5 py-4 text-white focus:outline-none focus:border-orange-500 transition-all font-bold placeholder-gray-800 appearance-none";

  const currentStages =
    pipelines.find((p) => p.id === selectedPipelineId)?.pipeline_stages?.sort(
      (a: any, b: any) => a.ordem - b.ordem
    ) || [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-[#000000e0] backdrop-blur-xl animate-in fade-in duration-500">
      <div className="relative w-full max-w-lg bg-[#0C0C0C] border border-[#ffffff0a] rounded-[32px] shadow-[0_0_80px_-20px_rgba(249,115,22,0.2)] overflow-hidden flex flex-col">

        {/* Loading overlay */}
        {(isLoading || isSaving) && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] z-50 flex items-center justify-center">
            <div className="w-10 h-10 border-2 border-orange-500/20 border-t-orange-500 rounded-full animate-spin" />
          </div>
        )}

        {/* Close */}
        <button
          onClick={onClose}
          disabled={isSaving}
          className="absolute top-7 right-7 p-2 rounded-xl bg-[#ffffff05] border border-[#ffffff0a] text-gray-500 hover:text-white hover:bg-[#ffffff10] transition-all z-20 disabled:opacity-30"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-10 sm:p-12 space-y-8">
          {/* Header */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 w-fit">
              <div className="w-10 h-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                <Layout className="w-5 h-5 text-orange-500" />
              </div>
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20">
                <Zap className="w-3 h-3 text-orange-500" />
                <span className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em]">Landing Page</span>
              </div>
            </div>
            <h3 className="text-2xl font-black text-white tracking-tighter uppercase italic italic-brand">
              Editar Destino
            </h3>
            <p className="text-gray-500 text-sm font-medium">
              Atualize o nome e o roteamento de leads desta Landing Page.
            </p>

          {/* Token Visualizer - Very prominent */}
          {(canal.token || canal.provider_token) && (
            <div className="p-5 rounded-3xl bg-orange-500/10 border border-orange-500/20 space-y-3 animate-in fade-in zoom-in duration-500">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest leading-none flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5" />
                  Token de Integração (Webhook)
                </span>
                <span className="text-[9px] font-bold text-orange-500/50 uppercase tracking-tighter">Use este token na sua Landing Page</span>
              </div>
              <div className="flex items-center gap-2 bg-[#000000] p-1.5 rounded-2xl border border-orange-500/10">
                <code className="text-xs text-orange-300 font-mono flex-1 px-3 py-2 truncate select-all">{canal.token || canal.provider_token}</code>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(canal.token || canal.provider_token);
                    alert("Token copiado para a área de transferência!");
                  }}
                  type="button"
                  className="px-4 py-2.5 rounded-xl bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20 active:scale-95 flex items-center gap-2"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Copiar
                </button>
              </div>
            </div>
          )}
          </div>

          {/* Success */}
          {saved ? (
            <div className="flex flex-col items-center gap-4 py-8 animate-in fade-in zoom-in-95">
              <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center shadow-[0_0_30px_-8px_rgba(34,197,94,0.4)]">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <p className="text-white font-black uppercase tracking-wider text-sm">Salvo com sucesso!</p>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-5">
              {/* Nome */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">
                  Nome do Canal
                </label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Landing Page - Campanha Outono"
                  className={inputClass}
                />
              </div>

              {/* Pipeline */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">
                  Pipeline (Quadro) Destino
                </label>
                <select
                  required
                  value={selectedPipelineId}
                  onChange={(e) => {
                    setSelectedPipelineId(e.target.value);
                    const board = pipelines.find((p) => p.id === e.target.value);
                    setSelectedStageId(board?.pipeline_stages?.length ? board.pipeline_stages[0].id : "");
                  }}
                  className={`${inputClass} cursor-pointer`}
                >
                  <option value="">Selecione o Quadro...</option>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </div>

              {/* Stage */}
              {selectedPipelineId && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">
                    Etapa Inicial
                  </label>
                  <select
                    required
                    value={selectedStageId}
                    onChange={(e) => setSelectedStageId(e.target.value)}
                    className={`${inputClass} cursor-pointer`}
                  >
                    <option value="">Selecione a Etapa...</option>
                    {currentStages.map((st: any) => (
                      <option key={st.id} value={st.id}>{st.nome}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Routing preview badge */}
              {selectedPipelineId && selectedStageId && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-orange-500/5 border border-orange-500/10 animate-in fade-in">
                  <ChevronRight className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Leads → {" "}
                    <span className="text-orange-400">
                      {pipelines.find(p => p.id === selectedPipelineId)?.nome}
                    </span>
                    {" "} / {" "}
                    <span className="text-white">
                      {currentStages.find((s: any) => s.id === selectedStageId)?.nome}
                    </span>
                  </p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-[10px] font-bold uppercase animate-in slide-in-from-top-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isSaving || !nome || !selectedPipelineId || !selectedStageId}
                className="w-full group bg-gradient-to-r from-orange-500 to-orange-600 hover:shadow-[0_4px_24px_rgba(249,115,22,0.35)] text-white py-4 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-3 uppercase tracking-widest disabled:opacity-50 active:scale-95 mt-2"
              >
                {isSaving ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    Salvando...
                  </div>
                ) : (
                  <>SALVAR CONFIGURAÇÃO <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-all" /></>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#ffffff03] border-t border-[#ffffff05] px-10 py-4 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-600">
            Canal interno · sem dependência de API externa
          </span>
        </div>
      </div>
    </div>
  );
}
