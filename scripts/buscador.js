// BUSCADOR GLOBAL (Edificios, Laboratorios, Cubículos y Profesores)
// Verificar que los datos esten cargados
if (typeof edificios_sugerido === 'undefined') {
    console.warn('edificios_sugerido aún no está disponible. Esperando carga desde API...');
    var edificios_sugerido = []; 
}

if (typeof edificios === 'undefined') {
    var edificios = [];
}


const searchContainer = document.querySelector('.search-input-box');
const inputSearch = searchContainer.querySelector('input');
const boxSuggestions = document.querySelector('.container-suggestions');

let currentMarker = null;
let busquedaTimer = null;
let tokenBusqueda = 0;
let resultadosBusqueda = [];

// Seguridad y la validacion de las entradas
// Sanitiza  el texto

function sanitizeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


// Valida que el input contenga solo caracteres permitidos

function validarInput(input) {
    const regex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s\-.]+$/;
    return regex.test(input) && input.length <= 100;
}

function normalizarBusqueda(texto) {
    return String(texto || '')
        .toLowerCase()
        .replace(/[\s.-]+/g, '');
}

function normalizarEtiqueta(texto) {
    return String(texto || '')
        .toLowerCase()
        .replace(/[\s._-]+/g, ' ')
        .trim();
}

function construirUrlApiEspaciosBuscar(termino) {
    var basePath = window.location.pathname.replace(/\/[^\/]*$/, '');
    return window.location.origin + basePath + '/api/espacios.php?buscar=' + encodeURIComponent(termino) + '&limit=20';
}

function construirUrlApiProfesoresBuscar(termino) {
    var basePath = window.location.pathname.replace(/\/[^\/]*$/, '');
    return window.location.origin + basePath + '/api/profesores.php?buscar=' + encodeURIComponent(termino) + '&con_oficina=1&limit=20';
}

function etiquetaTipoResultado(item) {
    if (item.tipo_resultado === 'laboratorio') return 'Laboratorio';
    if (item.tipo_resultado === 'cubiculo') return 'Cubículo';
    if (item.tipo_resultado === 'profesor') return 'Profesor';
    return 'Edificio';
}

function construirItemSugerencia(item, index) {
    var tipo = etiquetaTipoResultado(item);
    var subtituloText = item.subtitulo ? String(item.subtitulo) : '';
    var subtitulo = subtituloText ? '<div class="sugerencia-linea-secundaria">' + sanitizeHTML(subtituloText) + '</div>' : '';

    // Evitar duplicar la palabra del tipo en el nombre
    var displayName = String(item.nombre || '');
    try {
        var tipoRegex = new RegExp('^' + tipo + '\\s+', 'i');
        displayName = displayName.replace(tipoRegex, '');
    } catch (e) {
        // si hay error en regex, usar nombre tal cual
    }

    // Si el subtitulo ya está incluido en el nombre, no mostrarlo repetido
    if (subtituloText && displayName.toLowerCase().indexOf(subtituloText.toLowerCase()) !== -1) {
        subtitulo = '';
    }

    return '<li data-index="' + index + '">' +
        '<span class="sugerencia-linea-principal"><span class="sugerencia-badge">' + sanitizeHTML(tipo) + '</span> ' + sanitizeHTML(displayName) + '</span>' +
        subtitulo +
        '</li>';
}

///////////////////////////////////

inputSearch.onkeyup = e => {
    const userData = e.target.value.toLowerCase().trim();

    // Validar entrada
    if (userData && !validarInput(userData)) {
        boxSuggestions.innerHTML = '<li>Caracteres no permitidos</li>';
        searchContainer.classList.add('active');
        return;
    }

    if (userData) {
        if (busquedaTimer) {
            clearTimeout(busquedaTimer);
        }

        busquedaTimer = setTimeout(async () => {
            const tokenActual = ++tokenBusqueda;
            const sugerencias = await obtenerSugerenciasDesdeAPI(userData);
            if (tokenActual !== tokenBusqueda) return;

            resultadosBusqueda = sugerencias;
            const items = sugerencias.map((resultado, index) => construirItemSugerencia(resultado, index));

            searchContainer.classList.add('active');
            showSuggestions(items);

            let allList = boxSuggestions.querySelectorAll('li');
            allList.forEach((li, index) => {
                li.addEventListener('click', function () {
                    selectSearchResult(index);
                });
                li.addEventListener('mouseover', () => currentIndex = index);
                li.addEventListener('mouseleave', () => currentIndex = -1);
            });

            updateSuggestionsHighlight(allList);
        }, 220);
    } else {
        searchContainer.classList.remove('active');
    }
};

