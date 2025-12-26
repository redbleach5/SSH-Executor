import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import Workspace from './pages/Workspace'
import AuditLogs from './pages/AuditLogs'
import Settings from './pages/Settings'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import ConfirmDialog from './components/ConfirmDialog'
import { useSettings } from './utils/useSettings'
import { startSessionTimer, stopSessionTimer, resetSessionTimer } from './utils/sessionTimer'
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/tauri'
import { loadSettings } from './utils/settings'

// App component - main application entry point

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function AppContent() {
  const settings = useSettings()
  const [showSessionTimeoutDialog, setShowSessionTimeoutDialog] = useState(false)

  // Инициализация AudioContext при первом взаимодействии пользователя
  useEffect(() => {
    const initAudio = () => {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext
        if (AudioContext) {
          const ctx = new AudioContext()
          // Создаем короткий беззвучный сигнал для активации AudioContext
          const oscillator = ctx.createOscillator()
          const gainNode = ctx.createGain()
          gainNode.gain.value = 0
          oscillator.connect(gainNode)
          gainNode.connect(ctx.destination)
          oscillator.start()
          oscillator.stop(ctx.currentTime + 0.001)
        }
      } catch (e) {
        // Игнорируем ошибки
      }
    }

    // Инициализируем при первом клике или нажатии клавиши
    const events = ['click', 'keydown', 'touchstart']
    const handlers = events.map(event => {
      const handler = () => {
        initAudio()
        events.forEach(e => document.removeEventListener(e, handler))
      }
      document.addEventListener(event, handler, { once: true })
      return handler
    })

    return () => {
      events.forEach((event, i) => {
        document.removeEventListener(event, handlers[i])
      })
    }
  }, [])

  // Обработка минимизации в трей
  useEffect(() => {
    if (!settings.general.minimizeToTray) return

    // Обработка минимизации через событие blur (когда окно теряет фокус при минимизации)
    const handleBlur = () => {
      // Проверяем, минимизировано ли окно
      if (document.hidden) {
        // Окно скрыто, можно скрыть в трей если нужно
        // Но это будет обработано в Rust через window events
      }
    }

    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('blur', handleBlur)
    }
  }, [settings.general.minimizeToTray])

  // Синхронизация настроек аудита с Rust при загрузке
  useEffect(() => {
    const syncAuditSettings = async () => {
      const currentSettings = loadSettings()
      try {
        await invoke('update_audit_settings', {
          logLevel: currentSettings.audit.logLevel,
          retentionDays: currentSettings.audit.retentionDays,
          autoRotate: currentSettings.audit.autoRotate,
          maxLogFileSize: currentSettings.audit.maxLogFileSize,
          logFormat: currentSettings.audit.logFormat,
          enableAudit: currentSettings.security.enableAudit,
        })
      } catch (error) {
        console.error('Ошибка синхронизации настроек аудита:', error)
      }
    }
    syncAuditSettings()
  }, [])

  // Синхронизация настройки closeToTray с Rust
  useEffect(() => {
    const syncCloseToTray = async () => {
      try {
        await invoke('set_close_to_tray', { enabled: settings.general.closeToTray ?? false })
      } catch (error) {
        console.error('Ошибка синхронизации настройки closeToTray:', error)
      }
    }
    syncCloseToTray()
  }, [settings.general.closeToTray])

  // Управление таймером сессии
  useEffect(() => {
    if (settings.security.autoLogout && settings.security.sessionTimeout > 0) {
      const handleTimeout = () => {
        setShowSessionTimeoutDialog(true)
      }
      
      startSessionTimer(handleTimeout)
      
      return () => {
        stopSessionTimer()
      }
    } else {
      stopSessionTimer()
    }
  }, [settings.security.autoLogout, settings.security.sessionTimeout])

  const handleSessionTimeoutConfirm = async () => {
    setShowSessionTimeoutDialog(false)
    try {
      // Используем Tauri v1 API для закрытия окна
      const { appWindow } = await import('@tauri-apps/api/window')
      await appWindow.close()
    } catch (error) {
      // Fallback для веб-режима (window.close не работает для не-popup окон)
      console.debug('Tauri API недоступен, пробуем window.close:', error)
      try {
        window.close()
      } catch {
        // Игнорируем ошибки в веб-режиме
      }
    }
  }

  const handleSessionTimeoutCancel = () => {
    setShowSessionTimeoutDialog(false)
    // Сбрасываем таймер, если пользователь решил остаться
    resetSessionTimer()
  }
  
  return (
    <>
      <Router>
        <Layout>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Navigate to="/workspace" replace />} />
              <Route path="/workspace" element={<Workspace />} />
              <Route path="/hosts" element={<Navigate to="/workspace?tab=hosts" replace />} />
              <Route path="/commands" element={<Navigate to="/workspace?tab=commands" replace />} />
              <Route path="/batch" element={<Navigate to="/workspace?tab=commands&mode=batch" replace />} />
              <Route path="/audit" element={<AuditLogs />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </ErrorBoundary>
        </Layout>
      </Router>
      <Toaster 
        position={settings.notifications.position} 
        toastOptions={{
          duration: settings.notifications.duration,
        }}
      />
      <ConfirmDialog
        isOpen={showSessionTimeoutDialog}
        title="Сессия истекла"
        message="Сессия истекла из-за неактивности. Закрыть приложение?"
        confirmText="Закрыть"
        cancelText="Остаться"
        type="warning"
        onConfirm={handleSessionTimeoutConfirm}
        onCancel={handleSessionTimeoutCancel}
      />
    </>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  )
}

export default App
