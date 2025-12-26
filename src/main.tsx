import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initializeDensity } from './utils/density'
import ErrorBoundary from './components/ErrorBoundary'

// Инициализируем плотность при загрузке приложения
initializeDensity()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
