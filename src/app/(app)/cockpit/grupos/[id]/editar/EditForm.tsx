'use client'

import { useTransition, useState, useEffect } from 'react'
import { updateGrupoAcesso, deleteGrupoAcesso } from '@/app/(app)/cockpit/actions'
import { ShieldCheck, Building2, AlignLeft, Save, Trash2, ShieldAlert, LayoutDashboard } from 'lucide-react'
import { BackButton } from '@/components/BackButton'
import SearchableSelect from '@/components/SearchableSelect'
import PermissionsMatrix from '../../PermissionsMatrix'
import { fetchEmpresaAddonsMap } from '../../fetchEmpresaAddonsMap'
import { buildGroupsMatrixFullPermissions } from '@/constants/permissions'
import {
  COCKPIT_TEMPLATES,
  parseCockpitTemplate,
  type CockpitTemplateId,
} from '@/lib/cockpit/templates'

interface Grupo {
  id: string
  nome: string
  descricao: string | null
  empresa_id: string
  permissoes: Record<string, string[]>
  is_admin: boolean
  cockpit_template?: string | null
  empresas?: {
    id: string
    nome: string
  }
}

interface EditFormProps {
  group: Grupo
  companies: { id: string; nome: string }[]
  isSuperAdmin: boolean
  initialEmpresaAddons?: Record<string, boolean> | null
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
        {label} {required && <span className="text-[#2BAADF]">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full bg-[#0A0A0A] border border-[#ffffff12] focus:border-[#2BAADF] rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all placeholder-gray-600 focus:ring-1 focus:ring-[#2BAADF]/30'

export default function EditForm({
  group,
  companies,
  isSuperAdmin,
  initialEmpresaAddons = null,
}: EditFormProps) {
  const [isPending, startTransition] = useTransition()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [selectedEmpresa, setSelectedEmpresa] = useState(group.empresa_id)
  const [permissoes, setPermissoes] = useState<Record<string, string[]>>(group.permissoes || {})
  const [isAdmin, setIsAdmin] = useState(group.is_admin || false)
  const [cockpitTemplate, setCockpitTemplate] = useState<CockpitTemplateId>(
    parseCockpitTemplate(group.cockpit_template),
  )
  const [empresaAddons, setEmpresaAddons] = useState<Record<string, boolean> | null>(
    initialEmpresaAddons,
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!selectedEmpresa) {
        setEmpresaAddons(null)
        return
      }
      if (selectedEmpresa === group.empresa_id && initialEmpresaAddons) {
        setEmpresaAddons(initialEmpresaAddons)
        return
      }
      const map = await fetchEmpresaAddonsMap(selectedEmpresa)
      if (!cancelled) setEmpresaAddons(map)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [selectedEmpresa, group.empresa_id, initialEmpresaAddons])

  // Admin local = todas as permissões dos módulos liberados nos addons da empresa
  useEffect(() => {
    if (!isAdmin || !empresaAddons) return
    setPermissoes(buildGroupsMatrixFullPermissions(empresaAddons))
  }, [isAdmin, empresaAddons])

  function handleAdminToggle(checked: boolean) {
    setIsAdmin(checked)
    if (checked && empresaAddons) {
      setPermissoes(buildGroupsMatrixFullPermissions(empresaAddons))
    }
  }

  const handleSubmit = (formData: FormData) => {
    formData.append('permissoes', JSON.stringify(permissoes))
    formData.append('is_admin', isAdmin ? 'true' : 'false')
    startTransition(() => {
      updateGrupoAcesso(group.id, formData)
    })
  }

  const handleDelete = () => {
    startTransition(() => {
      deleteGrupoAcesso(group.id)
    })
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <BackButton fallbackHref="/cockpit/grupos" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-[#2BAADF]" />
            Editar Grupo de Acesso
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Personalize as regras de acesso para os membros deste grupo.
          </p>
        </div>
      </div>

      <form action={handleSubmit} className="space-y-8">
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-6 relative overflow-hidden">
          <div
            className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-[0.04] pointer-events-none"
            style={{
              background: 'radial-gradient(circle, #2BAADF 0%, transparent 70%)',
              filter: 'blur(30px)',
            }}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Empresa (Tenant)" required>
              <SearchableSelect
                name="empresa_id"
                required
                icon={Building2}
                options={
                  isSuperAdmin
                    ? companies
                    : [{ id: group.empresa_id, nome: group.empresas?.nome || 'Minha Empresa' }]
                }
                value={selectedEmpresa}
                onChange={setSelectedEmpresa}
                placeholder="Pesquisar empresa..."
                disabled={!isSuperAdmin}
              />
            </Field>

            <div className={!isSuperAdmin ? 'md:col-span-2' : ''}>
              <Field label="Nome do Grupo" required>
                <input
                  type="text"
                  name="nome"
                  required
                  defaultValue={group.nome}
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="md:col-span-2">
              <Field label="Descrição Interna">
                <div className="relative">
                  <AlignLeft className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
                  <textarea
                    name="descricao"
                    defaultValue={group.descricao ?? ''}
                    rows={3}
                    className={`${inputCls} pl-10 resize-none`}
                  />
                </div>
              </Field>
            </div>

            <div className="md:col-span-2">
              <Field label="Home do Cockpit">
                <div className="relative">
                  <LayoutDashboard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  <select
                    name="cockpit_template"
                    value={cockpitTemplate}
                    onChange={(e) =>
                      setCockpitTemplate(parseCockpitTemplate(e.target.value))
                    }
                    className={`${inputCls} pl-10 appearance-none`}
                  >
                    {COCKPIT_TEMPLATES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label} — {t.hint}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-1.5 text-[10px] text-gray-500 leading-snug">
                  Templates prontos da RN3. Em dúvida, deixe Automático.
                </p>
              </Field>
            </div>

            <div className="md:col-span-2 pt-2 pb-2">
              <label className="flex items-center gap-3 cursor-pointer group w-fit">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={isAdmin}
                    onChange={(e) => handleAdminToggle(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-[#ffffff05] peer-focus:outline-none rounded-full peer border border-[#ffffff12] peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-500 peer-checked:after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2BAADF] transition-all" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-white group-hover:text-[#2BAADF] transition-colors">
                    Grupo de Administradores?
                  </span>
                  <span className="text-[10px] text-gray-500 uppercase tracking-tight">
                    Marca automaticamente todas as permissões dos módulos ativos da empresa
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>

        <PermissionsMatrix
          value={permissoes}
          onChange={setPermissoes}
          disabled={isAdmin}
          empresaAddons={empresaAddons}
        />

        <div className="flex items-center justify-between pt-4 border-t border-[#ffffff0a]">
          <div className="flex items-center gap-4">
            {!showDeleteConfirm ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="group flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-red-500/70 hover:text-red-500 hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20"
              >
                <Trash2 className="w-4 h-4" />
                Excluir Grupo
              </button>
            ) : (
              <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2 animate-in fade-in slide-in-from-left-2 transition-all">
                <ShieldAlert className="w-4 h-4 text-red-500" />
                <span className="text-[10px] font-bold uppercase tracking-tight text-red-500">
                  Confirmar exclusão?
                </span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isPending}
                  className="bg-red-500 hover:bg-red-600 text-white text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isPending ? '...' : 'Sim, Excluir'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-gray-400 hover:text-white text-[10px] uppercase tracking-wider font-bold"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="bg-gradient-to-r from-[#2BAADF] to-[#1A8FBF] hover:shadow-[0_4px_24px_rgba(43,170,223,0.35)] disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
          >
            {isPending ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Salvando Alterações...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Salvar Alterações
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
