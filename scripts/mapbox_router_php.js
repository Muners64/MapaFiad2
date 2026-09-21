// Router personalizado para usar el backend PHP
L.Routing.MapboxPHP = L.Class.extend({
    initialize: function(options) {
        this.options = options || {};
        // Construir URL base dinámica según donde esté corriendo el proyecto
        var basePath = window.location.pathname.replace(/\/[^\/]*$/, ''); 
        var defaultUrl = window.location.origin + basePath + '/api/mapbox_proxy.php';
        this.backendUrl = this.options.backendUrl || defaultUrl;
    },

    route: function(waypoints, callback, context, options) {
        try {
            // Validar waypoints
            if (!waypoints || waypoints.length < 2) {
                console.error("Se requieren al menos 2 puntos para calcular ruta");
                return callback.call(context, {
                    status: -1,
                    message: 'Se requieren al menos 2 puntos para trazar una ruta'
                });
            }

            // Convertir waypoints a formato leible por mapbox: lng,lat;lng,lat
            const coordinates = waypoints.map(wp => {
                if (!wp.latLng || isNaN(wp.latLng.lng) || isNaN(wp.latLng.lat)) {
                    throw new Error('Coordenadas inválidas en waypoint');
                }
                return `${wp.latLng.lng},${wp.latLng.lat}`;
            }).join(';');

            
            const profile = this.options.profile || 'mapbox/walking';
            const language = this.options.language || 'es';
            const url = `${this.backendUrl}?coordinates=${coordinates}&profile=${profile}&language=${language}`;

            console.log("Calculando ruta...");

            // Hacer la peticion al backend con timeout para evitar bloqueos, de 30s
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            fetch(url, { signal: controller.signal })
                .then(response => {
                    clearTimeout(timeoutId);
                    
                    if (!response.ok) {
                        throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
                    }
                    return response.json();
                })
                .then(data => {
                    // Aqui se valida la respuesta de la api
                    if (data.error) {
                        throw new Error(data.error);
                    }
                    
                    if (!data.routes || data.routes.length === 0) {
                        console.warn("No se encontraron rutas disponibles");
                        return callback.call(context, {
                            status: 0,
                            message: 'No se encontraron rutas entre estos puntos'
                        });
                    }

                    // Aqui se convierte la respuesta de mapbox a formato para leaflet routing machine
                    const route = data.routes[0];
                    
                    if (!route.geometry || !route.geometry.coordinates) {
                        throw new Error('Respuesta de ruta inválida');
                    }
                    
                    const coordinates = route.geometry.coordinates;
                    
            
                    const latLngs = coordinates.map(coord => {
                        if (!coord || coord.length < 2) {
                            throw new Error('Coordenada inválida en ruta');
                        }
                        return L.latLng(coord[1], coord[0]);
                    });

                    // aqui se crea el objeto de ruta compatible con leaflet routing machine
                    const routeResult = [{
                        name: (route.legs && route.legs[0] && route.legs[0].summary) || 'Ruta',
                        coordinates: latLngs,
                        instructions: this._convertInstructions(route.legs ? route.legs[0].steps : null),
                        summary: {
                            totalDistance: route.distance || 0,
                            totalTime: route.duration || 0
                        },
                        inputWaypoints: waypoints,
                        waypoints: waypoints.map((wp, i) => {
                            return {
                                latLng: wp.latLng,
                                name: wp.name || `Punto ${i + 1}`
                            };
                        })
                    }];

                    console.log(`Ruta calculada: ${(route.distance / 1000).toFixed(2)} km, ${Math.round(route.duration / 60)} min`);
                    callback.call(context, null, routeResult);
                })
                .catch(error => {
                    clearTimeout(timeoutId);
                    
                    let mensajeError = "Error al calcular la ruta";
                    
                    if (error.name === 'AbortError') {
                        mensajeError = "La solicitud tardo demasiado. Intenta de nuevo.";
                        console.error("Timeout en peticion de ruta");
                    } else if (error.message.includes('Failed to fetch')) {
                        mensajeError = "No se pudo conectar con el servidor. Verifica tu conexion.";
                        console.error("Error de red:", error);
                    } else {
                        mensajeError = `Error: ${error.message}`;
                        console.error("Error al obtener ruta:", error);
                    }
                    
                    alert(mensajeError);
                    
                    callback.call(context, {
                        status: -1,
                        message: mensajeError
                    });
                });
        } catch (error) {
            console.error("Error critico en routing:", error);
            callback.call(context, {
                status: -1,
                message: 'Error critico: ' + error.message
            });
        }
    },

    _convertInstructions: function(steps) {
        if (!steps || !Array.isArray(steps)) {
            console.warn("No hay instrucciones de ruta disponibles");
            return [];
        }
        
        try {
            return steps.map((step, index) => {
                if (!step || !step.maneuver) {
                    console.warn("Paso de ruta invalido:", step);
                    return null;
                }
                
                return {
                    type: step.maneuver.type || 'turn',
                    distance: step.distance || 0,
                    time: step.duration || 0,
                    road: step.name || '',
                    direction: step.maneuver.modifier || '',
                    text: step.maneuver.instruction || step.name || 'Continuar',
                    index: index
                };
            }).filter(instruction => instruction !== null);
        } catch (error) {
            console.error("Error al convertir instrucciones:", error);
            return [];
        }
    }
});

// Factory function para crear el router
L.Routing.mapboxPHP = function(options) {
    return new L.Routing.MapboxPHP(options);
};
