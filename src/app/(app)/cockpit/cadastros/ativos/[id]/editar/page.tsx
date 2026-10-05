import { Landmark } from 'lucide-react'
import BackButton from '@/components/BackButton'
import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { notFound } from 'next/navigation'
import AtivoForm from '@/components/ativos/AtivoForm'
import { updateAtivo } from '../../actions'
import type { AtivoRecord } from '@/lib/ativos/constants'

export const metadata = { title: 'Editar ativo | HuginFlow' }

export default async function EditarAtivoPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const me = await getMyProfile()
  const supabase = await createClient()
  const isSuper = me?.role_global === 'superadmin'
  const emp = me?.empresa_id ?? ''

  let rowQ = supabase.from('cad_ativos').select('*').eq('id', id)
  if (!isSuper) rowQ = rowQ.eq('empresa_id', emp)
  const { data: row } = await rowQ.maybeSingle()
  if (!row) notFound()

  let skusQ = supabase.from('cad_skus').select('id, codigo, nome').order('codigo')
  let pessoasQ = supabase.from('crm_leads').select('id, nome').order('nome').limit(500)
  let formulasQ = supabase
    .from('cad_ativo_formulas_depreciacao')
    .select('id, codigo, nome')
    .order('codigo')
  let deptQ = supabase.from('departamentos').select('id, nome').order('nome')
  if (!isSuper) {
    skusQ = skusQ.eq('empresa_id', emp)
    pessoasQ = pessoasQ.eq('empresa_id', emp)
    formulasQ = formulasQ.eq('empresa_id', emp)
    deptQ = deptQ.eq('empresa_id', emp)
  }

  const [{ data: skus }, { data: pessoas }, { data: formulas }, { data: departamentos }] =
    await Promise.all([skusQ, pessoasQ, formulasQ, deptQ])

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <BackButton fallbackHref="/cockpit/cadastros/ativos" />
        <div>
          <h2 className="flex items-center gap-3 text-2xl font-bold text-white">
            <Landmark className="h-6 w-6 text-[#2BAADF]" />
            Editar ativo
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            {row.codigo} · {row.nome}
          </p>
        </div>
      </div>
      <AtivoForm
        mode="edit"
        ativo={row as AtivoRecord}
        skus={(skus || []).map((s) => ({ id: s.id, label: `${s.codigo} — ${s.nome}` }))}
        pessoas={(pessoas || []).map((p) => ({ id: p.id, label: p.nome || p.id }))}
        formulas={(formulas || []).map((f) => ({
          id: f.id,
          label: `${f.codigo} — ${f.nome}`,
        }))}
        departamentos={(departamentos || []).map((d) => ({ id: d.id, label: d.nome }))}
        cancelHref="/cockpit/cadastros/ativos"
        submitLabel="Salvar alterações"
        action={(fd) => updateAtivo(id, fd)}
      />
    </div>
  )
}
