/**
 * DATA.JS - Data Management Module (Normalized)
 * Project: El Copihue (Client Version)
 */

const DataModule = (() => {
    const STORAGE_KEY = 'client_hacienda_copihue_lotes'; 
    const DATA_VERSION = 'v36_geometry_final_rebuild';
    const PROJECT_NAME = 'El Copihue';
    const MAP_CONFIG = {
        center: [-36.1205, -71.7770],
        zoom: 16
    };

    const MAPPING = {
        id_lote: ['Lote', 'name', 'fid', 'id', 'id_lote'],
        area: ['Area', 'Hectareas', 'superficie', 'superficie_m2', 'm2'],
        estado: ['Estado', 'status', 'estado', 'Estado_1'],
        precio: ['Precio', 'precio', 'Valor', 'monto']
    };

    function normID(id) {
        return String(id || '').replace(/[^0-9]/g, '').replace(/^0+/, '') || '0';
    }

    let lotesData = {
        type: "FeatureCollection",
        features: []
    };

    function init() {
        if (localStorage.getItem(STORAGE_KEY + '_version') !== DATA_VERSION) {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(STORAGE_KEY + '_sync');
            localStorage.setItem(STORAGE_KEY + '_version', DATA_VERSION);
        }

        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                lotesData = JSON.parse(saved);
                lotesData.features.forEach(f => {
                    if (!f.properties.id_lote) f.properties.id_lote = findProp(f.properties, MAPPING.id_lote) || 'S/N';
                });
            } catch (e) {
                console.error("DataModule: Error parsing saved data", e);
                loadFromStatic();
            }
        } else {
            loadFromStatic();
        }
    }

    function loadFromStatic() {
        lotesData.features = [];
        if (typeof window.json_copihue_lotes !== 'undefined') {
            processBatch(window.json_copihue_lotes);
        } else {
            processBatch(window.json_Disponibles_2, 'Disponible');
            processBatch(window.json_Vendidas_3, 'Vendida');
            processBatch(window.json_Reservadas_4, 'Reservada');
        }
        save();
    }

    function sanitizeNumber(val) {
        if (val === null || val === undefined || val === '') return null;
        if (typeof val === 'number') return val;
        const clean = String(val).replace(/[^0-9]/g, '');
        return clean === '' ? 0 : parseInt(clean, 10);
    }

    function processBatch(geoJson, defaultEstado = 'Disponible') {
        if (!geoJson || !geoJson.features) return;
        geoJson.features.forEach(f => {
            const id_lote = findProp(f.properties, MAPPING.id_lote) || 'S/N';
            const area = findProp(f.properties, MAPPING.area) || '5.000 m²';
            const estado = findProp(f.properties, MAPPING.estado) || defaultEstado;
            let precio = sanitizeNumber(findProp(f.properties, MAPPING.precio) || 33000000);

            lotesData.features.push({
                type: "Feature",
                geometry: f.geometry,
                properties: {
                    ...f.properties,
                    id_lote: id_lote,
                    area: area,
                    estado: estado,
                    precio: precio,
                    ultima_modificacion: new Date().toISOString()
                }
            });
        });
    }


    function findProp(props, alternates) {
        for (const key of alternates) {
            if (props[key] !== undefined && props[key] !== null) return props[key];
        }
        return null;
    }

    function getAll() { return lotesData; }

    function getLoteById(id) {
        const nid = normID(id);
        return lotesData.features.find(f => normID(f.properties.id_lote || f.properties.Lote) === nid);
    }

    function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(lotesData)); }

    function formatPrice(val) {
        if (val === null || val === undefined || (val === '' && val !== 0)) return '$ 0';
        const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]+/g,""));
        if (isNaN(num)) return val;
        return new Intl.NumberFormat('es-CL', { 
            style: 'currency', currency: 'CLP', minimumFractionDigits: 0, maximumFractionDigits: 0
        }).format(num).replace('CLP', '$');
    }

    function getStats() {
        const stats = { disponible: 0, reservada: 0, vendida: 0 };
        lotesData.features.forEach(f => {
            const e = String(f.properties.estado || '').toLowerCase();
            if (e.includes('disp')) stats.disponible++;
            else if (e.includes('res')) stats.reservada++;
            else if (e.includes('vend')) stats.vendida++;
        });
        return stats;
    }

    function updateLote(id, data) {
         // Dummy for read-only compatibility
    }

    function reset() {
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
    }

    function getSyncQueue() { return []; }
    function clearSyncQueue() { }

    return {
        init, getAll, getLoteById, formatPrice, getStats, STORAGE_KEY, reset, PROJECT_NAME, MAP_CONFIG, updateLote, getSyncQueue, clearSyncQueue
    };
})();
