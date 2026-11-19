window.edificios = window.edificios || [];
window.edificios_sugerido = window.edificios_sugerido || [];

window.mapaEspaciosLayer = L.layerGroup().addTo(map);
window.capaPoligonosEdificios = L.layerGroup().addTo(map);

const CACHE_KEY_POLIGONOS = 'mapafiad_poligonos_v3';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function construirUrlApiEdificios(queryString) {
    var basePath = window.location.pathname.replace(/\/[^\/]*$/, '');
    return window.location.origin + basePath + '/api/edificios.php' + (queryString || '');
}

function esLatLngValido(lat, lng) {
    if (isNaN(lat) || isNaN(lng)) return false;
    if (lat === null || lng === null) return false;
    if (lat <= -90 || lat >= 90) return false;
    if (lng <= -180 || lng >= 180) return false;
    if (Math.abs(lat + 99.99999999) < 0.000001 || Math.abs(lng + 99.99999999) < 0.000001) return false;
    return true;
}

function calcularCentroideCoordenadas(coordsArr) {
    if (!Array.isArray(coordsArr) || coordsArr.length === 0) return null;

    var sumaLat = 0;
    var sumaLng = 0;
    var total = 0;

    coordsArr.forEach(function (punto) {
        var lat = parseFloat(punto[0]);
        var lng = parseFloat(punto[1]);
        if (esLatLngValido(lat, lng)) {
            sumaLat += lat;
            sumaLng += lng;
            total++;
        }
    });

    return total === 0 ? null : [sumaLat / total, sumaLng / total];
}

function obtenerPuntoEdificio(edificio) {
    if (!edificio) return null;
    if (Array.isArray(edificio._coordsAPI) && edificio._coordsAPI.length >= 2) return edificio._coordsAPI;
    if (Array.isArray(edificio.labelCoords) && edificio.labelCoords.length >= 2) return edificio.labelCoords;
    if (Array.isArray(edificio.coordenadasBusqueda) && edificio.coordenadasBusqueda.length >= 2) return edificio.coordenadasBusqueda;

    var coords = Array.isArray(edificio.coords) ? edificio.coords : [];
    var centroide = calcularCentroideCoordenadas(coords);
    if (centroide) return centroide;

    if (coords.length > 0 && Array.isArray(coords[0]) && coords[0].length >= 2) {
        var latPrimero = parseFloat(coords[0][0]);
        var lngPrimero = parseFloat(coords[0][1]);
        if (esLatLngValido(latPrimero, lngPrimero)) return [latPrimero, lngPrimero];
    }

    return null;
}

function limpiarMarcadoresEspacios() {
    if (window.mapaEspaciosLayer) {
        window.mapaEspaciosLayer.clearLayers();
    }
}

function mostrarMarcadorEdificio(edificio) {
    limpiarMarcadoresEspacios();
    if (!edificio) return;

    var puntoBase = (typeof obtenerPuntoEdificio === 'function')
        ? obtenerPuntoEdificio(edificio)
        : (edificio._coordsAPI || edificio.labelCoords || edificio.coordenadasBusqueda || (edificio.coords && edificio.coords[0]));

    if (!Array.isArray(puntoBase) || puntoBase.length < 2) return;

    var colorPin = '#2da832';
    var bordePin = '#1f7a23';

    var svgPin =
        '<svg xmlns="http://www.w3.org/2000/svg" width="25" height="41" viewBox="0 0 25 41" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));">' +
            '<path d="M12.5 0C5.6 0 0 5.6 0 12.5C0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0Z" fill="' + colorPin + '" stroke="' + bordePin + '" stroke-width="1"/>' +
            '<circle cx="12.5" cy="12.5" r="4.5" fill="#ffffff"/>' +
        '</svg>';

    var iconoEdificio = L.divIcon({
        className: 'marcador-edificio-seleccionado',
        html: svgPin,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34]
    });

    var titulo = edificio.nombre || edificio.codigo || 'Edificio';
    L.marker(puntoBase, { icon: iconoEdificio })
        .bindPopup('<b>' + titulo + '</b>')
        .addTo(window.mapaEspaciosLayer);
}

function leerPoligonosDesdeCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY_POLIGONOS);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.poligonos)) return null;
        if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
            localStorage.removeItem(CACHE_KEY_POLIGONOS);
            return null;
        }
        return parsed.poligonos;
    } catch (e) {
        return null;
    }
}

function guardarPoligonosEnCache(poligonos) {
    try {
        localStorage.setItem(CACHE_KEY_POLIGONOS, JSON.stringify({
            timestamp: Date.now(),
            poligonos: poligonos
        }));
    } catch (e) {
        console.warn('No se pudo guardar polígonos en localStorage:', e);
    }
}

async function obtenerPoligonosIniciales(ignorarCache) {
    if (!ignorarCache) {
        const enCache = leerPoligonosDesdeCache();
        if (enCache) return enCache;
    }

    const url = construirUrlApiEdificios('?solo_poligonos=1' + (ignorarCache ? ('&_t=' + Date.now()) : ''));
    const response = await fetch(url);
    const data = await response.json();

    if (!data.success || !Array.isArray(data.poligonos)) {
        throw new Error('Respuesta inválida al obtener polígonos');
    }

    guardarPoligonosEnCache(data.poligonos);
    return data.poligonos;
}

function agruparPoligonosConSet(filasPoligonos) {
    const idsUnicos = new Set(filasPoligonos.map(fila => Number(fila.id_edificio)));
    const estructurasEdificios = [];

    idsUnicos.forEach(idEdificio => {
        const filasEdificio = filasPoligonos.filter(f => Number(f.id_edificio) === idEdificio);
        if (filasEdificio.length === 0) return;

        const codigo = filasEdificio[0].codigo || String(idEdificio);
        const nombreComun = filasEdificio[0].nombre_comun || codigo;
        const coords = filasEdificio
            .map(p => [parseFloat(p.latitud), parseFloat(p.longitud)])
            .filter(p => esLatLngValido(p[0], p[1]));

        if (coords.length < 3) return;

        const centroide = calcularCentroideCoordenadas(coords);

        estructurasEdificios.push({
            id_edificio: idEdificio,
            codigo: codigo,
            nombre: nombreComun,
            info: '',
            imagen: '',
            pisos: 0,
            coords: coords,
            labelCoords: centroide,
            coordenadasBusqueda: centroide,
            salones: [],
            _detalleCargado: false
        });
    });

    return estructurasEdificios;
}

function dibujarPoligonos(edificiosLista) {
    if (window.capaPoligonosEdificios) {
        window.capaPoligonosEdificios.clearLayers();
    }

    edificiosLista.forEach(function (edificio) {
        try {
            if (!edificio.coords || edificio.coords.length < 3) return;

            var polygon = L.polygon(edificio.coords, {
                color: 'green',
                fillColor: '#D7F2F7',
                fillOpacity: 0.2,
                weight: 1
            }).addTo(window.capaPoligonosEdificios);

            polygon.on('click', function () {
                if (window.EditorMapa && typeof window.EditorMapa.estaActivo === 'function' && window.EditorMapa.estaActivo()) {
                    return;
                }
                if (typeof mostrarPanelEdificio === 'function') {
                    mostrarPanelEdificio(edificio);
                }
            });

            polygon.on('mouseover', function () {
                polygon.setStyle({ color: 'black', weight: 4 });
            });

            polygon.on('mouseout', function () {
                polygon.setStyle({ color: 'green', weight: 1 });
            });
        } catch (error) {
            console.warn('No se pudo dibujar el edificio:', edificio.codigo, error);
        }
    });
}

