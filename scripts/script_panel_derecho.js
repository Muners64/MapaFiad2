var panel_informacion = document.getElementById('panel_informacion');
var cerrarpanel = document.getElementById('cerrar-panel');

// Caché en memoria y control de tokens para cancelar cualquier respuesta atrasada
var cacheDetalleEdificios = new Map();
var cacheEspaciosEdificios = new Map();
var cacheCubiculosEdificios = new Map();
var tokenSeleccionActual = 0;
var controladorFetchActual = null;

cerrarpanel.addEventListener('click', function () {
    tokenSeleccionActual++;
    if (controladorFetchActual) {
        controladorFetchActual.abort();
        controladorFetchActual = null;
    }
    panel_informacion.style.display = 'none';
    panel_informacion.classList.remove('panel-expanded');
    panel_informacion.dataset.panelState = 'collapsed';
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
var panelHandle = document.getElementById('panelHandle');
var resaltadoPendiente = null;

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

    panel_informacion.classList.remove('panel-partial', 'panel-expanded');

    if (estado === 'expanded') {
        panel_informacion.classList.add('panel-expanded');
        panel_informacion.dataset.panelState = 'expanded';
        panel_informacion.style.setProperty('--panel-height', obtenerAlturaCompletaMovil() + 'px');
        return;
    }

    panel_informacion.classList.add('panel-partial');
    panel_informacion.dataset.panelState = 'partial';
    panel_informacion.style.setProperty('--panel-height', obtenerAlturaParcialMovil() + 'px');
}

function esVistaMovilPanel() {
    return panelMovilActivo && panelMovilActivo.matches;
}

function abrirPanelMovil() {
    if (!panel_informacion) return;
    aplicarEstadoPanelMovil('partial');
}

function expandirPanelMovil() {
    if (!panel_informacion) return;
    aplicarEstadoPanelMovil('expanded');
}

function cerrarPanelMovil() {
    if (!panel_informacion) return;
    panel_informacion.style.removeProperty('--panel-height');
    panel_informacion.classList.remove('panel-partial', 'panel-expanded');
    panel_informacion.dataset.panelState = 'collapsed';
    panel_informacion.style.display = 'none';
}

function actualizarPanelMovilSegunVista() {
    if (!panel_informacion) return;
    if (esVistaMovilPanel()) {
        if (panel_informacion.style.display === 'block' && panel_informacion.dataset.panelState !== 'collapsed') {
            abrirPanelMovil();
        }
    } else {
        panel_informacion.classList.remove('panel-expanded');
        panel_informacion.classList.remove('panel-partial');
        panel_informacion.style.removeProperty('--panel-height');
        panel_informacion.dataset.panelState = '';
    }
}

if (panelMovilActivo && typeof panelMovilActivo.addEventListener === 'function') {
    panelMovilActivo.addEventListener('change', actualizarPanelMovilSegunVista);
}

function recalcularAlturaPanelMovil() {
    if (!panel_informacion || !esVistaMovilPanel()) return;
    if (panel_informacion.style.display !== 'block') return;
    if (panelMovilArrastre.activo) return;

    var estadoActual = panel_informacion.classList.contains('panel-expanded') ? 'expanded' : 'partial';
    aplicarEstadoPanelMovil(estadoActual);
}

window.addEventListener('resize', recalcularAlturaPanelMovil);
window.addEventListener('orientationchange', function () {
    setTimeout(recalcularAlturaPanelMovil, 150);
});
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', recalcularAlturaPanelMovil);
}

