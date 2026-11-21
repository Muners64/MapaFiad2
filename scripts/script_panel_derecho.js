var panel_informacion = document.getElementById('panel_informacion');
var cerrarpanel = document.getElementById('cerrar-panel');

// Caché en memoria y control de tokens para cancelar cualquier respuesta atrasada
var cacheDetalleEdificios = new Map();
var cacheEspaciosEdificios = new Map();
var cacheCubiculosEdificios = new Map();
var tokenSeleccionActual = 0;
var controladorFetchActual = null;

// Control unificado de carga por sección
var tabActualPanel = 'info';
var cargandoDetalleActual = false;
var cargandoSalonesActual = false;
var cargandoCubiculosActual = false;

// Registro global para compartir datos de contacto y título con el modal de horarios
window.datosProfesoresHorario = window.datosProfesoresHorario || {};

function actualizarEstadoCargaVisualPanel() {
    if (!panel_informacion) return;

    var cargandoEnTabActiva = false;
    if (tabActualPanel === 'info') {
        cargandoEnTabActiva = cargandoDetalleActual;
    } else if (tabActualPanel === 'salones') {
        cargandoEnTabActiva = cargandoSalonesActual;
    } else if (tabActualPanel === 'cubiculos') {
        cargandoEnTabActiva = cargandoCubiculosActual;
    }

    panel_informacion.classList.toggle('is-panel-loading', cargandoEnTabActiva);
    requestAnimationFrame(actualizarScrollbarPanel);
}

cerrarpanel.addEventListener('click', function () {
    tokenSeleccionActual++;
    if (controladorFetchActual) {
        controladorFetchActual.abort();
        controladorFetchActual = null;
    }
    cargandoDetalleActual = false;
    cargandoSalonesActual = false;
    cargandoCubiculosActual = false;
    panel_informacion.style.display = 'none';
    panel_informacion.classList.remove('panel-minimized', 'panel-partial', 'panel-expanded', 'is-panel-loading');
    panel_informacion.dataset.panelState = 'closed';
    if (typeof window.limpiarMarcadoresEspacios === 'function') {
        window.limpiarMarcadoresEspacios();
    }
});

var infoTab = document.getElementById('infoTab');
// var interiorTab = document.getElementById('interiorTab'); // Plantas deshabilitado temporalmente
var salonesTab = document.getElementById('salonesTab');
var cubiculosTab = document.getElementById('cubiculosTab');
var infoContent = document.getElementById('infoContent');
// var interiorContent = document.getElementById('interiorContent'); // Plantas deshabilitado temporalmente
var salonesContent = document.getElementById('salonesContent');
var cubiculosContent = document.getElementById('cubiculosContent');
var panelSheetHeader = document.getElementById('panelSheetHeader');
var contenedorPanelInfo = document.getElementById('contenedor_panel_info');
var panelCustomScrollbar = document.getElementById('panelCustomScrollbar');
var panelCustomScrollThumb = document.getElementById('panelCustomScrollThumb');
var btnDireccionesInicial = document.getElementById('btn_direcciones');
if (btnDireccionesInicial) {
    btnDireccionesInicial.setAttribute('data-requiere-ubicacion', 'true');
}
var resaltadoPendiente = null;

/* Sincronización de barra de scroll gris permanente */
function actualizarScrollbarPanel() {
    if (!contenedorPanelInfo || !panelCustomScrollbar || !panelCustomScrollThumb) return;

    if (!panelEstaVisible() || panel_informacion.classList.contains('panel-minimized') || panel_informacion.classList.contains('is-panel-loading')) {
        panelCustomScrollbar.classList.remove('is-visible');
        return;
    }

    var scrollHeight = contenedorPanelInfo.scrollHeight;
    var clientHeight = contenedorPanelInfo.clientHeight;

    if (scrollHeight <= clientHeight + 2 || clientHeight <= 0) {
        panelCustomScrollbar.classList.remove('is-visible');
        return;
    }

    panelCustomScrollbar.classList.add('is-visible');

    var trackHeight = panelCustomScrollbar.clientHeight;
    if (trackHeight <= 0) return;

    var thumbHeight = Math.max(28, Math.round((clientHeight / scrollHeight) * trackHeight));
    if (thumbHeight > trackHeight) thumbHeight = trackHeight;

    var maxScrollTop = scrollHeight - clientHeight;
    var maxThumbTop = trackHeight - thumbHeight;
    var thumbTop = maxScrollTop > 0
        ? Math.min(maxThumbTop, Math.max(0, Math.round((contenedorPanelInfo.scrollTop / maxScrollTop) * maxThumbTop)))
        : 0;

    panelCustomScrollThumb.style.height = thumbHeight + 'px';
    panelCustomScrollThumb.style.transform = 'translateY(' + thumbTop + 'px)';
}

if (contenedorPanelInfo) {
    contenedorPanelInfo.addEventListener('scroll', actualizarScrollbarPanel, { passive: true });

    if (typeof ResizeObserver === 'function') {
        var roPanelScroll = new ResizeObserver(function () {
            actualizarScrollbarPanel();
        });
        roPanelScroll.observe(contenedorPanelInfo);
        if (infoContent) roPanelScroll.observe(infoContent);
        if (salonesContent) roPanelScroll.observe(salonesContent);
        if (cubiculosContent) roPanelScroll.observe(cubiculosContent);
    }

    if (typeof MutationObserver === 'function') {
        var moPanelScroll = new MutationObserver(function () {
            requestAnimationFrame(actualizarScrollbarPanel);
        });
        moPanelScroll.observe(contenedorPanelInfo, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class']
        });
    }
}