async function cargarSugerenciasEnSegundoPlano(ignorarCache) {
    try {
        const url = construirUrlApiEdificios(ignorarCache ? ('?_t=' + Date.now()) : '');
        const response = await fetch(url);
        const data = await response.json();
        if (!data.success || !Array.isArray(data.edificios)) return;

        const sugerencias = [];
        const seen = new Set();

        data.edificios.forEach(ed => {
            const lat = parseFloat(ed.latitud);
            const lng = parseFloat(ed.longitud);
            if (!esLatLngValido(lat, lng)) return;

            const nombrePrincipal = ed.nombre_comun || ed.codigo;
            const keyPrincipal = nombrePrincipal.toLowerCase();
            if (!seen.has(keyPrincipal)) {
                seen.add(keyPrincipal);
                sugerencias.push({
                    nombre: nombrePrincipal,
                    coordenadas: [lat, lng],
                    codigo: ed.codigo
                });
            }

            if (Array.isArray(ed.alias)) {
                ed.alias.forEach(aliasItem => {
                    if (!aliasItem) return;
                    const keyAlias = aliasItem.toLowerCase();
                    if (!seen.has(keyAlias)) {
                        seen.add(keyAlias);
                        sugerencias.push({
                            nombre: aliasItem,
                            coordenadas: [lat, lng],
                            codigo: ed.codigo
                        });
                    }
                });
            }
        });

        window.edificios_sugerido = sugerencias;
    } catch (e) {
        console.warn('No se pudieron precargar sugerencias:', e);
    }
}

async function inicializarEdificios(ignorarCache) {
    try {
        if (ignorarCache) {
            try { localStorage.removeItem(CACHE_KEY_POLIGONOS); } catch (e) {}
        }
        const filasPoligonos = await obtenerPoligonosIniciales(Boolean(ignorarCache));
        window.edificios = agruparPoligonosConSet(filasPoligonos);
        dibujarPoligonos(window.edificios);
        document.dispatchEvent(new CustomEvent('mapa:edificiosLoaded'));

        await cargarSugerenciasEnSegundoPlano(Boolean(ignorarCache));
    } catch (error) {
        console.error('[ERROR] No se pudieron cargar los edificios desde API:', error);
    }
}

window.obtenerPuntoEdificio = obtenerPuntoEdificio;
window.limpiarMarcadoresEspacios = limpiarMarcadoresEspacios;
window.mostrarEspaciosEnMapa = mostrarMarcadorEdificio;
window.recargarEdificiosDesdeBD = function () {
    return inicializarEdificios(true);
};

