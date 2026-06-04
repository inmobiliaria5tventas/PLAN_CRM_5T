/**
 * CONFIG.JS — Configuración global del CRM 5 Tierras
 * 
 * ⚠️ IMPORTANTE: Reemplaza la URL de abajo con la URL de tu Google Apps Script
 * después de publicarlo como Web App.
 */
const CRM_CONFIG = {
    // ── Pega aquí la URL de tu Google Apps Script Web App ──
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyKufnQ_3RXeav6xN03r7d6wcUGkTRAMhLUTLrGc8YW28Et1MyJ93QBLRIVR0a6aikR/exec',
    
    // ── Nombres de los proyectos (deben coincidir con las hojas del Sheet) ──
    PROYECTOS: {
        'Las Brisas': 'Las Brisas',
        'Los Naranjos': 'Los Naranjos',
        'El Copihue': 'El Copihue',
        'Los Encinos': 'Los Encinos'
    },

    // ── Intervalo de sincronización automática (milisegundos) ──
    SYNC_INTERVAL: 60000, // 1 minuto
};
