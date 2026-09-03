/** Credenciais e URL — só tenant de teste em DEV. */

export function getBaseUrl() {
  return (
    process.env.TEST_BASE_URL ||
    process.env.MANUAL_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  )
}

export function getTestEmail() {
  return (
    process.env.TEST_EMAIL ||
    process.env.MANUAL_EMAIL ||
    'admin@montesinaiatacado.com.br'
  )
}

export function getTestPassword() {
  const email = getTestEmail()
  return (
    process.env.TEST_PASSWORD ||
    process.env.MANUAL_PASSWORD ||
    (email.includes('montesinai') ? 'hugin123@2026' : 'HuginDevTest1!')
  )
}
