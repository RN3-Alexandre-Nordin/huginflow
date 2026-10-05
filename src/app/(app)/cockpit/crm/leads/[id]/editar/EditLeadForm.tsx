'use client'

import PessoaForm from '@/components/pessoas/PessoaForm'
import { updateLead } from '../../actions'
import type { PessoaRecord } from '@/lib/pessoas/constants'

export default function EditLeadForm({
  lead,
  canais,
}: {
  lead: PessoaRecord & { id: string }
  canais: { id: string; nome: string }[] | null
}) {
  return (
    <PessoaForm
      mode="edit"
      pessoa={lead}
      canais={canais}
      cancelHref="/cockpit/crm/leads"
      submitLabel="Salvar alterações"
      action={(formData) => updateLead(lead.id, formData)}
    />
  )
}
