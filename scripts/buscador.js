// BUSCADOR GLOBAL CON ÍNDICE TOKENIZADO EN MEMORIA
// Cubre: Edificios, Aulas, Laboratorios, Talleres, Cubículos, Profesores y Puntos de Interés

if (typeof edificios_sugerido === 'undefined') {
    var edificios_sugerido = [];
}

if (typeof edificios === 'undefined') {
    var edificios = [];
}

const STORAGE_KEY_CATALOGO_TS = 'fiad_catalogo_busqueda_ts';
const searchContainer = document.querySelector('.search-input-box');
const inputSearch = searchContainer.querySelector('input');
const boxSuggestions = document.querySelector('.container-suggestions');

let indiceDocumentos = [];
let catalogoCargado = false;
let promesaCargaCatalogo = null;
let resultadosBusqueda = [];
let currentIndex = -1;
const MAX_SUGERENCIAS_VISIBLES = 8;
const DESC_MAX_CARACTERES = 160; // el CSS la muestra en máximo 2 líneas

const CATEGORIAS_POI_META = {
    banos: {
        label: 'Baños',
        sinonimos: 'banos sanitarios wc bano hombres mujeres'
    },
    biblioteca: {
        label: 'Biblioteca',
        sinonimos: 'biblioteca libros estudio lectura'
    },
    canchas: {
        label: 'Canchas deportivas',
        sinonimos: 'canchas deportivas deporte futbol basquetbol voleibol'
    },
    estacionamiento: {
        label: 'Estacionamientos',
        sinonimos: 'estacionamiento estacionamientos parking carros autos vehiculos'
    },
    cafeteria: {
        label: 'Cafetería',
        sinonimos: 'cafeteria cafeta cafe comida desayunos'
    },
    tienda: {
        label: 'Tienda',
        sinonimos: 'tienda papeleria copias impresiones'
    }
};

function sanitizeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function validarInput(input) {
    const regex = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ0-9\s\-._/()]+$/;
    return regex.test(input) && input.length <= 100;
}

