(function () {
    function slugify(s) {
        return String(s || '')
            .trim()
            .toLowerCase()
            .replace(/[æÆ]/g, 'ae')
            .replace(/[øØ]/g, 'o')
            .replace(/[åÅ]/g, 'a')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+/, '')
            .replace(/-+$/, '');
    }

    function ensureBackLink() {
        try {
            var main = document.querySelector('main');
            if (!main) return;

            var container = main.querySelector('.container') || main;
            if (!container) return;

            if (container.querySelector('[data-back-to-map="true"]')) return;

            var params = new URLSearchParams(String(location.search || ''));
            var from = slugify(params.get('from'));
            var href = from ? ('../index.html#focus=' + encodeURIComponent(from)) : '../index.html';

            var p = document.createElement('p');
            p.className = 'back-link';

            var a = document.createElement('a');
            a.className = 'inline-link';
            a.href = href;
            a.textContent = '← Tilbake til kartet';
            a.setAttribute('data-back-to-map', 'true');

            p.appendChild(a);

            // Place link at the top of the content area.
            if (container.firstChild) container.insertBefore(p, container.firstChild);
            else container.appendChild(p);
        } catch (err) { /* ignore */ }
    }

    document.addEventListener('DOMContentLoaded', ensureBackLink);
})();
