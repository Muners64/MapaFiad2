/**
 * Motor de enrutamiento peatonal, accesible e híbrido (Vehículo + Campus a pie)
 *
 * Reglas topológicas:
 * 1. Sobre un MISMO TRAMO (arista superpuesta):
 *    Cortado (5) > Rampa (4) > Escalera (3) > Normal usuario (2) > Base OSM (1)
 * 2. Prioridad de infraestructura peatonal:
 *    - Prioriza rampas (0.70-0.90), banquetas (1.0) y cruces marcados (1.05).
 *    - Bloquea en la práctica caminar o cruzar carreteras/avenidas sin paso
 *      peatonal (80x + 800 m).
 *    - Penaliza calles internas y pasillos de estacionamiento (2.8x + 12 m por
 *      bajar de banqueta) para preferir banquetas paralelas sin impedir salir
 *      directo de un estacionamiento.
 * 3. Enrutamiento híbrido (Fuera del campus -> Dentro del campus):
 *    - Tramo exterior en vehículo hasta el Punto de Descenso óptimo + tramo
 *      interior a pie/accesible hasta el edificio destino.
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
    motorway: true, motorway_link: true,
    primary: true, secondary: true, tertiary: true, trunk: true,
    primary_link: true, secondary_link: true, tertiary_link: true, trunk_link: true
  };

  var VIAS_CALLE_INTERNA = {
    service: true, residential: true, unclassified: true, track: true, living_street: true
  };

  function clasificarViaOSM(props) {
    var p = props || {};
    if (p.cerrado === true) return 'cortar';
    if (p.tipo === 'rampa' || p.ramp === 'yes') return 'rampa';
    if (p.tipo === 'escalera' || p.highway === 'steps' || p.accesible === false) return 'escalera';
    if (p.foot === 'no') return 'carretera';
    if (p.tipo === 'carretera' || VIAS_CARRETERA[p.highway]) return 'carretera';
    if (p.tipo === 'calle_interna' || VIAS_CALLE_INTERNA[p.highway]) return 'calle_interna';
    if (p.tipo === 'cruce' || p.footway === 'crossing' || p.highway === 'crossing') return 'cruce';
    return 'normal';
  }

  function esTipoBanquetaORampa(tipo) {
    return tipo === 'normal' || tipo === 'rampa';
  }

  // =========================================================================
  // Utilidades geométricas y zonas (Campus vs Alrededores / Zona Camiones)
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
    if (tipo === 'cruce') return distMetros * (soloAccesible ? 1.10 : 1.05);
    if (tipo === 'escalera') {
      return soloAccesible ? (distMetros * 35.0 + 180.0) : (distMetros * 1.15);
    }
    // Proporcional sin costo fijo por segmento: evita caminar sobre calles si hay banqueta,
    // pero permite salir directo de un estacionamiento
    if (tipo === 'calle_interna') {
      return distMetros * (soloAccesible ? 4.5 : 2.8);
    }
    // Bloqueo práctico para carreteras y avenidas principales
    if (tipo === 'carretera') {
      return distMetros * 80.0 + 800.0;
    }
    return distMetros * 1.0;
  }

  function obtenerLimitesCampus(margenMetros) {
    var margen = (typeof margenMetros === 'number') ? margenMetros : 220;
    var minLng = Infinity, maxLng = -Infinity;
    var minLat = Infinity, maxLat = -Infinity;
    var puntos = [];

    if (Array.isArray(window.edificios)) {
      window.edificios.forEach(function (ed) {
        if (Array.isArray(ed.labelCoords) && ed.labelCoords.length >= 2) {
          puntos.push([Number(ed.labelCoords[1]), Number(ed.labelCoords[0])]);
        }
        if (Array.isArray(ed.coords)) {
          ed.coords.forEach(function (c) {
            if (Array.isArray(c) && c.length >= 2) {
              puntos.push([Number(c[1]), Number(c[0])]);
            }
          });
        }
      });
    }

    if (window.GrafoCampus && Array.isArray(window.GrafoCampus.edificiosExistentes)) {
      window.GrafoCampus.edificiosExistentes.forEach(function (ed) {
        var lat = parseFloat(ed.latitud);
        var lng = parseFloat(ed.longitud);
        if (!isNaN(lat) && !isNaN(lng)) {
          puntos.push([lng, lat]);
        }
      });
    }

    for (var i = 0; i < puntos.length; i++) {
      var lng = puntos[i][0];
      var lat = puntos[i][1];
      if (isNaN(lng) || isNaN(lat)) continue;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }

    if (!isFinite(minLng)) return null;

    var latRef = ((minLat + maxLat) * 0.5) * (Math.PI / 180);
    var padLat = margen / 110540;
    var padLng = margen / (111320 * Math.cos(latRef));

    return {
      south: minLat - padLat,
      north: maxLat + padLat,
      west: minLng - padLng,
      east: maxLng + padLng,
      center: [(minLng + maxLng) * 0.5, (minLat + maxLat) * 0.5]
    };
  }

  function estaDentroDeLimites(lngLat, limites) {
    if (!limites) return null;
    return (
      lngLat[0] >= limites.west &&
      lngLat[0] <= limites.east &&
      lngLat[1] >= limites.south &&
      lngLat[1] <= limites.north
    );
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
  // Lectura de Puntos de Descenso designados en el editor / BD
  // =========================================================================
  function extraerLngLatItem(item) {
    if (!item) return null;
    if (item.lng !== undefined && item.lat !== undefined) {
      var lng1 = parseFloat(item.lng);
      var lat1 = parseFloat(item.lat);
      if (!isNaN(lng1) && !isNaN(lat1)) return [lng1, lat1];
    }
    if (item.longitud !== undefined && item.latitud !== undefined) {
      var lng2 = parseFloat(item.longitud);
      var lat2 = parseFloat(item.latitud);
      if (!isNaN(lng2) && !isNaN(lat2)) return [lng2, lat2];
    }
    var arr = item.coordenadas || item.labelCoords || (item.geometry && item.geometry.coordinates);
    if (Array.isArray(arr) && arr.length >= 2) {
      var a = parseFloat(arr[0]);
      var b = parseFloat(arr[1]);
      if (isNaN(a) || isNaN(b)) return null;
      return Math.abs(a) > 90 ? [a, b] : [b, a];
    }
    return null;
  }

  function obtenerPuntosDescensoDesignados(customFeatures) {
    var puntos = [];
    var vistos = new Set();

    function agregar(coord, nombre) {
      if (!coord || isNaN(coord[0]) || isNaN(coord[1])) return;
      var k = coord[0].toFixed(6) + ',' + coord[1].toFixed(6);
      if (vistos.has(k)) return;
      vistos.add(k);
      puntos.push({
        coord: coord,
        nombre: nombre || 'el punto de descenso'
      });
    }

    var features = Array.isArray(customFeatures)
      ? customFeatures
      : ((window.GrafoCampus && window.GrafoCampus.ediciones && window.GrafoCampus.ediciones.tramos_nuevos && window.GrafoCampus.ediciones.tramos_nuevos.features) || []);

    features.forEach(function (f) {
      if (!f || !f.geometry || f.geometry.type !== 'Point') return;
      var p = f.properties || {};
      if (p.tipo === 'punto_descenso' || p.tipo === 'descenso') {
        agregar(f.geometry.coordinates, p.nombre || p.etiqueta || p.descripcion);
      }
    });

    var pois = (window.GrafoCampus && window.GrafoCampus.ediciones && Array.isArray(window.GrafoCampus.ediciones.puntos_interes))
      ? window.GrafoCampus.ediciones.puntos_interes
      : [];
    pois.forEach(function (poi) {
      var tipo = String(poi.tipo || poi.categoria || '').toLowerCase();
      if (tipo === 'punto_descenso' || tipo === 'descenso') {
        agregar(extraerLngLatItem(poi), poi.nombre || poi.titulo);
      }
    });

    return puntos;
  }

  // =========================================================================
  // Estado y API pública compartida en window.GrafoCampus
  // =========================================================================
  window.GrafoCampus = Object.assign(window.GrafoCampus || {}, {
    soloAccesible: false,
    modoTransporte: 'auto', // 'auto' | 'pie' | 'carro'
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
    obtenerLimitesCampus: obtenerLimitesCampus,
    estaDentroDelCampus: estaDentroDeLimites,
    obtenerPuntosDescenso: obtenerPuntosDescensoDesignados,
    geom: {
      distanciaMetros: distanciaMetros,
      proyeccionEnSegmento: proyeccionEnSegmento,
      distanciaAPolilinea: distanciaAPolilinea
    }
  });

  // =========================================================================
  // Construcción del Grafo Topológico y Dijkstra con Rutas Alternativas
  // =========================================================================
  function construirGrafoTopologico(osmFeatures, customFeatures, overrides, puntosExtra, soloAccesible) {
    if (!Array.isArray(osmFeatures) || osmFeatures.length === 0) return null;

    var refPt = puntosExtra && puntosExtra.length > 0 ? puntosExtra[0] : [-116.666, 31.865];
    var latRef = refPt[1] * (Math.PI / 180);
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

    var nodos = new Map();
    var spatialGrid = new Map();
    var nextNodeId = 1;
    var nodosBloqueados = new Set();
    var nodosConRampa = new Set();
    var nodosDescenso = new Map();
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

      var nodo = { id: nextNodeId++, coord: coord, vecinos: [], tiposIncidentes: new Set() };
      nodos.set(nodo.id, nodo);
      var ownKey = gx + ',' + gy;
      if (!spatialGrid.has(ownKey)) {
        spatialGrid.set(ownKey, [nodo]);
      } else {
        spatialGrid.get(ownKey).push(nodo);
      }
      return nodo;
    }

    function obtenerONodoParaMarcadorPuntual(coord, radioMax) {
      var exacto = obtenerONodo(coord);
      if (exacto.vecinos.length > 0) return exacto;

      var mejor = null;
      var minDist = typeof radioMax === 'number' ? radioMax : 3.0;
      nodos.forEach(function (n) {
        if (n.vecinos.length === 0) return;
        var d = distRapida(coord, n.coord);
        if (d <= minDist) {
          minDist = d;
          mejor = n;
        }
      });
      return mejor || exacto;
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
        parKey: parKey,
        idA: nodoA.id,
        idB: nodoB.id,
        tipo: tipoEfectivo,
        prioridad: prioNueva,
        dist: distMetros
      });
    }

    var puntosDivision = Array.isArray(puntosExtra) ? puntosExtra.slice() : [];
    var trazosMeta = [];
    var puntosMarcados = [];
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
        puntosMarcados.push(f);
        puntosDivision.push(f.geometry.coordinates);
      }
    });

    var osmValidas = [];
    for (var oIdx = 0; oIdx < osmFeatures.length; oIdx++) {
      var feat = osmFeatures[oIdx];
      if (!feat || !feat.geometry || feat.geometry.type !== 'LineString') continue;
      var oc = feat.geometry.coordinates;
      if (!Array.isArray(oc) || oc.length < 2) continue;
      osmValidas.push(feat);
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
    for (var idxOSM = 0; idxOSM < osmValidas.length; idxOSM++) {
      var feature = osmValidas[idxOSM];
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
      nodoA.tiposIncidentes.add(arista.tipo);
      nodoB.tiposIncidentes.add(arista.tipo);

      nodoA.vecinos.push({
        parKey: arista.parKey,
        hacia: nodoB.id,
        tipo: arista.tipo,
        costo: costo,
        dist: arista.dist,
        esEscalera: esEscalera
      });
      nodoB.vecinos.push({
        parKey: arista.parKey,
        hacia: nodoA.id,
        tipo: arista.tipo,
        costo: costo,
        dist: arista.dist,
        esEscalera: esEscalera
      });
    });

    // 4. Registrar puntos especiales (cortes, rampas, escalones, puntos de descenso)
    for (var idxPt = 0; idxPt < puntosMarcados.length; idxPt++) {
      var ptFeature = puntosMarcados[idxPt];
      var pPt = ptFeature.properties || {};
      var tipoPt = pPt.tipo || 'corte_punto';

      if (tipoPt === 'punto_descenso' || tipoPt === 'descenso') {
        var nodoDesc = obtenerONodoParaMarcadorPuntual(ptFeature.geometry.coordinates, 25.0);
        nodosDescenso.set(nodoDesc.id, {
          coordOriginal: ptFeature.geometry.coordinates,
          coordNodo: nodoDesc.coord,
          nombre: pPt.nombre || pPt.etiqueta || 'el punto de descenso'
        });
        continue;
      }

      var nodoMarcado = obtenerONodoParaMarcadorPuntual(ptFeature.geometry.coordinates, 3.0);
      if (tipoPt === 'corte_punto') {
        nodosBloqueados.add(nodoMarcado.id);
      } else if (tipoPt === 'rampa_punto') {
        nodosConRampa.add(nodoMarcado.id);
      } else if (tipoPt === 'escalon' && soloAccesible) {
        penalizacionNodo.set(nodoMarcado.id, (penalizacionNodo.get(nodoMarcado.id) || 0) + 90.0);
      }
    }

    if (nodos.size === 0) return null;

    return {
      nodos: nodos,
      nodosBloqueados: nodosBloqueados,
      nodosConRampa: nodosConRampa,
      nodosDescenso: nodosDescenso,
      penalizacionNodo: penalizacionNodo,
      distRapida: distRapida
    };
  }

  function ejecutarDijkstraEnGrafo(grafo, origenLngLat, destinoLngLat, soloAccesible, penalizacionAristas, evitarCarreteraInicio, radioSnapPeatonal) {
    var nodos = grafo.nodos;
    var nodosBloqueados = grafo.nodosBloqueados;
    var nodosConRampa = grafo.nodosConRampa;
    var penalizacionNodo = grafo.penalizacionNodo;
    var distRapida = grafo.distRapida;

    function tieneConectorPeatonal(n) {
      return n.tiposIncidentes.has('normal') ||
             n.tiposIncidentes.has('rampa') ||
             n.tiposIncidentes.has('cruce') ||
             n.tiposIncidentes.has('escalera');
    }

    function soloEsCarretera(n) {
      return n.tiposIncidentes.size === 1 && n.tiposIncidentes.has('carretera');
    }

    function nodoMasCercano(lngLat, evitarCarretera, maxRadioPeatonal) {
      var mejorPeatonal = null;
      var minDistPeatonal = Infinity;
      var mejorSecundario = null;
      var minDistSecundario = Infinity;

      nodos.forEach(function (n) {
        if (n.vecinos.length === 0 || nodosBloqueados.has(n.id)) return;
        if (evitarCarretera && soloEsCarretera(n)) return;

        var d = distRapida(lngLat, n.coord);
        if (tieneConectorPeatonal(n)) {
          if (d < minDistPeatonal) {
            minDistPeatonal = d;
            mejorPeatonal = n;
          }
        } else if (d < minDistSecundario) {
          minDistSecundario = d;
          mejorSecundario = n;
        }
      });

      var radio = typeof maxRadioPeatonal === 'number' ? maxRadioPeatonal : 45.0;
      if (mejorPeatonal && minDistPeatonal <= radio) {
        return mejorPeatonal;
      }
      if (mejorSecundario && minDistSecundario < minDistPeatonal) {
        return mejorSecundario;
      }
      return mejorPeatonal || mejorSecundario || (evitarCarretera ? nodoMasCercano(lngLat, false, radio) : null);
    }

    var snapInicio = typeof radioSnapPeatonal === 'number' ? radioSnapPeatonal : 45.0;
    var inicio = nodoMasCercano(origenLngLat, Boolean(evitarCarreteraInicio), snapInicio);
    var fin = nodoMasCercano(destinoLngLat, true, 45.0);
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

      var pasoLlegada = cameFrom.get(actualId);
      var tipoLlegada = pasoLlegada ? pasoLlegada.tipo : null;

      var nodoActual = nodos.get(actualId);
      var nodoTieneCruceORampa = nodoActual.tiposIncidentes.has('cruce') || nodosConRampa.has(actualId);

      for (var j = 0; j < nodoActual.vecinos.length; j++) {
        var arista = nodoActual.vecinos[j];
        if (arista.hacia !== fin.id && nodosBloqueados.has(arista.hacia)) continue;

        var factorAlt = (penalizacionAristas && penalizacionAristas.get(arista.parKey)) || 1.0;
        var costoArista = arista.costo * factorAlt;

        if (soloAccesible && (nodosConRampa.has(actualId) || nodosConRampa.has(arista.hacia))) {
          costoArista *= 0.85;
        }

        // Penalizar bajar/subir entre banqueta y carretera o calle sin paso peatonal
        var penalizacionCalzada = 0;
        var cruzaBanquetaSinRampa = false;

        if (tipoLlegada !== null) {
          var tocaCarretera =
            (esTipoBanquetaORampa(tipoLlegada) && arista.tipo === 'carretera') ||
            (tipoLlegada === 'carretera' && esTipoBanquetaORampa(arista.tipo));

          var tocaCalleInterna =
            (esTipoBanquetaORampa(tipoLlegada) && arista.tipo === 'calle_interna') ||
            (tipoLlegada === 'calle_interna' && esTipoBanquetaORampa(arista.tipo));

          if (tocaCarretera && !nodoTieneCruceORampa) {
            cruzaBanquetaSinRampa = true;
            penalizacionCalzada = soloAccesible ? 350.0 : 180.0;
          } else if (tocaCalleInterna && !nodoTieneCruceORampa) {
            cruzaBanquetaSinRampa = true;
            penalizacionCalzada = soloAccesible ? 45.0 : 12.0;
          } else if (
            soloAccesible &&
            !nodosConRampa.has(actualId) &&
            ((esTipoBanquetaORampa(tipoLlegada) && arista.tipo === 'cruce') ||
             (tipoLlegada === 'cruce' && esTipoBanquetaORampa(arista.tipo)))
          ) {
            cruzaBanquetaSinRampa = true;
            penalizacionCalzada = 65.0;
          }
        }

        var extraNodo = penalizacionNodo.get(arista.hacia) || 0;
        var tentativo = actual.score + costoArista + penalizacionCalzada + extraNodo;
        var previoScore = distScore.has(arista.hacia) ? distScore.get(arista.hacia) : Infinity;
        if (tentativo < previoScore) {
          cameFrom.set(arista.hacia, {
            prev: actualId,
            parKey: arista.parKey,
            tipo: arista.tipo,
            dist: arista.dist,
            usaEscalera: arista.esEscalera || extraNodo > 0,
            usaBanquetaSinRampa: cruzaBanquetaSinRampa,
            usaCarretera: arista.tipo === 'carretera'
          });
          distScore.set(arista.hacia, tentativo);
          heapPush({ id: arista.hacia, score: tentativo });
        }
      }
    }

    if (!cameFrom.has(fin.id) && inicio.id !== fin.id) return null;

    var rutaCoords = [fin.coord];
    var aristasUsadas = new Set();
    var distanciaTotal = distRapida(origenLngLat, inicio.coord) + distRapida(fin.coord, destinoLngLat);
    var usaEscaleras = false;
    var usaBanquetaSinRampa = false;
    var usaCarretera = false;
    var curr = fin.id;

    while (cameFrom.has(curr)) {
      var paso = cameFrom.get(curr);
      aristasUsadas.add(paso.parKey);
      distanciaTotal += paso.dist;
      if (paso.usaEscalera) usaEscaleras = true;
      if (paso.usaBanquetaSinRampa) usaBanquetaSinRampa = true;
      if (paso.usaCarretera) usaCarretera = true;
      rutaCoords.unshift(nodos.get(paso.prev).coord);
      curr = paso.prev;
    }

    rutaCoords.unshift(origenLngLat);
    rutaCoords.push(destinoLngLat);

    var velocidadPie = soloAccesible ? 1.05 : 1.25;

    return {
      coordinates: rutaCoords.map(function (c) { return L.latLng(c[1], c[0]); }),
      distance: distanciaTotal,
      score: distScore.get(fin.id) || distanciaTotal,
      duration: distanciaTotal / velocidadPie,
      usaEscaleras: usaEscaleras,
      usaBanquetaSinRampa: usaBanquetaSinRampa,
      usaCarretera: usaCarretera,
      aristasUsadas: aristasUsadas
    };
  }

  function calcularSimilitudAristas(setA, setB) {
    if (!setA || !setB || setA.size === 0 || setB.size === 0) return 0;
    var comunes = 0;
    setA.forEach(function (k) {
      if (setB.has(k)) comunes++;
    });
    return comunes / Math.min(setA.size, setB.size);
  }

  function calcularRutasConAlternativas(osmFeatures, customFeatures, overrides, origenLngLat, destinoLngLat, soloAccesible, evitarCarreteraInicio, radioSnapPeatonal) {
    var grafo = construirGrafoTopologico(osmFeatures, customFeatures, overrides, [origenLngLat, destinoLngLat], soloAccesible);
    if (!grafo) return [];

    var principal = ejecutarDijkstraEnGrafo(grafo, origenLngLat, destinoLngLat, soloAccesible, null, evitarCarreteraInicio, radioSnapPeatonal);
    if (!principal) return [];

    principal.etiqueta = soloAccesible
      ? (principal.usaEscaleras ? 'Con escaleras' : 'Accesible')
      : 'Más rápida';

    var resultados = [principal];
    var penalizaciones = new Map();

    for (var intento = 1; intento <= 2; intento++) {
      var ultimaRuta = resultados[resultados.length - 1];
      ultimaRuta.aristasUsadas.forEach(function (parKey) {
        penalizaciones.set(parKey, (penalizaciones.get(parKey) || 1.0) * 2.35);
      });

      var candidata = ejecutarDijkstraEnGrafo(grafo, origenLngLat, destinoLngLat, soloAccesible, penalizaciones, evitarCarreteraInicio, radioSnapPeatonal);
      if (!candidata) break;

      if (!principal.usaCarretera && candidata.usaCarretera) break;
      if (candidata.distance > (principal.distance * 2.2 + 120)) break;
      if (candidata.score > (principal.score * 2.5 + 180)) break;

      var esRepetida = resultados.some(function (prev) {
        return calcularSimilitudAristas(prev.aristasUsadas, candidata.aristasUsadas) >= 0.78;
      });

      if (!esRepetida) {
        candidata.etiqueta = 'Alternativa ' + resultados.length;
        resultados.push(candidata);
      }
    }

    return resultados;
  }

  // =========================================================================
  // Respaldo de estacionamientos (solo si no hay puntos de descenso creados)
  // =========================================================================
  function obtenerEstacionamientosRespaldo(osmFeatures) {
    var puntos = [];
    var vistos = new Set();

    function agregar(coord, nombre) {
      if (!coord || isNaN(coord[0]) || isNaN(coord[1])) return;
      var k = coord[0].toFixed(5) + ',' + coord[1].toFixed(5);
      if (vistos.has(k)) return;
      vistos.add(k);
      puntos.push({ coord: coord, nombre: nombre || 'Estacionamiento' });
    }

    var pois = (window.GrafoCampus && window.GrafoCampus.ediciones && Array.isArray(window.GrafoCampus.ediciones.puntos_interes))
      ? window.GrafoCampus.ediciones.puntos_interes
      : [];
    pois.forEach(function (poi) {
      var desc = [poi.tipo, poi.categoria, poi.nombre, poi.titulo, poi.icono].join(' ').toLowerCase();
      if (/estacionamiento|parking|aparcamiento|coche|auto/.test(desc)) {
        agregar(extraerLngLatItem(poi), poi.nombre || 'Estacionamiento');
      }
    });

    (osmFeatures || []).forEach(function (feat) {
      if (!feat || !feat.geometry) return;
      var props = feat.properties || {};
      if (props.amenity !== 'parking' && !props.parking && props.service !== 'parking_aisle') return;
      var geom = feat.geometry;
      if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
        agregar(geom.coordinates, props.name || 'Estacionamiento');
      } else if (geom.type === 'LineString' && Array.isArray(geom.coordinates) && geom.coordinates.length > 0) {
        agregar(geom.coordinates[Math.floor(geom.coordinates.length / 2)], props.name || 'Estacionamiento');
      } else if (geom.type === 'Polygon' && Array.isArray(geom.coordinates) && Array.isArray(geom.coordinates[0])) {
        var anillo = geom.coordinates[0];
        var sumX = 0, sumY = 0, count = 0;
        for (var i = 0; i < anillo.length; i++) {
          sumX += anillo[i][0];
          sumY += anillo[i][1];
          count++;
        }
        if (count > 0) agregar([sumX / count, sumY / count], props.name || 'Estacionamiento');
      }
    });

    return puntos;
  }

  // =========================================================================
  // Selección de Punto de Descenso (Oficiales del editor > Respaldo OSM)
  // =========================================================================
  function seleccionarMejorPuntoDescenso(grafo, origenLngLat, destinoLngLat, puntosDesignados, puntosRespaldo, soloAccesible) {
    var candidatos = (Array.isArray(puntosDesignados) && puntosDesignados.length > 0)
      ? puntosDesignados
      : (puntosRespaldo || []);

    if (candidatos.length === 0) return null;

    var mejor = null;
    var mejorScore = Infinity;

    for (var i = 0; i < candidatos.length; i++) {
      var cand = candidatos[i];
      var rutaPie = ejecutarDijkstraEnGrafo(grafo, cand.coord, destinoLngLat, soloAccesible, null, true, 12.0);
      if (!rutaPie) continue;

      var distAuto = distanciaMetros(origenLngLat, cand.coord);
      var penalizacionEscaleras = (soloAccesible && rutaPie.usaEscaleras) ? 600 : 0;

      var score = (rutaPie.score * 1.4) + rutaPie.distance + (distAuto * 0.10) + penalizacionEscaleras;
      if (score < mejorScore) {
        mejorScore = score;
        mejor = cand;
      }
    }

    return mejor || candidatos[0];
  }

  function consultarRutaVehiculo(drivingRouter, wpOrigen, latLngAcceso, nombreAcceso) {
    return new Promise(function (resolve) {
      if (!drivingRouter) {
        resolve(null);
        return;
      }
      var wpDestino = L.Routing.waypoint(latLngAcceso, nombreAcceso || 'Punto de descenso');
      drivingRouter.route([wpOrigen, wpDestino], function (err, routes) {
        if (err || !Array.isArray(routes) || routes.length === 0) {
          resolve(null);
          return;
        }
        resolve(routes[0]);
      });
    });
  }

  // =========================================================================
  // Router compatible con Leaflet Routing Machine
  // =========================================================================
  L.Routing.GrafoAccesible = L.Class.extend({
    initialize: function (options) {
      this.options = options || {};
      this.fallbackRouter = this.options.fallbackRouter || null;
      this.drivingRouter = this.options.drivingRouter || null;
    },

    route: async function (waypoints, callback, context) {
      try {
        if (!waypoints || waypoints.length < 2) {
          return callback.call(context, { status: -1, message: 'Se requieren 2 puntos' });
        }

        var wpA = waypoints[0].latLng;
        var wpB = waypoints[waypoints.length - 1].latLng;
        var origenLngLat = [wpA.lng, wpA.lat];
        var destinoLngLat = [wpB.lng, wpB.lat];

        await cargarEdicionesBD();

        var limitesCampus = obtenerLimitesCampus(220);
        var limitesAlrededores = obtenerLimitesCampus(900);
        var distLineal = distanciaMetros(origenLngLat, destinoLngLat);

        var enAlrededores = estaDentroDeLimites(origenLngLat, limitesAlrededores);
        var destinoEnCampus = estaDentroDeLimites(destinoLngLat, limitesCampus);

        if (enAlrededores === null) enAlrededores = (distLineal <= 900);
        if (destinoEnCampus === null) destinoEnCampus = true;

        var modo = (window.GrafoCampus && window.GrafoCampus.modoTransporte) || 'auto';
        var usarHibridoAuto = false;

        if (modo === 'pie') {
          usarHibridoAuto = false;
        } else if (modo === 'carro') {
          usarHibridoAuto = destinoEnCampus && distLineal > 120;
        } else {
          usarHibridoAuto = !enAlrededores && destinoEnCampus;
        }

        var overrides = window.GrafoCampus.ediciones.overrides || {};
        var customFeatures = (window.GrafoCampus.ediciones.tramos_nuevos && window.GrafoCampus.ediciones.tramos_nuevos.features)
          ? window.GrafoCampus.ediciones.tramos_nuevos.features
          : [];

        // CASO A: Híbrido (Vehículo hasta Punto de Descenso designado + Caminar dentro)
        if (usarHibridoAuto) {
          var southC = limitesCampus ? limitesCampus.south : (wpB.lat - 0.004);
          var northC = limitesCampus ? limitesCampus.north : (wpB.lat + 0.004);
          var westC = limitesCampus ? limitesCampus.west : (wpB.lng - 0.004);
          var eastC = limitesCampus ? limitesCampus.east : (wpB.lng + 0.004);

          var baseOSMCampus = await obtenerRedOSM(southC, westC, northC, eastC, false);
          var puntosDesignados = obtenerPuntosDescensoDesignados(customFeatures);
          var puntosRespaldo = puntosDesignados.length === 0
            ? obtenerEstacionamientosRespaldo(baseOSMCampus.features)
            : [];

          var coordsExtra = [destinoLngLat]
            .concat(puntosDesignados.map(function (p) { return p.coord; }))
            .concat(puntosRespaldo.map(function (p) { return p.coord; }));

          var grafoCampus = construirGrafoTopologico(
            baseOSMCampus.features,
            customFeatures,
            overrides,
            coordsExtra,
            window.GrafoCampus.soloAccesible
          );

          var puntoDescenso = grafoCampus
            ? seleccionarMejorPuntoDescenso(
                grafoCampus,
                origenLngLat,
                destinoLngLat,
                puntosDesignados,
                puntosRespaldo,
                window.GrafoCampus.soloAccesible
              )
            : null;

          if (puntoDescenso) {
            var puntoAccesoLL = L.latLng(puntoDescenso.coord[1], puntoDescenso.coord[0]);
            var rutaAuto = await consultarRutaVehiculo(this.drivingRouter, waypoints[0], puntoAccesoLL, puntoDescenso.nombre);
            var rutasPie = calcularRutasConAlternativas(
              baseOSMCampus.features,
              customFeatures,
              overrides,
              puntoDescenso.coord,
              destinoLngLat,
              window.GrafoCampus.soloAccesible,
              true,
              12.0
            );

            var distAuto = rutaAuto ? rutaAuto.summary.totalDistance : distanciaMetros(origenLngLat, puntoDescenso.coord);
            var timeAuto = rutaAuto ? rutaAuto.summary.totalTime : (distAuto / 9.7);
            var coordsAuto = (rutaAuto && Array.isArray(rutaAuto.coordinates) && rutaAuto.coordinates.length > 0)
              ? rutaAuto.coordinates
              : [wpA, puntoAccesoLL];

            if (rutasPie.length > 0) {
              var hibridas = rutasPie.map(function (rPie, idx) {
                var totalDist = distAuto + rPie.distance;
                var totalTime = timeAuto + rPie.duration;
                var coordsCombinadas = coordsAuto.concat(rPie.coordinates.slice(1));

                return {
                  name: idx === 0 ? 'Auto + A pie' : ('Auto + Alt. ' + idx),
                  etiqueta: idx === 0 ? 'Auto + A pie' : ('Auto + Alt. ' + idx),
                  esHibrida: true,
                  nombrePuntoDescenso: puntoDescenso.nombre,
                  tramoVehiculo: {
                    distance: distAuto,
                    duration: timeAuto,
                    coordinates: coordsAuto
                  },
                  tramoPeatonal: {
                    distance: rPie.distance,
                    duration: rPie.duration,
                    coordinates: rPie.coordinates,
                    usaEscaleras: rPie.usaEscaleras,
                    usaBanquetaSinRampa: rPie.usaBanquetaSinRampa
                  },
                  puntoTransicion: puntoAccesoLL,
                  usaEscaleras: rPie.usaEscaleras,
                  usaBanquetaSinRampa: rPie.usaBanquetaSinRampa,
                  coordinates: coordsCombinadas,
                  instructions: [{
                    type: 'Head',
                    distance: totalDist,
                    time: totalTime,
                    road: '',
                    direction: '',
                    text: 'Conduce hasta ' + puntoDescenso.nombre + ' y continúa a pie',
                    index: 0
                  }],
                  summary: {
                    totalDistance: totalDist,
                    totalTime: totalTime
                  },
                  inputWaypoints: waypoints,
                  waypoints: waypoints.map(function (wp, wIdx) {
                    return { latLng: wp.latLng, name: wp.name || ('Punto ' + (wIdx + 1)) };
                  })
                };
              });

              return callback.call(context, null, hibridas);
            }
          }

          if (this.drivingRouter) {
            return this.drivingRouter.route(waypoints, callback, context);
          }
        }

        // CASO B: Destino fuera del campus a larga distancia -> Vehículo directo
        if (!destinoEnCampus && distLineal > 1200 && this.drivingRouter && modo !== 'pie') {
          return this.drivingRouter.route(waypoints, callback, context);
        }

        // CASO C: Peatonal / Accesible (Campus y alrededores como zona camiones)
        var margenBbox = 0.0018;
        var south = Math.min(wpA.lat, wpB.lat) - margenBbox;
        var north = Math.max(wpA.lat, wpB.lat) + margenBbox;
        var west = Math.min(wpA.lng, wpB.lng) - margenBbox;
        var east = Math.max(wpA.lng, wpB.lng) + margenBbox;

        var baseOSM = await obtenerRedOSM(south, west, north, east, false);
        var rutasCampus = calcularRutasConAlternativas(
          baseOSM.features,
          customFeatures,
          overrides,
          origenLngLat,
          destinoLngLat,
          window.GrafoCampus.soloAccesible,
          false,
          45.0
        );

        if (!rutasCampus || rutasCampus.length === 0) {
          if (this.fallbackRouter) {
            return this.fallbackRouter.route(waypoints, callback, context);
          }
          return callback.call(context, { status: 0, message: 'No hay ruta disponible con estas restricciones' });
        }

        var routeResults = rutasCampus.map(function (resultado, idx) {
          var textoInstruccion = 'Seguir ruta peatonal';
          if (window.GrafoCampus.soloAccesible) {
            if (resultado.usaEscaleras) {
              textoInstruccion = '⚠️ Ruta con escaleras (no existe acceso alternativo por rampa)';
            } else if (resultado.usaBanquetaSinRampa) {
              textoInstruccion = '⚠️ Ruta sin escaleras (incluye cruce de banqueta sin rampa marcada)';
            } else {
              textoInstruccion = 'Seguir ruta accesible por rampas y andadores';
            }
          }

          return {
            name: resultado.etiqueta || (idx === 0 ? 'Ruta Principal' : ('Alternativa ' + idx)),
            etiqueta: resultado.etiqueta || (idx === 0 ? 'Más rápida' : ('Alternativa ' + idx)),
            esHibrida: false,
            usaEscaleras: resultado.usaEscaleras,
            usaBanquetaSinRampa: resultado.usaBanquetaSinRampa,
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
            waypoints: waypoints.map(function (wp, wIdx) {
              return { latLng: wp.latLng, name: wp.name || ('Punto ' + (wIdx + 1)) };
            })
          };
        });

        callback.call(context, null, routeResults);
      } catch (err) {
        console.error('[GrafoCampus] Error en GrafoAccesible, usando respaldo:', err);
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