'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { logout } from '@/app/actions'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import GlobalChatSidebar from '@/components/chat/GlobalChatSidebar'
import { CockpitRealtimeProvider } from '@/contexts/CockpitRealtimeContext'
import { ChannelConnectionAlertProvider } from '@/contexts/ChannelConnectionAlertContext'
import CockpitSidebarNav from './CockpitSidebarNav'
import type { CockpitNavPermissions } from '@/utils/cockpit-nav-permissions'
import CockpitUserMenu from './_components/CockpitUserMenu'
import CockpitHelpButton from '@/components/CockpitHelpButton'
import { Menu, X } from 'lucide-react'
import styles from './CockpitShell.module.css'

const SIDEBAR_STORAGE_KEY = 'cockpit-sidebar-open'
const DESKTOP_BREAKPOINT = 1024

type Props = {
  children: React.ReactNode
  userId: string
  userName: string
  userEmail: string
  userInitials: string
  mustChangePassword: boolean
  isSuperAdmin: boolean
  isAdminOrSuperAdmin: boolean
  navPermissions?: CockpitNavPermissions
  empresaId?: string
}

function isDesktopViewport() {
  return typeof window !== 'undefined' && window.innerWidth >= DESKTOP_BREAKPOINT
}

export default function CockpitShell({
  children,
  userId,
  userName,
  userEmail,
  userInitials,
  mustChangePassword,
  isSuperAdmin,
  isAdminOrSuperAdmin,
  navPermissions = {},
  empresaId,
}: Props) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`)
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY)
    if (stored === 'true' || stored === 'false') {
      setSidebarOpen(stored === 'true')
    } else {
      setSidebarOpen(mq.matches)
    }
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarOpen))
  }, [sidebarOpen, ready])

  useEffect(() => {
    if (!ready || isDesktopViewport()) return
    setSidebarOpen(false)
  }, [pathname, ready])

  useEffect(() => {
    if (!ready || !sidebarOpen || isDesktopViewport()) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [sidebarOpen, ready])

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((open) => !open)
  }, [])

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false)
  }, [])

  return (
    <CockpitRealtimeProvider userId={userId} userName={userName} empresaId={empresaId}>
      <ChannelConnectionAlertProvider
        empresaId={empresaId}
        isAdminOrSuperAdmin={isAdminOrSuperAdmin}
      >
      <div className="h-screen w-full overflow-hidden bg-[#0A0A0A] font-sans font-medium text-gray-100">
        <div
          role="presentation"
          className={`${styles.overlay} ${sidebarOpen ? styles.overlayVisible : ''}`}
          onClick={closeSidebar}
        />

        <div
          className={`${styles.shell} ${sidebarOpen ? '' : styles.shellClosed}`}
          data-testid="cockpit-shell"
        >
          <aside
            data-testid="cockpit-sidebar"
            className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}
          >
            <div className={styles.sidebarInner}>
              <div className="flex min-h-[5.25rem] items-center justify-between gap-2 border-b border-[#ffffff0a] px-3 py-3">
                <img
                  src="/logo-sidebar.png?v=20260824b"
                  alt="Hugin Flow"
                  className="h-auto max-h-[4.25rem] w-full object-contain object-left"
                />
                <button
                  type="button"
                  onClick={closeSidebar}
                  className={`${styles.sidebarClose} shrink-0 rounded-lg p-2 text-gray-500 hover:bg-[#ffffff08] hover:text-white`}
                  aria-label="Fechar menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <CockpitSidebarNav
                isSuperAdmin={isSuperAdmin}
                isAdminOrSuperAdmin={isAdminOrSuperAdmin}
                navPermissions={navPermissions}
                disabled={mustChangePassword}
                onNavigate={() => {
                  if (!isDesktopViewport()) closeSidebar()
                }}
              />

              <div className="border-t border-[#ffffff0a] p-4">
                <CockpitUserMenu
                  userName={userName}
                  userEmail={userEmail}
                  userInitials={userInitials}
                  menuDisabled={mustChangePassword}
                />
              </div>
            </div>
          </aside>

          <main data-testid="cockpit-main" className={styles.main}>
            <div
              className="pointer-events-none absolute top-[-20%] right-[-10%] h-[500px] w-[500px] rounded-full opacity-[0.03]"
              style={{
                background: 'radial-gradient(circle, #f97316 0%, transparent 70%)',
                filter: 'blur(60px)',
              }}
            />

            <header className="sticky top-0 z-30 flex h-20 shrink-0 items-center justify-between overflow-visible border-b border-[#ffffff0a] bg-[#0A0A0A]/50 px-4 backdrop-blur-md sm:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className="relative z-50 shrink-0 rounded-xl border border-[#ffffff10] bg-[#ffffff05] p-2.5 text-gray-400 transition-colors hover:bg-[#ffffff10] hover:text-white"
                  aria-label={sidebarOpen ? 'Recolher menu' : 'Abrir menu'}
                  aria-expanded={sidebarOpen}
                  data-testid="cockpit-sidebar-toggle"
                >
                  {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
                <h1 className="truncate text-base font-bold tracking-tight text-white/90 uppercase italic sm:text-xl">
                  Cockpit de Operações
                </h1>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                {!mustChangePassword && <CockpitHelpButton />}
                <LanguageSwitcher />
                <div className="h-5 w-px bg-[#ffffff1a]" />
                <form action={logout}>
                  <button
                    type="submit"
                    className="cursor-pointer text-sm font-bold text-[9px] tracking-widest text-red-400/80 uppercase transition-colors hover:text-red-400"
                  >
                    Encerrar Sessão
                  </button>
                </form>
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-8">{children}</div>

            {!mustChangePassword && (
              <GlobalChatSidebar userId={userId} userName={userName} empresaId={empresaId ?? ''} />
            )}
          </main>
        </div>
      </div>
      </ChannelConnectionAlertProvider>
    </CockpitRealtimeProvider>
  )
}
