// Set current year
(function () {
    function applyYear() {
        try {
            var year = String(new Date().getFullYear());
            var nodes = document.querySelectorAll('#year');
            if (!nodes || !nodes.length) return;
            nodes.forEach(function (el) {
                try { el.textContent = year; } catch (err) { /* ignore */ }
            });
        } catch (err) { /* ignore */ }
    }

    document.addEventListener('DOMContentLoaded', applyYear);
})();