/**
 * SYNC.JS — Módulo de sincronización con Google Sheets (Versión Blindada)
 * CRM 5 Tierras — Compartido entre todos los proyectos
 * 
 * Depende de: shared/config.js (debe cargarse antes)
 */
const SyncModule = (() => {
    let projectName = '';
    let syncInterval = null;
    let isSyncing = false;

    function isConfigured() {
        return typeof CRM_CONFIG !== 'undefined' && 
               CRM_CONFIG.APPS_SCRIPT_URL && 
               CRM_CONFIG.APPS_SCRIPT_URL !== 'PEGA_TU_URL_AQUI';
    }

    function normID(id) {
        return String(id || '').replace(/[^0-9]/g, '').replace(/^0+/, '') || '0';
    }

    function getEstadoKey(status) {
        if (!status || String(status).trim() === '') return null;
        const s = String(status).toLowerCase().trim();
        if (s.includes('disp')) return 'Disponible';
        if (s.includes('res')) return 'Reservada';
        if (s.includes('vend')) return 'Vendida';
        return null; // Unknown status → ignore, don't override local data
    }

    /**
     * Inicializar el módulo para un proyecto específico
     */
    function init(name) {
        projectName = name;
        
        if (!isConfigured()) {
            console.warn('SyncModule: URL no configurada. Modo offline.');
            updateSyncIndicator('offline');
            return Promise.resolve(null);
        }

        updateSyncIndicator('syncing');

        return fetchFromSheet()
            .then(data => {
                updateSyncIndicator('online');
                pushPendingChanges();
                if (CRM_CONFIG.SYNC_INTERVAL > 0) {
                    syncInterval = setInterval(() => {
                        fetchFromSheet().then(() => updateSyncIndicator('online'));
                    }, CRM_CONFIG.SYNC_INTERVAL);
                }
                return data;
            })
            .catch(err => {
                console.warn('SyncModule: Error de conexión.', err);
                updateSyncIndicator('offline');
                return null;
            });
    }

    /**
     * Leer datos del proyecto desde Google Sheets
     */
    function fetchFromSheet(retryCount = 0) {
        if (!isConfigured()) return Promise.resolve(null);

        const url = CRM_CONFIG.APPS_SCRIPT_URL + '?action=read&proyecto=' + encodeURIComponent(projectName) + '&t=' + Date.now();
        
        return fetch(url)
            .then(function(r) { 
                if (r.status === 503 && retryCount < 2) {
                    console.warn('SyncModule: Google 503 (Saturado), reintentando en 2s...');
                    return new Promise(resolve => setTimeout(resolve, 2000)).then(() => fetchFromSheet(retryCount + 1));
                }
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json(); 
            })
            .then(function(data) {
                if (data.error) {
                    console.warn('SyncModule fetch error:', data.error);
                    return null;
                }
                if (data.lotes && data.lotes.length > 0 && typeof DataModule !== 'undefined') {
                    applyRemoteData(data.lotes);
                }
                return data.lotes;
            });
    }

    /**
     * Aplicar datos remotos al DataModule local
     */
    function applyRemoteData(remoteLotes) {
        if (!remoteLotes || remoteLotes.length === 0) return;

        var collection = DataModule.getAll();
        var pendingQueue = typeof DataModule.getSyncQueue === 'function' ? DataModule.getSyncQueue() : [];
        var pendingIds = new Set(pendingQueue.map(item => normID(item.id)));
        var changed = false;

        remoteLotes.forEach(function(remoteLote) {
            var remoteId = normID(remoteLote.Lote || remoteLote.lote);
            
            // CRITICAL SHIELD: If this lote has a local update pending, IGNORE remote data
            if (pendingIds.has(remoteId)) {
                console.log('SyncModule: Protected lote ' + remoteId + ' from remote overwrite (pending local change)');
                return;
            }

            var localFeature = collection.features.find(function(f) {
                var localId = normID(f.properties.id_lote || f.properties.Lote || f.properties.fid || f.properties.name);
                return localId === remoteId;
            });

            if (localFeature) {
                // Sync status — only override if remote has a valid, recognized estado
                var remoteEstado = getEstadoKey(remoteLote.Estado || remoteLote.estado);

                // CRITICAL: Ignore empty or invalid remote status to prevent overwriting local state
                if (remoteEstado && remoteEstado !== localFeature.properties.estado) {
                    console.log('SyncModule: Update lote ' + remoteId + ' state -> ' + remoteEstado);
                    localFeature.properties.estado = remoteEstado;
                    localFeature.properties.Estado = remoteEstado;
                    changed = true;
                }

                if (remoteLote.Comentario !== undefined && remoteLote.Comentario !== localFeature.properties.comentario) {
                    localFeature.properties.comentario = remoteLote.Comentario || '';
                    changed = true;
                }

                var rawPrecio = remoteLote.Precio !== undefined ? remoteLote.Precio : remoteLote.precio;
                var precio = NaN;

                if (typeof rawPrecio === 'number') {
                    precio = rawPrecio;
                } else if (rawPrecio !== undefined && rawPrecio !== null && String(rawPrecio).trim() !== '') {
                    precio = parseInt(String(rawPrecio).replace(/[^0-9]/g, ''), 10);
                }
                
                // Only update if it's a valid number and greater than or equal to 0
                if (!isNaN(precio) && precio >= 0 && precio !== localFeature.properties.precio) {
                    localFeature.properties.precio = precio;
                    localFeature.properties.precio_display = DataModule.formatPrice(precio);
                    changed = true;
                }
            }
        });

        if (changed && DataModule.STORAGE_KEY) {
            localStorage.setItem(DataModule.STORAGE_KEY, JSON.stringify(collection));
            if (typeof window.refreshMap === 'function') window.refreshMap();
        }
    }

    /**
     * Enviar actualización de un lote a Google Sheets
     */
    function pushUpdate(loteId, updates) {
        if (!isConfigured()) {
            addToPendingQueue(loteId, updates);
            return Promise.resolve(false);
        }

        updateSyncIndicator('syncing');

        var payload = {
            proyecto: projectName,
            lote: String(loteId),
            modificado_por: 'App CRM'
        };

        if (updates.estado !== undefined) {
            payload.estado = updates.estado;
            payload.Estado = updates.estado;
        }
        if (updates.precio !== undefined) {
            payload.precio = updates.precio;
            payload.Precio = updates.precio;
        }
        if (updates.comentario !== undefined) payload.comentario = updates.comentario;

        return fetch(CRM_CONFIG.APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        })
        .then(function() {
            updateSyncIndicator('online');
            return true;
        })
        .catch(function(err) {
            console.warn('SyncModule push error:', err);
            addToPendingQueue(loteId, updates);
            updateSyncIndicator('pending');
            return false;
        });
    }

    /**
     * Cola de cambios pendientes (modo offline)
     */
    function addToPendingQueue(loteId, updates) {
        var key = 'crm_sync_pending_' + projectName;
        var queue = JSON.parse(localStorage.getItem(key) || '[]');
        queue.push({ loteId: loteId, updates: updates, timestamp: new Date().toISOString() });
        localStorage.setItem(key, JSON.stringify(queue));
        updateSyncIndicator('pending');
    }

    function pushPendingChanges() {
        if (!isConfigured() || isSyncing) return;
        
        var key = 'crm_sync_pending_' + projectName;
        var queue = JSON.parse(localStorage.getItem(key) || '[]');
        
        if (queue.length === 0) return;

        isSyncing = true;
        console.log('SyncModule: Enviando ' + queue.length + ' cambios pendientes...');

        var sendNext = function(index) {
            if (index >= queue.length) {
                localStorage.setItem(key, '[]');
                isSyncing = false;
                updateSyncIndicator('online');
                return;
            }

            var item = queue[index];
            var payload = {
                proyecto: projectName,
                lote: String(item.loteId),
                modificado_por: 'App CRM'
            };
            if (item.updates.estado !== undefined) payload.estado = item.updates.estado;
            if (item.updates.precio !== undefined) payload.precio = item.updates.precio;
            if (item.updates.comentario !== undefined) payload.comentario = item.updates.comentario;

            fetch(CRM_CONFIG.APPS_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload)
            })
            .then(function() { sendNext(index + 1); })
            .catch(function() {
                isSyncing = false;
                updateSyncIndicator('pending');
            });
        };

        sendNext(0);
    }

    /**
     * Indicador visual de sincronización
     */
    function updateSyncIndicator(status) {
        var indicator = document.getElementById('sync-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'sync-indicator';
            indicator.style.cssText = 
                'position:fixed;top:12px;right:12px;padding:6px 14px;' +
                'border-radius:20px;font-size:12px;font-weight:600;' +
                'font-family:Inter,sans-serif;z-index:10000;' +
                'transition:all 0.3s ease;backdrop-filter:blur(10px);' +
                'cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
            indicator.addEventListener('click', function() {
                if (isConfigured()) {
                    updateSyncIndicator('syncing');
                    fetchFromSheet().then(function() {
                        updateSyncIndicator('online');
                        if (typeof window.refreshMap === 'function') window.refreshMap();
                    });
                }
            });
            document.body.appendChild(indicator);
        }

        var styles = {
            online:  { bg: 'rgba(34,197,94,0.9)',  text: '☁️ Sincronizado',    color: '#fff' },
            syncing: { bg: 'rgba(59,130,246,0.9)',  text: '🔄 Sincronizando...', color: '#fff' },
            pending: { bg: 'rgba(234,179,8,0.9)',   text: '⏳ Pendiente',        color: '#000' },
            offline: { bg: 'rgba(107,114,128,0.7)', text: '🔴 Offline',          color: '#fff' }
        };

        var s = styles[status] || styles.offline;
        indicator.style.backgroundColor = s.bg;
        indicator.style.color = s.color;
        indicator.textContent = s.text;
    }

    return {
        init: init,
        push: pushUpdate,
        fetch: fetchFromSheet,
        isConfigured: isConfigured,
        pushPendingChanges: pushPendingChanges
    };
})();
