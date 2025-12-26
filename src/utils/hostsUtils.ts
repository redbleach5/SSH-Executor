// Утилиты для работы с хостами

import type { HostEntry } from '../types'
import { loadSettings } from './settings'

// Цвета для маркировки хостов
const HOST_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
]

/**
 * Получает цвет для хоста на основе его IP или группы
 */
export function getHostColor(host: HostEntry, index: number): string {
  if (host.color) return host.color
  
  if (!host.group) {
    // Если нет группы, используем индекс для выбора цвета
    return HOST_COLORS[index % HOST_COLORS.length]
  }
  
  // Если есть группа, используем хеш группы для стабильного цвета
  let hash = 0
  for (let i = 0; i < host.group.length; i++) {
    hash = host.group.charCodeAt(i) + ((hash << 5) - hash)
  }
  return HOST_COLORS[Math.abs(hash) % HOST_COLORS.length]
}

/**
 * Группирует хосты по группам или тегам
 */
export function groupHosts(hosts: HostEntry[]): Map<string, HostEntry[]> {
  const settings = loadSettings()
  const grouped = new Map<string, HostEntry[]>()
  
  if (settings.hosts.groupByTags) {
    // Группировка по тегам
    hosts.forEach(host => {
      const tags = host.tags || []
      if (tags.length === 0) {
        const defaultGroup = settings.hosts.defaultGroup || 'Без тегов'
        if (!grouped.has(defaultGroup)) {
          grouped.set(defaultGroup, [])
        }
        grouped.get(defaultGroup)!.push(host)
      } else {
        tags.forEach(tag => {
          if (!grouped.has(tag)) {
            grouped.set(tag, [])
          }
          grouped.get(tag)!.push(host)
        })
      }
    })
  } else {
    // Группировка по группам
    hosts.forEach(host => {
      const group = host.group || settings.hosts.defaultGroup || 'default'
      if (!grouped.has(group)) {
        grouped.set(group, [])
      }
      grouped.get(group)!.push(host)
    })
  }
  
  return grouped
}

/**
 * Получает плоский список хостов с учетом группировки
 */
export function getFlattenedHosts(hosts: HostEntry[]): { host: HostEntry; groupName: string }[] {
  const grouped = groupHosts(hosts)
  const result: { host: HostEntry; groupName: string }[] = []
  
  grouped.forEach((groupHosts, groupName) => {
    groupHosts.forEach(host => {
      result.push({ host, groupName })
    })
  })
  
  return result
}
