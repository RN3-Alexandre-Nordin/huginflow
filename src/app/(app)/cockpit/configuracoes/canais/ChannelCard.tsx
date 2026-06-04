"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, QrCode, AlertCircle, Bot, Trash2, Loader2, Power, Share2, Eye, Globe, MessageSquare, MessageCircle, Mail, ChevronRight, X, RefreshCw, Layout, Key, Copy } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { updateChannelAIConfig, deleteChannel, getReconnectQRCode, syncChannelStatus, toggleChannelStatus } from "./actions";
import { isChannelAiEnabled } from "@/lib/omnichannel/channel-ai";
import LandingPageEditModal from "./LandingPageEditModal";

const PROVIDER_INFO: any = {
  evolution: { name: 'Evolution API', icon: MessageSquare, label: 'WhatsApp (Instância)' },
  zapi: { name: 'Z-API', icon: MessageCircle, label: 'WhatsApp' },
  meta: { name: 'Meta Cloud API', icon: Globe, label: 'WhatsApp Oficial' },
  instagram: { name: 'Instagram', icon: Globe, label: 'Meta Instant' },
  email: { name: 'Omni Email', icon: Mail, label: 'Sync' },
  internal: { name: 'Internal', icon: Layout, label: 'Landing Page', color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
};

export default function ChannelCard({ canal: initialCanal, onDelete }: { canal: any; onDelete: (id: string) => void }) {
  const [canal, setCanal] = useState(initialCanal);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingAI, setIsUpdatingAI] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [reconnectQR, setReconnectQR] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const supabase = createClient();

  const info = PROVIDER_INFO[canal.provider] || { name: canal.provider, icon: Share2, label: 'Canal Genérico' };

  // Sync status automatically on mount if "pairing"
  useEffect(() => {
    if (canal.status === 'pairing') {
      handleSyncStatus();
    }
  }, []);

  const handleSyncStatus = async () => {
    setIsSyncing(true);
    try {
      const result = await syncChannelStatus(
        canal.id, 
        canal.provider, 
        canal.provider_id, 
        canal.settings?.apiUrl, 
        canal.provider_token
      );
      if (result.success && result.status) {
        setCanal({ ...canal, status: result.status });
      }
    } catch (e) {
      console.error("Erro no sincronismo ativo:", e);
    } finally {
      setIsSyncing(false);
    }
  };

  // Realtime Status Sync
  useEffect(() => {
    const channel = supabase
      .channel(`canal-${canal.id}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "crm_canais",
        filter: `id=eq.${canal.id}`,
      }, (payload) => {
        setCanal(payload.new);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canal.id, supabase]);

  const handleToggleAI = async () => {
    setIsUpdatingAI(true);
    try {
      const newAtivo = !isChannelAiEnabled(canal.ia_config);
      await updateChannelAIConfig(canal.id, { ...canal.ia_config, ativo: newAtivo });
      setCanal({ ...canal, ia_config: { ...canal.ia_config, ativo: newAtivo } });
    } catch (error) {
      console.error("Erro ao atualizar IA:", error);
    } finally {
      setIsUpdatingAI(false);
    }
  };

  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    console.log(`[ChannelCard] Iniciando exclusão do canal: ${canal.id} (${canal.nome})`);
    setIsDeleting(true);
    try {
      const result = await deleteChannel(
        canal.id, 
        canal.provider, 
        canal.provider_id, 
        canal.settings?.apiUrl, 
        canal.provider_token
      );
      
      if (result.success) {
        onDelete(canal.id);
      } else {
        alert(`Erro ao remover canal: ${result.error}`);
        setConfirmDelete(false);
        setIsDeleting(false);
      }
    } catch (error: any) {
      console.error("[ChannelCard] Erro ao deletar canal:", error);
      alert("Ocorreu um erro inesperado ao tentar remover o canal.");
      setConfirmDelete(false);
      setIsDeleting(false);
    }
  };

  const handleShowQR = async () => {
    if (showQR) {
      setShowQR(false);
      return;
    }
    
    setIsUpdatingAI(true); 
    try {
      const { qrcode } = await getReconnectQRCode(
        canal.provider, 
        canal.provider_id, 
        canal.settings?.apiUrl, 
        canal.provider_token
      );
      setReconnectQR(qrcode || "");
      setShowQR(true);
    } catch (error) {
      console.error("Erro ao buscar QR Code:", error);
    } finally {
      setIsUpdatingAI(false);
    }
  };

  const handleToggleStatus = async () => {
    setIsTogglingStatus(true);
    try {
      const result = await toggleChannelStatus(canal.id, canal.status);
      if (result.success) {
        setCanal({ ...canal, status: result.status });
      }
    } catch (e) {
      console.error("Erro ao alternar status:", e);
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const isConnected = canal.status === "connected" || canal.status === "open";
  const isPairing = canal.status === "pairing";

  return (
    <div className="group relative bg-[#111111] border border-[#ffffff0a] rounded-3xl p-7 hover:border-[#2BAADF]/30 transition-all duration-500 shadow-xl overflow-hidden flex flex-col min-h-[350px]">
      {/* Accent Glow */}
      <div className={`absolute -top-16 -right-16 w-32 h-32 rounded-full blur-[50px] opacity-[0.05] transition-all duration-700 ${isConnected ? "bg-green-500" : isPairing ? "bg-[#2BAADF]" : "bg-red-500"}`} />

      <div className="flex flex-col gap-6 relative z-10 h-full">
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-500 ${
            canal.provider === 'internal'
              ? 'bg-orange-500/10 border-orange-500/20'
              : isConnected ? 'bg-green-500/10 border-green-500/20'
              : isPairing ? 'bg-[#2BAADF]/10 border-[#2BAADF]/20'
              : 'bg-red-500/10 border-red-500/20'
          }`}>
            <info.icon className={`w-6 h-6 ${
              canal.provider === 'internal'
                ? 'text-orange-500'
                : isConnected ? 'text-green-500'
                : isPairing ? 'text-[#2BAADF]'
                : 'text-red-500'
            }`} />
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={handleSyncStatus} 
              disabled={isSyncing}
              className={`p-2 rounded-lg bg-[#ffffff05] border border-[#ffffff0a] text-gray-400 hover:text-white hover:bg-[#ffffff10] transition-all ${isSyncing ? "animate-spin" : ""}`}
            >
              <RefreshCw className="w-3 h-3" />
            </button>
            <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all duration-500 ${isConnected ? "bg-green-500/10 text-green-500 border-green-500/20" : isPairing ? "bg-[#2BAADF]/10 text-[#2BAADF] border-[#2BAADF]/20 animate-pulse-ring" : "bg-red-500/10 text-red-500 border-red-500/20"}`}>
              {isConnected ? "Ativo" : isPairing ? "Aguardando..." : "Desconectado"}
            </span>
          </div>
        </div>

        {/* Title & Info */}
        <div className="space-y-1.5 flex-1">
          <h4 className="text-xl font-bold text-white tracking-widest truncate uppercase italic italic-ragnar leading-none">{canal.nome}</h4>
          <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
            {info.name} <span className="w-1 h-1 rounded-full bg-gray-800" /> {info.label}
          </p>

          {/* Token Visualizer for Landing Pages */}
          {canal.provider === 'internal' && (canal.token || canal.provider_token) && (
            <div className="mt-4 p-3 rounded-xl bg-[#0A0A0A] border border-[#ffffff0a] group/token relative flex flex-col gap-1.5 transition-colors hover:border-[#2BAADF]/20">
              <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest leading-none flex items-center gap-1.5">
                <Key className="w-3 h-3 text-orange-500" />
                Token da Conexão
              </span>
              <div className="flex items-center gap-2">
                <code className="text-xs text-[#2BAADF] font-mono flex-1 truncate select-all bg-[#2BAADF]/5 py-1 px-2 rounded">{canal.token || canal.provider_token}</code>
                <button 
                  onClick={() => navigator.clipboard.writeText(canal.token || canal.provider_token)}
                  type="button"
                  className="p-1.5 rounded-md text-gray-500 hover:bg-[#ffffff10] hover:text-white transition-colors"
                  title="Copiar token"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* IA Smart Agent Control — oculto para canais internos (Landing Page) */}
        {canal.provider !== 'internal' && (
          <div className="flex items-center justify-between p-4 rounded-2xl bg-[#0A0A0A] border border-[#ffffff0a] group/ai transition-all hover:border-[#2BAADF]/20">
            <div className="flex items-center gap-3">
               <div className={`p-2 rounded-xl transition-all duration-500 ${isChannelAiEnabled(canal.ia_config) ? "bg-[#2BAADF]/10 text-[#2BAADF] shadow-[0_0_15px_-5px_#2BAADF]" : "bg-gray-800/40 text-gray-600"}`}>
                  <Bot className="w-4 h-4" />
               </div>
               <div>
                  <p className="text-[10px] font-black text-white uppercase tracking-widest leading-none mb-1">Agente Ragnar</p>
                  <p className={`text-[9px] font-bold uppercase tracking-widest ${isChannelAiEnabled(canal.ia_config) ? "text-[#2BAADF]/80" : "text-gray-600"}`}>{isChannelAiEnabled(canal.ia_config) ? "IA em Operação" : "Desativado"}</p>
               </div>
            </div>
            <button onClick={handleToggleAI} disabled={isUpdatingAI} className={`relative w-9 h-5 rounded-full transition-all duration-300 outline-none ${isChannelAiEnabled(canal.ia_config) ? "bg-[#2BAADF]" : "bg-gray-800"}`}>
               <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all duration-300 shadow-sm ${isChannelAiEnabled(canal.ia_config) ? "left-5" : "left-1"}`} />
            </button>
          </div>
        )}

        {/* Action Buttons Section */}
        <div className="flex flex-col gap-3 mt-auto">
          {canal.provider === 'evolution' && !isConnected && (
            <button 
              onClick={handleShowQR} 
              disabled={isUpdatingAI}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] text-[#111] font-black uppercase tracking-widest text-[10px] hover:shadow-[0_4px_20px_rgba(43,170,223,0.3)] transition-all active:scale-95"
            >
              {isUpdatingAI ? <Loader2 className="w-4 h-4 animate-spin"/> : <QrCode className="w-4 h-4" />}
              {showQR ? "OCULTAR CÓDIGO" : "ESTABELECER CONEXÃO"}
            </button>
          )}

          {/* Botão Editar — apenas para canais internos (Landing Page) */}
          {canal.provider === 'internal' && (
            <button
              onClick={() => setShowEdit(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border bg-orange-500/5 border-orange-500/20 text-orange-500 hover:bg-orange-500/10 hover:border-orange-500/40 transition-all text-[9px] font-black uppercase tracking-widest"
            >
              <Layout className="w-3.5 h-3.5" />
              Editar Destino
            </button>
          )}

          <div className="flex items-center gap-3">
            <button 
              onClick={handleDelete} 
              disabled={isDeleting} 
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border transition-all ${confirmDelete ? "bg-red-500/20 text-red-500 border-red-500/30" : "bg-[#ffffff05] border-[#ffffff0a] text-gray-500 hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/20"}`}
            >
               {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
               <span className="text-[9px] font-black uppercase tracking-widest leading-none">
                 {confirmDelete ? "CONFIRMAR EXCLUSÃO?" : "Remover"}
               </span>
            </button>
            {confirmDelete && !isDeleting && (
              <button 
                onClick={() => setConfirmDelete(false)}
                className="p-3 rounded-xl bg-gray-800/40 text-gray-400 hover:text-white transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {!confirmDelete && (
              <button
                onClick={handleToggleStatus}
                disabled={isTogglingStatus}
                title={canal.status === 'inactive' ? 'Ativar canal' : 'Desativar canal'}
                className={`p-3 rounded-xl border transition-all ${
                  canal.status === 'inactive'
                    ? 'bg-green-500/10 border-green-500/20 text-green-500 hover:bg-green-500/20'
                    : 'bg-[#ffffff05] border-[#ffffff0a] text-gray-600 hover:text-orange-400 hover:bg-orange-500/10 hover:border-orange-500/20'
                } ${isTogglingStatus ? 'opacity-50 animate-pulse pointer-events-none' : ''}`}
              >
                <Power className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* QR Code Modal Overlay */}
      {showQR && reconnectQR && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[#000000f0] backdrop-blur-2xl animate-in fade-in duration-500">
           <div className="relative w-full max-w-sm bg-white p-8 rounded-[40px] shadow-[0_0_100px_-20px_rgba(43,170,223,0.3)] animate-in zoom-in-95 duration-700 text-center space-y-6">
              {/* Close Button Inside Modal */}
              <button 
                onClick={() => setShowQR(false)}
                className="absolute -top-4 -right-4 w-12 h-12 bg-black text-white rounded-full flex items-center justify-center border-4 border-white shadow-xl hover:scale-110 active:scale-90 transition-all"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="space-y-2">
                 <h3 className="text-2xl font-black text-black tracking-tighter uppercase italic leading-none">Pronto para Conectar</h3>
                 <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest leading-tight">Escaneie o QR Code abaixo com seu WhatsApp para ativar o canal {canal.nome}.</p>
              </div>

              <div className="relative p-2 bg-gray-50 rounded-[32px] border-2 border-gray-100 group">
                 <img src={reconnectQR} alt="QR Code" className="w-full h-auto rounded-[24px] relative z-10" />
                 <div className="absolute inset-0 bg-[#2BAADF]/5 rounded-[32px] blur-xl opacity-0 group-hover:opacity-100 transition-all duration-1000" />
              </div>

              <div className="pt-2 flex items-center justify-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                 <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Sincronização em Tempo Real</span>
              </div>
           </div>
        </div>
      )}

      {/* Landing Page Edit Modal */}
      {showEdit && (
        <LandingPageEditModal
          canal={canal}
          onClose={() => setShowEdit(false)}
          onUpdated={(updated) => setCanal({ ...canal, ...updated })}
        />
      )}
    </div>
  );
}
