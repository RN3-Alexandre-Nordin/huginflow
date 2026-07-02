import ChangePasswordForm from './ChangePasswordForm'

export default async function AlterarSenhaPage(props: {
  searchParams: Promise<{ success?: string }>
}) {
  const searchParams = await props.searchParams
  const success = searchParams.success === '1'

  return <ChangePasswordForm success={success} />
}
