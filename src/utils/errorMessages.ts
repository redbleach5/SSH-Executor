// Утилита для улучшения сообщений об ошибках для пользователя

/**
 * Улучшает сообщения об ошибках, делая их более понятными для пользователя
 */
export function humanizeError(error: string | Error | unknown): string {
  let errorStr: string
  if (typeof error === 'string') {
    errorStr = error
  } else if (error instanceof Error) {
    errorStr = error.message || String(error)
  } else {
    errorStr = String(error)
  }
  const errorLower = errorStr.toLowerCase()

  // Ошибки подключения SSH
  if (errorLower.includes('connection') || errorLower.includes('подключ')) {
    if (errorLower.includes('timeout') || errorLower.includes('таймаут')) {
      return 'Превышено время ожидания подключения. Проверьте:\n• Доступность хоста (ping)\n• Правильность IP-адреса и порта\n• Настройки файрвола\n• Настройки таймаута в настройках подключения'
    }
    if (errorLower.includes('refused') || errorLower.includes('отклонено')) {
      return 'Подключение отклонено. Проверьте:\n• SSH сервис запущен на удаленном хосте\n• Правильность порта (обычно 22)\n• Настройки файрвола на сервере\n• Доступность хоста в сети'
    }
    if (errorLower.includes('no route') || errorLower.includes('нет маршрута')) {
      return 'Хост недоступен. Проверьте:\n• Правильность IP-адреса\n• Наличие сетевого подключения\n• Настройки маршрутизации'
    }
    return `Ошибка подключения: ${errorStr}\n\nПроверьте:\n• Наличие публичной части ключа на хосте\n• Правильность IP-адреса и порта\n• Доступность хоста в сети\n• Настройки SSH на сервере`
  }

  // Ошибки аутентификации
  if (errorLower.includes('authentication') || errorLower.includes('аутентификац') || errorLower.includes('permission denied')) {
    if (errorLower.includes('password') || errorLower.includes('парол')) {
      return 'Ошибка аутентификации: неверный пароль.\n\nПроверьте:\n• Правильность введенного пароля\n• Раскладку клавиатуры (Caps Lock)\n• Настройки пользователя на сервере'
    }
    if (errorLower.includes('key') || errorLower.includes('ключ')) {
      return 'Ошибка аутентификации по ключу.\n\nПроверьте:\n• Правильность пути к ключу\n• Правильность passphrase (если ключ зашифрован)\n• Разрешения на файл ключа\n• Соответствие ключа пользователю на сервере'
    }
    return 'Ошибка аутентификации.\n\nПроверьте:\n• Правильность имени пользователя\n• Правильность пароля или ключа\n• Настройки пользователя на сервере'
  }

  // Ошибки валидации команд
  if (errorLower.includes('валидац') || errorLower.includes('validation') || errorLower.includes('безопасност')) {
    if (errorLower.includes('недопустимый символ') || errorLower.includes('dangerous')) {
      return `Команда содержит недопустимые символы.\n\nДля безопасности запрещено использование:\n• Специальных символов (;, |, &, >, < и т.д.)\n• Перенаправления ввода/вывода\n• Переменных окружения\n\nИспользуйте простые команды без специальных символов.`
    }
    if (errorLower.includes('rm') || errorLower.includes('dd') || errorLower.includes('shutdown')) {
      return `Выполнение опасной команды заблокировано.\n\nКоманда может привести к:\n• Потере данных\n• Нарушению работы системы\n• Необратимым изменениям\n\nЕсли вам действительно нужно выполнить эту команду, отключите валидацию в настройках (с осторожностью!).`
    }
    return `Ошибка валидации команды: ${errorStr}\n\nКоманда не прошла проверку безопасности.`
  }

  // Ошибки файлов
  if (errorLower.includes('file') || errorLower.includes('файл') || errorLower.includes('not found') || errorLower.includes('не найден')) {
    if (errorLower.includes('key') || errorLower.includes('ключ')) {
      return 'Файл ключа не найден.\n\nПроверьте:\n• Правильность пути к файлу ключа\n• Существование файла по указанному пути\n• Разрешения на чтение файла'
    }
    return `Файл не найден: ${errorStr}\n\nПроверьте правильность пути к файлу.`
  }

  // Ошибки выполнения команды
  if (errorLower.includes('execute') || errorLower.includes('выполнен')) {
    if (errorLower.includes('sudo') && errorLower.includes('terminal')) {
      return 'Ошибка выполнения команды с sudo.\n\nПроблема: sudo не может запросить пароль без интерактивного терминала.\n\nРешения:\n1. Используйте sudo -S для передачи пароля через stdin\n2. Настройте NOPASSWD в /etc/sudoers\n3. Используйте команду без sudo'
    }
    return `Ошибка выполнения команды: ${errorStr}`
  }

  // Ошибки парсинга
  if (errorLower.includes('parse') || errorLower.includes('парс')) {
    return `Ошибка обработки данных: ${errorStr}\n\nПроверьте формат данных.`
  }

  // Общие ошибки сети
  if (errorLower.includes('network') || errorLower.includes('сеть') || errorLower.includes('dns')) {
    return `Ошибка сети: ${errorStr}\n\nПроверьте:\n• Наличие интернет-соединения\n• Настройки DNS\n• Настройки прокси (если используется)`
  }

  // Если не удалось определить тип ошибки, возвращаем оригинальное сообщение
  return errorStr
}

