let startPoint = null;
let endPoint = null;
let gpsErrorShown = false;

// Manejar errores de geolocalización

function manejarErrorGPS(error) {
    let mensaje = "";
    
    switch(error.code) {
        case error.PERMISSION_DENIED:
            mensaje = "Permiso de ubicacion denegado. Por favor, habilita el acceso a tu ubicacion en la configuracion del navegador.";
            break;
        case error.POSITION_UNAVAILABLE:
            mensaje = "No se pudo determinar tu ubicacion. Verifica tu conexion GPS o red.";
            break;
        case error.TIMEOUT:
            mensaje = "La solicitud de ubicacion tardo demasiado. Intenta de nuevo.";
            break;
        default:
            mensaje = "Error desconocido al obtener tu ubicacion.";
    }
    
    console.error("Error GPS:", error.message, error);
    
    if (!gpsErrorShown) {
        alert(mensaje);
        gpsErrorShown = true;
    }
}

// Manejar errores en la obtención de la ruta

try {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function (position) {
                try {
                    const latitude = position.coords.latitude;
                    const longitude = position.coords.longitude;
                    const accuracy = position.coords.accuracy;

                    console.log(`Ubicacion obtenida - Lat: ${latitude}, Lon: ${longitude}, Accuracy: ${accuracy} meters`);

                    // Usar la ubicación del usuario como el punto de inicio
                    startPoint = [latitude, longitude];
                    L.marker(startPoint).addTo(map).bindPopup("Estás Aquí").openPopup();
                    updateRoute();
                    gpsErrorShown = false;
                } catch (err) {
                    console.error("Error al procesar ubicacion:", err);
                    alert("Error al procesar tu ubicacion. El mapa seguira funcionando.");
                }
            },
            manejarErrorGPS,
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    } else {
        console.warn("Geolocalizacion no soportada");
        alert("Tu navegador no soporta geolocalizacion. Puedes usar el mapa manualmente.");
    }
} catch (error) {
    console.error("Error critico en geolocalizacion:", error);
    // El mapa sigue funcionando sin GPS
}

// Función para obtener la ubicación del usuario
function obtenerUbicacionUsuario() {
    try {
        if (!navigator.geolocation) {
            alert("Tu navegador no soporta geolocalizacion.");
            return;
        }
        
        // Mostrar feedback al usuario
        console.log("Obteniendo tu ubicacion...");
        
        navigator.geolocation.getCurrentPosition(
            function (position) {
                try {
                    const latitude = position.coords.latitude;
                    const longitude = position.coords.longitude;
                    const accuracy = position.coords.accuracy;

                    console.log(`Ubicacion actualizada - Lat: ${latitude}, Lon: ${longitude}, Accuracy: ${accuracy} meters`);

                    startPoint = [latitude, longitude];
                    
                    // Remueve el marcador anterior si existe
                    if (window.userMarker) {
                        map.removeLayer(window.userMarker);
                    }
                    
                    window.userMarker = L.marker(startPoint).addTo(map)
                        .bindPopup("Estás Aquí")
                        .openPopup();
                    
                    map.setView(startPoint, 18);
                    updateRoute();
                    gpsErrorShown = false;
                } catch (err) {
                    console.error("Error al procesar ubicacion:", err);
                    alert("Error al procesar tu ubicacion.");
                }
            },
            manejarErrorGPS,
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    } catch (error) {
        console.error("Error critico al obtener ubicacion:", error);
        alert("No se pudo acceder a tu ubicacion.");
    }
}

try {
    const btnGPS = document.getElementById('btn_gps');
    if (btnGPS) {
        btnGPS.addEventListener('click', function () {
            obtenerUbicacionUsuario();
        });
    } else {
        console.warn("Boton GPS no encontrado en el DOM");
    }
} catch (error) {
    console.error("Error al configurar boton GPS:", error);
}



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
    createMarker: function() { return null; }
}).addTo(map);

function updateRoute() {
    if (startPoint && endPoint) {
        routingControl.setWaypoints([
            L.latLng(startPoint),
            L.latLng(endPoint)
        ]);
    }
}

function addCustomButtons() {
    button.onclick = () => {
        map.once('click', (e) => {
            if (index === 0) {
                startPoint = e.latlng;
                const startMarker = L.marker(startPoint, { draggable: true }).addTo(map);
                startMarker.on('dragend', () => {
                    startPoint = startMarker.getLatLng();
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
