export function validateIp(ip: string): boolean {
  // Базовая проверка формата
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/
  if (!ipRegex.test(ip)) return false
  
  const parts = ip.split('.')
  
  return parts.every(part => {
    // Проверка на ведущие нули (001, 01 и т.д.) - недопустимо
    // "0" валидно, но "00", "01", "001" - нет
    if (part.length > 1 && part.startsWith('0')) {
      return false
    }
    
    const num = Number(part)
    return num >= 0 && num <= 255
  })
}

export function validatePort(port: number): boolean {
  return port > 0 && port <= 65535
}

export function validateHostname(hostname: string): boolean {
  if (hostname.length === 0 || hostname.length > 253) return false
  const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
  return hostnameRegex.test(hostname)
}

export function validateSshConfig(config: {
  host: string
  port: number
  username: string
  auth_method: string
  password?: string
  key_path?: string
  ppk_path?: string
  passwordMinLength?: number
}): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!config.host || config.host === 'batch') {
    // Для batch режима хост не требуется
  } else if (!validateIp(config.host) && !validateHostname(config.host)) {
    errors.push('Неверный формат хоста или IP-адреса')
  }

  if (!validatePort(config.port)) {
    errors.push('Неверный порт (должен быть от 1 до 65535)')
  }

  if (!config.username || config.username.trim().length === 0) {
    errors.push('Имя пользователя не указано')
  }

  if (config.auth_method === 'password') {
    if (!config.password) {
      errors.push('Пароль не указан')
    } else if (config.passwordMinLength && config.password.length < config.passwordMinLength) {
      errors.push(`Пароль должен содержать минимум ${config.passwordMinLength} символов`)
    }
  }

  if (config.auth_method === 'key') {
    if (!config.key_path || config.key_path.trim().length === 0) {
      errors.push('Выбран метод аутентификации по ключу, но путь к ключу не указан')
    }
  }

  if (config.auth_method === 'ppk') {
    if (!config.ppk_path || config.ppk_path.trim().length === 0) {
      errors.push('Выбран метод аутентификации по PPK ключу, но путь к ключу не указан')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// Валидация данных из localStorage
export function safeJsonParse<T>(jsonString: string | null, fallback: T, validator?: (data: any) => data is T): T {
  if (!jsonString) {
    return fallback
  }

  try {
    const parsed = JSON.parse(jsonString)
    
    // Если передан валидатор, проверяем данные
    if (validator) {
      if (validator(parsed)) {
        return parsed
      } else {
        // Откладываем console.warn чтобы не вызывать setState во время рендеринга
        queueMicrotask(() => {
          console.warn('Данные не прошли валидацию, используется значение по умолчанию')
        })
        return fallback
      }
    }
    
    return parsed as T
  } catch (error) {
    // Откладываем console.error чтобы не вызывать setState во время рендеринга
    queueMicrotask(() => {
      console.error('Ошибка парсинга JSON:', error)
    })
    return fallback
  }
}

// Валидаторы для типов данных
export function isValidHostEntry(data: any): data is import('../types').HostEntry {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.ip === 'string' &&
    data.ip.length > 0 &&
    (data.port === undefined || (typeof data.port === 'number' && data.port > 0 && data.port <= 65535)) &&
    (data.hostname === undefined || typeof data.hostname === 'string') &&
    (data.metadata === undefined || typeof data.metadata === 'object') &&
    (data.group === undefined || typeof data.group === 'string') &&
    (data.color === undefined || typeof data.color === 'string') &&
    (data.tags === undefined || Array.isArray(data.tags))
  )
}

export function isValidHostEntryArray(data: any): data is import('../types').HostEntry[] {
  return Array.isArray(data) && data.every(isValidHostEntry)
}

export function isValidCommandResult(data: any): data is import('../types').CommandResult {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.stdout === 'string' &&
    typeof data.stderr === 'string' &&
    typeof data.exit_status === 'number' &&
    typeof data.host === 'string' &&
    (data.vehicle_id === undefined || typeof data.vehicle_id === 'string') &&
    (data.timestamp === undefined || typeof data.timestamp === 'string')
  )
}

export function isValidCommandResultArray(data: any): data is import('../types').CommandResult[] {
  return Array.isArray(data) && data.every(isValidCommandResult)
}

export function isValidBatchCommandResult(data: any): data is import('../types').BatchCommandResult {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.host === 'string' &&
    (data.result === null || isValidCommandResult(data.result)) &&
    (data.error === null || typeof data.error === 'string') &&
    (data.timestamp === undefined || typeof data.timestamp === 'string')
  )
}

export function isValidBatchCommandResultArray(data: any): data is import('../types').BatchCommandResult[] {
  return Array.isArray(data) && data.every(isValidBatchCommandResult)
}

export function isValidSshConfig(data: any): data is {
  host: string
  port: number
  username: string
  auth_method: 'password' | 'key' | 'ppk'
  password?: string
  key_path?: string
  ppk_path?: string
  passphrase?: string
  timeout: number
} {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.host === 'string' &&
    typeof data.port === 'number' &&
    data.port > 0 &&
    data.port <= 65535 &&
    typeof data.username === 'string' &&
    (data.auth_method === 'password' || data.auth_method === 'key' || data.auth_method === 'ppk') &&
    typeof data.timeout === 'number' &&
    data.timeout > 0 &&
    (data.password === undefined || typeof data.password === 'string') &&
    (data.key_path === undefined || typeof data.key_path === 'string') &&
    (data.ppk_path === undefined || typeof data.ppk_path === 'string') &&
    (data.passphrase === undefined || typeof data.passphrase === 'string')
  )
}

export function isValidBatchConfig(data: any): data is {
  username: string
  port: number
  auth_method: 'password' | 'key' | 'ppk'
  password?: string
  key_path?: string
  ppk_path?: string
  passphrase?: string
  timeout: number
  max_concurrent: number
} {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.port === 'number' &&
    data.port > 0 &&
    data.port <= 65535 &&
    typeof data.username === 'string' &&
    (data.auth_method === 'password' || data.auth_method === 'key' || data.auth_method === 'ppk') &&
    typeof data.timeout === 'number' &&
    data.timeout > 0 &&
    typeof data.max_concurrent === 'number' &&
    data.max_concurrent > 0 &&
    (data.password === undefined || typeof data.password === 'string') &&
    (data.key_path === undefined || typeof data.key_path === 'string') &&
    (data.ppk_path === undefined || typeof data.ppk_path === 'string') &&
    (data.passphrase === undefined || typeof data.passphrase === 'string')
  )
}