if (panelHandle) {
    panelHandle.addEventListener('click', function () {
        if (!esVistaMovilPanel()) return;

        if (panelMovilArrastre.ignorarProximoClick) {
            panelMovilArrastre.ignorarProximoClick = false;
            return;
        }
        if (panel_informacion.classList.contains('panel-expanded')) {
            aplicarEstadoPanelMovil('partial');
        } else {
            expandirPanelMovil();
        }
    });
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
    if (!panel_informacion || panel_informacion.style.display !== 'block') return;

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
    if (!panelMovilArrastre.inicioHeight && panel_informacion.classList.contains('panel-expanded')) {
        panelMovilArrastre.inicioHeight = obtenerAlturaCompletaMovil();
    }
    if (!panelMovilArrastre.inicioHeight && panel_informacion.classList.contains('panel-partial')) {
        panelMovilArrastre.inicioHeight = obtenerAlturaParcialMovil();
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

    var alturaMinima = obtenerAlturaParcialMovil();
    var alturaMaxima = obtenerAlturaCompletaMovil();
    var siguiente = panelMovilArrastre.inicioHeight - deltaY;
    if (siguiente < alturaMinima) siguiente = alturaMinima;
    if (siguiente > alturaMaxima) siguiente = alturaMaxima;

    panelMovilArrastre.currentHeight = siguiente;
    panelMovilArrastre.lastY = coords.y;
    panelMovilArrastre.lastTime = Date.now();

    if (siguiente >= alturaMaxima - 24) {
        panel_informacion.classList.add('panel-expanded');
        panel_informacion.classList.remove('panel-partial');
    } else {
        panel_informacion.classList.add('panel-partial');
        panel_informacion.classList.remove('panel-expanded');
    }

    panel_informacion.style.setProperty('--panel-height', siguiente + 'px');
}

function finalizarArrastrePanel(event) {
    if (!panelMovilArrastre.activo || !esVistaMovilPanel()) return;
    panelMovilArrastre.activo = false;
    panel_informacion.style.transition = '';

    if (event && typeof event.pointerId === 'number' && event.currentTarget && typeof event.currentTarget.releasePointerCapture === 'function') {
        try { event.currentTarget.releasePointerCapture(event.pointerId); } catch (error) {}
    }

    if (!panelMovilArrastre.armed) {
        if (panel_informacion.classList.contains('panel-expanded')) {
            aplicarEstadoPanelMovil('partial');
        } else {
            expandirPanelMovil();
        }
        return;
    }

    panelMovilArrastre.ignorarProximoClick = true;

    var alturaActual = panelMovilArrastre.currentHeight;
    var alturaParcial = obtenerAlturaParcialMovil();
    var alturaCompleta = obtenerAlturaCompletaMovil();
    var tiempoTranscurrido = Math.max(1, Date.now() - panelMovilArrastre.lastTime);
    var velocidad = (panelMovilArrastre.lastY - panelMovilArrastre.inicioY) / tiempoTranscurrido;

    if (velocidad < -0.7) {
        expandirPanelMovil();
        return;
    }

    if (velocidad > 0.7) {
        aplicarEstadoPanelMovil('partial');
        return;
    }

    var puntoMedio = alturaParcial + ((alturaCompleta - alturaParcial) * 0.5);
    if (alturaActual >= puntoMedio) {
        expandirPanelMovil();
        return;
    }

    aplicarEstadoPanelMovil('partial');
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
        var piso = (esp.nivel_piso !== null && esp.nivel_piso !== undefined) ? esp.nivel_piso : 0;
        if (!porPiso[piso]) porPiso[piso] = [];
        porPiso[piso].push(esp);
    });
    return porPiso;
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
        return;
    }

    var porPiso = agruparEspaciosPorPiso(espacios);
    var pisos = Object.keys(porPiso).sort(function (a, b) { return Number(a) - Number(b); });

    pisos.forEach(function (piso) {
        var pisoDiv = document.createElement('div');
        pisoDiv.className = 'salon-piso';

        var pisoHeader = document.createElement('h3');
        pisoHeader.className = 'salon-piso-titulo';
        pisoHeader.textContent = Number(piso) === 0 ? 'PLANTA BAJA' : ('PISO ' + piso);
        pisoDiv.appendChild(pisoHeader);

        porPiso[piso].forEach(function (esp) {
            var salonItem = document.createElement('div');
            salonItem.className = 'salon-item';
            salonItem.setAttribute('data-codigo-espacio', esp.codigo_completo || esp.numero_espacio || '');
            salonItem.setAttribute('data-nombre-espacio', esp.nombre_descriptivo || esp.numero_espacio || esp.codigo_completo || '');
            salonItem.setAttribute('data-profesor', esp.profesor_asignado || '');

            var tipo = esp.nombre_tipo ? ('[' + esp.nombre_tipo + '] ') : '';
            var esLaboratorio = Number(esp.id_tipo) === 2;
            var nombre = esLaboratorio
                ? (esp.nombre_descriptivo || esp.numero_espacio || esp.codigo_completo || 'Laboratorio')
                : (esp.numero_espacio || esp.codigo_completo || esp.nombre_descriptivo || 'Espacio');

            if (esp.id_horario && Number(esp.id_horario) > 0) {
                salonItem.setAttribute('data-id-horario', esp.id_horario);
                salonItem.setAttribute('data-nombre-salon', (esp.codigo_completo ? esp.codigo_completo + ' - ' : '') + nombre);
                salonItem.style.cursor = 'pointer';
                salonItem.title = 'Clic para ver horario';
            }

            var salonCodigo = document.createElement('div');
            salonCodigo.className = 'salon-codigo';
            salonCodigo.textContent = tipo + nombre;

            salonItem.appendChild(salonCodigo);
            pisoDiv.appendChild(salonItem);
        });

        salonesList.appendChild(pisoDiv);
    });

    aplicarResaltadoEnTab('salones');
}