/**
 * Извлекает имя команды из сообщения об ошибке "command not found"
 */
function extractCommandName(stderr: string): string | null {
  // Паттерны для различных форматов ошибок:
  // "bash: ew: command not found"
  // "ew: command not found"
  // "command not found: ew"
  // "sh: ew: command not found"
  // и т.д.
  
  const patterns = [
    /(?:bash|sh|zsh|fish|dash|csh|ksh):\s*([^:]+):\s*command\s+not\s+found/i,
    /^([^:]+):\s*command\s+not\s+found/i,
    /command\s+not\s+found[:\s]+([^\s]+)/i,
    /([^\s:]+):\s*command\s+not\s+found/i,
  ]
  
  for (const pattern of patterns) {
    const match = stderr.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    }
  }
  
  return null
}

/**
 * Улучшает сообщения об ошибках выполнения команд на основе exit_status и stderr
 */
export function humanizeCommandError(
  exitStatus: number,
  stderr: string,
  command?: string
): string {
  const stderrLower = stderr.toLowerCase()
  const stderrTrimmed = stderr.trim()
  
  // Специфичные ошибки по кодам выхода
  if (exitStatus === 1 || exitStatus === 127) {
    // Ошибка "command not found" - обрабатываем все форматы
    if (stderrLower.includes('command not found') || stderrLower.includes('команда не найдена')) {
      // Пытаемся извлечь имя команды из stderr
      const extractedCmd = extractCommandName(stderrTrimmed)
      const cmdName = extractedCmd || (command ? command.split(/\s+/)[0] : 'команда')
      
      return `❌ Команда "${cmdName}" не найдена на удаленном сервере.\n\nВозможные причины:\n• Опечатка в названии команды\n• Программа не установлена на сервере\n• Команда недоступна в PATH пользователя\n• Неправильная раскладка клавиатуры\n\nРекомендации:\n• Проверьте правильность написания команды\n• Убедитесь, что программа установлена на сервере\n• Проверьте, доступна ли команда: which ${cmdName}\n• Попробуйте использовать полный путь к команде`
    }
    
    if (stderrLower.includes('permission denied') || stderrLower.includes('доступ запрещен')) {
      return '❌ Ошибка: недостаточно прав доступа.\n\nКоманда выполнена, но завершилась с ошибкой из-за отсутствия прав.\n\nВозможные решения:\n• Используйте sudo (если настроен NOPASSWD)\n• Выполните команду от имени пользователя с достаточными правами\n• Проверьте права доступа к файлам/директориям\n• Используйте chmod для изменения прав доступа к файлам'
    }
    
    if (stderrLower.includes('no such file') || stderrLower.includes('нет такого файла') || stderrLower.includes('no such file or directory')) {
      return '❌ Файл или директория не найдены.\n\nПроверьте:\n• Правильность пути к файлу\n• Существование файла/директории\n• Права доступа к файлу\n• Раскладку клавиатуры в пути'
    }
    
    if (stderrLower.includes('interactive authentication') || (stderrLower.includes('sudo') && stderrLower.includes('terminal'))) {
      return '❌ Требуется интерактивная аутентификация.\n\nКоманда требует ввода пароля, но выполнение происходит без интерактивного терминала.\n\nРешения:\n• Используйте sudo -S для передачи пароля через stdin\n• Настройте NOPASSWD в /etc/sudoers\n• Используйте команду без sudo'
    }
    
    // Обработка других распространенных ошибок
    if (stderrLower.includes('cannot execute') || stderrLower.includes('не может быть выполнена')) {
      return '❌ Команда не может быть выполнена.\n\nВозможные причины:\n• Файл не является исполняемым\n• Недостаточно прав на выполнение\n• Поврежден файл команды\n• Неправильный формат файла\n\nПроверьте права доступа: ls -l <путь_к_команде>'
    }
    
    if (stderrLower.includes('syntax error') || stderrLower.includes('синтаксическая ошибка')) {
      return '❌ Синтаксическая ошибка в команде.\n\nПроверьте:\n• Правильность синтаксиса команды\n• Правильность параметров\n• Раскладку клавиатуры\n• Кавычки и специальные символы'
    }
  }

  if (exitStatus === 2) {
    return '❌ Ошибка: неправильное использование команды.\n\nПроверьте:\n• Синтаксис команды\n• Правильность параметров\n• Справку по команде: <команда> --help'
  }

  if (exitStatus === 126) {
    return '❌ Ошибка: команда не может быть выполнена.\n\nВозможные причины:\n• Файл не является исполняемым\n• Недостаточно прав на выполнение\n• Поврежден файл команды\n• Неправильный формат файла\n\nПроверьте права доступа: ls -l <путь_к_команде>'
  }

  // Общая обработка на основе stderr
  if (stderr && stderr.trim()) {
    // Пытаемся улучшить сообщение, если это известный тип ошибки
    const stderrLower = stderr.toLowerCase()
    
    // Дополнительные проверки для других типов ошибок
    if (stderrLower.includes('cannot access') || stderrLower.includes('не удается получить доступ')) {
      return `❌ Ошибка доступа к файлу или директории.\n\n${stderrTrimmed}\n\nПроверьте:\n• Существование файла/директории\n• Права доступа\n• Правильность пути`
    }
    
    if (stderrLower.includes('is a directory') || stderrLower.includes('это директория')) {
      return `❌ Ошибка: указан путь к директории вместо файла.\n\n${stderrTrimmed}\n\nИспользуйте правильный путь к файлу.`
    }
    
    if (stderrLower.includes('read-only file system') || stderrLower.includes('только для чтения')) {
      return `❌ Ошибка: файловая система доступна только для чтения.\n\n${stderrTrimmed}\n\nНевозможно выполнить операцию записи.`
    }
    
    if (stderrLower.includes('no space left') || stderrLower.includes('недостаточно места')) {
      return `❌ Ошибка: недостаточно места на диске.\n\n${stderrTrimmed}\n\nОсвободите место на диске.`
    }
    
    // Если не удалось определить тип ошибки, показываем улучшенное сообщение
    const shortStderr = stderr.length > 300 ? stderr.substring(0, 300) + '...' : stderr
    return `❌ Команда завершилась с ошибкой (код ${exitStatus}):\n\n${shortStderr}\n\nПроверьте:\n• Правильность команды и параметров\n• Права доступа\n• Доступность ресурсов на сервере`
  }

  return `❌ Команда завершилась с ошибкой (код выхода: ${exitStatus})\n\nПроверьте правильность команды и параметров.`
}

