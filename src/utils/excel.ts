import ExcelJS from 'exceljs'
import { loadSettings } from './settings'
import { format } from 'date-fns'

export interface CommandResult {
  stdout: string
  stderr: string
  exit_status: number
  host: string
  vehicle_id?: string
  timestamp?: string
  command?: string
}

// Форматирование timestamp для отображения
function formatTimestamp(timestamp?: string): string {
  if (!timestamp) return ''
  try {
    const date = new Date(timestamp)
    const settings = loadSettings()
    const dateFormat = settings.export.dateFormat || 'DD.MM.YYYY'
    const timeFormat = settings.export.timeFormat === '12h' ? 'hh:mm:ss a' : 'HH:mm:ss'
    return format(date, `${dateFormat} ${timeFormat}`)
  } catch {
    return timestamp
  }
}

// Определение столбцов с их настройками
const COLUMN_DEFINITIONS = {
  host: { header: 'Хост', key: 'host', width: 15, required: true },
  vehicleId: { header: 'ID ТС', key: 'vehicle_id', width: 15, required: false },
  status: { header: 'Статус', key: 'status', width: 10, required: false },
  exitStatus: { header: 'Код выхода', key: 'exit_status', width: 12, required: false },
  stdout: { header: 'Вывод', key: 'stdout', width: 50, required: false },
  stderr: { header: 'Ошибки', key: 'stderr', width: 50, required: false },
  timestamp: { header: 'Время выполнения', key: 'timestamp', width: 20, required: false },
  command: { header: 'Команда', key: 'command', width: 40, required: false },
} as const

export async function exportToExcel(
  results: CommandResult[],
  filePath: string,
  sheetName: string = 'Результаты'
) {
  const settings = loadSettings()
  
  // Получаем настройки столбцов (с учетом обратной совместимости)
  const columnSettings = settings.export.columns || {
    host: true,
    vehicleId: true,
    status: true,
    exitStatus: true,
    stdout: true,
    stderr: true,
    timestamp: false,
    command: false,
  }
  
  // Получаем порядок столбцов (с учетом обратной совместимости)
  // Если порядок не задан, используем дефолтный порядок со всеми столбцами
  const defaultOrder = ['host', 'vehicleId', 'status', 'exitStatus', 'stdout', 'stderr', 'timestamp', 'command']
  const columnOrder = settings.export.columnOrder && settings.export.columnOrder.length > 0
    ? settings.export.columnOrder
    : defaultOrder
  
  // Определяем, какие столбцы включать (обязательные + выбранные пользователем)
  // Фильтруем только те столбцы, которые есть в columnOrder
  const enabledColumns = columnOrder.filter(colKey => {
    const colDef = COLUMN_DEFINITIONS[colKey as keyof typeof COLUMN_DEFINITIONS]
    if (!colDef) return false
    // Обязательные столбцы всегда включаются
    if (colDef.required) return true
    // Проверяем настройки для необязательных столбцов
    return columnSettings[colKey as keyof typeof columnSettings] === true
  })
  
  // Создание рабочей книги
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(sheetName)

  // Формируем массив столбцов на основе настроек
  const columns = enabledColumns.map(colKey => {
    const colDef = COLUMN_DEFINITIONS[colKey as keyof typeof COLUMN_DEFINITIONS]
    if (!colDef) return null
    
    if (settings.export.includeHeaders) {
      return { header: colDef.header, key: colDef.key, width: colDef.width }
    } else {
      return { key: colDef.key, width: colDef.width }
    }
  }).filter(col => col !== null) as Array<{ header?: string; key: string; width: number }>

  worksheet.columns = columns

  // Стилизация заголовков (только если включены заголовки)
  if (settings.export.includeHeaders) {
    const headerRow = worksheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4CAF50' },
    }
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
  }

  // Данные
  results.forEach((result) => {
    // Формируем объект строки только с включенными столбцами
    const rowData: Record<string, any> = {}
    
    enabledColumns.forEach(colKey => {
      const colDef = COLUMN_DEFINITIONS[colKey as keyof typeof COLUMN_DEFINITIONS]
      if (!colDef) return
      
      switch (colKey) {
        case 'host':
          rowData[colDef.key] = result.host
          break
        case 'vehicleId':
          rowData[colDef.key] = result.vehicle_id || ''
          break
        case 'status':
          rowData[colDef.key] = result.exit_status === 0 ? 'Успешно' : 'Ошибка'
          break
        case 'exitStatus':
          rowData[colDef.key] = result.exit_status
          break
        case 'stdout':
          rowData[colDef.key] = result.stdout
          break
        case 'stderr':
          rowData[colDef.key] = result.stderr
          break
        case 'timestamp':
          rowData[colDef.key] = formatTimestamp(result.timestamp)
          break
        case 'command':
          rowData[colDef.key] = result.command || ''
          break
      }
    })
    
    const row = worksheet.addRow(rowData)

    // Цветовая индикация статуса (если столбец включен)
    if (enabledColumns.includes('status')) {
      const statusCell = row.getCell('status')
      if (result.exit_status === 0) {
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFC8E6C9' },
        }
        statusCell.font = { color: { argb: 'FF2E7D32' } }
      } else {
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFCDD2' },
        }
        statusCell.font = { color: { argb: 'FFC62828' } }
      }
    }

    // Перенос текста для длинных значений (если столбцы включены)
    if (enabledColumns.includes('stdout')) {
      row.getCell('stdout').alignment = { wrapText: true, vertical: 'top' }
    }
    if (enabledColumns.includes('stderr')) {
      row.getCell('stderr').alignment = { wrapText: true, vertical: 'top' }
    }
    if (enabledColumns.includes('command')) {
      row.getCell('command').alignment = { wrapText: true, vertical: 'top' }
    }
    
    // Высота строки для лучшей читаемости
    const maxLength = Math.max(
      enabledColumns.includes('stdout') ? (result.stdout?.length || 0) : 0,
      enabledColumns.includes('stderr') ? (result.stderr?.length || 0) : 0,
      enabledColumns.includes('command') ? (result.command?.length || 0) : 0
    )
    row.height = Math.max(20, Math.ceil(maxLength / 80) * 15)
  })

  // Автоподбор ширины колонок
  worksheet.columns.forEach((column) => {
    if (column.key) {
      const lengths = column.values?.map((v: any) => {
        if (v) {
          const str = v.toString()
          // Учитываем переносы строк
          return Math.max(...str.split('\n').map(line => line.length))
        }
        return 0
      }) || []
      const maxLength = Math.max(...lengths.filter((v) => typeof v === 'number'), 10)
      column.width = Math.min(Math.max(maxLength || 10, 10), 100)
    }
  })

  // Заморозка первой строки (заголовки)
  worksheet.views = [
    {
      state: 'frozen',
      ySplit: 1,
    },
  ]

  // Сохранение файла через буфер (для Tauri/браузера)
  // ExcelJS.writeFile использует Node.js API, который недоступен в Tauri
  const buffer = await workbook.xlsx.writeBuffer()
  
  // В Tauri используем invoke для сохранения файла через Rust backend
  const { invoke } = await import('@tauri-apps/api/tauri')
  await invoke('save_file', {
    filePath,
    content: Array.from(new Uint8Array(buffer))
  })
}
