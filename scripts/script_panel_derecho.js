var panel_informacion = document.getElementById('panel_informacion');
var cerrarpanel = document.getElementById('cerrar-panel');
cerrarpanel.addEventListener('click', function () {
    panel_informacion.style.display = 'none';
    panel_informacion.classList.remove('panel-expanded');
    panel_informacion.dataset.panelState = 'collapsed';
    if (typeof window.limpiarMarcadoresEspacios === 'function') {
        window.limpiarMarcadoresEspacios();
    }
});

var infoTab = document.getElementById('infoTab');
var interiorTab = document.getElementById('interiorTab');
var salonesTab = document.getElementById('salonesTab');
var cubiculosTab = document.getElementById('cubiculosTab');
var infoContent = document.getElementById('infoContent');
var interiorContent = document.getElementById('interiorContent');
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
    var margenSeguridad = 16; // separación visual mínima respecto a la barra
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

function obtenerTranslateActualPanel() {
    if (!panel_informacion) return 0;
    var transform = window.getComputedStyle(panel_informacion).transform;
    if (!transform || transform === 'none') return 0;

    var matrix = transform.match(/matrix\((.+)\)/);
    if (matrix && matrix[1]) {
        var values = matrix[1].split(',');
        if (values.length === 6) {
            return parseFloat(values[5]) || 0;
        }
    }

    var matrix3d = transform.match(/matrix3d\((.+)\)/);
    if (matrix3d && matrix3d[1]) {
        var values3d = matrix3d[1].split(',');
        if (values3d.length === 16) {
            return parseFloat(values3d[13]) || 0;
        }
    }

    return 0;
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
    if (panelMovilArrastre.activo) return; // no interferir mientras el usuario arrastra

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
    var velocidad = 0;
    var tiempoTranscurrido = Math.max(1, Date.now() - panelMovilArrastre.lastTime);
    velocidad = (panelMovilArrastre.lastY - panelMovilArrastre.inicioY) / tiempoTranscurrido;

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
    interiorContent.style.display = 'none';
    salonesContent.style.display = 'none';
    cubiculosContent.style.display = 'none';

    infoTab.classList.remove('active');
    interiorTab.classList.remove('active');
    salonesTab.classList.remove('active');
    cubiculosTab.classList.remove('active');

    if (tabName === 'info') {
        infoContent.style.display = 'block';
        infoTab.classList.add('active');
    } else if (tabName === 'interior') {
        interiorContent.style.display = 'block';
        interiorTab.classList.add('active');
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
interiorTab.addEventListener('click', function () { openTab('interior'); });
// Función auxiliar para extraer el código del edificio
function extraerCodigoEdificio(edificio) {
    if (!edificio) return null;
    

    if (edificio.codigo) return edificio.codigo;
    

    if (edificio.nombre === "Dirección FIAD") return "E33";
    
    var match = edificio.nombre.match(/\d+/);
    if (match) {
        return "E" + match[0];
    }
    
    return null;
}

cubiculosTab.addEventListener('click', function () { 
    openTab('cubiculos');
    // Cargar cubículos cuando se abre la pestaña
    if (window.edificioActual) {
        var codigo = extraerCodigoEdificio(window.edificioActual);
        if (codigo) {
            cargarCubiculos(codigo);
        }
    }
});
salonesTab.addEventListener('click', function () {
    openTab('salones');
    if (window.edificioActual) {
        var codigo = extraerCodigoEdificio(window.edificioActual);
        if (codigo) {
            cargarSalones(codigo);
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

            var salonCodigo = document.createElement('div');
            salonCodigo.className = 'salon-codigo';
            var tipo = esp.nombre_tipo ? ('[' + esp.nombre_tipo + '] ') : '';
            var esLaboratorio = Number(esp.id_tipo) === 2;
            var nombre = esLaboratorio
                ? (esp.nombre_descriptivo || esp.numero_espacio || esp.codigo_completo || 'Laboratorio')
                : (esp.numero_espacio || esp.codigo_completo || esp.nombre_descriptivo || 'Espacio');
            salonCodigo.textContent = tipo + nombre;

            salonItem.appendChild(salonCodigo);
            pisoDiv.appendChild(salonItem);
        });

        salonesList.appendChild(pisoDiv);
    });

    aplicarResaltadoEnTab('salones');
}

function mostrarCargandoSalones() {
    var salonesContainer = document.getElementById('salonesContent');
    var salonesList = salonesContainer.getElementsByTagName('ul')[0];
    salonesList.innerHTML = '<li class="salon-mensaje-vacio">Cargando espacios del edificio...</li>';
}

function aplicarImagenConFallback(imgElement, rutaImagen) {
    if (!imgElement) return;

    var rutas = [];
    var rutaNormalizada = String(rutaImagen || '').trim();

    if (rutaNormalizada) {
        rutas.push(rutaNormalizada);

        if (rutaNormalizada.indexOf('img/') === 0) {
            var nombreArchivo = rutaNormalizada.slice(4);
            if (nombreArchivo) {
                rutas.push('img/' + nombreArchivo.charAt(0).toUpperCase() + nombreArchivo.slice(1));
                rutas.push('img/' + nombreArchivo.charAt(0).toLowerCase() + nombreArchivo.slice(1));
            }
        }
    }

    var probadas = {};
    rutas = rutas.filter(function (ruta) {
        if (!ruta || probadas[ruta]) return false;
        probadas[ruta] = true;
        return true;
    });

    if (rutas.length === 0) {
        imgElement.src = 'img/prueba.jpg';
        return;
    };

    var indice = 0;

    function intentarSiguiente() {
        if (indice >= rutas.length) {
            imgElement.onerror = null;
            imgElement.src = 'img/prueba.jpg';
            return;
        }

        var ruta = rutas[indice++];
        imgElement.onerror = function () {
            intentarSiguiente();
        };
        imgElement.src = ruta;
    }

    intentarSiguiente();
}

function cargarSalones(codigoEdificio) {
    mostrarCargandoSalones();
    var apiUrl = construirUrlApi('espacios.php?edificio=' + encodeURIComponent(codigoEdificio) + '&limit=200');

    fetch(apiUrl)
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data.success && Array.isArray(data.espacios)) {
                var espaciosAcad = data.espacios.filter(function (esp) {
                    var tipo = Number(esp.id_tipo);
                    return tipo === 1 || tipo === 2 || tipo === 3;
                });

                renderizarSalonesDesdeEspacios(espaciosAcad);

                if (typeof window.mostrarEspaciosEnMapa === 'function' && window.edificioActual) {
                    window.mostrarEspaciosEnMapa(window.edificioActual, espaciosAcad);
                }
            } else {
                renderizarSalonesDesdeEspacios([]);
            }
        })
        .catch(function (error) {
            console.error('Error al cargar salones/laboratorios/talleres:', error);
            renderizarSalonesDesdeEspacios([]);
        });
}


