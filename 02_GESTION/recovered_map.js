    // 2. VISUALIZADOR GIS (MAPA)
    function renderMapTab() {
        document.getElementById('map-project-select').value = activeProject;
        
        // Inicializar el mapa Leaflet si no existe
        if (!map) {
            map = L.map('console-map', { zoomControl: false }).setView(PROJECT_CENTERS[activeProject].center, PROJECT_CENTERS[activeProject].zoom);
            L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
                maxZoom: 20,
                subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                attribution: 'Mapas Satelitales Google'
            }).addTo(map);
            L.control.zoom({ position: 'bottomright' }).addTo(map);
            
            map.on('zoomend', updateMapLabelsVis);
        }

        // Cargar Geometrías del Proyecto
        loadProjectOnMap(activeProject);
    }

    function updateMapLabelsVis() {
        const el = document.getElementById('console-map');
        if (!el) return;
        if (map && map.getZoom() >= 16) {
            el.classList.add('show-labels');
        } else {
            el.classList.remove('show-labels');
        }
    }

    function getLoteStyle(estado) {
        let color = '#2ecc71'; // Disponible (Verde)
        let fillOpacity = 0.45;
        let dashArray = null;

        if (estado === 'Reservada-Pendiente') {
            color = '#f39c12'; // Amarillo-Naranja
            fillOpacity = 0.6;
            dashArray = '3, 4'; // Línea punteada comercial
        } else if (estado === 'Reservada') {
            color = '#f1c40f'; // Reservada (Amarillo Oro)
            fillOpacity = 0.6;
        } else if (estado === 'En Promesa') {
            color = '#3498db'; // En Promesa (Azul)
            fillOpacity = 0.6;
        } else if (estado === 'Vendida') {
            color = '#e74c3c'; // Vendida (Rojo)
            fillOpacity = 0.5;
        } else if (estado === 'Bloqueada') {
            color = '#7f8c8d'; // Gris
            fillOpacity = 0.6;
     
<truncated 27738 bytes>