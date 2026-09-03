import { notFound, redirect } from 'next/navigation'
import CardConsultaView from '@/components/crm/CardConsultaView'
import { getCardConsultaContext } from '@/app/(app)/cockpit/crm/card-consulta-actions'
import { sanitizeReturnTo } from '@/lib/navigation/goBack'

export const metadata = { title: 'Consulta de Card | HuginFlow CRM' }

export default async function CardConsultaPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ returnTo?: string }>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const returnTo = sanitizeReturnTo(searchParams.returnTo) ?? '/cockpit/crm/chat'

  const res = await getCardConsultaContext(params.id)

  if (res.error === 'UNAUTHENTICATED') {
    redirect('/login')
  }
  if (res.error === 'FORBIDDEN') {
    redirect('/cockpit/acesso-negado')
  }
  if (res.error === 'NOT_FOUND') {
    notFound()
  }
  if (res.error) {
    throw new Error('message' in res ? res.message : 'Erro ao carregar card')
  }

  return <CardConsultaView data={res.data} returnTo={returnTo} />
}