function construirUrlApiEdificiosBuscar(termino) {
    var basePath = window.location.pathname.replace(/\/[^\/]*$/, '');
    return window.location.origin + basePath + '/api/edificios.php?buscar=' + encodeURIComponent(termino);
}

async function obtenerSugerenciasDesdeAPI(termino) {
    try {
        // Detectar prefijos de tipo en la búsqueda
        var terminoOriginal = String(termino || '').trim();
        var terminoEspacios = terminoOriginal;
        var espacioTipoParam = '';
        var m = terminoOriginal.match(/^(?:lab|laboratorio)\b\s*/i);
        if (m) {
            terminoEspacios = terminoOriginal.replace(m[0], '').trim();
            espacioTipoParam = '&tipo=2';
        }

        const responses = await Promise.all([
            fetch(construirUrlApiEdificiosBuscar(termino)).then(r => r.json()).catch(() => ({ success: false, edificios: [] })),
            fetch(construirUrlApiEspaciosBuscar(terminoEspacios) + espacioTipoParam).then(r => r.json()).catch(() => ({ success: false, espacios: [] })),
            fetch(construirUrlApiProfesoresBuscar(termino)).then(r => r.json()).catch(() => ({ success: false, profesores: [] }))
        ]);

        const dataEdificios = responses[0];
        const dataEspacios = responses[1];
        const dataProfesores = responses[2];

        const sugerencias = [];

        if (dataEdificios.success && Array.isArray(dataEdificios.edificios)) {
            dataEdificios.edificios.forEach(edificio => {
                const lat = parseFloat(edificio.latitud);
                const lng = parseFloat(edificio.longitud);
                if (isNaN(lat) || isNaN(lng)) return;

                sugerencias.push({
                    tipo_resultado: 'edificio',
                    nombre: edificio.nombre_comun || edificio.codigo,
                    subtitulo: edificio.codigo || '',
                    coordenadas: [lat, lng],
                    codigo: edificio.codigo,
                    prioridad: 1
                });

                if (Array.isArray(edificio.alias)) {
                    edificio.alias.forEach(aliasItem => {
                        if (!aliasItem) return;
                        sugerencias.push({
                            tipo_resultado: 'edificio',
                            nombre: aliasItem,
                            subtitulo: (edificio.nombre_comun || edificio.codigo) + ' (' + (edificio.codigo || '') + ')',
                            coordenadas: [lat, lng],
                            codigo: edificio.codigo,
                            prioridad: 2
                        });
                    });
                }
            });
        }

        if (dataEspacios.success && Array.isArray(dataEspacios.espacios)) {
            dataEspacios.espacios.forEach(espacio => {
                const lat = parseFloat(espacio.lat_edificio);
                const lng = parseFloat(espacio.lng_edificio);
                if (isNaN(lat) || isNaN(lng)) return;

                const idTipo = Number(espacio.id_tipo);
                const tipoResultado = idTipo === 2 ? 'laboratorio' : (idTipo === 4 ? 'cubiculo' : 'espacio');
                if (tipoResultado === 'espacio') return;

                const nombreBase = tipoResultado === 'laboratorio'
                    ? (espacio.nombre_descriptivo || espacio.numero_espacio || espacio.codigo_completo || 'Laboratorio')
                    : (espacio.numero_espacio || espacio.codigo_completo || 'Cubículo');

                let subtitulo = (espacio.nombre_edificio || espacio.codigo_edificio || '');
                if (tipoResultado === 'cubiculo' && espacio.profesor_asignado) {
                    subtitulo += ' - ' + espacio.profesor_asignado;
                }

                sugerencias.push({
                    tipo_resultado: tipoResultado,
                    nombre: nombreBase,
                    subtitulo: subtitulo,
                    coordenadas: [lat, lng],
                    codigo: espacio.codigo_edificio,
                    codigo_espacio: espacio.codigo_completo || espacio.numero_espacio || '',
                    profesor_asignado: espacio.profesor_asignado || '',
                    prioridad: tipoResultado === 'laboratorio' ? 3 : 4
                });
            });
        }

        if (dataProfesores.success && Array.isArray(dataProfesores.profesores)) {
            dataProfesores.profesores.forEach(profesor => {
                const lat = parseFloat(profesor.lat_edificio);
                const lng = parseFloat(profesor.lng_edificio);
                if (isNaN(lat) || isNaN(lng)) return;
                if (!profesor.codigo_edificio) return;

                sugerencias.push({
                    tipo_resultado: 'profesor',
                    nombre: profesor.nombre_completo || 'Profesor',
                    subtitulo: (profesor.codigo_oficina || 'Cubículo sin código') + ' - ' + (profesor.nombre_edificio || profesor.codigo_edificio),
                    coordenadas: [lat, lng],
                    codigo: profesor.codigo_edificio,
                    codigo_espacio: profesor.codigo_oficina || profesor.numero_oficina || '',
                    profesor_asignado: profesor.nombre_completo || '',
                    prioridad: 5
                });
            });
        }

        const seen = {};
        return sugerencias
            .filter(function (s) {
                var key = [
                    s.tipo_resultado,
                    normalizarEtiqueta(s.nombre),
                    normalizarEtiqueta(s.codigo),
                    normalizarEtiqueta(s.codigo_espacio),
                    normalizarEtiqueta(s.profesor_asignado)
                ].join('|');

                if (seen[key]) return false;
                seen[key] = true;
                return true;
            })
            .sort(function (a, b) {
                return Number(a.prioridad || 99) - Number(b.prioridad || 99);
            })
            .slice(0, 20);
    } catch (error) {
        console.warn('No se pudieron obtener sugerencias desde API, usando lista local.', error);
        return edificios_sugerido
            .filter(edificio => edificio.nombre.toLowerCase().startsWith(termino))
            .map(edificio => ({
                tipo_resultado: 'edificio',
                nombre: edificio.nombre,
                subtitulo: edificio.codigo || '',
                coordenadas: edificio.coordenadas,
                codigo: edificio.codigo || '',
                prioridad: 1
            }));
    }
}

