/**
 * APP.JS - Los Naranjos - Client Viewer App
 * (Standardized Sync v5.1)
 */

(() => {
    let map;
    let lotesLayer;
    let selectedLote = null;
    let highlightedLayer = null;

    const ESTADO_COLORS = {
        'Disponible': { fill: '#2ecc71', stroke: '#27ae60', opacity: 0.5 },
        'Reservada':  { fill: '#f1c40f', stroke: '#f39c12', opacity: 0.6 },
        'Vendida':    { fill: '#e74c3c', stroke: '#c0392b', opacity: 0.5 },
    };

    function init() {
        try {
            showLoading();
            DataModule.init();
            initMap();
            renderLotes();
            updateStats();
            setupEventListeners();

            let loaded = false;
            const forceLoad = setTimeout(() => {
                if (!loaded) {
                    hideLoading();
                    loaded = true;
                }
            }, 5000);

            // ── Real-time Sync ──
            if (typeof SyncModule !== 'undefined') {
                SyncModule.init(DataModule.PROJECT_NAME)
                    .then(() => {
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
            console.error('Initialization error:', error);
            hideLoading();
        }
    }

    window.refreshMap = () => {
        renderLotes();
        updateStats();
        if (selectedLote) {
            const updated = DataModule.getLoteById(selectedLote.properties.id_lote || selectedLote.properties.Lote);
            if (updated) showDetails(updated.properties);
        }
    };

    function showLoading() {
        const bar = document.querySelector('.loading-bar-inner');
        if (bar) bar.style.width = '70%';
    }

    function hideLoading() {
        const bar = document.querySelector('.loading-bar-inner');
        if (bar) bar.style.width = '100%';
        setTimeout(() => {
            const screen = document.querySelector('.loading-screen');
            if (screen) screen.classList.add('fade-out');
        }, 300);
    }

    function initMap() {
        map = L.map('map', { zoomControl: false, attributionControl: false });
        
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 20
        }).addTo(map);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
            maxZoom: 20, opacity: 0.6
        }).addTo(map);

        const center = [-36.479, -71.837]; // Los Naranjos
        map.setView(center, 16);

        map.on('click', (e) => {
            if (!e.originalEvent._loteClicked) closeBottomSheet();
        });

        map.on('locationfound', onLocationFound);
        map.on('locationerror', onLocationError);
        
        map.on('zoomend', updateZoomClass);
        updateZoomClass();
    }

    function updateZoomClass() {
        const container = map.getContainer();
        if (map.getZoom() < 16) {
            container.classList.add('map-low-zoom');
        } else {
            container.classList.remove('map-low-zoom');
        }
    }

    function renderLotes() {
        if (lotesLayer) map.removeLayer(lotesLayer);
        const collection = DataModule.getAll();

        // Safety filter to prevent "latlngs not passed" error
        const validFeatures = (collection.features || []).filter(f => 
            f.geometry && f.geometry.coordinates && (
                (f.geometry.type === 'Polygon' && f.geometry.coordinates.length > 0) ||
                (f.geometry.type === 'MultiPolygon' && f.geometry.coordinates.length > 0) ||
                (f.geometry.type === 'Point' && f.geometry.coordinates.length === 2)
            )
        );
        const validCollection = { ...collection, features: validFeatures };

        lotesLayer = L.geoJSON(validCollection, {
            style: (f) => {
                const status = f.properties.estado || f.properties.Estado || 'Disponible';
                const colors = ESTADO_COLORS[status] || ESTADO_COLORS['Disponible'];
                const border = colors.stroke || '#27ae60';
                return { fillColor: colors.fill, fillOpacity: colors.opacity, color: border, weight: 1.5 };
            },
            onEachFeature: (f, layer) => {
                layer.bindTooltip(`Lote ${f.properties.id_lote || f.properties.Lote}`, {
                    permanent: true, direction: 'center', className: 'lote-label'
                });
                layer.on('click', (e) => {
                    e.originalEvent._loteClicked = true;
                    selectLote(f, layer);
                });
            }
        }).addTo(map);
        
        // Ajustar el zoom al tamaño completo del proyecto al cargar
        if (lotesLayer.getLayers().length > 0) {
            map.fitBounds(lotesLayer.getBounds(), { padding: [10, 10] });
        }
    }

    function selectLote(feature, layer) {
        selectedLote = feature;
        if (highlightedLayer) {
            const prev = ESTADO_COLORS[highlightedLayer.feature.properties.estado] || ESTADO_COLORS['Disponible'];
            highlightedLayer.setStyle({ weight: 1.5, fillOpacity: prev.opacity });
        }
        highlightedLayer = layer;
        layer.setStyle({ weight: 3, fillOpacity: 0.8, color: '#fff' });

        showDetails(feature.properties, layer.getBounds().getCenter());
        openBottomSheet();
        map.flyTo(layer.getBounds().getCenter(), 17, { duration: 0.5 });
    }

    function showDetails(props, center) {
        const estado = props.estado || 'Disponible';
        const isVendida = estado === 'Vendida';

        document.getElementById('bs-lote-id').textContent = `Lote ${props.id_lote || props.Lote}`;
        document.getElementById('bs-lote-area').textContent = props.area || '5.000 m²';
        
        const finalPrice = isVendida ? 0 : props.precio;
        document.getElementById('bs-price-value').textContent = DataModule.formatPrice(finalPrice);
        
        const badge = document.getElementById('bs-current-status');
        badge.className = `bottomsheet__current-status bottomsheet__current-status--${estado.toLowerCase()}`;
        badge.innerHTML = `<span>●</span> ${estado}`;

        // Update Navigation Links
        if (center) {
            const lat = center.lat;
            const lng = center.lng;
            document.getElementById('btn-nav-google').href = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
            document.getElementById('btn-nav-waze').href = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
        }
    }


    function openBottomSheet() {
        document.getElementById('bottomsheet').classList.add('active');
        document.getElementById('bottomsheet-overlay').classList.add('active');
    }

    function closeBottomSheet() {
        document.getElementById('bottomsheet').classList.remove('active');
        document.getElementById('bottomsheet-overlay').classList.remove('active');
        if (highlightedLayer) {
            const status = highlightedLayer.feature.properties.estado || highlightedLayer.feature.properties.Estado || 'Disponible';
            const colors = ESTADO_COLORS[status] || ESTADO_COLORS['Disponible'];
            highlightedLayer.setStyle({ weight: 1.5, fillOpacity: colors.opacity, color: colors.stroke });
            highlightedLayer = null;
        }
    }

    function updateStats() {
        const stats = DataModule.getStats();
        if (document.getElementById('stat-disponible')) document.getElementById('stat-disponible').textContent = stats.disponible;
        if (document.getElementById('stat-reservada')) document.getElementById('stat-reservada').textContent = stats.reservada;
        if (document.getElementById('stat-vendida')) document.getElementById('stat-vendida').textContent = stats.vendida;
    }

    function setupEventListeners() {
        if (document.getElementById('bs-close')) {
            document.getElementById('bs-close').addEventListener('click', closeBottomSheet);
        }
        document.getElementById('bottomsheet-overlay').addEventListener('click', closeBottomSheet);
        
        const locateBtn = document.getElementById('fab-locate');
        if (locateBtn) locateBtn.addEventListener('click', locateUser);

        const shareBtn = document.getElementById('share-link-btn');
        if (shareBtn) {
            shareBtn.addEventListener('click', () => {
                const url = window.location.href;
                const copySuccess = () => {
                    const originalHtml = shareBtn.innerHTML;
                    shareBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
                    shareBtn.style.color = '#10b981';
                    setTimeout(() => {
                        shareBtn.innerHTML = originalHtml;
                        shareBtn.style.color = '';
                    }, 2000);
                };
                const copyError = () => console.error('Error al copiar el enlace');

                if (navigator.clipboard && window.isSecureContext) {
                    navigator.clipboard.writeText(url).then(copySuccess).catch(() => fallbackCopy(url));
                } else {
                    fallbackCopy(url);
                }

                function fallbackCopy(text) {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.position = 'absolute';
                    ta.style.left = '-9999px';
                    ta.style.top = '0';
                    document.body.appendChild(ta);
                    
                    const selected = document.getSelection().rangeCount > 0 ? document.getSelection().getRangeAt(0) : false;
                    ta.select();
                    ta.setSelectionRange(0, 99999);
                    
                    let success = false;
                    try { success = document.execCommand('copy'); } catch (err) {}
                    
                    document.body.removeChild(ta);
                    if (selected) {
                        document.getSelection().removeAllRanges();
                        document.getSelection().addRange(selected);
                    }
                    if (success) copySuccess(); else copyError();
                }
            });
        }
    }

    function locateUser() {
        const btn = document.getElementById('fab-locate');
        if (btn) btn.classList.add('locating');
        map.locate({ 
            setView: true, 
            maxZoom: 18,
            enableHighAccuracy: true,
            timeout: 10000
        });
    }

    function onLocationFound(e) {
        const btn = document.getElementById('fab-locate');
        if (btn) btn.classList.remove('locating');
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
        if (btn) btn.classList.remove('locating');
        alert('No se pudo obtener la ubicación. Asegúrese de tener el GPS activado y dar permisos.');
    }

    function searchLote() {
        const val = document.getElementById('search-input').value.trim().toLowerCase();
        let found = null;
        lotesLayer.eachLayer(l => {
            const id = String(l.feature.properties.id_lote || l.feature.properties.Lote).toLowerCase();
            if (id.includes(val)) found = l;
        });
        if (found) selectLote(found.feature, found);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