function mostrarPanelEdificio(edificio) {
    // Guardar referencia al edificio actual para la pestaña de cubículos
    window.edificioActual = edificio;

    // Resetear cubículos al cambiar de edificio
    document.getElementById('cubiculosList').innerHTML = '';
    document.getElementById('cubiculosLoading').style.display = 'none';

    if (cubiculosContent.style.display === 'block') {
        var codigo = extraerCodigoEdificio(edificio);
        if (codigo) cargarCubiculos(codigo);
    }

    if (salonesContent.style.display === 'block') {
        var codigoSalones = extraerCodigoEdificio(edificio);
        if (codigoSalones) cargarSalones(codigoSalones);
    }

    renderizarSalonesDesdeEspacios([]);
    var imagenPrincipalInicial = edificio.imagen || 'img/prueba.jpg';
    aplicarImagenConFallback(document.getElementById('edificioImagen'), imagenPrincipalInicial);
    aplicarImagenConFallback(document.getElementById('interiorImagen'), imagenPrincipalInicial);
    document.getElementById('edificioImagen').alt = edificio.nombre;
    document.getElementById('edificioNombre').innerText = edificio.nombre;
    document.getElementById('edificioInfo').innerText = edificio.info || 'Sin descripción disponible.';
    panel_informacion.style.display = 'block';
    panel_informacion.dataset.panelState = esVistaMovilPanel() ? 'partial' : 'expanded';
    if (esVistaMovilPanel()) {
        requestAnimationFrame(function () {
            abrirPanelMovil();
        });
    } else {
        panel_informacion.classList.remove('panel-expanded');
        panel_informacion.classList.remove('panel-partial');
    }
    cargarBotonesPisos({ pisos: edificio.pisos || 0, imagenes: [], imagen: imagenPrincipalInicial });

    var codigoAPI = extraerCodigoEdificio(edificio);
    if (codigoAPI) {
        var urlEdificio = construirUrlApi('edificios.php?codigo=' + encodeURIComponent(codigoAPI));
        var urlEspacios = construirUrlApi('espacios.php?edificio=' + encodeURIComponent(codigoAPI) + '&limit=200');

        Promise.all([
            fetch(urlEdificio).then(function (r) { return r.json(); }),
            fetch(urlEspacios).then(function (r) { return r.json(); })
        ])
            .then(function (responses) {
                var dataEdificio = responses[0];
                var dataEspacios = responses[1];

                if (dataEdificio.success && dataEdificio.edificio) {
                    var ed = dataEdificio.edificio;
                    document.getElementById('edificioNombre').innerText = ed.nombre_comun || edificio.nombre;
                    document.getElementById('edificioInfo').innerText = ed.descripcion || 'Sin descripción disponible.';

                    var imagenPrincipal = ed.foto_principal_url || edificio.imagen || 'img/prueba.jpg';
                    aplicarImagenConFallback(document.getElementById('edificioImagen'), imagenPrincipal);

                    var imagenesOrdenadas = [];
                    if (Array.isArray(ed.imagenes) && ed.imagenes.length > 0) {
                        imagenesOrdenadas = ed.imagenes
                            .slice()
                            .sort(function (a, b) { return Number(a.orden) - Number(b.orden); })
                            .map(function (img) { return img.url; });
                    }

                    aplicarImagenConFallback(document.getElementById('interiorImagen'), imagenesOrdenadas[1] || imagenesOrdenadas[0] || imagenPrincipal);

                    cargarBotonesPisos({
                        pisos: Number(ed.numero_pisos || 0),
                        imagenes: imagenesOrdenadas,
                        imagen: imagenPrincipal
                    });

                    if (ed.latitud && ed.longitud && ed.codigo === codigoAPI) {
                        edificio._coordsAPI = [parseFloat(ed.latitud), parseFloat(ed.longitud)];
                    }
                }

                if (dataEspacios.success && Array.isArray(dataEspacios.espacios)) {
                    var espaciosAcad = dataEspacios.espacios.filter(function (esp) {
                        var tipo = Number(esp.id_tipo);
                        return tipo === 1 || tipo === 2 || tipo === 3;
                    });
                    renderizarSalonesDesdeEspacios(espaciosAcad);

                    if (typeof window.mostrarEspaciosEnMapa === 'function') {
                        window.mostrarEspaciosEnMapa(edificio, espaciosAcad);
                    }
                }
            })
            .catch(function (error) {
                console.error('No se pudo cargar detalle de edificio desde API:', error);
            });
    }

    document.getElementById('btn_direcciones').onclick = function () {
        if (edificio) {
            endPoint = (typeof window.obtenerPuntoEdificio === 'function')
                ? window.obtenerPuntoEdificio(edificio)
                : (edificio.labelCoords || edificio.coords[0]);
            if (!endPoint) return;
            if (endMarker) {
                map.removeLayer(endMarker);
            }
            endMarker = L.marker(endPoint, { draggable: true }).addTo(map);
            endMarker.on('dragend', () => {
                endPoint = endMarker.getLatLng();
                updateRoute();
            });
            updateRoute();
            panel_informacion.style.display = 'none';
        }
    };
}