/**
 * Улучшает сообщения об успешном выполнении
 */
export function humanizeSuccessMessage(exitStatus: number, stdout?: string): string {
  if (exitStatus === 0) {
    if (stdout && stdout.trim()) {
      return 'Команда выполнена успешно'
    }
    return 'Команда выполнена успешно (без вывода)'
  }
  // Не должно вызываться для успешных команд, но на всякий случай
  return `Команда завершена (код: ${exitStatus})`
}

/**
 * Определяет, имеет ли смысл повторять попытку подключения при данной ошибке
 * Возвращает false для ошибок, которые не исправятся при повторной попытке
 * (например, неверный ключ, неверный пароль, неверный пользователь и т.д.)
 */
export function isRetryableError(error: string | null | undefined): boolean {
  if (!error) return false
  
  const errorLower = error.toLowerCase()
  
  // Ошибки аутентификации - не имеет смысла повторять
  if (errorLower.includes('authentication') || errorLower.includes('аутентификац') || errorLower.includes('permission denied')) {
    // Проверяем конкретные типы ошибок аутентификации
    if (errorLower.includes('key') || errorLower.includes('ключ')) {
      // Ошибки с ключом - не имеет смысла повторять
      if (errorLower.includes('invalid') || errorLower.includes('неверн') || 
          errorLower.includes('combination invalid') || errorLower.includes('не подошел') ||
          errorLower.includes('not found') || errorLower.includes('не найден') ||
          errorLower.includes('file not found') || errorLower.includes('файл ключа не найден')) {
        return false
      }
    }
    if (errorLower.includes('password') || errorLower.includes('парол')) {
      // Неверный пароль - не имеет смысла повторять
      return false
    }
    if (errorLower.includes('username') || errorLower.includes('пользовател') || 
        errorLower.includes('user') && errorLower.includes('invalid')) {
      // Неверный пользователь - не имеет смысла повторять
      return false
    }
    // Общая ошибка аутентификации - не имеет смысла повторять
    return false
  }
  
  // Ошибки валидации - не имеет смысла повторять
  if (errorLower.includes('валидац') || errorLower.includes('validation') || 
      errorLower.includes('безопасност') || errorLower.includes('dangerous')) {
    return false
  }
  
  // Ошибки с файлом ключа - не имеет смысла повторять
  if (errorLower.includes('key file not found') || errorLower.includes('файл ключа не найден') ||
      errorLower.includes('key path') && errorLower.includes('not found')) {
    return false
  }
  
  // Ошибки с неверным форматом или конфигурацией - не имеет смысла повторять
  if (errorLower.includes('invalid format') || errorLower.includes('неверный формат') ||
      errorLower.includes('invalid configuration') || errorLower.includes('неверная конфигурация')) {
    return false
  }
  
  // Ошибки подключения, которые могут быть временными - имеет смысл повторять
  if (errorLower.includes('connection') || errorLower.includes('подключ')) {
    // Таймаут - может быть временным
    if (errorLower.includes('timeout') || errorLower.includes('таймаут')) {
      return true
    }
    // Отклонено - может быть временным (сервис перезапускается)
    if (errorLower.includes('refused') || errorLower.includes('отклонено')) {
      return true
    }
    // Нет маршрута - обычно постоянная ошибка, но может быть временной
    if (errorLower.includes('no route') || errorLower.includes('нет маршрута')) {
      return true
    }
    // Общая ошибка подключения - может быть временной
    return true
  }
  
  // Ошибки сети - могут быть временными
  if (errorLower.includes('network') || errorLower.includes('сеть') || 
      errorLower.includes('dns') || errorLower.includes('resolve')) {
    return true
  }
  
  // Ошибки выполнения команды - обычно не имеет смысла повторять подключение
  // (это ошибка уже после подключения)
  if (errorLower.includes('execute') || errorLower.includes('выполнен') ||
      errorLower.includes('command') && errorLower.includes('error')) {
    return false
  }
  
  // По умолчанию считаем, что имеет смысл повторять (для неизвестных ошибок)
  // Это безопаснее, чем пропустить временную ошибку
  return true
}