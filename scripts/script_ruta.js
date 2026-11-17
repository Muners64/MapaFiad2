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

const routingControl = L.Routing.control({
  waypoints: [],
  routeWhileDragging: true,
  router: L.Routing.mapboxPHP({
    backendUrl: _proxyUrl,
    language: 'es',
    profile: 'mapbox/walking'
  }),
  show: false,
  createMarker: function () { return null; }
}).addTo(map);

function updateRoute() {
  if (startPoint && endPoint) {
    routingControl.setWaypoints([
      L.latLng(startPoint),
      L.latLng(endPoint)
    ]);
  } else {
    // Limpia la ruta trazada si se desactiva el punto de inicio
    routingControl.setWaypoints([]);
  }
}

// Escuchar cuando el usuario ACTIVA o actualiza su ubicación
window.addEventListener('ubicacionActualizada', (e) => {
  const { lat, lng } = e.detail;
  const esPrimeraVez = !window.userMarker;
  startPoint = [lat, lng];

  if (esPrimeraVez) {
    window.userMarker = L.marker(startPoint, { icon: iconoUbicacionAzul, zIndexOffset: 1000 })
      .addTo(map)
      .bindPopup('Estás Aquí')
      .openPopup();
    map.setView(startPoint, 18);
  } else {
    window.userMarker.setLatLng(startPoint);
  }

  updateRoute();
});

// Escuchar cuando el usuario DESACTIVA su ubicación en cualquier momento
window.addEventListener('ubicacionDesactivada', () => {
  if (window.userMarker) {
    map.removeLayer(window.userMarker);
    window.userMarker = null;
  }
  startPoint = null;
  updateRoute();
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
          updateRoute();
        });
        updateRoute();
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
            updateRoute();
          });
          updateRoute();
        }
      }
    });
  };
}