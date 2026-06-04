/**
 * DATA.JS - Data Management Module (Normalized)
 * Project: Las Brisas
 * Standardized version based on El Copihue
 */

const DataModule = (() => {
    const STORAGE_KEY = 'hacienda_brisas_lotes';
    const DATA_VERSION = 'v35_force_master_sync';
    const PROJECT_NAME = 'Las Brisas';
    const MAP_CONFIG = {
        center: [-36.385, -71.953],
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
        // Intenta cargar desde el archivo maestro de 03_CORAZON
        const masterData = window.json_brisas_lotes || window.json_copihue_lotes || window.json_encinos_lotes || window.json_naranjos_lotes;
        
        if (masterData) {
            processBatch(masterData);
        } else {
            // Fallback para archivos antiguos si existen
            processBatch(typeof window.json_Disponibles_5 !== 'undefined' ? window.json_Disponibles_5 : null, 'Disponible');
            processBatch(typeof window.json_Vendidas_4 !== 'undefined' ? window.json_Vendidas_4 : null, 'Vendida');
            processBatch(typeof window.json_Reservadas_6 !== 'undefined' ? window.json_Reservadas_6 : null, 'Reservada');
        }
        save();
    }

    function sanitizeNumber(val) {
        if (val === null || val === undefined || val === '') return null;
        if (typeof val === 'number') return val;
        const clean = String(val).replace(/[^0-9]/g, '');
        return clean === '' ? 0 : parseInt(clean, 10);
    }

    function processBatch(geoJson, fallbackEstado = 'Disponible') {
        if (!geoJson || !geoJson.features) return;
        geoJson.features.forEach(f => {
            const id_lote = findProp(f.properties, MAPPING.id_lote) || 'S/N';
            const area = findProp(f.properties, MAPPING.area) || '5.000 m²';
            const estado = findProp(f.properties, MAPPING.estado) || fallbackEstado;
            let precio = sanitizeNumber(findProp(f.properties, MAPPING.precio) || 33000000);

            // Regla de Negocio: Lotes vendidos no muestran precio (Robust check)
            if (String(estado).toLowerCase().includes('vend')) precio = 0;

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
        return lotesData.features.find(f => {
            const props = f.properties || {};
            return normID(props.id_lote || props.Lote || props.name) === nid;
        });
    }

    function updateLote(id, newData) {
        const lote = getLoteById(id);
        if (lote) {
            // Unificar propiedades (Case Insensitive)
            if (newData.estado) newData.Estado = newData.estado;
            if (newData.Estado) newData.estado = newData.Estado;
            if (newData.precio !== undefined) newData.Precio = newData.precio;
            if (newData.Precio !== undefined) newData.precio = newData.Precio;
            if (newData.comentario !== undefined) newData.Comentario = newData.comentario;
            if (newData.Comentario !== undefined) newData.comentario = newData.Comentario;

            lote.properties = { ...lote.properties, ...newData, ultima_modificacion: new Date().toISOString() };
            save();
            addToSyncQueue(id, newData);
        }
    }

    function save() { 
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(lotesData)); 
        } catch (e) {
            console.error("DataModule: Error al guardar en localStorage", e);
        }
    }

    function reset() {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_KEY + '_sync');
        location.reload();
    }

    function addToSyncQueue(id, data) {
        let queue = JSON.parse(localStorage.getItem(STORAGE_KEY + '_sync') || '[]');
        queue.push({ id, data, timestamp: new Date().toISOString() });
        localStorage.setItem(STORAGE_KEY + '_sync', JSON.stringify(queue));
    }

    function getSyncQueue() { return JSON.parse(localStorage.getItem(STORAGE_KEY + '_sync') || '[]'); }
    function clearSyncQueue() { localStorage.setItem(STORAGE_KEY + '_sync', '[]'); }
    
    function formatPrice(val) {
        if (!val && val !== 0) return '$ --';
        if (typeof val === 'string' && val.includes('$')) return val;
        const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]+/g,""));
        if (isNaN(num)) return val;
        return new Intl.NumberFormat('es-CL', { 
            style: 'currency', 
            currency: 'CLP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(num).replace('CLP', '$');
    }

    function getStats() {
        const stats = { disponible: 0, reservada: 0, vendida: 0 };
        lotesData.features.forEach(f => {
            const e = String(f.properties.estado).toLowerCase();
            if (e.includes('disp')) stats.disponible++;
            else if (e.includes('res')) stats.reservada++;
            else if (e.includes('vend')) stats.vendida++;
        });
        return stats;
    }

    return { 
        STORAGE_KEY, PROJECT_NAME, MAP_CONFIG,
        init, getAll, getLoteById, updateLote, getStats, reset, getSyncQueue, clearSyncQueue, formatPrice 
    };
})();

