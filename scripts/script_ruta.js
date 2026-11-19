let startPoint = null;
let endPoint = null;
window.userMarker = null;
window.endMarker = null;
window.destinoNombreActual = null;

// Inyectar styles/styles_rutas.css automáticamente si aún no está en el <head>
(function asegurarEstilosRuta() {
  if (document.getElementById('fiad-styles-ruta') || document.querySelector('link[href*="styles_rutas.css"]')) return;
  const basePath = window.location.pathname.replace(/\/[^\/]*$/, '');
  const link = document.createElement('link');
  link.id = 'fiad-styles-ruta';
  link.rel = 'stylesheet';
  link.href = window.location.origin + basePath + '/styles/styles_rutas.css';
  document.head.appendChild(link);
})();

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

// Azul: Ubicación del usuario | Rojo: Destino de ruta
const iconoUbicacionAzul = crearPinSVG('#2563eb', '#1d4ed8', 'marcador-ubicacion');
const iconoDestinoRojo = crearPinSVG('#dc2626', '#991b1b', 'marcador-destino');

window.iconoUbicacionAzul = iconoUbicacionAzul;
window.iconoDestinoRojo = iconoDestinoRojo;

// URL dinámica del proxy Mapbox
var _basePath = window.location.pathname.replace(/\/[^\/]*$/, '');
var _proxyUrl = window.location.origin + _basePath + '/api/mapbox_proxy.php';

const _mapboxWalkingFallback = L.Routing.mapboxPHP({
  backendUrl: _proxyUrl,
  language: 'es',
  profile: 'mapbox/walking'
});

const _mapboxDrivingRouter = L.Routing.mapboxPHP({
  backendUrl: _proxyUrl,
  language: 'es',
  profile: 'mapbox/driving'
});

const routingControl = L.Routing.control({
  waypoints: [],
  routeWhileDragging: true,
  fitSelectedRoutes: false,
  lineOptions: {
    addWaypoints: false,
    styles: [{ opacity: 0, weight: 0 }] // El trazado visual lo maneja capaRutasMapa
  },
  router: typeof L.Routing.grafoAccesible === 'function'
    ? L.Routing.grafoAccesible({
        fallbackRouter: _mapboxWalkingFallback,
        drivingRouter: _mapboxDrivingRouter
      })
    : _mapboxWalkingFallback,
  show: false,
  createMarker: function () { return null; }
}).addTo(map);

// Capa propia para dibujar ruta activa, tramos híbridos y alternativas clicables
const capaRutasMapa = L.layerGroup().addTo(map);
let rutasDisponibles = [];
let indiceRutaActiva = 0;
let ultimoDestinoEncuadrado = null;
let encuadrarSiguienteRuta = false;
let tarjetaMinimizadaMovil = false;
let ultimoRecalculoGPS = 0;

function formatearDuracion(segundos) {
  const seg = Math.max(0, Math.round(Number(segundos) || 0));
  if (seg < 60) return '1 min';
  const minsTotal = Math.round(seg / 60);
  if (minsTotal < 60) return minsTotal + ' min';
  const horas = Math.floor(minsTotal / 60);
  const mins = minsTotal % 60;
  return mins > 0 ? (horas + ' h ' + mins + ' min') : (horas + ' h');
}

function formatearDistancia(metros) {
  const m = Math.max(0, Math.round(Number(metros) || 0));
  if (m < 1000) return m + ' m';
  return (m / 1000).toFixed(1) + ' km';
}

