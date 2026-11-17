(function () {
  const STORAGE_KEY_UBICACION = 'fiad_ubicacion_activa';
  let ubicacionActiva = false;
  let watchId = null;
  let primerCentrado = true;

  function crearHTMLUbicacion() {
    return `
      <button type="button" id="btn-toggle-ubicacion" class="lateral-btn is-no-permission" aria-label="Activar o desactivar ubicación" title="Ubicación desactivada — Toca para activar">
        <ion-icon name="location-outline"></ion-icon>
      </button>
    `;
  }

  function obtenerPreferenciaGuardada() {
    try {
      return localStorage.getItem(STORAGE_KEY_UBICACION);
    } catch (e) {
      return null;
    }
  }

  function guardarPreferenciaUbicacion(activa) {
    try {
      localStorage.setItem(STORAGE_KEY_UBICACION, activa ? 'true' : 'false');
    } catch (e) {}
  }

  function sincronizarPosicionConNavbar() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;

    const actualizarClase = () => {
      document.body.classList.toggle('ui-navbar-collapsed', navbar.classList.contains('search-collapsed'));
    };

    actualizarClase();
    const observer = new MutationObserver(actualizarClase);
    observer.observe(navbar, { attributes: true, attributeFilter: ['class'] });
  }

  function inicializarUbicacion() {
    const contenedor = document.querySelector('.botones_laterales') || document.body;

    if (!document.getElementById('btn-toggle-ubicacion')) {
      contenedor.insertAdjacentHTML('afterbegin', crearHTMLUbicacion());
    }

    sincronizarPosicionConNavbar();

    const btn = document.getElementById('btn-toggle-ubicacion');
    if (!btn) return;

    function actualizarEstadoUI(estado, mensajeTooltip) {
      btn.classList.remove('is-loading', 'is-active', 'is-no-permission');
      if (estado) btn.classList.add(estado);
      if (mensajeTooltip) btn.title = mensajeTooltip;

      const icono = btn.querySelector('ion-icon');
      if (icono) {
        icono.setAttribute('name', estado === 'is-active' ? 'location' : 'location-outline');
      }
    }

    function solicitarUbicacion(esAutomatico) {
      if (!window.isSecureContext) {
        console.warn('[Ubicación] Bloqueada por el navegador: se requiere HTTPS o localhost.');
        ubicacionActiva = false;
        actualizarEstadoUI('is-no-permission', 'Requiere HTTPS o localhost para usar GPS en móvil');
        return;
      }

      if (!('geolocation' in navigator)) {
        ubicacionActiva = false;
        actualizarEstadoUI('is-no-permission', 'Tu navegador no soporta ubicación');
        return;
      }

      ubicacionActiva = true;
      primerCentrado = true;
      actualizarEstadoUI('is-loading', 'Obteniendo ubicación...');

      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!ubicacionActiva) return;

          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const accuracy = pos.coords.accuracy;

          guardarPreferenciaUbicacion(true);
          actualizarEstadoUI('is-active', 'Ubicación activa — Toca para desactivar');

          window.dispatchEvent(new CustomEvent('ubicacionActualizada', {
            detail: { lat, lng, accuracy }
          }));
        },
        (error) => {
          ubicacionActiva = false;
          if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
          }

          let mensajeUI = 'Sin permiso de ubicación — Toca para activar';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              mensajeUI = 'Permiso denegado — Habilítalo en el navegador';
              if (!esAutomatico) guardarPreferenciaUbicacion(false);
              break;
            case error.POSITION_UNAVAILABLE:
              mensajeUI = 'GPS no disponible — Reintentar';
              break;
            case error.TIMEOUT:
              mensajeUI = 'Tiempo agotado — Reintentar';
              break;
          }

          actualizarEstadoUI('is-no-permission', mensajeUI);
          window.dispatchEvent(new CustomEvent('ubicacionDesactivada'));
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 3000
        }
      );
    }

    function desactivarUbicacionManual() {
      ubicacionActiva = false;
      guardarPreferenciaUbicacion(false);
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      actualizarEstadoUI('is-no-permission', 'Ubicación desactivada — Toca para activar');
      window.dispatchEvent(new CustomEvent('ubicacionDesactivada'));
    }

    // Estado inicial por defecto: rojo (sin ubicación)
    actualizarEstadoUI('is-no-permission', 'Ubicación desactivada — Toca para activar');

    btn.addEventListener('click', () => {
      if (!ubicacionActiva) {
        solicitarUbicacion(false);
      } else {
        desactivarUbicacionManual();
      }
    });

    // Al iniciar la app: pedir ubicación automáticamente si el usuario no la apagó manualmente
    const pref = obtenerPreferenciaGuardada();
    if (pref !== 'false') {
      solicitarUbicacion(true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarUbicacion);
  } else {
    inicializarUbicacion();
  }
})();