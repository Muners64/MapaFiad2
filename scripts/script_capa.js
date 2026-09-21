// Cargar el mapa en coordenadas
var map = L.map('map', {
    center: [31.86507019358021, -116.6675618186344],
    zoom: 17,
    maxZoom: 60,
    minZoom: 10,
    zoomControl: false 
});

setTimeout(function() { map.invalidateSize(); }, 100);


L.control.scale({
    position: 'bottomleft',  
    imperial: true,      
    metric: true          // Para mostrar la escala en kilómetros y metros
}).addTo(map);

var Satelite = L.tileLayer('http://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 22,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
});


var Atlas = L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://www.thunderforest.com/">Thunderforest</a>',
    subdomains: 'abc',
    maxZoom: 22
}).addTo(map);

// FUNCION PARA CAMBIAR CAPA
var mapa_anterior = Atlas;
function cambio_capa() {
    if (mapa_anterior == Atlas) {
        map.removeLayer(Atlas);
        Satelite.addTo(map);
        mapa_anterior = Satelite;
        map.setMaxZoom(19); 

    } else {
        map.removeLayer(Satelite);
        Atlas.addTo(map);
        mapa_anterior = Atlas;
        map.setMaxZoom(22); 
    }
}
document.getElementById('btn_capas').addEventListener('click', cambio_capa);

// FUNCION PARA HACER ZOOM
function zoomIn() {
    map.zoomIn();
}
function zoomOut() {
    map.zoomOut();
}
document.getElementById('btn_zoom_mas').addEventListener('click', zoomIn);
document.getElementById('btn_zoom_menos').addEventListener('click', zoomOut);


// FUNCION PARA CENTRAR EL MAPA
function reset_vista() {
    map.setView([31.86507019358021, -116.6675618186344], 19.4);
}
document.getElementById('btn_centrar').addEventListener('click', reset_vista);

let endMarker = null;
window.mapaEspaciosLayer = L.layerGroup().addTo(map);

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

function mostrarEspaciosEnMapa(edificio, espacios) {
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

        var marker = L.circleMarker([lat, lng], {
            radius: 5,
            color: color,
            fillColor: color,
            fillOpacity: 0.8,
            weight: 1
        }).bindPopup(
            '<b>' + titulo + '</b><br>' +
            detalleNombre +
            'Edificio: ' + (esp.codigo_edificio || edificio.codigo || 'N/A')
        );

        marker.addTo(window.mapaEspaciosLayer);
    });
}

window.limpiarMarcadoresEspacios = limpiarMarcadoresEspacios;
window.mostrarEspaciosEnMapa = mostrarEspaciosEnMapa;

// FUNCIONALIDAD DE LOS EDIFICIOS
window.edificios = window.edificios || [];
window.edificios_sugerido = window.edificios_sugerido || [];

function construirUrlApiEdificios() {
    var basePath = window.location.pathname.replace(/\/[^\/]*$/, '');
    return window.location.origin + basePath + '/api/edificios.php?coords=1';
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

    if (total === 0) return null;
    return [sumaLat / total, sumaLng / total];
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

window.obtenerPuntoEdificio = obtenerPuntoEdificio;

function convertirEdificioApi(edificioApi) {
    var coords = [];
    if (edificioApi.coordenadas_poligono && edificioApi.coordenadas_poligono.length > 0) {
        coords = edificioApi.coordenadas_poligono
            .map(function (p) {
                return [parseFloat(p.latitud), parseFloat(p.longitud)];
            })
            .filter(function (p) {
                return esLatLngValido(p[0], p[1]);
            });
    }

    var lat = parseFloat(edificioApi.latitud);
    var lng = parseFloat(edificioApi.longitud);
    var puntoBusqueda = null;
    if (esLatLngValido(lat, lng)) {
        puntoBusqueda = [lat, lng];
    } else {
        puntoBusqueda = obtenerPuntoEdificio({ coords: coords });
    }

    return {
        codigo: edificioApi.codigo,
        nombre: edificioApi.nombre_comun || edificioApi.codigo,
        info: edificioApi.descripcion || 'Sin descripción disponible.',
        imagen: edificioApi.foto_principal_url || 'img/prueba.jpg',
        pisos: edificioApi.numero_pisos || 0,
        coords: coords,
        labelCoords: puntoBusqueda,
        coordenadasBusqueda: puntoBusqueda,
        salones: []
    };
}

function construirSugerenciasDesdeApi(edificiosApi) {
    var sugerencias = [];
    edificiosApi.forEach(function (edificioApi) {
        var lat = parseFloat(edificioApi.latitud);
        var lng = parseFloat(edificioApi.longitud);
        if (!isNaN(lat) && !isNaN(lng)) {
            sugerencias.push({
                nombre: edificioApi.nombre_comun || edificioApi.codigo,
                coordenadas: [lat, lng],
                codigo: edificioApi.codigo
            });

            if (Array.isArray(edificioApi.alias)) {
                edificioApi.alias.forEach(function (aliasItem) {
                    if (aliasItem) {
                        sugerencias.push({
                            nombre: aliasItem,
                            coordenadas: [lat, lng],
                            codigo: edificioApi.codigo
                        });
                    }
                });
            }
        }
    });

    var seen = {};
    return sugerencias.filter(function (s) {
        var key = (s.nombre || '').toLowerCase();
        if (seen[key]) return false;
        seen[key] = true;
        return true;
    });
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

            polygon.on('click', function () {
                mostrarPanelEdificio(edificio);
            });

            polygon.on('mouseover', function () {
                polygon.setStyle({
                    color: 'black',
                    weight: 4
                });
            });

            polygon.on('mouseout', function () {
                polygon.setStyle({
                    color: 'green',
                    weight: 1
                });
            });
        } catch (error) {
            console.warn('No se pudo dibujar el edificio:', edificio.codigo, error);
        }
    });
}

function cargarEdificiosDesdeApi() {
    var apiUrl = construirUrlApiEdificios();

    return fetch(apiUrl)
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (!data.success || !Array.isArray(data.edificios)) {
                throw new Error('Respuesta inválida de API de edificios');
            }

            var edificiosNormalizados = data.edificios
                .map(convertirEdificioApi)
                .filter(function (e) { return e.coords && e.coords.length >= 3; });

            window.edificios = edificiosNormalizados;
            window.edificios_sugerido = construirSugerenciasDesdeApi(data.edificios);
            dibujarPoligonos(window.edificios);
            document.dispatchEvent(new CustomEvent('mapa:edificiosLoaded'));
        })
        .catch(function (error) {
            console.warn('No se pudieron cargar edificios desde API.', error);
            console.error('No hay datos de edificios disponibles. Revisa que la API esté accesible y que la base de datos esté configurada en database/db_config.php.');
        });
}

cargarEdificiosDesdeApi();

