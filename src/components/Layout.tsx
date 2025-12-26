import { ReactNode, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import clsx from 'clsx'
import { useSettings } from '../utils/useSettings'
import { applyDensity } from '../utils/density'
import DebugConsole from './DebugConsole'
import {
  TerminalIcon,
  FileTextIcon,
  SettingsIcon,
  MenuIcon,
  ChevronRightIcon
} from './icons'

interface LayoutProps {
  children: ReactNode
}

const navigation = [
  { name: 'Рабочая область', href: '/workspace', icon: TerminalIcon },
  { name: 'Журнал аудита', href: '/audit', icon: FileTextIcon },
  { name: 'Настройки', href: '/settings', icon: SettingsIcon },
]

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const settings = useSettings()
  
  // Состояние sidebar: загружаем из localStorage или используем значение по умолчанию из настроек
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('ssh-executor-sidebar-open')
    if (saved !== null) {
      return saved === 'true'
    }
    return settings.interface.showSidebarByDefault
  })

  // Сохраняем состояние sidebar в localStorage при изменении
  useEffect(() => {
    localStorage.setItem('ssh-executor-sidebar-open', String(sidebarOpen))
  }, [sidebarOpen])

  // Apply theme
  useEffect(() => {
    const root = document.documentElement
    if (settings.interface.theme === 'dark') {
      root.classList.add('dark')
    } else if (settings.interface.theme === 'light') {
      root.classList.remove('dark')
    } else {
      // Auto theme - use system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      if (prefersDark) {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    }
  }, [settings.interface.theme])

  // Apply font size (учитывает плотность через CSS переменную)
  useEffect(() => {
    const root = document.documentElement
    const fontSizeMap = {
      small: 14,
      medium: 15,
      large: 16,
    }
    const baseSize = fontSizeMap[settings.interface.fontSize]
    // Устанавливаем базовый размер шрифта как CSS переменную в px
    root.style.setProperty('--base-font-size', `${baseSize}px`)
    // Устанавливаем размер шрифта для html элемента (это базовый размер для rem)
    root.style.fontSize = `${baseSize}px`
    // Также устанавливаем размер шрифта для body с учетом плотности
    const densityScale = settings.interface.density === 'compact' ? 0.85 : settings.interface.density === 'comfortable' ? 1 : 1.15
    document.body.style.fontSize = `${baseSize * densityScale}px`
  }, [settings.interface.fontSize, settings.interface.density])

  // Apply density
  useEffect(() => {
    applyDensity(settings.interface.density)
  }, [settings.interface.density])

  // Apply animations
  useEffect(() => {
    const body = document.body
    if (!settings.interface.animationsEnabled) {
      body.classList.add('no-animations')
    } else {
      body.classList.remove('no-animations')
    }
  }, [settings.interface.animationsEnabled])

  return (
    <div className="flex h-screen" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* Sidebar */}
      <aside
        className={clsx(
          'border-r transition-all duration-300',
          sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
        )}
        style={{ 
          backgroundColor: 'var(--bg-sidebar)',
          borderColor: 'var(--border-secondary)'
        }}
      >
        <div className="flex flex-col h-full">
          <div 
            className="flex items-center justify-between p-3 border-b transition-colors"
            style={{ borderColor: 'var(--border-secondary)' }}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-1.5 rounded-lg transition-colors flex items-center justify-center"
                style={{ 
                  color: 'var(--text-secondary)',
                  backgroundColor: 'transparent'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <MenuIcon className="w-4 h-4" />
              </button>
              <div 
                className="w-9 h-9 rounded-button border flex items-center justify-center"
                style={{ 
                  backgroundColor: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-primary)'
                }}
              >
                <TerminalIcon className="w-5 h-5" style={{ color: 'var(--text-primary)' }} />
              </div>
              <div>
                <h1 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                  SSH Executor
                </h1>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Управление SSH</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 p-1.5 space-y-0.5 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.href || 
                (item.href === '/workspace' && (location.pathname === '/hosts' || location.pathname === '/commands' || location.pathname === '/batch'))
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={clsx(
                    'flex items-center gap-2.5 px-3 py-2 rounded-button transition-all duration-150 group relative border',
                    isActive ? 'shadow-sm' : ''
                  )}
                  style={{
                    backgroundColor: isActive ? 'var(--bg-active)' : 'transparent',
                    borderColor: isActive ? 'var(--border-primary)' : 'transparent',
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }
                  }}
                >
                  <Icon 
                    className="w-4 h-4 transition-transform flex-shrink-0"
                    style={{ 
                      color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)'
                    }}
                  />
                  <span className="font-medium text-sm flex-1">
                    {item.name}
                  </span>
                  {isActive && (
                    <span style={{ color: 'var(--text-tertiary)' }}>
                      <ChevronRightIcon className="w-3.5 h-3.5 flex-shrink-0" />
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        {/* Show menu button when sidebar is hidden */}
        {!sidebarOpen && (
          <div className="p-3 border-b" style={{ borderColor: 'var(--border-secondary)', backgroundColor: 'var(--bg-primary)' }}>
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-button transition-colors flex items-center gap-2"
              style={{ 
                color: 'var(--text-secondary)',
                backgroundColor: 'transparent',
                border: '1px solid var(--border-primary)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <MenuIcon className="w-4 h-4" />
              <span className="text-sm font-medium">Показать меню</span>
            </button>
          </div>
        )}
        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-3" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          {children}
        </main>
      </div>
      
      {/* Debug Console */}
      <DebugConsole enabled={settings.interface.showDebugConsole} />
    </div>
  )
}
