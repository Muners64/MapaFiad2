(function () {
    const cacheMemoria = new Map();
    let overlayEl = null;

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
                        </div>
                        <button type="button" id="horarioModalCerrar" class="horario-modal-cerrar" aria-label="Cerrar horario">&times;</button>
                    </div>
                    <div class="horario-modal-body" id="horarioModalBody"></div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        overlayEl = document.getElementById('horarioModalOverlay');

        // Cerrar con botón X
        document.getElementById('horarioModalCerrar').addEventListener('click', cerrarHorarioSalon);

        // Cerrar al hacer clic fuera de la tarjeta
        overlayEl.addEventListener('click', function (e) {
            if (e.target === overlayEl) cerrarHorarioSalon();
        });

        // Cerrar con tecla Escape
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
        // Mezcla al 28% sobre blanco para garantizar legibilidad con texto oscuro
        const mix = (c) => Math.round(255 - (255 - c) * 0.28);
        return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
    }

    function renderizarCuadricula(data) {
        const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        // Periodos 1 (7:00) al 15 (22:00)
        const minPeriodo = 1;
        const maxPeriodo = 15;

        // Matriz [periodo][dia_index]
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

        // Día actual: getDay() devuelve 0=Dom, 1=Lun ... 6=Sáb. Si es Dom (0), muestra Lun (0).
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

    async function abrirHorarioSalon(idHorario, nombreFallback = '') {
        crearComponenteDOM();

        const tituloEl = document.getElementById('horarioModalTitulo');
        const subtituloEl = document.getElementById('horarioModalSubtitulo');
        const bodyEl = document.getElementById('horarioModalBody');

        tituloEl.textContent = nombreFallback || `Cargando espacio #${idHorario}...`;
        subtituloEl.innerHTML = '';
        bodyEl.innerHTML = '<div class="horario-loading">Consultando horario actualizado...</div>';
        overlayEl.classList.add('abierto');

        try {
            let data;
            if (cacheMemoria.has(idHorario)) {
                data = cacheMemoria.get(idHorario);
            } else {
                const res = await fetch(`api/horarios.php?id=${encodeURIComponent(idHorario)}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                data = await res.json();
                if (data.error) throw new Error(data.error);
                cacheMemoria.set(idHorario, data);
            }

            tituloEl.textContent = data.aula || nombreFallback;
            const badgeClase = data.ocupado_ahora ? 'ocupado' : 'libre';
            const badgeTexto = data.ocupado_ahora
                ? `Ocupado ahora (${data.clase_actual.materia})`
                : 'Disponible ahora';

            subtituloEl.innerHTML = `
                <span class="horario-badge-estado ${badgeClase}">${badgeTexto}</span>
                <span>Código: ${data.codigo || '-'}</span>
            `;

            bodyEl.innerHTML = renderizarCuadricula(data) + renderizarVistaMovil(data);

            // Eventos para cambiar de día en vista móvil
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

    // Exponer API pública global
    window.abrirHorarioSalon = abrirHorarioSalon;
    window.cerrarHorarioSalon = cerrarHorarioSalon;

    // Delegación de eventos: cualquier elemento con data-id-horario abre el modal al hacer clic
    document.addEventListener('click', function (e) {
        const trigger = e.target.closest('[data-id-horario]');
        if (!trigger) return;

        const idHorario = parseInt(trigger.getAttribute('data-id-horario'), 10);
        if (idHorario > 0) {
            e.preventDefault();
            const nombre = trigger.getAttribute('data-nombre-salon') || trigger.textContent.trim();
            abrirHorarioSalon(idHorario, nombre);
        }
    });
})();