(function () {
    function qs(sel, root) {
        return (root || document).querySelector(sel);
    }

    function setFiltersOpen(open, explain, filtersBtn) {
        if (!explain || !filtersBtn) return;
        if (open) explain.classList.add('is-open');
        else explain.classList.remove('is-open');
        filtersBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function requestLayoutRecalc() {
        try {
            window.dispatchEvent(new Event('resize'));
        } catch (err) {
            try {
                var ev = document.createEvent('Event');
                ev.initEvent('resize', true, true);
                window.dispatchEvent(ev);
            } catch (err2) { /* ignore */ }
        }
    }

    function setup() {
        var view = qs('#baView');
        if (!view) return;

        var explain = qs('#baExplain');
        var openBtn = qs('#baFullscreenOpen');
        var closeBtn = qs('#baFullscreenClose');
        var filtersBtn = qs('#baFullscreenFilters');

        if (!openBtn || !closeBtn || !filtersBtn) return;

        openBtn.addEventListener('click', function () {
            document.body.classList.add('map-fullscreen');
            document.body.classList.remove('nav-open');
            setFiltersOpen(false, explain, filtersBtn);
            requestLayoutRecalc();
        });

        closeBtn.addEventListener('click', function () {
            document.body.classList.remove('map-fullscreen');
            setFiltersOpen(false, explain, filtersBtn);
            requestLayoutRecalc();
        });

        filtersBtn.addEventListener('click', function () {
            if (!document.body.classList.contains('map-fullscreen')) return;
            var isOpen = explain && explain.classList.contains('is-open');
            setFiltersOpen(!isOpen, explain, filtersBtn);
        });
    }

    document.addEventListener('DOMContentLoaded', setup);
})();