// =============================================================================
// Plugin desacoplado de Edificios para EditorMapa
// =============================================================================
(function () {
    var ctxEditor = null;
    var editorActivo = false;
    var herramientaActual = 'navegar';

    var puntosEdificioActual = [];
    var edificiosExistentes = [];
    var edificiosNuevos = [];
    var edificiosActualizados = {};

    var capaPreviewEdificio = null;
    var capaEdificiosNuevos = null;
    var capaEdificiosExistentes = null;

    function escaparHTML(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function calcularCentroide(coordsLngLat) {
        var latLngs = coordsLngLat.map(function (c) { return [c[1], c[0]]; });
        var c = calcularCentroideCoordenadas(latLngs);
        return c ? [c[1], c[0]] : [0, 0];
    }

    function crearIconoDestino(etiqueta, bgColor, borderColor) {
        return L.divIcon({
            className: 'fiad-edificio-dest-pin',
            iconSize: [44, 22],
            iconAnchor: [22, 11],
            popupAnchor: [0, -12],
            html: '<div class="fiad-edificio-dest-badge" style="background:' + bgColor + ';border:2px solid ' + borderColor + ';">🎯 ' + escaparHTML(etiqueta || 'ED') + '</div>'
        });
    }

    function actualizarAccionesUI() {
        if (!ctxEditor) return;
        ctxEditor.setAccionesTrazo({
            mostrarDeshacer: herramientaActual === 'edificio' && puntosEdificioActual.length >= 1,
            mostrarFinalizar: herramientaActual === 'edificio' && puntosEdificioActual.length >= 3,
            textoFinalizar: '✔ Cerrar edificio'
        });
    }

    function limpiarEdificioEnCurso() {
        puntosEdificioActual = [];
        if (capaPreviewEdificio && typeof map !== 'undefined') {
            map.removeLayer(capaPreviewEdificio);
            capaPreviewEdificio = null;
        }
        actualizarAccionesUI();
    }

    function actualizarPreviewEdificio(cursorCoord) {
        if (!editorActivo || typeof map === 'undefined') return;
        if (capaPreviewEdificio) {
            map.removeLayer(capaPreviewEdificio);
            capaPreviewEdificio = null;
        }
        if (puntosEdificioActual.length === 0) return;

        capaPreviewEdificio = L.layerGroup().addTo(map);
        var ring = puntosEdificioActual.slice();
        if (cursorCoord) ring.push(cursorCoord);

        var latlngs = ring.map(function (c) { return [c[1], c[0]]; });
        if (latlngs.length >= 3) {
            L.polygon(latlngs, {
                color: '#0d9488',
                weight: 2.5,
                dashArray: '5, 5',
                fillColor: '#14b8a6',
                fillOpacity: 0.25,
                interactive: false
            }).addTo(capaPreviewEdificio);

            var centroide = calcularCentroide(ring);
            L.circleMarker([centroide[1], centroide[0]], {
                radius: 6,
                color: '#ffffff',
                weight: 2,
                fillColor: '#0f766e',
                fillOpacity: 1,
                interactive: false
            }).addTo(capaPreviewEdificio);
        } else {
            L.polyline(latlngs, {
                color: '#0d9488',
                weight: 2.5,
                dashArray: '5, 5',
                interactive: false
            }).addTo(capaPreviewEdificio);
        }

        puntosEdificioActual.forEach(function (pt, idx) {
            L.circleMarker([pt[1], pt[0]], {
                radius: 5,
                color: '#ffffff',
                weight: 2,
                fillColor: idx === 0 ? '#f59e0b' : '#0d9488',
                fillOpacity: 1,
                interactive: false
            }).addTo(capaPreviewEdificio);
        });
    }

    async function cargarEdificiosExistentes() {
        try {
            var res = await fetch(construirUrlApiEdificios('?_t=' + Date.now()));
            if (res.ok) {
                var data = await res.json();
                var lista = Array.isArray(data.edificios) ? data.edificios : [];
                edificiosExistentes = lista.map(function (ed) {
                    return {
                        id_edificio: parseInt(ed.id_edificio, 10),
                        codigo: String(ed.codigo || '').trim(),
                        nombre_comun: String(ed.nombre_comun || '').trim(),
                        latitud: parseFloat(ed.latitud),
                        longitud: parseFloat(ed.longitud)
                    };
                }).filter(function (ed) {
                    return !isNaN(ed.id_edificio) && esLatLngValido(ed.latitud, ed.longitud);
                });
            }
        } catch (e) {
            console.warn('[EdificiosEditor] Error cargando edificios:', e);
        }
    }

    function dibujarEdificiosExistentes() {
        if (capaEdificiosExistentes && typeof map !== 'undefined') {
            map.removeLayer(capaEdificiosExistentes);
            capaEdificiosExistentes = null;
        }
        if (!editorActivo || typeof map === 'undefined' || edificiosExistentes.length === 0) return;

        var arrastrable = (herramientaActual === 'navegar');
        capaEdificiosExistentes = L.layerGroup().addTo(map);

        edificiosExistentes.forEach(function (ed) {
            var mod = edificiosActualizados[ed.id_edificio];
            var lat = mod ? mod.latitud : ed.latitud;
            var lng = mod ? mod.longitud : ed.longitud;
            var etiqueta = ed.codigo || ('#' + ed.id_edificio);

            var marker = L.marker([lat, lng], {
                draggable: arrastrable,
                icon: crearIconoDestino(etiqueta, mod ? '#d97706' : '#1e3a8a', mod ? '#fef08a' : '#93c5fd'),
                zIndexOffset: 850
            }).addTo(capaEdificiosExistentes);

            if (arrastrable) {
                marker.on('dragend', function (ev) {
                    var ll = ev.target.getLatLng();
                    edificiosActualizados[ed.id_edificio] = {
                        id_edificio: ed.id_edificio,
                        latitud: Number(ll.lat.toFixed(8)),
                        longitud: Number(ll.lng.toFixed(8))
                    };
                    dibujarEdificiosExistentes();
                    if (ctxEditor) ctxEditor.setEstado('🎯 Destino de <strong>' + escaparHTML(etiqueta) + '</strong> movido — presiona <strong>Guardar en BD</strong>.');
                });

                marker.on('click', function (ev) {
                    L.DomEvent.stopPropagation(ev);
                    var curMod = edificiosActualizados[ed.id_edificio];
                    var curLat = curMod ? curMod.latitud : ed.latitud;
                    var curLng = curMod ? curMod.longitud : ed.longitud;
                    var titulo = (ed.nombre_comun && ed.nombre_comun !== etiqueta)
                        ? (escaparHTML(ed.nombre_comun) + ' (' + escaparHTML(etiqueta) + ')')
                        : escaparHTML(etiqueta);

                    var html =
                        '<div class="fiad-editor-popup">' +
                          '<strong>🏢 ' + titulo + '</strong>' +
                          '<span style="color:#475569;font-size:11px;">Punto final de ruta (BD):</span>' +
                          '<div class="fiad-editor-grid-2">' +
                            '<label>Latitud<input id="fiad-edif-lat-' + ed.id_edificio + '" type="number" step="0.00000001" value="' + curLat + '"></label>' +
                            '<label>Longitud<input id="fiad-edif-lng-' + ed.id_edificio + '" type="number" step="0.00000001" value="' + curLng + '"></label>' +
                          '</div>' +
                          '<button class="fiad-editor-popup-btn" style="background:#2563eb;" onclick="window.EdificiosEditor._aplicarExistente(' + ed.id_edificio + ')">✔ Actualizar punto</button>' +
                          (curMod ? '<button class="fiad-editor-popup-btn" style="background:#64748b;" onclick="window.EdificiosEditor._revertirExistente(' + ed.id_edificio + ')">↩️ Restaurar original</button>' : '') +
                        '</div>';

                    L.popup().setLatLng([curLat, curLng]).setContent(html).openOn(map);
                });
            }
        });
    }

    function dibujarEdificiosNuevos() {
        if (capaEdificiosNuevos && typeof map !== 'undefined') {
            map.removeLayer(capaEdificiosNuevos);
            capaEdificiosNuevos = null;
        }
        if (!editorActivo || typeof map === 'undefined' || edificiosNuevos.length === 0) return;

        capaEdificiosNuevos = L.layerGroup().addTo(map);
        edificiosNuevos.forEach(function (ed) {
            var latlngs = (ed.vertices || []).map(function (v) { return [v.latitud, v.longitud]; });
            if (latlngs.length < 3) return;

            var cod = ed.codigo || 'NUEVO';
            var poly = L.polygon(latlngs, {
                color: '#0f766e',
                weight: 2.5,
                fillColor: '#14b8a6',
                fillOpacity: 0.30
            }).addTo(capaEdificiosNuevos);

            var pin = L.marker([ed.latitud, ed.longitud], {
                draggable: true,
                icon: crearIconoDestino(cod, '#0f766e', '#ffffff'),
                zIndexOffset: 950
            }).addTo(capaEdificiosNuevos);

            pin.on('dragend', function (ev) {
                var ll = ev.target.getLatLng();
                ed.latitud = Number(ll.lat.toFixed(8));
                ed.longitud = Number(ll.lng.toFixed(8));
                if (ctxEditor) ctxEditor.setEstado('🎯 Punto final de <strong>' + escaparHTML(cod) + '</strong> ajustado.');
            });

            function abrirPopupNuevo() {
                var html =
                    '<div class="fiad-editor-popup">' +
                      '<strong>🏢 Edificio nuevo (pendiente BD)</strong>' +
                      '<div>Código: <b>' + escaparHTML(cod) + '</b> · Nombre: <b>' + escaparHTML(ed.nombre_comun) + '</b></div>' +
                      '<div class="fiad-editor-grid-2">' +
                        '<label>Latitud<input id="fiad-new-edif-lat-' + escaparHTML(ed.temp_id) + '" type="number" step="0.00000001" value="' + ed.latitud + '"></label>' +
                        '<label>Longitud<input id="fiad-new-edif-lng-' + escaparHTML(ed.temp_id) + '" type="number" step="0.00000001" value="' + ed.longitud + '"></label>' +
                      '</div>' +
                      '<div class="fiad-editor-grid-2">' +
                        '<button class="fiad-editor-popup-btn" style="background:#0d9488;" onclick="window.EdificiosEditor._aplicarNuevo(\'' + escaparHTML(ed.temp_id) + '\')">✔ Aplicar</button>' +
                        '<button class="fiad-editor-popup-btn" style="background:#475569;" onclick="window.EdificiosEditor._centroideNuevo(\'' + escaparHTML(ed.temp_id) + '\')">⌖ Centroide</button>' +
                      '</div>' +
                      '<button class="fiad-editor-popup-btn" style="background:#dc2626;" onclick="window.EdificiosEditor._eliminarNuevo(\'' + escaparHTML(ed.temp_id) + '\')">🗑️ Quitar edificio</button>' +
                    '</div>';
                L.popup().setLatLng([ed.latitud, ed.longitud]).setContent(html).openOn(map);
            }

            pin.on('click', function (ev) { L.DomEvent.stopPropagation(ev); abrirPopupNuevo(); });
            poly.on('click', function (ev) {
                if (herramientaActual !== 'navegar') return;
                L.DomEvent.stopPropagation(ev);
                abrirPopupNuevo();
            });
        });
    }

    function abrirConfirmacionEdificio() {
        if (puntosEdificioActual.length < 3) return;
        var centroide = calcularCentroide(puntosEdificioActual);
        var html =
            '<div class="fiad-editor-popup">' +
              '<strong>🏢 Crear Edificio (' + puntosEdificioActual.length + ' vértices)</strong>' +
              '<div style="font-size:11px;color:#475569;background:#f1f5f9;padding:5px;border-radius:4px;">' +
                'Centroide inicial: <b>' + centroide[1].toFixed(8) + ', ' + centroide[0].toFixed(8) + '</b><br>' +
                'Luego podrás arrastrar el pin <b>🎯</b> al acceso exacto.' +
              '</div>' +
              '<label>Código (edificio.codigo):' +
                '<input id="fiad-crear-edif-codigo" type="text" placeholder="Ej. E23">' +
              '</label>' +
              '<label>Nombre (opcional):' +
                '<input id="fiad-crear-edif-nombre" type="text" placeholder="Ej. Edificio 23">' +
              '</label>' +
              '<button class="fiad-editor-popup-btn" style="background:#0d9488;" onclick="window.EdificiosEditor._confirmarNuevo()">✔ Confirmar Edificio</button>' +
            '</div>';

        L.popup().setLatLng([centroide[1], centroide[0]]).setContent(html).openOn(map);
    }

    window.EdificiosEditor = {
        _confirmarNuevo: function () {
            if (puntosEdificioActual.length < 3) return;
            var codEl = document.getElementById('fiad-crear-edif-codigo');
            var nomEl = document.getElementById('fiad-crear-edif-nombre');
            var codigo = (codEl && codEl.value.trim()) ? codEl.value.trim() : ('E_NEW_' + (edificiosNuevos.length + 1));
            var nombre = (nomEl && nomEl.value.trim()) ? nomEl.value.trim() : codigo;

            var centroide = calcularCentroide(puntosEdificioActual);
            var vertices = puntosEdificioActual.map(function (c, idx) {
                return {
                    orden: idx + 1,
                    latitud: Number(c[1].toFixed(8)),
                    longitud: Number(c[0].toFixed(8))
                };
            });

            edificiosNuevos.push({
                temp_id: 'edif_' + Date.now(),
                codigo: codigo,
                nombre_comun: nombre,
                descripcion: null,
                latitud: Number(centroide[1].toFixed(8)),
                longitud: Number(centroide[0].toFixed(8)),
                foto_principal_url: 'img/prueba.jpg',
                numero_pisos: 1,
                vertices: vertices
            });

            map.closePopup();
            limpiarEdificioEnCurso();
            dibujarEdificiosNuevos();
            if (ctxEditor) ctxEditor.setEstado('✅ Edificio <strong>' + escaparHTML(codigo) + '</strong> listo — arrastra su pin <strong>🎯</strong> si deseas ajustar su acceso.');
        },
        _aplicarExistente: function (idEdificio) {
            var lat = parseFloat((document.getElementById('fiad-edif-lat-' + idEdificio) || {}).value);
            var lng = parseFloat((document.getElementById('fiad-edif-lng-' + idEdificio) || {}).value);
            if (!esLatLngValido(lat, lng)) return alert('Coordenadas inválidas.');
            edificiosActualizados[idEdificio] = { id_edificio: idEdificio, latitud: Number(lat.toFixed(8)), longitud: Number(lng.toFixed(8)) };
            map.closePopup();
            dibujarEdificiosExistentes();
        },
        _revertirExistente: function (idEdificio) {
            delete edificiosActualizados[idEdificio];
            map.closePopup();
            dibujarEdificiosExistentes();
        },
        _aplicarNuevo: function (tempId) {
            var ed = edificiosNuevos.find(function (item) { return item.temp_id === tempId; });
            if (!ed) return;
            var lat = parseFloat((document.getElementById('fiad-new-edif-lat-' + tempId) || {}).value);
            var lng = parseFloat((document.getElementById('fiad-new-edif-lng-' + tempId) || {}).value);
            if (!esLatLngValido(lat, lng)) return alert('Coordenadas inválidas.');
            ed.latitud = Number(lat.toFixed(8));
            ed.longitud = Number(lng.toFixed(8));
            map.closePopup();
            dibujarEdificiosNuevos();
        },
        _centroideNuevo: function (tempId) {
            var ed = edificiosNuevos.find(function (item) { return item.temp_id === tempId; });
            if (!ed) return;
            var c = calcularCentroide(ed.vertices.map(function (v) { return [v.longitud, v.latitud]; }));
            ed.latitud = Number(c[1].toFixed(8));
            ed.longitud = Number(c[0].toFixed(8));
            map.closePopup();
            dibujarEdificiosNuevos();
        },
        _eliminarNuevo: function (tempId) {
            edificiosNuevos = edificiosNuevos.filter(function (ed) { return ed.temp_id !== tempId; });
            map.closePopup();
            dibujarEdificiosNuevos();
        }
    };

    var moduloEditorEdificios = {
        id: 'edificios',
        orden: 30,
        herramientas: [
            {
                id: 'edificio',
                label: '🏢 Crear Edificio',
                color: '#0d9488',
                ayuda: '🏢 <strong>Crear Edificio:</strong> Haz clic en cada esquina del edificio (mínimo 3 vértices) y presiona <strong>Cerrar edificio</strong> o doble clic.'
            }
        ],
        alActivarEditor: async function (ctx) {
            ctxEditor = ctx;
            editorActivo = true;
            await cargarEdificiosExistentes();
            dibujarEdificiosExistentes();
            dibujarEdificiosNuevos();
        },
        alDesactivarEditor: function () {
            editorActivo = false;
            ctxEditor = null;
            limpiarEdificioEnCurso();
            if (capaEdificiosExistentes) { map.removeLayer(capaEdificiosExistentes); capaEdificiosExistentes = null; }
            if (capaEdificiosNuevos) { map.removeLayer(capaEdificiosNuevos); capaEdificiosNuevos = null; }
        },
        alCambiarHerramienta: function (herramientaId) {
            herramientaActual = herramientaId;
            limpiarEdificioEnCurso();
            dibujarEdificiosExistentes();
            dibujarEdificiosNuevos();
        },
        onClick: function (e, herramientaId) {
            if (herramientaId !== 'edificio') return;
            var coord = [e.latlng.lng, e.latlng.lat];
            if (puntosEdificioActual.length > 0) {
                var prev = puntosEdificioActual[puntosEdificioActual.length - 1];
                if (Math.hypot(prev[0] - coord[0], prev[1] - coord[1]) < 0.000002) return;
            }
            puntosEdificioActual.push(coord);
            actualizarPreviewEdificio(coord);
            actualizarAccionesUI();
        },
        onMouseMove: function (e, herramientaId) {
            if (herramientaId === 'edificio' && puntosEdificioActual.length > 0) {
                actualizarPreviewEdificio([e.latlng.lng, e.latlng.lat]);
            }
        },
        onDblClick: function (e, herramientaId) {
            if (herramientaId === 'edificio' && puntosEdificioActual.length >= 3) {
                L.DomEvent.stopPropagation(e);
                abrirConfirmacionEdificio();
            }
        },
        deshacer: function (herramientaId) {
            if (herramientaId !== 'edificio' || puntosEdificioActual.length === 0) return false;
            puntosEdificioActual.pop();
            if (puntosEdificioActual.length === 0) limpiarEdificioEnCurso();
            else {
                actualizarPreviewEdificio(null);
                actualizarAccionesUI();
            }
            return true;
        },
        finalizar: function (herramientaId) {
            if (herramientaId !== 'edificio') return false;
            if (puntosEdificioActual.length >= 3) abrirConfirmacionEdificio();
            else limpiarEdificioEnCurso();
            return true;
        },
        cancelar: function (herramientaId) {
            if (herramientaId !== 'edificio' || puntosEdificioActual.length === 0) return false;
            limpiarEdificioEnCurso();
            return true;
        },
        recargar: async function () {
            await cargarEdificiosExistentes();
            dibujarEdificiosExistentes();
            dibujarEdificiosNuevos();
        },
        guardar: async function () {
            var listaActualizados = Object.values(edificiosActualizados);
            if (edificiosNuevos.length === 0 && listaActualizados.length === 0) {
                return { ok: true };
            }

            var res = await fetch(construirUrlApiEdificios(''), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    edificios_nuevos: edificiosNuevos,
                    edificios_actualizados: listaActualizados
                })
            });
            var data = await res.json();

            if (data.ok !== false) {
                edificiosNuevos = [];
                edificiosActualizados = {};
                await cargarEdificiosExistentes();
                dibujarEdificiosNuevos();
                dibujarEdificiosExistentes();
                await inicializarEdificios(true);

                var partes = [];
                if (data.edificios_insertados > 0) partes.push('Edificios creados: ' + data.edificios_insertados);
                if (data.edificios_modificados > 0) partes.push('Destinos de edificios actualizados: ' + data.edificios_modificados);
                return { ok: true, resumen: partes.join(' · ') };
            }

            return { ok: false, mensaje: data.mensaje || 'Error guardando edificios' };
        }
    };

    if (window.EditorMapa && typeof window.EditorMapa.registrarModulo === 'function') {
        window.EditorMapa.registrarModulo(moduloEditorEdificios);
    } else {
        window._editorModulosPendientes = window._editorModulosPendientes || [];
        window._editorModulosPendientes.push(moduloEditorEdificios);
    }
})();

inicializarEdificios(false);