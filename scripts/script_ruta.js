let startPoint = null;
let endPoint = null;
window.userMarker = null;
window.endMarker = null;

function crearPinSVG(colorPin, bordePin, claseExtra) {
  const svgPin =
    '<svg xmlns="http://www.w3.org/2000/svg" width="25" height="41" viewBox="0 0 25 41" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));">' +
      '<path d="M12.5 0C5.6 0 0 5.6 0 12.5C0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0Z" fill="' + colorPin + '" stroke="' + bordePin + '" stroke-width="1"/>' +
      '<circle cx="12.5" cy="12.5" r="4.5" fill="#ffffff"/>' +
    '</svg>';

  return L.divIcon({
    className: claseExtra || '',
    html: svgPin,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34]
  });
}

// Azul: Ubicación del usuario | Rojo: Destino de ruta (Verde: Selección en script_edificios.js)
const iconoUbicacionAzul = crearPinSVG('#2563eb', '#1d4ed8', 'marcador-ubicacion');
const iconoDestinoRojo = crearPinSVG('#dc2626', '#991b1b', 'marcador-destino');

// Exponer iconos por si script_panel_derecho.js crea el marcador de destino en "Cómo Llegar"
window.iconoUbicacionAzul = iconoUbicacionAzul;
window.iconoDestinoRojo = iconoDestinoRojo;

// URL dinámica: detecta automáticamente la ruta base del proyecto
var _basePath = window.location.pathname.replace(/\/[^\/]*$/, '');
var _proxyUrl = window.location.origin + _basePath + '/api/mapbox_proxy.php';

const _mapboxFallback = L.Routing.mapboxPHP({
  backendUrl: _proxyUrl,
  language: 'es',
  profile: 'mapbox/walking'
});

const routingControl = L.Routing.control({
  waypoints: [],
  routeWhileDragging: true,
  fitSelectedRoutes: false, // Evita que la ruta mueva la cámara en cada actualización del GPS
  router: typeof L.Routing.grafoAccesible === 'function'
    ? L.Routing.grafoAccesible({ fallbackRouter: _mapboxFallback })
    : _mapboxFallback,
  show: false,
  createMarker: function () { return null; }
}).addTo(map);

let ultimoDestinoEncuadrado = null;
let encuadrarSiguienteRuta = false;

routingControl.on('routesfound', function (e) {
  if (!encuadrarSiguienteRuta) return;
  encuadrarSiguienteRuta = false;

  const route = e.routes && e.routes[0];
  if (route && route.coordinates && route.coordinates.length > 0) {
    const bounds = L.latLngBounds(route.coordinates);
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 18 });
  }
});

function updateRoute(permitirEncuadre) {
  if (startPoint && endPoint) {
    const startLL = L.latLng(startPoint);
    const destLL = L.latLng(endPoint);
    const destKey = destLL.lat.toFixed(6) + ',' + destLL.lng.toFixed(6);

    // Solo encuadrar la ruta una vez cuando se elige un destino nuevo (nunca en ticks del GPS)
    if (permitirEncuadre !== false && destKey !== ultimoDestinoEncuadrado) {
      ultimoDestinoEncuadrado = destKey;
      encuadrarSiguienteRuta = true;
    } else {
      encuadrarSiguienteRuta = false;
    }

    routingControl.setWaypoints([startLL, destLL]);
  } else {
    ultimoDestinoEncuadrado = null;
    encuadrarSiguienteRuta = false;
    routingControl.setWaypoints([]);
  }
}

// Alternar modo accesible (true = evita escaleras y tramos cortados, prioriza rampas)
window.setModoAccesible = function (activar) {
  if (window.GrafoCampus) {
    window.GrafoCampus.soloAccesible = Boolean(activar);
  }
  updateRoute(false);
};

// Escuchar cuando el usuario ACTIVA o actualiza su ubicación
window.addEventListener('ubicacionActualizada', (e) => {
  const { lat, lng, esPrimerCentrado } = e.detail;
  const esNuevoMarcador = !window.userMarker;
  startPoint = [lat, lng];

  if (esNuevoMarcador) {
    window.userMarker = L.marker(startPoint, { icon: iconoUbicacionAzul, zIndexOffset: 1000 })
      .addTo(map)
      .bindPopup('Estás Aquí', { autoPan: false });
  } else {
    window.userMarker.setLatLng(startPoint);
  }

  // Centrar únicamente la primera vez que se activa el GPS (si el usuario no movió el mapa antes)
  const debeCentrar = (typeof esPrimerCentrado === 'boolean')
    ? esPrimerCentrado
    : esNuevoMarcador;

  if (debeCentrar) {
    map.setView(startPoint, 18, { animate: true });
  }

  // Actualizar la ruta en segundo plano sin robar el control de la cámara
  updateRoute(false);
});

// Escuchar cuando el usuario DESACTIVA su ubicación en cualquier momento
window.addEventListener('ubicacionDesactivada', () => {
  if (window.userMarker) {
    map.removeLayer(window.userMarker);
    window.userMarker = null;
  }
  startPoint = null;
  updateRoute(false);
});

function addCustomButtons() {
  button.onclick = () => {
    map.once('click', (e) => {
      if (index === 0) {
        startPoint = e.latlng;
        if (window.userMarker) {
          map.removeLayer(window.userMarker);
        }
        window.userMarker = L.marker(startPoint, {
          icon: iconoUbicacionAzul,
          draggable: true,
          zIndexOffset: 1000
        }).addTo(map);
        window.userMarker.on('dragend', () => {
          startPoint = window.userMarker.getLatLng();
          updateRoute(false);
        });
        updateRoute(false);
      } else {
        if (edificioSeleccionado) {
          endPoint = (typeof window.obtenerPuntoEdificio === 'function')
            ? window.obtenerPuntoEdificio(edificioSeleccionado)
            : (edificioSeleccionado.labelCoords || edificioSeleccionado.coords[0]);
          if (!endPoint) return;
          if (window.endMarker) {
            map.removeLayer(window.endMarker);
          }
          window.endMarker = L.marker(endPoint, {
            icon: iconoDestinoRojo,
            draggable: true
          }).addTo(map);
          window.endMarker.on('dragend', () => {
            endPoint = window.endMarker.getLatLng();
            updateRoute(false);
          });
          updateRoute(true);
        }
      }
    });
  };
}