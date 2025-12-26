// Утилиты для работы с историей команд

const COMMAND_HISTORY_KEY = 'ssh-executor-command-history'

export interface CommandHistoryItem {
  command: string
  timestamp: number
}

/**
 * Загружает историю команд из localStorage
 */
export function loadCommandHistory(maxSize?: number): string[] {
  try {
    const saved = localStorage.getItem(COMMAND_HISTORY_KEY)
    if (saved) {
      const history: CommandHistoryItem[] = JSON.parse(saved)
      const commands = history.map(item => item.command)
      return maxSize ? commands.slice(0, maxSize) : commands
    }
  } catch (error) {
    // Откладываем console.error чтобы не вызывать setState во время рендеринга
    queueMicrotask(() => {
      console.error('Ошибка загрузки истории команд:', error)
    })
  }
  return []
}

/**
 * Сохраняет команду в историю
 */
export function saveCommandToHistory(
  command: string,
  maxSize: number = 100,
  enabled: boolean = true
): void {
  if (!enabled || !command.trim()) {
    return
  }

  try {
    const saved = localStorage.getItem(COMMAND_HISTORY_KEY)
    let history: CommandHistoryItem[] = saved ? JSON.parse(saved) : []

    // Удаляем дубликаты (если команда уже есть, перемещаем её в начало)
    history = history.filter(item => item.command.trim() !== command.trim())

    // Добавляем новую команду в начало
    history.unshift({
      command: command.trim(),
      timestamp: Date.now(),
    })

    // Ограничиваем размер истории
    if (history.length > maxSize) {
      history = history.slice(0, maxSize)
    }

    localStorage.setItem(COMMAND_HISTORY_KEY, JSON.stringify(history))
  } catch (error) {
    console.error('Ошибка сохранения истории команд:', error)
  }
}

/**
 * Очищает историю команд
 */
export function clearCommandHistory(): void {
  try {
    localStorage.removeItem(COMMAND_HISTORY_KEY)
  } catch (error) {
    console.error('Ошибка очистки истории команд:', error)
  }
}

/**
 * Получает подсказки на основе введенного текста
 */
export function getCommandSuggestions(
  input: string,
  history: string[],
  favorites: string[],
  maxSuggestions: number = 10
): string[] {
  if (!input.trim()) {
    // Если ввод пустой, возвращаем избранные команды
    return favorites.slice(0, maxSuggestions)
  }

  const lowerInput = input.toLowerCase()
  const suggestions: string[] = []

  // Сначала добавляем избранные команды, которые совпадают
  for (const favorite of favorites) {
    if (favorite.toLowerCase().includes(lowerInput) && !suggestions.includes(favorite)) {
      suggestions.push(favorite)
    }
  }

  // Затем добавляем команды из истории
  for (const cmd of history) {
    if (cmd.toLowerCase().includes(lowerInput) && !suggestions.includes(cmd)) {
      suggestions.push(cmd)
    }
    if (suggestions.length >= maxSuggestions) {
      break
    }
  }

  return suggestions.slice(0, maxSuggestions)
}

/**
 * Автодополнение команды
 */
export function autocompleteCommand(
  input: string,
  history: string[],
  favorites: string[]
): string | null {
  if (!input.trim()) {
    return null
  }

  const lowerInput = input.toLowerCase()
  const candidates: string[] = []

  // Сначала проверяем избранные команды
  for (const favorite of favorites) {
    if (favorite.toLowerCase().startsWith(lowerInput)) {
      candidates.push(favorite)
    }
  }

  // Затем проверяем историю
  for (const cmd of history) {
    if (cmd.toLowerCase().startsWith(lowerInput) && !candidates.includes(cmd)) {
      candidates.push(cmd)
    }
  }

  // Возвращаем первую подходящую команду
  return candidates.length > 0 ? candidates[0] : null
}
