export interface HostEntry {
  ip: string
  port?: number
  hostname?: string
  metadata: Record<string, string>
  group?: string // Группа хоста
  color?: string // Цвет для маркировки
  tags?: string[] // Теги хоста
}

export interface SshConfig {
  host: string
  port: number
  username: string
  auth_method: 'password' | 'key' | 'ppk'
  password?: string
  key_path?: string
  ppk_path?: string // Путь к PPK ключу PuTTY
  passphrase?: string
  timeout: number
}

export interface CommandResult {
  stdout: string
  stderr: string
  exit_status: number
  host: string
  vehicle_id?: string
  timestamp?: string // ISO timestamp для очистки старых результатов
  command?: string // Выполненная команда (для экспорта)
}

export interface BatchCommandResult {
  result: CommandResult | null
  error: string | null
  host: string
  timestamp?: string // ISO timestamp для очистки старых результатов
}

export interface AuditLog {
  timestamp: string
  level: string
  action: string
  details: string
  user?: string
}

// Экспорт типа настроек для использования в других частях приложения
export type { AppSettings } from '../utils/settings'