const showSuggestions = list => {
    let listData;

    try {
        if (!list || list.length === 0) {
            listData = `<li>No hay resultados</li>`;
        } else {
            listData = list.join('');
        }

        if (boxSuggestions) {
            boxSuggestions.innerHTML = listData;
        } else {
            console.error("Elemento boxSuggestions no encontrado");
        }
    } catch (error) {
        console.error("Error al mostrar sugerencias:", error);
        if (boxSuggestions) {
            boxSuggestions.innerHTML = '<li>Error al cargar sugerencias</li>';
        }
    }
};




const searchButton = searchContainer.querySelector('.search-button');

if (searchButton) {
    searchButton.addEventListener('click', (event) => {
        try {
            event.preventDefault();
            performSearch();
        } catch (error) {
            console.error("Error en busqueda:", error);
            alert("Error al realizar la busqueda. Intenta de nuevo.");
        }
    });
} else {
    console.warn("Boton de busqueda no encontrado");
}

function performSearch() {
    try {
        const selectUserData = inputSearch.value.trim();
        const inputNormalizado = normalizarBusqueda(selectUserData);
        
        // Validar entrada antes de buscar
        if (!selectUserData) {
            alert("Por favor, escribe algo para buscar.");
            return;
        }
        
        if (!validarInput(selectUserData)) {
            alert("Entrada invalida. Solo se permiten letras, numeros y espacios.");
            return;
        }
        
        let selectedResultado = resultadosBusqueda.find(resultado => {
            const nombre = String(resultado.nombre || '');
            const codigo = String(resultado.codigo || '');
            const codigoEspacio = String(resultado.codigo_espacio || '');
            const profesor = String(resultado.profesor_asignado || '');
            return (
                normalizarBusqueda(nombre) === inputNormalizado ||
                normalizarBusqueda(codigo) === inputNormalizado ||
                normalizarBusqueda(codigoEspacio) === inputNormalizado ||
                normalizarBusqueda(profesor) === inputNormalizado
            );
        });

        if (!selectedResultado && resultadosBusqueda.length > 0) {
            if (resultadosBusqueda.length === 1) {
                selectedResultado = resultadosBusqueda[0];
            } else {
                alert('Selecciona una sugerencia exacta para evitar abrir un edificio equivocado.');
                return;
            }
        }
        
        if (!selectedResultado) {
            alert("No se encontraron coincidencias. Intenta con otro término.");
            return;
        }

        ejecutarResultadoBusqueda(selectedResultado);
        inputSearch.value = '';
        console.log('Resultado encontrado:', selectedResultado.nombre, selectedResultado.tipo_resultado);
        
    } catch (error) {
        console.error("Error en performSearch:", error);
        alert("Error al buscar. Por favor, intenta de nuevo.");
    }
}