function formatearHoraLlegada(segundos) {
  const llegada = new Date(Date.now() + Math.max(0, Number(segundos) || 0) * 1000);
  return llegada.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function escaparTexto(str) {
  const div = document.createElement('div');
  div.textContent = String(str || '');
  return div.innerHTML;
}

function obtenerNombreDestinoActual() {
  if (window.destinoNombreActual) return window.destinoNombreActual;
  if (window.edificioActual && (window.edificioActual.nombre || window.edificioActual.codigo)) {
    return window.edificioActual.nombre || window.edificioActual.codigo;
  }
  return 'Destino seleccionado';
}

function asegurarTarjetaRutaDOM() {
  let card = document.getElementById('panel-ruta-activa');
  if (card) return card;

  card = document.createElement('aside');
  card.id = 'panel-ruta-activa';
  card.className = 'fiad-ruta-card';
  card.setAttribute('aria-live', 'polite');
  document.body.appendChild(card);
  return card;
}

function ocultarTarjetaRuta() {
  const card = document.getElementById('panel-ruta-activa');
  if (card) {
    card.classList.remove('is-visible', 'is-minimized');
  }
  tarjetaMinimizadaMovil = false;
}

function dibujarRutasEnMapa() {
  capaRutasMapa.clearLayers();
  if (!Array.isArray(rutasDisponibles) || rutasDisponibles.length === 0) return;

  // 1. Dibujar primero las rutas alternativas (debajo de la activa)
  rutasDisponibles.forEach(function (ruta, idx) {
    if (idx === indiceRutaActiva) return;
    if (!Array.isArray(ruta.coordinates) || ruta.coordinates.length < 2) return;

    const polyAlt = L.polyline(ruta.coordinates, {
      color: '#64748b',
      weight: 5,
      opacity: 0.72,
      dashArray: '7, 7'
    }).addTo(capaRutasMapa);

    polyAlt.bindTooltip(
      (ruta.etiqueta || 'Alternativa') + ': ' +
      formatearDuracion(ruta.summary.totalTime) + ' (' + formatearDistancia(ruta.summary.totalDistance) + ')',
      { sticky: true }
    );

    polyAlt.on('click', function (e) {
      L.DomEvent.stopPropagation(e);
      seleccionarRutaAlternativa(idx);
    });
  });

  // 2. Dibujar la ruta seleccionada encima
  const activa = rutasDisponibles[indiceRutaActiva];
  if (!activa || !Array.isArray(activa.coordinates) || activa.coordinates.length < 2) return;

  if (activa.esHibrida && activa.tramoVehiculo && activa.tramoPeatonal) {
    // Tramo 1: Vehículo hasta el acceso del campus (Azul)
    if (Array.isArray(activa.tramoVehiculo.coordinates) && activa.tramoVehiculo.coordinates.length >= 2) {
      L.polyline(activa.tramoVehiculo.coordinates, {
        color: '#2563eb',
        weight: 6,
        opacity: 0.92
      }).addTo(capaRutasMapa);
    }

    // Tramo 2: Caminata dentro del campus (Verde)
    if (Array.isArray(activa.tramoPeatonal.coordinates) && activa.tramoPeatonal.coordinates.length >= 2) {
      L.polyline(activa.tramoPeatonal.coordinates, {
        color: '#16a34a',
        weight: 6,
        opacity: 0.95
      }).addTo(capaRutasMapa);
    }

    // Marcador de transición Vehículo -> Pie
    if (activa.puntoTransicion) {
      L.marker(activa.puntoTransicion, {
        icon: L.divIcon({
          className: 'fiad-pin-transicion',
          html: '🅿️',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        }),
        zIndexOffset: 950
      })
        .addTo(capaRutasMapa)
        .bindPopup('<strong>Acceso al campus</strong><br>Estaciona o desciende aquí y continúa a pie.', { autoPan: false });
    }
  } else {
    const colorLinea = (window.GrafoCampus && window.GrafoCampus.soloAccesible) ? '#059669' : '#2da832';
    L.polyline(activa.coordinates, {
      color: colorLinea,
      weight: 6,
      opacity: 0.95
    }).addTo(capaRutasMapa);
  }
}

function renderizarTarjetaRuta() {
  const card = asegurarTarjetaRutaDOM();

  if (!endPoint) {
    ocultarTarjetaRuta();
    return;
  }

  const nombreDestino = escaparTexto(obtenerNombreDestinoActual());
  const soloAccesible = Boolean(window.GrafoCampus && window.GrafoCampus.soloAccesible);

  // Estado 1: Destino elegido, esperando ubicación GPS
  if (!startPoint) {
    card.innerHTML =
      '<div class="fiad-ruta-header">' +
        '<div class="fiad-ruta-header-main">' +
          '<span class="fiad-ruta-modo-badge">🧭 Ruta</span>' +
          '<div class="fiad-ruta-destino" title="' + nombreDestino + '">' + nombreDestino + '</div>' +
        '</div>' +
        '<div class="fiad-ruta-header-btns">' +
          '<button type="button" class="fiad-ruta-icon-btn is-cancel" id="btn-ruta-cancelar" aria-label="Cancelar ruta" title="Cancelar ruta">&times;</button>' +
        '</div>' +
      '</div>' +
      '<div class="fiad-ruta-gps-row">' +
        '<span class="fiad-ruta-gps-hint">Activa tu GPS para calcular el recorrido.</span>' +
        '<button type="button" class="fiad-ruta-btn-ubicacion" id="btn-ruta-activar-gps">📍 Ubicar</button>' +
      '</div>';

    card.classList.add('is-visible');
    vincularEventosTarjetaRuta();
    return;
  }

  // Estado 2: Calculando ruta
  if (!Array.isArray(rutasDisponibles) || rutasDisponibles.length === 0) {
    card.innerHTML =
      '<div class="fiad-ruta-header">' +
        '<div class="fiad-ruta-header-main">' +
          '<span class="fiad-ruta-modo-badge">⏳ Calculando</span>' +
          '<div class="fiad-ruta-destino" title="' + nombreDestino + '">' + nombreDestino + '</div>' +
        '</div>' +
        '<div class="fiad-ruta-header-btns">' +
          '<button type="button" class="fiad-ruta-icon-btn is-cancel" id="btn-ruta-cancelar" aria-label="Cancelar ruta" title="Cancelar ruta">&times;</button>' +
        '</div>' +
      '</div>';

    card.classList.add('is-visible');
    vincularEventosTarjetaRuta();
    return;
  }

  // Estado 3: Ruta(s) calculada(s) — diseño ultra-conciso
  const activa = rutasDisponibles[indiceRutaActiva] || rutasDisponibles[0];
  const esHibrida = Boolean(activa.esHibrida);
  const duracionTxt = formatearDuracion(activa.summary.totalTime);
  const distanciaTxt = formatearDistancia(activa.summary.totalDistance);

  let badgeClase = 'fiad-ruta-modo-badge';
  let badgeTexto = tarjetaMinimizadaMovil ? ('🚶 ' + duracionTxt) : '🚶 A pie';
  if (esHibrida) {
    badgeClase += ' is-hybrid';
    badgeTexto = tarjetaMinimizadaMovil
      ? ('🚗 ' + duracionTxt)
      : (soloAccesible ? '🚗 + ♿ Híbrido' : '🚗 + 🚶 Híbrido');
  } else if (soloAccesible) {
    badgeClase += ' is-accessible';
    badgeTexto = tarjetaMinimizadaMovil ? ('♿ ' + duracionTxt) : '♿ Accesible';
  }

  let desgloseHtml = '';
  if (esHibrida && activa.tramoVehiculo && activa.tramoPeatonal) {
    desgloseHtml =
      '<div class="fiad-ruta-desglose">' +
        '<span class="fiad-ruta-tramo-auto">🚗 ' + formatearDuracion(activa.tramoVehiculo.duration) + ' (' + formatearDistancia(activa.tramoVehiculo.distance) + ')</span>' +
        '<span>→</span>' +
        '<span class="fiad-ruta-tramo-pie">' + (soloAccesible ? '♿ ' : '🚶 ') + formatearDuracion(activa.tramoPeatonal.duration) + ' (' + formatearDistancia(activa.tramoPeatonal.distance) + ')</span>' +
      '</div>';
  }

  let avisoHtml = '';
  if (soloAccesible) {
    if (activa.usaEscaleras) {
      avisoHtml = '<div class="fiad-ruta-aviso">⚠️ Incluye escaleras (sin rampa alternativa).</div>';
    } else if (activa.usaBanquetaSinRampa) {
      avisoHtml = '<div class="fiad-ruta-aviso">⚠️ Sin escaleras; cruce sin rampa marcada.</div>';
    } else {
      avisoHtml = '<div class="fiad-ruta-aviso is-ok">♿ Ruta por rampas y andadores.</div>';
    }
  }

  let alternativasHtml = '';
  if (rutasDisponibles.length > 1) {
    const botonesAlt = rutasDisponibles.map(function (r, idx) {
      const sel = idx === indiceRutaActiva ? ' is-selected' : '';
      const etiqueta = escaparTexto(r.etiqueta || (idx === 0 ? 'Principal' : ('Alt. ' + idx)));
      return (
        '<button type="button" class="fiad-ruta-alt-btn' + sel + '" data-ruta-idx="' + idx + '">' +
          '<span class="fiad-ruta-alt-tag">' + etiqueta + '</span>' +
          '<span class="fiad-ruta-alt-meta">' + formatearDuracion(r.summary.totalTime) + ' · ' + formatearDistancia(r.summary.totalDistance) + '</span>' +
        '</button>'
      );
    }).join('');

    alternativasHtml = '<div class="fiad-ruta-alternativas">' + botonesAlt + '</div>';
  }

  card.innerHTML =
    '<div class="fiad-ruta-header">' +
      '<div class="fiad-ruta-header-main">' +
        '<span class="' + badgeClase + '">' + badgeTexto + '</span>' +
        '<div class="fiad-ruta-destino" title="' + nombreDestino + '">' + nombreDestino + '</div>' +
      '</div>' +
      '<div class="fiad-ruta-header-btns">' +
        '<button type="button" class="fiad-ruta-icon-btn fiad-ruta-toggle-btn" id="btn-ruta-toggle-size" aria-label="Minimizar o expandir resumen" title="Minimizar/Expandir">' +
          (tarjetaMinimizadaMovil ? '▴' : '▾') +
        '</button>' +
        '<button type="button" class="fiad-ruta-icon-btn is-cancel" id="btn-ruta-cancelar" aria-label="Cancelar ruta" title="Cancelar ruta">&times;</button>' +
      '</div>' +
    '</div>' +
    '<div class="fiad-ruta-metricas">' +
      '<div class="fiad-ruta-tiempo' + (esHibrida ? ' is-hybrid' : '') + '">' + duracionTxt + '</div>' +
      '<div class="fiad-ruta-submetricas">' +
        '<span>' + distanciaTxt + '</span>' +
        '<span>·</span>' +
        '<span>~' + formatearHoraLlegada(activa.summary.totalTime) + '</span>' +
      '</div>' +
    '</div>' +
    desgloseHtml +
    avisoHtml +
    alternativasHtml;

  card.classList.add('is-visible');
  if (tarjetaMinimizadaMovil) card.classList.add('is-minimized');
  else card.classList.remove('is-minimized');

  vincularEventosTarjetaRuta();
}

function vincularEventosTarjetaRuta() {
  const btnCancelar = document.getElementById('btn-ruta-cancelar');
  if (btnCancelar) {
    btnCancelar.onclick = function () {
      window.cancelarRuta();
    };
  }

  const btnActivarGps = document.getElementById('btn-ruta-activar-gps');
  if (btnActivarGps) {
    btnActivarGps.onclick = function () {
      const btnLoc = document.getElementById('btn-toggle-ubicacion') ||
                     document.getElementById('btn-ubicacion') ||
                     document.getElementById('location-btn') ||
                     document.querySelector('[data-action="ubicacion"]');
      if (btnLoc) {
        btnLoc.click();
      } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (pos) {
          window.dispatchEvent(new CustomEvent('ubicacionActualizada', {
            detail: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              esPrimerCentrado: true
            }
          }));
        });
      }
    };
  }

  const btnToggleSize = document.getElementById('btn-ruta-toggle-size');
  if (btnToggleSize) {
    btnToggleSize.onclick = function () {
      tarjetaMinimizadaMovil = !tarjetaMinimizadaMovil;
      renderizarTarjetaRuta();
    };
  }

  document.querySelectorAll('.fiad-ruta-alt-btn').forEach(function (btn) {
    btn.onclick = function () {
      const idx = Number(btn.getAttribute('data-ruta-idx'));
      if (!isNaN(idx)) {
        seleccionarRutaAlternativa(idx);
      }
    };
  });
}

