import { Info, Lock } from "lucide-react";
import { getMyProfile } from "@/app/(app)/cockpit/actions";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { hasPermission } from "@/utils/permissions";
import BackTextButton from "@/components/BackTextButton";
import ChannelList from "./ChannelList";
import OutboundWebhooksPanel from "./OutboundWebhooksPanel";

export const metadata = {
  title: "Gestão de Canais | HuginFlow",
};

export default async function ChannelsPage() {
  const me = await getMyProfile();
  if (!me) redirect("/login");

  if (!hasPermission(me, "canais", "view")) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <Lock className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Acesso Interditado</h2>
        <p className="text-gray-400 max-w-md mx-auto mb-8 text-lg">
          Seu grupo de acesso não possui permissão para visualizar os Canais Inbound.
        </p>
        <BackTextButton className="px-6 py-3 bg-[#ffffff05] hover:bg-[#ffffff10] border border-[#ffffff10] rounded-xl text-white font-semibold transition-all">
          Voltar ao Cockpit
        </BackTextButton>
      </div>
    );
  }

  const supabase = await createClient();

  // Buscar canais da empresa logada
  const { data: canais, error } = await supabase
    .from("crm_canais")
    .select("*")
    .eq("empresa_id", me.empresa_id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao buscar canais:", error);
  }

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-[#ffffff0a]">
        <p className="text-gray-500 text-sm font-medium">
          Conecte seus pontos de contato e ative o Agente de IA para escalar seu atendimento.
        </p>
      </div>

      {/* Info Card */}
      <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/10">
          <Info className="w-5 h-5 text-blue-400" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-bold text-blue-100">Configuração de Webhooks</p>
          <p className="text-xs text-blue-400 leading-relaxed font-medium">
            O HuginFlow utiliza uma camada de abstração universal. Certifique-se de que a Evolution API está configurada para enviar eventos de <span className="text-blue-300 font-bold">messages.upsert</span> para o seu endpoint dinâmico.
          </p>
        </div>
      </div>

      {/* Channel List Component (Client Side for Interactive Actions) */}
      <ChannelList initialChannels={canais || []} empresaId={me.empresa_id} />

      <OutboundWebhooksPanel
        canManage={hasPermission(me, "canais", "edit") || hasPermission(me, "canais", "create")}
      />
    </div>
  );
}
