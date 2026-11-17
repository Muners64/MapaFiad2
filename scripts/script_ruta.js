let startPoint = null;
let endPoint = null;
window.userMarker = null;

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

// Escuchar cuando el usuario ACTIVA su ubicación manualmente
window.addEventListener('ubicacionActualizada', (e) => {
  const { lat, lng } = e.detail;
  startPoint = [lat, lng];

  if (window.userMarker) {
    map.removeLayer(window.userMarker);
  }

  window.userMarker = L.marker(startPoint)
    .addTo(map)
    .bindPopup('Estás Aquí')
    .openPopup();

  map.setView(startPoint, 18);
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
        window.userMarker = L.marker(startPoint, { draggable: true }).addTo(map);
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
          endMarker = L.marker(endPoint, { draggable: true }).addTo(map);
          endMarker.on('dragend', () => {
            endPoint = endMarker.getLatLng();
            updateRoute();
          });
          updateRoute();
        }
      }
    });
  };
}