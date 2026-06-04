var wms_layers = [];

        var lyr_OpenStreetMap_0 = new ol.layer.Tile({
            'title': 'OpenStreetMap',
            'type':'base',
            'opacity': 1.000000,
            
            
            source: new ol.source.XYZ({
            attributions: ' ',
                url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
            })
        });

        var lyr_Satelite_1 = new ol.layer.Tile({
            'title': 'Satelite',
            'type':'base',
            'opacity': 1.000000,
            
            
            source: new ol.source.XYZ({
            attributions: ' ',
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            })
        });
var format_Disponibles_2 = new ol.format.GeoJSON();
var features_Disponibles_2 = format_Disponibles_2.readFeatures(json_Disponibles_2, 
            {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857'});
var jsonSource_Disponibles_2 = new ol.source.Vector({
    attributions: ' ',
});
jsonSource_Disponibles_2.addFeatures(features_Disponibles_2);
var lyr_Disponibles_2 = new ol.layer.Vector({
                declutter: false,
                source:jsonSource_Disponibles_2, 
                style: style_Disponibles_2,
                popuplayertitle: 'Disponibles ',
                interactive: true,
                title: '<img src="styles/legend/Disponibles_2.png" /> Disponibles '
            });
var format_Vendidas_3 = new ol.format.GeoJSON();
var features_Vendidas_3 = format_Vendidas_3.readFeatures(json_Vendidas_3, 
            {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857'});
var jsonSource_Vendidas_3 = new ol.source.Vector({
    attributions: ' ',
});
jsonSource_Vendidas_3.addFeatures(features_Vendidas_3);
var lyr_Vendidas_3 = new ol.layer.Vector({
                declutter: false,
                source:jsonSource_Vendidas_3, 
                style: style_Vendidas_3,
                popuplayertitle: 'Vendidas',
                interactive: true,
                title: '<img src="styles/legend/Vendidas_3.png" /> Vendidas'
            });
var format_Reservadas_4 = new ol.format.GeoJSON();
var features_Reservadas_4 = format_Reservadas_4.readFeatures(json_Reservadas_4, 
            {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857'});
var jsonSource_Reservadas_4 = new ol.source.Vector({
    attributions: ' ',
});
jsonSource_Reservadas_4.addFeatures(features_Reservadas_4);
var lyr_Reservadas_4 = new ol.layer.Vector({
                declutter: false,
                source:jsonSource_Reservadas_4, 
                style: style_Reservadas_4,
                popuplayertitle: 'Reservadas',
                interactive: false,
                title: '<img src="styles/legend/Reservadas_4.png" /> Reservadas'
            });
var group_Adm = new ol.layer.Group({
                                layers: [],
                                fold: 'open',
                                title: 'Adm'});

lyr_OpenStreetMap_0.setVisible(false);lyr_Satelite_1.setVisible(true);lyr_Disponibles_2.setVisible(true);lyr_Vendidas_3.setVisible(true);lyr_Reservadas_4.setVisible(true);
var layersList = [lyr_OpenStreetMap_0,lyr_Satelite_1,lyr_Disponibles_2,lyr_Vendidas_3,lyr_Reservadas_4];
lyr_Disponibles_2.set('fieldAliases', {'fid': 'fid', 'Lote': 'Lote', 'Area': 'Area', 'Estado': 'Estado', 'Precio': 'Precio', });
lyr_Vendidas_3.set('fieldAliases', {'fid': 'fid', 'Lote': 'Lote', 'Area': 'Area', 'Estado': 'Estado', });
lyr_Reservadas_4.set('fieldAliases', {'fid': 'fid', 'Lote': 'Lote', 'Area': 'Area', 'Precio': 'Precio', 'Estado': 'Estado', 'interesado_nom': 'nombre de quien reserva', 'telefono': 'telefono', 'mail': 'mail', 'vendedor': 'vendedor', 'fecha_reserva': 'fecha_reserva', 'fecha_vencimiento': 'fecha_vencimiento', 'dias_restantes': 'dias_restantes', 'estado_reserva': 'estado_reserva', 'monto_reserva': 'monto_reserva', 'metodo_reserva': 'metodo_reserva', 'monto_pactado': 'monto_pactado', 'comprobante_url': 'comprobante_url', });
lyr_Disponibles_2.set('fieldImages', {'fid': 'TextEdit', 'Lote': 'TextEdit', 'Area': 'TextEdit', 'Estado': 'TextEdit', 'Precio': 'TextEdit', });
lyr_Vendidas_3.set('fieldImages', {'fid': 'TextEdit', 'Lote': 'TextEdit', 'Area': 'TextEdit', 'Estado': 'TextEdit', });
lyr_Reservadas_4.set('fieldImages', {'fid': 'TextEdit', 'Lote': 'TextEdit', 'Area': 'TextEdit', 'Precio': 'TextEdit', 'Estado': 'TextEdit', 'interesado_nom': '', 'telefono': '', 'mail': '', 'vendedor': '', 'fecha_reserva': '', 'fecha_vencimiento': '', 'dias_restantes': '', 'estado_reserva': '', 'monto_reserva': '', 'metodo_reserva': '', 'monto_pactado': '', 'comprobante_url': '', });
lyr_Disponibles_2.set('fieldLabels', {'fid': 'hidden field', 'Lote': 'inline label - always visible', 'Area': 'inline label - always visible', 'Estado': 'inline label - always visible', 'Precio': 'inline label - always visible', });
lyr_Vendidas_3.set('fieldLabels', {'fid': 'hidden field', 'Lote': 'inline label - visible with data', 'Area': 'hidden field', 'Estado': 'inline label - always visible', });
lyr_Reservadas_4.set('fieldLabels', {'fid': 'no label', 'Lote': 'no label', 'Area': 'no label', 'Precio': 'no label', 'Estado': 'no label', 'interesado_nom': 'no label', 'telefono': 'no label', 'mail': 'no label', 'vendedor': 'no label', 'fecha_reserva': 'no label', 'fecha_vencimiento': 'no label', 'dias_restantes': 'no label', 'estado_reserva': 'no label', 'monto_reserva': 'no label', 'metodo_reserva': 'no label', 'monto_pactado': 'no label', 'comprobante_url': 'no label', });
lyr_Reservadas_4.on('precompose', function(evt) {
    evt.context.globalCompositeOperation = 'normal';
});
