import FamiliaForm from '../FamiliaForm'
import { createSkuFamilia } from '../actions'

export const metadata = { title: 'Nova Família de SKU | HuginFlow' }

export default function NovaSkuFamiliaPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-20">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Nova família</h2>
        <p className="mt-1 text-sm text-gray-400">Código estável + nome comercial.</p>
      </div>
      <FamiliaForm
        action={createSkuFamilia}
        cancelHref="/cockpit/cadastros/sku-familias"
        submitLabel="Cadastrar"
      />
    </div>
  )
}
