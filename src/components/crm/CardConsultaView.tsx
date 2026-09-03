import BackButton from '@/components/BackButton'
import CardConsultaContent from '@/components/crm/CardConsultaContent'
import type { CardConsultaContext } from '@/app/(app)/cockpit/crm/card-consulta-actions'

type Props = {
  data: CardConsultaContext
  returnTo: string
}

export default function CardConsultaView({ data, returnTo }: Props) {
  return (
    <div className="max-w-3xl mx-auto animate-in fade-in duration-500">
      <div className="flex items-center gap-3 mb-6">
        <BackButton fallbackHref={returnTo} />
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#2BAADF] mb-1">
            Consulta de card · somente leitura
          </p>
          <h1 className="text-xl font-bold text-white tracking-tight">{data.card.titulo}</h1>
        </div>
      </div>
      <CardConsultaContent data={data} />
    </div>
  )
}