function establecerEstadoSkeletonTarjeta(cargando) {
    var contenedor = document.querySelector('.contenedor_edificio_info');
    var infoEl = document.getElementById('edificioInfo');
    var infoTabContent = document.getElementById('infoContent');
    var panelScroll = document.getElementById('contenedor_panel_info');
    if (!contenedor) return;

    if (cargando) {
        if (infoEl) infoEl.textContent = '';
        if (infoTabContent) infoTabContent.scrollTop = 0;
        if (panelScroll) panelScroll.scrollTop = 0;
        contenedor.classList.add('is-loading');
    } else {
        contenedor.classList.remove('is-loading');
    }
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
        if (typeof window.mostrarEspaciosEnMapa === 'function' && window.edificioActual) {
            window.mostrarEspaciosEnMapa(window.edificioActual, espCached);
        }
        return;
    }

    var salonesContainer = document.getElementById('salonesContent');
    var salonesList = salonesContainer.getElementsByTagName('ul')[0];
    salonesList.innerHTML = '<div class="spinner-lista-centro"></div>';

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
            if (typeof window.mostrarEspaciosEnMapa === 'function' && window.edificioActual) {
                window.mostrarEspaciosEnMapa(window.edificioActual, espaciosAcad);
            }
        })
        .catch(function (error) {
            if (error && error.name === 'AbortError') return;
            console.error('Error al cargar salones:', error);
            if (token === tokenSeleccionActual) {
                renderizarSalonesDesdeEspacios([]);
            }
        });
}

function aplicarDatosEdificioEnDOM(ed, edificioBase, token) {
    if (token !== tokenSeleccionActual) return;

    document.getElementById('edificioNombre').innerText = ed.nombre_comun || edificioBase.nombre;
    document.getElementById('edificioInfo').innerText = ed.descripcion || 'Sin descripción disponible.';

    var imagenPrincipal = ed.foto_principal_url || 'img/prueba.jpg';
    aplicarImagenSegura(document.getElementById('edificioImagen'), imagenPrincipal, token, function () {
        establecerEstadoSkeletonTarjeta(false);
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

    // Resetear listas internas
    document.getElementById('cubiculosList').innerHTML = '';
    document.getElementById('cubiculosLoading').style.display = 'none';
    // actualizarVisibilidadPlantas([], 0); // Plantas deshabilitado temporalmente

    var codigoAPI = extraerCodigoEdificio(edificio);

    // Abrir panel de inmediato
    document.getElementById('edificioImagen').alt = edificio.nombre;
    document.getElementById('edificioNombre').innerText = edificio.nombre;
    panel_informacion.style.display = 'block';
    panel_informacion.dataset.panelState = esVistaMovilPanel() ? 'partial' : 'expanded';

    if (esVistaMovilPanel()) {
        requestAnimationFrame(function () {
            if (miToken === tokenSeleccionActual) abrirPanelMovil();
        });
    } else {
        panel_informacion.classList.remove('panel-expanded');
        panel_informacion.classList.remove('panel-partial');
    }

    if (cubiculosContent.style.display === 'block' && codigoAPI) {
        cargarCubiculos(codigoAPI, miToken);
    }

    // Si ya está en caché en memoria: renderizado instantáneo (0 ms, 0 fetch)
    if (codigoAPI && cacheDetalleEdificios.has(codigoAPI)) {
        var edCached = cacheDetalleEdificios.get(codigoAPI);
        aplicarDatosEdificioEnDOM(edCached, edificio, miToken);

        if (cacheEspaciosEdificios.has(codigoAPI)) {
            var espCached = cacheEspaciosEdificios.get(codigoAPI);
            renderizarSalonesDesdeEspacios(espCached);
            if (typeof window.mostrarEspaciosEnMapa === 'function') {
                window.mostrarEspaciosEnMapa(edificio, espCached);
            }
        } else {
            cargarSalones(codigoAPI, miToken);
        }
    } else {
        // Mostrar spinner limpio mientras llega la única petición de detalle + espacios
        establecerEstadoSkeletonTarjeta(true);

        if (codigoAPI) {
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

                    if (dataEdificio.success && dataEdificio.edificio) {
                        aplicarDatosEdificioEnDOM(dataEdificio.edificio, edificio, miToken);
                    } else {
                        establecerEstadoSkeletonTarjeta(false);
                    }

                    renderizarSalonesDesdeEspacios(espaciosAcad);
                    if (typeof window.mostrarEspaciosEnMapa === 'function') {
                        window.mostrarEspaciosEnMapa(edificio, espaciosAcad);
                    }
                })
                .catch(function (error) {
                    if (error && error.name === 'AbortError') return;
                    console.error('No se pudo cargar detalle de edificio desde API:', error);
                    if (miToken === tokenSeleccionActual) {
                        establecerEstadoSkeletonTarjeta(false);
                    }
                });
        }
    }

    document.getElementById('btn_direcciones').onclick = function () {
        if (edificio) {
            endPoint = (typeof window.obtenerPuntoEdificio === 'function')
                ? window.obtenerPuntoEdificio(edificio)
                : (edificio.labelCoords || edificio.coords[0]);
            if (!endPoint) return;

            if (window.endMarker) {
                map.removeLayer(window.endMarker);
            }

            var opcionesMarcador = { draggable: true };
            if (window.iconoDestinoRojo) {
                opcionesMarcador.icon = window.iconoDestinoRojo;
            }

            window.endMarker = L.marker(endPoint, opcionesMarcador).addTo(map);
            window.endMarker.on('dragend', function () {
                endPoint = window.endMarker.getLatLng();
                updateRoute();
            });

            // Limpiar el pin verde de selección para que no se encime con el pin rojo de destino
            if (typeof window.limpiarMarcadoresEspacios === 'function') {
                window.limpiarMarcadoresEspacios();
            }

            updateRoute();
            panel_informacion.style.display = 'none';
        }
    };
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
        return;
    }

    loadingDiv.style.display = 'none';
    cubiculosList.innerHTML = '<div class="spinner-lista-centro"></div>';

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
        })
        .catch(function (error) {
            if (error && error.name === 'AbortError') return;
            console.error('Error al cargar cubículos:', error);
            if (token === tokenSeleccionActual) {
                cubiculosList.innerHTML = '<li class="cubiculo-mensaje-vacio" style="color: #e94560;">Error al cargar cubículos. Intenta de nuevo.</li>';
            }
        });
}