/* Soporte de arrastre directo sobre el scrollbar gris en escritorio */
if (panelCustomScrollbar && contenedorPanelInfo) {
    var scrollbarArrastre = { activo: false, inicioY: 0, inicioScrollTop: 0 };

    panelCustomScrollbar.addEventListener('pointerdown', function (event) {
        if (esVistaMovilPanel()) return;
        event.preventDefault();
        scrollbarArrastre.activo = true;
        scrollbarArrastre.inicioY = event.clientY;
        scrollbarArrastre.inicioScrollTop = contenedorPanelInfo.scrollTop;
        panelCustomScrollbar.classList.add('is-dragging');
        if (typeof panelCustomScrollbar.setPointerCapture === 'function') {
            try { panelCustomScrollbar.setPointerCapture(event.pointerId); } catch (e) {}
        }
    });

    panelCustomScrollbar.addEventListener('pointermove', function (event) {
        if (!scrollbarArrastre.activo) return;
        var trackHeight = panelCustomScrollbar.clientHeight;
        var thumbHeight = panelCustomScrollThumb ? panelCustomScrollThumb.offsetHeight : 28;
        var maxThumbTop = Math.max(1, trackHeight - thumbHeight);
        var maxScrollTop = Math.max(0, contenedorPanelInfo.scrollHeight - contenedorPanelInfo.clientHeight);
        var deltaY = event.clientY - scrollbarArrastre.inicioY;
        contenedorPanelInfo.scrollTop = scrollbarArrastre.inicioScrollTop + (deltaY / maxThumbTop) * maxScrollTop;
    });

    function soltarScrollbarArrastre(event) {
        if (!scrollbarArrastre.activo) return;
        scrollbarArrastre.activo = false;
        panelCustomScrollbar.classList.remove('is-dragging');
        if (event && typeof panelCustomScrollbar.releasePointerCapture === 'function') {
            try { panelCustomScrollbar.releasePointerCapture(event.pointerId); } catch (e) {}
        }
    }

    panelCustomScrollbar.addEventListener('pointerup', soltarScrollbarArrastre);
    panelCustomScrollbar.addEventListener('pointercancel', soltarScrollbarArrastre);
}

var panelMovilActivo = window.matchMedia('(max-width: 768px)');
var panelMovilArrastre = {
    activo: false,
    inicioY: 0,
    inicioX: 0,
    inicioHeight: 0,
    currentHeight: 0,
    lastY: 0,
    lastTime: 0,
    armed: false
};

function formatearNombreProfesor(titulo, nombre) {
    var t = String(titulo || '').trim();
    var n = String(nombre || '').trim();
    if (!n) return '';
    if (!t) return n;
    if (n.toLowerCase().indexOf(t.toLowerCase() + ' ') === 0) {
        return n;
    }
    return t + ' ' + n;
}

function formatearTelefonoExtension(telefono, extension) {
    var tel = String(telefono || '').trim();
    var ext = String(extension || '').trim();
    if (tel && ext) return tel + ' · Ext. ' + ext;
    if (tel) return tel;
    if (ext) return 'Ext. ' + ext;
    return '';
}

function formatearNombrePiso(nivelPiso, esPlantaBaja, mayusculas) {
    if (esPlantaBaja) {
        return mayusculas ? 'PLANTA BAJA' : 'Planta Baja';
    }
    var numeroPiso = Number(nivelPiso);
    return mayusculas ? ('PISO ' + numeroPiso) : ('Piso ' + numeroPiso);
}

function obtenerAlturaViewport() {
    if (window.visualViewport && typeof window.visualViewport.height === 'number') {
        return window.visualViewport.height;
    }
    return window.innerHeight;
}

function obtenerAlturaReservadaSuperior() {
    var nav = document.querySelector('.navbar');
    var navBottom = nav ? nav.getBoundingClientRect().bottom : 64;
    var margenSeguridad = 16;
    return Math.max(0, navBottom) + margenSeguridad;
}

function obtenerAlturaMinimizadaMovil() {
    return window.innerWidth <= 480 ? 64 : 66;
}

function obtenerAlturaParcialMovil() {
    var alturaViewport = obtenerAlturaViewport();
    var parcial = Math.round(alturaViewport * 0.45);
    var maximoPermitido = alturaViewport - obtenerAlturaReservadaSuperior();
    return Math.max(240, Math.min(parcial, maximoPermitido));
}

function obtenerAlturaCompletaMovil() {
    var alturaViewport = obtenerAlturaViewport();
    var disponible = alturaViewport - obtenerAlturaReservadaSuperior();
    return Math.max(280, Math.round(disponible));
}

function aplicarEstadoPanelMovil(estado) {
    if (!panel_informacion) return;

    panel_informacion.classList.remove('panel-minimized', 'panel-partial', 'panel-expanded');

    if (estado === 'expanded') {
        panel_informacion.classList.add('panel-expanded');
        panel_informacion.dataset.panelState = 'expanded';
        panel_informacion.style.setProperty('--panel-height', obtenerAlturaCompletaMovil() + 'px');
        requestAnimationFrame(actualizarScrollbarPanel);
        setTimeout(actualizarScrollbarPanel, 300);
        return;
    }

    if (estado === 'minimized') {
        panel_informacion.classList.add('panel-minimized');
        panel_informacion.dataset.panelState = 'minimized';
        panel_informacion.style.setProperty('--panel-height', obtenerAlturaMinimizadaMovil() + 'px');
        actualizarScrollbarPanel();
        return;
    }

    panel_informacion.classList.add('panel-partial');
    panel_informacion.dataset.panelState = 'partial';
    panel_informacion.style.setProperty('--panel-height', obtenerAlturaParcialMovil() + 'px');
    requestAnimationFrame(actualizarScrollbarPanel);
    setTimeout(actualizarScrollbarPanel, 300);
}

function esVistaMovilPanel() {
    return panelMovilActivo && panelMovilActivo.matches;
}

function panelEstaVisible() {
    if (!panel_informacion) return false;
    var disp = panel_informacion.style.display;
    return disp !== '' && disp !== 'none';
}

function abrirPanelMovil() {
    if (!panel_informacion) return;
    aplicarEstadoPanelMovil('partial');
}

function expandirPanelMovil() {
    if (!panel_informacion) return;
    aplicarEstadoPanelMovil('expanded');
}

function minimizarPanelMovil() {
    if (!panel_informacion) return;
    aplicarEstadoPanelMovil('minimized');
}

function cerrarPanelMovil() {
    if (!panel_informacion) return;
    panel_informacion.style.removeProperty('--panel-height');
    panel_informacion.classList.remove('panel-minimized', 'panel-partial', 'panel-expanded', 'is-panel-loading');
    panel_informacion.dataset.panelState = 'closed';
    panel_informacion.style.display = 'none';
}

function actualizarPanelMovilSegunVista() {
    if (!panel_informacion) return;
    if (esVistaMovilPanel()) {
        if (panelEstaVisible() && panel_informacion.dataset.panelState !== 'closed') {
            var estadoPrevio = panel_informacion.dataset.panelState;
            if (estadoPrevio === 'expanded' || estadoPrevio === 'minimized') {
                aplicarEstadoPanelMovil(estadoPrevio);
            } else {
                abrirPanelMovil();
            }
        }
    } else {
        panel_informacion.classList.remove('panel-expanded', 'panel-partial', 'panel-minimized');
        panel_informacion.style.removeProperty('--panel-height');
        panel_informacion.dataset.panelState = '';
        requestAnimationFrame(actualizarScrollbarPanel);
    }
}

if (panelMovilActivo && typeof panelMovilActivo.addEventListener === 'function') {
    panelMovilActivo.addEventListener('change', actualizarPanelMovilSegunVista);
}

