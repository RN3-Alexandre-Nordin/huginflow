import { Boxes } from 'lucide-react'

/** Home quando a empresa não tem workflow nem omni habilitados. */
export default function PlatformEmptyState({ empresaNome }: { empresaNome?: string | null }) {
  return (
    <div
      data-testid="platform-empty-addons"
      className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6"
    >
      <div className="w-16 h-16 rounded-2xl bg-[#2BAADF]/10 border border-[#2BAADF]/25 flex items-center justify-center mb-6">
        <Boxes className="w-8 h-8 text-[#2BAADF]" />
      </div>
      <h2 className="text-2xl font-bold text-white tracking-tight mb-2">
        Plataforma sem módulos operacionais
      </h2>
      <p className="text-gray-400 max-w-md leading-relaxed">
        {empresaNome ? (
          <>
            <span className="text-white font-medium">{empresaNome}</span> ainda não tem
            Workflow ou Omni habilitados.
          </>
        ) : (
          <>Sua empresa ainda não tem Workflow ou Omni habilitados.</>
        )}{' '}
        Os cadastros da plataforma continuam disponíveis no menu. Peça à RN3 para ligar os
        addons desejados.
      </p>
    </div>
  )
}
