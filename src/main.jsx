import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const rootElement = document.getElementById('root');

try {
    createRoot(rootElement).render(
        <StrictMode>
            <App />
        </StrictMode>,
    )
} catch (e) {
    rootElement.innerHTML = `<div style="padding: 20px; color: red; font-family: monospace;">
    <h1>CRITICAL STARTUP ERROR</h1>
    <pre>${e.message}\n${e.stack}</pre>
  </div>`;
    console.error("Startup Failed:", e);
}
