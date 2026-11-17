(function () {
  let ubicacionActiva = false;
  let marcadorUsuario = null;
  let circuloPrecision = null;

  function crearHTMLUbicacion() {
    return `
      <button type="button" id="btn-toggle-ubicacion" class="lateral-btn is-no-permission" aria-label="Activar o desactivar ubicación" title="Ubicación desactivada — Toca para activar">
        <ion-icon name="location-outline"></ion-icon>
      </button>
    `;
  }

  function obtenerInstanciaMapa() {
    if (typeof window.map !== 'undefined' && window.map && typeof window.map.addLayer === 'function') {
      return window.map;
    }
    if (typeof map !== 'undefined' && map && typeof map.addLayer === 'function') {
      return map;
    }
    return null;
  }

  function actualizarMarcadorEnMapa(lat, lng, accuracy) {
    const mapa = obtenerInstanciaMapa();
    if (!mapa || typeof L === 'undefined') return;

    const coords = [lat, lng];
    const radio = Math.min(accuracy || 20, 150);

    if (!marcadorUsuario) {
      const iconoUsuario = L.divIcon({
        className: '',
        html: '<div class="user-location-dot"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });

      marcadorUsuario = L.marker(coords, {
        icon: iconoUsuario,
        zIndexOffset: 1000
      })
        .addTo(mapa)
        .bindPopup('Tu ubicación actual');
    } else {
      marcadorUsuario.setLatLng(coords);
    }

    if (!circuloPrecision) {
      circuloPrecision = L.circle(coords, {
        radius: radio,
        color: '#2563eb',
        fillColor: '#3b82f6',
        fillOpacity: 0.15,
        weight: 1
      }).addTo(mapa);
    } else {
      circuloPrecision.setLatLng(coords);
      circuloPrecision.setRadius(radio);
    }

    mapa.flyTo(coords, Math.max(mapa.getZoom(), 17), { duration: 0.8 });
  }

  function limpiarMarcadorEnMapa() {
    const mapa = obtenerInstanciaMapa();
    if (mapa) {
      if (marcadorUsuario) {
        mapa.removeLayer(marcadorUsuario);
        marcadorUsuario = null;
      }
      if (circuloPrecision) {
        mapa.removeLayer(circuloPrecision);
        circuloPrecision = null;
      }
    }
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

    function solicitarUbicacionManual() {
      if (!('geolocation' in navigator)) {
        ubicacionActiva = false;
        actualizarEstadoUI('is-no-permission', 'Tu navegador no soporta ubicación');
        return;
      }

      ubicacionActiva = true;
      actualizarEstadoUI('is-loading', 'Obteniendo ubicación...');

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!ubicacionActiva) return;

          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const accuracy = pos.coords.accuracy;

          actualizarEstadoUI('is-active', 'Ubicación activa — Toca para desactivar');
          actualizarMarcadorEnMapa(lat, lng, accuracy);

          window.dispatchEvent(new CustomEvent('ubicacionActualizada', {
            detail: { lat, lng, accuracy }
          }));
        },
        (error) => {
          ubicacionActiva = false;
          limpiarMarcadorEnMapa();

          let mensajeUI = 'Sin permiso de ubicación — Toca para activar';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              mensajeUI = 'Permiso denegado — Habilítalo en el navegador';
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
          timeout: 10000,
          maximumAge: 0
        }
      );
    }

    function desactivarUbicacionManual() {
      ubicacionActiva = false;
      limpiarMarcadorEnMapa();
      actualizarEstadoUI('is-no-permission', 'Ubicación desactivada — Toca para activar');
      window.dispatchEvent(new CustomEvent('ubicacionDesactivada'));
    }

    // Estado inicial por defecto: rojo (sin permiso / desactivado)
    actualizarEstadoUI('is-no-permission', 'Ubicación desactivada — Toca para activar');

    btn.addEventListener('click', () => {
      if (!ubicacionActiva) {
        solicitarUbicacionManual();
      } else {
        desactivarUbicacionManual();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarUbicacion);
  } else {
    inicializarUbicacion();
  }
})();