// Cargar el mapa en coordenadas
var map = L.map('map', {
    center: [31.86507019358021, -116.6675618186344],
    zoom: 17,
    minZoom: 0,
    maxZoom: 24,
    zoomSnap: 0.25,
    zoomControl: false
});

setTimeout(function () { map.invalidateSize(); }, 100);

L.control.scale({
    position: 'bottomleft',
    imperial: true,
    metric: true
}).addTo(map);

var Satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxNativeZoom: 19,
    maxZoom: 24,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
});

var Atlas = L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://www.thunderforest.com/">Thunderforest</a>',
    subdomains: 'abc',
    maxNativeZoom: 18,
    maxZoom: 24
}).addTo(map);

// FUNCION PARA CAMBIAR CAPA
var mapa_anterior = Atlas;
function cambio_capa() {
    if (mapa_anterior == Atlas) {
        map.removeLayer(Atlas);
        Satelite.addTo(map);
        mapa_anterior = Satelite;
    } else {
        map.removeLayer(Satelite);
        Atlas.addTo(map);
        mapa_anterior = Atlas;
    }
}

var btnCapas = document.getElementById('btn_capas');
if (btnCapas) {
    btnCapas.addEventListener('click', cambio_capa);
}

/*
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
*/

let endMarker = null;