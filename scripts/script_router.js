/**
 * Motor de enrutamiento peatonal y accesible (OSM + Ediciones MySQL)
 *
 * Reglas topológicas:
 * 1. Sobre un MISMO TRAMO (arista superpuesta):
 *    Cortado (5) > Rampa (4) > Escalera (3) > Normal usuario (2) > Base OSM (1)
 * 2. Accesibilidad realista:
 *    - Prioriza rampas (0.70) y caminos planos (1.0).
 *    - Penaliza fuertemente escaleras (28.0 + 120 m) y escalones (+90 m) para evitarlos
 *      siempre que exista alternativa, pero permite llegar si el destino solo tiene escaleras.
 * 3. En un VÉRTICE (nodo donde convergen múltiples tramos):
 *    Las ramas incidentes coexisten sin anularse entre sí.
 */
(function () {
  var _basePath = window.location.pathname.replace(/\/[^\/]*$/, '');
  var API_EDICIONES_URL = window.location.origin + _basePath + '/api/grafo_ediciones.php';
  var STORAGE_CACHE_KEY = 'fiad_osm_cache_v2';
  var CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

  var PRIORIDAD_TRAMO = {
    cortar: 5,
    rampa: 4,
    escalera: 3,
    normal: 2,
    osm_base: 1
  };

  var VIAS_CARRETERA = {
    primary: true, secondary: true, tertiary: true, trunk: true,
    primary_link: true, secondary_link: true, tertiary_link: true, trunk_link: true
  };

  var VIAS_CALLE_INTERNA = {
    service: true, residential: true, unclassified: true, track: true
  };

  function clasificarViaOSM(props) {
    var p = props || {};
    if (p.cerrado === true) return 'cortar';
    if (p.tipo === 'rampa' || p.ramp === 'yes') return 'rampa';
    if (p.tipo === 'escalera' || p.highway === 'steps' || p.accesible === false) return 'escalera';
    if (p.tipo === 'carretera' || VIAS_CARRETERA[p.highway]) return 'carretera';
    if (p.tipo === 'calle_interna' || VIAS_CALLE_INTERNA[p.highway]) return 'calle_interna';
    return 'normal';
  }

  // =========================================================================
  // Utilidades geométricas compartidas
  // =========================================================================
  function distanciaMetros(c1, c2) {
    var R = 6371000;
    var rad = Math.PI / 180;
    var dLat = (c2[1] - c1[1]) * rad;
    var dLon = (c2[0] - c1[0]) * rad;
    var lat1 = c1[1] * rad;
    var lat2 = c2[1] * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function proyeccionEnSegmento(p, a, b) {
    var dx = b[0] - a[0];
    var dy = b[1] - a[1];
    var lenSq = dx * dx + dy * dy;
    var t = lenSq === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    var coord = [a[0] + t * dx, a[1] + t * dy];
    return {
      coord: coord,
      dist: distanciaMetros(p, coord),
      t: t
    };
  }

  function distanciaAPolilinea(punto, coords) {
    var minDist = Infinity;
    var mejorCoord = null;
    var mejorIdx = 0;
    for (var i = 0; i < coords.length - 1; i++) {
      var res = proyeccionEnSegmento(punto, coords[i], coords[i + 1]);
      if (res.dist < minDist) {
        minDist = res.dist;
        mejorCoord = res.coord;
        mejorIdx = i;
      }
    }
    return { dist: minDist, coord: mejorCoord, index: mejorIdx };
  }

  function calcularCostoArista(tipo, distMetros, soloAccesible) {
    if (tipo === 'rampa') return distMetros * (soloAccesible ? 0.70 : 0.90);
    if (tipo === 'normal') return distMetros * 1.0;
    if (tipo === 'escalera') {
      return soloAccesible ? (distMetros * 28.0 + 120.0) : (distMetros * 1.15);
    }
    if (tipo === 'calle_interna') return distMetros * (soloAccesible ? 1.80 : 1.45);
    if (tipo === 'carretera') return distMetros * (soloAccesible ? 5.00 : 3.50);
    return distMetros * 1.0;
  }

  // =========================================================================
  // Caché local de red peatonal OSM
  // =========================================================================
  function cargarCacheLocalStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_CACHE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      var ahora = Date.now();
      return parsed.filter(function (z) {
        return z && z.geojson && (ahora - (z.ts || 0)) < CACHE_TTL_MS;
      });
    } catch (e) {
      return [];
    }
  }

  function guardarCacheLocalStorage() {
    try {
      var recortado = window.GrafoCampus.cacheZonas.slice(-3);
      localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(recortado));
    } catch (e) {
      console.warn('[GrafoCampus] No se pudo guardar caché OSM en localStorage:', e);
    }
  }

  // =========================================================================
  // Comunicación con Backend / MySQL (api/grafo_ediciones.php)
  // =========================================================================
  async function cargarEdicionesBD(forzar) {
    if (window.GrafoCampus.edicionesCargadas && !forzar) {
      return window.GrafoCampus.ediciones;
    }
    try {
      var res = await fetch(API_EDICIONES_URL);
      if (res.ok) {
        var data = await res.json();
        window.GrafoCampus.editEnabled = Boolean(data.edit_enabled);
        window.GrafoCampus.edificiosExistentes = Array.isArray(data.edificios_existentes) ? data.edificios_existentes : [];
        window.GrafoCampus.ediciones = {
          overrides: Array.isArray(data.overrides) ? {} : (data.overrides || {}),
          tramos_nuevos: data.tramos_nuevos || { type: 'FeatureCollection', features: [] },
          puntos_interes: Array.isArray(data.puntos_interes) ? data.puntos_interes : [],
          edificios_nuevos: Array.isArray(data.edificios_nuevos) ? data.edificios_nuevos : [],
          edificios_actualizados: {}
        };
        window.GrafoCampus.edicionesCargadas = true;

        document.dispatchEvent(new CustomEvent('grafo:edicionesCargadas', {
          detail: { editEnabled: window.GrafoCampus.editEnabled }
        }));
      }
    } catch (e) {
      console.warn('[GrafoCampus] No se pudieron cargar ediciones de grafo:', e);
    }
    return window.GrafoCampus.ediciones;
  }

  async function guardarEdicionesBD() {
    var payload = {
      overrides: window.GrafoCampus.ediciones.overrides || {},
      tramos_nuevos: window.GrafoCampus.ediciones.tramos_nuevos || { type: 'FeatureCollection', features: [] },
      puntos_interes: window.GrafoCampus.ediciones.puntos_interes || [],
      edificios_nuevos: window.GrafoCampus.ediciones.edificios_nuevos || [],
      edificios_actualizados: Object.values(window.GrafoCampus.ediciones.edificios_actualizados || {})
    };

    var res = await fetch(API_EDICIONES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  }

  async function obtenerRedOSM(south, west, north, east, ignorarCache) {
    if (!ignorarCache) {
      var enCache = window.GrafoCampus.cacheZonas.find(function (z) {
        return south >= z.south && west >= z.west && north <= z.north && east <= z.east;
      });
      if (enCache) return enCache.geojson;
    }

    var url = API_EDICIONES_URL +
      '?osm=1&s=' + south.toFixed(6) +
      '&w=' + west.toFixed(6) +
      '&n=' + north.toFixed(6) +
      '&e=' + east.toFixed(6) +
      (ignorarCache ? '&force=1' : '');

    var res = await fetch(url);
    if (!res.ok) {
      var errData = await res.json().catch(function () { return {}; });
      throw new Error(errData.mensaje || 'Error cargando red peatonal');
    }

    var geojson = await res.json();
    if (geojson && Array.isArray(geojson.features) && geojson.features.length > 0) {
      var pad = 0.0040;
      window.GrafoCampus.cacheZonas.push({
        south: south - pad,
        west: west - pad,
        north: north + pad,
        east: east + pad,
        ts: Date.now(),
        geojson: geojson
      });
      guardarCacheLocalStorage();
    }
    return geojson;
  }

  // =========================================================================
  // Estado y API pública compartida en window.GrafoCampus
  // =========================================================================
  window.GrafoCampus = Object.assign(window.GrafoCampus || {}, {
    soloAccesible: false,
    editEnabled: false,
    edificiosExistentes: [],
    ediciones: {
      overrides: {},
      tramos_nuevos: { type: 'FeatureCollection', features: [] },
      puntos_interes: [],
      edificios_nuevos: [],
      edificios_actualizados: {}
    },
    cacheZonas: cargarCacheLocalStorage(),
    edicionesCargadas: false,
    PRIORIDAD_TRAMO: PRIORIDAD_TRAMO,
    clasificarViaOSM: clasificarViaOSM,
    cargarEdicionesBD: cargarEdicionesBD,
    guardarEdicionesBD: guardarEdicionesBD,
    obtenerRedOSM: obtenerRedOSM,
    geom: {
      distanciaMetros: distanciaMetros,
      proyeccionEnSegmento: proyeccionEnSegmento,
      distanciaAPolilinea: distanciaAPolilinea
    }
  });

  // =========================================================================
  // Construcción rápida del Grafo Topológico y Dijkstra (Min-Heap)
  // =========================================================================
  function calcularCaminoEnGrafo(osmFeatures, customFeatures, overrides, origenLngLat, destinoLngLat, soloAccesible) {
    if (!Array.isArray(osmFeatures) || osmFeatures.length === 0) return null;

    var latRef = ((origenLngLat[1] + destinoLngLat[1]) * 0.5) * (Math.PI / 180);
    var M_POR_LAT = 110540;
    var M_POR_LNG = 111320 * Math.cos(latRef);

    function distRapida(c1, c2) {
      var dx = (c2[0] - c1[0]) * M_POR_LNG;
      var dy = (c2[1] - c1[1]) * M_POR_LAT;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function proyRapida(p, a, b) {
      var dx = b[0] - a[0];
      var dy = b[1] - a[1];
      var lenSq = dx * dx + dy * dy;
      var t = lenSq === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      var cx = a[0] + t * dx;
      var cy = a[1] + t * dy;
      var mdx = (p[0] - cx) * M_POR_LNG;
      var mdy = (p[1] - cy) * M_POR_LAT;
      return {
        coord: [cx, cy],
        dist: Math.sqrt(mdx * mdx + mdy * mdy),
        t: t
      };
    }

    function distPolilineaRapida(pt, coords) {
      var minD = Infinity;
      for (var i = 0; i < coords.length - 1; i++) {
        var d = proyRapida(pt, coords[i], coords[i + 1]).dist;
        if (d < minD) minD = d;
      }
      return minD;
    }

    var margenLng = 350 / M_POR_LNG;
    var margenLat = 350 / M_POR_LAT;
    var roiMinX = Math.min(origenLngLat[0], destinoLngLat[0]) - margenLng;
    var roiMaxX = Math.max(origenLngLat[0], destinoLngLat[0]) + margenLng;
    var roiMinY = Math.min(origenLngLat[1], destinoLngLat[1]) - margenLat;
    var roiMaxY = Math.max(origenLngLat[1], destinoLngLat[1]) + margenLat;

    var osmFiltradas = [];
    for (var fIdx = 0; fIdx < osmFeatures.length; fIdx++) {
      var feat = osmFeatures[fIdx];
      if (!feat || !feat.geometry || feat.geometry.type !== 'LineString') continue;
      var coords = feat.geometry.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;

      var fMinX = Infinity, fMaxX = -Infinity, fMinY = Infinity, fMaxY = -Infinity;
      for (var cIdx = 0; cIdx < coords.length; cIdx++) {
        var cx = coords[cIdx][0];
        var cy = coords[cIdx][1];
        if (cx < fMinX) fMinX = cx;
        if (cx > fMaxX) fMaxX = cx;
        if (cy < fMinY) fMinY = cy;
        if (cy > fMaxY) fMaxY = cy;
      }
      if (fMaxX >= roiMinX && fMinX <= roiMaxX && fMaxY >= roiMinY && fMinY <= roiMaxY) {
        osmFiltradas.push(feat);
      }
    }

    if (osmFiltradas.length === 0) {
      osmFiltradas = osmFeatures;
    }

    var nodos = new Map();
    var spatialGrid = new Map();
    var nextNodeId = 1;
    var nodosBloqueados = new Set();
    var penalizacionNodo = new Map();
    var aristasPorPar = new Map();

    function obtenerONodo(coord) {
      var gx = Math.floor(coord[0] * 100000);
      var gy = Math.floor(coord[1] * 100000);

      for (var dx = -1; dx <= 1; dx++) {
        for (var dy = -1; dy <= 1; dy++) {
          var cellKey = (gx + dx) + ',' + (gy + dy);
          var bucket = spatialGrid.get(cellKey);
          if (!bucket) continue;
          for (var i = 0; i < bucket.length; i++) {
            if (distRapida(coord, bucket[i].coord) <= 0.45) {
              return bucket[i];
            }
          }
        }
      }

      var nodo = { id: nextNodeId++, coord: coord, vecinos: [] };
      nodos.set(nodo.id, nodo);
      var ownKey = gx + ',' + gy;
      if (!spatialGrid.has(ownKey)) {
        spatialGrid.set(ownKey, [nodo]);
      } else {
        spatialGrid.get(ownKey).push(nodo);
      }
      return nodo;
    }

    function registrarAristaEnTramo(nodoA, nodoB, tipoEfectivo, esEdicionUsuario, distMetros) {
      if (nodoA.id === nodoB.id) return;
      var parKey = nodoA.id < nodoB.id
        ? (nodoA.id + '|' + nodoB.id)
        : (nodoB.id + '|' + nodoA.id);

      var prioNueva = esEdicionUsuario
        ? (PRIORIDAD_TRAMO[tipoEfectivo] || PRIORIDAD_TRAMO.normal)
        : PRIORIDAD_TRAMO.osm_base;

      var existente = aristasPorPar.get(parKey);
      if (existente && existente.prioridad >= prioNueva) {
        return;
      }

      aristasPorPar.set(parKey, {
        idA: nodoA.id,
        idB: nodoB.id,
        tipo: tipoEfectivo,
        prioridad: prioNueva,
        dist: distMetros
      });
    }

    var puntosDivision = [origenLngLat, destinoLngLat];
    var trazosMeta = [];
    var puntosObstaculo = [];
    var tolBboxLng = 3.0 / M_POR_LNG;
    var tolBboxLat = 3.0 / M_POR_LAT;

    (customFeatures || []).forEach(function (f) {
      if (!f || !f.geometry) return;
      if (f.geometry.type === 'LineString' && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length >= 2) {
        var c = f.geometry.coordinates;
        var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (var i = 0; i < c.length; i++) {
          puntosDivision.push(c[i]);
          if (c[i][0] < minX) minX = c[i][0];
          if (c[i][0] > maxX) maxX = c[i][0];
          if (c[i][1] < minY) minY = c[i][1];
          if (c[i][1] > maxY) maxY = c[i][1];
        }
        var p = f.properties || {};
        var tipo = p.cerrado ? 'cortar' : (p.tipo || 'normal');
        trazosMeta.push({
          coords: c,
          tipo: tipo,
          prio: PRIORIDAD_TRAMO[tipo] || 0,
          minX: minX - tolBboxLng,
          maxX: maxX + tolBboxLng,
          minY: minY - tolBboxLat,
          maxY: maxY + tolBboxLat
        });
      } else if (f.geometry.type === 'Point' && Array.isArray(f.geometry.coordinates)) {
        puntosObstaculo.push(f);
        puntosDivision.push(f.geometry.coordinates);
      }
    });

    for (var oIdx = 0; oIdx < osmFiltradas.length; oIdx++) {
      var oc = osmFiltradas[oIdx].geometry.coordinates;
      puntosDivision.push(oc[0]);
      puntosDivision.push(oc[oc.length - 1]);
    }

    function partirPolilineaEnPuntos(coordsOriginales) {
      var resultado = [];
      for (var i = 0; i < coordsOriginales.length - 1; i++) {
        var a = coordsOriginales[i];
        var b = coordsOriginales[i + 1];
        var segMinX = (a[0] < b[0] ? a[0] : b[0]) - tolBboxLng;
        var segMaxX = (a[0] > b[0] ? a[0] : b[0]) + tolBboxLng;
        var segMinY = (a[1] < b[1] ? a[1] : b[1]) - tolBboxLat;
        var segMaxY = (a[1] > b[1] ? a[1] : b[1]) + tolBboxLat;

        var cortesEnSegmento = [];
        for (var j = 0; j < puntosDivision.length; j++) {
          var pt = puntosDivision[j];
          if (pt[0] < segMinX || pt[0] > segMaxX || pt[1] < segMinY || pt[1] > segMaxY) {
            continue;
          }
          var proy = proyRapida(pt, a, b);
          if (proy.dist <= 2.4 && proy.t > 0.002 && proy.t < 0.998) {
            cortesEnSegmento.push(proy);
          }
        }

        if (cortesEnSegmento.length > 1) {
          cortesEnSegmento.sort(function (x, y) { return x.t - y.t; });
        }
        resultado.push(a);

        for (var k = 0; k < cortesEnSegmento.length; k++) {
          var ultimo = resultado[resultado.length - 1];
          if (distRapida(ultimo, cortesEnSegmento[k].coord) > 0.25) {
            resultado.push(cortesEnSegmento[k].coord);
          }
        }
      }
      resultado.push(coordsOriginales[coordsOriginales.length - 1]);
      return resultado;
    }

    function obtenerTipoGanadorEnSubsegmento(a, b) {
      if (trazosMeta.length === 0) return null;
      var mx = (a[0] + b[0]) * 0.5;
      var my = (a[1] + b[1]) * 0.5;
      var medio = [mx, my];
      var mejorTipo = null;
      var mejorPrio = -1;

      for (var i = 0; i < trazosMeta.length; i++) {
        var meta = trazosMeta[i];
        if (mx < meta.minX || mx > meta.maxX || my < meta.minY || my > meta.maxY) {
          continue;
        }
        if (meta.prio <= mejorPrio) continue;

        var dA = distPolilineaRapida(a, meta.coords);
        if (dA > 2.4) continue;
        var dB = distPolilineaRapida(b, meta.coords);
        if (dB > 2.4) continue;
        var dM = distPolilineaRapida(medio, meta.coords);
        if (dM <= 2.2) {
          mejorPrio = meta.prio;
          mejorTipo = meta.tipo;
        }
      }
      return mejorTipo;
    }

    // 1. Vías base de OSM
    for (var idxOSM = 0; idxOSM < osmFiltradas.length; idxOSM++) {
      var feature = osmFiltradas[idxOSM];
      var id = feature.id || (feature.properties ? feature.properties.id : null);
      var hasOverride = Boolean(id && overrides[id]);
      var ov = hasOverride ? overrides[id] : {};
      var p = Object.assign({}, feature.properties || {}, ov);

      var tipoBaseOSM = clasificarViaOSM(p);
      var coordsPartidas = partirPolilineaEnPuntos(feature.geometry.coordinates);

      for (var i = 0; i < coordsPartidas.length - 1; i++) {
        var a = coordsPartidas[i];
        var b = coordsPartidas[i + 1];

        var tipoGanadorUser = obtenerTipoGanadorEnSubsegmento(a, b);
        var esEditado = hasOverride || (tipoGanadorUser !== null);
        var tipoFinal = tipoGanadorUser !== null ? tipoGanadorUser : tipoBaseOSM;

        var nodoA = obtenerONodo(a);
        var nodoB = obtenerONodo(b);
        var distMetros = distRapida(a, b);
        registrarAristaEnTramo(nodoA, nodoB, tipoFinal, esEditado, distMetros);
      }
    }

    // 2. Trazos personalizados del usuario
    for (var idxC = 0; idxC < trazosMeta.length; idxC++) {
      var metaC = trazosMeta[idxC];
      var coordsPartidasC = partirPolilineaEnPuntos(metaC.coords);

      for (var i = 0; i < coordsPartidasC.length - 1; i++) {
        var a = coordsPartidasC[i];
        var b = coordsPartidasC[i + 1];
        var tipoGanador = obtenerTipoGanadorEnSubsegmento(a, b) || metaC.tipo;

        var nodoA = obtenerONodo(a);
        var nodoB = obtenerONodo(b);
        var distMetros = distRapida(a, b);
        registrarAristaEnTramo(nodoA, nodoB, tipoGanador, true, distMetros);
      }
    }

    // 3. Materializar ramas en cada vértice
    aristasPorPar.forEach(function (arista) {
      if (arista.tipo === 'cortar') return;

      var nodoA = nodos.get(arista.idA);
      var nodoB = nodos.get(arista.idB);
      if (!nodoA || !nodoB) return;

      var costo = calcularCostoArista(arista.tipo, arista.dist, soloAccesible);
      var esEscalera = (arista.tipo === 'escalera');
      nodoA.vecinos.push({ hacia: nodoB.id, costo: costo, dist: arista.dist, esEscalera: esEscalera });
      nodoB.vecinos.push({ hacia: nodoA.id, costo: costo, dist: arista.dist, esEscalera: esEscalera });
    });

    // 4. Registrar obstáculos puntuales
    for (var idxPt = 0; idxPt < puntosObstaculo.length; idxPt++) {
      var ptFeature = puntosObstaculo[idxPt];
      var pPt = ptFeature.properties || {};
      var tipoPt = pPt.tipo || 'corte_punto';
      var nodoObstaculo = obtenerONodo(ptFeature.geometry.coordinates);

      if (tipoPt === 'corte_punto') {
        nodosBloqueados.add(nodoObstaculo.id);
      } else if (tipoPt === 'escalon' && soloAccesible) {
        penalizacionNodo.set(nodoObstaculo.id, (penalizacionNodo.get(nodoObstaculo.id) || 0) + 90.0);
      }
    }

    if (nodos.size === 0) return null;

    function nodoMasCercano(lngLat) {
      var mejor = null;
      var minDist = Infinity;
      nodos.forEach(function (n) {
        if (n.vecinos.length === 0 || nodosBloqueados.has(n.id)) return;
        var d = distRapida(lngLat, n.coord);
        if (d < minDist) {
          minDist = d;
          mejor = n;
        }
      });
      return mejor;
    }

    var inicio = nodoMasCercano(origenLngLat);
    var fin = nodoMasCercano(destinoLngLat);
    if (!inicio || !fin) return null;

    var distScore = new Map();
    var cameFrom = new Map();
    var heap = [{ id: inicio.id, score: 0 }];
    distScore.set(inicio.id, 0);

    function heapPush(item) {
      heap.push(item);
      var i = heap.length - 1;
      while (i > 0) {
        var p = (i - 1) >> 1;
        if (heap[p].score <= item.score) break;
        heap[i] = heap[p];
        i = p;
      }
      heap[i] = item;
    }

    function heapPop() {
      var top = heap[0];
      var last = heap.pop();
      if (heap.length > 0) {
        var i = 0;
        var half = heap.length >> 1;
        while (i < half) {
          var l = (i << 1) + 1;
          var r = l + 1;
          var best = (r < heap.length && heap[r].score < heap[l].score) ? r : l;
          if (last.score <= heap[best].score) break;
          heap[i] = heap[best];
          i = best;
        }
        heap[i] = last;
      }
      return top;
    }

    while (heap.length > 0) {
      var actual = heapPop();
      var actualId = actual.id;
      if (actual.score > (distScore.get(actualId) || Infinity)) continue;
      if (actualId === fin.id) break;
      if (actualId !== inicio.id && nodosBloqueados.has(actualId)) continue;

      var nodoActual = nodos.get(actualId);
      for (var j = 0; j < nodoActual.vecinos.length; j++) {
        var arista = nodoActual.vecinos[j];
        if (arista.hacia !== fin.id && nodosBloqueados.has(arista.hacia)) continue;

        var extraNodo = penalizacionNodo.get(arista.hacia) || 0;
        var tentativo = actual.score + arista.costo + extraNodo;
        var previoScore = distScore.has(arista.hacia) ? distScore.get(arista.hacia) : Infinity;
        if (tentativo < previoScore) {
          cameFrom.set(arista.hacia, {
            prev: actualId,
            dist: arista.dist,
            usaEscalera: arista.esEscalera || extraNodo > 0
          });
          distScore.set(arista.hacia, tentativo);
          heapPush({ id: arista.hacia, score: tentativo });
        }
      }
    }

    if (!cameFrom.has(fin.id) && inicio.id !== fin.id) return null;

    var rutaCoords = [fin.coord];
    var distanciaTotal = 0;
    var usaEscaleras = false;
    var curr = fin.id;
    while (cameFrom.has(curr)) {
      var paso = cameFrom.get(curr);
      distanciaTotal += paso.dist;
      if (paso.usaEscalera) usaEscaleras = true;
      rutaCoords.unshift(nodos.get(paso.prev).coord);
      curr = paso.prev;
    }

    rutaCoords.unshift(origenLngLat);
    rutaCoords.push(destinoLngLat);

    return {
      coordinates: rutaCoords.map(function (c) { return L.latLng(c[1], c[0]); }),
      distance: distanciaTotal,
      duration: distanciaTotal / 1.25,
      usaEscaleras: usaEscaleras
    };
  }

  // =========================================================================
  // Router compatible con Leaflet Routing Machine
  // =========================================================================
  L.Routing.GrafoAccesible = L.Class.extend({
    initialize: function (options) {
      this.options = options || {};
      this.fallbackRouter = this.options.fallbackRouter || null;
    },

    route: async function (waypoints, callback, context) {
      try {
        if (!waypoints || waypoints.length < 2) {
          return callback.call(context, { status: -1, message: 'Se requieren 2 puntos' });
        }

        var wpA = waypoints[0].latLng;
        var wpB = waypoints[waypoints.length - 1].latLng;

        var distLineal = distanciaMetros([wpA.lng, wpA.lat], [wpB.lng, wpB.lat]);
        if (distLineal > 10000 && this.fallbackRouter) {
          return this.fallbackRouter.route(waypoints, callback, context);
        }

        await cargarEdicionesBD();

        var south = Math.min(wpA.lat, wpB.lat);
        var north = Math.max(wpA.lat, wpB.lat);
        var west = Math.min(wpA.lng, wpB.lng);
        var east = Math.max(wpA.lng, wpB.lng);

        var baseOSM = await obtenerRedOSM(south, west, north, east, false);
        var overrides = window.GrafoCampus.ediciones.overrides || {};
        var customFeatures = (window.GrafoCampus.ediciones.tramos_nuevos && window.GrafoCampus.ediciones.tramos_nuevos.features)
          ? window.GrafoCampus.ediciones.tramos_nuevos.features
          : [];

        var resultado = calcularCaminoEnGrafo(
          baseOSM.features,
          customFeatures,
          overrides,
          [wpA.lng, wpA.lat],
          [wpB.lng, wpB.lat],
          window.GrafoCampus.soloAccesible
        );

        if (!resultado) {
          if (this.fallbackRouter) {
            return this.fallbackRouter.route(waypoints, callback, context);
          }
          return callback.call(context, { status: 0, message: 'No hay ruta disponible con estas restricciones' });
        }

        var textoInstruccion = 'Seguir ruta peatonal';
        if (window.GrafoCampus.soloAccesible) {
          textoInstruccion = resultado.usaEscaleras
            ? '⚠️ Ruta con escaleras (no existe acceso alternativo por rampa)'
            : 'Seguir ruta accesible sin escaleras';
        }

        var routeResult = [{
          name: window.GrafoCampus.soloAccesible ? 'Ruta Accesible' : 'Ruta Peatonal',
          coordinates: resultado.coordinates,
          instructions: [{
            type: 'Head',
            distance: resultado.distance,
            time: resultado.duration,
            road: '',
            direction: '',
            text: textoInstruccion,
            index: 0
          }],
          summary: {
            totalDistance: resultado.distance,
            totalTime: resultado.duration
          },
          inputWaypoints: waypoints,
          waypoints: waypoints.map(function (wp, idx) {
            return { latLng: wp.latLng, name: wp.name || ('Punto ' + (idx + 1)) };
          })
        }];

        callback.call(context, null, routeResult);
      } catch (err) {
        console.error('[GrafoCampus] Error en GrafoAccesible, usando respaldo Mapbox:', err);
        if (this.fallbackRouter) {
          return this.fallbackRouter.route(waypoints, callback, context);
        }
        callback.call(context, { status: -1, message: err.message });
      }
    }
  });

  L.Routing.grafoAccesible = function (options) {
    return new L.Routing.GrafoAccesible(options);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      cargarEdicionesBD();
    });
  } else {
    cargarEdicionesBD();
  }
})();