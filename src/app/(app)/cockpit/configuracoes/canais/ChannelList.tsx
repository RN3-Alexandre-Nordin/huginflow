"use client";

import { useState } from "react";
import { Plus, Share2, QrCode } from "lucide-react";
import ChannelCard from "./ChannelCard";
import ConnectionWizard from "./ConnectionWizard"; // Novo componente para o modal

export default function ChannelList({ initialChannels, empresaId }: { initialChannels: any[]; empresaId: string }) {
  const [canais, setCanais] = useState(initialChannels);
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const handleAddChannel = () => {
    setIsWizardOpen(true);
  };

  const onChannelCreated = (newChannel: any) => {
    setCanais([newChannel, ...canais]);
    // O modal cuidará de exibir o QR Code inicial
  };

  const onChannelDeleted = (id: string) => {
    setCanais(canais.filter(c => c.id !== id));
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-1000">
      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-white/90 tracking-tight uppercase italic italic-brand flex items-center gap-2">
          Suas Conexões Ativas
        </h3>
        <button
          onClick={handleAddChannel}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#ffffff0a] border border-[#ffffff0f] text-sm font-black text-white uppercase tracking-wider hover:bg-orange-500 hover:border-orange-400 hover:shadow-[0_0_20px_-5px_#f97316] transition-all duration-300 group active:scale-95"
        >
          <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
          Adicionar Canal
        </button>
      </div>

      {/* Empty State */}
      {canais.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-[#ffffff03] rounded-3xl border border-dashed border-[#ffffff10]">
          <div className="w-16 h-16 rounded-3xl bg-[#ffffff05] flex items-center justify-center mb-4">
            <Share2 className="w-8 h-8 text-gray-700" />
          </div>
          <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Nenhum canal conectado</p>
          <p className="text-gray-600 text-sm mt-1">Clique no botão acima para iniciar sua primeira integração.</p>
        </div>
      )}

      {/* Grid of Channels */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {canais.map((canal) => (
          <ChannelCard 
            key={canal.id} 
            canal={canal} 
            onDelete={() => onChannelDeleted(canal.id)} 
          />
        ))}
      </div>

      {/* Connection Wizard Modal */}
      {isWizardOpen && (
        <ConnectionWizard 
          onClose={() => setIsWizardOpen(false)} 
          onCreated={onChannelCreated}
          empresaId={empresaId}
        />
      )}
    </div>
  );
}
