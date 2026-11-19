/**
 * 1. Coordinador Desacoplado del Editor del Mapa (window.EditorMapa)
 * 2. Módulo Registrable del Grafo Peatonal (moduloGrafo)
 */
(function () {
  var editorActivo = false;
  var herramientaActual = 'navegar';
  var panelEditorUI = null;
  var modulosRegistrados = [];

  var HERRAMIENTA_BASE = {
    id: 'navegar',
    label: '✏️ Editar / Seleccionar',
    color: '#334155',
    ayuda: '✏️ <strong>Editar / Seleccionar:</strong> Arrastra vértices, puntos de interés o pines <strong>🎯</strong> de edificios (clic para editar propiedades).'
  };

  function gc() {
    return window.GrafoCampus;
  }

  function escaparHTML(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function obtenerTodasHerramientas() {
    var lista = [HERRAMIENTA_BASE];
    var ordenados = modulosRegistrados.slice().sort(function (a, b) {
      return (a.orden || 50) - (b.orden || 50);
    });
    ordenados.forEach(function (mod) {
      if (Array.isArray(mod.herramientas)) {
        mod.herramientas.forEach(function (h) {
          lista.push(Object.assign({ _modulo: mod }, h));
        });
      }
    });
    return lista;
  }

  function obtenerModuloDeHerramienta(herramientaId) {
    var encontrada = obtenerTodasHerramientas().find(function (h) { return h.id === herramientaId; });
    return encontrada ? (encontrada._modulo || null) : null;
  }

  var ctxCompartido = {
    escaparHTML: escaparHTML,
    setEstado: function (html) {
      var el = document.getElementById('estado-editor-grafo');
      if (el) el.innerHTML = html;
    },
    setAccionesTrazo: function (cfg) {
      var btnUndo = document.getElementById('btn-deshacer-punto');
      var btnFin = document.getElementById('btn-finalizar-trazo');
      if (btnUndo) btnUndo.style.display = cfg && cfg.mostrarDeshacer ? 'inline-block' : 'none';
      if (btnFin) {
        btnFin.style.display = cfg && cfg.mostrarFinalizar ? 'inline-block' : 'none';
        if (cfg && cfg.textoFinalizar) btnFin.textContent = cfg.textoFinalizar;
      }
    },
    seleccionarHerramienta: function (id) {
      window.EditorMapa.seleccionarHerramienta(id);
    }
  };

  function renderizarBarraHerramientas() {
    var contenedor = document.getElementById('fiad-editor-tools-container');
    if (!contenedor) return;

    contenedor.innerHTML = obtenerTodasHerramientas().map(function (h) {
      var activa = (h.id === herramientaActual) ? ' is-active' : '';
      return '<button type="button" id="tool-grafo-' + h.id + '" class="fiad-editor-btn' + activa + '" ' +
             'style="background:' + (h.color || '#334155') + ';" ' +
             'onclick="window.EditorMapa.seleccionarHerramienta(\'' + h.id + '\')">' +
             h.label + '</button>';
    }).join('');
  }

  function inyectarBotonEditorLateral() {
    if (!gc() || !gc().editEnabled) return;
    if (document.getElementById('btn-editor-grafo')) return;
    var contenedor = document.querySelector('.botones_laterales');
    if (!contenedor) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-editor-grafo';
    btn.className = 'lateral-btn';
    btn.title = 'Editor del Mapa (Ctrl+E)';
    btn.setAttribute('aria-label', 'Editor del Mapa');
    btn.innerHTML = '<ion-icon name="git-branch-outline"></ion-icon>';
    btn.onclick = function () {
      window.EditorMapa.toggle();
    };

    contenedor.appendChild(btn);
  }

  function onMapClick(e) {
    if (!editorActivo) return;
    var modActivo = obtenerModuloDeHerramienta(herramientaActual);
    if (modActivo && typeof modActivo.onClick === 'function') {
      modActivo.onClick(e, herramientaActual, ctxCompartido);
    }
  }

  function onMapMouseMove(e) {
    if (!editorActivo) return;
    var modActivo = obtenerModuloDeHerramienta(herramientaActual);
    if (modActivo && typeof modActivo.onMouseMove === 'function') {
      modActivo.onMouseMove(e, herramientaActual, ctxCompartido);
    }
  }

  function onMapDblClick(e) {
    if (!editorActivo) return;
    var modActivo = obtenerModuloDeHerramienta(herramientaActual);
    if (modActivo && typeof modActivo.onDblClick === 'function') {
      modActivo.onDblClick(e, herramientaActual, ctxCompartido);
    }
  }

  window.EditorMapa = {
    estaActivo: function () {
      return editorActivo;
    },

    registrarModulo: function (modulo) {
      if (!modulo || !modulo.id) return;
      if (modulosRegistrados.some(function (m) { return m.id === modulo.id; })) return;
      modulosRegistrados.push(modulo);
      if (editorActivo) {
        renderizarBarraHerramientas();
        if (typeof modulo.alActivarEditor === 'function') {
          modulo.alActivarEditor(ctxCompartido);
        }
      }
    },

    seleccionarHerramienta: function (modo, conservarMensaje) {
      herramientaActual = modo;
      ctxCompartido.setAccionesTrazo({ mostrarDeshacer: false, mostrarFinalizar: false });
      if (typeof map !== 'undefined') {
        map.closePopup();
        map.getContainer().style.cursor = (modo === 'navegar') ? '' : 'crosshair';
        if (modo === 'navegar') map.doubleClickZoom.enable();
        else map.doubleClickZoom.disable();
      }

      renderizarBarraHerramientas();

      modulosRegistrados.forEach(function (mod) {
        if (typeof mod.alCambiarHerramienta === 'function') {
          mod.alCambiarHerramienta(modo, ctxCompartido);
        }
      });

      if (!conservarMensaje) {
        var meta = obtenerTodasHerramientas().find(function (h) { return h.id === modo; });
        ctxCompartido.setEstado((meta && meta.ayuda) || '');
      }
    },

    deshacer: function () {
      var modActivo = obtenerModuloDeHerramienta(herramientaActual);
      return modActivo && typeof modActivo.deshacer === 'function'
        ? Boolean(modActivo.deshacer(herramientaActual, ctxCompartido))
        : false;
    },

    finalizar: function () {
      var modActivo = obtenerModuloDeHerramienta(herramientaActual);
      return modActivo && typeof modActivo.finalizar === 'function'
        ? Boolean(modActivo.finalizar(herramientaActual, ctxCompartido))
        : false;
    },

    cancelar: function () {
      var modActivo = obtenerModuloDeHerramienta(herramientaActual);
      return modActivo && typeof modActivo.cancelar === 'function'
        ? Boolean(modActivo.cancelar(herramientaActual, ctxCompartido))
        : false;
    },

    recargarTodo: async function (ignorarCache) {
      for (var i = 0; i < modulosRegistrados.length; i++) {
        var mod = modulosRegistrados[i];
        if (typeof mod.recargar === 'function') {
          await mod.recargar(Boolean(ignorarCache), ctxCompartido);
        }
      }
    },

    guardarTodo: async function () {
      if (!gc() || !gc().editEnabled) return;
      var btn = document.getElementById('btn-guardar-grafo');
      if (btn) btn.textContent = 'Guardando...';

      try {
        var resultados = [];
        for (var i = 0; i < modulosRegistrados.length; i++) {
          var mod = modulosRegistrados[i];
          if (typeof mod.guardar === 'function') {
            var res = await mod.guardar(ctxCompartido);
            resultados.push(res || { ok: true });
          }
        }

        var error = resultados.find(function (r) { return r.ok === false; });
        if (error) {
          alert('Error al guardar: ' + (error.mensaje || 'Error desconocido'));
        } else {
          var detalles = resultados
            .map(function (r) { return r.resumen; })
            .filter(Boolean);
          var msg = 'Cambios guardados en MySQL correctamente.';
          if (detalles.length > 0) msg += '\n• ' + detalles.join('\n• ');
          alert(msg);
        }
      } catch (e) {
        alert('Error de red al guardar: ' + e.message);
      } finally {
        if (btn) btn.textContent = '💾 Guardar en BD';
      }
    },

    toggle: async function () {
      if (!gc() || !gc().editEnabled || typeof map === 'undefined') return;
      editorActivo = !editorActivo;

      var btnLateral = document.getElementById('btn-editor-grafo');
      if (btnLateral) btnLateral.style.backgroundColor = editorActivo ? '#16a34a' : '';

      if (editorActivo) {
        if (!panelEditorUI) {
          panelEditorUI = document.createElement('div');
          panelEditorUI.className = 'fiad-editor-panel';
          panelEditorUI.innerHTML =
            '<div id="fiad-editor-tools-container" class="fiad-editor-tools"></div>' +
            '<div class="fiad-editor-footer">' +
              '<span id="estado-editor-grafo">⏳ Iniciando editor...</span>' +
              '<div class="fiad-editor-actions">' +
                '<button type="button" id="btn-deshacer-punto" class="fiad-editor-btn" style="display:none;background:#64748b;" onclick="window.EditorMapa.deshacer()">↩️ Deshacer punto</button>' +
                '<button type="button" id="btn-finalizar-trazo" class="fiad-editor-btn" style="display:none;background:#0284c7;font-weight:bold;" onclick="window.EditorMapa.finalizar()">✔ Terminar trazo</button>' +
                '<button type="button" id="btn-recargar-zona" class="fiad-editor-btn" style="background:#475569;" onclick="window.EditorMapa.recargarTodo(true)">🔄 Recargar zona</button>' +
                '<button type="button" id="btn-guardar-grafo" class="fiad-editor-btn" style="background:#16a34a;font-weight:bold;" onclick="window.EditorMapa.guardarTodo()">💾 Guardar en BD</button>' +
                '<button type="button" id="btn-cerrar-editor" class="fiad-editor-btn" style="background:#dc2626;" onclick="window.EditorMapa.toggle()">✖ Salir</button>' +
              '</div>' +
            '</div>';
          document.body.appendChild(panelEditorUI);
        }

        renderizarBarraHerramientas();
        map.on('mousemove', onMapMouseMove);
        map.on('click', onMapClick);
        map.on('dblclick', onMapDblClick);

        for (var i = 0; i < modulosRegistrados.length; i++) {
          if (typeof modulosRegistrados[i].alActivarEditor === 'function') {
            await modulosRegistrados[i].alActivarEditor(ctxCompartido);
          }
        }

        window.EditorMapa.seleccionarHerramienta('navegar', true);
      } else {
        modulosRegistrados.forEach(function (mod) {
          if (typeof mod.alDesactivarEditor === 'function') {
            mod.alDesactivarEditor(ctxCompartido);
          }
        });

        map.off('mousemove', onMapMouseMove);
        map.off('click', onMapClick);
        map.off('dblclick', onMapDblClick);
        map.getContainer().style.cursor = '';
        map.doubleClickZoom.enable();

        if (panelEditorUI) {
          panelEditorUI.remove();
          panelEditorUI = null;
        }
      }
    }
  };

  // Alias de compatibilidad
  window.toggleEditorGrafo = function () {
    return window.EditorMapa.toggle();
  };

  // Procesar módulos que se hayan registrado antes de cargar este script
  if (Array.isArray(window._editorModulosPendientes)) {
    window._editorModulosPendientes.forEach(function (m) {
      window.EditorMapa.registrarModulo(m);
    });
    window._editorModulosPendientes = [];
  }

  document.addEventListener('keydown', function (e) {
    if (!gc() || !gc().editEnabled) return;
    if (e.ctrlKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      window.EditorMapa.toggle();
    } else if (editorActivo && e.ctrlKey && e.key.toLowerCase() === 'z') {
      if (window.EditorMapa.deshacer()) e.preventDefault();
    } else if (editorActivo && e.key === 'Enter') {
      if (window.EditorMapa.finalizar()) e.preventDefault();
    } else if (editorActivo && e.key === 'Escape') {
      if (window.EditorMapa.cancelar()) e.preventDefault();
    }
  });

  // ===========================================================================
  // Módulo Registrable del Grafo Peatonal (Caminos, Rampas, Escaleras, Cortes)
  // ===========================================================================
  var herramientasGrafo = ['rampa', 'normal', 'escalera', 'cortar', 'escalon', 'corte_punto'];
  var puntosTrazoActual = [];
  var ultimaGeoOSM = null;
  var herramientaGrafoActual = 'navegar';
  var ctxGrafo = null;

  var capaEditorOSM = null;
  var capaEditorCustom = null;
  var capaVerticesCustom = null;
  var capaPreviewTrazo = null;
  var marcadorIman = null;
  var polylinesPorFeatureId = {};

  var COLORES_TIPO = {
    normal: '#2563eb',
    rampa: '#16a34a',
    escalera: '#ea580c',
    cortar: '#dc2626',
    escalon: '#f59e0b',
    corte_punto: '#b91c1c',
    calle_interna: '#64748b',
    carretera: '#94a3b8'
  };

  function esHerramientaDeGrafo(id) {
    return herramientasGrafo.indexOf(id) !== -1;
  }

  function estiloArista(props) {
    var tipo = (gc() && typeof gc().clasificarViaOSM === 'function')
      ? gc().clasificarViaOSM(props)
      : (props.cerrado ? 'cortar' : (props.tipo || 'normal'));

    if (tipo === 'cortar') return { color: '#dc2626', weight: 7, dashArray: '8, 8', opacity: 0.95 };
    if (tipo === 'rampa') return { color: '#16a34a', weight: 6, opacity: 0.95 };
    if (tipo === 'escalera') return { color: '#ea580c', weight: 6, opacity: 0.95 };
    if (tipo === 'carretera') return { color: '#94a3b8', weight: 2.5, dashArray: '3, 7', opacity: 0.55 };
    if (tipo === 'calle_interna') return { color: '#64748b', weight: 3, dashArray: '6, 6', opacity: 0.70 };
    return { color: '#2563eb', weight: 4, opacity: 0.75 };
  }

  function obtenerPuntoConIman(latlng, excludeFeatureId) {
    if (typeof map === 'undefined') return { coord: [latlng.lng, latlng.lat], imantado: false };
    var cursorPt = map.latLngToContainerPoint(latlng);
    var mejorDistPx = 16;
    var mejorLngLat = null;

    var todasLineas = [];
    if (ultimaGeoOSM && ultimaGeoOSM.features) {
      ultimaGeoOSM.features.forEach(function (f) {
        if (f.geometry && f.geometry.type === 'LineString') todasLineas.push(f.geometry.coordinates);
      });
    }
    (gc().ediciones.tramos_nuevos.features || []).forEach(function (f) {
      if (excludeFeatureId && f.properties && f.properties.id === excludeFeatureId) return;
      if (f.geometry && f.geometry.type === 'LineString') todasLineas.push(f.geometry.coordinates);
    });

    for (var i = 0; i < todasLineas.length; i++) {
      var coords = todasLineas[i];
      for (var j = 0; j < coords.length; j++) {
        var vPt = map.latLngToContainerPoint([coords[j][1], coords[j][0]]);
        var distV = cursorPt.distanceTo(vPt);
        if (distV < mejorDistPx * 0.9) {
          mejorDistPx = distV;
          mejorLngLat = [coords[j][0], coords[j][1]];
        }
        if (j < coords.length - 1) {
          var aPt = map.latLngToContainerPoint([coords[j][1], coords[j][0]]);
          var bPt = map.latLngToContainerPoint([coords[j + 1][1], coords[j + 1][0]]);
          var dx = bPt.x - aPt.x, dy = bPt.y - aPt.y;
          var lenSq = dx * dx + dy * dy;
          var t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((cursorPt.x - aPt.x) * dx + (cursorPt.y - aPt.y) * dy) / lenSq));
          var distSeg = cursorPt.distanceTo(L.point(aPt.x + t * dx, aPt.y + t * dy));
          if (distSeg < mejorDistPx) {
            mejorDistPx = distSeg;
            mejorLngLat = [coords[j][0] + t * (coords[j + 1][0] - coords[j][0]), coords[j][1] + t * (coords[j + 1][1] - coords[j][1])];
          }
        }
      }
    }

    return mejorLngLat ? { coord: mejorLngLat, imantado: true } : { coord: [latlng.lng, latlng.lat], imantado: false };
  }

  function actualizarAccionesTrazoGrafo() {
    if (!ctxGrafo || !esHerramientaDeGrafo(herramientaGrafoActual)) return;
    ctxGrafo.setAccionesTrazo({
      mostrarDeshacer: puntosTrazoActual.length >= 1,
      mostrarFinalizar: puntosTrazoActual.length >= 2,
      textoFinalizar: '✔ Terminar trazo'
    });
  }

  function limpiarTrazoEnCurso() {
    puntosTrazoActual = [];
    if (capaPreviewTrazo && typeof map !== 'undefined') {
      map.removeLayer(capaPreviewTrazo);
      capaPreviewTrazo = null;
    }
    actualizarAccionesTrazoGrafo();
  }

  function actualizarPreviewTrazo(cursorCoord) {
    if (!editorActivo || typeof map === 'undefined') return;
    if (capaPreviewTrazo) {
      map.removeLayer(capaPreviewTrazo);
      capaPreviewTrazo = null;
    }
    if (puntosTrazoActual.length === 0) return;

    var latlngs = puntosTrazoActual.map(function (c) { return [c[1], c[0]]; });
    if (cursorCoord) latlngs.push([cursorCoord[1], cursorCoord[0]]);

    var color = COLORES_TIPO[herramientaGrafoActual] || '#2563eb';
    capaPreviewTrazo = L.layerGroup().addTo(map);

    L.polyline(latlngs, {
      color: color,
      weight: 6,
      dashArray: herramientaGrafoActual === 'cortar' ? '8, 8' : '5, 5',
      opacity: 0.9,
      interactive: false
    }).addTo(capaPreviewTrazo);

    puntosTrazoActual.forEach(function (pt, idx) {
      L.circleMarker([pt[1], pt[0]], {
        radius: idx === 0 ? 6 : 5,
        color: '#ffffff',
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
        interactive: false
      }).addTo(capaPreviewTrazo);
    });
  }

  function dibujarHandlesVertices(featuresOrdenadas) {
    if (capaVerticesCustom) {
      map.removeLayer(capaVerticesCustom);
      capaVerticesCustom = null;
    }
    if (!editorActivo || herramientaGrafoActual !== 'navegar' || typeof map === 'undefined') return;

    capaVerticesCustom = L.layerGroup().addTo(map);

    featuresOrdenadas.forEach(function (feature) {
      if (!feature.geometry || feature.geometry.type !== 'LineString') return;
      var coords = feature.geometry.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return;

      var p = feature.properties || {};
      var featureId = p.id;
      var tipo = p.cerrado ? 'cortar' : (p.tipo || 'normal');
      var color = COLORES_TIPO[tipo] || '#2563eb';

      for (var m = 0; m < coords.length - 1; m++) {
        (function (segIdx) {
          var c1 = coords[segIdx], c2 = coords[segIdx + 1];
          if (map.latLngToContainerPoint([c1[1], c1[0]]).distanceTo(map.latLngToContainerPoint([c2[1], c2[0]])) < 26) return;

          var midCoord = [(c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2];
          var midMarker = L.marker([midCoord[1], midCoord[0]], {
            draggable: true,
            icon: L.divIcon({
              className: 'grafo-midpoint-handle',
              iconSize: [10, 10],
              iconAnchor: [5, 5],
              html: '<div style="width:10px;height:10px;border-radius:50%;background:#fff;border:2px solid ' + color + ';opacity:0.75;cursor:pointer;box-sizing:border-box;"></div>'
            }),
            zIndexOffset: 900
          }).addTo(capaVerticesCustom);

          var insertado = false;
          midMarker.on('dragstart', function () {
            if (!insertado) { coords.splice(segIdx + 1, 0, midCoord.slice()); insertado = true; }
          });
          midMarker.on('drag', function (ev) {
            var snap = obtenerPuntoConIman(ev.target.getLatLng(), featureId);
            coords[segIdx + 1] = snap.coord;
            ev.target.setLatLng([snap.coord[1], snap.coord[0]]);
            if (polylinesPorFeatureId[featureId]) polylinesPorFeatureId[featureId].setLatLngs(coords.map(function (c) { return [c[1], c[0]]; }));
          });
          midMarker.on('dragend', function () {
            dibujarCapaPersonalizada();
            if (typeof updateRoute === 'function') updateRoute();
          });
        })(m);
      }

      coords.forEach(function (coord, vIdx) {
        var esExtremo = (vIdx === 0 || vIdx === coords.length - 1);
        var size = esExtremo ? 14 : 12;
        var bg = esExtremo ? color : '#ffffff';
        var border = esExtremo ? '#ffffff' : color;

        var marker = L.marker([coord[1], coord[0]], {
          draggable: true,
          icon: L.divIcon({
            className: 'grafo-vertice-handle',
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
            html: '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:' + bg + ';border:2.5px solid ' + border + ';box-shadow:0 1px 4px rgba(0,0,0,0.75);cursor:grab;box-sizing:border-box;"></div>'
          }),
          zIndexOffset: 1000
        }).addTo(capaVerticesCustom);

        marker.on('drag', function (ev) {
          var snap = obtenerPuntoConIman(ev.target.getLatLng(), featureId);
          coords[vIdx] = snap.coord;
          ev.target.setLatLng([snap.coord[1], snap.coord[0]]);
          if (polylinesPorFeatureId[featureId]) polylinesPorFeatureId[featureId].setLatLngs(coords.map(function (c) { return [c[1], c[0]]; }));
        });
        marker.on('dragend', function () {
          dibujarCapaPersonalizada();
          if (typeof updateRoute === 'function') updateRoute();
        });
        marker.on('click', function (ev) {
          L.DomEvent.stopPropagation(ev);
          var popupHtml =
            '<div class="fiad-editor-popup">' +
              '<strong>Vértice #' + (vIdx + 1) + '</strong>' +
              (coords.length > 2
                ? '<button class="fiad-editor-popup-btn" style="background:#f59e0b;color:#0f172a;" onclick="window._GrafoEditor._eliminarVertice(\'' + featureId + '\',' + vIdx + ')">✂️ Eliminar vértice</button>'
                : '') +
              '<button class="fiad-editor-popup-btn" style="background:#dc2626;" onclick="window._GrafoEditor._eliminarFeature(\'' + featureId + '\')">🗑️ Eliminar tramo</button>' +
            '</div>';
          L.popup().setLatLng([coords[vIdx][1], coords[vIdx][0]]).setContent(popupHtml).openOn(map);
        });
      });
    });
  }

  function dibujarCapaPersonalizada() {
    if (!editorActivo || typeof map === 'undefined') return;
    if (capaEditorCustom) map.removeLayer(capaEditorCustom);
    polylinesPorFeatureId = {};

    var esModoSeleccionar = (herramientaGrafoActual === 'navegar');
    var prioMap = gc().PRIORIDAD_TRAMO;

    var featuresOrdenadas = (gc().ediciones.tramos_nuevos.features || []).slice().sort(function (a, b) {
      var pA = a.geometry && a.geometry.type === 'Point' ? 10 : (prioMap[(a.properties && a.properties.tipo) || 'normal'] || 0);
      var pB = b.geometry && b.geometry.type === 'Point' ? 10 : (prioMap[(b.properties && b.properties.tipo) || 'normal'] || 0);
      return pA - pB;
    });

    capaEditorCustom = L.geoJSON({ type: 'FeatureCollection', features: featuresOrdenadas }, {
      interactive: esModoSeleccionar,
      style: function (f) { return estiloArista(f.properties || {}); },
      pointToLayer: function (f, latlng) {
        var esEscalon = f.properties && f.properties.tipo === 'escalon';
        return L.circleMarker(latlng, {
          radius: 7,
          color: '#ffffff',
          weight: 2,
          fillColor: esEscalon ? '#f59e0b' : '#b91c1c',
          fillOpacity: 1,
          interactive: esModoSeleccionar
        });
      },
      onEachFeature: function (f, layer) {
        if (f.properties && f.properties.id && f.geometry && f.geometry.type === 'LineString') {
          polylinesPorFeatureId[f.properties.id] = layer;
        }
        if (esModoSeleccionar) {
          layer.on('click', function (ev) {
            L.DomEvent.stopPropagation(ev);
            var p = f.properties || {};
            var html = '<div class="fiad-editor-popup">';
            if (f.geometry.type === 'Point') {
              html += '<strong>' + (p.tipo === 'escalon' ? '🪜 Escalón aislado' : '⛔ Corte puntual') + '</strong>' +
                '<button class="fiad-editor-popup-btn" style="background:#dc2626;" onclick="window._GrafoEditor._eliminarFeature(\'' + p.id + '\')">🗑️ Eliminar punto</button>';
            } else {
              html += '<strong>Tramo: ' + escaparHTML((p.tipo || 'normal').toUpperCase()) + '</strong>' +
                '<div class="fiad-editor-grid-2">' +
                  '<button onclick="window._GrafoEditor._cambiarTipo(\'' + p.id + '\',\'rampa\')" style="padding:4px;cursor:pointer;background:#dcfce7;border:1px solid #16a34a;">♿ Rampa</button>' +
                  '<button onclick="window._GrafoEditor._cambiarTipo(\'' + p.id + '\',\'normal\')" style="padding:4px;cursor:pointer;">🚶 Normal</button>' +
                  '<button onclick="window._GrafoEditor._cambiarTipo(\'' + p.id + '\',\'escalera\')" style="padding:4px;cursor:pointer;background:#ffedd5;border:1px solid #ea580c;">🪜 Escalera</button>' +
                  '<button onclick="window._GrafoEditor._cambiarTipo(\'' + p.id + '\',\'cortar\')" style="padding:4px;cursor:pointer;background:#fee2e2;border:1px solid #dc2626;">🚫 Cortado</button>' +
                '</div>' +
                '<button class="fiad-editor-popup-btn" style="background:#991b1b;" onclick="window._GrafoEditor._eliminarFeature(\'' + p.id + '\')">🗑️ Eliminar tramo</button>';
            }
            html += '</div>';
            L.popup().setLatLng(ev.latlng).setContent(html).openOn(map);
          });
        }
      }
    }).addTo(map);

    dibujarHandlesVertices(featuresOrdenadas);
  }

  async function cargarCapasGrafo(ignorarCache) {
    await gc().cargarEdicionesBD();
    dibujarCapaPersonalizada();
    if (ctxGrafo) ctxGrafo.setEstado('⏳ Cargando red peatonal...');

    try {
      var b = map.getBounds();
      var baseOSM = await gc().obtenerRedOSM(b.getSouth(), b.getWest(), b.getNorth(), b.getEast(), Boolean(ignorarCache));
      ultimaGeoOSM = baseOSM;
      var overrides = gc().ediciones.overrides || {};

      if (capaEditorOSM) map.removeLayer(capaEditorOSM);
      capaEditorOSM = L.geoJSON(baseOSM, {
        interactive: true,
        style: function (f) {
          return estiloArista(Object.assign({}, f.properties || {}, overrides[f.id] || {}));
        },
        onEachFeature: function (f, layer) {
          if (overrides[f.id]) {
            layer.on('click', function (ev) {
              if (herramientaGrafoActual !== 'navegar') return;
              L.DomEvent.stopPropagation(ev);
              L.popup()
                .setLatLng(ev.latlng)
                .setContent('<div class="fiad-editor-popup"><strong>Vía OSM con override</strong><button class="fiad-editor-popup-btn" style="background:#475569;" onclick="window._GrafoEditor._restaurarOSM(\'' + f.id + '\')">↩️ Restaurar original</button></div>')
                .openOn(map);
            });
          }
        }
      }).addTo(map);

      if (capaEditorCustom) capaEditorCustom.bringToFront();
      dibujarHandlesVertices(gc().ediciones.tramos_nuevos.features || []);
      if (ctxGrafo) ctxGrafo.setEstado('✅ <strong>Grafo listo</strong> (' + baseOSM.features.length + ' vías) — Arrastra vértices, POIs o pines <strong>🎯</strong>.');
    } catch (err) {
      if (ctxGrafo) ctxGrafo.setEstado('⚠️ Overpass ocupado — espera unos segundos y presiona <strong>Recargar zona</strong>');
    }
  }

  window._GrafoEditor = {
    _cambiarTipo: function (id, nuevoTipo) {
      var f = (gc().ediciones.tramos_nuevos.features || []).find(function (item) { return item.properties && item.properties.id === id; });
      if (f) {
        f.properties.tipo = nuevoTipo;
        f.properties.accesible = (nuevoTipo === 'normal' || nuevoTipo === 'rampa');
        f.properties.cerrado = (nuevoTipo === 'cortar');
      }
      map.closePopup();
      dibujarCapaPersonalizada();
      if (typeof updateRoute === 'function') updateRoute();
    },
    _eliminarFeature: function (id) {
      gc().ediciones.tramos_nuevos.features = (gc().ediciones.tramos_nuevos.features || []).filter(function (f) {
        return !(f.properties && f.properties.id === id);
      });
      map.closePopup();
      dibujarCapaPersonalizada();
      if (typeof updateRoute === 'function') updateRoute();
    },
    _eliminarVertice: function (id, vIdx) {
      var f = (gc().ediciones.tramos_nuevos.features || []).find(function (item) { return item.properties && item.properties.id === id; });
      if (f && f.geometry && f.geometry.coordinates.length > 2) f.geometry.coordinates.splice(vIdx, 1);
      map.closePopup();
      dibujarCapaPersonalizada();
      if (typeof updateRoute === 'function') updateRoute();
    },
    _restaurarOSM: function (osmId) {
      if (gc().ediciones.overrides && gc().ediciones.overrides[osmId]) delete gc().ediciones.overrides[osmId];
      map.closePopup();
      cargarCapasGrafo(false);
      if (typeof updateRoute === 'function') updateRoute();
    }
  };

  var moduloGrafo = {
    id: 'grafo',
    orden: 10,
    herramientas: [
      { id: 'rampa', label: '♿ Rampa', color: '#16a34a', ayuda: '♿ <strong>Rampa / Accesible:</strong> Traza punto a punto sobre el mapa o vértices (doble clic para terminar).' },
      { id: 'normal', label: '🚶 Camino Normal', color: '#2563eb', ayuda: '🚶 <strong>Camino Normal:</strong> Traza andadores o pasos peatonales (doble clic para terminar).' },
      { id: 'escalera', label: '🪜 Escalera (Tramo)', color: '#ea580c', ayuda: '🪜 <strong>Tramo de Escaleras:</strong> Marca de Punto A a Punto B dónde están las escaleras.' },
      { id: 'cortar', label: '🚫 Cortar Tramo', color: '#dc2626', ayuda: '🚫 <strong>Cortar Tramo (A → B):</strong> Marca los extremos del segmento exacto a bloquear.' },
      { id: 'escalon', label: '📍 Escalón solo', color: '#d97706', ayuda: '📍 <strong>Escalón aislado:</strong> Haz 1 clic sobre el camino donde hay un escalón sin rampa.' },
      { id: 'corte_punto', label: '⛔ Cortar Punto', color: '#991b1b', ayuda: '⛔ <strong>Corte puntual:</strong> Haz 1 clic sobre el camino para bloquear el paso en ese punto.' }
    ],
    alActivarEditor: async function (ctx) {
      ctxGrafo = ctx;
      await cargarCapasGrafo(false);
    },
    alDesactivarEditor: function () {
      ctxGrafo = null;
      limpiarTrazoEnCurso();
      if (marcadorIman) { map.removeLayer(marcadorIman); marcadorIman = null; }
      if (capaVerticesCustom) { map.removeLayer(capaVerticesCustom); capaVerticesCustom = null; }
      if (capaEditorOSM) { map.removeLayer(capaEditorOSM); capaEditorOSM = null; }
      if (capaEditorCustom) { map.removeLayer(capaEditorCustom); capaEditorCustom = null; }
    },
    alCambiarHerramienta: function (herramientaId) {
      herramientaGrafoActual = herramientaId;
      limpiarTrazoEnCurso();
      if (marcadorIman) { map.removeLayer(marcadorIman); marcadorIman = null; }
      dibujarCapaPersonalizada();
    },
    onMouseMove: function (e, herramientaId) {
      if (!esHerramientaDeGrafo(herramientaId)) return;
      var snap = obtenerPuntoConIman(e.latlng, null);
      if (!marcadorIman) {
        marcadorIman = L.circleMarker([snap.coord[1], snap.coord[0]], {
          radius: 6,
          color: snap.imantado ? '#06b6d4' : '#94a3b8',
          weight: 2,
          fillColor: '#ffffff',
          fillOpacity: 0.9,
          interactive: false
        }).addTo(map);
      } else {
        marcadorIman.setLatLng([snap.coord[1], snap.coord[0]]);
        marcadorIman.setStyle({ color: snap.imantado ? '#06b6d4' : '#94a3b8' });
      }
      if (puntosTrazoActual.length > 0) actualizarPreviewTrazo(snap.coord);
    },
    onClick: function (e, herramientaId) {
      if (!esHerramientaDeGrafo(herramientaId)) return;
      var coord = obtenerPuntoConIman(e.latlng, null).coord;

      if (herramientaId === 'escalon' || herramientaId === 'corte_punto') {
        gc().ediciones.tramos_nuevos.features.push({
          type: 'Feature',
          properties: { id: 'pt_' + Date.now(), tipo: herramientaId },
          geometry: { type: 'Point', coordinates: coord }
        });
        dibujarCapaPersonalizada();
        if (typeof updateRoute === 'function') updateRoute();
        return;
      }

      if (puntosTrazoActual.length > 0) {
        var previo = puntosTrazoActual[puntosTrazoActual.length - 1];
        if (gc().geom.distanciaMetros(previo, coord) < 0.25) return;
      }
      puntosTrazoActual.push(coord);
      actualizarPreviewTrazo(coord);
      actualizarAccionesTrazoGrafo();
    },
    onDblClick: function (e, herramientaId) {
      if (esHerramientaDeGrafo(herramientaId) && puntosTrazoActual.length >= 2) {
        L.DomEvent.stopPropagation(e);
        this.finalizar(herramientaId);
      }
    },
    deshacer: function (herramientaId) {
      if (!esHerramientaDeGrafo(herramientaId) || puntosTrazoActual.length === 0) return false;
      puntosTrazoActual.pop();
      if (puntosTrazoActual.length === 0) limpiarTrazoEnCurso();
      else {
        actualizarPreviewTrazo(null);
        actualizarAccionesTrazoGrafo();
      }
      return true;
    },
    finalizar: function (herramientaId) {
      if (!esHerramientaDeGrafo(herramientaId)) return false;
      if (puntosTrazoActual.length < 2) {
        limpiarTrazoEnCurso();
        return true;
      }
      gc().ediciones.tramos_nuevos.features.push({
        type: 'Feature',
        properties: {
          id: 'seg_' + Date.now(),
          tipo: herramientaId,
          accesible: herramientaId === 'normal' || herramientaId === 'rampa',
          cerrado: herramientaId === 'cortar'
        },
        geometry: { type: 'LineString', coordinates: puntosTrazoActual.slice() }
      });
      limpiarTrazoEnCurso();
      dibujarCapaPersonalizada();
      if (typeof updateRoute === 'function') updateRoute();
      return true;
    },
    cancelar: function (herramientaId) {
      if (!esHerramientaDeGrafo(herramientaId) || puntosTrazoActual.length === 0) return false;
      limpiarTrazoEnCurso();
      return true;
    },
    recargar: async function (ignorarCache) {
      await cargarCapasGrafo(ignorarCache);
    },
    guardar: async function () {
      var res = await gc().guardarEdicionesBD();
      return {
        ok: Boolean(res.ok),
        mensaje: res.mensaje,
        resumen: res.ok ? 'Red peatonal actualizada' : ''
      };
    }
  };

  window.EditorMapa.registrarModulo(moduloGrafo);

  document.addEventListener('grafo:edicionesCargadas', inyectarBotonEditorLateral);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inyectarBotonEditorLateral);
  } else {
    inyectarBotonEditorLateral();
  }
})();