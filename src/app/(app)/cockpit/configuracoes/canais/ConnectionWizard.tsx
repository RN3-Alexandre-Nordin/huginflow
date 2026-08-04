"use client";

import { useState, useEffect, useCallback } from "react";
import { X, CheckCircle2, ChevronRight, Smartphone, ShieldCheck, Zap, Globe, MessageSquare, Mail, MessageCircle, Layout, RefreshCw } from "lucide-react";
import { getPipelinesAndStages, createLandingPageChannel } from "./actions";

interface ConnectionWizardProps {
  onClose: () => void;
  onCreated: (canal: any) => void;
  empresaId: string;
}

const CATEGORIES = [
  { id: 'whatsapp', name: 'WhatsApp', icon: MessageCircle, description: 'Mensageria instantânea e automação IA', color: 'text-green-500', bg: 'bg-green-500/10' },
  { id: 'marketing', name: 'Meta (FB/Instagram)', icon: Globe, description: 'Direct Messages e comentários (API)', soon: true },
  { id: 'email', name: 'Email Omnichannel', icon: Mail, description: 'Sincronização SMTP / IMAP segura', soon: true },
  { id: 'landing', name: 'Landing Page', icon: Layout, description: 'Páginas de captura de leads integrada', color: 'text-orange-500', bg: 'bg-orange-500/10' },
];

const PROVIDERS = [
  { id: 'evolution', name: 'Evolution API', icon: MessageSquare, description: 'WhatsApp Instância Baileys', type: 'whatsapp' },
  { id: 'zapi', name: 'Z-API', icon: MessageCircle, description: 'WhatsApp High Availability', type: 'whatsapp', soon: true },
  { id: 'meta', name: 'Meta Cloud API', icon: Globe, description: 'WhatsApp Business Oficial', type: 'whatsapp', soon: true },
];

