import LoginForm from './LoginForm'

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string }>
}) {
  const searchParams = await props.searchParams
  const errorMsg = searchParams.error ?? null

  return (
    <main className="min-h-screen flex overflow-hidden" style={{ background: 'var(--background)' }}>
      <div
        className="hidden lg:flex flex-col justify-between w-[55%] relative overflow-hidden p-12"
        style={{ background: 'linear-gradient(135deg, #0C0C0C 0%, #111827 40%, #0C1A2E 100%)' }}
      >
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(#2BAADF 1px, transparent 1px), linear-gradient(90deg, #2BAADF 1px, transparent 1px)',
            backgroundSize: '50px 50px',
          }}
        />
        <div className="relative z-10">
          <img
            src="/logo-principal.png?v=20260824b"
            alt="Hugin Flow"
            className="h-28 w-auto max-w-[min(100%,520px)] object-contain bg-transparent"
          />
        </div>
        <div className="relative z-10 flex flex-col gap-8">
          <div>
            <h1 className="text-5xl xl:text-6xl font-black leading-tight mb-4" style={{ color: '#F5F5F5' }}>
              Workflows
              <br />
              <span
                style={{
                  background: 'linear-gradient(90deg, #2BAADF, #80B828)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                inteligentes
              </span>
            </h1>
            <p className="text-lg leading-relaxed max-w-md" style={{ color: 'rgba(245,245,245,0.55)' }}>
              Orquestre CRM, atendimento e processos em um só lugar.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12 lg:px-16 relative" style={{ background: '#0F0F0F' }}>
        <LoginForm errorMsg={errorMsg} />
      </div>
    </main>
  )
}
