/**
 * CRM_DB.JS - Motor de Datos Local y Sincronización
 * Inmobiliaria 5 Tierras - CRM & GIS Console
 */

const CRM_DB = (() => {
    const STORAGE_KEY = 'crm_5t_unified_db';
    const VERSION_KEY = 'crm_5t_db_version';
    const DB_VERSION = 'v1.4_unified';

    let dbState = {
        lotes: {}, // Key: 'ProyectoName-LoteNum'
        transacciones: [],
        auditoria: []
    };

    function normID(id) {
        return String(id || '').replace(/[^0-9]/g, '').replace(/^0+/, '') || '0';
    }

    function sanitizeNumber(val) {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return val;
        const clean = String(val).replace(/[^0-9]/g, '');
        return clean === '' ? 0 : parseInt(clean, 10);
    }

    function generateUUID() {
        return 'tx-xxxx-xxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Cargar datos desde los GeoJSON que ya están incluidos en el navegador.
     */
    function loadInitialFromGeoJson() {
        const proyectos = {
            'El Copihue': window.json_copihue_lotes,
            'Las Brisas': window.json_brisas_lotes,
            'Los Encinos': window.json_encinos_lotes,
            'Los Naranjos': window.json_naranjos_lotes
        };

        const lotes = {};

        Object.entries(proyectos).forEach(([nombreProj, geoJson]) => {
            if (!geoJson || !geoJson.features) {
                console.warn(`CRM_DB: Capa de geometría para "${nombreProj}" no disponible en el DOM.`);
                return;
            }

            geoJson.features.forEach(f => {
                const props = f.properties || {};
                
                // Mapear el ID del lote
                let loteNum = props.Lote || props.name || props.fid || props.id || '';
                loteNum = normID(loteNum);
                if (!loteNum || loteNum === '0') return;

                const area = props.Area || props.superficie || '5.000 m²';
                const estadoOriginal = props.Estado || props.status || props.estado || 'Disponible';
                
                // Sanitizar Precio
                let precio = sanitizeNumber(props.Precio || props.precio || props.Valor);
                if (precio === 0) {
                    // Valor por defecto dependiendo del proyecto
                    precio = nombreProj === 'Las Brisas' || nombreProj === 'Los Naranjos' ? 18000000 : 33000000;
                }

                // Si originalmente viene como vendido, ajustamos
                let estado = estadoOriginal;
                if (String(estado).toLowerCase().includes('vend')) {
                    estado = 'Vendida';
                } else if (String(estado).toLowerCase().includes('res')) {
                    estado = 'Reservada';
                } else {
                    estado = 'Disponible';
                }

                const dbKey = `${nombreProj}-${loteNum}`;
                
                // Prevenir duplicados en capas mal formadas
                if (!lotes[dbKey]) {
                    lotes[dbKey] = {
                        dbKey: dbKey,
                        proyecto: nombreProj,
                        lote: loteNum,
                        area: area,
                        precioLista: precio,
                        precioMinimo: Math.round(precio * 0.88), // 12% de descuento máximo por defecto
                        estado: estado,
                        observaciones: '',
                        comentario: props.Comentario || '',
                        ultimaActualizacion: new Date().toISOString(),
                        modificadoPor: 'Inicialización de Capa'
                    };
                }
            });
        });

        dbState.lotes = lotes;
        dbState.transacciones = [];
        dbState.auditoria = [{
            fecha: new Date().toISOString(),
            usuario: 'Sistema',
            accion: 'Inicialización Base de Datos',
            detalle: `Consolidación de lotes cargada exitosamente. Total lotes: ${Object.keys(lotes).length}`
        }];
        save();
    }

    function save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dbState));
    }

    function init() {
        if (localStorage.getItem(VERSION_KEY) !== DB_VERSION) {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.setItem(VERSION_KEY, DB_VERSION);
            loadInitialFromGeoJson();
        } else {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                try {
                    dbState = JSON.parse(saved);
                } catch (e) {
                    console.error("CRM_DB: Error parseando base de datos guardada, reiniciando...", e);
                    loadInitialFromGeoJson();
                }
            } else {
                loadInitialFromGeoJson();
            }
        }
    }

    function logAudit(usuario, accion, detalle) {
        dbState.auditoria.unshift({
            fecha: new Date().toISOString(),
            usuario: usuario || 'Desconocido',
            accion: accion,
            detalle: detalle
        });
        // Mantener log en un tamaño razonable
        if (dbState.auditoria.length > 500) {
            dbState.auditoria.pop();
        }
        save();
    }

    // --- MÉTODOS DE LECTURA ---

    function getLotes(proyecto = null) {
        const lista = Object.values(dbState.lotes);
        if (proyecto) {
            return lista.filter(l => l.proyecto === proyecto);
        }
        return lista;
    }

    function getLote(proyecto, lote) {
        const key = `${proyecto}-${normID(lote)}`;
        return dbState.lotes[key] || null;
    }

    function getTransacciones(proyecto = null) {
        if (proyecto) {
            return dbState.transacciones.filter(t => t.proyecto === proyecto);
        }
        return dbState.transacciones;
    }

    function getAuditoria() {
        return dbState.auditoria;
    }

    // --- MÉTODOS DE ESCRITURA (WORKFLOW) ---

    /**
     * VENDEDOR: Solicita una reserva de un lote
     */
    function solicitarReserva(proyecto, loteNum, data) {
        loteNum = normID(loteNum);
        const dbKey = `${proyecto}-${loteNum}`;
        const lote = dbState.lotes[dbKey];

        if (!lote) return { success: false, error: 'Lote no encontrado' };
        if (lote.estado !== 'Disponible') {
            return { success: false, error: `El lote no está disponible para reserva. Estado actual: ${lote.estado}` };
        }

        const txId = generateUUID();
        const ofertaVal = sanitizeNumber(data.precioOferta || lote.precioLista);
        const reservaVal = sanitizeNumber(data.montoReserva || 200000);

        const nuevaTx = {
            id_transaccion: txId,
            proyecto: proyecto,
            lote: loteNum,
            vendedor: data.vendedor || 'Vendedor Pro',
            cliente_nombre: data.clienteNombre || 'Sin nombre',
            cliente_rut: data.clienteRut || '',
            cliente_email: data.clienteEmail || '',
            cliente_telefono: data.clienteTelefono || '',
            monto_reserva: reservaVal,
            precio_oferta: ofertaVal,
            metodo_pago: data.metodoPago || 'Transferencia',
            estado_documental: 'Solicitada', // Solicitada -> Aprobada -> En Promesa -> Escriturado
            fecha_reserva: new Date().toISOString(),
            fecha_promesa: null,
            fecha_escritura: null,
            notas: data.notas || '',
            notaria: '',
            deed_foja: ''
        };

        dbState.transacciones.push(nuevaTx);

        // Cambiar estado a "Reservada-Pendiente" (En nuestro crm la mapeamos temporalmente)
        lote.estado = 'Reservada-Pendiente';
        lote.ultimaActualizacion = new Date().toISOString();
        lote.modificadoPor = data.vendedor || 'Vendedor Pro';
        lote.comentario = `Reserva solicitada por ${data.clienteNombre} (${reservaVal.toLocaleString('es-CL', {style:'currency', currency:'CLP'})})`;

        logAudit(data.vendedor, 'Solicitar Reserva', `Lote ${loteNum} reservado pendiente para cliente ${data.clienteNombre} por oferta de $${ofertaVal.toLocaleString('es-CL')}`);
        save();
        
        // Opcional: Sincronizar hacia Google Sheets (si está configurada la sync externa)
        triggerExternalSync(proyecto, loteNum, 'Reservada', lote.precioLista, lote.comentario);

        return { success: true, transaction: nuevaTx };
    }

    /**
     * GERENCIA: Aprueba la reserva solicitada
     */
    function aprobarReserva(txId, gerenteNombre) {
        const tx = dbState.transacciones.find(t => t.id_transaccion === txId);
        if (!tx) return { success: false, error: 'Transacción no encontrada' };
        if (tx.estado_documental !== 'Solicitada') {
            return { success: false, error: `La transacción ya no está pendiente de aprobación. Estado: ${tx.estado_documental}` };
        }

        const dbKey = `${tx.proyecto}-${tx.lote}`;
        const lote = dbState.lotes[dbKey];

        if (lote) {
            lote.estado = 'Reservada';
            lote.precioLista = tx.precio_oferta; // El precio de venta final es el pactado
            lote.ultimaActualizacion = new Date().toISOString();
            lote.modificadoPor = gerenteNombre;
            lote.comentario = `Reserva aprobada por gerencia (${gerenteNombre}) para ${tx.cliente_nombre}`;
        }

        tx.estado_documental = 'Aprobada';
        tx.fecha_aprobacion = new Date().toISOString();

        logAudit(gerenteNombre, 'Aprobar Reserva', `Reserva del Lote ${tx.lote} (${tx.proyecto}) para ${tx.cliente_nombre} aprobada.`);
        save();

        triggerExternalSync(tx.proyecto, tx.lote, 'Reservada', tx.precio_oferta, lote ? lote.comentario : '');
        return { success: true };
    }

    /**
     * GERENCIA: Rechaza la reserva solicitada (vuelve a estar disponible)
     */
    function rechazarReserva(txId, gerenteNombre, razon) {
        const tx = dbState.transacciones.find(t => t.id_transaccion === txId);
        if (!tx) return { success: false, error: 'Transacción no encontrada' };
        if (tx.estado_documental !== 'Solicitada') {
            return { success: false, error: `La transacción no está en estado pendiente.` };
        }

        const dbKey = `${tx.proyecto}-${tx.lote}`;
        const lote = dbState.lotes[dbKey];

        if (lote) {
            lote.estado = 'Disponible';
            lote.ultimaActualizacion = new Date().toISOString();
            lote.modificadoPor = gerenteNombre;
            lote.comentario = `Reserva rechazada por gerencia: ${razon || 'Sin motivos especificados'}`;
        }

        tx.estado_documental = 'Rechazada';
        tx.notas = `${tx.notas} | Rechazado por gerencia el ${new Date().toLocaleDateString()}: ${razon}`;

        logAudit(gerenteNombre, 'Rechazar Reserva', `Reserva del Lote ${tx.lote} rechazada. Razón: ${razon || 'N/A'}`);
        save();

        triggerExternalSync(tx.proyecto, tx.lote, 'Disponible', lote ? lote.precioLista : 0, lote ? lote.comentario : '');
        return { success: true };
    }

    /**
     * ADMINISTRACIÓN: Firma Promesa de Compraventa
     */
    function firmarPromesa(txId, data, adminNombre) {
        const tx = dbState.transacciones.find(t => t.id_transaccion === txId);
        if (!tx) return { success: false, error: 'Transacción no encontrada' };
        
        const dbKey = `${tx.proyecto}-${tx.lote}`;
        const lote = dbState.lotes[dbKey];

        if (lote) {
            lote.estado = 'En Promesa';
            lote.ultimaActualizacion = new Date().toISOString();
            lote.modificadoPor = adminNombre;
            lote.comentario = `Promesa de compraventa firmada el ${data.fechaPromesa || new Date().toLocaleDateString()}`;
        }

        tx.estado_documental = 'En Promesa';
        tx.fecha_promesa = data.fechaPromesa || new Date().toISOString();
        tx.notaria = data.notaria || 'Notaría San Carlos';
        if (data.clienteRut) tx.cliente_rut = data.clienteRut;
        if (data.clienteNombre) tx.cliente_nombre = data.clienteNombre;
        if (data.clienteEmail) tx.cliente_email = data.clienteEmail;
        if (data.clienteTelefono) tx.cliente_telefono = data.clienteTelefono;
        if (data.notas) tx.notas = `${tx.notas} | ${data.notas}`;

        logAudit(adminNombre, 'Firmar Promesa', `Promesa firmada para Lote ${tx.lote} (${tx.proyecto}) - Cliente: ${tx.cliente_nombre}`);
        save();

        triggerExternalSync(tx.proyecto, tx.lote, 'Reservada', tx.precio_oferta, lote ? lote.comentario : '');
        return { success: true };
    }

    /**
     * ADMINISTRACIÓN: Firma Escritura Pública (Cierre y bloqueo total)
     */
    function firmarEscritura(txId, data, adminNombre) {
        const tx = dbState.transacciones.find(t => t.id_transaccion === txId);
        if (!tx) return { success: false, error: 'Transacción no encontrada' };

        const dbKey = `${tx.proyecto}-${tx.lote}`;
        const lote = dbState.lotes[dbKey];

        if (lote) {
            lote.estado = 'Vendida';
            lote.precioLista = tx.precio_oferta; // Asegurar precio final
            lote.ultimaActualizacion = new Date().toISOString();
            lote.modificadoPor = adminNombre;
            lote.comentario = `VENDIDO. Escritura pública de compraventa inscrita en Conservador. Fojas: ${data.deedFoja || 'N/A'}`;
        }

        tx.estado_documental = 'Escriturado';
        tx.fecha_escritura = data.fechaEscritura || new Date().toISOString();
        tx.deed_foja = data.deedFoja || '';
        tx.notaria = data.notaria || tx.notaria;

        logAudit(adminNombre, 'Firmar Escritura', `Venta concretada (Escriturada) para Lote ${tx.lote} (${tx.proyecto}). Fojas: ${data.deedFoja}`);
        save();

        triggerExternalSync(tx.proyecto, tx.lote, 'Vendida', tx.precio_oferta, lote ? lote.comentario : '');
        return { success: true };
    }

    /**
     * GERENCIA: Modificar Precios y Margen de un Lote
     */
    function modificarPrecios(proyecto, loteNum, precioLista, precioMinimo, gerenteNombre) {
        const dbKey = `${proyecto}-${normID(loteNum)}`;
        const lote = dbState.lotes[dbKey];

        if (!lote) return { success: false, error: 'Lote no encontrado' };
        if (lote.estado === 'Vendida') {
            return { success: false, error: 'No se pueden modificar precios de un lote ya vendido.' };
        }

        const oldPrecio = lote.precioLista;
        lote.precioLista = sanitizeNumber(precioLista);
        lote.precioMinimo = sanitizeNumber(precioMinimo);
        lote.ultimaActualizacion = new Date().toISOString();
        lote.modificadoPor = gerenteNombre;

        logAudit(gerenteNombre, 'Ajustar Precios', `Lote ${loteNum} (${proyecto}) cambió Precio Lista de $${oldPrecio.toLocaleString()} a $${precioLista.toLocaleString()}`);
        save();

        triggerExternalSync(proyecto, loteNum, lote.estado, lote.precioLista, lote.comentario);
        return { success: true };
    }

    /**
     * GERENCIA/ADMIN: Bloquear o Liberar un Lote
     */
    function cambiarBloqueo(proyecto, loteNum, bloquear, motivo, usuario) {
        const dbKey = `${proyecto}-${normID(loteNum)}`;
        const lote = dbState.lotes[dbKey];

        if (!lote) return { success: false, error: 'Lote no encontrado' };
        
        if (bloquear) {
            if (lote.estado !== 'Disponible') return { success: false, error: 'Solo se pueden bloquear lotes disponibles.' };
            lote.estado = 'Bloqueada';
            lote.comentario = `Bloqueado: ${motivo || 'Motivos internos'}`;
        } else {
            if (lote.estado !== 'Bloqueada') return { success: false, error: 'El lote no se encuentra bloqueado.' };
            lote.estado = 'Disponible';
            lote.comentario = `Liberado por ${usuario}`;
        }
        
        lote.ultimaActualizacion = new Date().toISOString();
        lote.modificadoPor = usuario;

        logAudit(usuario, bloquear ? 'Bloquear Lote' : 'Desbloquear Lote', `Lote ${loteNum} (${proyecto}). Motivo: ${motivo}`);
        save();

        // En Google sheets de sync básica, lo mapeamos como Vendida o Disponible
        triggerExternalSync(proyecto, loteNum, bloquear ? 'Vendida' : 'Disponible', lote.precioLista, lote.comentario);
        return { success: true };
    }

    // --- MÉTODOS ESTADÍSTICOS (KPI) ---

    function getStats() {
        const lotesArr = Object.values(dbState.lotes);
        const stats = {
            totales: lotesArr.length,
            disponibles: 0,
            solicitadas: 0, // Pendientes de aprobación
            reservadas: 0,  // Aprobadas
            enPromesa: 0,
            vendidas: 0,
            bloqueadas: 0,

            // Financieros
            ingresoRecaudado: 0, // Solamente de ventas cerradas (Escrituradas)
            ingresoComprometido: 0, // De promesas
            ingresoProyectadoReserva: 0, // De reservas activas y pendientes
            ingresoTotalProyectado: 0, // Suma de todos los anteriores comprometidos

            // Distribución de precios
            precioPromedioVenta: 0,
            
            // Por proyectos
            proyectos: {
                'El Copihue': { disp: 0, res: 0, prom: 0, vend: 0, total: 0, monto: 0 },
                'Las Brisas': { disp: 0, res: 0, prom: 0, vend: 0, total: 0, monto: 0 },
                'Los Encinos': { disp: 0, res: 0, prom: 0, vend: 0, total: 0, monto: 0 },
                'Los Naranjos': { disp: 0, res: 0, prom: 0, vend: 0, total: 0, monto: 0 }
            }
        };

        // Procesar estados de lotes
        lotesArr.forEach(l => {
            const proj = stats.proyectos[l.proyecto] || { disp:0, res:0, prom:0, vend:0, total:0, monto:0 };
            proj.total++;

            if (l.estado === 'Disponible') {
                stats.disponibles++;
                proj.disp++;
            } else if (l.estado === 'Reservada-Pendiente') {
                stats.solicitadas++;
                proj.res++;
            } else if (l.estado === 'Reservada') {
                stats.reservadas++;
                proj.res++;
            } else if (l.estado === 'En Promesa') {
                stats.enPromesa++;
                proj.prom++;
            } else if (l.estado === 'Vendida') {
                stats.vendidas++;
                proj.vend++;
                proj.monto += l.precioLista;
            } else if (l.estado === 'Bloqueada') {
                stats.bloqueadas++;
            }
            
            stats.proyectos[l.proyecto] = proj;
        });

        // Procesar ingresos desde las transacciones reales
        dbState.transacciones.forEach(tx => {
            const monto = tx.precio_oferta;
            
            if (tx.estado_documental === 'Escriturado') {
                stats.ingresoRecaudado += monto;
            } else if (tx.estado_documental === 'En Promesa') {
                stats.ingresoComprometido += monto;
            } else if (tx.estado_documental === 'Aprobada') {
                stats.ingresoProyectadoReserva += monto;
            } else if (tx.estado_documental === 'Solicitada') {
                stats.ingresoProyectadoReserva += monto;
            }
        });

        stats.ingresoTotalProyectado = stats.ingresoRecaudado + stats.ingresoComprometido + stats.ingresoProyectadoReserva;

        // Calcular promedio de venta
        const totalVentasContadas = dbState.transacciones.filter(t => ['Aprobada', 'En Promesa', 'Escriturado'].includes(t.estado_documental)).length;
        if (totalVentasContadas > 0) {
            stats.precioPromedioVenta = Math.round((stats.ingresoTotalProyectado) / totalVentasContadas);
        } else {
            stats.precioPromedioVenta = 25000000; // default dummy fallback
        }

        return stats;
    }

    /**
     * Llamar de forma asíncrona y en segundo plano al sync.js (Google Sheets)
     * para mantener la compatibilidad con el backend básico del cliente.
     */
    function triggerExternalSync(proyecto, loteId, estado, precio, comentario) {
        if (typeof SyncModule !== 'undefined' && typeof CRM_CONFIG !== 'undefined' && SyncModule.isConfigured()) {
            console.log(`CRM_DB: Desencadenando Sync externa para ${proyecto} Lote ${loteId} -> ${estado}`);
            // El SyncModule requiere estar inicializado para el proyecto. 
            // Para no romper la experiencia, empujamos a la API directamente
            const payload = {
                proyecto: proyecto,
                lote: String(loteId),
                estado: estado,
                precio: precio,
                comentario: comentario || '',
                modificado_por: 'Consola Unificada'
            };

            fetch(CRM_CONFIG.APPS_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload)
            })
            .then(r => r.json())
            .then(data => console.log('CRM_DB: Sync externa exitosa:', data))
            .catch(err => console.warn('CRM_DB: Error en Sync externa (se guardó de todos modos en local):', err));
        }
    }

    function resetDB() {
        localStorage.removeItem(STORAGE_KEY);
        loadInitialFromGeoJson();
        console.log("CRM_DB: Base de datos restablecida a los valores de geometría iniciales.");
        return true;
    }

    return {
        init,
        getLotes,
        getLote,
        getTransacciones,
        getAuditoria,
        solicitarReserva,
        aprobarReserva,
        rechazarReserva,
        firmarPromesa,
        firmarEscritura,
        modificarPrecios,
        cambiarBloqueo,
        getStats,
        resetDB
    };
})();
