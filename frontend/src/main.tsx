import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Vendor calendar styles first: `index.css` maps them onto the project tokens.
import 'react-datepicker/dist/react-datepicker.css'
import './index.css'
import './i18n'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
