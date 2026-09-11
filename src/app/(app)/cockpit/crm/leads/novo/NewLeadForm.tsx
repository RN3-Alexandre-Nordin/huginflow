'use client'

import PessoaForm from '@/components/pessoas/PessoaForm'
import { createLead } from '../actions'

export default function NewLeadForm({
  canais,
  linkCardId,
  cancelHref = '/cockpit/crm/leads',
  defaultNome = '',
}: {
  canais: { id: string; nome: string }[] | null
  linkCardId?: string | null
  cancelHref?: string
  defaultNome?: string
}) {
  return (
    <PessoaForm
      mode="create"
      pessoa={{ nome: defaultNome, papeis: ['lead'], natureza: 'pf' }}
      canais={canais}
      cancelHref={cancelHref}
      linkCardId={linkCardId}
      submitLabel={linkCardId ? 'Cadastrar e voltar ao card' : 'Cadastrar pessoa'}
      action={createLead}
    />
  )
}
