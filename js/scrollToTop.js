(function () {
    function createButton() {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'scroll-top-btn';
        btn.setAttribute('aria-label', 'Til toppen');
        btn.title = 'Til toppen';

        // Simple arrow icon (SVG)
        btn.innerHTML = ''
            + '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">'
            + '  <path fill="currentColor" d="M12 5l7 7-1.4 1.4L13 8.8V20h-2V8.8L6.4 13.4 5 12z"/>'
            + '</svg>';

        btn.addEventListener('click', function () {
            try {
                window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
            } catch (e) {
                try { window.scrollTo(0, 0); } catch (e2) { /* ignore */ }
            }
        });

        return btn;
    }

    function init() {
        // Only on content pages (not index)
        try {
            if (!String(window.location.pathname || '').includes('/pages/')) return;
        } catch (e) { /* ignore */ }

        if (document.querySelector('.scroll-top-btn')) return;
        document.body.appendChild(createButton());
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
