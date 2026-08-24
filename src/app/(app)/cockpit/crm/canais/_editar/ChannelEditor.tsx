"use client";

import { useState, useActionState } from "react"
import { Save, ExternalLink, QrCode, MessageSquare, Info, ShieldCheck, Copy, Check, AlertCircle } from "lucide-react"
import { updateCanal, getWhatsAppQRCode } from "../actions"

interface ChannelEditorProps {
  canal: any
}

export default function ChannelEditor({ canal }: ChannelEditorProps) {
  const [state, formAction, isPending] = useActionState(
    async (prevState: any, formData: FormData) => updateCanal(canal.id, formData),
    null
  )
  const [qrcode, setQrcode] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  // O Webhook URL é baseado na URL atual do site
  const webhookUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/api/webhooks/whatsapp/${canal.id}`
    : ''

  const copyToClipboard = () => {
    navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleGenerateQR = async () => {
    setQrLoading(true)
    const res = await getWhatsAppQRCode(canal.id)
    if (res.qrcode) {
      setQrcode(res.qrcode)
    } else {
      alert(res.error || 'Erro ao gerar QR Code. Verifique se a URL da Evolution API está correta e a instância foi criada.')
    }
    setQrLoading(false)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl overflow-hidden shadow-2xl relative">
        {/* Loading Overlay */}
        {isPending && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center">
             <div className="w-8 h-8 border-2 border-[#2BAADF]/20 border-t-[#2BAADF] rounded-full animate-spin" />
          </div>
        )}

        <div className="p-8 border-b border-[#ffffff0a]">
           <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-1">
              <Info className="w-5 h-5 text-[#2BAADF]" /> Configurações Básicas
           </h3>
           <p className="text-xs text-gray-500 uppercase tracking-widest font-black">Informações de Identificação do Canal</p>
        </div>

        <form action={formAction} className="p-8 space-y-8">
          {state?.error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-sm animate-in slide-in-from-top-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="font-medium">{state.error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Nome do Canal</label>
              <input 
                name="nome" 
                defaultValue={canal.nome}
                required 
                className="w-full bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#2BAADF] transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Tipo de Tráfego</label>
              <select 
                name="tipo" 
                defaultValue={canal.tipo || 'Pago'}
                className="w-full bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#2BAADF] transition-all appearance-none"
              >
                <option value="whatsapp">WhatsApp (Mensageria)</option>
                <option value="Pago">Tráfego Pago (Ads)</option>
                <option value="Orgânico">Tráfego Orgânico</option>
                <option value="Indicação">Indicação</option>
                <option value="Outros">Outros</option>
              </select>
            </div>
          </div>

          <div className="space-y-8 py-8 border-t border-[#ffffff05]">
            <div className="flex items-center justify-between">
               <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10 text-green-500">
                     <MessageSquare className="w-6 h-6" />
                  </div>
                  <div>
                     <h4 className="text-md font-black text-white uppercase tracking-tighter">Integração WhatsApp</h4>
                     <p className="text-xs text-gray-500">Conecte via Evolution API ou Meta Business.</p>
                  </div>
               </div>
               <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#ffffff05] border border-[#ffffff0a]">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#2BAADF]" />
                  <span className="text-[10px] font-black text-[#2BAADF] uppercase tracking-widest">Credenciais Seguras</span>
               </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
               <div className="space-y-6 bg-white/5 p-6 rounded-2xl border border-white/5">
                  <h5 className="text-sm font-bold text-white flex items-center gap-2">
                     <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Evolution API (Custo Zero)
                  </h5>
                  
                  <div className="space-y-4">
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-500 uppercase">URL do Servidor</label>
                        <input 
                           name="evolution_url" 
                           defaultValue={canal.configuracoes?.evolution?.url}
                           placeholder="https://sua-api.com"
                           className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:border-blue-500 outline-none"
                        />
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-500 uppercase">Global API Key</label>
                        <input 
                           type="password"
                           name="evolution_apikey" 
                           defaultValue={canal.configuracoes?.evolution?.apikey}
                           placeholder="Sua chave secreta"
                           className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:border-blue-500 outline-none"
                        />
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-500 uppercase">Nome da Instância</label>
                        <input 
                           name="instancia_nome" 
                           defaultValue={canal.instancia_nome}
                           placeholder="ex: hugin_vendas"
                           className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:border-blue-500 outline-none"
                        />
                     </div>
                  </div>

                  <button 
                    type="button"
                    onClick={handleGenerateQR}
                    disabled={qrLoading}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-900/20"
                  >
                     {qrLoading ? <div className="animate-spin w-4 h-4 border-2 border-white/20 border-t-white rounded-full" /> : <QrCode className="w-4 h-4" />}
                     {qrLoading ? 'Solicitando...' : 'Gerar QR Code de Conexão'}
                  </button>
               </div>

               <div className="space-y-6 bg-white/5 p-6 rounded-2xl border border-white/5">
                  <h5 className="text-sm font-bold text-white flex items-center gap-2">
                     <div className="w-1.5 h-1.5 rounded-full bg-purple-500" /> Meta API (Oficial Business)
                  </h5>

                  <div className="space-y-4">
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-500 uppercase">Permanent Access Token</label>
                        <input 
                           type="password"
                           name="meta_token" 
                           defaultValue={canal.configuracoes?.meta?.token}
                           placeholder="EAAB..."
                           className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:border-purple-500 outline-none"
                        />
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                           <label className="text-[10px] font-black text-gray-500 uppercase">Phone ID</label>
                           <input 
                              name="meta_phone_id" 
                              defaultValue={canal.configuracoes?.meta?.phone_id}
                              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:border-purple-500 outline-none"
                           />
                        </div>
                        <div className="space-y-1.5">
                           <label className="text-[10px] font-black text-gray-500 uppercase">Business ID</label>
                           <input 
                              name="meta_business_id" 
                              defaultValue={canal.configuracoes?.meta?.business_id}
                              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:border-purple-500 outline-none"
                           />
                        </div>
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-500 uppercase">Verify Token (Sua Escolha)</label>
                        <input 
                           name="meta_verify_token" 
                           defaultValue={canal.configuracoes?.meta?.verify_token}
                           placeholder="token_para_webhook"
                           className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:border-purple-500 outline-none"
                        />
                     </div>
                  </div>
               </div>
            </div>

            <div className="p-6 bg-blue-500/5 border border-blue-500/10 rounded-2xl space-y-4">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                     <ExternalLink className="w-4 h-4 text-[#2BAADF]" />
                     <h6 className="text-xs font-black text-white uppercase tracking-widest">Endereço de Webhook (Payload)</h6>
                  </div>
                  <span className="text-[10px] text-gray-500 font-bold">Configure esta URL na Evolution ou App do Meta</span>
               </div>
               
               <div className="flex items-center gap-2">
                  <code className="flex-1 bg-black/50 p-3 rounded-xl text-xs text-[#2BAADF] font-mono break-all border border-blue-500/20">
                     {webhookUrl}
                  </code>
                  <button 
                    type="button"
                    onClick={copyToClipboard}
                    className="p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
               </div>
               <p className="text-[10px] text-gray-500 italic flex items-center gap-1.5">
                  <Info className="w-3 h-3" /> Certifique-se de que sua instância Evolution está enviando eventos em formato JSON.
               </p>
            </div>
          </div>

          <div className="pt-6 border-t border-[#ffffff0a] flex items-center justify-end gap-3 flex-wrap">
            <button 
              type="submit" 
              disabled={isPending}
              className="bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] text-white px-10 py-3 rounded-xl text-sm font-black transition-all flex items-center gap-2 uppercase tracking-widest disabled:opacity-50 active:scale-95"
            >
              <Save className="w-4 h-4" /> {isPending ? 'Atualizando...' : 'Atualizar Canal'}
            </button>
          </div>
        </form>
      </div>

      {qrcode && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
           <div className="bg-[#111] border border-white/10 p-10 rounded-3xl max-w-sm w-full text-center space-y-6 shadow-2xl">
              <h4 className="text-xl font-black text-white uppercase tracking-tighter">Escaneie o QR Code</h4>
              <p className="text-sm text-gray-400">Abra o WhatsApp no seu celular e use o 'Aparelhos Conectados'</p>
              <div className="bg-white p-4 rounded-2xl mx-auto inline-block border-8 border-white/5">
                <img src={qrcode.startsWith('data:image') ? qrcode : `data:image/png;base64,${qrcode}`} alt="QR Code WhatsApp" className="w-full h-auto rounded" />
              </div>
              <button 
                onClick={() => setQrcode(null)}
                className="w-full py-3 bg-[#ffffff0a] hover:bg-[#ffffff10] text-gray-400 hover:text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all"
              >
                Fechar Gerador
              </button>
           </div>
        </div>
      )}
    </div>
  )
}
