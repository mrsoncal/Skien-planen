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

    function findSectionAnchorById(id) {
        try {
            var nodes = document.querySelectorAll('.section-anchor[id]');
            for (var i = 0; i < nodes.length; i++) {
                if (nodes[i] && String(nodes[i].id) === String(id)) return nodes[i];
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    function scrollToTarget() {
        var id = getTargetId();
        if (!id) return;

        // Prefer the actual section heading (in case some injected content ever creates duplicate ids).
        var el = findSectionAnchorById(id) || document.getElementById(id);
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

        // Also respond to hash changes (e.g. in-page navigation).
        window.addEventListener('hashchange', function () {
            scrollToTarget();
            window.setTimeout(scrollToTarget, 250);
        });

        // If markdown injection happens after initial load, re-run so the flash is visible
        // even when layout shifts push the target around.
        var mdTimer = 0;
        document.addEventListener('md:injected', function () {
            try { window.clearTimeout(mdTimer); } catch (e) { /* ignore */ }
            mdTimer = window.setTimeout(function () {
                scrollToTarget();
            }, 60);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