function seleccionarRutaAlternativa(idx) {
  if (idx < 0 || idx >= rutasDisponibles.length) return;
  indiceRutaActiva = idx;
  dibujarRutasEnMapa();
  renderizarTarjetaRuta();
}

routingControl.on('routesfound', function (e) {
  rutasDisponibles = Array.isArray(e.routes) ? e.routes : [];
  ultimoRecalculoGPS = Date.now();
  if (indiceRutaActiva >= rutasDisponibles.length) {
    indiceRutaActiva = 0;
  }

  dibujarRutasEnMapa();
  renderizarTarjetaRuta();

  if (!encuadrarSiguienteRuta) return;
  encuadrarSiguienteRuta = false;

  const route = rutasDisponibles[indiceRutaActiva];
  if (route && route.coordinates && route.coordinates.length > 0) {
    const bounds = L.latLngBounds(route.coordinates);
    map.fitBounds(bounds, { padding: [70, 70], maxZoom: 18 });
  }
});

routingControl.on('routingerror', function () {
  rutasDisponibles = [];
  capaRutasMapa.clearLayers();
  renderizarTarjetaRuta();
});

function updateRoute(permitirEncuadre) {
  if (startPoint && endPoint) {
    const startLL = L.latLng(startPoint);
    const destLL = L.latLng(endPoint);
    const destKey = destLL.lat.toFixed(6) + ',' + destLL.lng.toFixed(6);

    if (permitirEncuadre !== false && destKey !== ultimoDestinoEncuadrado) {
      ultimoDestinoEncuadrado = destKey;
      indiceRutaActiva = 0;
      encuadrarSiguienteRuta = true;
    } else {
      encuadrarSiguienteRuta = false;
    }

    renderizarTarjetaRuta();
    routingControl.setWaypoints([startLL, destLL]);
  } else {
    ultimoDestinoEncuadrado = null;
    encuadrarSiguienteRuta = false;
    rutasDisponibles = [];
    indiceRutaActiva = 0;
    capaRutasMapa.clearLayers();
    routingControl.setWaypoints([]);

    if (endPoint) {
      renderizarTarjetaRuta();
    } else {
      ocultarTarjetaRuta();
    }
  }
}

