import ChangePasswordForm from './ChangePasswordForm'

export default async function AlterarSenhaPage(props: {
  searchParams: Promise<{ success?: string; required?: string }>
}) {
  const searchParams = await props.searchParams
  const success = searchParams.success === '1'
  const required = searchParams.required === '1'

  return <ChangePasswordForm success={success} required={required} />
}
