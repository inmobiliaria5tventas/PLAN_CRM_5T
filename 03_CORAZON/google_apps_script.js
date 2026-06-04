/**
 * =====================================================
 * GOOGLE APPS SCRIPT — CRM 5 Tierras Backend
 * =====================================================
 */

// ── Configuración ──
const PROYECTOS = ['Las Brisas', 'Los Naranjos', 'El Copihue', 'Los Encinos'];
const COLUMNAS = ['Lote', 'Estado', 'Precio', 'Area', 'Modificado_por', 'Fecha_modificacion', 'Comentario'];

/**
 * Ejecutar UNA VEZ para crear las hojas de cada proyecto
 */
function inicializarHojas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  PROYECTOS.forEach(proyecto => {
    let sheet = ss.getSheetByName(proyecto);
    if (!sheet) {
      sheet = ss.insertSheet(proyecto);
    }
    
    // Escribir encabezados si la hoja está vacía
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS]);
      sheet.getRange(1, 1, 1, COLUMNAS.length)
        .setFontWeight('bold')
        .setBackground('#4a90d9')
        .setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
  });
  
  // Crear hoja de Auditoría
  let auditSheet = ss.getSheetByName('Auditoría');
  if (!auditSheet) {
    auditSheet = ss.insertSheet('Auditoría');
    auditSheet.getRange(1, 1, 1, 6).setValues([
      ['Fecha', 'Proyecto', 'Lote', 'Campo', 'Valor_anterior', 'Valor_nuevo']
    ]);
    auditSheet.getRange(1, 1, 1, 6)
      .setFontWeight('bold')
      .setBackground('#e74c3c')
      .setFontColor('#ffffff');
    auditSheet.setFrozenRows(1);
  }
}

/**
 * GET: Leer datos de un proyecto
 */
function doGet(e) {
  try {
    const action = e.parameter.action || 'read';
    const proyecto = e.parameter.proyecto;
    
    if (action === 'read' && proyecto) {
      return readProject(proyecto);
    }
    
    if (action === 'readAll') {
      return readAllProjects();
    }
    
    return jsonResponse({ error: 'Acción no válida.' }, 400);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

/**
 * POST: Actualizar un lote
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const { proyecto, lote, estado, precio, comentario, modificado_por } = data;
    
    if (!proyecto || !lote) {
      return jsonResponse({ error: 'Se requiere proyecto y lote' }, 400);
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(proyecto);
    
    if (!sheet) {
      return jsonResponse({ error: `Proyecto "${proyecto}" no encontrado` }, 404);
    }
    
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const headers = values[0];
    
    // Buscar el lote
    const loteCol = headers.indexOf('Lote');
    let rowIndex = -1;
    
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][loteCol]) === String(lote)) {
        rowIndex = i;
        break;
      }
    }
    
    const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
    const usuario = modificado_por || 'App CRM';
    
    if (rowIndex === -1) {
      // Lote no existe
      const newRow = COLUMNAS.map(col => {
        if (col === 'Lote') return String(lote);
        if (col === 'Estado') return estado || 'Disponible';
        if (col === 'Precio') return (precio !== undefined && precio !== null) ? precio : '';
        if (col === 'Area') return data.area || '';
        if (col === 'Modificado_por') return usuario;
        if (col === 'Fecha_modificacion') return now;
        if (col === 'Comentario') return comentario || '';
        return '';
      });
      sheet.appendRow(newRow);
      logAudit(proyecto, lote, 'Crear', '', JSON.stringify({ estado, precio }));
    } else {
      // Lote existe
      const estadoCol = headers.indexOf('Estado');
      const precioCol = headers.indexOf('Precio');
      const modCol = headers.indexOf('Modificado_por');
      const fechaCol = headers.indexOf('Fecha_modificacion');
      
      const row = rowIndex + 1;
      
      if (estado !== undefined && estado !== null) {
        const oldEstado = sheet.getRange(row, estadoCol + 1).getValue();
        sheet.getRange(row, estadoCol + 1).setValue(estado);
        logAudit(proyecto, lote, 'Estado', oldEstado, estado);
      }
      
      if (precio !== undefined && precio !== null) {
        const oldPrecio = sheet.getRange(row, precioCol + 1).getValue();
        sheet.getRange(row, precioCol + 1).setValue(precio);
        logAudit(proyecto, lote, 'Precio', oldPrecio, precio);
      }
      
      if (comentario !== undefined && comentario !== null) {
        let comCol = headers.findIndex(h => String(h).trim().toLowerCase() === 'comentario');
        if (comCol === -1) {
          comCol = 6;
          sheet.getRange(1, comCol + 1).setValue('Comentario');
          headers[comCol] = 'Comentario';
        }
        const oldCom = sheet.getRange(row, comCol + 1).getValue();
        sheet.getRange(row, comCol + 1).setValue(comentario);
        logAudit(proyecto, lote, 'Comentario', oldCom, comentario);
      }
      
      sheet.getRange(row, modCol + 1).setValue(usuario);
      sheet.getRange(row, fechaCol + 1).setValue(now);
    }
    
    return jsonResponse({ success: true, timestamp: now });
    
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

function readProject(proyecto) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(proyecto);
  if (!sheet) return jsonResponse({ error: `Proyecto "${proyecto}" no encontrado` }, 404);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const lotes = [];
  for (let i = 1; i < data.length; i++) {
    const row = {};
    headers.forEach((h, idx) => { row[h] = data[i][idx]; });
    lotes.push(row);
  }
  return jsonResponse({ proyecto, lotes });
}

function readAllProjects() {
  const result = {};
  PROYECTOS.forEach(p => {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(p);
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      const headers = data[0] || [];
      const lotes = [];
      for (let i = 1; i < data.length; i++) {
        const row = {};
        headers.forEach((h, idx) => { row[h] = data[i][idx]; });
        lotes.push(row);
      }
      result[p] = lotes;
    }
  });
  return jsonResponse(result);
}

function logAudit(proyecto, lote, campo, valorAnterior, valorNuevo) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let auditSheet = ss.getSheetByName('Auditoría');
  if (!auditSheet) return;
  const formattedDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
  auditSheet.appendRow([formattedDate, proyecto, String(lote), campo, String(valorAnterior), String(valorNuevo)]);
}

function jsonResponse(data, code) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