// API pública para iniciar ruta desde "Cómo llegar"
window.iniciarRutaHacia = function (coordenadasDestino, nombreDestino) {
  if (!coordenadasDestino) return;
  endPoint = coordenadasDestino;
  if (nombreDestino) {
    window.destinoNombreActual = nombreDestino;
  }

  if (window.endMarker) {
    map.removeLayer(window.endMarker);
  }

  window.endMarker = L.marker(endPoint, {
    icon: iconoDestinoRojo,
    draggable: true
  }).addTo(map);

  window.endMarker.on('dragend', function () {
    endPoint = window.endMarker.getLatLng();
    window.destinoNombreActual = 'Ubicación ajustada en mapa';
    updateRoute(false);
  });

  if (typeof window.limpiarMarcadoresEspacios === 'function') {
    window.limpiarMarcadoresEspacios();
  }

  tarjetaMinimizadaMovil = false;
  updateRoute(true);
};

// API pública para cancelar la ruta activa
window.cancelarRuta = function () {
  endPoint = null;
  window.destinoNombreActual = null;
  ultimoDestinoEncuadrado = null;
  encuadrarSiguienteRuta = false;
  rutasDisponibles = [];
  indiceRutaActiva = 0;
  ultimoRecalculoGPS = 0;

  if (window.endMarker) {
    map.removeLayer(window.endMarker);
    window.endMarker = null;
  }

  capaRutasMapa.clearLayers();
  routingControl.setWaypoints([]);
  ocultarTarjetaRuta();
};