function recalcularAlturaPanelMovil() {
    if (!panel_informacion || !esVistaMovilPanel()) {
        requestAnimationFrame(actualizarScrollbarPanel);
        return;
    }
    if (!panelEstaVisible()) return;
    if (panelMovilArrastre.activo) return;

    var estadoActual = 'partial';
    if (panel_informacion.classList.contains('panel-expanded')) {
        estadoActual = 'expanded';
    } else if (panel_informacion.classList.contains('panel-minimized')) {
        estadoActual = 'minimized';
    }
    aplicarEstadoPanelMovil(estadoActual);
}

window.addEventListener('resize', recalcularAlturaPanelMovil);
window.addEventListener('orientationchange', function () {
    setTimeout(recalcularAlturaPanelMovil, 150);
});
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', recalcularAlturaPanelMovil);
}

function obtenerCoordenadasEvento(event) {
    if (event.touches && event.touches.length > 0) {
        return { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }
    if (event.changedTouches && event.changedTouches.length > 0) {
        return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
    }
    return { x: event.clientX, y: event.clientY };
}

function iniciarArrastrePanel(event) {
    if (!esVistaMovilPanel()) return;
    if (!panelEstaVisible()) return;

    var interactiveTarget = event.target && event.target.closest ? event.target.closest('button, a, input, textarea, select, [role="button"]') : null;
    if (interactiveTarget && interactiveTarget.id === 'cerrar-panel') {
        return;
    }

    var coords = obtenerCoordenadasEvento(event);

    panelMovilArrastre.activo = true;
    panelMovilArrastre.armed = false;
    panelMovilArrastre.inicioY = coords.y;
    panelMovilArrastre.inicioX = coords.x;
    panelMovilArrastre.inicioHeight = panel_informacion.getBoundingClientRect().height;
    if (!panelMovilArrastre.inicioHeight) {
        if (panel_informacion.classList.contains('panel-expanded')) {
            panelMovilArrastre.inicioHeight = obtenerAlturaCompletaMovil();
        } else if (panel_informacion.classList.contains('panel-minimized')) {
            panelMovilArrastre.inicioHeight = obtenerAlturaMinimizadaMovil();
        } else {
            panelMovilArrastre.inicioHeight = obtenerAlturaParcialMovil();
        }
    }
    panelMovilArrastre.currentHeight = panelMovilArrastre.inicioHeight;
    panelMovilArrastre.lastY = coords.y;
    panelMovilArrastre.lastTime = Date.now();
    panel_informacion.style.transition = 'none';
    if (typeof event.pointerId === 'number' && event.currentTarget && typeof event.currentTarget.setPointerCapture === 'function') {
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch (error) {}
    }
}

function moverArrastrePanel(event) {
    if (!panelMovilArrastre.activo || !esVistaMovilPanel()) return;

    var coords = obtenerCoordenadasEvento(event);
    var deltaY = coords.y - panelMovilArrastre.inicioY;
    var deltaX = Math.abs(coords.x - panelMovilArrastre.inicioX);
    if (!panelMovilArrastre.armed) {
        if (Math.abs(deltaY) < 8 || Math.abs(deltaY) < deltaX) return;
        panelMovilArrastre.armed = true;
    }

    if (event.cancelable) {
        event.preventDefault();
    }

    var alturaMinima = obtenerAlturaMinimizadaMovil();
    var alturaMaxima = obtenerAlturaCompletaMovil();
    var siguiente = panelMovilArrastre.inicioHeight - deltaY;
    if (siguiente < alturaMinima) siguiente = alturaMinima;
    if (siguiente > alturaMaxima) siguiente = alturaMaxima;

    panelMovilArrastre.currentHeight = siguiente;
    panelMovilArrastre.lastY = coords.y;
    panelMovilArrastre.lastTime = Date.now();

    panel_informacion.classList.remove('panel-minimized', 'panel-partial', 'panel-expanded');
    if (siguiente <= alturaMinima + 18) {
        panel_informacion.classList.add('panel-minimized');
    } else if (siguiente >= alturaMaxima - 24) {
        panel_informacion.classList.add('panel-expanded');
    } else {
        panel_informacion.classList.add('panel-partial');
    }

    panel_informacion.style.setProperty('--panel-height', siguiente + 'px');
    actualizarScrollbarPanel();
}

function finalizarArrastrePanel(event) {
    if (!panelMovilArrastre.activo || !esVistaMovilPanel()) return;
    panelMovilArrastre.activo = false;
    panel_informacion.style.transition = '';

    if (event && typeof event.pointerId === 'number' && event.currentTarget && typeof event.currentTarget.releasePointerCapture === 'function') {
        try { event.currentTarget.releasePointerCapture(event.pointerId); } catch (error) {}
    }

    // Toque simple sobre la cabecera/píldora
    if (!panelMovilArrastre.armed) {
        if (panel_informacion.classList.contains('panel-minimized')) {
            aplicarEstadoPanelMovil('partial');
        } else if (panel_informacion.classList.contains('panel-expanded')) {
            aplicarEstadoPanelMovil('partial');
        } else {
            expandirPanelMovil();
        }
        return;
    }

    var alturaActual = panelMovilArrastre.currentHeight;
    var alturaMin = obtenerAlturaMinimizadaMovil();
    var alturaMid = obtenerAlturaParcialMovil();
    var alturaMax = obtenerAlturaCompletaMovil();
    var tiempoTranscurrido = Math.max(1, Date.now() - panelMovilArrastre.lastTime);
    var velocidad = (panelMovilArrastre.lastY - panelMovilArrastre.inicioY) / tiempoTranscurrido;

    var umbralBajo = alturaMin + ((alturaMid - alturaMin) * 0.45);
    var umbralAlto = alturaMid + ((alturaMax - alturaMid) * 0.45);

    // Deslizamiento rápido hacia arriba
    if (velocidad < -0.65) {
        if (panelMovilArrastre.inicioHeight <= alturaMid + 30 && alturaActual < umbralAlto) {
            aplicarEstadoPanelMovil('partial');
        } else {
            expandirPanelMovil();
        }
        return;
    }

    // Deslizamiento rápido hacia abajo
    if (velocidad > 0.65) {
        if (panelMovilArrastre.inicioHeight >= alturaMid - 30 && alturaActual > umbralBajo) {
            aplicarEstadoPanelMovil('partial');
        } else {
            minimizarPanelMovil();
        }
        return;
    }

    // Ajuste por posición final
    if (alturaActual < umbralBajo) {
        minimizarPanelMovil();
        return;
    }

    if (alturaActual < umbralAlto) {
        aplicarEstadoPanelMovil('partial');
        return;
    }

    expandirPanelMovil();
}

if (panelSheetHeader) {
    panelSheetHeader.addEventListener('pointerdown', iniciarArrastrePanel);
    panelSheetHeader.addEventListener('pointermove', moverArrastrePanel);
    panelSheetHeader.addEventListener('pointerup', finalizarArrastrePanel);
    panelSheetHeader.addEventListener('pointercancel', finalizarArrastrePanel);

    if (!window.PointerEvent) {
        panelSheetHeader.addEventListener('touchstart', iniciarArrastrePanel, { passive: true });
        panelSheetHeader.addEventListener('touchmove', moverArrastrePanel, { passive: false });
        panelSheetHeader.addEventListener('touchend', finalizarArrastrePanel);
        panelSheetHeader.addEventListener('touchcancel', finalizarArrastrePanel);
    }
}

function normalizarTextoBusqueda(texto) {
    return String(texto || '')
        .toLowerCase()
        .replace(/[\s._-]+/g, '')
        .trim();
}

function limpiarResaltados(tab) {
    var selector = tab === 'cubiculos' ? '.cubiculo-item' : '.salon-item';
    document.querySelectorAll(selector).forEach(function (item) {
        item.classList.remove('panel-item-resaltado');
    });
}

function aplicarResaltadoEnTab(tab) {
    if (!resaltadoPendiente || resaltadoPendiente.tab !== tab) {
        return false;
    }

    var selector = tab === 'cubiculos' ? '.cubiculo-item' : '.salon-item';
    var items = Array.from(document.querySelectorAll(selector));
    if (items.length === 0) return false;

    var codigoObjetivo = normalizarTextoBusqueda(resaltadoPendiente.codigo_espacio);
    var textoObjetivo = normalizarTextoBusqueda(resaltadoPendiente.texto);
    var profesorObjetivo = normalizarTextoBusqueda(resaltadoPendiente.profesor);

    var match = items.find(function (item) {
        var codigo = normalizarTextoBusqueda(item.getAttribute('data-codigo-espacio'));
        var nombre = normalizarTextoBusqueda(item.getAttribute('data-nombre-espacio'));
        var profesor = normalizarTextoBusqueda(item.getAttribute('data-profesor'));

        if (codigoObjetivo && codigo === codigoObjetivo) return true;
        if (textoObjetivo && (nombre.indexOf(textoObjetivo) !== -1 || codigo.indexOf(textoObjetivo) !== -1)) return true;
        if (profesorObjetivo && profesor.indexOf(profesorObjetivo) !== -1) return true;
        return false;
    });

    if (!match) return false;

    limpiarResaltados(tab);
    match.classList.add('panel-item-resaltado');
    match.scrollIntoView({ behavior: 'smooth', block: 'center' });
    resaltadoPendiente = null;
    return true;
}

function openTab(tabName) {
    tabActualPanel = tabName;
    if (contenedorPanelInfo) {
        contenedorPanelInfo.scrollTop = 0;
    }

    infoContent.style.display = 'none';
    // if (interiorContent) interiorContent.style.display = 'none'; // Plantas deshabilitado
    salonesContent.style.display = 'none';
    cubiculosContent.style.display = 'none';

    infoTab.classList.remove('active');
    // if (interiorTab) interiorTab.classList.remove('active'); // Plantas deshabilitado
    salonesTab.classList.remove('active');
    cubiculosTab.classList.remove('active');

    if (tabName === 'info') {
        infoContent.style.display = 'block';
        infoTab.classList.add('active');
    /* Plantas deshabilitado temporalmente
    } else if (tabName === 'interior' && interiorContent && interiorTab) {
        interiorContent.style.display = 'block';
        interiorTab.classList.add('active');
    */
    } else if (tabName === 'salones') {
        salonesContent.style.display = 'block';
        salonesTab.classList.add('active');
    } else if (tabName === 'cubiculos') {
        cubiculosContent.style.display = 'block';
        cubiculosTab.classList.add('active');
    }

    actualizarEstadoCargaVisualPanel();
}

window.abrirTabPanel = openTab;

infoTab.addEventListener('click', function () { openTab('info'); });
/* Plantas deshabilitado temporalmente
if (interiorTab) {
    interiorTab.addEventListener('click', function () { openTab('interior'); });
}
*/

function extraerCodigoEdificio(edificio) {
    if (!edificio) return null;
    if (edificio.codigo) return edificio.codigo;
    if (edificio.nombre === "Dirección FIAD") return "E33";
    var match = String(edificio.nombre || '').match(/\d+/);
    return match ? ("E" + match[0]) : null;
}

cubiculosTab.addEventListener('click', function () { 
    openTab('cubiculos');
    if (window.edificioActual) {
        var codigo = extraerCodigoEdificio(window.edificioActual);
        if (codigo) {
            cargarCubiculos(codigo, tokenSeleccionActual);
        }
    }
});

salonesTab.addEventListener('click', function () {
    openTab('salones');
    if (window.edificioActual) {
        var codigo = extraerCodigoEdificio(window.edificioActual);
        if (codigo) {
            cargarSalones(codigo, tokenSeleccionActual);
        }
    }
});
openTab('info');

function construirUrlApi(path) {
    var basePath = window.location.pathname.replace(/\/[^\/]*$/, '');
    return window.location.origin + basePath + '/api/' + path;
}

function agruparEspaciosPorPiso(espacios) {
    var porPiso = {};
    (espacios || []).forEach(function (esp) {
        var raw = Number(esp.nivel_piso);
        var piso = (esp.nivel_piso !== null && esp.nivel_piso !== undefined && String(esp.nivel_piso).trim() !== '' && Number.isFinite(raw))
            ? raw
            : 1;
        if (!porPiso[piso]) porPiso[piso] = [];
        porPiso[piso].push(esp);
    });
    return porPiso;
}

function obtenerClaseBadgeEspacio(esp) {
    var tipoId = Number(esp.id_tipo);
    var nombreTipo = String(esp.nombre_tipo || '').toLowerCase();
    if (tipoId === 2 || nombreTipo.indexOf('lab') !== -1) return 'badge-laboratorio';
    if (tipoId === 3 || nombreTipo.indexOf('taller') !== -1) return 'badge-taller';
    return 'badge-aula';
}

function renderizarSalonesDesdeEspacios(espacios) {
    var salonesContainer = document.getElementById('salonesContent');
    var salonesList = salonesContainer.getElementsByTagName('ul')[0];
    salonesList.innerHTML = '';

    if (!espacios || espacios.length === 0) {
        var mensajeVacio = document.createElement('div');
        mensajeVacio.className = 'salon-mensaje-vacio';
        mensajeVacio.textContent = 'No hay salones/laboratorios/talleres registrados.';
        salonesList.appendChild(mensajeVacio);
        requestAnimationFrame(actualizarScrollbarPanel);
        return;
    }

    var porPiso = agruparEspaciosPorPiso(espacios);
    var pisos = Object.keys(porPiso).sort(function (a, b) { return Number(a) - Number(b); });

    pisos.forEach(function (piso, index) {
        var pisoDiv = document.createElement('div');
        pisoDiv.className = 'salon-piso';

        var pisoHeader = document.createElement('h3');
        pisoHeader.className = 'salon-piso-titulo';
        pisoHeader.textContent = formatearNombrePiso(piso, index === 0, true);
        pisoDiv.appendChild(pisoHeader);

        porPiso[piso].forEach(function (esp) {
            var salonItem = document.createElement('div');
            salonItem.className = 'salon-item';
            salonItem.setAttribute('data-codigo-espacio', esp.codigo_completo || esp.numero_espacio || '');
            salonItem.setAttribute('data-nombre-espacio', esp.nombre_descriptivo || esp.numero_espacio || esp.codigo_completo || '');
            salonItem.setAttribute('data-profesor', esp.profesor_asignado || '');

            var esLaboratorio = Number(esp.id_tipo) === 2;
            var nombre = esLaboratorio
                ? (esp.nombre_descriptivo || esp.numero_espacio || esp.codigo_completo || 'Laboratorio')
                : (esp.numero_espacio || esp.codigo_completo || esp.nombre_descriptivo || 'Espacio');

            if (esp.id_horario && Number(esp.id_horario) > 0) {
                var descAula = (esp.nombre_descriptivo && String(esp.nombre_descriptivo).trim() !== '')
                    ? String(esp.nombre_descriptivo).trim()
                    : String(esp.numero_espacio || esp.codigo_completo || '').trim();
                var tituloAula = [String(esp.codigo_edificio || '').trim(), descAula].filter(Boolean).join(' - ');

                salonItem.setAttribute('data-tipo-espacio', esp.id_tipo || '1');
                salonItem.setAttribute('data-id-horario', esp.id_horario);
                salonItem.setAttribute('data-nombre-salon', tituloAula);
                salonItem.style.cursor = 'pointer';
                salonItem.title = 'Clic para ver horario';
            }

            var infoPrincipal = document.createElement('div');
            infoPrincipal.className = 'salon-info-principal';

            if (esp.nombre_tipo && String(esp.nombre_tipo).trim() !== '') {
                var badgeTipo = document.createElement('span');
                badgeTipo.className = 'salon-tipo-badge ' + obtenerClaseBadgeEspacio(esp);
                badgeTipo.textContent = String(esp.nombre_tipo).trim();
                infoPrincipal.appendChild(badgeTipo);
            }

            var salonCodigo = document.createElement('div');
            salonCodigo.className = 'salon-codigo';
            salonCodigo.textContent = nombre;
            infoPrincipal.appendChild(salonCodigo);

            salonItem.appendChild(infoPrincipal);
            pisoDiv.appendChild(salonItem);
        });

        salonesList.appendChild(pisoDiv);
    });

    aplicarResaltadoEnTab('salones');
    requestAnimationFrame(actualizarScrollbarPanel);
}

function aplicarImagenSegura(imgElement, rutaImagen, tokenEsperado, onListo) {
    if (!imgElement) {
        if (typeof onListo === 'function') onListo();
        return;
    }

    var ruta = String(rutaImagen || '').trim() || 'img/prueba.jpg';
    var preloader = new Image();

    preloader.onload = function () {
        if (tokenEsperado !== tokenSeleccionActual) return;
        imgElement.src = ruta;
        imgElement.style.display = 'block';
        if (typeof onListo === 'function') onListo();
    };

    preloader.onerror = function () {
        if (tokenEsperado !== tokenSeleccionActual) return;
        imgElement.src = 'img/prueba.jpg';
        imgElement.style.display = 'block';
        if (typeof onListo === 'function') onListo();
    };

    preloader.src = ruta;
}

/* Plantas deshabilitado temporalmente
function actualizarVisibilidadPlantas(imagenesPlanos, pisos) {
    if (!interiorTab || !interiorContent) return;

    var planosValidos = (imagenesPlanos || []).filter(function (url) {
        return url && String(url).trim() !== '' && String(url).indexOf('prueba.jpg') === -1;
    });

    if (planosValidos.length === 0) {
        interiorTab.style.display = 'none';
        if (interiorContent.style.display === 'block') {
            openTab('info');
        }
        return;
    }

    interiorTab.style.display = '';
    cargarBotonesPisos({
        pisos: Math.max(Number(pisos || 0), planosValidos.length),
        imagenes: planosValidos,
        imagen: planosValidos[0]
    });
}
*/

function cargarSalones(codigoEdificio, tokenEsperado) {
    var token = tokenEsperado || tokenSeleccionActual;

    if (cacheEspaciosEdificios.has(codigoEdificio)) {
        var espCached = cacheEspaciosEdificios.get(codigoEdificio);
        renderizarSalonesDesdeEspacios(espCached);
        if (token === tokenSeleccionActual) {
            cargandoSalonesActual = false;
            actualizarEstadoCargaVisualPanel();
        }
        if (typeof window.mostrarEspaciosEnMapa === 'function' && window.edificioActual) {
            window.mostrarEspaciosEnMapa(window.edificioActual, espCached);
        }
        return;
    }

    var salonesContainer = document.getElementById('salonesContent');
    var salonesList = salonesContainer.getElementsByTagName('ul')[0];
    salonesList.innerHTML = '';

    if (token === tokenSeleccionActual) {
        cargandoSalonesActual = true;
        actualizarEstadoCargaVisualPanel();
    }

    var apiUrl = construirUrlApi('espacios.php?edificio=' + encodeURIComponent(codigoEdificio) + '&limit=200');

    fetch(apiUrl)
        .then(function (response) { return response.json(); })
        .then(function (data) {
            var espaciosAcad = (data.success && Array.isArray(data.espacios))
                ? data.espacios.filter(function (esp) {
                    var tipo = Number(esp.id_tipo);
                    return tipo === 1 || tipo === 2 || tipo === 3;
                })
                : [];

            cacheEspaciosEdificios.set(codigoEdificio, espaciosAcad);

            if (token !== tokenSeleccionActual) return;

            renderizarSalonesDesdeEspacios(espaciosAcad);
            cargandoSalonesActual = false;
            actualizarEstadoCargaVisualPanel();

            if (typeof window.mostrarEspaciosEnMapa === 'function' && window.edificioActual) {
                window.mostrarEspaciosEnMapa(window.edificioActual, espaciosAcad);
            }
        })
        .catch(function (error) {
            if (error && error.name === 'AbortError') return;
            console.error('Error al cargar salones:', error);
            if (token === tokenSeleccionActual) {
                renderizarSalonesDesdeEspacios([]);
                cargandoSalonesActual = false;
                actualizarEstadoCargaVisualPanel();
            }
        });
}

function aplicarDatosEdificioEnDOM(ed, edificioBase, token) {
    if (token !== tokenSeleccionActual) return;

    document.getElementById('edificioNombre').innerText = ed.nombre_comun || edificioBase.nombre;
    document.getElementById('edificioInfo').innerText = ed.descripcion || 'Sin descripción disponible.';

    var imagenPrincipal = ed.foto_principal_url || 'img/prueba.jpg';
    aplicarImagenSegura(document.getElementById('edificioImagen'), imagenPrincipal, token, function () {
        if (token === tokenSeleccionActual) {
            cargandoDetalleActual = false;
            actualizarEstadoCargaVisualPanel();
        }
    });

    /* Plantas deshabilitado temporalmente
    var imagenesPlanos = [];
    if (Array.isArray(ed.imagenes) && ed.imagenes.length > 0) {
        imagenesPlanos = ed.imagenes
            .filter(function (img) {
                var tipo = String(img.tipo_imagen || '').toLowerCase();
                return tipo === 'plano' || tipo === 'planta' || Number(img.orden) > 1;
            })
            .sort(function (a, b) { return Number(a.orden) - Number(b.orden); })
            .map(function (img) { return img.url; });
    }

    actualizarVisibilidadPlantas(imagenesPlanos, ed.numero_pisos);
    if (imagenesPlanos.length > 0) {
        aplicarImagenSegura(document.getElementById('interiorImagen'), imagenesPlanos[0], token);
    }
    */

    if (ed.latitud && ed.longitud) {
        edificioBase._coordsAPI = [parseFloat(ed.latitud), parseFloat(ed.longitud)];
    }

    requestAnimationFrame(actualizarScrollbarPanel);
}

function mostrarPanelEdificio(edificio) {
    // 1. Invalidar cualquier clic/petición anterior al instante
    var miToken = ++tokenSeleccionActual;
    if (controladorFetchActual) {
        controladorFetchActual.abort();
    }
    controladorFetchActual = new AbortController();
    var signal = controladorFetchActual.signal;

    window.edificioActual = edificio;

    // 2. Limpiar contenido anterior de TODAS las pestañas al instante
    var infoEl = document.getElementById('edificioInfo');
    var imgEl = document.getElementById('edificioImagen');
    var salonesListEl = document.getElementById('salonesContent').getElementsByTagName('ul')[0];
    var cubiculosListEl = document.getElementById('cubiculosList');

    if (infoEl) infoEl.textContent = '';
    if (imgEl) {
        imgEl.removeAttribute('src');
        imgEl.alt = edificio.nombre;
    }
    if (salonesListEl) salonesListEl.innerHTML = '';
    if (cubiculosListEl) cubiculosListEl.innerHTML = '';
    document.getElementById('cubiculosLoading').style.display = 'none';
    if (contenedorPanelInfo) contenedorPanelInfo.scrollTop = 0;
    // actualizarVisibilidadPlantas([], 0); // Plantas deshabilitado temporalmente

    var codigoAPI = extraerCodigoEdificio(edificio);

    // 3. Determinar estados de carga iniciales según caché
    var tieneDetalleCache = Boolean(codigoAPI && cacheDetalleEdificios.has(codigoAPI));
    var tieneEspaciosCache = Boolean(codigoAPI && cacheEspaciosEdificios.has(codigoAPI));
    var tieneCubiculosCache = Boolean(codigoAPI && cacheCubiculosEdificios.has(codigoAPI));

    cargandoDetalleActual = Boolean(codigoAPI && !tieneDetalleCache);
    cargandoSalonesActual = Boolean(codigoAPI && !tieneEspaciosCache);
    cargandoCubiculosActual = Boolean(codigoAPI && tabActualPanel === 'cubiculos' && !tieneCubiculosCache);

    // 4. Abrir panel de inmediato con estado limpio
    document.getElementById('edificioNombre').innerText = edificio.nombre;
    panel_informacion.style.display = 'block';
    panel_informacion.dataset.panelState = esVistaMovilPanel() ? 'partial' : 'expanded';
    actualizarEstadoCargaVisualPanel();

    if (window.UbicacionCampus && typeof window.UbicacionCampus.sincronizarBotonesRuta === 'function') {
        window.UbicacionCampus.sincronizarBotonesRuta();
    }

    if (esVistaMovilPanel()) {
        requestAnimationFrame(function () {
            if (miToken === tokenSeleccionActual) abrirPanelMovil();
        });
    } else {
        panel_informacion.classList.remove('panel-expanded', 'panel-partial', 'panel-minimized');
        requestAnimationFrame(actualizarScrollbarPanel);
    }

    // 5. Si la pestaña Cubículos está activa, iniciar su carga de inmediato
    if (tabActualPanel === 'cubiculos' && codigoAPI) {
        cargarCubiculos(codigoAPI, miToken);
    }

    // 6. Si ya está en caché en memoria: renderizado instantáneo
    if (tieneDetalleCache) {
        var edCached = cacheDetalleEdificios.get(codigoAPI);
        aplicarDatosEdificioEnDOM(edCached, edificio, miToken);

        if (tieneEspaciosCache) {
            var espCached = cacheEspaciosEdificios.get(codigoAPI);
            renderizarSalonesDesdeEspacios(espCached);
            cargandoSalonesActual = false;
            actualizarEstadoCargaVisualPanel();
            if (typeof window.mostrarEspaciosEnMapa === 'function') {
                window.mostrarEspaciosEnMapa(edificio, espCached);
            }
        } else {
            cargarSalones(codigoAPI, miToken);
        }
    } else if (codigoAPI) {
        var urlEdificio = construirUrlApi('edificios.php?codigo=' + encodeURIComponent(codigoAPI));
        var urlEspacios = construirUrlApi('espacios.php?edificio=' + encodeURIComponent(codigoAPI) + '&limit=200');

        Promise.all([
            fetch(urlEdificio, { signal: signal }).then(function (r) { return r.json(); }),
            fetch(urlEspacios, { signal: signal }).then(function (r) { return r.json(); })
        ])
            .then(function (responses) {
                var dataEdificio = responses[0];
                var dataEspacios = responses[1];

                if (dataEdificio.success && dataEdificio.edificio) {
                    cacheDetalleEdificios.set(codigoAPI, dataEdificio.edificio);
                }

                var espaciosAcad = (dataEspacios.success && Array.isArray(dataEspacios.espacios))
                    ? dataEspacios.espacios.filter(function (esp) {
                        var tipo = Number(esp.id_tipo);
                        return tipo === 1 || tipo === 2 || tipo === 3;
                    })
                    : [];
                cacheEspaciosEdificios.set(codigoAPI, espaciosAcad);

                if (miToken !== tokenSeleccionActual) return;

                renderizarSalonesDesdeEspacios(espaciosAcad);
                cargandoSalonesActual = false;

                if (dataEdificio.success && dataEdificio.edificio) {
                    aplicarDatosEdificioEnDOM(dataEdificio.edificio, edificio, miToken);
                } else {
                    cargandoDetalleActual = false;
                }

                actualizarEstadoCargaVisualPanel();

                if (typeof window.mostrarEspaciosEnMapa === 'function') {
                    window.mostrarEspaciosEnMapa(edificio, espaciosAcad);
                }
            })
            .catch(function (error) {
                if (error && error.name === 'AbortError') return;
                console.error('No se pudo cargar detalle de edificio desde API:', error);
                if (miToken === tokenSeleccionActual) {
                    renderizarSalonesDesdeEspacios([]);
                    cargandoDetalleActual = false;
                    cargandoSalonesActual = false;
                    actualizarEstadoCargaVisualPanel();
                }
            });
    } else {
        cargandoDetalleActual = false;
        cargandoSalonesActual = false;
        cargandoCubiculosActual = false;
        actualizarEstadoCargaVisualPanel();
    }

    var btnDirecciones = document.getElementById('btn_direcciones');
    if (btnDirecciones) {
        btnDirecciones.setAttribute('data-requiere-ubicacion', 'true');
        btnDirecciones.onclick = function () {
            if (window.UbicacionCampus && typeof window.UbicacionCampus.requerirUbicacion === 'function') {
                if (!window.UbicacionCampus.requerirUbicacion()) {
                    return;
                }
            }

            if (edificio) {
                var destinoCoords = (typeof window.obtenerPuntoEdificio === 'function')
                    ? window.obtenerPuntoEdificio(edificio)
                    : (edificio.labelCoords || edificio.coords[0]);
                if (!destinoCoords) return;

                var nombreDestino = document.getElementById('edificioNombre').innerText || edificio.nombre || edificio.codigo || 'Destino';

                if (typeof window.iniciarRutaHacia === 'function') {
                    window.iniciarRutaHacia(destinoCoords, nombreDestino);
                } else {
                    endPoint = destinoCoords;
                    window.destinoNombreActual = nombreDestino;
                    if (window.endMarker) map.removeLayer(window.endMarker);
                    window.endMarker = L.marker(endPoint, {
                        draggable: true,
                        icon: window.iconoDestinoRojo
                    }).addTo(map);
                    if (typeof window.limpiarMarcadoresEspacios === 'function') {
                        window.limpiarMarcadoresEspacios();
                    }
                    updateRoute(true);
                }

                panel_informacion.style.display = 'none';
            }
        };
    }
}

/* Plantas deshabilitado temporalmente
function cargarBotonesPisos(edificio) {
    var container = document.getElementById('floorButtonsContainer');
    if (!container) return;
    container.innerHTML = '';

    if (edificio.pisos && edificio.pisos > 0) {
        var imagenesPisos = Array.isArray(edificio.imagenes) ? edificio.imagenes : [];

        for (var i = 0; i < edificio.pisos; i++) {
            var boton = document.createElement('button');
            boton.textContent = (i + 1);
            boton.classList.add('floor-button');

            boton.addEventListener('click', function (imagen) {
                return function () {
                    aplicarImagenSegura(document.getElementById('interiorImagen'), imagen, tokenSeleccionActual);
                };
            }(imagenesPisos[i] || edificio.imagen));

            container.appendChild(boton);
        }
    }
}
*/

function cargarCubiculos(codigoEdificio, tokenEsperado) {
    var token = tokenEsperado || tokenSeleccionActual;
    var cubiculosList = document.getElementById('cubiculosList');
    var loadingDiv = document.getElementById('cubiculosLoading');

    if (cacheCubiculosEdificios.has(codigoEdificio)) {
        loadingDiv.style.display = 'none';
        var cubCached = cacheCubiculosEdificios.get(codigoEdificio);
        if (cubCached.length > 0) {
            mostrarCubiculos(cubCached);
        } else {
            cubiculosList.innerHTML = '<li class="cubiculo-mensaje-vacio">No hay cubículos registrados en este edificio.</li>';
        }
        if (token === tokenSeleccionActual) {
            cargandoCubiculosActual = false;
            actualizarEstadoCargaVisualPanel();
        }
        return;
    }

    loadingDiv.style.display = 'none';
    cubiculosList.innerHTML = '';

    if (token === tokenSeleccionActual) {
        cargandoCubiculosActual = true;
        actualizarEstadoCargaVisualPanel();
    }

    var basePath = window.location.pathname.replace(/\/[^\/]*$/, '');
    var apiUrl = window.location.origin + basePath + '/api/espacios.php?tipo=4&edificio=' + encodeURIComponent(codigoEdificio);

    fetch(apiUrl)
        .then(function (response) { return response.json(); })
        .then(function (data) {
            var lista = (data.success && Array.isArray(data.espacios)) ? data.espacios : [];
            cacheCubiculosEdificios.set(codigoEdificio, lista);

            if (token !== tokenSeleccionActual) return;

            if (lista.length > 0) {
                mostrarCubiculos(lista);
            } else {
                cubiculosList.innerHTML = '<li class="cubiculo-mensaje-vacio">No hay cubículos registrados en este edificio.</li>';
            }
            cargandoCubiculosActual = false;
            actualizarEstadoCargaVisualPanel();
        })
        .catch(function (error) {
            if (error && error.name === 'AbortError') return;
            console.error('Error al cargar cubículos:', error);
            if (token === tokenSeleccionActual) {
                cubiculosList.innerHTML = '<li class="cubiculo-mensaje-vacio" style="color: #dc2626;">Error al cargar cubículos. Intenta de nuevo.</li>';
                cargandoCubiculosActual = false;
                actualizarEstadoCargaVisualPanel();
            }
        });
}

function mostrarCubiculos(cubiculos) {
    var cubiculosList = document.getElementById('cubiculosList');
    cubiculosList.innerHTML = '';

    var cubiculosPorPiso = agruparEspaciosPorPiso(cubiculos);
    var pisos = Object.keys(cubiculosPorPiso).sort(function (a, b) { return Number(a) - Number(b); });

    pisos.forEach(function (piso, index) {
        var pisoDiv = document.createElement('div');
        pisoDiv.className = 'cubiculo-piso';

        var pisoHeader = document.createElement('h3');
        pisoHeader.className = 'cubiculo-piso-titulo';
        pisoHeader.textContent = formatearNombrePiso(piso, index === 0, false);
        pisoDiv.appendChild(pisoHeader);

        cubiculosPorPiso[piso].forEach(function (cubiculo) {
            var tituloProf = String(
                cubiculo.titulo_profesor ||
                cubiculo.profesor_titulo ||
                cubiculo.titulo ||
                ''
            ).trim();
            var nombreBaseProf = String(cubiculo.profesor_asignado || '').trim();
            var nombreConTitulo = formatearNombreProfesor(tituloProf, nombreBaseProf);

            var emailProf = String(
                cubiculo.email_profesor ||
                cubiculo.profesor_email ||
                cubiculo.email ||
                ''
            ).trim();
            var telefonoProf = String(
                cubiculo.telefono_profesor ||
                cubiculo.profesor_telefono ||
                cubiculo.telefono ||
                ''
            ).trim();
            var extensionProf = String(
                cubiculo.extension_profesor ||
                cubiculo.profesor_extension ||
                cubiculo.extension ||
                ''
            ).trim();

            var cubiculoItem = document.createElement('div');
            cubiculoItem.className = 'cubiculo-item';
            cubiculoItem.setAttribute('data-codigo-espacio', cubiculo.codigo_completo || cubiculo.numero_espacio || '');
            cubiculoItem.setAttribute('data-nombre-espacio', cubiculo.numero_espacio || cubiculo.codigo_completo || '');
            cubiculoItem.setAttribute('data-profesor', nombreConTitulo || nombreBaseProf);

            var numEmpleado = String(cubiculo.numero_empleado || '').trim();
            if (nombreBaseProf && numEmpleado !== '') {
                var tituloCubiculo = [
                    String(cubiculo.codigo_edificio || '').trim(),
                    String(cubiculo.numero_espacio || cubiculo.codigo_completo || '').trim(),
                    nombreConTitulo
                ].filter(Boolean).join(' - ');

                cubiculoItem.setAttribute('data-tipo-espacio', '4');
                cubiculoItem.setAttribute('data-num-empleado', numEmpleado);
                cubiculoItem.setAttribute('data-nombre-salon', tituloCubiculo);
                if (tituloProf) cubiculoItem.setAttribute('data-profesor-titulo', tituloProf);
                if (emailProf) cubiculoItem.setAttribute('data-profesor-email', emailProf);
                if (telefonoProf) cubiculoItem.setAttribute('data-profesor-telefono', telefonoProf);
                if (extensionProf) cubiculoItem.setAttribute('data-profesor-extension', extensionProf);
                cubiculoItem.style.cursor = 'pointer';
                cubiculoItem.title = 'Clic para ver horario';

                window.datosProfesoresHorario[numEmpleado] = {
                    titulo: tituloProf,
                    nombre: nombreBaseProf,
                    nombre_completo: nombreConTitulo,
                    email: emailProf,
                    telefono: telefonoProf,
                    extension: extensionProf
                };
            }

            var codigoDiv = document.createElement('div');
            codigoDiv.className = 'cubiculo-codigo';
            codigoDiv.textContent = cubiculo.numero_espacio || cubiculo.codigo_completo;

            var profesorDiv = document.createElement('div');
            if (nombreBaseProf) {
                profesorDiv.className = 'cubiculo-profesor';
                profesorDiv.textContent = nombreConTitulo;
            } else {
                profesorDiv.className = 'cubiculo-profesor cubiculo-sin-profesor';
                profesorDiv.textContent = 'Sin profesor asignado';
            }

            cubiculoItem.appendChild(codigoDiv);
            cubiculoItem.appendChild(profesorDiv);

            // Datos de contacto en la tarjeta del cubículo
            var telFormateado = formatearTelefonoExtension(telefonoProf, extensionProf);
            if (nombreBaseProf && (emailProf || telFormateado)) {
                var contactoDiv = document.createElement('div');
                contactoDiv.className = 'cubiculo-contacto';

                if (emailProf) {
                    var emailRow = document.createElement('div');
                    emailRow.className = 'cubiculo-contacto-item';

                    var emailIcon = document.createElement('span');
                    emailIcon.className = 'cubiculo-contacto-icono icono-email';
                    emailIcon.setAttribute('aria-hidden', 'true');

                    var emailLink = document.createElement('a');
                    emailLink.href = 'mailto:' + emailProf;
                    emailLink.textContent = emailProf;
                    emailLink.title = 'Enviar correo a ' + nombreConTitulo;

                    emailRow.appendChild(emailIcon);
                    emailRow.appendChild(emailLink);
                    contactoDiv.appendChild(emailRow);
                }

                if (telFormateado) {
                    var telRow = document.createElement('div');
                    telRow.className = 'cubiculo-contacto-item';

                    var telIcon = document.createElement('span');
                    telIcon.className = 'cubiculo-contacto-icono icono-telefono';
                    telIcon.setAttribute('aria-hidden', 'true');

                    var telText = document.createElement('span');
                    telText.textContent = telFormateado;

                    telRow.appendChild(telIcon);
                    telRow.appendChild(telText);
                    contactoDiv.appendChild(telRow);
                }

                cubiculoItem.appendChild(contactoDiv);
            }

            pisoDiv.appendChild(cubiculoItem);
        });

        cubiculosList.appendChild(pisoDiv);
    });

    aplicarResaltadoEnTab('cubiculos');
    requestAnimationFrame(actualizarScrollbarPanel);
}

window.buscarYResaltarEnPanel = function (opciones) {
    if (!opciones || !opciones.tab) return;

    var tab = opciones.tab === 'cubiculos' ? 'cubiculos' : 'salones';
    resaltadoPendiente = {
        tab: tab,
        codigo_espacio: opciones.codigo_espacio || '',
        texto: opciones.texto || '',
        profesor: opciones.profesor || ''
    };

    openTab(tab);

    if (window.edificioActual) {
        var codigo = extraerCodigoEdificio(window.edificioActual);
        if (codigo) {
            if (tab === 'cubiculos') {
                cargarCubiculos(codigo, tokenSeleccionActual);
            } else {
                cargarSalones(codigo, tokenSeleccionActual);
            }
        }
    }

    setTimeout(function () {
        aplicarResaltadoEnTab(tab);
        actualizarScrollbarPanel();
    }, 400);
};