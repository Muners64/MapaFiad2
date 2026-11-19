(function () {
  const STORAGE_KEY_POI = 'fiad_map_poi_config';
  const STORAGE_KEY_UI = 'fiad_map_ui_config';
  let vistaInicialUniversidad = null;

  const SVG_BANOS_FALLBACK =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<circle cx="7" cy="4.5" r="2"/>' +
      '<path d="M4.5 8.5A1.5 1.5 0 0 1 6 7h2a1.5 1.5 0 0 1 1.5 1.5V14H8.2v6H5.8v-6H4.5V8.5z"/>' +
      '<circle cx="17" cy="4.5" r="2"/>' +
      '<path d="M15.2 7h3.6c.65 0 1.22.42 1.42 1.04L21.5 13h-2.3v7h-4.4v-7h-2.3l1.28-4.96A1.5 1.5 0 0 1 15.2 7z"/>' +
    '</svg>';

  function capturarVistaInicialUniversidad() {
    if (vistaInicialUniversidad) return true;
    if (typeof map !== 'undefined' && map && typeof map.getCenter === 'function' && typeof map.getZoom === 'function') {
      try {
        const centro = map.getCenter();
        const zoom = map.getZoom();
        if (centro && typeof centro.lat === 'number' && typeof centro.lng === 'number' && typeof zoom === 'number') {
          vistaInicialUniversidad = {
            lat: centro.lat,
            lng: centro.lng,
            zoom: zoom
          };
          return true;
        }
      } catch (e) {}
    }
    return false;
  }

  function centrarEnUniversidad() {
    if (!vistaInicialUniversidad) {
      capturarVistaInicialUniversidad();
    }
    if (typeof map !== 'undefined' && map && vistaInicialUniversidad) {
      if (window.UbicacionCampus && typeof window.UbicacionCampus.cancelarPrimerCentrado === 'function') {
        window.UbicacionCampus.cancelarPrimerCentrado();
      }
      map.setView(
        [vistaInicialUniversidad.lat, vistaInicialUniversidad.lng],
        vistaInicialUniversidad.zoom,
        { animate: true }
      );
    }
  }

  function obtenerCategoriasPOI() {
    if (window.PuntosInteresCampus && typeof window.PuntosInteresCampus.obtenerCategoriasLista === 'function') {
      return window.PuntosInteresCampus.obtenerCategoriasLista();
    }
    return [
      { id: 'banos', label: 'Baños', svg: SVG_BANOS_FALLBACK, default: true },
      { id: 'biblioteca', label: 'Biblioteca', icon: 'book', default: true },
      { id: 'canchas', label: 'Canchas deportivas', icon: 'basketball', default: true },
      { id: 'estacionamiento', label: 'Estacionamientos', icon: 'car', default: true },
      { id: 'cafeteria', label: 'Cafetería', icon: 'cafe', default: true },
      { id: 'tienda', label: 'Tienda', icon: 'storefront', default: true }
    ];
  }

  function cargarConfigPOI(categorias) {
    const inicial = {};
    categorias.forEach((cat) => {
      inicial[cat.id] = cat.default !== false;
    });

    try {
      const guardado = JSON.parse(localStorage.getItem(STORAGE_KEY_POI));
      if (guardado && typeof guardado === 'object') {
        return Object.assign(inicial, guardado);
      }
    } catch (e) {}
    return inicial;
  }

  function guardarConfigPOI(config) {
    try {
      localStorage.setItem(STORAGE_KEY_POI, JSON.stringify(config));
    } catch (e) {}
  }

  function cargarConfigUI() {
    const inicial = {
      rutaAccesible: false,
      mostrarCentrarUniversidad: true,
      mostrarCapas: true,
      mostrarEscala: true
    };
    try {
      const guardado = JSON.parse(localStorage.getItem(STORAGE_KEY_UI));
      if (guardado && typeof guardado === 'object') {
        return Object.assign(inicial, guardado);
      }
    } catch (e) {}
    return inicial;
  }

  function guardarConfigUI(uiConfig) {
    try {
      localStorage.setItem(STORAGE_KEY_UI, JSON.stringify(uiConfig));
    } catch (e) {}
  }

  function aplicarVisibilidadControles(uiConfig) {
    const btnCentrar = document.getElementById('btn-centrar-universidad');
    if (btnCentrar) {
      btnCentrar.style.display = uiConfig.mostrarCentrarUniversidad !== false ? '' : 'none';
    }

    const btnCapas = document.getElementById('btn_capas');
    if (btnCapas) {
      btnCapas.style.display = uiConfig.mostrarCapas ? '' : 'none';
    }

    document.querySelectorAll('.leaflet-control-scale').forEach((el) => {
      el.style.display = uiConfig.mostrarEscala ? '' : 'none';
    });
  }

  function aplicarModoAccesible(activar) {
    if (window.GrafoCampus) {
      window.GrafoCampus.soloAccesible = Boolean(activar);
    }
    if (typeof window.setModoAccesible === 'function') {
      window.setModoAccesible(Boolean(activar));
    } else if (typeof updateRoute === 'function') {
      updateRoute();
    }
  }

  function renderizarIconoPOI(cat) {
    if (window.PuntosInteresCampus && typeof window.PuntosInteresCampus.renderizarIconoHTML === 'function') {
      return window.PuntosInteresCampus.renderizarIconoHTML(cat, 18);
    }
    if (cat.svg) {
      return cat.svg.replace('<svg ', '<svg width="18" height="18" ');
    }
    return `<ion-icon name="${cat.icon}"></ion-icon>`;
  }

  function crearHTMLBotonCentrar() {
    return `
      <button type="button" id="btn-centrar-universidad" class="lateral-btn" aria-label="Centrar en la universidad" title="Centrar en la universidad">
        <ion-icon name="compass-outline"></ion-icon>
      </button>
    `;
  }

  function crearHTMLBotonConfig() {
    return `
      <button type="button" id="btn-config-mapa" class="lateral-btn" aria-label="Configuración del mapa" title="Configuración del mapa">
        <ion-icon name="settings-outline"></ion-icon>
      </button>
    `;
  }

  function crearHTMLPanelConfiguracion(categorias, poiConfig, uiConfig) {
    const itemsPOIHTML = categorias.map((cat) => `
      <label class="config-poi-item">
        <span class="config-poi-label">
          ${renderizarIconoPOI(cat)}
          <span>${cat.label}</span>
        </span>
        <input type="checkbox" data-poi-id="${cat.id}" ${poiConfig[cat.id] ? 'checked' : ''}>
      </label>
    `).join('');

    const svgReglaEscala = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="2" y="7" width="20" height="10" rx="2"></rect>
        <line x1="6" y1="7" x2="6" y2="11"></line>
        <line x1="10" y1="7" x2="10" y2="10"></line>
        <line x1="14" y1="7" x2="14" y2="11"></line>
        <line x1="18" y1="7" x2="18" y2="10"></line>
      </svg>
    `;

    return `
      <div id="panel-config-mapa" class="config-popover" aria-hidden="true">
        <div class="config-popover-header">
          <span>Configuración</span>
          <button type="button" id="btn-cerrar-config" class="config-close-btn" aria-label="Cerrar">&times;</button>
        </div>

        <div class="config-popover-body">
          <div class="config-section-title">Accesibilidad</div>
          <label class="config-poi-item">
            <span class="config-poi-label">
              <ion-icon name="accessibility-outline"></ion-icon>
              <span>Rutas accesibles</span>
            </span>
            <input type="checkbox" data-ui-id="rutaAccesible" ${uiConfig.rutaAccesible ? 'checked' : ''}>
          </label>

          <div class="config-section-divider"></div>
          <div class="config-section-title">Puntos de interés</div>
          ${itemsPOIHTML}

          <div class="config-section-divider"></div>
          <div class="config-section-title">Controles del mapa</div>
          <label class="config-poi-item">
            <span class="config-poi-label">
              <ion-icon name="compass-outline"></ion-icon>
              <span>Botón centrar campus</span>
            </span>
            <input type="checkbox" data-ui-id="mostrarCentrarUniversidad" ${uiConfig.mostrarCentrarUniversidad !== false ? 'checked' : ''}>
          </label>
          <label class="config-poi-item">
            <span class="config-poi-label">
              <ion-icon name="layers-outline"></ion-icon>
              <span>Botón de capas</span>
            </span>
            <input type="checkbox" data-ui-id="mostrarCapas" ${uiConfig.mostrarCapas ? 'checked' : ''}>
          </label>
          <label class="config-poi-item">
            <span class="config-poi-label">
              ${svgReglaEscala}
              <span>Escala (m / ft)</span>
            </span>
            <input type="checkbox" data-ui-id="mostrarEscala" ${uiConfig.mostrarEscala ? 'checked' : ''}>
          </label>
        </div>
      </div>
    `;
  }

  function emitirCambioPOI(config) {
    window.fiadPOIConfig = { ...config };
    window.dispatchEvent(new CustomEvent('configuracionPOICambiada', {
      detail: { ...config }
    }));
  }

  function inicializarConfiguracion() {
    if (!capturarVistaInicialUniversidad()) {
      let intentos = 0;
      const timerVista = setInterval(() => {
        intentos++;
        if (capturarVistaInicialUniversidad() || intentos >= 50) {
          clearInterval(timerVista);
        }
      }, 20);
    }

    const contenedor = document.querySelector('.botones_laterales') || document.body;
    const categorias = obtenerCategoriasPOI();
    const poiConfig = cargarConfigPOI(categorias);
    const uiConfig = cargarConfigUI();

    if (!document.getElementById('btn-centrar-universidad')) {
      const btnUbicacion = document.getElementById('btn-toggle-ubicacion');
      if (btnUbicacion) {
        btnUbicacion.insertAdjacentHTML('afterend', crearHTMLBotonCentrar());
      } else {
        contenedor.insertAdjacentHTML('afterbegin', crearHTMLBotonCentrar());
      }
    }

    if (!document.getElementById('btn-config-mapa')) {
      contenedor.insertAdjacentHTML('beforeend', crearHTMLBotonConfig());
    }

    if (!document.getElementById('panel-config-mapa')) {
      const btnCfgActual = document.getElementById('btn-config-mapa');
      if (btnCfgActual) {
        btnCfgActual.insertAdjacentHTML('afterend', crearHTMLPanelConfiguracion(categorias, poiConfig, uiConfig));
      } else {
        contenedor.insertAdjacentHTML('beforeend', crearHTMLPanelConfiguracion(categorias, poiConfig, uiConfig));
      }
    }

    const btnCentrar = document.getElementById('btn-centrar-universidad');
    const btnConfig = document.getElementById('btn-config-mapa');
    const panelConfig = document.getElementById('panel-config-mapa');
    const btnCerrar = document.getElementById('btn-cerrar-config');

    if (!btnConfig || !panelConfig) return;

    function togglePanel(forzarEstado) {
      const abrir = typeof forzarEstado === 'boolean'
        ? forzarEstado
        : !panelConfig.classList.contains('is-open');

      panelConfig.classList.toggle('is-open', abrir);
      panelConfig.setAttribute('aria-hidden', String(!abrir));
      btnConfig.classList.toggle('is-active', abrir);
    }

    if (btnCentrar) {
      btnCentrar.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanel(false);
        centrarEnUniversidad();
      });
    }

    btnConfig.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePanel();
    });

    if (btnCerrar) {
      btnCerrar.addEventListener('click', () => togglePanel(false));
    }

    document.addEventListener('click', (e) => {
      if (panelConfig.classList.contains('is-open') &&
          !panelConfig.contains(e.target) &&
          !btnConfig.contains(e.target)) {
        togglePanel(false);
      }
    });

    panelConfig.querySelectorAll('input[data-poi-id]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const id = checkbox.getAttribute('data-poi-id');
        poiConfig[id] = checkbox.checked;
        guardarConfigPOI(poiConfig);
        emitirCambioPOI(poiConfig);
      });
    });

    panelConfig.querySelectorAll('input[data-ui-id]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const id = checkbox.getAttribute('data-ui-id');
        uiConfig[id] = checkbox.checked;
        guardarConfigUI(uiConfig);

        if (id === 'rutaAccesible') {
          aplicarModoAccesible(uiConfig.rutaAccesible);
        } else {
          aplicarVisibilidadControles(uiConfig);
        }
      });
    });

    emitirCambioPOI(poiConfig);
    aplicarVisibilidadControles(uiConfig);
    aplicarModoAccesible(uiConfig.rutaAccesible);

    const observer = new MutationObserver(() => {
      aplicarVisibilidadControles(uiConfig);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarConfiguracion);
  } else {
    inicializarConfiguracion();
  }
})();