function mostrarCubiculos(cubiculos) {
    var cubiculosList = document.getElementById('cubiculosList');
    cubiculosList.innerHTML = '';

    var cubiculosPorPiso = {};
    cubiculos.forEach(function (cubiculo) {
        var piso = cubiculo.nivel_piso || 0;
        if (!cubiculosPorPiso[piso]) {
            cubiculosPorPiso[piso] = [];
        }
        cubiculosPorPiso[piso].push(cubiculo);
    });

    var pisos = Object.keys(cubiculosPorPiso).sort(function (a, b) { return a - b; });

    pisos.forEach(function (piso) {
        var pisoDiv = document.createElement('div');
        pisoDiv.className = 'cubiculo-piso';

        var pisoHeader = document.createElement('h3');
        pisoHeader.className = 'cubiculo-piso-titulo';
        pisoHeader.textContent = piso == 0 ? 'Planta Baja' : ('Piso ' + piso);
        pisoDiv.appendChild(pisoHeader);

        cubiculosPorPiso[piso].forEach(function (cubiculo) {
            var cubiculoItem = document.createElement('div');
            cubiculoItem.className = 'cubiculo-item';
            cubiculoItem.setAttribute('data-codigo-espacio', cubiculo.codigo_completo || cubiculo.numero_espacio || '');
            cubiculoItem.setAttribute('data-nombre-espacio', cubiculo.numero_espacio || cubiculo.codigo_completo || '');
            cubiculoItem.setAttribute('data-profesor', cubiculo.profesor_asignado || '');

            var codigoDiv = document.createElement('div');
            codigoDiv.className = 'cubiculo-codigo';
            codigoDiv.textContent = cubiculo.numero_espacio || cubiculo.codigo_completo;

            var profesorDiv = document.createElement('div');
            if (cubiculo.profesor_asignado) {
                profesorDiv.className = 'cubiculo-profesor';
                profesorDiv.textContent = cubiculo.profesor_asignado;
            } else {
                profesorDiv.className = 'cubiculo-profesor cubiculo-sin-profesor';
                profesorDiv.textContent = 'Sin profesor asignado';
            }

            cubiculoItem.appendChild(codigoDiv);
            cubiculoItem.appendChild(profesorDiv);
            pisoDiv.appendChild(cubiculoItem);
        });

        cubiculosList.appendChild(pisoDiv);
    });

    aplicarResaltadoEnTab('cubiculos');
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
    }, 400);
};