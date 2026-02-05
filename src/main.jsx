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

// Global Error Handler for async or module errors
window.onerror = function (message, source, lineno, colno, error) {
    const errDiv = document.createElement('div');
    errDiv.style.cssText = "position:fixed; top:0; left:0; width:100%; background:rgba(0,0,0,0.9); color:red; padding:20px; z-index:9999;";
    errDiv.innerHTML = `<h3>Global Error</h3><pre>${message}\n${source}:${lineno}</pre>`;
    document.body.appendChild(errDiv);
};
