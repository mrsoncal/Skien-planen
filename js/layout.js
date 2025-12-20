(function () {
    function pathPrefixForCurrentPage() {
        // Computes the relative prefix back to the site root (where index.html lives).
        // This site only has one level of content pages under /pages/.
        // IMPORTANT: location.pathname may include extra leading segments when hosted
        // under a subfolder (e.g. /Skien-planen/pages/...), so counting segments
        // from the absolute path will produce broken prefixes.
        try {
            var path = String(location.pathname || '/').replace(/\\/g, '/');

            // If current file is inside /pages/, we need to go up one level.
            // Otherwise (index.html at the root), no prefix.
            if (/\/pages\//.test(path)) return '../';
            return '';
        } catch (err) {
            return '';
        }
    }

    function headerHtml(prefix) {
        return ''
            + '<div class="site-header-inner">'
            + '  <h1>Skien Planen</h1>'
            + '  <nav id="siteNav" class="site-nav" aria-label="Primary">'
            + '    <a href="' + prefix + 'index.html">Hjem</a>'
            + '    <a href="' + prefix + 'pages/infrastruktur.html">Infrastruktur</a>'
            + '    <a href="' + prefix + 'pages/kollektivtransport.html">Kollektivtransport</a>'
            + '    <a href="' + prefix + 'pages/moteplasser.html">Møteplasser</a>'
            + '    <a href="' + prefix + 'pages/arkitektur.html">Arkitektur</a>'
            + '  </nav>'
            + '  <button type="button" class="nav-toggle" aria-label="Meny" aria-expanded="false" aria-controls="siteNav">☰</button>'
            + '</div>';
    }

    function footerHtml() {
        return ''
            + '<div class="site-footer-inner">'
            + '  <small>&copy; <span id="year"></span> Sondre Callaerts</small>'
            + '</div>';
    }

    function ensureLayout() {
        var prefix = pathPrefixForCurrentPage();

        try {
            var header = document.querySelector('header[data-layout="header"], header.site-header, header');
            if (header && header.hasAttribute('data-layout')) {
                header.innerHTML = headerHtml(prefix);
            }

            var footer = document.querySelector('footer[data-layout="footer"], footer.site-footer, footer');
            if (footer && footer.hasAttribute('data-layout')) {
                footer.innerHTML = footerHtml();
            }
        } catch (err) { /* ignore */ }
    }

    document.addEventListener('DOMContentLoaded', ensureLayout);
})();