// Alternar modo accesible
window.setModoAccesible = function (activar) {
  if (window.GrafoCampus) {
    window.GrafoCampus.soloAccesible = Boolean(activar);
  }
  updateRoute(false);
};

// =========================================================================
// Seguimiento en tiempo real (recorte de progreso y recálculo por desvío)
// =========================================================================
function proyectarEnPolilineaLatLng(puntoLL, coords) {
  let minDist = Infinity;
  let mejorIdx = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const dx = b.lng - a.lng;
    const dy = b.lat - a.lat;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((puntoLL.lng - a.lng) * dx + (puntoLL.lat - a.lat) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const proy = L.latLng(a.lat + t * dy, a.lng + t * dx);
    const d = map.distance(puntoLL, proy);
    if (d < minDist) {
      minDist = d;
      mejorIdx = i;
    }
  }

  return { dist: minDist, index: mejorIdx };
}

function calcularLongitudLatLngs(coords) {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += map.distance(coords[i], coords[i + 1]);
  }
  return total;
}

function actualizarProgresoORecalcular(lat, lng) {
  if (!endPoint) return;

  const activa = rutasDisponibles[indiceRutaActiva];
  if (!activa || !Array.isArray(activa.coordinates) || activa.coordinates.length < 2) {
    ultimoRecalculoGPS = Date.now();
    updateRoute(false);
    return;
  }

  const posLL = L.latLng(lat, lng);
  const ahora = Date.now();

  // En ruta híbrida: si ya llegó al punto de descenso, recalcular para cambiar a modo peatonal
  if (activa.esHibrida && activa.puntoTransicion && map.distance(posLL, activa.puntoTransicion) <= 25) {
    ultimoRecalculoGPS = ahora;
    updateRoute(false);
    return;
  }

  const coordsTramo = (activa.esHibrida && activa.tramoVehiculo && Array.isArray(activa.tramoVehiculo.coordinates))
    ? activa.tramoVehiculo.coordinates
    : activa.coordinates;

  const proy = proyectarEnPolilineaLatLng(posLL, coordsTramo);
  const umbralDesvio = activa.esHibrida ? 35 : 18;
  const intervaloMax = activa.esHibrida ? 45000 : 25000;

  // Recalcular ruta completa solo si se desvió o pasó el intervalo de refresco
  if (proy.dist > umbralDesvio || (ahora - ultimoRecalculoGPS) > intervaloMax) {
    ultimoRecalculoGPS = ahora;
    updateRoute(false);
    return;
  }

  // Sigue dentro de la ruta: recortar tramo ya recorrido y actualizar métricas localmente
  const nuevasCoords = [posLL].concat(coordsTramo.slice(proy.index + 1));
  const distRestante = calcularLongitudLatLngs(nuevasCoords);

  if (activa.esHibrida && activa.tramoVehiculo && activa.tramoPeatonal) {
    if (typeof activa.tramoVehiculo._distOrig !== 'number') {
      activa.tramoVehiculo._distOrig = activa.tramoVehiculo.distance;
      activa.tramoVehiculo._timeOrig = activa.tramoVehiculo.duration;
    }
    const ratio = activa.tramoVehiculo._distOrig > 0
      ? Math.min(1, distRestante / activa.tramoVehiculo._distOrig)
      : 0;

    activa.tramoVehiculo.coordinates = nuevasCoords;
    activa.tramoVehiculo.distance = distRestante;
    activa.tramoVehiculo.duration = activa.tramoVehiculo._timeOrig * ratio;
    activa.coordinates = nuevasCoords.concat(activa.tramoPeatonal.coordinates.slice(1));
    activa.summary.totalDistance = distRestante + activa.tramoPeatonal.distance;
    activa.summary.totalTime = activa.tramoVehiculo.duration + activa.tramoPeatonal.duration;
  } else {
    if (typeof activa._distOrig !== 'number') {
      activa._distOrig = activa.summary.totalDistance;
      activa._timeOrig = activa.summary.totalTime;
    }
    const ratio = activa._distOrig > 0
      ? Math.min(1, distRestante / activa._distOrig)
      : 0;

    activa.coordinates = nuevasCoords;
    activa.summary.totalDistance = distRestante;
    activa.summary.totalTime = activa._timeOrig * ratio;
  }

  dibujarRutasEnMapa();
  renderizarTarjetaRuta();
}

// Escuchar actualizaciones del GPS
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

  const debeCentrar = (typeof esPrimerCentrado === 'boolean')
    ? esPrimerCentrado
    : esNuevoMarcador;

  if (debeCentrar) {
    map.setView(startPoint, 18, { animate: true });
  }

  actualizarProgresoORecalcular(lat, lng);
});

// Escuchar cuando el usuario desactiva su ubicación
window.addEventListener('ubicacionDesactivada', () => {
  if (window.userMarker) {
    map.removeLayer(window.userMarker);
    window.userMarker = null;
  }
  startPoint = null;
  updateRoute(false);
});