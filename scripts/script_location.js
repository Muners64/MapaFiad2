(function () {
  const STORAGE_KEY_UBICACION = 'fiad_ubicacion_activa';
  let ubicacionActiva = false;
  let watchId = null;
  let primerCentrado = true;
  let ultimaPosEmitida = null;
  let listenerMapaVinculado = false;
  let ultimoTipoError = null;
  let rafSyncBotones = null;

  // Inyectar styles/styles_location.css automáticamente si aún no está en el <head>
  (function asegurarEstilosUbicacion() {
    if (document.getElementById('fiad-styles-location') || document.querySelector('link[href*="styles_location.css"]')) return;
    const basePath = window.location.pathname.replace(/\/[^\/]*$/, '');
    const link = document.createElement('link');
    link.id = 'fiad-styles-location';
    link.rel = 'stylesheet';
    link.href = window.location.origin + basePath + '/styles/styles_location.css';
    document.head.appendChild(link);
  })();

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

  // =========================================================================
  // Detección de entorno y diagnóstico de problemas de geolocalización
  // =========================================================================
  function detectarEntornoUsuario() {
    const ua = navigator.userAgent || '';
    const esIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const esAndroid = /Android/i.test(ua);
    const esMac = !esIOS && /Macintosh|Mac OS X/i.test(ua);
    const esWindows = /Windows/i.test(ua);

    const esInApp = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|WhatsApp/i.test(ua);
    const esSamsung = /SamsungBrowser/i.test(ua);
    const esFirefox = /Firefox|FxiOS/i.test(ua);
    const esEdge = /EdgA|EdgiOS|Edg\//i.test(ua);
    const esChrome = (/Chrome|CriOS/i.test(ua)) && !esEdge && !esSamsung;
    const esSafari = /Safari/i.test(ua) && !esChrome && !esEdge && !esFirefox && !esSamsung;

    let navegador = 'tu navegador';
    if (esInApp) navegador = 'el navegador interno de la app';
    else if (esSamsung) navegador = 'Samsung Internet';
    else if (esEdge) navegador = 'Microsoft Edge';
    else if (esFirefox) navegador = 'Firefox';
    else if (esChrome) navegador = 'Google Chrome';
    else if (esSafari) navegador = 'Safari';

    return { esIOS, esAndroid, esMac, esWindows, esInApp, esSamsung, esFirefox, esEdge, esChrome, esSafari, navegador };
  }

  function construirDiagnosticoUbicacion(tipoError) {
    const env = detectarEntornoUsuario();

    if (tipoError === 'HTTPS_REQUIRED') {
      return {
        badge: 'Conexión no segura',
        titulo: 'Abre el mapa con conexión segura',
        descripcion: 'Por seguridad, tu navegador solo permite usar el GPS cuando el sitio se abre mediante una conexión cifrada (HTTPS).',
        pasos: [
          'Verifica que la dirección en la barra de tu navegador comience con <strong>https://</strong>.',
          'Vuelve a abrir el enlace oficial de MapaFiad e inténtalo de nuevo.'
        ],
        puedeReintentar: false
      };
    }

    if (env.esInApp) {
      return {
        badge: 'Navegador integrado',
        titulo: 'Ábrelo en un navegador externo',
        descripcion: 'Es posible que la aplicación desde la que abriste el enlace limite el acceso a tu ubicación.',
        pasos: [
          'Toca el menú de opciones (<strong>⋮</strong> o <strong>Compartir</strong>) y elige abrir el enlace en <strong>tu navegador de preferencia</strong>.',
          'Si no aparece la opción, <strong>copia el enlace</strong> y pégalo directamente en el navegador que suelas usar.',
          'Una vez ahí, toca el botón de ubicación para activarla.'
        ],
        puedeReintentar: true
      };
    }

    if (tipoError === 'UNSUPPORTED') {
      return {
        badge: 'Ubicación no compatible',
        titulo: 'Este navegador no permite usar la ubicación',
        descripcion: 'Tu navegador actual o su configuración no ofrece acceso al servicio de localización.',
        pasos: [
          'Intenta abrir este enlace en <strong>otro navegador</strong> que tengas instalado en tu dispositivo.',
          'Si este es tu navegador habitual, verifica que esté <strong>actualizado</strong> y que no tenga bloqueos o extensiones restringiendo la ubicación.',
          'Cuando estés listo, vuelve a intentarlo.'
        ],
        puedeReintentar: true
      };
    }

    if (tipoError === 'PERMISSION_DENIED') {
      const pasos = [];

      if (env.esIOS && env.esSafari) {
        pasos.push('En <strong>Safari</strong>, toca el botón <strong>aA</strong> (o el ícono de ajustes) en la barra de direcciones → <strong>Configuración del sitio web</strong> → <strong>Ubicación</strong> → <strong>Permitir</strong>.');
      } else if (env.esIOS) {
        pasos.push('En <strong>' + env.navegador + '</strong>, revisa los permisos del sitio en la barra de direcciones y selecciona <strong>Permitir</strong>.');
      } else if (env.esFirefox) {
        pasos.push('Toca el ícono de <strong>candado</strong> 🔒 junto a la dirección web → entra a <strong>Permisos</strong> y elimina el bloqueo de <strong>Acceder a tu ubicación</strong>.');
      } else {
        pasos.push('En <strong>' + env.navegador + '</strong>, toca el ícono de <strong>candado / ajustes</strong> (🔒 o 🎛️) a la izquierda de la barra de direcciones → <strong>Permisos</strong> → activa <strong>Ubicación</strong>.');
      }

      if (env.esIOS) {
        pasos.push('Verifica en el sistema: <strong>Ajustes → Privacidad y seguridad → Localización</strong> (activada) → selecciona <strong>' + env.navegador + '</strong> → <strong>Al usar la app</strong>.');
      } else if (env.esAndroid) {
        pasos.push('Verifica en tu teléfono: <strong>Ajustes → Ubicación</strong> (activada) → <strong>Permisos de apps</strong> → busca <strong>' + env.navegador + '</strong> y elige <strong>Permitir solo con la app en uso</strong>.');
      } else if (env.esWindows) {
        pasos.push('En <strong>Windows</strong>, abre <strong>Configuración → Privacidad y seguridad → Ubicación</strong> y confirma que los <strong>Servicios de ubicación</strong> y el acceso para navegadores estén activados.');
      } else if (env.esMac) {
        pasos.push('En <strong>macOS</strong>, abre <strong>Ajustes del Sistema → Privacidad y seguridad → Localización</strong> y activa el permiso para <strong>' + env.navegador + '</strong>.');
      }

      pasos.push('Cuando hayas cambiado el permiso, presiona <strong>Reintentar ubicación</strong>.');

      return {
        badge: 'Permiso bloqueado',
        titulo: 'No se pudo acceder a tu ubicación',
        descripcion: 'El navegador o tu dispositivo tiene bloqueado el permiso de localización para este sitio.',
        pasos,
        puedeReintentar: true
      };
    }

    if (tipoError === 'POSITION_UNAVAILABLE') {
      return {
        badge: 'Señal GPS no disponible',
        titulo: 'Tu dispositivo no pudo detectar tu posición',
        descripcion: 'El sensor GPS está apagado o no hay suficiente señal en este momento.',
        pasos: [
          'Desliza el panel rápido de tu dispositivo y enciende la <strong>Ubicación / GPS</strong>.',
          'Activa el <strong>Wi-Fi</strong> (aunque no estés conectado a una red, mejora mucho la precisión en el campus).',
          'Si estás dentro de un edificio, acércate a una ventana o salida y reintenta.'
        ],
        puedeReintentar: true
      };
    }

    // TIMEOUT o error genérico
    return {
      badge: 'Tiempo de espera agotado',
      titulo: 'La ubicación tardó demasiado en responder',
      descripcion: 'No fue posible obtener una lectura GPS estable a tiempo.',
      pasos: [
        'Comprueba que el <strong>GPS / Ubicación</strong> de tu dispositivo esté encendido.',
        'Activa el <strong>Wi-Fi</strong> y verifica tu conexión a internet para acelerar la localización.',
        'Presiona <strong>Reintentar ubicación</strong>.'
      ],
      puedeReintentar: true
    };
  }

  // =========================================================================
  // Popup #1: Callout señalando #btn-toggle-ubicacion cuando intentan "Cómo llegar"
  // =========================================================================
  function asegurarCalloutDOM() {
    let callout = document.getElementById('fiad-loc-callout');
    if (callout) return callout;

    callout = document.createElement('div');
    callout.id = 'fiad-loc-callout';
    callout.className = 'fiad-loc-callout';
    callout.setAttribute('role', 'status');
    callout.setAttribute('aria-live', 'polite');
    callout.setAttribute('aria-label', 'Activar ubicación para calcular ruta');

    callout.innerHTML =
      '<div class="fiad-loc-callout-arrow" id="fiad-loc-callout-arrow" aria-hidden="true"></div>' +
      '<button type="button" class="fiad-loc-callout-close" id="fiad-loc-callout-close" aria-label="Cerrar aviso">&times;</button>' +
      '<div class="fiad-loc-callout-header">' +
        '<span class="fiad-loc-callout-icon" aria-hidden="true"><ion-icon name="location"></ion-icon></span>' +
        '<div class="fiad-loc-callout-title">Activa tu ubicación</div>' +
      '</div>' +
      '<p class="fiad-loc-callout-desc">Toca este botón para encender tu ubicación.</p>';

    document.body.appendChild(callout);
    return callout;
  }

  function posicionarCalloutEnBoton() {
    const callout = document.getElementById('fiad-loc-callout');
    const btn = document.getElementById('btn-toggle-ubicacion');
    const arrow = document.getElementById('fiad-loc-callout-arrow');
    if (!callout || !btn || !callout.classList.contains('is-visible')) return;

    const rect = btn.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const rightOffset = Math.max(12, Math.round(window.innerWidth - rect.left + 12));
    const topOffset = Math.max(12, Math.round(rect.top - 4));

    callout.style.right = rightOffset + 'px';
    callout.style.top = topOffset + 'px';

    if (arrow) {
      const btnCenterY = rect.top + rect.height / 2;
      const calloutHeight = callout.offsetHeight || 88;
      const arrowTop = Math.max(14, Math.min(calloutHeight - 22, Math.round(btnCenterY - topOffset - 6)));
      arrow.style.top = arrowTop + 'px';
    }
  }

  function ocultarPopupActivarUbicacion() {
    const callout = document.getElementById('fiad-loc-callout');
    if (callout) {
      callout.classList.remove('is-visible');
    }
    const btn = document.getElementById('btn-toggle-ubicacion');
    if (btn) {
      btn.classList.remove('is-attention');
    }
  }

  function mostrarPopupActivarUbicacion() {
    const callout = asegurarCalloutDOM();
    const btn = document.getElementById('btn-toggle-ubicacion');

    // Cerrar popup de Leaflet si hubiera uno abierto para despejar la vista
    if (typeof map !== 'undefined' && typeof map.closePopup === 'function') {
      map.closePopup();
    }

    callout.classList.add('is-visible');
    posicionarCalloutEnBoton();
    requestAnimationFrame(posicionarCalloutEnBoton);

    if (btn) {
      btn.classList.remove('is-attention');
      void btn.offsetWidth; // reiniciar animación CSS
      btn.classList.add('is-attention');
    }
  }

  // =========================================================================
  // Popup #2: Retroalimentación / guía cuando falla activar la ubicación
  // =========================================================================
  function asegurarModalAyudaDOM() {
    let backdrop = document.getElementById('fiad-loc-help-backdrop');
    if (backdrop) return backdrop;

    backdrop = document.createElement('div');
    backdrop.id = 'fiad-loc-help-backdrop';
    backdrop.className = 'fiad-loc-help-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'fiad-loc-help-title');

    backdrop.innerHTML = '<div class="fiad-loc-help-card" id="fiad-loc-help-card"></div>';
    document.body.appendChild(backdrop);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        ocultarPopupAyudaUbicacion();
      }
    });

    return backdrop;
  }

  function ocultarPopupAyudaUbicacion() {
    const backdrop = document.getElementById('fiad-loc-help-backdrop');
    if (backdrop) {
      backdrop.classList.remove('is-visible');
    }
  }

  function mostrarPopupAyudaUbicacion(tipoError, onReintentar) {
    ocultarPopupActivarUbicacion();

    const backdrop = asegurarModalAyudaDOM();
    const card = document.getElementById('fiad-loc-help-card');
    const info = construirDiagnosticoUbicacion(tipoError || ultimoTipoError || 'PERMISSION_DENIED');

    const pasosHTML = info.pasos.map((paso) => `<li>${paso}</li>`).join('');
    const btnReintentarHTML = info.puedeReintentar
      ? `<button type="button" class="fiad-loc-help-btn-primary" id="fiad-loc-help-retry">
           <ion-icon name="refresh"></ion-icon>
           <span>Reintentar ubicación</span>
         </button>`
      : '';

    card.innerHTML =
      `<button type="button" class="fiad-loc-help-close" id="fiad-loc-help-close" aria-label="Cerrar">&times;</button>` +
      `<span class="fiad-loc-help-badge"><ion-icon name="warning"></ion-icon> ${info.badge}</span>` +
      `<h3 class="fiad-loc-help-title" id="fiad-loc-help-title">${info.titulo}</h3>` +
      `<p class="fiad-loc-help-desc">${info.descripcion}</p>` +
      `<div class="fiad-loc-help-steps-box">` +
        `<div class="fiad-loc-help-steps-label">¿Cómo solucionarlo?</div>` +
        `<ol class="fiad-loc-help-steps">${pasosHTML}</ol>` +
      `</div>` +
      `<div class="fiad-loc-help-actions">` +
        `<button type="button" class="fiad-loc-help-btn-secondary" id="fiad-loc-help-ok">Entendido</button>` +
        btnReintentarHTML +
      `</div>`;

    backdrop.classList.add('is-visible');

    const btnClose = document.getElementById('fiad-loc-help-close');
    const btnOk = document.getElementById('fiad-loc-help-ok');
    const btnRetry = document.getElementById('fiad-loc-help-retry');

    if (btnClose) btnClose.onclick = ocultarPopupAyudaUbicacion;
    if (btnOk) btnOk.onclick = ocultarPopupAyudaUbicacion;
    if (btnRetry) {
      btnRetry.onclick = () => {
        ocultarPopupAyudaUbicacion();
        if (typeof onReintentar === 'function') {
          onReintentar();
        }
      };
    }
  }

  // =========================================================================
  // Sincronización e intercepción global de todos los botones "Cómo llegar"
  // =========================================================================
  function sincronizarBotonesRuta() {
    const btnDirecciones = document.getElementById('btn_direcciones');
    if (btnDirecciones && !btnDirecciones.hasAttribute('data-requiere-ubicacion')) {
      btnDirecciones.setAttribute('data-requiere-ubicacion', 'true');
    }

    const botonesRuta = document.querySelectorAll('[data-requiere-ubicacion]');
    botonesRuta.forEach((el) => {
      if (ubicacionActiva) {
        el.classList.remove('is-ubicacion-bloqueada');
        el.setAttribute('aria-disabled', 'false');
        if (el.dataset.originalTitle !== undefined) {
          el.title = el.dataset.originalTitle;
          delete el.dataset.originalTitle;
        }
      } else {
        if (!el.classList.contains('is-ubicacion-bloqueada')) {
          el.dataset.originalTitle = el.title || '';
        }
        el.classList.add('is-ubicacion-bloqueada');
        el.setAttribute('aria-disabled', 'true');
        el.title = 'Activa tu ubicación para calcular cómo llegar';
      }
    });
  }

  function programarSincronizacionBotones() {
    if (rafSyncBotones !== null) return;
    rafSyncBotones = requestAnimationFrame(() => {
      rafSyncBotones = null;
      sincronizarBotonesRuta();
    });
  }

  function iniciarObservadorBotonesRuta() {
    if (!document.body || typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => {
      programarSincronizacionBotones();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function instalarInterceptorGlobalRutas() {
    // Fase de captura: intercepta cualquier botón "Cómo llegar" actual o futuro antes de ejecutar su acción
    document.addEventListener('click', (event) => {
      const target = event.target;
      const triggerRuta = target && target.closest ? target.closest('[data-requiere-ubicacion], #btn_direcciones') : null;

      if (triggerRuta && !ubicacionActiva) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        mostrarPopupActivarUbicacion();
        return;
      }

      // Si el callout está abierto y el usuario hace clic fuera de él (y fuera del botón de ubicación), cerrarlo
      const callout = document.getElementById('fiad-loc-callout');
      if (callout && callout.classList.contains('is-visible')) {
        const clicDentroCallout = callout.contains(target);
        const clicEnBotonLoc = target && target.closest ? target.closest('#btn-toggle-ubicacion') : null;
        if (!clicDentroCallout && !clicEnBotonLoc) {
          ocultarPopupActivarUbicacion();
        }
      }
    }, true);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        ocultarPopupActivarUbicacion();
        ocultarPopupAyudaUbicacion();
      }
    });

    window.addEventListener('resize', posicionarCalloutEnBoton);
    window.addEventListener('scroll', posicionarCalloutEnBoton, { passive: true });
  }

  function sincronizarPosicionConNavbar() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;

    const actualizarClase = () => {
      document.body.classList.toggle('ui-navbar-collapsed', navbar.classList.contains('search-collapsed'));
      setTimeout(posicionarCalloutEnBoton, 300);
    };

    actualizarClase();
    const observer = new MutationObserver(actualizarClase);
    observer.observe(navbar, { attributes: true, attributeFilter: ['class'] });
  }

  function vincularInteraccionUsuarioMapa() {
    if (listenerMapaVinculado || typeof map === 'undefined') return;
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

    asegurarCalloutDOM();
    const btnCerrarCallout = document.getElementById('fiad-loc-callout-close');

    if (btnCerrarCallout) {
      btnCerrarCallout.addEventListener('click', ocultarPopupActivarUbicacion);
    }

    sincronizarPosicionConNavbar();
    vincularInteraccionUsuarioMapa();
    instalarInterceptorGlobalRutas();
    iniciarObservadorBotonesRuta();

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

      sincronizarBotonesRuta();
    }

    function solicitarUbicacion(esAutomatico) {
      ocultarPopupActivarUbicacion();

      if (!window.isSecureContext) {
        ubicacionActiva = false;
        ultimoTipoError = 'HTTPS_REQUIRED';
        actualizarEstadoUI('is-no-permission', 'Se requiere conexión segura (HTTPS) para usar GPS');
        if (!esAutomatico) {
          mostrarPopupAyudaUbicacion(ultimoTipoError, () => solicitarUbicacion(false));
        }
        return;
      }

      if (!('geolocation' in navigator)) {
        ubicacionActiva = false;
        ultimoTipoError = 'UNSUPPORTED';
        actualizarEstadoUI('is-no-permission', 'Tu navegador no soporta ubicación');
        if (!esAutomatico) {
          mostrarPopupAyudaUbicacion(ultimoTipoError);
        }
        return;
      }

      vincularInteraccionUsuarioMapa();
      ubicacionActiva = true;
      ultimoTipoError = null;
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

          if (!esPrimeraLectura && ultimaPosEmitida) {
            const metrosMovidos = distanciaMetros(ultimaPosEmitida.lat, ultimaPosEmitida.lng, lat, lng);
            if (metrosMovidos < 4) {
              return;
            }
            if (accuracy && accuracy > 65 && metrosMovidos < accuracy * 0.5) {
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
              ultimoTipoError = 'PERMISSION_DENIED';
              mensajeUI = 'Permiso denegado — Habilítalo en el navegador';
              if (!esAutomatico) guardarPreferenciaUbicacion(false);
              break;
            case error.POSITION_UNAVAILABLE:
              ultimoTipoError = 'POSITION_UNAVAILABLE';
              mensajeUI = 'GPS no disponible — Reintentar';
              break;
            case error.TIMEOUT:
            default:
              ultimoTipoError = 'TIMEOUT';
              mensajeUI = 'Tiempo agotado — Reintentar';
              break;
          }

          actualizarEstadoUI('is-no-permission', mensajeUI);
          window.dispatchEvent(new CustomEvent('ubicacionDesactivada'));

          // Si el usuario intentó prenderla manualmente y falló, mostrar guía de solución
          if (!esAutomatico) {
            mostrarPopupAyudaUbicacion(ultimoTipoError, () => solicitarUbicacion(false));
          }
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
      ocultarPopupActivarUbicacion();

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
      solicitarActivar: () => solicitarUbicacion(false),
      requerirUbicacion: () => {
        if (ubicacionActiva) return true;
        mostrarPopupActivarUbicacion();
        return false;
      },
      mostrarAvisoActivar: mostrarPopupActivarUbicacion,
      mostrarAyudaUbicacion: () => {
        mostrarPopupAyudaUbicacion(ultimoTipoError || 'PERMISSION_DENIED', () => solicitarUbicacion(false));
      },
      sincronizarBotonesRuta,
      cancelarPrimerCentrado: () => {
        primerCentrado = false;
      },
      centrarEnUsuario: () => {
        if (ultimaPosEmitida && typeof map !== 'undefined') {
          map.setView([ultimaPosEmitida.lat, ultimaPosEmitida.lng], Math.max(map.getZoom(), 18), { animate: true });
        }
      }
    };

    // Estado inicial por defecto: rojo (sin ubicación) y botones de ruta bloqueados
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