function quitarAcentos(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

// Recorta en el último límite de palabra para no partir palabras a la mitad
function truncarTexto(texto, max) {
    const limpio = String(texto || '').replace(/\s+/g, ' ').trim();
    if (limpio.length <= max) return limpio;
    const corte = limpio.slice(0, max);
    const ultimoEspacio = corte.lastIndexOf(' ');
    const base = ultimoEspacio > max * 0.6 ? corte.slice(0, ultimoEspacio) : corte;
    return base.replace(/[\s,.;:\-–]+$/, '') + '…';
}

function normalizarBusqueda(texto) {
    return quitarAcentos(texto).replace(/[\s.\-_]+/g, '');
}

function tokenizarTexto(texto, expandirAlfanumericos = true) {
    const limpio = quitarAcentos(texto).replace(/[^a-z0-9]+/g, ' ').trim();
    if (!limpio) return [];

    const base = limpio.split(/\s+/);
    const set = new Set(base);

    if (expandirAlfanumericos) {
        base.forEach((tok) => {
            const partes = tok.match(/[a-z]+|[0-9]+/g);
            if (partes && partes.length > 1) {
                partes.forEach((p) => set.add(p));
            }
        });
    }

    return Array.from(set);
}

function distanciaLevenshteinAcotada(a, b, maxDist) {
    const lenA = a.length;
    const lenB = b.length;
    if (Math.abs(lenA - lenB) > maxDist) return maxDist + 1;

    const prev = new Array(lenB + 1);
    const curr = new Array(lenB + 1);
    for (let j = 0; j <= lenB; j++) prev[j] = j;

    for (let i = 1; i <= lenA; i++) {
        curr[0] = i;
        let minFila = curr[0];
        const charA = a.charCodeAt(i - 1);

        for (let j = 1; j <= lenB; j++) {
            const cost = charA === b.charCodeAt(j - 1) ? 0 : 1;
            const val = Math.min(
                prev[j] + 1,
                curr[j - 1] + 1,
                prev[j - 1] + cost
            );
            curr[j] = val;
            if (val < minFila) minFila = val;
        }

        if (minFila > maxDist) return maxDist + 1;
        for (let j = 0; j <= lenB; j++) prev[j] = curr[j];
    }

    return prev[lenB];
}

function construirUrlCatalogoBusqueda(forzar) {
    const basePath = window.location.pathname.replace(/\/[^\/]*$/, '');
    const url = window.location.origin + basePath + '/api/catalogo_busqueda.php';

    let marcaTiempo = '';
    if (forzar) {
        marcaTiempo = String(Date.now());
        try {
            localStorage.setItem(STORAGE_KEY_CATALOGO_TS, marcaTiempo);
        } catch (e) {}
    } else {
        try {
            marcaTiempo = localStorage.getItem(STORAGE_KEY_CATALOGO_TS) || '';
        } catch (e) {}
    }

    return marcaTiempo ? (url + '?_t=' + encodeURIComponent(marcaTiempo)) : url;
}

function construirDocumentoIndice(doc) {
    const tokensPrimarios = tokenizarTexto(doc.textoPrimario, true);
    const tokensSecundarios = tokenizarTexto(doc.textoSecundario, true);
    const todosTokens = Array.from(new Set([...tokensPrimarios, ...tokensSecundarios]));

    return Object.assign({}, doc, {
        tokensPrimarios,
        tokensSecundarios,
        todosTokens,
        claveCompacta: normalizarBusqueda(doc.textoPrimario + ' ' + (doc.codigo || ''))
    });
}

function construirIndiceDesdeDatos(data) {
    const docs = [];

    // 1. Edificios
    if (Array.isArray(data.edificios)) {
        data.edificios.forEach((ed) => {
            const lat = parseFloat(ed.latitud);
            const lng = parseFloat(ed.longitud);
            if (isNaN(lat) || isNaN(lng)) return;

            const codigo = String(ed.codigo || '').trim();
            const nombre = String(ed.nombre_comun || codigo).trim();

            const numEdificio = codigo.replace(/^E/i, '');
            const extraEdificio = numEdificio && numEdificio !== codigo
                ? `edificio ${numEdificio} edif ${numEdificio}`
                : 'edificio';

            docs.push(construirDocumentoIndice({
                tipo_resultado: 'edificio',
                nombre: nombre,
                subtitulo: codigo,
                coordenadas: [lat, lng],
                codigo: codigo,
                descripcion: truncarTexto(ed.descripcion, DESC_MAX_CARACTERES),
                prioridadBase: 25,
                textoPrimario: `${codigo} ${nombre}`,
                textoSecundario: `${extraEdificio} ${ed.descripcion || ''}`
            }));
        });
    }

    // 2. Espacios (Aulas, Laboratorios, Talleres, Cubículos)
    if (Array.isArray(data.espacios)) {
        data.espacios.forEach((esp) => {
            const lat = parseFloat(esp.lat_edificio);
            const lng = parseFloat(esp.lng_edificio);
            if (isNaN(lat) || isNaN(lng)) return;

            const idTipo = Number(esp.id_tipo);
            const nombreTipoRaw = quitarAcentos(esp.nombre_tipo || '');

            let tipoResultado = 'aula';
            let sinonimosTipo = 'aula salon clase';
            let prioridadBase = 16;

            if (idTipo === 2 || nombreTipoRaw.includes('laboratorio')) {
                tipoResultado = 'laboratorio';
                sinonimosTipo = 'laboratorio lab practica';
                prioridadBase = 20;
            } else if (idTipo === 3 || nombreTipoRaw.includes('taller')) {
                tipoResultado = 'taller';
                sinonimosTipo = 'taller';
                prioridadBase = 18;
            } else if (idTipo === 4 || nombreTipoRaw.includes('cubiculo')) {
                tipoResultado = 'cubiculo';
                sinonimosTipo = 'cubiculo oficina asesorias';
                prioridadBase = 14;
            }

            const numEspacio = String(esp.numero_espacio || '').trim();
            const codCompleto = String(esp.codigo_completo || '').trim();
            const nomDesc = String(esp.nombre_descriptivo || '').trim();
            const codEdif = String(esp.codigo_edificio || '').trim();
            const nomEdif = String(esp.nombre_edificio || codEdif).trim();
            const profe = String(esp.profesor_asignado || '').trim();

            const nombreMostrar = nomDesc || numEspacio || codCompleto || esp.nombre_tipo || 'Espacio';
            let subtitulo = nomEdif !== codEdif ? `${nomEdif} (${codEdif})` : codEdif;
            if (tipoResultado === 'cubiculo' && profe) {
                subtitulo += ` · ${profe}`;
            }

            // Línea secundaria compacta del desplegable (no altera 'subtitulo')
            const edifTieneCodigo = codEdif && quitarAcentos(nomEdif).indexOf(quitarAcentos(codEdif)) !== -1;
            let contextoEspacio = (nomEdif !== codEdif && !edifTieneCodigo) ? `${nomEdif} (${codEdif})` : nomEdif;
            if (tipoResultado === 'cubiculo' && profe) {
                contextoEspacio = codEdif ? `${profe} · ${codEdif}` : profe;
            }

            docs.push(construirDocumentoIndice({
                tipo_resultado: tipoResultado,
                nombre: nombreMostrar,
                subtitulo: subtitulo,
                coordenadas: [lat, lng],
                codigo: codEdif,
                codigo_espacio: codCompleto || numEspacio,
                profesor_asignado: profe,
                contexto: contextoEspacio,
                prioridadBase: prioridadBase,
                textoPrimario: `${nombreMostrar} ${numEspacio} ${codCompleto} ${codEdif}`,
                textoSecundario: `${sinonimosTipo} ${nomEdif} ${profe}`
            }));
        });
    }

    // 3. Profesores activos con cubículo
    if (Array.isArray(data.profesores)) {
        data.profesores.forEach((prof) => {
            const lat = parseFloat(prof.lat_edificio);
            const lng = parseFloat(prof.lng_edificio);
            if (isNaN(lat) || isNaN(lng) || !prof.codigo_edificio) return;

            const nombreProf = String(prof.nombre_completo || '').trim();
            const tituloProf = String(prof.titulo || '').trim();
            const codOficina = String(prof.codigo_oficina || prof.numero_oficina || '').trim();
            const codEdif = String(prof.codigo_edificio || '').trim();
            const nomEdif = String(prof.nombre_edificio || codEdif).trim();

            const subtitulo = [
                codOficina ? `Cubículo ${codOficina}` : '',
                nomEdif !== codEdif ? `${nomEdif} (${codEdif})` : codEdif
            ].filter(Boolean).join(' · ');

            docs.push(construirDocumentoIndice({
                tipo_resultado: 'profesor',
                nombre: nombreProf,
                subtitulo: subtitulo,
                coordenadas: [lat, lng],
                codigo: codEdif,
                codigo_espacio: codOficina,
                profesor_asignado: nombreProf,
                contexto: [codOficina ? `Cubículo ${codOficina}` : '', codEdif].filter(Boolean).join(' · '),
                prioridadBase: 17,
                textoPrimario: `${nombreProf} ${tituloProf}`,
                textoSecundario: `profesor profesora docente maestro maestra cubiculo ${codOficina} ${codEdif} ${nomEdif}`
            }));
        });
    }

    // 4. Puntos de interés
    if (Array.isArray(data.puntos_interes)) {
        data.puntos_interes.forEach((poi) => {
            const lat = parseFloat(poi.lat);
            const lng = parseFloat(poi.lng);
            if (isNaN(lat) || isNaN(lng)) return;

            const cat = String(poi.categoria || 'banos');
            const meta = CATEGORIAS_POI_META[cat] || { label: 'Punto de interés', sinonimos: cat };
            const nombreRaw = String(poi.nombre || '').trim();
            const descRaw = String(poi.descripcion || '').trim();
            const tieneNombrePropio = nombreRaw !== '' && quitarAcentos(nombreRaw) !== quitarAcentos(meta.label);

            const nombreMostrar = tieneNombrePropio ? nombreRaw : meta.label;
            const subtitulo = tieneNombrePropio
                ? (descRaw ? `${meta.label} · ${descRaw}` : meta.label)
                : descRaw;

            docs.push(construirDocumentoIndice({
                tipo_resultado: 'poi',
                poi_id: String(poi.id || ''),
                categoria: cat,
                categoria_label: meta.label,
                descripcion: truncarTexto(descRaw, DESC_MAX_CARACTERES),
                nombre: nombreMostrar,
                subtitulo: subtitulo,
                coordenadas: [lat, lng],
                prioridadBase: 19,
                textoPrimario: `${nombreMostrar} ${meta.label}`,
                textoSecundario: `${meta.sinonimos} ${descRaw}`
            }));
        });
    }

    indiceDocumentos = docs;
    catalogoCargado = true;
}

function construirIndiceDesdeRespaldoLocal() {
    if (!Array.isArray(edificios_sugerido) || edificios_sugerido.length === 0) return;
    indiceDocumentos = edificios_sugerido.map((ed) => construirDocumentoIndice({
        tipo_resultado: 'edificio',
        nombre: ed.nombre,
        subtitulo: ed.codigo || '',
        coordenadas: ed.coordenadas,
        codigo: ed.codigo || '',
        prioridadBase: 25,
        textoPrimario: `${ed.codigo || ''} ${ed.nombre || ''}`,
        textoSecundario: 'edificio'
    }));
}

async function cargarCatalogoBusqueda(forzar = false) {
    if (catalogoCargado && !forzar) return;
    if (promesaCargaCatalogo && !forzar) return promesaCargaCatalogo;

    promesaCargaCatalogo = (async () => {
        try {
            const res = await fetch(construirUrlCatalogoBusqueda(forzar), {
                cache: forzar ? 'reload' : 'no-cache'
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (data && data.success) {
                construirIndiceDesdeDatos(data);
            } else {
                construirIndiceDesdeRespaldoLocal();
            }
        } catch (err) {
            console.warn('[Buscador] Error cargando catálogo unificado, usando respaldo local:', err);
            construirIndiceDesdeRespaldoLocal();
        } finally {
            promesaCargaCatalogo = null;
        }
    })();

    return promesaCargaCatalogo;
}

window.recargarCatalogoBusqueda = function () {
    catalogoCargado = false;
    return cargarCatalogoBusqueda(true);
};

function buscarEnIndiceLocal(consultaRaw) {
    if (indiceDocumentos.length === 0) {
        construirIndiceDesdeRespaldoLocal();
    }

    const tokensConsulta = tokenizarTexto(consultaRaw, false);
    if (tokensConsulta.length === 0) return [];

    const consultaCompacta = normalizarBusqueda(consultaRaw);
    const coincidencias = [];

    for (let i = 0; i < indiceDocumentos.length; i++) {
        const doc = indiceDocumentos[i];
        let puntajeTotal = 0;
        let todosCoinciden = true;

        for (let t = 0; t < tokensConsulta.length; t++) {
            const qTok = tokensConsulta[t];
            let mejorPuntajeToken = 0;

            for (let j = 0; j < doc.tokensPrimarios.length; j++) {
                const dTok = doc.tokensPrimarios[j];
                if (dTok === qTok) {
                    mejorPuntajeToken = Math.max(mejorPuntajeToken, 70);
                    break;
                } else if (dTok.startsWith(qTok)) {
                    mejorPuntajeToken = Math.max(mejorPuntajeToken, 50);
                } else if (qTok.length >= 3 && dTok.includes(qTok)) {
                    mejorPuntajeToken = Math.max(mejorPuntajeToken, 32);
                } else if (qTok.length >= 4 && Math.abs(dTok.length - qTok.length) <= 1) {
                    if (distanciaLevenshteinAcotada(qTok, dTok, 1) === 1) {
                        mejorPuntajeToken = Math.max(mejorPuntajeToken, 20);
                    }
                }
            }

            if (mejorPuntajeToken < 70) {
                for (let j = 0; j < doc.tokensSecundarios.length; j++) {
                    const dTok = doc.tokensSecundarios[j];
                    if (dTok === qTok) {
                        mejorPuntajeToken = Math.max(mejorPuntajeToken, 42);
                        break;
                    } else if (dTok.startsWith(qTok)) {
                        mejorPuntajeToken = Math.max(mejorPuntajeToken, 28);
                    } else if (qTok.length >= 3 && dTok.includes(qTok)) {
                        mejorPuntajeToken = Math.max(mejorPuntajeToken, 18);
                    } else if (qTok.length >= 4 && Math.abs(dTok.length - qTok.length) <= 1) {
                        if (distanciaLevenshteinAcotada(qTok, dTok, 1) === 1) {
                            mejorPuntajeToken = Math.max(mejorPuntajeToken, 12);
                        }
                    }
                }
            }

            if (mejorPuntajeToken === 0) {
                todosCoinciden = false;
                break;
            }

            puntajeTotal += mejorPuntajeToken;
        }

        if (!todosCoinciden) continue;

        if (doc.claveCompacta === consultaCompacta) {
            puntajeTotal += 120;
        } else if (consultaCompacta.length >= 2 && doc.claveCompacta.startsWith(consultaCompacta)) {
            puntajeTotal += 45;
        }

        puntajeTotal += (doc.prioridadBase || 0);
        coincidencias.push({ doc, score: puntajeTotal });
    }

    coincidencias.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.doc.nombre.localeCompare(b.doc.nombre, 'es');
    });

    return coincidencias.slice(0, 20).map((c) => c.doc);
}

function etiquetaTipoResultado(item) {
    if (item.tipo_resultado === 'laboratorio') return 'Laboratorio';
    if (item.tipo_resultado === 'aula') return 'Aula';
    if (item.tipo_resultado === 'taller') return 'Taller';
    if (item.tipo_resultado === 'cubiculo') return 'Cubículo';
    if (item.tipo_resultado === 'profesor') return 'Profesor';
    if (item.tipo_resultado === 'poi') return item.categoria_label || 'Punto de interés';
    return 'Edificio';
}

// Símbolo de Baños (dos figuras): el mismo que usa el marcador del mapa.
// Se toma de script_puntos_interes.js; esta copia es solo respaldo si aún no cargó.
const SVG_BANOS_RESPALDO =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<circle cx="7" cy="4.5" r="2"/>' +
    '<path d="M4.5 8.5A1.5 1.5 0 0 1 6 7h2a1.5 1.5 0 0 1 1.5 1.5V14H8.2v6H5.8v-6H4.5V8.5z"/>' +
    '<circle cx="17" cy="4.5" r="2"/>' +
    '<path d="M15.2 7h3.6c.65 0 1.22.42 1.42 1.04L21.5 13h-2.3v7h-4.4v-7h-2.3l1.28-4.96A1.5 1.5 0 0 1 15.2 7z"/>' +
    '</svg>';

function iconoBanosHTML() {
    const api = window.PuntosInteresCampus;
    const svg = (api && api.CATALOGO && api.CATALOGO.banos && api.CATALOGO.banos.svg) || SVG_BANOS_RESPALDO;
    return svg.replace('<svg ', '<svg width="20" height="20" style="display:block;" ');
}

const ICONOS_POI = {
    biblioteca: 'book-outline',
    canchas: 'basketball-outline',
    estacionamiento: 'car-outline',
    cafeteria: 'cafe-outline',
    tienda: 'storefront-outline'
};

function iconoIonHTML(nombre) {
    return '<ion-icon name="' + nombre + '" aria-hidden="true"></ion-icon>';
}

// Ícono + clase de color por tipo (los colores viven en styles_suggestion.css)
function metaVisualResultado(item) {
    switch (item.tipo_resultado) {
        case 'laboratorio': return { iconoHTML: iconoIonHTML('flask-outline'), clase: 'sug--laboratorio' };
        case 'aula':        return { iconoHTML: iconoIonHTML('school-outline'), clase: 'sug--aula' };
        case 'taller':      return { iconoHTML: iconoIonHTML('construct-outline'), clase: 'sug--taller' };
        case 'cubiculo':    return { iconoHTML: iconoIonHTML('briefcase-outline'), clase: 'sug--persona' };
        case 'profesor':    return { iconoHTML: iconoIonHTML('person-outline'), clase: 'sug--persona' };
        case 'poi': {
            const cat = String(item.categoria || 'otro').replace(/[^a-z0-9_-]/gi, '');
            const iconoHTML = cat === 'banos'
                ? iconoBanosHTML()
                : iconoIonHTML(ICONOS_POI[cat] || 'location-outline');
            return { iconoHTML: iconoHTML, clase: 'sug--poi-' + cat };
        }
        default:            return { iconoHTML: iconoIonHTML('business-outline'), clase: 'sug--edificio' };
    }
}

function construirItemSugerencia(item, index) {
    const tipo = etiquetaTipoResultado(item);
    const meta = metaVisualResultado(item);

    // Título: nombre sin repetir el tipo ("Edificio E1" -> "E1")
    let titulo = String(item.nombre || '');
    try {
        titulo = titulo.replace(new RegExp('^' + tipo + '\\s+', 'i'), '');
    } catch (e) {}

    // Contexto: una sola línea corta; se omite si repite el título
    let contexto = String(item.contexto || '').trim();
    if (contexto && quitarAcentos(titulo).indexOf(quitarAcentos(contexto)) !== -1) {
        contexto = '';
    }

    // Si el título ya es el tipo (ej. POI sin nombre propio: "Cafetería"), no se repite
    const mostrarTipo = quitarAcentos(titulo) !== quitarAcentos(tipo);

    let linea2 = '';
    if (mostrarTipo) {
        linea2 += '<span class="sug-tipo">' + sanitizeHTML(tipo) + '</span>';
    }
    if (contexto) {
        linea2 += '<span class="sug-ctx' + (mostrarTipo ? ' sug-ctx--sep' : '') + '">' + sanitizeHTML(contexto) + '</span>';
    }

    // Descripción: debajo, en hasta 3 líneas (el CSS agrega "…" si aun así no cabe)
    let descripcion = String(item.descripcion || '').trim();
    if (descripcion && quitarAcentos(descripcion) === quitarAcentos(titulo)) {
        descripcion = '';
    }

    return '<li class="sug-item ' + meta.clase + '" data-index="' + index + '">' +
        '<span class="sug-icono">' + meta.iconoHTML + '</span>' +
        '<span class="sug-texto">' +
            '<span class="sug-titulo">' + sanitizeHTML(titulo) + '</span>' +
            (linea2 ? '<span class="sug-meta">' + linea2 + '</span>' : '') +
        '</span>' +
        (descripcion ? '<span class="sug-desc">' + sanitizeHTML(descripcion) + '</span>' : '') +
        '</li>';
}

async function actualizarSugerenciasEnVivo(userData) {
    if (!catalogoCargado) {
        await cargarCatalogoBusqueda(false);
    }

    const sugerencias = buscarEnIndiceLocal(userData);
    resultadosBusqueda = sugerencias;
    currentIndex = -1;

    const items = sugerencias
        .slice(0, MAX_SUGERENCIAS_VISIBLES)
        .map((resultado, index) => construirItemSugerencia(resultado, index));

    if (sugerencias.length > MAX_SUGERENCIAS_VISIBLES) {
        items.push('<li class="sug-more">Hay más coincidencias · sigue escribiendo para afinar</li>');
    }
    searchContainer.classList.add('active');
    showSuggestions(items);

    const allList = boxSuggestions.querySelectorAll('li');
    allList.forEach((li, index) => {
        if (!li.hasAttribute('data-index')) return;
        li.addEventListener('click', function () {
            selectSearchResult(index);
        });
        li.addEventListener('mouseover', () => { currentIndex = index; });
        li.addEventListener('mouseleave', () => { currentIndex = -1; });
    });

    updateSuggestionsHighlight(allList);
}

function manejarCambioInputBusqueda() {
    const userData = inputSearch.value.trim();

    if (userData && !validarInput(userData)) {
        boxSuggestions.innerHTML = '<li class="sug-empty">Caracteres no permitidos</li>';
        searchContainer.classList.add('active');
        return;
    }

    if (userData) {
        actualizarSugerenciasEnVivo(userData);
    } else {
        resultadosBusqueda = [];
        searchContainer.classList.remove('active');
    }
}

inputSearch.addEventListener('focus', () => {
    if (!catalogoCargado) {
        cargarCatalogoBusqueda(false);
    }
});

inputSearch.addEventListener('input', manejarCambioInputBusqueda);

inputSearch.onkeyup = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape') {
        return;
    }
    manejarCambioInputBusqueda();
};