export default function ConnectionWizard({ onClose, onCreated, empresaId }: ConnectionWizardProps) {
  // Steps: 0: Category, 1: Provider, 2: Name+Connect(WA), 3: QR Code, 4: Success, 5: Landing Page Config
  const [step, setStep] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [selectedProvider, setSelectedProvider] = useState<any>(null);
  const [nome, setNome] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [createdCanalId, setCreatedCanalId] = useState<string | null>(null);
  const [isFetchingQr, setIsFetchingQr] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Landing Page routing states
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [selectedStageId, setSelectedStageId] = useState("");

  const fetchQrFromApi = useCallback(async (canalId: string) => {
    const response = await fetch(`/api/channels/qrcode?canalId=${encodeURIComponent(canalId)}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Falha ao obter QR Code");
    }
    if (data.qrcode) {
      setQrCode(data.qrcode);
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (step !== 3 || qrCode || !createdCanalId) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 8;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (cancelled) return;
      attempts++;
      setIsFetchingQr(true);
      try {
        const ok = await fetchQrFromApi(createdCanalId);
        if (ok || cancelled) return;
      } catch {
        // continua tentando
      } finally {
        if (!cancelled) setIsFetchingQr(false);
      }
      if (!cancelled && attempts < maxAttempts) {
        timeoutId = setTimeout(poll, 2000);
      }
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [step, qrCode, createdCanalId, fetchQrFromApi]);

  const handleRefreshQr = async () => {
    if (!createdCanalId) return;
    setIsFetchingQr(true);
    setError("");
    try {
      const ok = await fetchQrFromApi(createdCanalId);
      if (!ok) setError("QR Code ainda indisponível. Tente novamente em alguns segundos.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar QR Code");
    } finally {
      setIsFetchingQr(false);
    }
  };

  const handleSelectCategory = async (cat: any) => {
    if (cat.soon) return;
    setSelectedCategory(cat);
    if (cat.id === 'landing') {
      setIsLoading(true);
      const res = await getPipelinesAndStages(empresaId);
      if (res.success && res.data) setPipelines(res.data);
      setIsLoading(false);
      setStep(5);
    } else {
      setStep(1);
    }
  };

  const handleSelectProvider = (prov: any) => {
    if (prov.soon) return;
    setSelectedProvider(prov);
    setStep(2);
  };

  const handleStartConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome || !selectedProvider) return;
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/channels/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, provider: selectedProvider.id, tipo: selectedProvider.type }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao criar canal");
      if (selectedProvider.id === 'evolution') {
        setCreatedCanalId(data.canalId);
        if (data.qrcode) setQrCode(data.qrcode);
        setStep(3);
        onCreated({
          id: data.canalId,
          nome,
          status: "pairing",
          provider: selectedProvider.id,
          provider_id: data.instanceName,
        });
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateLandingPage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome || !selectedPipelineId || !selectedStageId) return;
    setIsLoading(true);
    setError("");
    try {
      const res = await createLandingPageChannel(nome, selectedPipelineId, selectedStageId, empresaId);
      if (!res.success) throw new Error(res.error || "Falha ao criar canal de Landing Page.");
      onCreated({ id: res.canalId, nome, status: "connected", provider: "internal", tipo: "landing-page" });
      setStep(4);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = "w-full bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-5 py-4 text-white focus:outline-none transition-all font-bold placeholder-gray-800 appearance-none";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-[#000000e0] backdrop-blur-xl animate-in fade-in duration-500">
      <div className="relative w-full max-w-xl bg-[#0C0C0C] border border-[#ffffff0a] rounded-[32px] shadow-[0_0_80px_-20px_rgba(43,170,223,0.15)] overflow-hidden flex flex-col">

        {isLoading && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] z-50 flex items-center justify-center">
            <div className="w-10 h-10 border-2 border-[#2BAADF]/20 border-t-[#2BAADF] rounded-full animate-spin" />
          </div>
        )}

        <button onClick={onClose} disabled={isLoading} className="absolute top-8 right-8 p-2 rounded-xl bg-[#ffffff05] border border-[#ffffff0a] text-gray-500 hover:text-white hover:bg-[#ffffff10] transition-all z-20 disabled:opacity-30">
          <X className="w-5 h-5" />
        </button>

        <div className="p-10 sm:p-12 space-y-8 min-h-[500px] flex flex-col justify-center">

          {/* Step 0: Selecionar Categoria */}
          {step === 0 && (
            <div className="space-y-8 animate-in slide-in-from-bottom-6 duration-700">
              <div className="space-y-2 text-center">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#2BAADF]/10 border border-[#2BAADF]/20 w-fit mx-auto">
                  <Zap className="w-3 h-3 text-[#2BAADF]" />
                  <span className="text-[10px] font-black text-[#2BAADF] uppercase tracking-[0.2em]">Ponto de Contato</span>
                </div>
                <h3 className="text-3xl font-black text-white tracking-tighter uppercase italic italic-ragnar">Nova Conexão</h3>
                <p className="text-gray-500 text-sm font-medium tracking-tight">O que você deseja conectar hoje ao HuginFlow CRM?</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handleSelectCategory(cat)}
                    className={`relative p-6 rounded-3xl border transition-all duration-500 text-center space-y-4 group overflow-hidden ${cat.soon ? 'opacity-20 grayscale pointer-events-none bg-[#ffffff03] border-[#ffffff0a]' : 'bg-[#ffffff03] border-[#ffffff0a] hover:border-[#2BAADF]/40 hover:bg-[#ffffff08] shadow-2xl'}`}
                  >
                    {!cat.soon && (
                      <div className={`absolute -top-12 -right-12 w-24 h-24 rounded-full blur-[40px] opacity-10 transition-all duration-500 group-hover:opacity-20 ${cat.bg}`} />
                    )}
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border border-[#ffffff0a] mx-auto transition-all duration-500 group-hover:scale-110 ${cat.bg || 'bg-[#ffffff05]'}`}>
                      <cat.icon className={`w-7 h-7 ${cat.color || 'text-gray-500'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-white uppercase tracking-tighter mb-1">{cat.name}</p>
                      <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest leading-relaxed">{cat.description}</p>
                    </div>
                    {cat.soon && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-white/5 border border-white/5">
                        <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest">Breve</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Selecionar Provedor (WhatsApp) */}
          {step === 1 && (
            <div className="space-y-8 animate-in slide-in-from-right-6 duration-700">
              <div className="flex items-center gap-4">
                <button onClick={() => setStep(0)} disabled={isLoading} className="p-2 rounded-lg bg-[#ffffff05] text-gray-500 hover:text-white transition-colors">
                  <ChevronRight className="w-5 h-5 rotate-180" />
                </button>
                <div className="space-y-1">
                  <h3 className="text-2xl font-black text-white tracking-tighter uppercase italic italic-ragnar">Escolha o Provedor</h3>
                  <p className="text-xs text-gray-500 font-medium tracking-tight">Selecione o motor de infraestrutura para {selectedCategory?.name}.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {PROVIDERS.map((prov) => (
                  <button
                    key={prov.id}
                    onClick={() => handleSelectProvider(prov)}
                    disabled={prov.soon}
                    className={`relative p-5 rounded-2xl border transition-all duration-300 text-left flex items-center gap-4 group ${prov.soon ? 'opacity-30 grayscale pointer-events-none' : 'bg-[#ffffff03] border-[#ffffff10] hover:bg-[#ffffff08] hover:border-[#2BAADF]/30 shadow-lg'}`}
                  >
                    <div className="w-12 h-12 rounded-xl bg-[#ffffff05] flex items-center justify-center border border-[#ffffff10] group-hover:bg-[#2BAADF]/10 group-hover:border-[#2BAADF]/20 transition-all">
                      <prov.icon className={`w-6 h-6 ${prov.soon ? 'text-gray-600' : 'text-[#2BAADF]'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-white uppercase tracking-tight">{prov.name}</p>
                      <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">{prov.description}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 ml-auto text-gray-700 group-hover:text-[#2BAADF] group-hover:translate-x-1 transition-all" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Nome + Conectar (WhatsApp) */}
          {step === 2 && (
            <div className="space-y-8 animate-in slide-in-from-right-6 duration-700">
              <div className="flex items-center gap-4">
                <button onClick={() => setStep(1)} disabled={isLoading} className="p-2 rounded-lg bg-[#ffffff05] text-gray-500 hover:text-white transition-colors">
                  <ChevronRight className="w-5 h-5 rotate-180" />
                </button>
                <div className="space-y-1">
                  <h3 className="text-2xl font-black text-white tracking-tighter uppercase italic italic-ragnar">Finalizar Setup</h3>
                  <p className="text-xs text-gray-500 font-medium">Configure como este canal aparecerá no HuginFlow.</p>
                </div>
              </div>
              <form onSubmit={handleStartConnection} className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Identificação do Canal</label>
                  <input
                    autoFocus
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: WhatsApp Comercial"
                    className={`${inputClass} focus:border-[#2BAADF]`}
                  />
                </div>
                {error && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-[10px] font-bold uppercase animate-in slide-in-from-top-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isLoading || !nome}
                  className="w-full group bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] text-white py-4 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-3 uppercase tracking-widest disabled:opacity-50 active:scale-95"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      Solicitando...
                    </div>
                  ) : (
                    <>ESTABELECER CONEXÃO <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-all" /></>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Step 3: QR Code */}
          {step === 3 && (
            <div className="space-y-8 animate-in fade-in zoom-in-95 duration-1000 text-center">
              <div className="space-y-2">
                <h3 className="text-3xl font-black text-white tracking-tighter uppercase italic italic-ragnar">Escaneie o QR Code</h3>
                <p className="text-gray-500 text-sm font-medium">Use seu WhatsApp para autorizar este ponto de contato.</p>
              </div>
              <div className="bg-white p-6 rounded-[32px] mx-auto inline-block border-8 border-white/5 shadow-[0_0_50px_-10px_rgba(255,255,255,0.05)] min-h-[232px] min-w-[232px] flex items-center justify-center">
                {qrCode ? (
                  <img src={qrCode} alt="WhatsApp QR Code" className="w-[200px] h-[200px] rounded-lg" />
                ) : (
                  <div className="flex flex-col items-center gap-3 text-gray-400">
                    <div className="w-10 h-10 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                      {isFetchingQr ? "Gerando QR Code..." : "Aguardando QR Code..."}
                    </span>
                  </div>
                )}
              </div>
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center gap-3 text-red-500 text-[10px] font-bold uppercase">
                  {error}
                </div>
              )}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleRefreshQr}
                  disabled={isFetchingQr || !createdCanalId}
                  className="px-6 py-3 rounded-xl bg-[#2BAADF]/10 border border-[#2BAADF]/20 text-[#2BAADF] font-black uppercase tracking-widest text-[9px] hover:bg-[#2BAADF]/20 transition-all disabled:opacity-40 flex items-center gap-2"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isFetchingQr ? "animate-spin" : ""}`} />
                  Atualizar QR
                </button>
                <button onClick={onClose} className="px-8 py-3 rounded-xl bg-[#ffffff05] border border-[#ffffff0a] text-gray-500 font-black uppercase tracking-widest text-[9px] hover:text-white hover:bg-[#ffffff10] transition-all">
                  Fechar e Concluir
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Sucesso */}
          {step === 4 && (
            <div className="space-y-8 animate-in fade-in zoom-in-95 duration-1000 text-center">
              <div className="flex flex-col items-center gap-6">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center shadow-[0_0_40px_-8px_rgba(34,197,94,0.4)]">
                    <CheckCircle2 className="w-12 h-12 text-green-400" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-[#0C0C0C] animate-pulse" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-3xl font-black text-white tracking-tighter uppercase italic italic-ragnar">Canal Ativo!</h3>
                  <p className="text-gray-400 text-sm font-medium max-w-xs mx-auto leading-relaxed">
                    O canal <span className="text-white font-bold">&quot;{nome}&quot;</span> está ativo e pronto para receber leads.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[9px] font-black text-green-400 uppercase tracking-widest">Conectado</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#2BAADF]/10 border border-[#2BAADF]/20">
                  <Zap className="w-3 h-3 text-[#2BAADF]" />
                  <span className="text-[9px] font-black text-[#2BAADF] uppercase tracking-widest">Roteamento Ativo</span>
                </div>
              </div>
              <button onClick={onClose} className="px-8 py-4 rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] text-white font-black uppercase tracking-widest text-xs hover:shadow-[0_4px_24px_rgba(43,170,223,0.4)] transition-all active:scale-95">
                Fechar e Concluir
              </button>
            </div>
          )}

          {/* Step 5: Configurar Destino da Landing Page */}
          {step === 5 && (
            <div className="space-y-8 animate-in slide-in-from-right-6 duration-700">
              <div className="flex items-center gap-4">
                <button onClick={() => setStep(0)} disabled={isLoading} className="p-2 rounded-lg bg-[#ffffff05] text-gray-500 hover:text-white transition-colors">
                  <ChevronRight className="w-5 h-5 rotate-180" />
                </button>
                <div className="space-y-1">
                  <h3 className="text-2xl font-black text-orange-500 tracking-tighter uppercase italic italic-ragnar">Configurar Destino</h3>
                  <p className="text-xs text-gray-500 font-medium">Defina onde os leads desta Landing Page cairão no Kanban.</p>
                </div>
              </div>
              <form onSubmit={handleCreateLandingPage} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Nome do Canal</label>
                  <input
                    autoFocus
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: Landing Page - Black Friday"
                    className={`${inputClass} focus:border-orange-500`}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Pipeline (Quadro) Destino</label>
                  <select
                    required
                    value={selectedPipelineId}
                    onChange={(e) => {
                      setSelectedPipelineId(e.target.value);
                      const board = pipelines.find((p) => p.id === e.target.value);
                      setSelectedStageId(board?.pipeline_stages?.length ? board.pipeline_stages[0].id : "");
                    }}
                    className={`${inputClass} focus:border-orange-500 cursor-pointer`}
                  >
                    <option value="">Selecione o Quadro...</option>
                    {pipelines.map((p) => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                </div>
                {selectedPipelineId && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Etapa Inicial</label>
                    <select
                      required
                      value={selectedStageId}
                      onChange={(e) => setSelectedStageId(e.target.value)}
                      className={`${inputClass} focus:border-orange-500 cursor-pointer`}
                    >
                      <option value="">Selecione a Etapa...</option>
                      {pipelines
                        .find((p) => p.id === selectedPipelineId)
                        ?.pipeline_stages?.sort((a: any, b: any) => a.ordem - b.ordem)
                        .map((st: any) => (
                          <option key={st.id} value={st.id}>{st.nome}</option>
                        ))}
                    </select>
                  </div>
                )}
                {error && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-[10px] font-bold uppercase animate-in slide-in-from-top-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isLoading || !nome || !selectedPipelineId || !selectedStageId}
                  className="w-full group bg-gradient-to-r from-orange-500 to-orange-600 hover:shadow-[0_4px_24px_rgba(249,115,22,0.35)] text-white py-4 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-3 uppercase tracking-widest disabled:opacity-50 active:scale-95 mt-2"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      Salvando...
                    </div>
                  ) : (
                    <>CONCLUIR CONEXÃO <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-all" /></>
                  )}
                </button>
              </form>
            </div>
          )}

        </div>

        <div className="bg-[#ffffff03] border-t border-[#ffffff05] p-5 flex items-center justify-around shrink-0 opacity-40 hover:opacity-100 transition-all">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-[#2BAADF]" />
            <span className="text-[9px] font-black uppercase tracking-widest text-white">Segurança AES-256</span>
          </div>
          <div className="flex items-center gap-2">
            <Smartphone className="w-3.5 h-3.5 text-green-500" />
            <span className="text-[9px] font-black uppercase tracking-widest text-white">End-to-End Ready</span>
          </div>
        </div>
      </div>
    </div>
  );
}
