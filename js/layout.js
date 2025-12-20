(function () {
    function pathPrefixForCurrentPage() {
        // Computes how many "../" segments we need from the current page back to site root.
        // Examples:
        // - /index.html -> ""
        // - /pages/infrastruktur.html -> "../"
        // - /pages/foo/bar.html -> "../../"
        try {
            var parts = String(location.pathname || '/').split('/').filter(Boolean);
            if (parts.length <= 1) return '';
            return new Array(parts.length).join('../');
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
