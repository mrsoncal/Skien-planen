(function () {
    function getTargetId() {
        var raw = String(window.location.hash || '');
        if (!raw || raw === '#') return null;
        var id = raw.charAt(0) === '#' ? raw.slice(1) : raw;
        try { return decodeURIComponent(id); } catch (e) { return id; }
    }

    function getHeaderOffsetPx() {
        try {
            var header = document.querySelector('header');
            var h = header ? (header.offsetHeight || 0) : 0;
            if (h > 0) return h;
        } catch (e) { /* ignore */ }

        try {
            var v = getComputedStyle(document.documentElement).getPropertyValue('--header-offset');
            var n = parseFloat(String(v || '').trim());
            if (!isNaN(n)) return n;
        } catch (e2) { /* ignore */ }

        return 0;
    }

    function flash(el) {
        try {
            el.classList.remove('is-target-flash');
            // Force reflow so animation can restart.
            void el.offsetWidth;
            el.classList.add('is-target-flash');
            window.setTimeout(function () {
                try { el.classList.remove('is-target-flash'); } catch (e) { /* ignore */ }
            }, 2800);
        } catch (e) { /* ignore */ }
    }

    function scrollToTarget() {
        var id = getTargetId();
        if (!id) return;

        var el = document.getElementById(id);
        if (!el) return;

        try {
            el.scrollIntoView({ block: 'start', behavior: 'auto' });
        } catch (e) {
            // fallback
            try { el.scrollIntoView(true); } catch (e2) { /* ignore */ }
        }

        var headerOffset = getHeaderOffsetPx();
        if (headerOffset > 0) {
            try { window.scrollBy(0, -(headerOffset + 16)); } catch (e3) { /* ignore */ }
        }

        flash(el);
    }

    function init() {
        // Run a few times because header/back-link/markdown injection can shift layout after initial anchor scroll.
        scrollToTarget();
        window.setTimeout(scrollToTarget, 250);
        window.setTimeout(scrollToTarget, 750);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
