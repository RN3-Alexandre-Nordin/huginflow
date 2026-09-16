'use client'

import { useState } from 'react'
import {
  FileCode,
  ClipboardList,
  Workflow,
  Check,
  AlertCircle,
  Loader2,
  FolderOpen,
  CheckCircle2,
} from 'lucide-react'
import { saveEstoqueConfig } from './actions'

type LocalOption = {
  id: string
  codigo: string
  nome: string
  eh_principal: boolean
}

type PipelineOption = {
  id: string
  nome: string
}

type StageOption = {
  id: string
  pipeline_id: string
  nome: string
  ordem: number
}

type ConfigData = {
  empresa_id: string
  nfe_xml_diretorio: string | null
  nfe_xml_local_padrao_id: string | null
  req_saldo_insuficiente_modo: string
  /** Import planilha: true = recebe + baixa; false = só recebe */
  req_planilha_auto_atender?: boolean | null
  aprovacao_via_workflow: boolean
  aprovacao_funil_id: string | null
  aprovacao_estagio_id: string | null
  req_aprovacao_ativa?: boolean | null
  req_aprovador_usuario_id?: string | null
  req_aprovacao_valor_minimo?: number | string | null
}

type UsuarioOption = {
  id: string
  nome_completo: string | null
  email: string | null
}

type Props = {
  config: ConfigData | null
  locais: LocalOption[]
  pipelines: PipelineOption[]
  stages: StageOption[]
  usuarios: UsuarioOption[]
  hasWorkflowAddon?: boolean
  canManage: boolean
  empresaNome?: string
}

type SectionId = 'nfe' | 'requisicoes' | 'workflow'

interface SectionMeta {
  id: SectionId
  label: string
  hint: string
  title: string
  description: string
  icon: typeof FileCode
}

const SECTIONS_CONFIG: Record<SectionId, SectionMeta> = {
  nfe: {
    id: 'nfe',
    label: 'Importação NF-e',
    hint: 'Diretório XML e local de entrada',
    title: 'Importação Automática de NF-e (XML)',
    description:
      'Diretório monitorado na rede local do cliente e local de estoque padrão para notas fiscais de entrada.',
    icon: FileCode,
  },
  requisicoes: {
    id: 'requisicoes',
    label: 'Requisições Internas',
    hint: 'Saldo, aprovação e aprovador',
    title: 'Políticas de Requisições Internas',
    description:
      'Tratamento de saldo insuficiente no atendimento e parâmetros de aprovação interna (aprovador e valor mínimo).',
    icon: ClipboardList,
  },
  workflow: {
    id: 'workflow',
    label: 'Fluxo de Aprovação',
    hint: 'Integração opcional com Workflow',
    title: 'Fluxo de Aprovação de Requisições',
    description:
      'Abertura automática de cards em funis Kanban do módulo de Workflow para aprovação de requisições.',
    icon: Workflow,
  },
}

