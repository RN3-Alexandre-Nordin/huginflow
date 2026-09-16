'use client'

import { useEffect, useMemo, useState } from 'react'
import { Shield, CheckCircle2, Info } from 'lucide-react'
import {
  ESTOQUE_MATRIX_SECTIONS,
  getGroupsMatrixCategories,
  type PermissionCategory,
  type PermissionModule,
} from '@/constants/permissions'

interface PermissionsMatrixProps {
  value: Record<string, string[]>
  onChange: (value: Record<string, string[]>) => void
  disabled?: boolean
  /** Addons enabled da empresa do grupo (filtra abas/módulos). null = sem filtro. */
  empresaAddons?: Record<string, boolean> | null
}

function countSelected(modules: PermissionModule[], value: Record<string, string[]>) {
  let selected = 0
  let total = 0
  for (const mod of modules) {
    total += mod.actions.length
    const cur = value[mod.slug] || []
    selected += mod.actions.filter((a) => cur.includes(a.slug)).length
  }
  return { selected, total }
}

function ModuleCards({
  modules,
  value,
  disabled,
  onToggle,
  onToggleAllModule,
}: {
  modules: PermissionModule[]
  value: Record<string, string[]>
  disabled?: boolean
  onToggle: (moduleSlug: string, actionSlug: string) => void
  onToggleAllModule: (moduleSlug: string, allActions: string[]) => void
}) {
  if (modules.length === 0) {
    return (
      <p className="text-xs text-gray-500 py-8 text-center">
        Nenhum recurso disponível nesta seção para os addons da empresa.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {modules.map((module) => {
        const currentActions = value[module.slug] || []
        const allActionSlugs = module.actions.map((a) => a.slug)
        const isAllSelected = allActionSlugs.every((a) => currentActions.includes(a))

        return (
          <div
            key={module.slug}
            className="bg-[#0A0A0A] border border-[#ffffff0a] rounded-2xl p-4 hover:border-[#ffffff12] transition-all"
          >
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#ffffff05]">
              <div className="flex items-center gap-3">
                <div
                  className={`w-2 h-2 rounded-full ${
                    currentActions.length > 0 ? 'bg-[#2BAADF]' : 'bg-gray-800'
                  }`}
                />
                <span className="text-sm font-semibold text-white">{module.label}</span>
              </div>
              <button
                type="button"
                onClick={() => onToggleAllModule(module.slug, allActionSlugs)}
                disabled={disabled}
                className={`text-[10px] uppercase font-bold tracking-widest transition-colors ${
                  isAllSelected ? 'text-[#2BAADF]' : 'text-gray-600 hover:text-white'
                } disabled:cursor-not-allowed`}
              >
                {isAllSelected ? 'Desmarcar Tudo' : 'Marcar Tudo'}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {module.actions.map((action) => {
                const isSelected = currentActions.includes(action.slug)
                return (
                  <button
                    key={action.slug}
                    type="button"
                    onClick={() => onToggle(module.slug, action.slug)}
                    disabled={disabled}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-[#2BAADF]/10 border-[#2BAADF]/30 text-[#2BAADF] shadow-[0_0_15px_rgba(43,170,223,0.1)]'
                        : 'bg-[#050505] border-[#ffffff0a] text-gray-500 hover:border-[#ffffff14] hover:text-gray-300'
                    } disabled:cursor-not-allowed`}
                  >
                    <action.icon
                      className={`w-3.5 h-3.5 ${isSelected ? 'text-[#2BAADF]' : 'text-gray-600'}`}
                    />
                    {action.label}
                    {isSelected && <CheckCircle2 className="w-3 h-3 ml-auto text-[#2BAADF]" />}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function PermissionsMatrix({
  value,
  onChange,
  disabled,
  empresaAddons = null,
}: PermissionsMatrixProps) {
  const categories = useMemo(
    () => getGroupsMatrixCategories(empresaAddons),
    [empresaAddons],
  )

  const [categoryId, setCategoryId] = useState(categories[0]?.id || '')
  const [estoqueSection, setEstoqueSection] = useState<(typeof ESTOQUE_MATRIX_SECTIONS)[number]['id']>(
    'hub',
  )

  useEffect(() => {
    if (!categories.some((c) => c.id === categoryId)) {
      setCategoryId(categories[0]?.id || '')
    }
  }, [categories, categoryId])

  const activeCategory: PermissionCategory | undefined = categories.find((c) => c.id === categoryId)

  const togglePermission = (moduleSlug: string, actionSlug: string) => {
    const currentActions = value[moduleSlug] || []
    let newActions: string[]

    if (currentActions.includes(actionSlug)) {
      newActions = currentActions.filter((a) => a !== actionSlug)
    } else {
      newActions = [...currentActions, actionSlug]
    }

    const newValue = { ...value }
    if (newActions.length === 0) {
      delete newValue[moduleSlug]
    } else {
      newValue[moduleSlug] = newActions
    }

    onChange(newValue)
  }

  const toggleAllModule = (moduleSlug: string, allActions: string[]) => {
    const currentActions = value[moduleSlug] || []
    const isAllSelected = allActions.every((a) => currentActions.includes(a))

    const newValue = { ...value }
    if (isAllSelected) {
      delete newValue[moduleSlug]
    } else {
      newValue[moduleSlug] = allActions
    }
    onChange(newValue)
  }

  const toggleAllCategory = (modules: PermissionModule[]) => {
    const allSelected = modules.every((mod) => {
      const allSlugs = mod.actions.map((a) => a.slug)
      const current = value[mod.slug] || []
      return allSlugs.every((s) => current.includes(s))
    })

    const newValue = { ...value }
    if (allSelected) {
      modules.forEach((mod) => delete newValue[mod.slug])
    } else {
      modules.forEach((mod) => {
        newValue[mod.slug] = mod.actions.map((a) => a.slug)
      })
    }
    onChange(newValue)
  }

  const visibleModules =
    activeCategory?.id === 'estoque'
      ? (activeCategory?.modules || []).filter((m) => m.estoqueSection === estoqueSection)
      : activeCategory?.modules || []

  const categoryCounts = activeCategory
    ? countSelected(activeCategory.modules, value)
    : { selected: 0, total: 0 }

  if (categories.length === 0) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
        {empresaAddons == null
          ? 'Carregando módulos liberados para a empresa…'
          : 'Nenhum módulo liberado nos addons desta empresa para configurar permissões.'}
      </div>
    )
  }

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-[#ffffff0a] bg-[#111111] ${
        disabled ? 'opacity-60 pointer-events-none select-none' : ''
      }`}
    >
      <div className="border-b border-[#ffffff0a] bg-[#0A0A0A]/80 px-3 pt-3 pb-2 sm:px-4">
        <div className="mb-2 flex items-center gap-2 px-1">
          <Shield className="h-3.5 w-3.5 text-[#2BAADF]" />
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">
            Matriz por módulo
          </p>
        </div>
        <nav
          className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4"
          role="tablist"
          aria-label="Categorias de permissão"
        >
          {categories.map((item) => {
            const active = item.id === categoryId
            const counts = countSelected(item.modules, value)
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategoryId(item.id)}
                className={`rounded-xl px-2.5 py-2.5 text-left transition-all border ${
                  active
                    ? 'bg-gradient-to-r from-[#2BAADF]/20 to-[#2BAADF]/5 text-[#2BAADF] border-[#2BAADF]/25'
                    : 'text-gray-400 hover:bg-[#ffffff08] hover:text-white border-transparent'
                }`}
              >
                <span className="block text-sm font-semibold tracking-tight leading-tight">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-[10px] leading-snug text-gray-500 line-clamp-2">
                  {item.hint}
                </span>
                <span className="mt-1 block text-[10px] font-mono text-gray-600">
                  {counts.selected}/{counts.total}
                </span>
              </button>
            )
          })}
        </nav>
      </div>

      {activeCategory && (
        <>
          <div className="border-b border-[#ffffff08] px-5 py-3.5 sm:px-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-white">{activeCategory.label}</h3>
              <p className="text-xs text-gray-500">{activeCategory.hint}</p>
            </div>
            <button
              type="button"
              onClick={() => toggleAllCategory(activeCategory.modules)}
              disabled={disabled}
              className="text-[10px] uppercase font-bold tracking-widest text-gray-500 hover:text-[#2BAADF] transition-colors disabled:cursor-not-allowed"
            >
              {categoryCounts.selected === categoryCounts.total && categoryCounts.total > 0
                ? 'Desmarcar aba'
                : 'Marcar toda a aba'}
            </button>
          </div>

          {activeCategory.id === 'estoque' && (
            <div className="border-b border-[#ffffff08] px-4 pt-3 pb-2">
              <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-widest text-gray-600">
                Seções do Estoque
              </p>
              <nav className="grid grid-cols-2 gap-1.5 lg:grid-cols-4" role="tablist">
                {ESTOQUE_MATRIX_SECTIONS.map((sec) => {
                  const active = sec.id === estoqueSection
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setEstoqueSection(sec.id)}
                      className={`rounded-xl px-2.5 py-2 text-left transition-all border ${
                        active
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : 'border-transparent text-gray-400 hover:bg-[#ffffff08]'
                      }`}
                    >
                      <span className="block text-xs font-semibold">{sec.label}</span>
                      <span className="mt-0.5 block text-[10px] text-gray-500 line-clamp-2">
                        {sec.hint}
                      </span>
                    </button>
                  )
                })}
              </nav>
              {estoqueSection === 'requisicoes' && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#ffffff0a] bg-[#0A0A0A] px-3 py-2.5 text-[11px] text-gray-400">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2BAADF]" />
                  <span>
                    Quem <strong className="text-gray-200">aprova</strong> requisições é definido em{' '}
                    <strong className="text-gray-200">Estoque → Configuração</strong> (aprovador),
                    não nesta matriz.
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="min-h-[16rem] p-5 sm:p-6">
            <ModuleCards
              modules={visibleModules}
              value={value}
              disabled={disabled}
              onToggle={togglePermission}
              onToggleAllModule={toggleAllModule}
            />
          </div>
        </>
      )}
    </div>
  )
}
