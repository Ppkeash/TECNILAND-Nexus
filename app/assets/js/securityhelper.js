/**
 * SecurityHelper
 * 
 * Módulo de utilidades de seguridad para TECNILAND Nexus.
 * Proporciona sanitización de HTML, validación de URLs, y otras funciones de seguridad.
 * 
 * Este módulo está diseñado para ejecutarse en el contexto del renderer de Electron,
 * donde las APIs del navegador (DOMParser, document) están disponibles.
 * 
 * @module securityhelper
 * @version 1.0.0
 */

/* eslint-env browser */

const isDev = require('./isdev')

/**
 * Tags HTML permitidos en contenido de noticias
 * Solo tags seguros que no pueden ejecutar JavaScript
 */
const ALLOWED_TAGS = [
    'p', 'br', 'b', 'i', 'u', 'strong', 'em', 'span', 'div',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'blockquote', 'pre', 'code',
    'hr'
]

/**
 * Atributos permitidos por tag
 */
const ALLOWED_ATTRS = {
    'a': ['href', 'title', 'target', 'rel'],
    'img': ['src', 'alt', 'title', 'width', 'height', 'class', 'style'],
    'div': ['class', 'style', 'id'],
    'span': ['class', 'style'],
    'p': ['class', 'style'],
    'h1': ['class', 'style'],
    'h2': ['class', 'style'],
    'h3': ['class', 'style'],
    'h4': ['class', 'style'],
    'h5': ['class', 'style'],
    'h6': ['class', 'style'],
    'table': ['class', 'style'],
    'tr': ['class', 'style'],
    'td': ['class', 'style', 'colspan', 'rowspan'],
    'th': ['class', 'style', 'colspan', 'rowspan'],
    'ul': ['class', 'style'],
    'ol': ['class', 'style'],
    'li': ['class', 'style'],
    'blockquote': ['class', 'style'],
    'pre': ['class'],
    'code': ['class']
}

/**
 * Dominios permitidos para enlaces externos
 */
const ALLOWED_DOMAINS = [
    // TECNILAND Oficial
    'tecnilandnex.online',       // Frontend oficial
    'tecniland-backend.fly.dev', // Backend API (Fly.io)
    'tecniland.net',
    'tecniland.com',
    // Desarrollo
    'tecniland.local',
    'localhost',
    // Terceros de confianza
    'github.com',
    'discord.gg',
    'discord.com',
    'minecraft.net',
    'mojang.com',
    'curseforge.com',
    'modrinth.com',
    'youtube.com',
    'youtu.be',
    'twitter.com',
    'x.com',
    'fly.dev'  // Fly.io platform
]

/**
 * Protocolos permitidos en URLs
 */
const ALLOWED_PROTOCOLS = ['http:', 'https:']

/**
 * Patrones de JavaScript peligrosos en atributos
 */
const DANGEROUS_PATTERNS = [
    /javascript:/gi,
    /vbscript:/gi,
    /on\w+\s*=/gi,  // onclick, onerror, onload, etc.
    /<script/gi,
    /<\/script/gi,
    /expression\s*\(/gi
]

/**
 * Sanitiza contenido HTML para prevenir XSS
 * Usa el DOM del navegador (disponible en Electron renderer)
 * 
 * @param {string} html - HTML a sanitizar
 * @param {Object} options - Opciones de sanitización
 * @returns {string} HTML sanitizado
 */
function sanitizeHTML(html, options = {}) {
    if (!html || typeof html !== 'string') {
        return ''
    }

    // Verificar si estamos en el contexto del navegador
    if (typeof document === 'undefined') {
        // Fallback: usar sanitización básica con regex si no hay DOM
        return sanitizeHTMLBasic(html)
    }

    const opts = {
        allowImages: options.allowImages !== false,
        allowLinks: options.allowLinks !== false,
        allowStyles: options.allowStyles !== false
    }

    try {
        // Crear un documento temporal para parsear el HTML
        const parser = new DOMParser()
        const doc = parser.parseFromString(html, 'text/html')
        
        // Limpiar el documento
        cleanNode(doc.body, opts)
        
        return doc.body.innerHTML
    } catch (e) {
        console.error('[SecurityHelper] Error sanitizando HTML:', e)
        return sanitizeHTMLBasic(html)
    }
}

/**
 * Sanitización básica con regex (fallback)
 */
function sanitizeHTMLBasic(html) {
    if (!html) return ''
    
    // Remover scripts
    let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    
    // Remover event handlers
    clean = clean.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
    clean = clean.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '')
    
    // Remover javascript: urls
    clean = clean.replace(/javascript:/gi, '')
    clean = clean.replace(/vbscript:/gi, '')
    
    return clean
}

