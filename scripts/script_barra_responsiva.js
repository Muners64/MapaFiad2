if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initResponsiveSearch);
} else {
    initResponsiveSearch();
}

function initResponsiveSearch() {
    var navbar = document.querySelector('.navbar');
    var searchBox = document.querySelector('.search-input-box');
    var searchInput = searchBox ? searchBox.querySelector('input') : null;
    var searchBtn = searchBox ? searchBox.querySelector('.search-button') : null;
    var collapseBtn = document.getElementById('btn-toggle-search');
    var clearBtn = document.getElementById('btn-clear-search');
    var mobileQuery = window.matchMedia('(max-width: 768px)');

    if (!navbar || !searchBox) return;

    function colapsarBuscador() {
        if (!mobileQuery.matches) return;
        navbar.classList.add('search-collapsed');
        searchBox.classList.remove('active');
        if (searchInput) searchInput.blur();
        if (typeof recalcularAlturaPanelMovil === 'function') {
            setTimeout(recalcularAlturaPanelMovil, 300);
        }
    }

    function expandirBuscador(enfocar) {
        navbar.classList.remove('search-collapsed');
        if (enfocar && searchInput) {
            setTimeout(function () {
                searchInput.focus();
            }, 180);
        }
        if (typeof recalcularAlturaPanelMovil === 'function') {
            setTimeout(recalcularAlturaPanelMovil, 300);
        }
    }

    // Botón X superior derecho para minimizar el buscador en móvil
    if (collapseBtn) {
        collapseBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            colapsarBuscador();
        });
    }

    // Al tocar el ícono de lupa cuando está colapsado en móvil, lo despliega
    if (searchBtn) {
        searchBtn.addEventListener('click', function (e) {
            if (mobileQuery.matches && navbar.classList.contains('search-collapsed')) {
                e.preventDefault();
                e.stopImmediatePropagation();
                expandirBuscador(true);
            }
        }, true);
    }

    // Botón blanco dentro de la barra para borrar el texto escrito
    if (clearBtn && searchInput) {
        function actualizarVisibilidadClear() {
            if (searchInput.value.trim().length > 0) {
                clearBtn.classList.add('visible');
            } else {
                clearBtn.classList.remove('visible');
            }
        }

        searchInput.addEventListener('input', actualizarVisibilidadClear);
        actualizarVisibilidadClear();

        clearBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            searchInput.value = '';
            actualizarVisibilidadClear();
            searchBox.classList.remove('active');
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.focus();
        });
    }

    // Si el usuario pasa a escritorio, asegurar que siempre esté expandido
    if (typeof mobileQuery.addEventListener === 'function') {
        mobileQuery.addEventListener('change', function (e) {
            if (!e.matches) {
                navbar.classList.remove('search-collapsed');
            }
        });
    }
}