const showSuggestions = (list) => {
    try {
        const listData = (!list || list.length === 0)
            ? '<li class="sug-empty">No hay resultados</li>'
            : list.join('');

        if (boxSuggestions) {
            boxSuggestions.innerHTML = listData;
        }
    } catch (error) {
        console.error('Error al mostrar sugerencias:', error);
        if (boxSuggestions) {
            boxSuggestions.innerHTML = '<li class="sug-empty">Error al cargar sugerencias</li>';
        }
    }
};

const searchButton = searchContainer.querySelector('.search-button');

if (searchButton) {
    searchButton.addEventListener('click', (event) => {
        event.preventDefault();
        performSearch();
    });
}

async function performSearch() {
    try {
        const selectUserData = inputSearch.value.trim();
        if (!selectUserData || !validarInput(selectUserData)) return;

        if (!catalogoCargado) {
            await cargarCatalogoBusqueda(false);
        }

        if (resultadosBusqueda.length === 0) {
            resultadosBusqueda = buscarEnIndiceLocal(selectUserData);
        }

        const inputNormalizado = normalizarBusqueda(selectUserData);
        let selectedResultado = resultadosBusqueda.find((resultado) => {
            return (
                normalizarBusqueda(resultado.nombre) === inputNormalizado ||
                normalizarBusqueda(resultado.codigo) === inputNormalizado ||
                normalizarBusqueda(resultado.codigo_espacio) === inputNormalizado ||
                normalizarBusqueda(resultado.profesor_asignado) === inputNormalizado
            );
        });

        if (!selectedResultado && resultadosBusqueda.length > 0) {
            selectedResultado = resultadosBusqueda[0];
        }

        if (!selectedResultado) return;

        ejecutarResultadoBusqueda(selectedResultado);
        inputSearch.value = '';
        inputSearch.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (error) {
        console.error('Error en performSearch:', error);
    }
}

function obtenerEdificioPorResultado(resultado, inputNormalizado) {
    if (!Array.isArray(edificios) || edificios.length === 0) return null;

    const codigo = resultado && resultado.codigo ? String(resultado.codigo).toUpperCase() : '';
    if (codigo) {
        const porCodigo = edificios.find((edificio) => {
            return String(edificio.codigo || '').toUpperCase() === codigo;
        });
        if (porCodigo) return porCodigo;
    }

    return edificios.find((edificio) => {
        return normalizarBusqueda(edificio.nombre) === inputNormalizado;
    }) || null;
}

function ejecutarResultadoBusqueda(resultado) {
    if (!resultado) return;

    if (!resultado.coordenadas || resultado.coordenadas.length < 2) {
        console.error('Coordenadas inválidas para:', resultado.nombre);
        return;
    }

    if (typeof map === 'undefined') {
        console.error('Mapa no inicializado');
        return;
    }

    searchContainer.classList.remove('active');

    if (resultado.tipo_resultado === 'poi') {
        if (typeof cerrarPanelEdificio === 'function') {
            cerrarPanelEdificio();
        }
        map.setView(resultado.coordenadas, 19.4, { animate: true });

        if (window.PuntosInteresCampus && typeof window.PuntosInteresCampus.abrirPorId === 'function' && resultado.poi_id) {
            window.PuntosInteresCampus.abrirPorId(resultado.poi_id);
        }
        return;
    }

    map.setView(resultado.coordenadas, 19.4, { animate: true });

    if (typeof mostrarPanelEdificio === 'function') {
        const selectedEdificioInfo = obtenerEdificioPorResultado(resultado, normalizarBusqueda(resultado.nombre));
        if (selectedEdificioInfo) {
            mostrarPanelEdificio(selectedEdificioInfo);

            if (typeof window.buscarYResaltarEnPanel === 'function') {
                if (
                    resultado.tipo_resultado === 'laboratorio' ||
                    resultado.tipo_resultado === 'aula' ||
                    resultado.tipo_resultado === 'taller'
                ) {
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
        } else if (typeof window.mostrarEspaciosEnMapa === 'function') {
            window.mostrarEspaciosEnMapa({
                nombre: resultado.nombre,
                codigo: resultado.codigo,
                labelCoords: resultado.coordenadas
            });
        }
    }
}

if (inputSearch) {
    inputSearch.addEventListener('keydown', function (e) {
        const suggestions = boxSuggestions.querySelectorAll('li[data-index]');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (suggestions.length === 0) return;
            currentIndex = (currentIndex + 1) % suggestions.length;
            updateSuggestionsHighlight(suggestions);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (suggestions.length === 0) return;
            currentIndex = currentIndex <= 0 ? suggestions.length - 1 : currentIndex - 1;
            updateSuggestionsHighlight(suggestions);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (currentIndex > -1 && currentIndex < suggestions.length) {
                selectSearchResult(currentIndex);
            } else {
                performSearch();
            }
        } else if (e.key === 'Escape') {
            searchContainer.classList.remove('active');
        }
    });
}

function updateSuggestionsHighlight(suggestions) {
    suggestions.forEach((suggestion, index) => {
        suggestion.classList.remove('highlight');
        if (index === currentIndex) {
            suggestion.classList.add('highlight');
            if (typeof suggestion.scrollIntoView === 'function') {
                suggestion.scrollIntoView({ block: 'nearest' });
            }
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

    const indexAttr = element.getAttribute('data-index');
    const index = Number(indexAttr);
    if (Number.isFinite(index)) {
        selectSearchResult(index);
        return;
    }

    const selectUserData = element.textContent.trim();
    if (!validarInput(selectUserData)) return;
    inputSearch.value = selectUserData;
    performSearch();
}

function selectSearchResult(index) {
    if (!Array.isArray(resultadosBusqueda) || index < 0 || index >= resultadosBusqueda.length) {
        return;
    }

    const selected = resultadosBusqueda[index];
    ejecutarResultadoBusqueda(selected);
    inputSearch.value = '';
    inputSearch.dispatchEvent(new Event('input', { bubbles: true }));
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => cargarCatalogoBusqueda(false));
} else {
    cargarCatalogoBusqueda(false);
}