/**
 * Limpia recursivamente un nodo DOM
 */
function cleanNode(node, opts) {
    const nodesToRemove = []
    
    for (const child of node.childNodes) {
        // ELEMENT_NODE = 1
        if (child.nodeType === 1) {
            const tagName = child.tagName.toLowerCase()
            
            // Verificar si el tag está permitido
            if (!ALLOWED_TAGS.includes(tagName)) {
                nodesToRemove.push(child)
                continue
            }
            
            // Reglas especiales para img y a
            if (tagName === 'img' && !opts.allowImages) {
                nodesToRemove.push(child)
                continue
            }
            if (tagName === 'a' && !opts.allowLinks) {
                nodesToRemove.push(child)
                continue
            }
            
            // Limpiar atributos
            cleanAttributes(child, tagName, opts)
            
            // Procesar hijos recursivamente
            cleanNode(child, opts)
            
        // COMMENT_NODE = 8
        } else if (child.nodeType === 8) {
            nodesToRemove.push(child)
        }
    }
    
    // Remover nodos marcados
    for (const n of nodesToRemove) {
        node.removeChild(n)
    }
}

/**
 * Limpia los atributos de un elemento
 */
function cleanAttributes(element, tagName, opts) {
    const allowedAttrs = ALLOWED_ATTRS[tagName] || []
    const attrsToRemove = []
    
    for (const attr of element.attributes) {
        const attrName = attr.name.toLowerCase()
        
        // Verificar si el atributo está permitido
        if (!allowedAttrs.includes(attrName)) {
            attrsToRemove.push(attr.name)
            continue
        }
        
        // Verificar patrones peligrosos en el valor
        if (isDangerousValue(attr.value)) {
            attrsToRemove.push(attr.name)
            continue
        }
        
        // Validar href en enlaces
        if (attrName === 'href') {
            if (!isValidUrl(attr.value)) {
                element.setAttribute('href', '#')
            }
        }
        
        // Validar src en imágenes
        if (attrName === 'src') {
            if (!isValidImageUrl(attr.value)) {
                attrsToRemove.push(attr.name)
            }
        }
        
        // Limpiar estilos si no están permitidos o son peligrosos
        if (attrName === 'style') {
            if (!opts.allowStyles) {
                attrsToRemove.push(attr.name)
            } else {
                const cleanStyle = sanitizeStyle(attr.value)
                if (cleanStyle) {
                    element.setAttribute('style', cleanStyle)
                } else {
                    attrsToRemove.push(attr.name)
                }
            }
        }
    }
    
    // Remover atributos marcados
    for (const attrName of attrsToRemove) {
        element.removeAttribute(attrName)
    }
    
    // Para enlaces, asegurar que abran en nueva ventana de forma segura
    if (tagName === 'a' && element.hasAttribute('href')) {
        element.setAttribute('target', '_blank')
        element.setAttribute('rel', 'noopener noreferrer')
    }
}

/**
 * Verifica si un valor contiene patrones peligrosos
 */
function isDangerousValue(value) {
    if (!value || typeof value !== 'string') return false
    
    for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(value)) {
            return true
        }
    }
    return false
}

/**
 * Valida una URL para enlaces
 */
function isValidUrl(url) {
    if (!url || typeof url !== 'string') return false
    
    // Permitir anclas internas
    if (url.startsWith('#')) return true
    
    // Permitir URLs relativas simples
    if (url.startsWith('/') && !url.startsWith('//')) return true
    
    try {
        const parsed = new URL(url)
        
        // Verificar protocolo
        if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
            return false
        }
        
        // En desarrollo, permitir cualquier dominio
        if (isDev) return true
        
        // Verificar dominio
        const isAllowed = ALLOWED_DOMAINS.some(domain => 
            parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
        )
        if (!isAllowed) {
            console.warn('[SecurityHelper] URL bloqueada (dominio no permitido):', url)
            return false
        }
        
        return true
    } catch (e) {
        return false
    }
}

