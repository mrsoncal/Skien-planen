(function () {
    var MOBILE_MAX = 700;

    function isMobile() {
        return (window.innerWidth || 0) <= MOBILE_MAX;
    }

    function qs(sel, root) {
        return (root || document).querySelector(sel);
    }

    function qsa(sel, root) {
        try { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); } catch (err) { return []; }
    }

    function ensureBackdrop() {
        var existing = qs('.nav-backdrop');
        if (existing) return existing;

        var el = document.createElement('div');
        el.className = 'nav-backdrop';
        el.setAttribute('aria-hidden', 'true');
        document.body.appendChild(el);
        return el;
    }

    function setOpen(open) {
        var header = qs('header');
        var btn = qs('header .nav-toggle');
        var nav = qs('header #siteNav');
        var backdrop = ensureBackdrop();

        if (!btn || !nav || !header) return;

        if (open) {
            header.classList.remove('is-hidden');
            document.body.classList.add('nav-open');
            btn.setAttribute('aria-expanded', 'true');

            // Focus first link for keyboard users.
            var firstLink = qs('a', nav);
            if (firstLink) firstLink.focus();
        } else {
            document.body.classList.remove('nav-open');
            btn.setAttribute('aria-expanded', 'false');
            if (document.activeElement && nav.contains(document.activeElement)) {
                btn.focus();
            }
        }

        try {
            backdrop.style.pointerEvents = open ? 'auto' : 'none';
        } catch (err) { /* ignore */ }
    }

    function isOpen() {
        return document.body.classList.contains('nav-open');
    }

    function setup() {
        var header = qs('header');
        if (!header) return;

        var btn = qs('.nav-toggle', header);
        var nav = qs('#siteNav', header);
        if (!btn || !nav) return;

        ensureBackdrop();

        btn.addEventListener('click', function () {
            if (!isMobile()) return;
            setOpen(!isOpen());
        });

        // Close when clicking the darkened area.
        var backdrop = qs('.nav-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', function () {
                setOpen(false);
            });
        }

        // Close when clicking a link in the panel.
        nav.addEventListener('click', function (e) {
            var t = e.target;
            if (t && t.tagName && String(t.tagName).toLowerCase() === 'a') {
                setOpen(false);
            }
        });

        // ESC closes.
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') setOpen(false);
        });

        // If we leave mobile breakpoint, ensure menu is closed.
        window.addEventListener('resize', function () {
            if (!isMobile()) setOpen(false);
        });

        // Safety: if user starts scrolling while open, keep it open but avoid background scrolling.
        // (Handled by CSS body.nav-open overflow)
    }

    document.addEventListener('DOMContentLoaded', setup);
})();
