import { Metadata } from 'next'
import { createClient } from '@/utils/supabase/server'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import {
  loadFornecedoresEmpresa,
  loadLocalPadraoEmpresa,
} from '@/lib/estoque/cadastros-helpers'
import { ImportXmlForm } from './ImportXmlForm'

export const metadata: Metadata = {
  title: 'Importar XML de NF-e | HuginFlow',
}

export default async function ImportNfeXmlPage() {
  const me = await getMyProfile()
  const supabase = await createClient()
  const empresaId = me?.empresa_id || ''

  const fornecedores = await loadFornecedoresEmpresa(supabase, empresaId)

  const { data: locais } = await supabase
    .from('cad_locais_estoque')
    .select('id, codigo, nome, eh_principal')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .order('eh_principal', { ascending: false })
    .order('codigo')

  const { data: skusIniciais } = await supabase
    .from('cad_skus')
    .select('id, codigo, nome, unidade_estoque')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .eq('controla_estoque', true)
    .order('codigo')
    .limit(80)

  const defaultLocal = await loadLocalPadraoEmpresa(supabase, empresaId, locais || [])

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="border-b border-[#ffffff10] pb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-white tracking-tight">
            Importação de NF-e (XML)
          </h1>
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-[#2BAADF]/10 text-[#2BAADF] border border-[#2BAADF]/20 font-bold">
            Canal C · SEFAZ
          </span>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Upload do XML: fornecedor e SKUs podem ser resolvidos neste fluxo (sem abrir telas
          de cadastro).
        </p>
      </div>

      <ImportXmlForm
        fornecedores={fornecedores}
        locais={locais || []}
        defaultLocalId={defaultLocal?.id}
        skusIniciais={skusIniciais || []}
      />
    </div>
  )
}
