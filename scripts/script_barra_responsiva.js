// Menu responsivo - Solo se activa si el elemento existe en el HTML
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initResponsiveMenu);
} else {
    initResponsiveMenu();
}

function initResponsiveMenu() {
    const menuToggle = document.querySelector('.menu-responsive');
    const navbar = document.querySelector('.navbar');

    if (menuToggle && navbar) {
        menuToggle.addEventListener('click', () => {
            navbar.classList.toggle('active');
        });
    }
}

