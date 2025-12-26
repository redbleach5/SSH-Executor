import { loadSettings } from './settings'
import { format } from 'date-fns'

/**
 * Форматирует дату с учетом настроек приложения
 * @param date - Дата для форматирования (Date объект или строка)
 * @returns Отформатированная строка согласно настройкам
 */
export function formatDateTime(date: Date | string): string {
  const settings = loadSettings()
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  try {
    // Используем настройку dateFormat, если она задана
    if (settings.export.dateFormat) {
      // Преобразуем паттерн из настроек в формат date-fns
      const pattern = settings.export.dateFormat
        .replace(/DD/g, 'dd')
        .replace(/MM/g, 'MM')
        .replace(/YYYY/g, 'yyyy')
        .replace(/YY/g, 'yy')
        .replace(/HH/g, 'HH')
        .replace(/mm/g, 'mm')
        .replace(/ss/g, 'ss')
      
      const timePattern = settings.export.timeFormat === '12h' ? 'hh:mm:ss a' : 'HH:mm:ss'
      return format(dateObj, `${pattern} ${timePattern}`)
    }
  } catch (e) {
    // Если ошибка форматирования, используем дефолтный формат
  }
  
  // Дефолтное форматирование с учетом timeFormat
  const hour12 = settings.export.timeFormat === '12h'
  return dateObj.toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12
  })
}

/**
 * Форматирует дату в 24-часовом формате (для обратной совместимости)
 * @param date - Дата для форматирования (Date объект или строка)
 * @returns Отформатированная строка в формате ДД.ММ.ГГГГ, ЧЧ:ММ:СС (24-часовой формат)
 */
export function formatDateTime24h(date: Date | string): string {
  return formatDateTime(date)
}

/**
 * Форматирует только время с учетом настроек
 * @param date - Дата для форматирования (Date объект или строка)
 * @returns Отформатированная строка времени согласно настройкам
 */
export function formatTime(date: Date | string): string {
  const settings = loadSettings()
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  const hour12 = settings.export.timeFormat === '12h'
  return dateObj.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12
  })
}

/**
 * Форматирует только время в 24-часовом формате (для обратной совместимости)
 * @param date - Дата для форматирования (Date объект или строка)
 * @returns Отформатированная строка в формате ЧЧ:ММ:СС (24-часовой формат)
 */
export function formatTime24h(date: Date | string): string {
  return formatTime(date)
}
