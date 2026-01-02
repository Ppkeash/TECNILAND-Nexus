/**
 * Live Log Viewer - Professional Real-time Minecraft Log Display
 * 
 * Features:
 * - Real-time log streaming with color-coded log levels
 * - Circular buffer for memory efficiency (max 2000 lines)
 * - Copy to clipboard / Export to file with timestamps
 * - Auto-scroll with toggle
 * - Floating toggle button when enabled in settings
 * - Professional dark theme matching launcher design
 * - Detects errors, warnings, debug, and info levels
 */

;(function() {
    'use strict'

    // Prevent double initialization
    if (window.__LIVE_LOG_VIEWER_INIT__) {
        return
    }
    window.__LIVE_LOG_VIEWER_INIT__ = true

    const ConfigManager = require('./assets/js/configmanager')

    // =========================================================================
    // Configuration
    // =========================================================================
    const MAX_LOG_LINES = 2000       // Maximum lines in buffer
    const FLUSH_INTERVAL_MS = 100    // Batch updates every 100ms
    const TRIM_AMOUNT = 500          // Lines to remove when max reached

    // =========================================================================
    // State
    // =========================================================================
    let logBuffer = []               // Stored log entries
    let pendingLogs = []             // Logs waiting to be rendered
    let flushTimer = null            // Timer for batch DOM updates
    let isVisible = false            // Panel visibility
    let isGameRunning = false        // Game process active
    let autoScroll = true            // Auto-scroll enabled
    let lineCount = 0                // Current displayed line count

    // =========================================================================
    // DOM Elements (created dynamically)
    // =========================================================================
    let logViewerPanel = null
    let logViewerContent = null
    let logViewerToggle = null
    let logViewerStatusLabel = null
    let logViewerLineCount = null
    let autoScrollCheckbox = null

    // =========================================================================
    // Styles - TECNILAND Green/Black Theme
    // =========================================================================
    const STYLES = `
        /* Live Log Viewer Panel - TECNILAND Theme */
        #liveLogViewerPanel {
            position: fixed;
            right: 0;
            top: 22px;
            width: 35%;
            min-width: 400px;
            max-width: 550px;
            height: calc(100% - 22px);
            background: linear-gradient(180deg, rgba(8, 12, 8, 0.98) 0%, rgba(5, 8, 5, 0.98) 100%);
            border-left: 1px solid rgba(0, 255, 127, 0.3);
            display: none;
            flex-direction: column;
            z-index: 9999;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            box-shadow: -5px 0 30px rgba(0, 0, 0, 0.7);
            animation: slideInRight 0.3s ease;
        }

        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }

        #liveLogViewerPanel.visible {
            display: flex;
        }

        /* Header - TECNILAND Green */
        .llv-header {
            background: linear-gradient(135deg, #0d3d0d 0%, #1a5c1a 100%);
            padding: 10px 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid rgba(0, 255, 127, 0.4);
        }

        .llv-title {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #00ff7f;
            font-family: 'Avenir Medium', sans-serif;
            font-size: 13px;
            font-weight: 600;
            text-shadow: 0 0 10px rgba(0, 255, 127, 0.5);
        }

        .llv-status {
            font-size: 11px;
            margin-left: 8px;
            opacity: 0.9;
        }

        .llv-status.idle { color: rgba(0, 255, 127, 0.5); }
        .llv-status.running { color: #00ff7f; animation: pulse 1.5s infinite; text-shadow: 0 0 8px rgba(0, 255, 127, 0.8); }
        .llv-status.stopped { color: #ffcc00; }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        /* Toolbar - TECNILAND Theme */
        .llv-toolbar {
            padding: 8px 12px;
            background: rgba(0, 20, 0, 0.5);
            display: flex;
            gap: 6px;
            border-bottom: 1px solid rgba(0, 255, 127, 0.15);
        }

        .llv-btn {
            padding: 5px 10px;
            background: rgba(0, 255, 127, 0.1);
            border: 1px solid rgba(0, 255, 127, 0.3);
            border-radius: 4px;
            color: rgba(0, 255, 127, 0.9);
            cursor: pointer;
            font-size: 11px;
            font-weight: 500;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .llv-btn:hover {
            background: rgba(0, 255, 127, 0.2);
            border-color: rgba(0, 255, 127, 0.5);
            color: #00ff7f;
            text-shadow: 0 0 5px rgba(0, 255, 127, 0.5);
        }

        .llv-btn-close:hover {
            background: rgba(255, 60, 60, 0.2);
            border-color: rgba(255, 60, 60, 0.5);
            color: #ff6b6b;
        }

        /* Log Content - TECNILAND Theme */
        .llv-content {
            flex: 1;
            overflow-y: auto;
            padding: 10px 12px;
            font-size: 11.5px;
            line-height: 1.6;
            color: #00ff7f;
            background: rgba(0, 0, 0, 0.3);
        }

        .llv-content::-webkit-scrollbar { width: 8px; }
        .llv-content::-webkit-scrollbar-track { background: rgba(0, 20, 0, 0.4); }
        .llv-content::-webkit-scrollbar-thumb { 
            background: rgba(0, 255, 127, 0.3); 
            border-radius: 4px; 
        }
        .llv-content::-webkit-scrollbar-thumb:hover { 
            background: rgba(0, 255, 127, 0.5); 
        }

        /* Log Lines - TECNILAND Color Scheme */
        .llv-line {
            padding: 1px 0 1px 8px;
            margin-bottom: 1px;
            border-left: 2px solid transparent;
            word-break: break-word;
        }

        /* ERROR: Borde y tag rojo, texto verde */
        .llv-line.error {
            border-left-color: #ff3c3c;
            color: #00ff7f;
            background: rgba(255, 60, 60, 0.08);
        }
        .llv-line.error .llv-tag-error {
            color: #ff3c3c;
            font-weight: bold;
        }

        /* WARN: Verde amarillento intenso */
        .llv-line.warn {
            border-left-color: #9acd32;
            color: #adff2f;
        }

        /* DEBUG: Verde azulado suave */
        .llv-line.debug {
            border-left-color: #20b2aa;
            color: #48d1cc;
        }

        /* INFO: Verde neón suave (default TECNILAND) */
        .llv-line.info {
            border-left-color: #00ff7f;
            color: #00ff7f;
        }

        /* STDOUT: Verde estándar */
        .llv-line.stdout {
            border-left-color: #32cd32;
            color: #00ff7f;
        }

        /* System messages */
        .llv-line.system {
            border-left-color: #00ff7f;
            color: #7cfc00;
            font-style: italic;
            text-shadow: 0 0 5px rgba(0, 255, 127, 0.3);
        }

        /* Timestamp: gris/verde discreto */
        .llv-timestamp {
            color: #3a5f3a;
            margin-right: 6px;
            font-size: 10px;
        }

        .llv-welcome {
            color: #3a5f3a;
            text-align: center;
            padding: 30px 20px;
            font-family: 'Avenir Book', sans-serif;
        }

        /* Toast notification for export feedback */
        .llv-toast {
            position: absolute;
            bottom: 50px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 40, 0, 0.95);
            border: 1px solid rgba(0, 255, 127, 0.5);
            border-radius: 6px;
            padding: 10px 16px;
            color: #00ff7f;
            font-size: 11px;
            font-family: 'Avenir Book', sans-serif;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            z-index: 10000;
            animation: toastIn 0.3s ease, toastOut 0.3s ease 3.7s;
            max-width: 90%;
            text-align: center;
            word-break: break-all;
        }

        .llv-toast.error {
            border-color: rgba(255, 60, 60, 0.5);
            color: #ff6b6b;
        }

        @keyframes toastIn {
            from { opacity: 0; transform: translateX(-50%) translateY(10px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }

        @keyframes toastOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }

        /* Footer - TECNILAND Theme */
        .llv-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 12px;
            background: rgba(0, 20, 0, 0.5);
            border-top: 1px solid rgba(0, 255, 127, 0.15);
            font-size: 10px;
            color: #3a5f3a;
        }

        .llv-footer label {
            display: flex;
            align-items: center;
            gap: 4px;
            cursor: pointer;
            color: rgba(0, 255, 127, 0.7);
        }

        .llv-footer input[type="checkbox"] {
            width: 12px;
            height: 12px;
            cursor: pointer;
            accent-color: #00ff7f;
        }

        /* Toggle Button - TECNILAND Green */
        #liveLogViewerToggle {
            position: fixed;
            right: 15px;
            bottom: 75px;
            width: 42px;
            height: 42px;
            border-radius: 50%;
            background: linear-gradient(135deg, #0d3d0d 0%, #1a5c1a 100%);
            border: 2px solid rgba(0, 255, 127, 0.4);
            cursor: pointer;
            display: none;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 15px rgba(0, 255, 127, 0.3);
            transition: all 0.3s ease;
            z-index: 9998;
            color: #00ff7f;
            font-size: 18px;
        }

        #liveLogViewerToggle:hover {
            transform: scale(1.1);
            box-shadow: 0 6px 20px rgba(0, 255, 127, 0.5);
            border-color: rgba(0, 255, 127, 0.7);
        }

        #liveLogViewerToggle.active {
            background: linear-gradient(135deg, #1a5c1a 0%, #2d7d2d 100%);
            box-shadow: 0 0 20px rgba(0, 255, 127, 0.4);
        }

        #liveLogViewerToggle.enabled {
            display: flex;
        }

        /* Badge for error count */
        .llv-badge {
            position: absolute;
            top: -4px;
            right: -4px;
            background: #ff3c3c;
            color: #fff;
            font-size: 9px;
            font-weight: bold;
            min-width: 16px;
            height: 16px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Avenir Medium', sans-serif;
        }
    `

    // =========================================================================
    // Initialization
    // =========================================================================
    function init() {
        console.log('[LiveLogViewer] Initializing...')
        
        // Inject styles
        injectStyles()
        
        // Create UI elements
        createUI()
        
        // Bind event listeners
        bindEvents()
        
        // Update visibility based on config
        updateToggleVisibility()
        
        console.log('[LiveLogViewer] Ready')
    }

    function injectStyles() {
        const style = document.createElement('style')
        style.id = 'liveLogViewerStyles'
        style.textContent = STYLES
        document.head.appendChild(style)
    }

    function createUI() {
        // Create toggle button
        logViewerToggle = document.createElement('button')
        logViewerToggle.id = 'liveLogViewerToggle'
        logViewerToggle.innerHTML = '📋'
        logViewerToggle.title = 'Mostrar/Ocultar Logs en Vivo'
        document.body.appendChild(logViewerToggle)

        // Create main panel
        logViewerPanel = document.createElement('div')
        logViewerPanel.id = 'liveLogViewerPanel'
        logViewerPanel.innerHTML = `
            <div class="llv-header">
                <div class="llv-title">
                    <span>📋</span>
                    <span>LOGS</span>
                    <span class="llv-status idle" id="llvStatus">● Idle</span>
                </div>
            </div>
            <div class="llv-toolbar">
                <button class="llv-btn" id="llvClear" title="Limpiar logs">🗑️ Limpiar</button>
                <button class="llv-btn" id="llvCopy" title="Copiar al portapapeles">📋 Copiar</button>
                <button class="llv-btn" id="llvExport" title="Exportar a archivo">💾 Exportar</button>
                <div style="flex:1"></div>
                <button class="llv-btn llv-btn-close" id="llvClose" title="Cerrar panel">✕</button>
            </div>
            <div class="llv-content" id="llvContent">
                <div class="llv-welcome">
                    📋 Panel de logs listo.<br>
                    Los logs aparecerán aquí cuando inicies Minecraft.
                </div>
            </div>
            <div class="llv-footer">
                <span id="llvLineCount">0 líneas</span>
                <label>
                    <input type="checkbox" id="llvAutoScroll" checked>
                    Auto-scroll
                </label>
            </div>
        `
        document.body.appendChild(logViewerPanel)

        // Cache DOM references
        logViewerContent = document.getElementById('llvContent')
        logViewerStatusLabel = document.getElementById('llvStatus')
        logViewerLineCount = document.getElementById('llvLineCount')
        autoScrollCheckbox = document.getElementById('llvAutoScroll')
    }

    function bindEvents() {
        // Toggle button
        logViewerToggle.addEventListener('click', togglePanel)

        // Panel buttons
        document.getElementById('llvClose').addEventListener('click', hidePanel)
        document.getElementById('llvClear').addEventListener('click', clearLogs)
        document.getElementById('llvCopy').addEventListener('click', copyToClipboard)
        document.getElementById('llvExport').addEventListener('click', exportToFile)

        // Auto-scroll checkbox
        autoScrollCheckbox.addEventListener('change', (e) => {
            autoScroll = e.target.checked
            if (autoScroll) scrollToBottom()
        })

        // Minecraft process events
        window.addEventListener('minecraft-process-started', onProcessStarted)
        window.addEventListener('minecraft-process-closed', onProcessClosed)
        window.addEventListener('minecraft-log-data', onLogData)

        // Settings change
        window.addEventListener('settings-saved', updateToggleVisibility)
    }

    // =========================================================================
    // Panel Visibility
    // =========================================================================
    function togglePanel() {
        if (isVisible) {
            hidePanel()
        } else {
            showPanel()
        }
    }

    function showPanel() {
        logViewerPanel.classList.add('visible')
        logViewerToggle.classList.add('active')
        isVisible = true
        
        // Adjust main content width
        const main = document.getElementById('main')
        if (main) {
            main.style.width = '65%'
            main.style.transition = 'width 0.3s ease'
        }

        // Start flush timer
        startFlushTimer()
        
        if (autoScroll) scrollToBottom()
    }

    function hidePanel() {
        logViewerPanel.classList.remove('visible')
        logViewerToggle.classList.remove('active')
        isVisible = false
        
        // Restore main content width
        const main = document.getElementById('main')
        if (main) {
            main.style.width = '100%'
        }

        // Stop flush timer when hidden
        stopFlushTimer()
    }

    function updateToggleVisibility() {
        const enabled = ConfigManager.getShowLiveLogs()
        if (enabled) {
            logViewerToggle.classList.add('enabled')
        } else {
            logViewerToggle.classList.remove('enabled')
            if (isVisible) hidePanel()
        }
    }

    // =========================================================================
    // Process Events
    // =========================================================================
    function onProcessStarted() {
        isGameRunning = true
        updateStatus('running')
        
        // Auto-show panel when game starts
        if (ConfigManager.getShowLiveLogs() && !isVisible) {
            showPanel()
        }

        // Add session start marker
        addSystemLine('═'.repeat(60))
        addSystemLine(`🎮 Minecraft started at ${getTimestamp()}`)
        addSystemLine('═'.repeat(60))
    }

    function onProcessClosed(event) {
        isGameRunning = false
        const code = event.detail?.code ?? 'unknown'
        updateStatus('stopped')

        // Add session end marker
        addSystemLine('═'.repeat(60))
        addSystemLine(`🛑 Minecraft closed with code ${code} at ${getTimestamp()}`)
        addSystemLine('═'.repeat(60))
    }

    function onLogData(event) {
        const { data, isError } = event.detail
        if (!data) return

        // Split by newlines and process each line
        const lines = data.toString().split(/\r?\n/)
        for (const line of lines) {
            if (line.trim()) {
                addLogLine(line, isError ? 'stderr' : 'stdout')
            }
        }
    }

    // =========================================================================
    // Log Management
    // =========================================================================
    function addLogLine(text, source = 'stdout') {
        const level = classifyLogLevel(text, source)
        
        pendingLogs.push({
            text,
            source,
            level,
            timestamp: getTimestamp(),
            raw: text
        })

        // Ensure flush timer is running
        startFlushTimer()
    }

    function addSystemLine(text) {
        pendingLogs.push({
            text,
            source: 'system',
            level: 'system',
            timestamp: getTimestamp(),
            raw: text
        })
        startFlushTimer()
    }

    function startFlushTimer() {
        if (!flushTimer) {
            flushTimer = setInterval(flushLogs, FLUSH_INTERVAL_MS)
        }
    }

    function stopFlushTimer() {
        if (flushTimer) {
            clearInterval(flushTimer)
            flushTimer = null
        }
    }

    function flushLogs() {
        if (pendingLogs.length === 0) return

        // Remove welcome message if present
        const welcome = logViewerContent.querySelector('.llv-welcome')
        if (welcome) welcome.remove()

        const fragment = document.createDocumentFragment()

        for (const entry of pendingLogs) {
            // Add to buffer
            logBuffer.push(entry)
            
            // Create DOM element
            const lineEl = document.createElement('div')
            lineEl.className = `llv-line ${entry.level}`
            
            lineEl.innerHTML = `<span class="llv-timestamp">[${entry.timestamp}]</span>${escapeHtml(entry.text)}`
            
            fragment.appendChild(lineEl)
            lineCount++
        }

        logViewerContent.appendChild(fragment)
        pendingLogs = []

        // Trim if too many lines
        if (lineCount > MAX_LOG_LINES) {
            trimOldLines()
        }

        // Update footer
        updateLineCount()

        // Auto-scroll
        if (autoScroll && isVisible) {
            scrollToBottom()
        }
    }

    function trimOldLines() {
        const lines = logViewerContent.querySelectorAll('.llv-line')
        const toRemove = Math.min(TRIM_AMOUNT, lines.length - (MAX_LOG_LINES - TRIM_AMOUNT))
        
        for (let i = 0; i < toRemove; i++) {
            lines[i].remove()
            if (logBuffer.length > 0) logBuffer.shift()
        }
        
        lineCount -= toRemove
    }

    function classifyLogLevel(text, source) {
        if (source === 'stderr') return 'error'
        
        const lower = text.toLowerCase()
        
        // Error patterns
        if (lower.includes('/error]') || lower.includes('error:') || 
            lower.includes('exception') || lower.includes('crash') ||
            lower.includes('failed') || lower.includes('fatal') ||
            lower.includes('caused by:') || lower.includes('at java.') ||
            lower.includes('at net.minecraft') || lower.includes('at cpw.mods')) {
            return 'error'
        }
        
        // Warning patterns
        if (lower.includes('/warn]') || lower.includes('warning:') || 
            lower.includes('warn:') || lower.includes('[warn]')) {
            return 'warn'
        }
        
        // Debug patterns
        if (lower.includes('/debug]') || lower.includes('debug:') || lower.includes('[debug]')) {
            return 'debug'
        }
        
        // Info patterns
        if (lower.includes('/info]') || lower.includes('info:') || lower.includes('[info]')) {
            return 'info'
        }
        
        return 'stdout'
    }

    function clearLogs() {
        logBuffer = []
        pendingLogs = []
        lineCount = 0
        
        logViewerContent.innerHTML = `
            <div class="llv-welcome">
                📋 Logs limpiados.<br>
                ${isGameRunning ? 'El juego sigue corriendo, los nuevos logs aparecerán aquí.' : 'Inicia Minecraft para ver logs.'}
            </div>
        `
        updateLineCount()
    }

    // =========================================================================
    // Export Functions
    // =========================================================================
    function copyToClipboard() {
        const text = getAllLogsAsText()
        navigator.clipboard.writeText(text).then(() => {
            showButtonFeedback('llvCopy', '✓ Copiado!')
        }).catch(err => {
            console.error('[LiveLogViewer] Copy failed:', err)
            showButtonFeedback('llvCopy', '✗ Error')
        })
    }

    function exportToFile() {
        const fs = require('fs')
        const path = require('path')

        try {
            // Obtener directorio de datos del launcher
            const dataPath = ConfigManager.getLauncherDirectory()
            const logsDir = path.join(dataPath, 'logs')

            // Crear carpeta logs si no existe
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true })
            }

            // Generar nombre de archivo con timestamp
            const now = new Date()
            const timestamp = now.getFullYear().toString() +
                (now.getMonth() + 1).toString().padStart(2, '0') +
                now.getDate().toString().padStart(2, '0') + '-' +
                now.getHours().toString().padStart(2, '0') +
                now.getMinutes().toString().padStart(2, '0') +
                now.getSeconds().toString().padStart(2, '0')
            
            const filename = `minecraft-${timestamp}.txt`
            const filePath = path.join(logsDir, filename)

            // Escribir archivo
            const text = getAllLogsAsText()
            fs.writeFileSync(filePath, text, 'utf8')

            // Mostrar toast de éxito
            showToast(`✓ Exportado: ${filePath}`, false)
            showButtonFeedback('llvExport', '✓')
            console.log('[LiveLogViewer] Exported to:', filePath)

        } catch (err) {
            console.error('[LiveLogViewer] Export failed:', err)
            showToast(`✗ Error al exportar: ${err.message}`, true)
            showButtonFeedback('llvExport', '✗')
        }
    }

    function getAllLogsAsText() {
        let text = '═'.repeat(60) + '\n'
        text += '  TECNILAND NEXUS - Minecraft Live Logs\n'
        text += `  Exported: ${new Date().toISOString()}\n`
        text += `  Total lines: ${logBuffer.length}\n`
        text += '═'.repeat(60) + '\n\n'

        for (const entry of logBuffer) {
            text += `[${entry.timestamp}] ${entry.raw}\n`
        }

        return text
    }

    // =========================================================================
    // UI Helpers
    // =========================================================================
    function updateStatus(status) {
        if (!logViewerStatusLabel) return

        logViewerStatusLabel.className = 'llv-status ' + status
        
        switch (status) {
            case 'running':
                logViewerStatusLabel.textContent = '● Running'
                break
            case 'stopped':
                logViewerStatusLabel.textContent = '● Stopped'
                break
            default:
                logViewerStatusLabel.textContent = '● Idle'
        }
    }

    function updateLineCount() {
        if (logViewerLineCount) {
            logViewerLineCount.textContent = `${lineCount} líneas`
        }
    }

    function scrollToBottom() {
        if (logViewerContent) {
            logViewerContent.scrollTop = logViewerContent.scrollHeight
        }
    }

    function getTimestamp() {
        const now = new Date()
        return now.toLocaleTimeString('es-ES', { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        })
    }

    function escapeHtml(text) {
        const div = document.createElement('div')
        div.textContent = text
        return div.innerHTML
    }

    function showButtonFeedback(buttonId, text) {
        const btn = document.getElementById(buttonId)
        if (!btn) return
        
        const originalText = btn.textContent
        btn.textContent = text
        setTimeout(() => {
            btn.textContent = originalText
        }, 1500)
    }

    function showToast(message, isError = false) {
        // Remover toast anterior si existe
        const existingToast = logViewerPanel.querySelector('.llv-toast')
        if (existingToast) {
            existingToast.remove()
        }

        // Crear nuevo toast
        const toast = document.createElement('div')
        toast.className = 'llv-toast' + (isError ? ' error' : '')
        toast.textContent = message
        logViewerPanel.appendChild(toast)

        // Auto-remover después de 4 segundos
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove()
            }
        }, 4000)
    }

    // =========================================================================
    // Public API
    // =========================================================================
    window.LiveLogViewer = {
        show: showPanel,
        hide: hidePanel,
        toggle: togglePanel,
        clear: clearLogs,
        addLine: addLogLine,
        isVisible: () => isVisible,
        isGameRunning: () => isGameRunning
    }

    // Expose for landing.js compatibility
    window.showLiveLogViewerForGame = function() {
        if (ConfigManager.getShowLiveLogs()) {
            showPanel()
        }
    }

    window.hideLiveLogViewerForGame = function() {
        // Keep visible after game closes so user can review logs
        // They can close manually if desired
    }

    // =========================================================================
    // Initialize
    // =========================================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init)
    } else {
        // Small delay to ensure other scripts are loaded
        setTimeout(init, 50)
    }

})()