function cargarBotonesPisos(edificio) {
    var container = document.getElementById('floorButtonsContainer');
    container.innerHTML = '';

    if (edificio.pisos && edificio.pisos > 0) {
        var imagenesPisos = Array.isArray(edificio.imagenes) ? edificio.imagenes : [];

        for (var i = 0; i < edificio.pisos; i++) {
            var boton = document.createElement('button');
            boton.textContent = (i + 1); // Numerar los pisos
            boton.classList.add('floor-button');

            boton.addEventListener('click', function (imagen) {
                return function () {
                    document.getElementById('interiorImagen').src = imagen;
                };
            }(imagenesPisos[i] || edificio.imagen));

            container.appendChild(boton);
        }
    }
}

// Cubiculos

//Carga los cubículos de un edificio desde la API

function cargarCubiculos(codigoEdificio) {
    var cubiculosList = document.getElementById('cubiculosList');
    var loadingDiv = document.getElementById('cubiculosLoading');
    
    loadingDiv.style.display = 'block';
    cubiculosList.innerHTML = '';
    
    // Llamar a la API con URL dinámica según donde esté el proyecto
    var basePath = window.location.pathname.replace(/\/[^\/]*$/, '');
    var apiUrl = window.location.origin + basePath + '/api/espacios.php?tipo=4&edificio=' + codigoEdificio;
    fetch(apiUrl)
        .then(response => response.json())
        .then(data => {
            loadingDiv.style.display = 'none';
            
            if (data.success && data.espacios && data.espacios.length > 0) {
                mostrarCubiculos(data.espacios);
            } else {
                cubiculosList.innerHTML = '<li class="cubiculo-mensaje-vacio">No hay cubículos registrados en este edificio.</li>';
            }
        })
        .catch(error => {
            console.error('Error al cargar cubículos:', error);
            loadingDiv.style.display = 'none';
            cubiculosList.innerHTML = '<li class="cubiculo-mensaje-vacio" style="color: #e94560;">Error al cargar cubículos. Intenta de nuevo.</li>';
        });
}


