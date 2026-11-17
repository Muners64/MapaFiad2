(function () {
  const STORAGE_KEY = 'fiad_map_poi_config';

  const CATEGORIAS_POI = [
    { id: 'banos', label: 'Baños', icon: 'male-female-outline', default: true },
    { id: 'biblioteca', label: 'Biblioteca', icon: 'book-outline', default: true },
    { id: 'canchas', label: 'Canchas deportivas', icon: 'basketball-outline', default: true },
    { id: 'estacionamiento', label: 'Estacionamientos', icon: 'car-outline', default: true },
    { id: 'cafeteria', label: 'Cafetería / Comedor', icon: 'cafe-outline', default: true }
  ];

  function cargarConfiguracion() {
    try {
      const guardado = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (guardado && typeof guardado === 'object') return guardado;
    } catch (e) {}

    const inicial = {};
    CATEGORIAS_POI.forEach((cat) => {
      inicial[cat.id] = cat.default;
    });
    return inicial;
  }

  function guardarConfiguracion(config) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (e) {}
  }

  function crearHTMLConfiguracion(config) {
    const itemsHTML = CATEGORIAS_POI.map((cat) => `
      <label class="config-poi-item">
        <span class="config-poi-label">
          <ion-icon name="${cat.icon}"></ion-icon>
          <span>${cat.label}</span>
        </span>
        <input type="checkbox" data-poi-id="${cat.id}" ${config[cat.id] ? 'checked' : ''}>
      </label>
    `).join('');

    return `
      <button type="button" id="btn-config-mapa" class="lateral-btn" aria-label="Configuración del mapa" title="Puntos de interés">
        <ion-icon name="settings-outline"></ion-icon>
      </button>

      <div id="panel-config-mapa" class="config-popover" aria-hidden="true">
        <div class="config-popover-header">
          <span>Puntos de interés</span>
          <button type="button" id="btn-cerrar-config" class="config-close-btn" aria-label="Cerrar">&times;</button>
        </div>
        <div class="config-popover-body">
          ${itemsHTML}
        </div>
      </div>
    `;
  }

  function emitirCambio(config) {
    window.fiadPOIConfig = { ...config };
    window.dispatchEvent(new CustomEvent('configuracionPOICambiada', {
      detail: { ...config }
    }));
  }

  function inicializarConfiguracion() {
    const contenedor = document.querySelector('.botones_laterales') || document.body;
    const config = cargarConfiguracion();

    if (!document.getElementById('btn-config-mapa')) {
      contenedor.insertAdjacentHTML('beforeend', crearHTMLConfiguracion(config));
    }

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

    panelConfig.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const id = checkbox.getAttribute('data-poi-id');
        config[id] = checkbox.checked;
        guardarConfiguracion(config);
        emitirCambio(config);
      });
    });

    emitirCambio(config);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarConfiguracion);
  } else {
    inicializarConfiguracion();
  }
})();