export default function ConfigForm({
  config,
  locais,
  pipelines,
  stages,
  usuarios,
  hasWorkflowAddon = false,
  canManage,
  empresaNome,
}: Props) {
  const [section, setSection] = useState<SectionId>('nfe')
  const [loadingSave, setLoadingSave] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Estados dos campos
  const [nfeXmlDiretorio, setNfeXmlDiretorio] = useState(config?.nfe_xml_diretorio || '')
  const [nfeXmlLocalPadraoId, setNfeXmlLocalPadraoId] = useState(config?.nfe_xml_local_padrao_id || '')
  const [reqSaldoModo, setReqSaldoModo] = useState(config?.req_saldo_insuficiente_modo || 'atende_parcial_pendente')
  const [reqPlanilhaAutoAtender, setReqPlanilhaAutoAtender] = useState(
    Boolean(config?.req_planilha_auto_atender)
  )
  const [reqAprovacaoAtiva, setReqAprovacaoAtiva] = useState(Boolean(config?.req_aprovacao_ativa))
  const [reqAprovadorId, setReqAprovadorId] = useState(config?.req_aprovador_usuario_id || '')
  const [reqValorMinimo, setReqValorMinimo] = useState(
    String(config?.req_aprovacao_valor_minimo ?? '0'),
  )
  const [aprovacaoWorkflow, setAprovacaoWorkflow] = useState(config?.aprovacao_via_workflow || false)
  const [aprovacaoFunilId, setAprovacaoFunilId] = useState(config?.aprovacao_funil_id || '')
  const [aprovacaoEstagioId, setAprovacaoEstagioId] = useState(config?.aprovacao_estagio_id || '')

  const filteredStages = stages.filter((s) => s.pipeline_id === aprovacaoFunilId)

  // Lista dinâmica de abas conforme addons ativos
  const availableSections: SectionMeta[] = [
    SECTIONS_CONFIG.nfe,
    SECTIONS_CONFIG.requisicoes,
    ...(hasWorkflowAddon ? [SECTIONS_CONFIG.workflow] : []),
  ]

  const activeSection = availableSections.some((s) => s.id === section) ? section : 'nfe'
  const activeMeta = SECTIONS_CONFIG[activeSection]

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!canManage) return

    setLoadingSave(true)
    setSaveMessage(null)

    const formData = new FormData()
    formData.append('nfe_xml_diretorio', nfeXmlDiretorio)
    formData.append('nfe_xml_local_padrao_id', nfeXmlLocalPadraoId)
    formData.append('req_saldo_insuficiente_modo', reqSaldoModo)
    if (reqPlanilhaAutoAtender) formData.append('req_planilha_auto_atender', 'on')
    if (reqAprovacaoAtiva) formData.append('req_aprovacao_ativa', 'on')
    formData.append('req_aprovador_usuario_id', reqAprovadorId)
    formData.append('req_aprovacao_valor_minimo', reqValorMinimo || '0')
    if (aprovacaoWorkflow && hasWorkflowAddon) {
      formData.append('aprovacao_via_workflow', 'on')
      formData.append('aprovacao_funil_id', aprovacaoFunilId)
      formData.append('aprovacao_estagio_id', aprovacaoEstagioId)
    }

    try {
      const res = await saveEstoqueConfig(formData)
      if (res && res.error) {
        setSaveMessage({ type: 'error', text: res.error })
      } else {
        setSaveMessage({ type: 'success', text: 'Configurações de estoque salvas com sucesso!' })
      }
    } catch {
      setSaveMessage({ type: 'error', text: 'Erro ao salvar configurações.' })
    } finally {
      setLoadingSave(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-20 font-sans">
      {saveMessage && (
        <div
          className={`flex items-start gap-3 rounded-2xl p-4 text-sm transition-all ${
            saveMessage.type === 'success'
              ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
              : 'border border-red-500/20 bg-red-500/10 text-red-400'
          }`}
        >
          {saveMessage.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0" />
          )}
          <p>{saveMessage.text}</p>
        </div>
      )}

      <form onSubmit={handleSave} className="overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#111111] shadow-2xl">
        {/* Barra Superior de Navegação das Abas (Padrão Hugin Flow) */}
        <div className="border-b border-[#ffffff0a] bg-[#0A0A0A]/80 px-3 pt-3 pb-2 sm:px-4">
          <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-widest text-gray-600">
            Seções de Configuração {empresaNome ? `— ${empresaNome}` : ''}
          </p>
          <nav
            className={`grid grid-cols-1 gap-1.5 sm:grid-cols-2 ${
              availableSections.length > 2 ? 'lg:grid-cols-3' : ''
            }`}
            role="tablist"
            aria-label="Seções de Configuração de Estoque"
          >
            {availableSections.map((item) => {
              const active = item.id === activeSection
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSection(item.id)}
                  className={`flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                    active
                      ? 'bg-gradient-to-r from-[#2BAADF]/20 to-[#2BAADF]/5 text-[#2BAADF] border border-[#2BAADF]/25 shadow-sm'
                      : 'text-gray-400 hover:bg-[#ffffff08] hover:text-white border border-transparent'
                  }`}
                >
                  <div
                    className={`mt-0.5 rounded-lg p-1.5 shrink-0 transition-colors ${
                      active
                        ? 'bg-[#2BAADF]/15 text-[#2BAADF]'
                        : 'bg-white/5 text-gray-400 group-hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-sm font-semibold tracking-tight leading-tight">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-snug text-gray-500 line-clamp-1">
                      {item.hint}
                    </span>
                  </div>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Cabeçalho da Seção Ativa */}
        <div className="border-b border-[#ffffff08] px-5 py-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2BAADF]/10 text-[#2BAADF] shrink-0">
              <activeMeta.icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">{activeMeta.title}</h3>
              <p className="text-xs text-gray-400 mt-0.5">{activeMeta.description}</p>
            </div>
          </div>
        </div>

        {/* Painéis de Conteúdo por Aba */}
        <div className="min-h-[22rem] p-5 sm:p-6">
          {/* Aba 1: Importação de NF-e */}
          <div className={activeSection === 'nfe' ? 'space-y-5 animate-in fade-in duration-200' : 'hidden'} role="tabpanel">
            <div className="grid gap-5">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Diretório de XMLs de Entrada (Rede Local / UNC)
                </label>
                <div className="relative">
                  <FolderOpen className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <input
                    type="text"
                    value={nfeXmlDiretorio}
                    onChange={(e) => setNfeXmlDiretorio(e.target.value)}
                    disabled={!canManage}
                    placeholder="Ex: \\servidor\nfe\entrada ou C:\NFe\Entrada"
                    className="w-full rounded-xl border border-[#ffffff15] bg-[#0A0A0A] pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-[#2BAADF] focus:outline-none disabled:opacity-60"
                  />
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">
                  <span className="font-semibold text-[#2BAADF]">Importante:</span> Este caminho aponta para a <strong>rede local da sua empresa</strong>, onde roda o conector on-premises. Os servidores em nuvem do Hugin Flow não conectam diretamente à sua LAN.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Local de Estoque Padrão para NF-e
                </label>
                <select
                  value={nfeXmlLocalPadraoId}
                  onChange={(e) => setNfeXmlLocalPadraoId(e.target.value)}
                  disabled={!canManage}
                  className="w-full rounded-xl border border-[#ffffff15] bg-[#0A0A0A] px-3.5 py-2.5 text-sm text-white focus:border-[#2BAADF] focus:outline-none disabled:opacity-60"
                >
                  <option value="">Usar Local Principal (BRANCO) automático</option>
                  {locais.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.codigo} — {loc.nome} {loc.eh_principal ? '(Principal)' : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-gray-500">
                  Se não especificado, as entradas fiscais serão creditadas no almoxarifado marcado como Principal.
                </p>
              </div>
            </div>
          </div>

          {/* Aba 2: Requisições Internas */}
          <div className={activeSection === 'requisicoes' ? 'space-y-5 animate-in fade-in duration-200' : 'hidden'} role="tabpanel">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-2.5">
                Modo de Tratamento de Saldo Insuficiente
              </label>

              <div className="grid gap-3">
                {/* Opção 1: atende_parcial_pendente */}
                <label
                  className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition ${
                    reqSaldoModo === 'atende_parcial_pendente'
                      ? 'border-[#2BAADF]/50 bg-[#2BAADF]/5 text-white'
                      : 'border-[#ffffff0a] bg-[#0A0A0A] text-gray-300 hover:border-[#ffffff20]'
                  }`}
                >
                  <input
                    type="radio"
                    name="req_saldo_modo"
                    value="atende_parcial_pendente"
                    checked={reqSaldoModo === 'atende_parcial_pendente'}
                    onChange={(e) => setReqSaldoModo(e.target.value)}
                    disabled={!canManage}
                    className="mt-1 h-4 w-4 text-[#2BAADF] focus:ring-[#2BAADF]"
                  />
                  <div>
                    <div className="text-sm font-semibold flex items-center gap-2">
                      Atendimento Parcial com Saldo Pendente
                      <span className="rounded bg-[#2BAADF]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#2BAADF]">
                        RECOMENDADO
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                      Libera imediatamente a quantidade existente em estoque para o solicitante. A quantidade restante permanece marcada como <strong>pendente</strong> para posterior atendimento assim que houver reposição.
                    </p>
                  </div>
                </label>

                {/* Opção 2: nao_atende_requisicao */}
                <label
                  className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition ${
                    reqSaldoModo === 'nao_atende_requisicao'
                      ? 'border-[#2BAADF]/50 bg-[#2BAADF]/5 text-white'
                      : 'border-[#ffffff0a] bg-[#0A0A0A] text-gray-300 hover:border-[#ffffff20]'
                  }`}
                >
                  <input
                    type="radio"
                    name="req_saldo_modo"
                    value="nao_atende_requisicao"
                    checked={reqSaldoModo === 'nao_atende_requisicao'}
                    onChange={(e) => setReqSaldoModo(e.target.value)}
                    disabled={!canManage}
                    className="mt-1 h-4 w-4 text-[#2BAADF] focus:ring-[#2BAADF]"
                  />
                  <div>
                    <div className="text-sm font-semibold">Bloqueio Total da Requisição</div>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                      Se qualquer item solicitado não tiver saldo suficiente para entrega completa, a requisição inteira não é atendida e nenhuma baixa física é realizada.
                    </p>
                  </div>
                </label>

                {/* Opção 3: pula_item */}
                <label
                  className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition ${
                    reqSaldoModo === 'pula_item'
                      ? 'border-[#2BAADF]/50 bg-[#2BAADF]/5 text-white'
                      : 'border-[#ffffff0a] bg-[#0A0A0A] text-gray-300 hover:border-[#ffffff20]'
                  }`}
                >
                  <input
                    type="radio"
                    name="req_saldo_modo"
                    value="pula_item"
                    checked={reqSaldoModo === 'pula_item'}
                    onChange={(e) => setReqSaldoModo(e.target.value)}
                    disabled={!canManage}
                    className="mt-1 h-4 w-4 text-[#2BAADF] focus:ring-[#2BAADF]"
                  />
                  <div>
                    <div className="text-sm font-semibold">Pular Itens Sem Saldo</div>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                      Atende os materiais que possuem estoque. Os itens sem saldo são desconsiderados (quantidade atendida = 0) sem gerar fila de pendência.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="border-t border-[#ffffff08] pt-5 space-y-3">
              <h4 className="text-sm font-semibold text-white">Importação por planilha</h4>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Define o que acontece ao efetivar um upload em Requisições → Importar planilha.
              </p>
              <div className="grid gap-3">
                <label
                  className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition ${
                    !reqPlanilhaAutoAtender
                      ? 'border-[#2BAADF]/50 bg-[#2BAADF]/5 text-white'
                      : 'border-[#ffffff0a] bg-[#0A0A0A] text-gray-300 hover:border-[#ffffff20]'
                  }`}
                >
                  <input
                    type="radio"
                    name="req_planilha_auto"
                    checked={!reqPlanilhaAutoAtender}
                    onChange={() => setReqPlanilhaAutoAtender(false)}
                    disabled={!canManage}
                    className="mt-1 h-4 w-4 text-[#2BAADF] focus:ring-[#2BAADF]"
                  />
                  <div>
                    <div className="text-sm font-semibold">Apenas receber (aguardar baixa manual)</div>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                      Cria a(s) requisição(ões) e deixa no fluxo normal (aprovação / atendimento manual).
                    </p>
                  </div>
                </label>
                <label
                  className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition ${
                    reqPlanilhaAutoAtender
                      ? 'border-[#2BAADF]/50 bg-[#2BAADF]/5 text-white'
                      : 'border-[#ffffff0a] bg-[#0A0A0A] text-gray-300 hover:border-[#ffffff20]'
                  }`}
                >
                  <input
                    type="radio"
                    name="req_planilha_auto"
                    checked={reqPlanilhaAutoAtender}
                    onChange={() => setReqPlanilhaAutoAtender(true)}
                    disabled={!canManage}
                    className="mt-1 h-4 w-4 text-[#2BAADF] focus:ring-[#2BAADF]"
                  />
                  <div>
                    <div className="text-sm font-semibold">Receber e baixar estoque na hora</div>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                      Após importar, libera a requisição e tenta atender imediatamente no local padrão.
                      Se faltar saldo, baixa o disponível e a requisição fica{' '}
                      <strong className="text-gray-300">parcialmente atendida</strong> com o restante pendente.
                      (Bypassa a fila de aprovação nesta importação.)
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="border-t border-[#ffffff08] pt-5 space-y-4">
              <h4 className="text-sm font-semibold text-white">Aprovação interna</h4>
              <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-[#ffffff0a] bg-[#0A0A0A] p-4">
                <input
                  type="checkbox"
                  checked={reqAprovacaoAtiva}
                  onChange={(e) => setReqAprovacaoAtiva(e.target.checked)}
                  disabled={!canManage}
                  className="mt-0.5 h-4 w-4 rounded border-gray-700 bg-[#0A0A0A] text-[#2BAADF] focus:ring-[#2BAADF]"
                />
                <div>
                  <span className="text-sm font-medium text-white">Exige aprovação de requisições</span>
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                    Quando ligada, o envio pode ir para a fila de aprovação conforme o valor mínimo (preço de compra dos SKUs).
                  </p>
                </div>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                    Aprovador {reqAprovacaoAtiva && <span className="text-red-400">*</span>}
                  </label>
                  <select
                    value={reqAprovadorId}
                    onChange={(e) => setReqAprovadorId(e.target.value)}
                    disabled={!canManage || !reqAprovacaoAtiva}
                    className="w-full rounded-xl border border-[#ffffff15] bg-[#0A0A0A] px-3.5 py-2.5 text-sm text-white focus:border-[#2BAADF] focus:outline-none disabled:opacity-60"
                  >
                    <option value="">Selecione o aprovador...</option>
                    {usuarios.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nome_completo || u.email || u.id}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Além deste usuário, admin da empresa e superadmin também podem liberar.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                    Valor mínimo
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-500">
                      R$
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={reqValorMinimo}
                      onChange={(e) => setReqValorMinimo(e.target.value)}
                      disabled={!canManage || !reqAprovacaoAtiva}
                      className="w-full rounded-xl border border-[#ffffff15] bg-[#0A0A0A] py-2.5 pl-10 pr-3.5 text-sm text-white focus:border-[#2BAADF] focus:outline-none disabled:opacity-60"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">
                    0 = limiar não se aplica (toda requisição enviada vai para aprovação). Acima de 0, só exige se Σ qtd × preço de custo ≥ mínimo.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Aba 3: Fluxo de Aprovação via Workflow (se addon ativo) */}
          {hasWorkflowAddon && (
            <div className={activeSection === 'workflow' ? 'space-y-5 animate-in fade-in duration-200' : 'hidden'} role="tabpanel">
              <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-[#ffffff0a] bg-[#0A0A0A] p-4">
                <input
                  type="checkbox"
                  checked={aprovacaoWorkflow}
                  onChange={(e) => setAprovacaoWorkflow(e.target.checked)}
                  disabled={!canManage}
                  className="mt-0.5 h-4 w-4 rounded border-gray-700 bg-[#0A0A0A] text-[#2BAADF] focus:ring-[#2BAADF]"
                />
                <div>
                  <span className="text-sm font-medium text-white">
                    Exigir Aprovação via Card de Workflow
                  </span>
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                    Ao criar uma requisição interna de materiais com status para envio, cria automaticamente um card no funil de aprovação selecionado.
                  </p>
                </div>
              </label>

              {aprovacaoWorkflow && (
                <div className="pt-2 animate-in fade-in duration-200">
                  {pipelines.length === 0 ? (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-400">
                      Nenhum funil cadastrado no módulo de Workflow desta empresa. Crie um funil em <strong>Workflows → Funis</strong> para direcionar as aprovações de requisição.
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                          Funil de Aprovação <span className="text-red-400">*</span>
                        </label>
                        <select
                          value={aprovacaoFunilId}
                          onChange={(e) => {
                            const newFunilId = e.target.value
                            setAprovacaoFunilId(newFunilId)
                            const firstStage = stages.find((s) => s.pipeline_id === newFunilId)
                            setAprovacaoEstagioId(firstStage ? firstStage.id : '')
                          }}
                          required={aprovacaoWorkflow}
                          disabled={!canManage}
                          className="w-full rounded-xl border border-[#ffffff15] bg-[#0A0A0A] px-3.5 py-2.5 text-sm text-white focus:border-[#2BAADF] focus:outline-none"
                        >
                          <option value="">Selecione o funil onde o processo será aberto...</option>
                          {pipelines.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nome}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-[11px] text-gray-500">
                          Kanban onde a requisição de material criará o card para aprovação da chefia.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                          Etapa / Estágio Inicial
                        </label>
                        <select
                          value={aprovacaoEstagioId}
                          onChange={(e) => setAprovacaoEstagioId(e.target.value)}
                          disabled={!canManage || !aprovacaoFunilId}
                          className="w-full rounded-xl border border-[#ffffff15] bg-[#0A0A0A] px-3.5 py-2.5 text-sm text-white focus:border-[#2BAADF] focus:outline-none disabled:opacity-50"
                        >
                          <option value="">Primeiro estágio do funil (padrão)</option>
                          {filteredStages.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nome}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-[11px] text-gray-500">
                          Coluna inicial onde o card nascerá (se não selecionado, usará a primeira coluna).
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé Fixo de Ações */}
        {canManage && (
          <div className="border-t border-[#ffffff08] bg-[#0A0A0A]/90 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-gray-500 text-center sm:text-left">
              As alterações salvas são aplicadas imediatamente a todos os processos da empresa.
            </p>
            <button
              type="submit"
              disabled={loadingSave}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#2BAADF]/20 hover:opacity-95 transition disabled:opacity-50"
            >
              {loadingSave ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando Configurações...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Salvar Configurações
                </>
              )}
            </button>
          </div>
        )}
      </form>
    </div>
  )
}
