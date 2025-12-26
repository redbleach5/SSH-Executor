// Утилита для применения плотности отображения

export function applyDensity(density: 'compact' | 'comfortable' | 'spacious') {
  const root = document.documentElement
  const body = document.body
  
  // Удаляем старые классы
  body.classList.remove('density-compact', 'density-comfortable', 'density-spacious')
  
  // Добавляем новый класс
  body.classList.add(`density-${density}`)
  
  // Устанавливаем CSS переменную для масштаба плотности
  const scale = density === 'compact' ? 0.85 : density === 'comfortable' ? 1 : 1.15
  root.style.setProperty('--density-scale', scale.toString())
  
  // Применяем плотность ко всем элементам через CSS переменные
  // Используем более агрессивный подход - применяем transform: scale к контейнеру
  // или используем CSS переменные для всех spacing значений
  
  // Создаем стиль, который применяет плотность ко всем spacing классам
  let styleElement = document.getElementById('density-style')
  if (!styleElement) {
    styleElement = document.createElement('style')
    styleElement.id = 'density-style'
    document.head.appendChild(styleElement)
  }
  
  // Генерируем CSS правила для всех spacing значений Tailwind
  const spacingValues = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8, 10, 12, 16, 20, 24]
  const cssRules: string[] = []
  
  spacingValues.forEach(value => {
    const remValue = value * 0.25 // Tailwind spacing: 1 = 0.25rem
    const scaledValue = remValue * scale
    // Экранируем точку для CSS селектора
    const className = value.toString().replace('.', '\\.')
    
    // Padding
    cssRules.push(`.p-${className} { padding: ${scaledValue}rem !important; }`)
    cssRules.push(`.px-${className} { padding-left: ${scaledValue}rem !important; padding-right: ${scaledValue}rem !important; }`)
    cssRules.push(`.py-${className} { padding-top: ${scaledValue}rem !important; padding-bottom: ${scaledValue}rem !important; }`)
    cssRules.push(`.pt-${className} { padding-top: ${scaledValue}rem !important; }`)
    cssRules.push(`.pr-${className} { padding-right: ${scaledValue}rem !important; }`)
    cssRules.push(`.pb-${className} { padding-bottom: ${scaledValue}rem !important; }`)
    cssRules.push(`.pl-${className} { padding-left: ${scaledValue}rem !important; }`)
    
    // Margin
    cssRules.push(`.m-${className} { margin: ${scaledValue}rem !important; }`)
    cssRules.push(`.mx-${className} { margin-left: ${scaledValue}rem !important; margin-right: ${scaledValue}rem !important; }`)
    cssRules.push(`.my-${className} { margin-top: ${scaledValue}rem !important; margin-bottom: ${scaledValue}rem !important; }`)
    cssRules.push(`.mt-${className} { margin-top: ${scaledValue}rem !important; }`)
    cssRules.push(`.mr-${className} { margin-right: ${scaledValue}rem !important; }`)
    cssRules.push(`.mb-${className} { margin-bottom: ${scaledValue}rem !important; }`)
    cssRules.push(`.ml-${className} { margin-left: ${scaledValue}rem !important; }`)
    
    // Gap
    cssRules.push(`.gap-${className} { gap: ${scaledValue}rem !important; }`)
    cssRules.push(`.gap-x-${className} { column-gap: ${scaledValue}rem !important; }`)
    cssRules.push(`.gap-y-${className} { row-gap: ${scaledValue}rem !important; }`)
    
    // Space
    cssRules.push(`.space-x-${className} > * + * { margin-left: ${scaledValue}rem !important; }`)
    cssRules.push(`.space-y-${className} > * + * { margin-top: ${scaledValue}rem !important; }`)
  })
  
  styleElement.textContent = cssRules.join('\n')
}

export function initializeDensity() {
  // Применяем начальную плотность при загрузке
  try {
    const settings = JSON.parse(localStorage.getItem('ssh-executor-settings') || '{}')
    const density = settings?.interface?.density || 'comfortable'
    applyDensity(density)
  } catch (e) {
    // Если ошибка, используем значение по умолчанию
    applyDensity('comfortable')
  }
}
