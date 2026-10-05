import { Landmark } from 'lucide-react'
import BackButton from '@/components/BackButton'
import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import AtivoForm from '@/components/ativos/AtivoForm'
import { createAtivo } from '../actions'

export const metadata = { title: 'Novo ativo | HuginFlow' }

async function loadOpts(empresaId: string | null | undefined, isSuper: boolean) {
  const supabase = await createClient()
  let skusQ = supabase.from('cad_skus').select('id, codigo, nome').eq('ativo', true).order('codigo')
  let pessoasQ = supabase.from('crm_leads').select('id, nome').order('nome').limit(500)
  let formulasQ = supabase
    .from('cad_ativo_formulas_depreciacao')
    .select('id, codigo, nome')
    .eq('ativo', true)
    .order('codigo')
  let deptQ = supabase.from('departamentos').select('id, nome').order('nome')

  if (!isSuper) {
    const emp = empresaId ?? ''
    skusQ = skusQ.eq('empresa_id', emp)
    pessoasQ = pessoasQ.eq('empresa_id', emp)
    formulasQ = formulasQ.eq('empresa_id', emp)
    deptQ = deptQ.eq('empresa_id', emp)
  }

  const [{ data: skus }, { data: pessoas }, { data: formulas }, { data: departamentos }] =
    await Promise.all([skusQ, pessoasQ, formulasQ, deptQ])

  return {
    skus: (skus || []).map((s) => ({ id: s.id, label: `${s.codigo} — ${s.nome}` })),
    pessoas: (pessoas || []).map((p) => ({ id: p.id, label: p.nome || p.id })),
    formulas: (formulas || []).map((f) => ({ id: f.id, label: `${f.codigo} — ${f.nome}` })),
    departamentos: (departamentos || []).map((d) => ({ id: d.id, label: d.nome })),
  }
}

export default async function NovoAtivoPage() {
  const me = await getMyProfile()
  const opts = await loadOpts(me?.empresa_id, me?.role_global === 'superadmin')

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <BackButton fallbackHref="/cockpit/cadastros/ativos" />
        <div>
          <h2 className="flex items-center gap-3 text-2xl font-bold text-white">
            <Landmark className="h-6 w-6 text-[#2BAADF]" />
            Novo ativo
          </h2>
          <p className="mt-1 text-sm text-gray-400">Cadastro patrimonial com vínculo à fórmula de depreciação.</p>
        </div>
      </div>
      <AtivoForm
        mode="create"
        skus={opts.skus}
        pessoas={opts.pessoas}
        formulas={opts.formulas}
        departamentos={opts.departamentos}
        cancelHref="/cockpit/cadastros/ativos"
        submitLabel="Cadastrar ativo"
        action={createAtivo}
      />
    </div>
  )
}