/**
 * Valida una URL de imagen
 */
function isValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false
    
    // Permitir data URLs de imágenes (solo formatos seguros)
    if (url.startsWith('data:image/')) {
        const mimeMatch = url.match(/^data:image\/(png|jpeg|jpg|gif|webp);/)
        return mimeMatch !== null
    }
    
    // Permitir URLs relativas
    if (url.startsWith('/') && !url.startsWith('//')) return true
    
    try {
        const parsed = new URL(url)
        return ALLOWED_PROTOCOLS.includes(parsed.protocol)
    } catch (e) {
        return false
    }
}

/**
 * Sanitiza estilos CSS inline
 */
function sanitizeStyle(style) {
    if (!style || typeof style !== 'string') return null
    
    const allowedProperties = [
        'color', 'background-color', 'background',
        'font-size', 'font-weight', 'font-style', 'font-family',
        'text-align', 'text-decoration', 'text-transform',
        'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
        'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
        'border', 'border-radius', 'border-color', 'border-width', 'border-style',
        'width', 'max-width', 'min-width',
        'height', 'max-height', 'min-height',
        'display', 'flex', 'flex-direction', 'justify-content', 'align-items',
        'opacity', 'visibility',
        'line-height', 'letter-spacing',
        'object-fit', 'object-position'
    ]
    
    if (isDangerousValue(style)) {
        return null
    }
    
    const cleanProps = []
    const declarations = style.split(';').map(s => s.trim()).filter(s => s)
    
    for (const decl of declarations) {
        const colonIndex = decl.indexOf(':')
        if (colonIndex === -1) continue
        
        const property = decl.substring(0, colonIndex).trim().toLowerCase()
        const value = decl.substring(colonIndex + 1).trim()
        
        if (allowedProperties.includes(property) && !isDangerousValue(value)) {
            cleanProps.push(`${property}: ${value}`)
        }
    }
    
    return cleanProps.length > 0 ? cleanProps.join('; ') : null
}

/**
 * Valida y limpia una URL antes de abrirla con shell.openExternal
 */
function validateExternalUrl(url) {
    if (!url || typeof url !== 'string') {
        return { valid: false, url: '', reason: 'URL vacía o inválida' }
    }
    
    try {
        const parsed = new URL(url)
        
        // Solo permitir http/https
        if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
            return { 
                valid: false, 
                url: '', 
                reason: `Protocolo no permitido: ${parsed.protocol}` 
            }
        }
        
        // En desarrollo, permitir cualquier dominio
        if (isDev) {
            return { valid: true, url: url }
        }
        
        // Verificar dominio
        const isAllowed = ALLOWED_DOMAINS.some(domain => 
            parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
        )
        if (!isAllowed) {
            return { 
                valid: false, 
                url: '', 
                reason: `Dominio no permitido: ${parsed.hostname}` 
            }
        }
        
        return { valid: true, url: url }
        
    } catch (e) {
        return { valid: false, url: '', reason: 'URL mal formada' }
    }
}

/**
 * Escapa texto para prevenir inyección HTML
 */
function escapeHTML(text) {
    if (!text || typeof text !== 'string') return ''
    
    const htmlEntities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        '\'': '&#39;'
    }
    
    return text.replace(/[&<>"']/g, char => htmlEntities[char])
}

/**
 * Verifica si estamos en modo desarrollo
 */
function isDevMode() {
    return isDev
}

/**
 * Log de seguridad (solo en desarrollo)
 */
function securityLog(message, data) {
    if (isDev) {
        console.log(`[SecurityHelper] ${message}`, data || '')
    }
}

module.exports = {
    sanitizeHTML,
    validateExternalUrl,
    escapeHTML,
    isValidUrl,
    isValidImageUrl,
    isDevMode,
    securityLog,
    ALLOWED_DOMAINS,
    ALLOWED_PROTOCOLS
}
