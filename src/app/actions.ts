'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { PASSWORD_CHANGE_PATH } from '@/lib/auth/password-change'
import { fetchUsuarioLoginProfile } from '@/lib/auth/usuario-profile'
import { createClient } from '@/utils/supabase/server'

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const supabase = await createClient()

  const { error, data } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    const message =
      error.message === 'Invalid login credentials'
        ? 'E-mail ou senha incorretos.'
        : error.message
    redirect('/login?error=' + encodeURIComponent(message))
  }

  // Verificar se a empresa do usuário está ativa
  const userId = data.session?.user?.id
  if (userId) {
    const usuarioData = await fetchUsuarioLoginProfile(supabase, userId)

    if (usuarioData?.empresa_id) {
      const { data: empresaData } = await supabase
        .from('empresas')
        .select('ativo')
        .eq('id', usuarioData.empresa_id)
        .single()

      if (empresaData && !empresaData.ativo) {
        // Empresa inativa — desconectar e alertar
        await supabase.auth.signOut()
        redirect('/login?error=' + encodeURIComponent('Acesso suspenso. Entre em contato com a RN3.'))
      }
    }

    if (usuarioData?.must_change_password) {
      revalidatePath('/cockpit', 'layout')
      redirect(`${PASSWORD_CHANGE_PATH}?required=1`)
    }
  }

  revalidatePath('/cockpit', 'layout')
  redirect('/cockpit')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}

export async function changeMyPassword(formData: FormData) {
  const senha_atual = (formData.get('senha_atual') as string)?.trim() ?? ''
  const nova_senha = (formData.get('nova_senha') as string)?.trim() ?? ''
  const confirmar_senha = (formData.get('confirmar_senha') as string)?.trim() ?? ''

  if (!senha_atual || !nova_senha || !confirmar_senha) {
    return { error: 'Preencha todos os campos.' }
  }
  if (nova_senha !== confirmar_senha) {
    return { error: 'A nova senha e a confirmação devem ser iguais.' }
  }
  if (nova_senha.length < 6) {
    return { error: 'A nova senha deve ter no mínimo 6 caracteres.' }
  }
  if (senha_atual === nova_senha) {
    return { error: 'A nova senha deve ser diferente da senha atual.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email) {
    return { error: 'Sessão inválida. Faça login novamente.' }
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: senha_atual,
  })

  if (verifyError) {
    return { error: 'Senha atual incorreta.' }
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: nova_senha })

  if (updateError) {
    return { error: updateError.message }
  }

  const { data: usuarioRow } = await supabase
    .from('usuarios')
    .select('id, empresa_id')
    .eq('auth_user_id', user.id)
    .single()

  if (usuarioRow) {
    const { error: profileError } = await supabase
      .from('usuarios')
      .update({ must_change_password: false })
      .eq('id', usuarioRow.id)
      .eq('empresa_id', usuarioRow.empresa_id)

    if (profileError) {
      console.error('Erro ao limpar must_change_password:', profileError)
    }
  }

  revalidatePath('/cockpit', 'layout')

  const wasRequired = formData.get('required') === '1'
  if (wasRequired) {
    redirect('/cockpit?passwordChanged=1')
  }

  redirect('/cockpit/minha-conta/senha?success=1')
}