function obtenerEdificioPorResultado(resultado, inputNormalizado) {
    if (!Array.isArray(edificios) || edificios.length === 0) return null;

    var codigo = resultado && resultado.codigo ? String(resultado.codigo).toUpperCase() : '';
    if (codigo) {
        var porCodigo = edificios.find(function (edificio) {
            return String(edificio.codigo || '').toUpperCase() === codigo;
        });
        if (porCodigo) return porCodigo;
    }

    return edificios.find(function (edificio) {
        return normalizarBusqueda(edificio.nombre) === inputNormalizado;
    }) || null;
}

function ejecutarResultadoBusqueda(resultado) {
    if (!resultado) return;

    if (!resultado.coordenadas || resultado.coordenadas.length < 2) {
        console.error('Coordenadas invalidas para:', resultado.nombre);
        alert('Error: El resultado no tiene coordenadas validas.');
        return;
    }

    if (typeof map === 'undefined') {
        console.error('Mapa no inicializado');
        alert('Error: El mapa no esta listo. Recarga la pagina.');
        return;
    }

    map.setView(resultado.coordenadas, 19.4);

    if (currentMarker) {
        try {
            map.removeLayer(currentMarker);
        } catch (err) {
            console.warn('No se pudo remover marcador anterior:', err);
        }
    }

    currentMarker = L.marker(resultado.coordenadas)
        .addTo(map)
        .bindPopup(sanitizeHTML(resultado.nombre))
        .openPopup();

    searchContainer.classList.remove('active');

    if (typeof mostrarPanelEdificio === 'function') {
        var selectedEdificioInfo = obtenerEdificioPorResultado(resultado, normalizarBusqueda(resultado.nombre));
        if (selectedEdificioInfo) {
            mostrarPanelEdificio(selectedEdificioInfo);

            if (typeof window.buscarYResaltarEnPanel === 'function') {
                if (resultado.tipo_resultado === 'laboratorio') {
                    window.buscarYResaltarEnPanel({
                        tab: 'salones',
                        codigo_espacio: resultado.codigo_espacio,
                        texto: resultado.nombre
                    });
                } else if (resultado.tipo_resultado === 'cubiculo' || resultado.tipo_resultado === 'profesor') {
                    window.buscarYResaltarEnPanel({
                        tab: 'cubiculos',
                        codigo_espacio: resultado.codigo_espacio,
                        texto: resultado.nombre,
                        profesor: resultado.profesor_asignado
                    });
                }
            }
        }
    }
}


let currentIndex = -1;

try {
    if (inputSearch) {
        inputSearch.addEventListener('keydown', function (e) {
            try {
                const suggestions = boxSuggestions.querySelectorAll('li');

                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    currentIndex++;
                    if (currentIndex >= suggestions.length) {
                        currentIndex = suggestions.length - 1;
                    }
                    updateSuggestionsHighlight(suggestions);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    currentIndex--;
                    if (currentIndex < -1) {
                        currentIndex = -1;
                    }
                    updateSuggestionsHighlight(suggestions);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (currentIndex > -1 && currentIndex < suggestions.length) {
                        selectSearchResult(currentIndex);
                    } else {
                        performSearch();
                    }
                }
            } catch (error) {
                console.error("Error en navegacion de sugerencias:", error);
            }
        });
    }
} catch (error) {
    console.error("Error al configurar eventos de teclado:", error);
}

function updateSuggestionsHighlight(suggestions) {
    suggestions.forEach((suggestion, index) => {
        suggestion.classList.remove('highlight');
        if (index === currentIndex) {
            suggestion.classList.add('highlight');
        }
    });
}


document.addEventListener('click', function (event) {
    if (!searchContainer.contains(event.target)) {
        searchContainer.classList.remove('active');
    }
});

function selectBuilding(element) {
    if (!element) return;

    var indexAttr = element.getAttribute('data-index');
    var index = Number(indexAttr);
    if (Number.isFinite(index)) {
        selectSearchResult(index);
        return;
    }

    let selectUserData = element.textContent.trim();
    if (!validarInput(selectUserData)) return;
    inputSearch.value = selectUserData;
    performSearch();
}

function selectSearchResult(index) {
    if (!Array.isArray(resultadosBusqueda) || index < 0 || index >= resultadosBusqueda.length) {
        return;
    }

    var selected = resultadosBusqueda[index];
    inputSearch.value = selected.nombre || '';
    ejecutarResultadoBusqueda(selected);
}

