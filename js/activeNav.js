(function () {
    function normalizePath(p) {
        return String(p || '')
            .replace(/index\.html$/i, '')
            .replace(/\/$/, '')
            .trim() || '/';
    }

    function applyActiveNav() {
        try {
            var links = document.querySelectorAll('header nav a');
            if (!links || !links.length) return;

            var currentPath = normalizePath(location.pathname);

            links.forEach(function (a) {
                try {
                    var linkPath = normalizePath(new URL(a.getAttribute('href'), location.href).pathname);
                    var isActive = (linkPath === currentPath);

                    if (isActive) {
                        a.setAttribute('aria-current', 'page');
                        a.classList.add('is-active');
                    } else {
                        a.removeAttribute('aria-current');
                        a.classList.remove('is-active');
                    }
                } catch (err) { /* ignore */ }
            });
        } catch (err) { /* ignore */ }
    }

    document.addEventListener('DOMContentLoaded', applyActiveNav);
})();
