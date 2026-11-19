(function () {
  const STORAGE_KEY_UBICACION = 'fiad_ubicacion_activa';
  let ubicacionActiva = false;
  let watchId = null;
  let primerCentrado = true;
  let ultimaPosEmitida = null;
  let listenerMapaVinculado = false;

  function distanciaMetros(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLng = (lng2 - lng1) * rad;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

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

  function vincularInteraccionUsuarioMapa() {
    if (listenerMapaVinculado || typeof map === 'undefined') return;
    // Si el usuario mueve el mapa manualmente, nunca volver a forzar el centrado
    map.on('dragstart', () => {
      primerCentrado = false;
    });
    listenerMapaVinculado = true;
  }

  function inicializarUbicacion() {
    const contenedor = document.querySelector('.botones_laterales') || document.body;

    if (!document.getElementById('btn-toggle-ubicacion')) {
      contenedor.insertAdjacentHTML('afterbegin', crearHTMLUbicacion());
    }

    sincronizarPosicionConNavbar();
    vincularInteraccionUsuarioMapa();

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

      vincularInteraccionUsuarioMapa();
      ubicacionActiva = true;
      primerCentrado = true;
      ultimaPosEmitida = null;
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
          const ahora = Date.now();

          guardarPreferenciaUbicacion(true);
          actualizarEstadoUI('is-active', 'Ubicación activa — Toca para desactivar');

          const esPrimeraLectura = primerCentrado;
          primerCentrado = false;

          // Evitar disparar recálculos repetidos por ruido del GPS cuando el usuario está quieto
          if (!esPrimeraLectura && ultimaPosEmitida) {
            const metrosMovidos = distanciaMetros(ultimaPosEmitida.lat, ultimaPosEmitida.lng, lat, lng);
            const tiempoTranscurrido = ahora - ultimaPosEmitida.timestamp;
            if (metrosMovidos < 3 && tiempoTranscurrido < 5000) {
              return;
            }
          }

          ultimaPosEmitida = { lat, lng, accuracy, timestamp: ahora };

          window.dispatchEvent(new CustomEvent('ubicacionActualizada', {
            detail: {
              lat,
              lng,
              accuracy,
              esPrimerCentrado: esPrimeraLectura
            }
          }));
        },
        (error) => {
          ubicacionActiva = false;
          primerCentrado = false;
          ultimaPosEmitida = null;

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
      primerCentrado = false;
      ultimaPosEmitida = null;
      guardarPreferenciaUbicacion(false);

      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }

      actualizarEstadoUI('is-no-permission', 'Ubicación desactivada — Toca para activar');
      window.dispatchEvent(new CustomEvent('ubicacionDesactivada'));
    }

    window.UbicacionCampus = {
      estaActiva: () => ubicacionActiva,
      obtenerUltimaPosicion: () => ultimaPosEmitida ? { ...ultimaPosEmitida } : null,
      centrarEnUsuario: () => {
        if (ultimaPosEmitida && typeof map !== 'undefined') {
          map.setView([ultimaPosEmitida.lat, ultimaPosEmitida.lng], Math.max(map.getZoom(), 18), { animate: true });
        }
      }
    };

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