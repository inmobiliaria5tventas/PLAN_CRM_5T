/**
 * APP_UNIFIED.JS - Controlador Principal de la UI
 * Ecosistema Digital 5 Tierras - Consola de Control de GIS & CRM
 */

const CRM_APP = (() => {
    // Estado de la UI
    let activeRole = 'gerente'; // 'gerente', 'vendedor', 'administrador'
    let activeTab = 'dashboard'; // 'dashboard', 'mapa', 'aprobaciones', 'mesa-documental', 'inventario', 'auditoria'
    
    // Estado GIS/Leaflet
    let mapInstance = null;
    let currentGeojsonGroup = null;
    let selectedLoteLayer = null; // Instancia Leaflet del lote seleccionado actualmente
    let selectedLoteData = null;  // Objeto con { proyecto, loteNum }
    
    // Instancias de Gráficos Chart.js (para poder destruirlos al recrearlos)
    let chartCompositionInstance = null;
    let chartProjectsInstance = null;

    // Colores para estados
    const STATUS_COLORS = {
        'Disponible': '#2ecc71',
        'Reservada-Pendiente': '#f39c12',
        'Reservada': '#f1c40f',
        'En Promesa': '#3498db',
        'Vendida': '#e74c3c',
        'Bloqueada': '#7f8c8d'
    };

    // Coordenadas centrales por defecto para proyectos
    const PROJECT_CENTERS = {
        'El Copihue': { center: [-36.120, -71.776], zoom: 15 },
        'Las Brisas': { center: [-36.385, -71.953], zoom: 16 },
        'Los Encinos': { center: [-36.468, -71.842], zoom: 16 },
        'Los Naranjos': { center: [-36.478, -71.838], zoom: 15 }
    };

    // Formatear Dinero
    function formatMoney(amount) {
        return new Intl.NumberFormat('es-CL', {
            style: 'currency',
            currency: 'CLP',
            maximumFractionDigits: 0
        }).format(amount || 0);
    }

    // Mostrar Toasts
    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        
        let icon = 'fa-circle-check';
        if (type === 'error') icon = 'fa-triangle-exclamation';
        if (type === 'warning') icon = 'fa-circle-exclamation';

        toast.innerHTML = `
            <i class="fa-solid ${icon}"></i>
            <span>${message}</span>
        `;
        container.appendChild(toast);

        // Remover automáticamente después de 3.5 segundos
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3500);
    }

    // Inicialización al cargar la aplicación
    function init() {
        // Inicializar Base de Datos Local
        CRM_DB.init();

        // Inicializar Mapa Leaflet
        initMap();

        // Cargar por defecto el proyecto El Copihue
        loadProjectOnMap('El Copihue');

        // Escuchar cambios de rol y pestañas
        switchRole(activeRole);
        switchTab(activeTab);

        // Renderizar todo
        refreshAll();
    }

    // Inicializar el Mapa
    function initMap() {
        const mapContainer = document.getElementById('console-map');
        if (!mapContainer) return;

        // Centrado por defecto en El Copihue
        mapInstance = L.map('console-map', { zoomControl: false }).setView([-36.120, -71.776], 15);
        
        // Capa satelital de Google
        L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
            attribution: 'Google Satellite Maps'
        }).addTo(mapInstance);

        L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);

        // Grupo de capas para los polígonos GeoJSON
        currentGeojsonGroup = L.layerGroup().addTo(mapInstance);

        // Evento de zoom para mostrar u ocultar etiquetas de lotes
        mapInstance.on('zoomend', () => {
            const zoom = mapInstance.getZoom();
            if (zoom >= 16) {
                mapContainer.classList.add('show-labels');
            } else {
                mapContainer.classList.remove('show-labels');
            }
        });
    }

    // Cambiar de Rol (Demo/Gerencia/Comercial/Admin)
    function switchRole(role) {
        activeRole = role;
        
        const roleNames = {
            gerente: { name: 'Ximena Guzmán (Gerente)', label: 'Gerente General' },
            vendedor: { name: 'Ricardo Comercial (Vendedor)', label: 'Vendedor / Comercial' },
            administrador: { name: 'Claudio Documental (Admin)', label: 'Mesa Legal / Documentación' }
        };

        const currentRoleInfo = roleNames[role] || roleNames.gerente;

        // Actualizar UI Header
        document.getElementById('header-user-name').innerText = currentRoleInfo.name;
        document.getElementById('header-user-role').innerText = currentRoleInfo.label;

        showToast(`Rol cambiado a: ${currentRoleInfo.label}`, 'warning');

        // Si hay un lote seleccionado en el visualizador, redibujar su formulario de acción según el nuevo rol
        if (selectedLoteData) {
            renderLoteActionForm();
        }

        refreshAll();
    }

    // Cambiar de Pestaña (SPA Navigation)
    function switchTab(tabId) {
        activeTab = tabId;

        // Actualizar barra de navegación activa
        document.querySelectorAll('.sidebar-menu .menu-item').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-tab') === tabId) {
                btn.classList.add('active');
            }
        });

        // Ocultar todos los paneles
        document.querySelectorAll('.tab-content-panel').forEach(panel => {
            panel.classList.remove('active');
        });

        // Mostrar panel activo
        const activePanel = document.getElementById(`panel-${tabId}`);
        if (activePanel) {
            activePanel.classList.add('active');
        }

        // Actualizar Breadcrumbs
        const tabLabels = {
            dashboard: 'Dashboard Gerencial',
            mapa: 'Visualizador GIS Territorial',
            aprobaciones: 'Aprobaciones Pendientes',
            'mesa-documental': 'Mesa Documental & Escrituras',
            inventario: 'Inventario de Lotes',
            auditoria: 'Log de Auditoría'
        };
        document.getElementById('breadcrumb-active').innerText = tabLabels[tabId] || 'Inicio';

        // Acciones específicas por pestaña
        if (tabId === 'mapa') {
            // Fuerza a Leaflet a recalcular tamaños por si estaba oculto en carga
            setTimeout(() => {
                if (mapInstance) mapInstance.invalidateSize();
            }, 100);
        } else if (tabId === 'dashboard') {
            // Renderizar gráficos del dashboard
            renderDashboardCharts();
        }

        refreshAll();
    }

    // Cargar Geometría de Proyecto en el Mapa
    function loadProjectOnMap(projectName) {
        if (!mapInstance || !currentGeojsonGroup) return;

        // Limpiar capas previas
        currentGeojsonGroup.clearLayers();
        selectedLoteLayer = null;
        selectedLoteData = null;

        // Ocultar panel de detalles y mostrar el placeholder "Selecciona un lote"
        document.getElementById('map-lote-details-box').style.display = 'none';
        document.getElementById('map-no-selection').style.display = 'flex';

        // Mapeo de GeoJSON cargados en DOM
        const geojsonSources = {
            'El Copihue': window.json_copihue_lotes,
            'Las Brisas': window.json_brisas_lotes,
            'Los Encinos': window.json_encinos_lotes,
            'Los Naranjos': window.json_naranjos_lotes
        };

        const geoJsonData = geojsonSources[projectName];
        if (!geoJsonData) {
            console.warn(`No se encontró geometría cargada para el proyecto: ${projectName}`);
            return;
        }

        // Cargar Capas GeoJSON
        L.geoJSON(geoJsonData, {
            style: (feature) => {
                const props = feature.properties || {};
                const loteNum = getNormalizedLoteNum(props);
                const dbLote = CRM_DB.getLote(projectName, loteNum);
                const estado = dbLote ? dbLote.estado : 'Disponible';
                
                return {
                    fillColor: STATUS_COLORS[estado] || STATUS_COLORS.Disponible,
                    weight: 1,
                    opacity: 0.9,
                    color: 'white',
                    fillOpacity: 0.45
                };
            },
            onEachFeature: (feature, layer) => {
                const props = feature.properties || {};
                const loteNum = getNormalizedLoteNum(props);

                // Agregar etiqueta permanente en el centro
                if (loteNum && loteNum !== '0') {
                    layer.bindTooltip(loteNum.toString(), {
                        permanent: true,
                        direction: 'center',
                        className: 'lot-label'
                    });
                }

                // Evento click sobre el polígono del lote
                layer.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    selectLoteOnMap(projectName, loteNum, layer);
                    mapInstance.flyTo(e.latlng, 17, { duration: 1.5 });
                });
            }
        }).addTo(currentGeojsonGroup);

        // Mover el mapa al centro del proyecto
        const viewConfig = PROJECT_CENTERS[projectName];
        if (viewConfig) {
            mapInstance.setView(viewConfig.center, viewConfig.zoom);
        }
    }

    // Extraer y normalizar número de lote desde propiedades GeoJSON
    function getNormalizedLoteNum(properties) {
        let rawId = properties.Lote || properties.name || properties.fid || properties.id || '';
        return String(rawId || '').replace(/[^0-9]/g, '').replace(/^0+/, '') || '0';
    }

    // Seleccionar Lote al hacer click en el Mapa
    function selectLoteOnMap(projectName, loteNum, layer) {
        // Restaurar estilo del lote previamente seleccionado
        if (selectedLoteLayer && selectedLoteLayer.feature) {
            const oldProps = selectedLoteLayer.feature.properties || {};
            const oldLoteNum = getNormalizedLoteNum(oldProps);
            const oldDbLote = CRM_DB.getLote(selectedLoteData.proyecto, oldLoteNum);
            const oldEstado = oldDbLote ? oldDbLote.estado : 'Disponible';

            selectedLoteLayer.setStyle({
                weight: 1,
                color: 'white',
                fillOpacity: 0.45,
                fillColor: STATUS_COLORS[oldEstado]
            });
        }

        // Establecer nueva selección
        selectedLoteLayer = layer;
        selectedLoteData = { proyecto: projectName, loteNum: loteNum };

        // Destacar visualmente el lote seleccionado (borde blanco grueso)
        layer.setStyle({
            weight: 4,
            color: '#ffffff',
            fillOpacity: 0.75
        });
        layer.bringToFront();

        // Mostrar Detalles en el Panel Lateral
        showLoteSidebarDetails(projectName, loteNum);
    }

    // Cargar detalles de lote en el panel lateral
    function showLoteSidebarDetails(proyecto, loteNum) {
        const dbLote = CRM_DB.getLote(proyecto, loteNum);
        if (!dbLote) {
            showToast('Lote no encontrado en el motor de base de datos.', 'error');
            return;
        }

        document.getElementById('map-no-selection').style.display = 'none';
        const card = document.getElementById('map-lote-details-box');
        card.style.display = 'flex';

        // Actualizar textos
        document.getElementById('map-lote-id').innerText = `Lote ${dbLote.lote}`;
        document.getElementById('map-lote-project').innerText = dbLote.proyecto;
        document.getElementById('map-lote-area').innerText = dbLote.area;
        document.getElementById('map-lote-price').innerText = formatMoney(dbLote.precioLista);
        
        // Estado Badge
        const statusBadge = document.getElementById('map-lote-status-badge');
        statusBadge.innerText = dbLote.estado;
        statusBadge.className = 'status-tag-map';
        
        // Clases de color de badge
        const badgeClasses = {
            'Disponible': 'badge--disponible',
            'Reservada-Pendiente': 'badge--reservada',
            'Reservada': 'badge--reservada',
            'En Promesa': 'badge--promesa',
            'Vendida': 'badge--vendida',
            'Bloqueada': 'badge--bloqueada'
        };
        statusBadge.classList.add(badgeClasses[dbLote.estado] || 'badge--disponible');

        // Log de Auditoría / Historial de este lote
        document.getElementById('map-lote-history-user').innerText = `Modificado por: ${dbLote.modificadoPor}`;
        document.getElementById('map-lote-history-date').innerText = new Date(dbLote.ultimaActualizacion).toLocaleDateString('es-CL');

        // Comentario de Lote
        const commentBox = document.getElementById('map-lote-comment-box');
        if (dbLote.comentario) {
            commentBox.style.display = 'block';
            document.getElementById('map-lote-comment').innerText = dbLote.comentario;
        } else {
            commentBox.style.display = 'none';
        }

        // Renderizar el formulario de acciones comerciales
        renderLoteActionForm();
    }

    // Renderizar los controles y formularios dinámicos en el sidebar de lote
    function renderLoteActionForm() {
        if (!selectedLoteData) return;

        const dbLote = CRM_DB.getLote(selectedLoteData.proyecto, selectedLoteData.loteNum);
        const formArea = document.getElementById('map-lote-action-form');
        formArea.innerHTML = ''; // Limpiar

        // 1. Obtener transacción activa para el lote si aplica
        const txs = CRM_DB.getTransacciones().filter(t => t.proyecto === dbLote.proyecto && t.lote === dbLote.lote);
        // La transacción activa es la que no esté rechazada
        const activeTx = txs.find(t => t.estado_documental !== 'Rechazada');

        // 2. Construir formulario en base al estado
        let actionHTML = '';

        if (dbLote.estado === 'Disponible') {
            // Un lote disponible puede ser reservado por Comercial (vendedor) o Gerente
            if (activeRole === 'vendedor' || activeRole === 'gerente') {
                actionHTML = `
                    <h3 class="role-form-title"><i class="fa-solid fa-file-invoice-dollar"></i> Generar Propuesta de Reserva</h3>
                    <form id="form-solicitar-reserva" onsubmit="CRM_APP.handleSolicitarReserva(event)">
                        <div class="form-group-unified">
                            <label>Nombre del Cliente</label>
                            <input type="text" id="sol-cliente-nombre" required placeholder="Ej: Roberto Guzmán">
                        </div>
                        <div class="form-group-unified">
                            <label>RUT Cliente</label>
                            <input type="text" id="sol-cliente-rut" placeholder="Ej: 12.345.678-9">
                        </div>
                        <div class="grid-2-cols" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                            <div class="form-group-unified">
                                <label>Monto Reserva</label>
                                <input type="number" id="sol-monto-reserva" value="200000" min="50000">
                            </div>
                            <div class="form-group-unified">
                                <label>Precio Ofertado</label>
                                <input type="number" id="sol-precio-oferta" value="${dbLote.precioLista}">
                            </div>
                        </div>
                        <div class="form-group-unified">
                            <label>Notas / Comprobante</label>
                            <textarea id="sol-notas" placeholder="Detalles de contacto, link a comprobante..." rows="2"></textarea>
                        </div>
                        <button type="submit" class="btn-unified btn-primary-unified" style="width:100%;">
                            <i class="fa-solid fa-paper-plane"></i> Solicitar Reserva de Parcela
                        </button>
                    </form>
                `;
            } else {
                actionHTML = `
                    <div class="lock-panel-message">
                        <i class="fa-solid fa-lock"></i>
                        <span>Acceso de sólo lectura para tu rol en lotes disponibles.</span>
                    </div>
                `;
            }
        } 
        
        else if (dbLote.estado === 'Reservada-Pendiente') {
            // Lote con reserva por aprobar
            if (activeRole === 'gerente') {
                actionHTML = `
                    <div class="approval-card-map">
                        <span class="card-tag">Revisión de Reserva</span>
                        <div class="card-row"><strong>Cliente:</strong> ${activeTx ? activeTx.cliente_nombre : 'N/A'}</div>
                        <div class="card-row"><strong>Oferta:</strong> ${activeTx ? formatMoney(activeTx.precio_oferta) : 'N/A'}</div>
                        <div class="card-row"><strong>Monto Reserva:</strong> ${activeTx ? formatMoney(activeTx.monto_reserva) : 'N/A'}</div>
                        <div class="card-row"><strong>Vendedor:</strong> ${activeTx ? activeTx.vendedor : 'N/A'}</div>
                    </div>
                    
                    <div class="form-group-unified">
                        <label>Motivo de Rechazo (Sólo si rechaza)</label>
                        <input type="text" id="rej-motivo-text" placeholder="Fondos no válidos, lote equivocado, etc.">
                    </div>

                    <div class="grid-2-cols" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                        <button onclick="CRM_APP.handleAprobarReserva('${activeTx ? activeTx.id_transaccion : ''}')" class="btn-unified btn-success-unified">
                            <i class="fa-solid fa-check"></i> Aprobar
                        </button>
                        <button onclick="CRM_APP.handleRechazarReserva('${activeTx ? activeTx.id_transaccion : ''}')" class="btn-unified btn-danger-unified">
                            <i class="fa-solid fa-xmark"></i> Rechazar
                        </button>
                    </div>
                `;
            } else {
                actionHTML = `
                    <div class="lock-panel-message">
                        <i class="fa-solid fa-clock animate-pulse"></i>
                        <span>Reserva ingresada. Pendiente de aprobación por gerencia.</span>
                    </div>
                `;
            }
        } 
        
        else if (dbLote.estado === 'Reservada') {
            // Reserva aprobada. Esperando promesa de compraventa (Admin o Gerencia firman)
            if (activeRole === 'administrador' || activeRole === 'gerente') {
                actionHTML = `
                    <h3 class="role-form-title"><i class="fa-solid fa-file-contract"></i> Registrar Firma de Promesa</h3>
                    <form id="form-firmar-promesa" onsubmit="CRM_APP.handleFirmarPromesa(event, '${activeTx ? activeTx.id_transaccion : ''}')">
                        <div class="form-group-unified">
                            <label>Notaría de Firma</label>
                            <input type="text" id="prom-notaria" value="Notaría San Carlos" required>
                        </div>
                        <div class="form-group-unified">
                            <label>Fecha Firma Promesa</label>
                            <input type="date" id="prom-fecha" required>
                        </div>
                        <button type="submit" class="btn-unified btn-primary-unified" style="width:100%;">
                            <i class="fa-solid fa-signature"></i> Confirmar Firma de Promesa
                        </button>
                    </form>
                `;
            } else {
                actionHTML = `
                    <div class="lock-panel-message">
                        <i class="fa-solid fa-file-circle-check"></i>
                        <span>Reserva vigente para <strong>${activeTx ? activeTx.cliente_nombre : 'N/A'}</strong>. Esperando firma de promesa.</span>
                    </div>
                `;
            }
        } 
        
        else if (dbLote.estado === 'En Promesa') {
            // Promesa firmada, esperando Escrituración (Admin o Gerencia firman)
            if (activeRole === 'administrador' || activeRole === 'gerente') {
                actionHTML = `
                    <h3 class="role-form-title"><i class="fa-solid fa-file-signature"></i> Registrar Escritura Pública</h3>
                    <form id="form-firmar-escritura" onsubmit="CRM_APP.handleFirmarEscritura(event, '${activeTx ? activeTx.id_transaccion : ''}')">
                        <div class="form-group-unified">
                            <label>Fojas / Código de Registro Conservador</label>
                            <input type="text" id="esc-deed-foja" required placeholder="Fojas 1420 N° 850, Chillán">
                        </div>
                        <div class="form-group-unified">
                            <label>Notaría de Escrituración</label>
                            <input type="text" id="esc-notaria" value="Notaría San Carlos" required>
                        </div>
                        <div class="form-group-unified">
                            <label>Fecha de Escrituración</label>
                            <input type="date" id="esc-fecha" required>
                        </div>
                        <button type="submit" class="btn-unified btn-success-unified" style="width:100%;">
                            <i class="fa-solid fa-check-double"></i> Registrar Cierre y Venta Total
                        </button>
                    </form>
                `;
            } else {
                actionHTML = `
                    <div class="lock-panel-message">
                        <i class="fa-solid fa-user-shield"></i>
                        <span>Lote en Promesa legal. Trámite de escrituración en curso.</span>
                    </div>
                `;
            }
        } 
        
        else if (dbLote.estado === 'Vendida') {
            // Lote totalmente vendido. Inmodificable.
            actionHTML = `
                <div class="lock-panel-message" style="border-color: rgba(46, 204, 113, 0.3); background: rgba(46, 204, 113, 0.02);">
                    <i class="fa-solid fa-circle-check" style="color:var(--accent-green);"></i>
                    <span style="color:var(--text-light); font-weight:700;">LOTE TOTALMENTE VENDIDO</span>
                    <span style="font-size:11px;">Venta finalizada y registrada legalmente en Conservador.</span>
                </div>
            `;
        }

        // 3. Panel de Control de Gerente General (Ajuste de Precios y Bloqueo preventivo)
        // Disponible para Gerente en cualquier estado excepto cuando ya está Vendido
        if (activeRole === 'gerente' && dbLote.estado !== 'Vendida') {
            const isLocked = dbLote.estado === 'Bloqueada';
            
            actionHTML += `
                <hr class="divider-line">
                <h3 class="role-form-title" style="color:var(--primary);"><i class="fa-solid fa-gears"></i> Panel de Gerencia General</h3>
                <form id="form-control-gerente" onsubmit="CRM_APP.handleControlGerencial(event)">
                    <div class="grid-2-cols" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom: 10px;">
                        <div class="form-group-unified">
                            <label>Precio Lista</label>
                            <input type="number" id="ger-precio-lista" value="${dbLote.precioLista}">
                        </div>
                        <div class="form-group-unified">
                            <label>Precio Mínimo (12%)</label>
                            <input type="number" id="ger-precio-min" value="${dbLote.precioMinimo}">
                        </div>
                    </div>
                    
                    <div class="form-group-unified" style="flex-direction:row; align-items:center; gap:8px; margin-bottom: 12px;">
                        <input type="checkbox" id="ger-bloquear" ${isLocked ? 'checked' : ''} style="width:auto; cursor:pointer;">
                        <label for="ger-bloquear" style="margin-bottom:0; cursor:pointer;">Bloquear Lote Preventivamente</label>
                    </div>

                    <div class="form-group-unified" id="ger-motivo-box" style="display: ${isLocked ? 'flex' : 'none'};">
                        <label>Motivo del Bloqueo</label>
                        <input type="text" id="ger-motivo-text" value="${isLocked ? dbLote.comentario.replace('Bloqueado: ', '') : ''}" placeholder="Ej: Reserva de palabra, canje, etc.">
                    </div>
                    
                    <button type="submit" class="btn-unified btn-secondary-unified" style="width:100%;">
                        <i class="fa-solid fa-floppy-disk"></i> Aplicar Cambios Gerenciales
                    </button>
                </form>
            `;
        }

        formArea.innerHTML = actionHTML;

        // Listener dinámico para el checkbox de bloqueo preventivo del panel de gerencia
        const checkBloqueo = document.getElementById('ger-bloquear');
        const motivoBox = document.getElementById('ger-motivo-box');
        if (checkBloqueo && motivoBox) {
            checkBloqueo.addEventListener('change', (e) => {
                motivoBox.style.display = e.target.checked ? 'flex' : 'none';
            });
        }

        // Fijar fechas de hoy por defecto en inputs date
        const inputFechaProm = document.getElementById('prom-fecha');
        if (inputFechaProm) inputFechaProm.valueAsDate = new Date();
        
        const inputFechaEsc = document.getElementById('esc-fecha');
        if (inputFechaEsc) inputFechaEsc.valueAsDate = new Date();
    }

    // --- MANIPULACIÓN DE ACCIONES ---

    // Enviar Solicitud de Reserva (Comercial / Vendedor)
    function handleSolicitarReserva(event) {
        event.preventDefault();
        if (!selectedLoteData) return;

        const clienteNombre = document.getElementById('sol-cliente-nombre').value.trim();
        const clienteRut = document.getElementById('sol-cliente-rut').value.trim();
        const montoReserva = parseFloat(document.getElementById('sol-monto-reserva').value);
        const precioOferta = parseFloat(document.getElementById('sol-precio-oferta').value);
        const notas = document.getElementById('sol-notas').value.trim();

        const usuario = activeRole === 'gerente' ? 'Ximena Guzmán (Gerente)' : 'Ricardo Comercial';

        const res = CRM_DB.solicitarReserva(selectedLoteData.proyecto, selectedLoteData.loteNum, {
            clienteNombre,
            clienteRut,
            montoReserva,
            precioOferta,
            vendedor: usuario,
            notas
        });

        if (res.success) {
            showToast(`Reserva solicitada para Lote ${selectedLoteData.loteNum}. Pendiente aprobación.`, 'success');
            
            // Recargar mapa y panel lateral
            loadProjectOnMap(selectedLoteData.proyecto);
            showLoteSidebarDetails(selectedLoteData.proyecto, selectedLoteData.loteNum);
            
            refreshAll();
        } else {
            showToast(res.error, 'error');
        }
    }

    // Aprobar Reserva (Gerente)
    function handleAprobarReserva(txId) {
        if (!txId) {
            showToast('ID de transacción no válido.', 'error');
            return;
        }

        if (confirm('¿Estás seguro de que deseas aprobar esta reserva y validarla legalmente?')) {
            const res = CRM_DB.aprobarReserva(txId, 'Ximena Guzmán (Gerente)');
            if (res.success) {
                showToast('Reserva validada con éxito.', 'success');
                
                // Recargar mapa y panel lateral
                loadProjectOnMap(selectedLoteData.proyecto);
                showLoteSidebarDetails(selectedLoteData.proyecto, selectedLoteData.loteNum);
                
                refreshAll();
            } else {
                showToast(res.error, 'error');
            }
        }
    }

    // Rechazar Reserva (Gerente)
    function handleRechazarReserva(txId) {
        if (!txId) {
            showToast('ID de transacción no válido.', 'error');
            return;
        }

        const motivo = document.getElementById('rej-motivo-text').value.trim() || 'Fondos no acreditados';

        if (confirm(`¿Estás seguro de que deseas rechazar esta solicitud de reserva? El lote volverá a estar Disponible.`)) {
            const res = CRM_DB.rechazarReserva(txId, 'Ximena Guzmán (Gerente)', motivo);
            if (res.success) {
                showToast('Reserva rechazada y lote liberado.', 'warning');
                
                // Recargar mapa y panel lateral
                loadProjectOnMap(selectedLoteData.proyecto);
                showLoteSidebarDetails(selectedLoteData.proyecto, selectedLoteData.loteNum);
                
                refreshAll();
            } else {
                showToast(res.error, 'error');
            }
        }
    }

    // Registrar Firma de Promesa (Admin)
    function handleFirmarPromesa(event, txId) {
        event.preventDefault();
        if (!txId) return;

        const notaria = document.getElementById('prom-notaria').value.trim();
        const fechaVal = document.getElementById('prom-fecha').value;
        const fechaPromesa = new Date(fechaVal).toISOString();

        const res = CRM_DB.firmarPromesa(txId, {
            notaria,
            fechaPromesa
        }, 'Claudio Documental (Admin)');

        if (res.success) {
            showToast('Promesa de compraventa registrada exitosamente.', 'success');
            
            // Recargar mapa y panel lateral
            loadProjectOnMap(selectedLoteData.proyecto);
            showLoteSidebarDetails(selectedLoteData.proyecto, selectedLoteData.loteNum);
            
            refreshAll();
        } else {
            showToast(res.error, 'error');
        }
    }

    // Registrar Cierre y Firma Escritura Pública (Admin)
    function handleFirmarEscritura(event, txId) {
        event.preventDefault();
        if (!txId) return;

        const deedFoja = document.getElementById('esc-deed-foja').value.trim();
        const notaria = document.getElementById('esc-notaria').value.trim();
        const fechaVal = document.getElementById('esc-fecha').value;
        const fechaEscritura = new Date(fechaVal).toISOString();

        const res = CRM_DB.firmarEscritura(txId, {
            deedFoja,
            notaria,
            fechaEscritura
        }, 'Claudio Documental (Admin)');

        if (res.success) {
            showToast('Escritura registrada correctamente. Lote marcado como VENDIDO.', 'success');
            
            // Recargar mapa y panel lateral
            loadProjectOnMap(selectedLoteData.proyecto);
            showLoteSidebarDetails(selectedLoteData.proyecto, selectedLoteData.loteNum);
            
            refreshAll();
        } else {
            showToast(res.error, 'error');
        }
    }

    // Aplicar control gerencial (Precios y Bloqueo preventivo)
    function handleControlGerencial(event) {
        event.preventDefault();
        if (!selectedLoteData) return;

        const precioLista = parseFloat(document.getElementById('ger-precio-lista').value);
        const precioMin = parseFloat(document.getElementById('ger-precio-min').value);
        const bloquear = document.getElementById('ger-bloquear').checked;
        const motivo = document.getElementById('ger-motivo-text').value.trim() || 'Reserva interna';

        const dbLote = CRM_DB.getLote(selectedLoteData.proyecto, selectedLoteData.loteNum);

        // 1. Validar cambios de precios
        if (precioLista !== dbLote.precioLista || precioMin !== dbLote.precioMinimo) {
            CRM_DB.modificarPrecios(selectedLoteData.proyecto, selectedLoteData.loteNum, precioLista, precioMin, 'Ximena Guzmán (Gerente)');
        }

        // 2. Validar cambios de bloqueo preventivo
        if (bloquear && dbLote.estado === 'Disponible') {
            CRM_DB.cambiarBloqueo(selectedLoteData.proyecto, selectedLoteData.loteNum, true, motivo, 'Ximena Guzmán (Gerente)');
        } else if (!bloquear && dbLote.estado === 'Bloqueada') {
            CRM_DB.cambiarBloqueo(selectedLoteData.proyecto, selectedLoteData.loteNum, false, '', 'Ximena Guzmán (Gerente)');
        }

        showToast('Modificaciones gerenciales aplicadas.', 'success');

        // Recargar mapa y panel lateral
        loadProjectOnMap(selectedLoteData.proyecto);
        showLoteSidebarDetails(selectedLoteData.proyecto, selectedLoteData.loteNum);
        
        refreshAll();
    }

    // --- COMPONENTES DE RENDERING GENERAL (KPI, TABLAS, GRÁFICOS) ---

    // Recargar todas las vistas y sincronizaciones
    function refreshAll() {
        const stats = CRM_DB.getStats();

        // 1. Actualizar KPIs del Dashboard
        document.getElementById('kpi-total-proyectado').innerText = formatMoney(stats.ingresoTotalProyectado);
        document.getElementById('kpi-monto-promesa').innerText = formatMoney(stats.ingresoComprometido);
        document.getElementById('kpi-caja-recaudada').innerText = formatMoney(stats.ingresoRecaudado);
        document.getElementById('kpi-lotes-vendidos').innerText = `${stats.vendidas} / ${stats.totales} Lotes`;

        // 2. Renderizar Historial de Transacciones Recientes (Tab Dashboard)
        const recentTbody = document.getElementById('recent-transactions-tbody');
        if (recentTbody) {
            recentTbody.innerHTML = '';
            const txs = CRM_DB.getTransacciones();
            if (txs.length === 0) {
                recentTbody.innerHTML = `<tr><td colspan="6" class="empty-state">No se registran transacciones.</td></tr>`;
            } else {
                // Últimas 5 primero
                txs.slice(-5).reverse().forEach(t => {
                    const tr = document.createElement('tr');
                    
                    let badgeClass = 'tag-solicitada';
                    if (t.estado_documental === 'Aprobada') badgeClass = 'tag-reserva';
                    if (t.estado_documental === 'En Promesa') badgeClass = 'tag-promesa';
                    if (t.estado_documental === 'Escriturado') badgeClass = 'tag-escritura';
                    if (t.estado_documental === 'Rechazada') badgeClass = 'tag-bloqueada';

                    tr.innerHTML = `
                        <td><strong>${t.id_transaccion}</strong></td>
                        <td>Lote ${t.lote} — <span style="font-size:11px; color:var(--text-dim);">${t.proyecto}</span></td>
                        <td>${t.cliente_nombre}</td>
                        <td>${t.vendedor}</td>
                        <td style="font-family:monospace; font-weight:700; color:var(--primary);">${formatMoney(t.precio_oferta)}</td>
                        <td><span class="tag ${badgeClass}">${t.estado_documental}</span></td>
                    `;
                    recentTbody.appendChild(tr);
                });
            }
        }

        // 3. Renderizar Tabla del Módulo de Aprobaciones (Tab Aprobaciones)
        const aprobacionesTbody = document.getElementById('table-aprobaciones-tbody');
        if (aprobacionesTbody) {
            aprobacionesTbody.innerHTML = '';
            const pendingTxs = CRM_DB.getTransacciones().filter(t => t.estado_documental === 'Solicitada');
            
            if (pendingTxs.length === 0) {
                aprobacionesTbody.innerHTML = `<tr><td colspan="6" class="empty-state">No hay reservas pendientes de aprobación.</td></tr>`;
            } else {
                pendingTxs.forEach(t => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><strong>Lote ${t.lote}</strong> — ${t.proyecto}</td>
                        <td>${t.cliente_nombre} <br><span style="font-size:11px; opacity:0.7;">RUT: ${t.cliente_rut || 'S/R'}</span></td>
                        <td>${t.vendedor}</td>
                        <td style="font-family:monospace;">${formatMoney(t.monto_reserva)}</td>
                        <td style="font-family:monospace; font-weight:700; color:var(--primary);">${formatMoney(t.precio_oferta)}</td>
                        <td style="text-align: right;">
                            <button onclick="CRM_APP.handleAprobarReserva('${t.id_transaccion}')" class="btn-unified btn-sm btn-success-unified" style="margin-right:5px;">
                                <i class="fa-solid fa-check"></i> Aprobar
                            </button>
                            <button onclick="CRM_APP.handleRechazarReserva('${t.id_transaccion}')" class="btn-unified btn-sm btn-danger-unified">
                                <i class="fa-solid fa-xmark"></i> Rechazar
                            </button>
                        </td>
                    `;
                    aprobacionesTbody.appendChild(tr);
                });
            }
        }

        // 4. Renderizar Módulo Mesa Documental (Tab Mesa Documental)
        const promesasTbody = document.getElementById('table-mesa-promesas-tbody');
        if (promesasTbody) {
            promesasTbody.innerHTML = '';
            const promesadas = CRM_DB.getTransacciones().filter(t => t.estado_documental === 'Aprobada' || t.estado_documental === 'En Promesa');
            
            if (promesadas.length === 0) {
                promesasTbody.innerHTML = `<tr><td colspan="4" class="empty-state">No hay lotes con reserva o promesa vigente.</td></tr>`;
            } else {
                promesadas.forEach(t => {
                    const isPromised = t.estado_documental === 'En Promesa';
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><strong>Lote ${t.lote}</strong> — ${t.proyecto}</td>
                        <td>${t.cliente_nombre}</td>
                        <td><span class="tag ${isPromised ? 'tag-promesa' : 'tag-reserva'}">${isPromised ? 'En Promesa' : 'Reservado'}</span></td>
                        <td style="text-align: right;">
                            ${isPromised 
                                ? `<button onclick="CRM_APP.triggerDocModal('escritura', '${t.id_transaccion}')" class="btn-unified btn-sm btn-success-unified">
                                     <i class="fa-solid fa-file-signature"></i> Firmar Escritura
                                   </button>`
                                : `<button onclick="CRM_APP.triggerDocModal('promesa', '${t.id_transaccion}')" class="btn-unified btn-sm btn-primary-unified">
                                     <i class="fa-solid fa-signature"></i> Firmar Promesa
                                   </button>`
                            }
                        </td>
                    `;
                    promesasTbody.appendChild(tr);
                });
            }
        }

        // Escrituras Realizadas
        const escriturasTbody = document.getElementById('table-mesa-escrituras-tbody');
        if (escriturasTbody) {
            escriturasTbody.innerHTML = '';
            const escrituradas = CRM_DB.getTransacciones().filter(t => t.estado_documental === 'Escriturado');
            
            if (escrituradas.length === 0) {
                escriturasTbody.innerHTML = `<tr><td colspan="4" class="empty-state">No se registran escrituras firmadas.</td></tr>`;
            } else {
                escrituradas.forEach(t => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><strong>Lote ${t.lote}</strong> — ${t.proyecto}</td>
                        <td style="font-family:monospace; font-size:11px;">${t.deed_foja || 'N/A'}</td>
                        <td>${t.fecha_escritura ? new Date(t.fecha_escritura).toLocaleDateString('es-CL') : 'N/A'}</td>
                        <td>${t.notaria || 'N/A'}</td>
                    `;
                    escriturasTbody.appendChild(tr);
                });
            }
        }

        // 5. Renderizar Tabla General de Inventario (Tab Inventario)
        const invTbody = document.getElementById('table-inventario-tbody');
        if (invTbody) {
            invTbody.innerHTML = '';
            const filterProject = document.getElementById('inventario-filter-project').value;
            const lotesFiltrados = filterProject === 'all' ? CRM_DB.getLotes() : CRM_DB.getLotes(filterProject);

            if (lotesFiltrados.length === 0) {
                invTbody.innerHTML = `<tr><td colspan="7" class="empty-state">No hay lotes en el inventario.</td></tr>`;
            } else {
                lotesFiltrados.forEach(l => {
                    const tr = document.createElement('tr');
                    
                    let badgeClass = 'tag-disponible';
                    if (l.estado === 'Reservada-Pendiente') badgeClass = 'tag-solicitada';
                    if (l.estado === 'Reservada') badgeClass = 'tag-reserva';
                    if (l.estado === 'En Promesa') badgeClass = 'tag-promesa';
                    if (l.estado === 'Vendida') badgeClass = 'tag-escritura';
                    if (l.estado === 'Bloqueada') badgeClass = 'tag-bloqueada';

                    // Calcular Margen (Si PrecioLista >= PrecioMinimo es Seguro, si no, es Alerta)
                    const margenHTML = l.precioLista >= l.precioMinimo
                        ? `<span class="badge-ok-margin">Estable</span>`
                        : `<span class="badge-alert-margin">Crítico</span>`;

                    tr.innerHTML = `
                        <td><strong>Lote ${l.lote}</strong></td>
                        <td>${l.proyecto}</td>
                        <td>${l.area}</td>
                        <td style="font-family:monospace; font-weight:700;">${formatMoney(l.precioLista)}</td>
                        <td style="font-family:monospace; color:var(--text-dim);">${formatMoney(l.precioMinimo)}</td>
                        <td><span class="tag ${badgeClass}">${l.estado}</span></td>
                        <td><div style="display:flex; flex-direction:column; gap:2px;">
                            <span>${l.modificadoPor}</span>
                            <span style="font-size:9px; color:var(--text-dim);">${new Date(l.ultimaActualizacion).toLocaleDateString('es-CL')}</span>
                        </div></td>
                    `;
                    invTbody.appendChild(tr);
                });
            }
        }

        // 6. Renderizar Logs de Auditoría (Tab Auditoría)
        const auditoriaTbody = document.getElementById('auditoria-table-tbody');
        if (auditoriaTbody) {
            auditoriaTbody.innerHTML = '';
            const audit = CRM_DB.getAuditoria();
            
            if (audit.length === 0) {
                auditoriaTbody.innerHTML = `<tr><td colspan="4" class="empty-state">No hay registros en auditoría.</td></tr>`;
            } else {
                audit.forEach(log => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td style="font-size:12px; color:var(--text-dim);">${new Date(log.fecha).toLocaleString('es-CL')}</td>
                        <td><strong>${log.usuario}</strong></td>
                        <td><span style="color:var(--primary); font-weight:700; text-transform:uppercase;">${log.accion}</span></td>
                        <td style="font-size:12px; opacity:0.95;">${log.detalle}</td>
                    `;
                    auditoriaTbody.appendChild(tr);
                });
            }
        }
    }

    // Renderizar Gráficos del Dashboard (Chart.js)
    function renderDashboardCharts() {
        const stats = CRM_DB.getStats();

        // A. Doughnut Chart: Composición de Inventario
        const compCtx = document.getElementById('chart-composition');
        if (compCtx) {
            if (chartCompositionInstance) chartCompositionInstance.destroy();
            
            chartCompositionInstance = new Chart(compCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Disponibles', 'Aprobadas', 'En Promesa', 'Vendidas', 'Bloqueadas', 'Solicitadas'],
                    datasets: [{
                        data: [
                            stats.disponibles, 
                            stats.reservadas, 
                            stats.enPromesa, 
                            stats.vendidas, 
                            stats.bloqueadas, 
                            stats.solicitadas
                        ],
                        backgroundColor: [
                            STATUS_COLORS.Disponible,
                            STATUS_COLORS.Reservada,
                            STATUS_COLORS['En Promesa'],
                            STATUS_COLORS.Vendida,
                            STATUS_COLORS.Bloqueada,
                            STATUS_COLORS['Reservada-Pendiente']
                        ],
                        borderWidth: 1,
                        borderColor: '#12182a'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                color: '#94a3b8',
                                font: { size: 11, family: 'Inter' }
                            }
                        }
                    }
                }
            });
        }

        // B. Bar Chart: Lotes Vendidos por Proyecto
        const projCtx = document.getElementById('chart-projects');
        if (projCtx) {
            if (chartProjectsInstance) chartProjectsInstance.destroy();

            const proyectos = Object.keys(stats.proyectos);
            const vendidasData = proyectos.map(p => stats.proyectos[p].vend);
            const totalData = proyectos.map(p => stats.proyectos[p].total);

            chartProjectsInstance = new Chart(projCtx, {
                type: 'bar',
                data: {
                    labels: proyectos,
                    datasets: [
                        {
                            label: 'Lotes Vendidos',
                            data: vendidasData,
                            backgroundColor: STATUS_COLORS.Vendida,
                            borderRadius: 6
                        },
                        {
                            label: 'Lotes Totales',
                            data: totalData,
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            borderColor: 'rgba(255, 255, 255, 0.1)',
                            borderWidth: 1,
                            borderRadius: 6
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(255, 255, 255, 0.05)' },
                            ticks: { color: '#94a3b8', stepSize: 5 }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#94a3b8' }
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: {
                                color: '#94a3b8',
                                font: { size: 11, family: 'Inter' }
                            }
                        }
                    }
                }
            });
        }
    }

    // --- MODALES DOCUMENTALES DINÁMICOS ---

    // Abrir Modal Documental
    function triggerDocModal(type, txId) {
        const modal = document.getElementById('admin-doc-modal');
        const title = document.getElementById('admin-doc-modal-title');
        const subtitle = document.getElementById('admin-doc-modal-subtitle');
        const formArea = document.getElementById('admin-doc-modal-form-area');

        const tx = CRM_DB.getTransacciones().find(t => t.id_transaccion === txId);
        if (!tx) return;

        modal.classList.add('active');
        subtitle.innerText = `${tx.proyecto} — Lote ${tx.lote} (Cliente: ${tx.cliente_nombre})`;

        if (type === 'promesa') {
            title.innerText = '🖋️ Registrar Firma de Promesa';
            formArea.innerHTML = `
                <form onsubmit="CRM_APP.submitDocModalForm(event, 'promesa', '${txId}')">
                    <div class="form-group-unified">
                        <label>Notaría de Firma</label>
                        <input type="text" id="modal-prom-notaria" value="Notaría San Carlos" required>
                    </div>
                    <div class="form-group-unified">
                        <label>Fecha de Firma</label>
                        <input type="date" id="modal-prom-fecha" required>
                    </div>
                    <div class="form-group-unified">
                        <label>Observaciones Adicionales</label>
                        <textarea id="modal-prom-notas" placeholder="Instrucciones especiales de pago, plazos..." rows="2"></textarea>
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
                        <button type="button" class="btn-unified btn-secondary-unified" onclick="CRM_APP.closeDocModal()">Cancelar</button>
                        <button type="submit" class="btn-unified btn-primary-unified">Guardar Firma Promesa</button>
                    </div>
                </form>
            `;
            document.getElementById('modal-prom-fecha').valueAsDate = new Date();
        } else if (type === 'escritura') {
            title.innerText = '📂 Registrar Escritura e Inscripción';
            formArea.innerHTML = `
                <form onsubmit="CRM_APP.submitDocModalForm(event, 'escritura', '${txId}')">
                    <div class="form-group-unified">
                        <label>Fojas / Código Inscripción Conservador</label>
                        <input type="text" id="modal-esc-foja" required placeholder="Fojas 1420 N° 850, Chillán">
                    </div>
                    <div class="form-group-unified">
                        <label>Notaría de Firma</label>
                        <input type="text" id="modal-esc-notaria" value="Notaría San Carlos" required>
                    </div>
                    <div class="form-group-unified">
                        <label>Fecha de Firma</label>
                        <input type="date" id="modal-esc-fecha" required>
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
                        <button type="button" class="btn-unified btn-secondary-unified" onclick="CRM_APP.closeDocModal()">Cancelar</button>
                        <button type="submit" class="btn-unified btn-success-unified">Inscribir Escritura (Vendido)</button>
                    </div>
                </form>
            `;
            document.getElementById('modal-esc-fecha').valueAsDate = new Date();
        }
    }

    // Cerrar Modal Documental
    function closeDocModal() {
        document.getElementById('admin-doc-modal').classList.remove('active');
    }

    // Guardar los datos ingresados en el modal documental
    function submitDocModalForm(event, type, txId) {
        event.preventDefault();

        if (type === 'promesa') {
            const notaria = document.getElementById('modal-prom-notaria').value.trim();
            const fechaVal = document.getElementById('modal-prom-fecha').value;
            const fechaPromesa = new Date(fechaVal).toISOString();
            const notas = document.getElementById('modal-prom-notas').value.trim();

            const res = CRM_DB.firmarPromesa(txId, { notaria, fechaPromesa, notas }, 'Claudio Documental (Admin)');
            if (res.success) {
                showToast('Promesa inscrita en base de datos local y sincronizada.', 'success');
            } else {
                showToast(res.error, 'error');
            }
        } else if (type === 'escritura') {
            const deedFoja = document.getElementById('modal-esc-foja').value.trim();
            const notaria = document.getElementById('modal-esc-notaria').value.trim();
            const fechaVal = document.getElementById('modal-esc-fecha').value;
            const fechaEscritura = new Date(fechaVal).toISOString();

            const res = CRM_DB.firmarEscritura(txId, { deedFoja, notaria, fechaEscritura }, 'Claudio Documental (Admin)');
            if (res.success) {
                showToast('Escritura inscrita correctamente. Venta finalizada.', 'success');
            } else {
                showToast(res.error, 'error');
            }
        }

        closeDocModal();
        
        // Si el lote modificado era el seleccionado en el mapa, refrescar su sidebar
        if (selectedLoteData) {
            showLoteSidebarDetails(selectedLoteData.proyecto, selectedLoteData.loteNum);
            loadProjectOnMap(selectedLoteData.proyecto);
        }
        
        refreshAll();
    }

    // Retornar API Pública
    return {
        init,
        switchRole,
        switchTab,
        loadProjectOnMap,
        refreshAll,
        
        // Exponer manejadores asíncronos
        handleSolicitarReserva,
        handleAprobarReserva,
        handleRechazarReserva,
        handleFirmarPromesa,
        handleFirmarEscritura,
        handleControlGerencial,
        triggerDocModal,
        closeDocModal,
        submitDocModalForm
    };
})();

// Escuchador de inicialización al cargar DOM
window.addEventListener('DOMContentLoaded', () => {
    CRM_APP.init();
});
