(function () {
    function getAnchors() {
        try {
            return Array.prototype.slice.call(document.querySelectorAll('.section-anchor[id]'));
        } catch (e) {
            return [];
        }
    }

    function getHeaderOffsetPx() {
        try {
            var v = getComputedStyle(document.documentElement).getPropertyValue('--header-offset');
            var n = parseFloat(String(v || '').trim());
            if (!isNaN(n)) return n;
        } catch (e) { /* ignore */ }
        return 0;
    }

    function flash(el) {
        try {
            el.classList.remove('is-target-flash');
            void el.offsetWidth;
            el.classList.add('is-target-flash');
            window.setTimeout(function () {
                try { el.classList.remove('is-target-flash'); } catch (e) { /* ignore */ }
            }, 2800);
        } catch (e) { /* ignore */ }
    }

    function scrollToAnchor(el) {
        if (!el) return;

        function doScroll() {
            try {
                el.scrollIntoView({ block: 'start', behavior: 'auto' });
            } catch (e) {
                try { el.scrollIntoView(true); } catch (e2) { /* ignore */ }
            }

            var headerOffset = getHeaderOffsetPx();
            if (headerOffset > 0) {
                try { window.scrollBy(0, -(headerOffset + 16)); } catch (e3) { /* ignore */ }
            }
        }

        // Run a few times to account for fixed header + any layout shifts.
        doScroll();
        window.setTimeout(doScroll, 250);
        window.setTimeout(doScroll, 750);

        flash(el);
    }

    function getHashId() {
        var raw = String(window.location.hash || '');
        if (!raw || raw === '#') return null;
        var id = raw.charAt(0) === '#' ? raw.slice(1) : raw;
        try { return decodeURIComponent(id); } catch (e) { return id; }
    }

    function setHash(id) {
        if (!id) return;
        try {
            history.pushState(null, '', '#' + encodeURIComponent(id));
        } catch (e) {
            try { window.location.hash = id; } catch (e2) { /* ignore */ }
        }
    }

    function buildMenu(anchors) {
        var wrapper = document.createElement('div');
        wrapper.className = 'section-jump';

        var label = document.createElement('label');
        label.className = 'visually-hidden';
        label.setAttribute('for', 'sectionJumpSelect');
        label.textContent = 'Hopp til seksjon';

        var select = document.createElement('select');
        select.id = 'sectionJumpSelect';
        select.className = 'section-jump-select';
        select.setAttribute('aria-label', 'Hopp til seksjon');

        var placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Hopp til…';
        select.appendChild(placeholder);

        anchors.forEach(function (el) {
            var opt = document.createElement('option');
            opt.value = el.id;
            opt.textContent = (el.textContent || '').trim() || el.id;
            select.appendChild(opt);
        });

        select.addEventListener('change', function () {
            var id = String(select.value || '');
            if (!id) return;
            setHash(id);
            var target = document.getElementById(id);
            scrollToAnchor(target);
        });

        wrapper.appendChild(label);
        wrapper.appendChild(select);

        return { wrapper: wrapper, select: select };
    }

    function optionExists(selectEl, value) {
        try {
            var opts = selectEl.options;
            for (var i = 0; i < opts.length; i++) {
                if (String(opts[i].value) === String(value)) return true;
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    function init() {
        var anchors = getAnchors();
        if (!anchors || anchors.length < 2) return;

        // Avoid duplicating if script is loaded twice.
        if (document.querySelector('.section-jump')) return;

        var menu = buildMenu(anchors);

        // Prefer placing next to the injected "Tilbake til kartet" link.
        try {
            var main = document.querySelector('main');
            var container = main ? (main.querySelector('.container') || main) : null;
            var backLinkP = container ? container.querySelector('p.back-link') : null;

            if (container && backLinkP) {
                var topRow = document.createElement('div');
                topRow.className = 'page-top-controls';
                container.insertBefore(topRow, backLinkP);
                topRow.appendChild(backLinkP);
                topRow.appendChild(menu.wrapper);
            } else if (container) {
                // Fallback: put it at the top of the content area.
                if (container.firstChild) container.insertBefore(menu.wrapper, container.firstChild);
                else container.appendChild(menu.wrapper);
            } else {
                document.body.appendChild(menu.wrapper);
            }
        } catch (ePlace) {
            document.body.appendChild(menu.wrapper);
        }

        function syncSelectToHash() {
            var id = getHashId();
            if (!id) {
                menu.select.value = '';
                return;
            }

            // Only set if it exists in the list; otherwise keep placeholder.
            menu.select.value = optionExists(menu.select, id) ? id : '';
        }

        // Initial syncs
        syncSelectToHash();

        window.addEventListener('hashchange', function () {
            syncSelectToHash();
        });

        // No header-following behavior; stays at the top of the page layout.
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
