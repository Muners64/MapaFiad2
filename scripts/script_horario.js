(function () {
    const cacheMemoria = new Map();
    let overlayEl = null;

    function formatearNombreProfesor(titulo, nombre) {
        const t = String(titulo || '').trim();
        const n = String(nombre || '').trim();
        if (!n) return '';
        if (!t) return n;
        if (n.toLowerCase().startsWith(t.toLowerCase() + ' ')) {
            return n;
        }
        return `${t} ${n}`;
    }

    function formatearTelefonoExtension(telefono, extension) {
        const tel = String(telefono || '').trim();
        const ext = String(extension || '').trim();
        if (tel && ext) return `${tel} · Ext. ${ext}`;
        if (tel) return tel;
        if (ext) return `Ext. ${ext}`;
        return '';
    }

    function escaparHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderizarContactoProfesor(contacto) {
        if (!contacto) return '';
        const email = String(contacto.email || '').trim();
        const telefono = String(contacto.telefono || '').trim();
        const extension = String(contacto.extension || '').trim();
        const telFormateado = formatearTelefonoExtension(telefono, extension);

        if (!email && !telFormateado) return '';

        const items = [];
        if (email) {
            const safeEmail = escaparHtml(email);
            items.push(`
                <a class="horario-contacto-item" href="mailto:${safeEmail}" title="Enviar correo">
                    <span class="horario-contacto-icono icono-email" aria-hidden="true"></span>
                    <span>${safeEmail}</span>
                </a>
            `);
        }

        if (telFormateado) {
            const safeTelText = escaparHtml(telFormateado);
            if (telefono) {
                const telHref = escaparHtml(telefono.replace(/\s+/g, ''));
                items.push(`
                    <a class="horario-contacto-item" href="tel:${telHref}" title="Llamar">
                        <span class="horario-contacto-icono icono-telefono" aria-hidden="true"></span>
                        <span>${safeTelText}</span>
                    </a>
                `);
            } else {
                items.push(`
                    <span class="horario-contacto-item">
                        <span class="horario-contacto-icono icono-telefono" aria-hidden="true"></span>
                        <span>${safeTelText}</span>
                    </span>
                `);
            }
        }

        return items.join('');
    }

    function crearComponenteDOM() {
        if (document.getElementById('horarioModalOverlay')) {
            overlayEl = document.getElementById('horarioModalOverlay');
            return;
        }

        const html = `
            <div id="horarioModalOverlay" class="horario-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="horarioModalTitulo">
                <div class="horario-modal-card">
                    <div class="horario-modal-header">
                        <div class="horario-modal-titulo-wrap">
                            <h3 id="horarioModalTitulo">Horario del Espacio</h3>
                            <div class="horario-modal-subtitulo" id="horarioModalSubtitulo"></div>
                            <div class="horario-modal-contacto" id="horarioModalContacto"></div>
                        </div>
                        <button type="button" id="horarioModalCerrar" class="horario-modal-cerrar" aria-label="Cerrar horario">&times;</button>
                    </div>
                    <div class="horario-modal-body" id="horarioModalBody"></div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        overlayEl = document.getElementById('horarioModalOverlay');

        document.getElementById('horarioModalCerrar').addEventListener('click', cerrarHorarioSalon);

        overlayEl.addEventListener('click', function (e) {
            if (e.target === overlayEl) cerrarHorarioSalon();
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && overlayEl.classList.contains('abierto')) {
                cerrarHorarioSalon();
            }
        });
    }

    function aclararColorHex(hex) {
        if (!hex || !hex.startsWith('#') || hex.length !== 7) return '#e0f2fe';
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const mix = (c) => Math.round(255 - (255 - c) * 0.28);
        return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
    }

    function renderizarCuadricula(data) {
        const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const minPeriodo = 1;
        const maxPeriodo = 15;

        const matriz = {};
        const ocupadasPorSpan = {};

        (data.bloques || []).forEach((b) => {
            const key = `${b.periodo}_${b.dia_index}`;
            matriz[key] = b;
            for (let offset = 1; offset < (b.duracion || 1); offset++) {
                ocupadasPorSpan[`${b.periodo + offset}_${b.dia_index}`] = true;
            }
        });

        let rowsHtml = '';
        for (let p = minPeriodo; p <= maxPeriodo; p++) {
            const horaIni = `${String(p + 6).padStart(2, '0')}:00`;
            const horaFin = `${String(p + 7).padStart(2, '0')}:00`;

            rowsHtml += `<tr><td class="celda-hora">${horaIni}<br>${horaFin}</td>`;

            for (let d = 0; d < 6; d++) {
                const key = `${p}_${d}`;
                if (ocupadasPorSpan[key]) continue;

                const bloque = matriz[key];
                if (bloque) {
                    const span = bloque.duracion > 1 ? `rowspan="${bloque.duracion}"` : '';
                    const bg = aclararColorHex(bloque.color);
                    rowsHtml += `
                        <td ${span}>
                            <div class="horario-bloque" style="background-color: ${bg};">
                                <div class="horario-bloque-materia">${bloque.materia}</div>
                                <div class="horario-bloque-meta">
                                    <span><strong>${bloque.grupos || ''}</strong></span>
                                    <span>${bloque.profesores || ''}</span>
                                </div>
                            </div>
                        </td>
                    `;
                } else {
                    rowsHtml += `<td></td>`;
                }
            }
            rowsHtml += `</tr>`;
        }

        return `
            <div class="horario-tabla-wrapper">
                <table class="horario-grid">
                    <thead>
                        <tr>
                            <th class="col-hora">Hora</th>
                            ${dias.map((dia) => `<th>${dia}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        `;
    }

    function renderizarVistaMovil(data) {
        const diasCortos = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const diasLargos = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

        const hoyJs = new Date().getDay();
        const diaInicial = (hoyJs >= 1 && hoyJs <= 6) ? hoyJs - 1 : 0;

        const tabsHtml = diasCortos.map((nombre, idx) => {
            const activo = idx === diaInicial ? 'activo' : '';
            const tieneClases = (data.bloques || []).some(b => b.dia_index === idx);
            return `
                <button type="button" class="horario-dia-tab ${activo}" data-dia-idx="${idx}">
                    ${nombre}
                    ${tieneClases ? '<span class="dot-clase"></span>' : ''}
                </button>
            `;
        }).join('');

        const panelesHtml = diasLargos.map((diaNombre, idx) => {
            const activo = idx === diaInicial ? 'activo' : '';
            const clasesDia = (data.bloques || []).filter(b => b.dia_index === idx);

            if (clasesDia.length === 0) {
                return `
                    <div class="horario-dia-panel ${activo}" data-panel-dia="${idx}">
                        <div class="horario-dia-vacio">Sin clases programadas el ${diaNombre.toLowerCase()}.</div>
                    </div>
                `;
            }

            const tarjetas = clasesDia.map(b => {
                const bg = aclararColorHex(b.color);
                const ini = b.hora_inicio || `${String(b.periodo + 6).padStart(2, '0')}:00`;
                const fin = b.hora_fin || `${String(b.periodo + 6 + (b.duracion || 1)).padStart(2, '0')}:00`;

                return `
                    <div class="horario-card-movil" style="background-color: ${bg};">
                        <div class="horario-card-movil-hora">
                            <span>${ini} - ${fin}</span>
                            <span class="horario-card-movil-grupo">${b.grupos || ''}</span>
                        </div>
                        <div class="horario-card-movil-materia">${b.materia}</div>
                        ${b.profesores ? `<div class="horario-card-movil-profe">${b.profesores}</div>` : ''}
                    </div>
                `;
            }).join('');

            return `
                <div class="horario-dia-panel ${activo}" data-panel-dia="${idx}">
                    ${tarjetas}
                </div>
            `;
        }).join('');

        return `
            <div class="horario-movil-contenedor">
                <div class="horario-dias-tabs" role="tablist">${tabsHtml}</div>
                <div class="horario-dias-paneles">${panelesHtml}</div>
            </div>
        `;
    }

    async function abrirHorarioSalon(identificador, nombreFallback = '', tipoEspacio = 1, datosExtra = null) {
        crearComponenteDOM();

        const esCubiculo = Number(tipoEspacio) === 4;
        const cacheKey = `${esCubiculo ? 'emp' : 'aula'}_${identificador}`;

        const tituloEl = document.getElementById('horarioModalTitulo');
        const subtituloEl = document.getElementById('horarioModalSubtitulo');
        const contactoEl = document.getElementById('horarioModalContacto');
        const bodyEl = document.getElementById('horarioModalBody');

        const infoCacheGlobal = (esCubiculo && window.datosProfesoresHorario)
            ? (window.datosProfesoresHorario[String(identificador)] || {})
            : {};
        const infoInicial = Object.assign({}, infoCacheGlobal, datosExtra || {});

        const tituloInicial = nombreFallback
            ? nombreFallback
            : (esCubiculo && infoInicial.nombre_completo
                ? infoInicial.nombre_completo
                : `Cargando ${esCubiculo ? 'docente' : 'espacio'} #${identificador}...`);

        tituloEl.textContent = tituloInicial;
        subtituloEl.innerHTML = '';
        contactoEl.innerHTML = esCubiculo ? renderizarContactoProfesor(infoInicial) : '';
        bodyEl.innerHTML = '<div class="horario-loading">Consultando horario actualizado...</div>';
        overlayEl.classList.add('abierto');

        try {
            let data;
            if (cacheMemoria.has(cacheKey)) {
                data = cacheMemoria.get(cacheKey);
            } else {
                const queryParam = esCubiculo
                    ? `empleado=${encodeURIComponent(identificador)}`
                    : `id=${encodeURIComponent(identificador)}`;

                const res = await fetch(`api/horarios.php?${queryParam}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                data = await res.json();
                if (data.error) throw new Error(data.error);
                cacheMemoria.set(cacheKey, data);
            }

            if (esCubiculo) {
                const tituloProf = String(
                    data.titulo ||
                    data.profesor_titulo ||
                    infoInicial.titulo ||
                    ''
                ).trim();
                const nombreProf = String(
                    data.profesor ||
                    data.aula ||
                    infoInicial.nombre ||
                    ''
                ).trim();
                const nombreConTitulo = formatearNombreProfesor(tituloProf, nombreProf);

                let tituloFinal = nombreFallback;
                if (!tituloFinal) {
                    const partesCubiculo = [
                        String(data.codigo_edificio || '').trim(),
                        String(data.numero_espacio || '').trim(),
                        nombreConTitulo
                    ].filter(Boolean);
                    tituloFinal = partesCubiculo.length > 0 ? partesCubiculo.join(' - ') : nombreConTitulo;
                }
                tituloEl.textContent = tituloFinal;

                const contactoFinal = {
                    email: data.email || data.profesor_email || infoInicial.email || '',
                    telefono: data.telefono || data.profesor_telefono || infoInicial.telefono || '',
                    extension: data.extension || data.profesor_extension || infoInicial.extension || ''
                };
                contactoEl.innerHTML = renderizarContactoProfesor(contactoFinal);
            } else {
                tituloEl.textContent = nombreFallback || data.aula;
                contactoEl.innerHTML = '';
            }

            let badgeHtml = '';
            if (esCubiculo) {
                if (data.ocupado_ahora) {
                    badgeHtml = `<span class="horario-badge-estado ocupado">En clase ahora (${data.clase_actual.materia})</span>`;
                }
            } else {
                const badgeClase = data.ocupado_ahora ? 'ocupado' : 'libre';
                const badgeTexto = data.ocupado_ahora
                    ? `Ocupado ahora (${data.clase_actual.materia})`
                    : 'Disponible ahora';
                badgeHtml = `<span class="horario-badge-estado ${badgeClase}">${badgeTexto}</span>`;
            }

            subtituloEl.innerHTML = badgeHtml;

            bodyEl.innerHTML = renderizarCuadricula(data) + renderizarVistaMovil(data);

            bodyEl.querySelectorAll('.horario-dia-tab').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = btn.getAttribute('data-dia-idx');
                    bodyEl.querySelectorAll('.horario-dia-tab').forEach(t => t.classList.remove('activo'));
                    bodyEl.querySelectorAll('.horario-dia-panel').forEach(p => p.classList.remove('activo'));
                    btn.classList.add('activo');
                    bodyEl.querySelector(`.horario-dia-panel[data-panel-dia="${idx}"]`).classList.add('activo');
                });
            });
        } catch (err) {
            bodyEl.innerHTML = `<div class="horario-error">No se pudo cargar el horario: ${err.message}</div>`;
        }
    }

    function cerrarHorarioSalon() {
        if (overlayEl) {
            overlayEl.classList.remove('abierto');
        }
    }

    window.abrirHorarioSalon = abrirHorarioSalon;
    window.cerrarHorarioSalon = cerrarHorarioSalon;

    // Delegación de eventos: soporta tanto data-id-horario como data-num-empleado / data-tipo-espacio="4"
    document.addEventListener('click', function (e) {
        // Si hace clic directamente en el enlace de correo o teléfono de la tarjeta, no abrir el modal
        if (e.target.closest('a')) return;

        const trigger = e.target.closest('[data-id-horario], [data-num-empleado]');
        if (!trigger) return;

        const tipoEspacio = parseInt(trigger.getAttribute('data-tipo-espacio') || '1', 10);
        const nombre = trigger.getAttribute('data-nombre-salon') || trigger.textContent.trim();

        if (tipoEspacio === 4 || trigger.hasAttribute('data-num-empleado')) {
            const numEmpleado = (
                trigger.getAttribute('data-num-empleado') ||
                trigger.getAttribute('data-id-horario') ||
                ''
            ).trim();

            if (numEmpleado) {
                e.preventDefault();
                const datosExtra = {
                    titulo: trigger.getAttribute('data-profesor-titulo') || '',
                    email: trigger.getAttribute('data-profesor-email') || '',
                    telefono: trigger.getAttribute('data-profesor-telefono') || '',
                    extension: trigger.getAttribute('data-profesor-extension') || ''
                };
                abrirHorarioSalon(numEmpleado, nombre, 4, datosExtra);
            }
            return;
        }

        const idHorario = parseInt(trigger.getAttribute('data-id-horario'), 10);
        if (idHorario > 0) {
            e.preventDefault();
            abrirHorarioSalon(idHorario, nombre, tipoEspacio);
        }
    });
})();