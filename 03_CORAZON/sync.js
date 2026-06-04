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
        if (!remoteLotes || remoteLotes.length === 0 || typeof DataModule === 'undefined') return;

        var collection = typeof DataModule.getAll === 'function' ? DataModule.getAll() : { features: [] };
        var pendingQueue = typeof DataModule.getSyncQueue === 'function' ? DataModule.getSyncQueue() : [];
        var pendingIds = new Set(pendingQueue.map(function(item) { return normID(item.id || item.loteId); }));
        var changed = false;

        remoteLotes.forEach(function(remoteLote) {
            var remoteId = normID(remoteLote.Lote || remoteLote.lote);
            
            // CRITICAL SHIELD: If this lote has a local update pending, IGNORE remote data
            if (pendingIds.has(remoteId)) {
                console.log('SyncModule: Protected lote ' + remoteId + ' from remote overwrite (pending local change)');
                return;
            }

            var localFeature = collection.features.find(function(f) {
                var props = f.properties || {};
                var localId = normID(props.id_lote || props.Lote || props.fid || props.name);
                return localId === remoteId;
            });

            if (localFeature) {
                // Ensure id_lote exists locally for future lookups
                if (!localFeature.properties.id_lote) localFeature.properties.id_lote = remoteId;

                // Sync status — only override if remote has a valid, recognized estado
                var remoteEstado = getEstadoKey(remoteLote.Estado || remoteLote.estado);

                // CRITICAL: Ignore empty or invalid remote status to prevent overwriting local state
                if (remoteEstado && remoteEstado !== localFeature.properties.estado) {
                    console.log('SyncModule: Update lote ' + remoteId + ' state -> ' + remoteEstado);
                    localFeature.properties.estado = remoteEstado;
                    localFeature.properties.Estado = remoteEstado;
                    changed = true;
                }

                // Sync comments
                var remoteComment = remoteLote.Comentario !== undefined ? remoteLote.Comentario : remoteLote.comentario;
                if (remoteComment !== undefined && remoteComment !== localFeature.properties.comentario) {
                    localFeature.properties.comentario = remoteComment || '';
                    localFeature.properties.Comentario = remoteComment || '';
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
                if (!isNaN(precio) && precio >= 0) {
                    if (precio !== localFeature.properties.precio) {
                        console.log('SyncModule: Lote ' + remoteId + ' PRICE update -> ' + precio);
                        localFeature.properties.precio = precio;
                        localFeature.properties.Precio = precio;
                        if (typeof DataModule.formatPrice === 'function') {
                            localFeature.properties.precio_display = DataModule.formatPrice(precio);
                        }
                        changed = true;
                    }
                }
            } else {
                // If lote doesn't exist locally, we can't sync it easily without geometry
                // console.warn('SyncModule: Remote lote ' + remoteId + ' not found in local GeoJSON');
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
    /**
     * Indicador visual de sincronización (Versión Minimalista)
     */
    function updateSyncIndicator(status) {
        var indicator = document.getElementById('sync-indicator');
        if (!indicator) return; // No auto-create to respect minimalist manual design

        // Remove old classes and add new status
        indicator.classList.remove('online', 'syncing', 'pending', 'offline');
        indicator.classList.add(status);
        
        // Compatibility with legacy apps (if they don't have the new CSS)
        if (!indicator.classList.contains('sync-dot')) {
            var colors = {
                online: '#22c55e',
                syncing: '#3b82f6',
                pending: '#eab308',
                offline: '#ef4444'
            };
            indicator.style.backgroundColor = colors[status] || '#ef4444';
            indicator.style.color = '#fff';
            indicator.style.padding = '4px 8px';
            indicator.style.borderRadius = '20px';
            indicator.style.fontSize = '10px';
            indicator.textContent = status.toUpperCase();
        }
    }

    return {
        init: init,
        push: pushUpdate,
        fetch: fetchFromSheet,
        isConfigured: isConfigured,
        pushPendingChanges: pushPendingChanges
    };
})();
