window.edificios = window.edificios || [];
window.edificios_sugerido = window.edificios_sugerido || [];

window.mapaEspaciosLayer = L.layerGroup().addTo(map);

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

function obtenerColorTipoEspacio(idTipo) {
    if (Number(idTipo) === 1) return '#2b8a3e';
    if (Number(idTipo) === 2) return '#0b7285';
    if (Number(idTipo) === 3) return '#a61e4d';
    return '#495057';
}

function nombreTipoEspacio(idTipo, nombreTipo) {
    if (nombreTipo) return nombreTipo;
    if (Number(idTipo) === 1) return 'Aula';
    if (Number(idTipo) === 2) return 'Laboratorio';
    if (Number(idTipo) === 3) return 'Taller';
    return 'Espacio';
}

//Eliminar criculos confusos al seleccionar
function mostrarEspaciosEnMapa(edificio, espacios) {
    return;
    limpiarMarcadoresEspacios();
    if (!Array.isArray(espacios) || espacios.length === 0) return;

    var puntoBase = edificio.labelCoords || edificio.coordenadasBusqueda || (edificio.coords && edificio.coords[0]);
    if (!Array.isArray(puntoBase) || puntoBase.length < 2) return;

    var espacAcad = espacios.filter(function (esp) {
        var tipo = Number(esp.id_tipo);
        return tipo === 1 || tipo === 2 || tipo === 3;
    });

    var radio = 0.00008;
    espacAcad.forEach(function (esp, index) {
        var angulo = (index / Math.max(espacAcad.length, 1)) * Math.PI * 2;
        var lat = puntoBase[0] + Math.sin(angulo) * radio;
        var lng = puntoBase[1] + Math.cos(angulo) * radio;

        var color = obtenerColorTipoEspacio(esp.id_tipo);
        var titulo = nombreTipoEspacio(esp.id_tipo, esp.nombre_tipo);
        var esLaboratorio = Number(esp.id_tipo) === 2;
        var nombre = esLaboratorio
            ? (esp.nombre_descriptivo || esp.numero_espacio || esp.codigo_completo || 'Laboratorio')
            : (esp.numero_espacio || esp.codigo_completo || 'N/A');
        var codigo = esp.numero_espacio || esp.codigo_completo || '';
        var detalleNombre = esLaboratorio
            ? ('Nombre: ' + nombre + '<br>' + (codigo ? ('Codigo: ' + codigo + '<br>') : ''))
            : ('Codigo: ' + nombre + '<br>');

        L.circleMarker([lat, lng], {
            radius: 5,
            color: color,
            fillColor: color,
            fillOpacity: 0.8,
            weight: 1
        }).bindPopup(
            '<b>' + titulo + '</b><br>' +
            detalleNombre +
            'Edificio: ' + (esp.codigo_edificio || edificio.codigo || 'N/A')
        ).addTo(window.mapaEspaciosLayer);
    });
}

function mostrarMarcadorEdificio(edificio) {
    limpiarMarcadoresEspacios();
    if (!edificio) return;

    var puntoBase = (typeof obtenerPuntoEdificio === 'function')
        ? obtenerPuntoEdificio(edificio)
        : (edificio._coordsAPI || edificio.labelCoords || edificio.coordenadasBusqueda || (edificio.coords && edificio.coords[0]));

    if (!Array.isArray(puntoBase) || puntoBase.length < 2) return;

    // SVG idéntico al pin estándar de Leaflet (25x41) en verde FIAD (#2da832) para consistencia total
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

async function obtenerPoligonosIniciales() {
    const enCache = leerPoligonosDesdeCache();
    if (enCache) return enCache;

    const response = await fetch(construirUrlApiEdificios('?solo_poligonos=1'));
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
    edificiosLista.forEach(function (edificio) {
        try {
            if (!edificio.coords || edificio.coords.length < 3) return;

            var polygon = L.polygon(edificio.coords, {
                color: 'green',
                fillColor: '#D7F2F7',
                fillOpacity: 0.2,
                weight: 1
            }).addTo(map);

            // Delegamos el clic directamente a mostrarPanelEdificio para evitar peticiones duplicadas
            polygon.on('click', function () {
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

async function cargarSugerenciasEnSegundoPlano() {
    try {
        const response = await fetch(construirUrlApiEdificios(''));
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

async function inicializarEdificios() {
    try {
        const filasPoligonos = await obtenerPoligonosIniciales();
        window.edificios = agruparPoligonosConSet(filasPoligonos);
        dibujarPoligonos(window.edificios);
        document.dispatchEvent(new CustomEvent('mapa:edificiosLoaded'));

        cargarSugerenciasEnSegundoPlano();
    } catch (error) {
        console.error('[ERROR] No se pudieron cargar los edificios desde API:', error);
    }
}

window.obtenerPuntoEdificio = obtenerPuntoEdificio;
window.limpiarMarcadoresEspacios = limpiarMarcadoresEspacios;
window.mostrarEspaciosEnMapa = mostrarMarcadorEdificio;

inicializarEdificios();