function mostrarCubiculos(cubiculos) {
    var cubiculosList = document.getElementById('cubiculosList');
    cubiculosList.innerHTML = '';
    
    // Agrupar por piso
    var cubiculosPorPiso = {};
    cubiculos.forEach(function(cubiculo) {
        var piso = cubiculo.nivel_piso || 0;
        if (!cubiculosPorPiso[piso]) {
            cubiculosPorPiso[piso] = [];
        }
        cubiculosPorPiso[piso].push(cubiculo);
    });
    
    // Ordenar pisos
    var pisos = Object.keys(cubiculosPorPiso).sort((a, b) => a - b);
    
    pisos.forEach(function(piso) {
        var pisoDiv = document.createElement('div');
        pisoDiv.className = 'cubiculo-piso';
        
        var pisoHeader = document.createElement('h3');
        pisoHeader.className = 'cubiculo-piso-titulo';
        pisoHeader.textContent = piso == 0 ? 'Planta Baja' : `Piso ${piso}`;
        pisoDiv.appendChild(pisoHeader);
        
        cubiculosPorPiso[piso].forEach(function(cubiculo) {
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
                cargarCubiculos(codigo);
            } else {
                cargarSalones(codigo);
            }
        }
    }

    setTimeout(function () {
        aplicarResaltadoEnTab(tab);
    }, 400);
};

