(function () {
    function getHeader() {
        return document.querySelector('header');
    }

    function setHeaderOffsetVar(header) {
        try {
            var h = header ? header.offsetHeight : 0;
            document.documentElement.style.setProperty('--header-offset', h + 'px');
        } catch (err) { /* ignore */ }
    }

    function setupAutoHideHeader() {
        var header = getHeader();
        if (!header) return;

        setHeaderOffsetVar(header);

        var lastY = window.scrollY || 0;
        var ticking = false;
        var threshold = 6;

        function onScroll() {
            if (ticking) return;
            ticking = true;

            requestAnimationFrame(function () {
                ticking = false;

                var y = window.scrollY || 0;
                var headerH = header.offsetHeight || 0;

                // Always show at the very top.
                if (y <= 0) {
                    header.classList.remove('is-hidden');
                    lastY = y;
                    return;
                }

                var dy = y - lastY;

                // Ignore tiny scroll jitter.
                if (Math.abs(dy) < threshold) return;

                if (dy > 0 && y > headerH) {
                    // Scrolling down
                    header.classList.add('is-hidden');
                } else if (dy < 0) {
                    // Scrolling up
                    header.classList.remove('is-hidden');
                }

                lastY = y;
            });
        }

        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', function () { setHeaderOffsetVar(header); });

        // Re-measure after layout injection settles.
        setTimeout(function () { setHeaderOffsetVar(header); }, 0);
        setTimeout(function () { setHeaderOffsetVar(header); }, 250);
    }

    document.addEventListener('DOMContentLoaded', setupAutoHideHeader);
})();
