/**
 * APP.JS - Hacienda El Copihue - Mobile Management App
 * (Generic Template v5.1)
 */

(() => {
    let map;
    let lotesLayer;
    let selectedLote = null;
    let isOnline = true;
    let highlightedLayer = null;
    let userMarker = null;

    const ESTADO_COLORS = {
        'Disponible': { fill: '#22c55e', stroke: '#16a34a', opacity: 0.45 },
        'Reservada': { fill: '#eab308', stroke: '#ca8a04', opacity: 0.5 },
        'Vendida': { fill: '#ef4444', stroke: '#dc2626', opacity: 0.45 },
    };

    function init() {
        try {
            showLoading();
            DataModule.init();
            initMap();
            renderLotes();
            updateStats();
            setupEventListeners();
            simulateOnlineStatus();

            let loaded = false;
            const forceLoad = setTimeout(() => {
                if (!loaded) {
                    console.warn('Sync taking too long, showing map with local data...');
                    hideLoading();
                    loaded = true;
                }
            }, 5000);

            // ── Sync con Google Sheets ──
            if (typeof SyncModule !== 'undefined') {
                SyncModule.init(DataModule.PROJECT_NAME)
                    .then(function() {
                        renderLotes();
                        updateStats();
                    })
                    .finally(() => {
                        if (!loaded) {
                            clearTimeout(forceLoad);
                            hideLoading();
                            loaded = true;
                        }
                    });
            } else {
                hideLoading();
                loaded = true;
            }
        } catch (error) {
            console.error('Error during project initialization:', error);
            hideLoading();
        }
    }

    window.refreshMap = function() {
        renderLotes();
        updateStats();
    };

    function showLoading() {
        const bar = document.querySelector('.loading-bar-inner');
        if (bar) {
            let w = 0;
            const interval = setInterval(() => {
                w += Math.random() * 25;
                if (w > 90) w = 90;
                bar.style.width = w + '%';
                if (w >= 90) clearInterval(interval);
            }, 100);
        }
    }

    function hideLoading() {
        const bar = document.querySelector('.loading-bar-inner');
        if (bar) bar.style.width = '100%';

        setTimeout(() => {
            const screen = document.querySelector('.loading-screen');
            if (screen) {
                screen.classList.add('fade-out');
                setTimeout(() => screen.remove(), 500);
            }
        }, 600);
    }

    function initMap() {
        map = L.map('map', {
            zoomControl: false,
            maxZoom: 20,
            minZoom: 13,
            attributionControl: false
        });

        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 20
        }).addTo(map);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
            maxZoom: 20, opacity: 0.6
        }).addTo(map);

        // Dynamic Map Center
        const cfg = DataModule.MAP_CONFIG || { center: [0, 0], zoom: 15 };
        map.setView(cfg.center, cfg.zoom);

        map.on('locationfound', onLocationFound);
        map.on('locationerror', onLocationError);

        function updateLabelsVisibility() {
            if (map.getZoom() < 16) map.getContainer().classList.add('map-low-zoom');
            else map.getContainer().classList.remove('map-low-zoom');
        }
        map.on('zoomend', updateLabelsVisibility);
        updateLabelsVisibility();

        map.on('click', (e) => {
            if (!e.originalEvent._loteClicked) closeBottomSheet();
        });
    }

    function renderLotes() {
        if (lotesLayer) map.removeLayer(lotesLayer);
        const collection = DataModule.getAll();

        const validFeatures = collection.features.filter(f => 
            f.geometry && f.geometry.coordinates && f.geometry.coordinates.length > 0
        );
        const validCollection = { ...collection, features: validFeatures };

        lotesLayer = L.geoJSON(validCollection, {
            style: (feature) => {
                const colors = ESTADO_COLORS[feature.properties.estado] || ESTADO_COLORS['Disponible'];
                return { fillColor: colors.fill, fillOpacity: colors.opacity, color: colors.stroke, weight: 2 };
            },
            onEachFeature: (feature, layer) => {
                layer.bindTooltip(`Lote ${feature.properties.id_lote || feature.properties.Lote}`, {
                    permanent: true, direction: 'center', className: 'lote-label'
                });
                layer.on('click', (e) => {
                    e.originalEvent._loteClicked = true;
                    selectLote(feature, layer);
                });
            }
        }).addTo(map);
    }

    function selectLote(feature, layer) {
        selectedLote = feature;
        if (highlightedLayer) {
            const prev = ESTADO_COLORS[highlightedLayer.feature.properties.estado] || ESTADO_COLORS['Disponible'];
            highlightedLayer.setStyle({ weight: 2, fillOpacity: prev.opacity });
        }
        highlightedLayer = layer;
        layer.setStyle({ weight: 4, fillOpacity: 0.8, color: '#fff' });

        const props = feature.properties;
        const estado = props.estado || props.Estado || 'Disponible';
        const isVendida = estado === 'Vendida';

        document.getElementById('bs-lote-id').textContent = `Lote ${props.id_lote || props.Lote}`;
        document.getElementById('bs-lote-area').textContent = props.area;
        
        const displayPrice = (props.precio !== undefined && props.precio !== null) ? DataModule.formatPrice(props.precio) : DataModule.formatPrice(33000000);
        const finalPriceDisplay = props.precio_display || displayPrice;
        document.getElementById('bs-price-value').textContent = finalPriceDisplay;
        
        const badge = document.getElementById('bs-current-status');
        badge.className = `bottomsheet__current-status bottomsheet__current-status--${estado.toLowerCase()}`;
        badge.innerHTML = `<span>●</span> ${estado}`;

        // Buttons
        document.querySelectorAll('.status-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.estado === estado);
        });

        // Visibility
        document.querySelector('.status-buttons').style.display = 'grid';
        document.getElementById('price-row').style.display = 'flex';
        
        const vendidaInfo = document.getElementById('bs-vendida-info');
        if (isVendida) {
            vendidaInfo.style.display = 'block';
            vendidaInfo.innerHTML = '⚠️ <b>Lote marcado como Vendido.</b><br>Edite con precaución si desea cambiar el estado.';
        } else {
            vendidaInfo.style.display = 'none';
        }

        // Last modified
        const date = props.ultima_modificacion ? new Date(props.ultima_modificacion) : new Date();
        document.getElementById('bs-last-modified').textContent = 
            `Última actualización: ${date.toLocaleDateString('es-CL')} ${date.toLocaleTimeString('es-CL', {hour:'2-digit', minute:'2-digit'})}`;

        // Comment
        const comentario = props.comentario || '';
        document.getElementById('comment-textarea').value = comentario;
        updateCommentPreview(comentario);
        closeCommentPanel();

        openBottomSheet();
        map.flyTo(layer.getBounds().getCenter(), 18, { duration: 0.5 });
    }

    function openBottomSheet() {
        document.getElementById('bottomsheet').classList.add('active');
        document.getElementById('bottomsheet-overlay').classList.add('active');
        document.querySelector('.stats-bar').classList.add('hidden');
    }

    function closeBottomSheet() {
        document.getElementById('bottomsheet').classList.remove('active');
        document.getElementById('bottomsheet-overlay').classList.remove('active');
        document.querySelector('.stats-bar').classList.remove('hidden');
        closeCommentPanel();
        if (highlightedLayer) {
            const colors = ESTADO_COLORS[highlightedLayer.feature.properties.estado] || ESTADO_COLORS['Disponible'];
            highlightedLayer.setStyle({ weight: 2, fillOpacity: colors.opacity, color: colors.stroke });
            highlightedLayer = null;
        }
    }

    function closeCommentPanel() {
        const btn = document.getElementById('comment-toggle-btn');
        const panel = document.getElementById('comment-panel');
        if (btn) btn.classList.remove('open');
        if (panel) panel.classList.remove('open');
    }

    function updateCommentPreview(text) {
        const preview = document.getElementById('comment-btn-preview');
        const deleteBtn = document.getElementById('comment-delete-btn');
        if (!preview) return;
        if (text && text.trim()) {
            preview.textContent = text.trim();
            preview.classList.add('has-comment');
            if (deleteBtn) deleteBtn.classList.add('visible');
        } else {
            preview.textContent = 'Agregar comentario...';
            preview.classList.remove('has-comment');
            if (deleteBtn) deleteBtn.classList.remove('visible');
        }
    }

    function changeStatus(newEstado) {
        if (!selectedLote) return;
        const loteId = selectedLote.properties.id_lote || selectedLote.properties.Lote;

        selectedLote.properties.estado = newEstado;
        selectedLote.properties.Estado = newEstado;

        const updates = { estado: newEstado };
        if (newEstado === 'Vendida') {
            // Keep price
        }
        DataModule.updateLote(loteId, updates);

        if (typeof SyncModule !== 'undefined') {
            SyncModule.push(loteId, updates);
        }

        renderLotes();
        updateStats();
        
        const updated = DataModule.getLoteById(loteId);
        let newLayer = null;
        if (lotesLayer) {
            const searchId = String(loteId).replace(/[^0-9]/g, '').replace(/^0+/, '') || '0';
            lotesLayer.eachLayer(l => {
                const lid = String(l.feature.properties.id_lote || l.feature.properties.Lote || '').replace(/[^0-9]/g, '').replace(/^0+/, '') || '0';
                if (lid === searchId) newLayer = l;
            });
        }
        if (updated && newLayer) {
            highlightedLayer = newLayer;
            selectLote(updated, newLayer);
        }
        showToast(`Lote ${loteId} → ${newEstado}`, 'success');
    }

    function updateStats() {
        const stats = DataModule.getStats();
        const dispEl = document.getElementById('stat-disponible');
        const resEl = document.getElementById('stat-reservada');
        const vendEl = document.getElementById('stat-vendida');
        const totalEl = document.getElementById('stats-total');
        
        const total = (stats.disponible || 0) + (stats.reservada || 0) + (stats.vendida || 0);
        if (dispEl) dispEl.textContent = stats.disponible;
        if (resEl) resEl.textContent = stats.reservada;
        if (vendEl) vendEl.textContent = stats.vendida;
        if (totalEl) totalEl.textContent = total;

        // Progress Bars Logic
        const setBar = (id, val) => {
            const el = document.getElementById(id);
            if (!el) return;
            const percent = total > 0 ? (val / total) * 100 : 0;
            el.style.width = percent + '%';
        };

        setBar('bar-disp', stats.disponible);
        setBar('bar-res', stats.reservada);
        setBar('bar-vend', stats.vendida);
    }

    function setupEventListeners() {
        const safeAdd = (id, event, callback) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(event, callback);
        };

        const safeAddAll = (selector, event, callback) => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                if (el) el.addEventListener(event, (e) => callback(el, e));
            });
        };

        safeAdd('bs-close', 'click', closeBottomSheet);
        safeAdd('bottomsheet-overlay', 'click', closeBottomSheet);
        
        safeAddAll('.status-btn', 'click', (btn) => changeStatus(btn.dataset.estado));

        safeAdd('search-btn', 'click', searchLote);
        safeAdd('search-input', 'keypress', (e) => {
            if (e.key === 'Enter') searchLote();
        });
        safeAdd('fab-locate', 'click', locateUser);

        // Share Link (Direct Copy for WhatsApp)
        safeAdd('share-link-btn', 'click', () => {
            const copySuccess = () => showToast('Enlace copiado para WhatsApp \u2713', 'success');
            const copyError = () => showToast('Error al copiar enlace', 'warning');
            let url = window.location.href;
            
            // Universal Mapping (Covers all possible folder names)
            const projectMapping = {
                'las_brisas': 'hacienda_brisas',
                'Las Brisas': 'hacienda_brisas',
                'hacienda_copihue': 'hacienda_copihue',
                'El_Copihue': 'hacienda_copihue',
                'El Copihue': 'hacienda_copihue',
                'hacienda_encinos': 'hacienda_encinos',
                'Los_Encinos': 'hacienda_encinos',
                'Los Encinos': 'hacienda_encinos',
                'fundo_naranjos': 'hacienda_naranjos',
                'Los Naranjos': 'hacienda_naranjos'
            };

            const projTo = projectMapping[Object.keys(projectMapping).find(key => url.toLowerCase().includes('/' + key.toLowerCase().replace(/ /g, '%20') + '/'))];
            
            if (projTo) {
                let baseUrl = url;
                if (url.match(/02_GESTION/i)) baseUrl = url.split(/02_GESTION/i)[0];
                else if (url.match(/Proyectos_ventas/i)) baseUrl = url.split(/Proyectos_ventas/i)[0];
                
                url = baseUrl + '01_CLIENTES/' + projTo + '/app/index.html';
            }

            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(url).then(copySuccess).catch(() => fallbackCopy(url));
            } else { fallbackCopy(url); }

            function fallbackCopy(text) {
                const ta = document.createElement('textarea');
                ta.value = text;
                // Ensure it's not visible but part of the DOM
                ta.style.position = 'absolute';
                ta.style.left = '-9999px';
                ta.style.top = '0';
                document.body.appendChild(ta);
                
                // Select and copy
                const selected = document.getSelection().rangeCount > 0 ? document.getSelection().getRangeAt(0) : false;
                ta.select();
                ta.setSelectionRange(0, 99999); // For mobile
                
                let success = false;
                try {
                    success = document.execCommand('copy');
                } catch (err) {
                    console.error('Fallback copy failed', err);
                }
                
                document.body.removeChild(ta);
                if (selected) {
                    document.getSelection().removeAllRanges();
                    document.getSelection().addRange(selected);
                }

                if (success) copySuccess(); else copyError();
            }
        });

        // Comment toggle
        safeAdd('comment-toggle-btn', 'click', () => {
            const btn = document.getElementById('comment-toggle-btn');
            const panel = document.getElementById('comment-panel');
            if (btn && panel) {
                const isOpen = btn.classList.toggle('open');
                panel.classList.toggle('open', isOpen);
                if (isOpen) {
                    const textarea = document.getElementById('comment-textarea');
                    if (textarea) textarea.focus();
                }
            }
        });

        // Save comment
        safeAdd('comment-save-btn', 'click', () => {
            if (!selectedLote) return;
            const textarea = document.getElementById('comment-textarea');
            if (!textarea) return;
            const text = textarea.value.trim();
            const id = selectedLote.properties.id_lote || selectedLote.properties.Lote;
            DataModule.updateLote(id, { comentario: text });
            if (typeof SyncModule !== 'undefined') SyncModule.push(id, { comentario: text });
            selectedLote.properties.comentario = text;
            updateCommentPreview(text);
            closeCommentPanel();
            showToast('Comentario guardado ✓', 'success');
        });

        // Delete comment
        safeAdd('comment-delete-btn', 'click', (e) => {
            e.stopPropagation();
            if (!selectedLote) return;
            const id = selectedLote.properties.id_lote || selectedLote.properties.Lote;
            DataModule.updateLote(id, { comentario: '' });
            if (typeof SyncModule !== 'undefined') SyncModule.push(id, { comentario: '' });
            selectedLote.properties.comentario = '';
            const textarea = document.getElementById('comment-textarea');
            if (textarea) textarea.value = '';
            updateCommentPreview('');
            closeCommentPanel();
            showToast('Comentario borrado', 'info');
        });

        // ── Price Numpad ──
        let numpadValue = '';
        const numpadOverlay = document.getElementById('numpad-overlay');
        const numpadDisplayValue = document.getElementById('numpad-display-value');

        const openNumpad = () => {
            if (!selectedLote) return;
            numpadValue = String(selectedLote.properties.precio || '');
            updateNumpadDisplay();
            if (numpadOverlay) numpadOverlay.classList.add('active');
        };

        safeAdd('price-row', 'click', openNumpad);
        safeAdd('price-edit-icon', 'click', (e) => {
            e.stopPropagation();
            openNumpad();
        });

        safeAdd('numpad-cancel', 'click', () => {
            if (numpadOverlay) numpadOverlay.classList.remove('active');
        });

        safeAddAll('.numpad__key', 'click', (key) => {
            const k = key.dataset.key;
            if (k === 'back') numpadValue = numpadValue.slice(0, -1);
            else if (k === 'confirm') {
                const precio = numpadValue === '' ? 0 : parseInt(numpadValue, 10);
                if (selectedLote) {
                    const id = selectedLote.properties.id_lote || selectedLote.properties.Lote;
                    DataModule.updateLote(id, { precio: precio });
                    if (typeof SyncModule !== 'undefined') SyncModule.push(id, { precio: precio });
                    selectedLote.properties.precio = precio;
                    selectedLote.properties.precio_display = DataModule.formatPrice(precio);
                    const priceVal = document.getElementById('bs-price-value');
                    if (priceVal) priceVal.textContent = DataModule.formatPrice(precio);
                    showToast('Precio actualizado ✓', 'success');
                }
                if (numpadOverlay) numpadOverlay.classList.remove('active');
            } else {
                if (numpadValue.length < 12) numpadValue += k;
            }
            updateNumpadDisplay();
        });

        function updateNumpadDisplay() {
            const val = parseInt(numpadValue, 10) || 0;
            if (numpadDisplayValue) numpadDisplayValue.innerHTML = '<span class="currency">$</span> ' + val.toLocaleString('es-CL');
        }
    }

    function locateUser() {
        const btn = document.getElementById('fab-locate');
        btn.classList.add('locating');
        map.locate({ setView: true, maxZoom: 18 });
    }

    function onLocationFound(e) {
        const btn = document.getElementById('fab-locate');
        btn.classList.remove('locating');
        if (userMarker) map.removeLayer(userMarker);
        const gpsIcon = L.divIcon({
            className: 'gps-marker',
            html: '<div class="gps-marker__pulse"></div><div class="gps-marker__dot"></div>',
            iconSize: [40, 40], iconAnchor: [20, 20]
        });
        userMarker = L.marker(e.latlng, { icon: gpsIcon }).addTo(map);
    }

    function onLocationError(e) {
        const btn = document.getElementById('fab-locate');
        btn.classList.remove('locating');
        showToast('No se pudo obtener la ubicación', 'warning');
    }

    function searchLote() {
        const val = document.getElementById('search-input').value.trim();
        const searchId = String(val).replace(/[^0-9]/g, '').replace(/^0+/, '') || '0';
        let found = null;
        lotesLayer.eachLayer(l => {
            const lid = String(l.feature.properties.id_lote || l.feature.properties.Lote || '').replace(/[^0-9]/g, '').replace(/^0+/, '') || '0';
            if (lid === searchId) found = l;
        });
        if (found) selectLote(found.feature, found);
        else showToast('Lote no encontrado', 'warning');
    }

    function showToast(msg, type) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const t = document.createElement('div');
        t.className = `toast toast--${type}`;
        t.innerHTML = `<i class="fa-solid fa-circle-info"></i> ${msg}`;
        container.appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }

    function simulateOnlineStatus() {
        isOnline = navigator.onLine;
        window.addEventListener('online', () => isOnline = true);
        window.addEventListener('offline', () => isOnline = false);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
