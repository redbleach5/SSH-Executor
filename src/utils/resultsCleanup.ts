// Утилита для очистки старых результатов

import type { CommandResult, BatchCommandResult } from '../types'

/**
 * Очищает результаты старше указанного количества дней
 */
export function cleanupOldResults<T extends { timestamp?: string }>(
  results: T[],
  retentionDays: number
): T[] {
  if (retentionDays <= 0) return results
  
  const now = new Date()
  const cutoffDate = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000)
  
  return results.filter(result => {
    if (!result.timestamp) return true // Сохраняем результаты без timestamp для обратной совместимости
    
    const resultDate = new Date(result.timestamp)
    return resultDate >= cutoffDate
  })
}

/**
 * Добавляет timestamp к результату
 */
export function addTimestamp<T extends { timestamp?: string }>(result: T): T {
  return {
    ...result,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Очищает результаты команд из localStorage
 */
export function cleanupStoredResults(retentionDays: number): void {
  if (retentionDays <= 0) return
  
  try {
    const stored = localStorage.getItem('ssh-executor-recent-activity')
    if (!stored) return
    
    const activities = JSON.parse(stored)
    const now = new Date()
    const cutoffDate = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000)
    
    const filtered = activities.filter((activity: { timestamp?: string }) => {
      if (!activity.timestamp) return true
      const activityDate = new Date(activity.timestamp)
      return activityDate >= cutoffDate
    })
    
    localStorage.setItem('ssh-executor-recent-activity', JSON.stringify(filtered))
  } catch (error) {
    console.error('Ошибка очистки сохраненных результатов:', error)
  }
}
