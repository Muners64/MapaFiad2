/**
 * Módulo autónomo de Puntos de Interés (POIs) + Plugin para EditorMapa
 */
(function () {
  var _basePath = window.location.pathname.replace(/\/[^\/]*$/, '');
  var API_POI_URL = window.location.origin + _basePath + '/api/puntos_interes.php';

  var listaPOIs = [];
  var marcadoresPorId = {};
  var cargados = false;
  var hayCambiosPendientes = false;
  var capaPOIsMapa = null;
  var enModoEdicion = false;
  var arrastrableEnEditor = false;
  var ctxEditor = null;

  var SVG_BANOS =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<circle cx="7" cy="4.5" r="2"/>' +
      '<path d="M4.5 8.5A1.5 1.5 0 0 1 6 7h2a1.5 1.5 0 0 1 1.5 1.5V14H8.2v6H5.8v-6H4.5V8.5z"/>' +
      '<circle cx="17" cy="4.5" r="2"/>' +
      '<path d="M15.2 7h3.6c.65 0 1.22.42 1.42 1.04L21.5 13h-2.3v7h-4.4v-7h-2.3l1.28-4.96A1.5 1.5 0 0 1 15.2 7z"/>' +
    '</svg>';

  var SVG_FLECHA_RUTA =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;">' +
      '<polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>' +
    '</svg>';

  var CATALOGO = {
    banos: { id: 'banos', label: 'Baños', color: '#0891b2', svg: SVG_BANOS, default: true },
    biblioteca: { id: 'biblioteca', label: 'Biblioteca', color: '#6d28d9', icon: 'book', default: true },
    canchas: { id: 'canchas', label: 'Canchas deportivas', color: '#ea580c', icon: 'basketball', default: true },
    estacionamiento: { id: 'estacionamiento', label: 'Estacionamientos', color: '#1d4ed8', icon: 'car', default: true },
    cafeteria: { id: 'cafeteria', label: 'Cafetería', color: '#92400e', icon: 'cafe', default: true },
    tienda: { id: 'tienda', label: 'Tienda', color: '#be185d', icon: 'storefront', default: true }
  };

  function escaparHTML(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function obtenerOpcionesPopup(esEditor) {
    var esMovil = window.innerWidth <= 768;
    var anchoDisp = Math.max(190, window.innerWidth - 96);
    var maxW = esEditor
      ? (esMovil ? Math.min(265, anchoDisp) : 290)
      : (esMovil ? Math.min(250, anchoDisp) : 280);

    return {
      maxWidth: maxW,
      minWidth: 180,
      autoPan: true,
      keepInView: false,
      autoPanPaddingTopLeft: L.point(14, esMovil ? 130 : 84),
      autoPanPaddingBottomRight: L.point(esMovil ? 78 : 82, 24)
    };
  }

  function renderizarIconoHTML(meta, sizePx) {
    var sz = sizePx || 16;
    if (meta && meta.svg) {
      return meta.svg.replace('<svg ', '<svg width="' + sz + '" height="' + sz + '" style="display:block;flex-shrink:0;" ');
    }
    var iconName = (meta && meta.icon) ? meta.icon : 'location';
    return '<ion-icon name="' + iconName + '" style="font-size:' + sz + 'px;"></ion-icon>';
  }

  function crearIconoPOI(categoria) {
    var meta = CATALOGO[categoria] || { color: '#2563eb', icon: 'location' };
    return L.divIcon({
      className: 'fiad-poi-marker',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -15],
      html: '<div class="fiad-poi-pin" style="background:' + meta.color + ';">' + renderizarIconoHTML(meta, 16) + '</div>'
    });
  }

  function construirPopupPublico(poi, meta) {
    var nombreRaw = (poi.nombre || '').trim();
    var descRaw = (poi.descripcion || '').trim();
    var tieneNombrePropio = nombreRaw !== '' && nombreRaw.toLowerCase() !== meta.label.toLowerCase();

    var html = '<div class="fiad-poi-popup-card" style="font-family:\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:12.5px;">';

    if (tieneNombrePropio) {
      html +=
        '<div style="padding-right:22px;">' +
          '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:' + meta.color + ';color:#fff;font-size:11px;font-weight:700;">' +
            renderizarIconoHTML(meta, 13) + ' ' + escaparHTML(meta.label) +
          '</span>' +
          '<div style="font-weight:700;font-size:13.5px;margin-top:5px;color:#1a1a1a;line-height:1.25;">' + escaparHTML(nombreRaw) + '</div>' +
        '</div>';
    } else {
      html +=
        '<div style="display:flex;align-items:center;gap:6px;padding-right:22px;font-weight:700;font-size:13.5px;color:#1a1a1a;line-height:1.25;">' +
          '<span style="width:22px;height:22px;border-radius:50%;background:' + meta.color + ';color:#fff;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">' +
            renderizarIconoHTML(meta, 13) +
          '</span>' +
          '<span>' + escaparHTML(meta.label) + '</span>' +
        '</div>';
    }

    if (descRaw !== '') {
      html += '<p style="margin:6px 0 0 0;color:#666666;line-height:1.38;word-break:break-word;">' + escaparHTML(descRaw) + '</p>';
    }

    html +=
      '<button type="button" onclick="window.irAPuntoInteres(' + poi.lat + ',' + poi.lng + ')" ' +
        'style="margin-top:9px;width:100%;padding:8px 12px;border-radius:10px;background:#2da832;color:#fff;font-weight:700;font-size:13px;border:none;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 2px 8px rgba(45,168,50,0.25);">' +
        SVG_FLECHA_RUTA +
        '<span>Cómo llegar</span>' +
      '</button>' +
    '</div>';

    return html;
  }

  function construirOpcionesCategoriaHTML(seleccionada) {
    return Object.keys(CATALOGO).map(function (k) {
      var sel = (k === seleccionada) ? ' selected' : '';
      return '<option value="' + k + '"' + sel + '>' + escaparHTML(CATALOGO[k].label) + '</option>';
    }).join('');
  }

  function abrirFormularioNuevoPOI(latlng) {
    var html =
      '<div class="fiad-editor-popup">' +
        '<strong>Nuevo Punto de Interés</strong>' +
        '<label>Categoría' +
          '<select id="fiad-nuevo-poi-cat">' + construirOpcionesCategoriaHTML('banos') + '</select>' +
        '</label>' +
        '<label>Nombre propio (opcional)' +
          '<input id="fiad-nuevo-poi-nombre" type="text" placeholder="Ej. Baños Edificio 40">' +
        '</label>' +
        '<label>Información (opcional)' +
          '<textarea id="fiad-nuevo-poi-desc" rows="2" placeholder="Ej. Planta baja, ala norte"></textarea>' +
        '</label>' +
        '<button type="button" class="fiad-editor-popup-btn is-primary" onclick="window.PuntosInteresCampus._crearDesdePopup(' + latlng.lat + ',' + latlng.lng + ')">Agregar punto</button>' +
      '</div>';

    L.popup(obtenerOpcionesPopup(true)).setLatLng(latlng).setContent(html).openOn(map);
  }

  function abrirFormularioEditarPOI(poi) {
    var metaActual = CATALOGO[poi.categoria] || { label: '' };
    var nombreVal = (poi.nombre && poi.nombre.trim().toLowerCase() !== metaActual.label.toLowerCase())
      ? poi.nombre.trim()
      : '';

    var html =
      '<div class="fiad-editor-popup">' +
        '<strong>Editar Punto de Interés</strong>' +
        '<label>Categoría' +
          '<select id="fiad-edit-poi-cat">' + construirOpcionesCategoriaHTML(poi.categoria) + '</select>' +
        '</label>' +
        '<label>Nombre propio (opcional)' +
          '<input id="fiad-edit-poi-nombre" type="text" value="' + escaparHTML(nombreVal) + '" placeholder="Vacío = solo nombre de categoría">' +
        '</label>' +
        '<label>Información (opcional)' +
          '<textarea id="fiad-edit-poi-desc" rows="2" placeholder="Ej. Planta baja, ala norte">' + escaparHTML(poi.descripcion || '') + '</textarea>' +
        '</label>' +
        '<div class="fiad-editor-grid-2">' +
          '<label>Latitud' +
            '<input id="fiad-edit-poi-lat" type="number" step="0.00000001" value="' + poi.lat + '">' +
          '</label>' +
          '<label>Longitud' +
            '<input id="fiad-edit-poi-lng" type="number" step="0.00000001" value="' + poi.lng + '">' +
          '</label>' +
        '</div>' +
        '<button type="button" class="fiad-editor-popup-btn is-primary" onclick="window.PuntosInteresCampus._actualizarDesdePopup(\'' + escaparHTML(poi.id) + '\')">Aplicar cambios</button>' +
        '<button type="button" class="fiad-editor-popup-btn is-danger" onclick="window.PuntosInteresCampus._eliminarDesdePopup(\'' + escaparHTML(poi.id) + '\')">Eliminar punto</button>' +
      '</div>';

    L.popup(obtenerOpcionesPopup(true)).setLatLng([poi.lat, poi.lng]).setContent(html).openOn(map);
  }

  function renderizar() {
    if (typeof map === 'undefined') return;

    if (capaPOIsMapa) {
      map.removeLayer(capaPOIsMapa);
      capaPOIsMapa = null;
    }
    marcadoresPorId = {};

    if (listaPOIs.length === 0) return;

    var configVisibilidad = window.fiadPOIConfig || {};
    capaPOIsMapa = L.layerGroup().addTo(map);

    listaPOIs.forEach(function (poi) {
      if (!poi || typeof poi.lat !== 'number' || typeof poi.lng !== 'number') return;

      var cat = poi.categoria || 'banos';
      if (!enModoEdicion && configVisibilidad[cat] === false) return;

      var meta = CATALOGO[cat] || { label: cat, color: '#2563eb', icon: 'location' };
      var esArrastrable = Boolean(enModoEdicion && arrastrableEnEditor);

      var marker = L.marker([poi.lat, poi.lng], {
        icon: crearIconoPOI(cat),
        draggable: esArrastrable,
        zIndexOffset: enModoEdicion ? 900 : 750
      }).addTo(capaPOIsMapa);

      if (poi.id) {
        marcadoresPorId[String(poi.id)] = marker;
      }

      if (esArrastrable) {
        marker.on('dragend', function (ev) {
          var ll = ev.target.getLatLng();
          poi.lat = Number(ll.lat.toFixed(8));
          poi.lng = Number(ll.lng.toFixed(8));
          hayCambiosPendientes = true;
          if (ctxEditor) {
            var etiqueta = (poi.nombre && poi.nombre.trim()) ? poi.nombre.trim() : meta.label;
            ctxEditor.setEstado('<strong>' + escaparHTML(etiqueta) + '</strong> movido a (' + poi.lat + ', ' + poi.lng + ') — presiona <strong>Guardar en BD</strong>.');
          }
        });
      }

      marker.on('click', function (ev) {
        L.DomEvent.stopPropagation(ev);
        if (enModoEdicion && arrastrableEnEditor) {
          abrirFormularioEditarPOI(poi);
          return;
        }
        L.popup(obtenerOpcionesPopup(false))
          .setLatLng([poi.lat, poi.lng])
          .setContent(construirPopupPublico(poi, meta))
          .openOn(map);
      });
    });
  }

  async function cargarDesdeBD(forzar) {
    if (cargados && !forzar) return listaPOIs;
    try {
      var res = await fetch(API_POI_URL + (forzar ? ('?_t=' + Date.now()) : ''));
      if (res.ok) {
        var data = await res.json();
        listaPOIs = Array.isArray(data.puntos_interes) ? data.puntos_interes : [];
        cargados = true;
        hayCambiosPendientes = false;
        renderizar();
      }
    } catch (e) {
      console.warn('[PuntosInteresCampus] Error cargando POIs:', e);
    }
    return listaPOIs;
  }

  async function guardarEnBD() {
    var res = await fetch(API_POI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ puntos_interes: listaPOIs })
    });
    var data = await res.json();
    if (data.ok) {
      hayCambiosPendientes = false;
      if (typeof window.recargarCatalogoBusqueda === 'function') {
        window.recargarCatalogoBusqueda();
      }
    }
    return data;
  }

  window.irAPuntoInteres = function (lat, lng) {
    if (typeof map === 'undefined') return;
    window.endPoint = [lat, lng];
    if (typeof endPoint !== 'undefined') endPoint = [lat, lng];

    if (window.endMarker) map.removeLayer(window.endMarker);
    var opts = { draggable: true };
    if (window.iconoDestinoRojo) opts.icon = window.iconoDestinoRojo;
    window.endMarker = L.marker([lat, lng], opts).addTo(map);
    window.endMarker.on('dragend', function () {
      var ll = window.endMarker.getLatLng();
      if (typeof endPoint !== 'undefined') endPoint = ll;
      if (typeof updateRoute === 'function') updateRoute();
    });

    map.closePopup();
    if (typeof updateRoute === 'function') updateRoute();
  };

  window.PuntosInteresCampus = {
    CATALOGO: CATALOGO,
    renderizarIconoHTML: renderizarIconoHTML,

    obtenerCategoriasLista: function () {
      return Object.keys(CATALOGO).map(function (k) { return CATALOGO[k]; });
    },

    cargarDesdeBD: cargarDesdeBD,
    guardarEnBD: guardarEnBD,

    abrirPorId: function (id) {
      if (typeof map === 'undefined' || !id) return false;
      var poi = listaPOIs.find(function (p) { return String(p.id) === String(id); });
      if (!poi) return false;

      var cat = poi.categoria || 'banos';
      var meta = CATALOGO[cat] || { label: cat, color: '#2563eb', icon: 'location' };

      L.popup(obtenerOpcionesPopup(false))
        .setLatLng([poi.lat, poi.lng])
        .setContent(construirPopupPublico(poi, meta))
        .openOn(map);
      return true;
    },

    _crearDesdePopup: function (lat, lng) {
      var catEl = document.getElementById('fiad-nuevo-poi-cat');
      var nomEl = document.getElementById('fiad-nuevo-poi-nombre');
      var descEl = document.getElementById('fiad-nuevo-poi-desc');

      listaPOIs.push({
        id: 'poi_' + Date.now(),
        categoria: catEl ? catEl.value : 'banos',
        nombre: nomEl ? nomEl.value.trim() : '',
        descripcion: descEl ? descEl.value.trim() : '',
        lat: Number(parseFloat(lat).toFixed(8)),
        lng: Number(parseFloat(lng).toFixed(8))
      });

      hayCambiosPendientes = true;
      map.closePopup();
      renderizar();
      if (ctxEditor) ctxEditor.setEstado('Punto de interés agregado — presiona <strong>Guardar en BD</strong>.');
    },

    _actualizarDesdePopup: function (id) {
      var poi = listaPOIs.find(function (p) { return p.id === id; });
      if (!poi) return;

      var catEl = document.getElementById('fiad-edit-poi-cat');
      var nomEl = document.getElementById('fiad-edit-poi-nombre');
      var descEl = document.getElementById('fiad-edit-poi-desc');
      var latEl = document.getElementById('fiad-edit-poi-lat');
      var lngEl = document.getElementById('fiad-edit-poi-lng');

      var lat = latEl ? parseFloat(latEl.value) : NaN;
      var lng = lngEl ? parseFloat(lngEl.value) : NaN;
      if (isNaN(lat) || isNaN(lng)) {
        alert('Coordenadas inválidas.');
        return;
      }

      poi.categoria = catEl ? catEl.value : poi.categoria;
      poi.nombre = nomEl ? nomEl.value.trim() : '';
      poi.descripcion = descEl ? descEl.value.trim() : '';
      poi.lat = Number(lat.toFixed(8));
      poi.lng = Number(lng.toFixed(8));

      hayCambiosPendientes = true;
      map.closePopup();
      renderizar();
      if (ctxEditor) ctxEditor.setEstado('Punto de interés actualizado — presiona <strong>Guardar en BD</strong>.');
    },

    _eliminarDesdePopup: function (id) {
      listaPOIs = listaPOIs.filter(function (p) { return p.id !== id; });
      hayCambiosPendientes = true;
      map.closePopup();
      renderizar();
    }
  };

  // Plugin desacoplado para EditorMapa
  var moduloEditorPOI = {
    id: 'puntos_interes',
    orden: 20,
    herramientas: [
      {
        id: 'poi',
        label: 'Punto de interés',
        color: '#2da832',
        ayuda: '<strong>Punto de interés:</strong> Haz 1 clic en el mapa para colocar Baños, Biblioteca, Canchas, Estacionamiento, Cafetería o Tienda.'
      }
    ],
    alActivarEditor: async function (ctx) {
      ctxEditor = ctx;
      enModoEdicion = true;
      arrastrableEnEditor = true;
      await cargarDesdeBD(false);
      renderizar();
    },
    alDesactivarEditor: function () {
      enModoEdicion = false;
      arrastrableEnEditor = false;
      ctxEditor = null;
      renderizar();
    },
    alCambiarHerramienta: function (herramientaId) {
      arrastrableEnEditor = (herramientaId === 'navegar');
      renderizar();
    },
    onClick: function (e, herramientaId) {
      if (herramientaId === 'poi') {
        abrirFormularioNuevoPOI(e.latlng);
      }
    },
    recargar: async function (ignorarCache) {
      await cargarDesdeBD(ignorarCache);
    },
    guardar: async function () {
      if (!hayCambiosPendientes) return { ok: true };
      var res = await guardarEnBD();
      return {
        ok: Boolean(res.ok),
        mensaje: res.mensaje,
        resumen: res.ok ? ('Puntos de interés guardados (' + listaPOIs.length + ')') : ''
      };
    }
  };

  if (window.EditorMapa && typeof window.EditorMapa.registrarModulo === 'function') {
    window.EditorMapa.registrarModulo(moduloEditorPOI);
  } else {
    window._editorModulosPendientes = window._editorModulosPendientes || [];
    window._editorModulosPendientes.push(moduloEditorPOI);
  }

  window.addEventListener('configuracionPOICambiada', renderizar);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { cargarDesdeBD(false); });
  } else {
    cargarDesdeBD(false);
  }
})();