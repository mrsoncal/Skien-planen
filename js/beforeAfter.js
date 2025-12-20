// Simple before/after slider + zoom/pan + SVG overlay navigation
(function () {
    function qs(sel, root) { return (root || document).querySelector(sel); }

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    function normalizeText(s) {
        return String(s || '')
            .trim()
            .toLowerCase()
            .replace(/[æÆ]/g, 'ae')
            .replace(/[øØ]/g, 'o')
            .replace(/[åÅ]/g, 'a');
    }

    function slugify(s) {
        return normalizeText(s)
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+/, '')
            .replace(/-+$/, '');
    }

    function parseHashParams() {
        // Supports simple "#key=value&key2=value2" hashes.
        var raw = String(location.hash || '');
        if (!raw || raw === '#') return {};
        var s = raw.charAt(0) === '#' ? raw.slice(1) : raw;
        if (s.indexOf('=') === -1) return {};
        var out = {};
        s.split('&').forEach(function (pair) {
            var idx = pair.indexOf('=');
            if (idx <= 0) return;
            var k = pair.slice(0, idx);
            var v = pair.slice(idx + 1);
            try {
                out[decodeURIComponent(k)] = decodeURIComponent(v);
            } catch (err) {
                out[k] = v;
            }
        });
        return out;
    }

    document.addEventListener('DOMContentLoaded', function () {
        var view = qs('#baView');
        var beforeImg = qs('.ba-before-img');
        var afterStack = qs('#baAfterStack');
        var afterImg = qs('.ba-after-img');
        var overlay = qs('#baOverlay');

        var beforeLayer = qs('.ba-before-layer');
        var divider = qs('#baDivider');
        var handle = qs('#baHandle');
        var beforeContent = beforeLayer ? qs('.ba-content', beforeLayer) : null;
        var afterContent = afterStack ? qs('.ba-content', afterStack) : null;

        var tooltip = qs('#baTooltip');
        var searchForm = qs('#baSearchForm');
        var searchInput = qs('#baSearch');
        var searchList = qs('#baSearchList');

        if (!view || !beforeImg || !beforeLayer || !afterStack || !afterImg || !overlay || !divider || !handle) return;

        // ----------------------------
        // State
        // ----------------------------
        var current = 50; // slider percent
        var intrinsicW = null;
        var intrinsicH = null;

        var zoom = 1.0;
        var minZoom = 1.0;
        var maxZoom = 3.0;
        var zoomStep = 0.1;
        var panX = 0;
        var panY = 0;

        var dragging = false;
        var isPanning = false;
        var panStart = null;
        var panStartOffset = { x: 0, y: 0 };

        var overlayItems = [];
        var selectedOverlayEl = null;
        var pendingFocusSlug = null;
        var didApplyFocus = false;

        try {
            var hp = parseHashParams();
            if (hp && hp.focus) pendingFocusSlug = slugify(hp.focus);
        } catch (err) { /* ignore */ }

        // ----------------------------
        // Overlay links + hit areas
        // ----------------------------
        function clearSelectedOverlay() {
            try {
                if (selectedOverlayEl) selectedOverlayEl.classList.remove('is-selected');
            } catch (err) { /* ignore */ }
            selectedOverlayEl = null;
        }

        function setSelectedOverlay(el) {
            if (!el) return;
            try {
                if (selectedOverlayEl && selectedOverlayEl !== el) selectedOverlayEl.classList.remove('is-selected');
                selectedOverlayEl = el;
                selectedOverlayEl.classList.add('is-selected');
            } catch (err) { /* ignore */ }
        }

        function decorateHrefWithFrom(href, title) {
            try {
                if (!href) return href;
                var slug = slugify(title);
                var hashIdx = href.indexOf('#');
                if (hashIdx === -1) return href;
                var base = href.slice(0, hashIdx);
                var anchor = href.slice(hashIdx + 1);
                var sep = (base.indexOf('?') === -1) ? '?' : '&';
                return base + sep + 'from=' + encodeURIComponent(slug) + '#' + anchor;
            } catch (err) {
                return href;
            }
        }

        function setupOverlayLinks() {
            if (!overlay) return;

            var shapeSelector = 'path, polyline, line, polygon, rect, circle, ellipse';

            function isShapeElement(el) {
                try { return !!(el && el.matches && el.matches(shapeSelector)); } catch (err) { return false; }
            }

            function wrapSingleShapeObject(shapeEl) {
                if (!shapeEl || !shapeEl.parentNode) return shapeEl;
                if (!shapeEl.id) return shapeEl;
                if (String(shapeEl.tagName || '').toLowerCase() === 'g') return shapeEl;

                var ns = overlay.namespaceURI || 'http://www.w3.org/2000/svg';
                var g = document.createElementNS(ns, 'g');
                g.setAttribute('id', shapeEl.id);
                shapeEl.removeAttribute('id');
                shapeEl.parentNode.insertBefore(g, shapeEl);
                g.appendChild(shapeEl);
                return g;
            }

            function parseStyle(styleText) {
                var out = {};
                if (!styleText) return out;
                String(styleText).split(';').forEach(function (part) {
                    var idx = part.indexOf(':');
                    if (idx <= 0) return;
                    var key = part.slice(0, idx).trim().toLowerCase();
                    var val = part.slice(idx + 1).trim();
                    if (!key) return;
                    out[key] = val;
                });
                return out;
            }

            function getStrokeWidthPx(node) {
                try {
                    var sw = node.getAttribute('stroke-width');
                    if (sw) {
                        var n = parseFloat(sw);
                        if (!isNaN(n)) return n;
                    }
                    var style = parseStyle(node.getAttribute('style'));
                    if (style['stroke-width']) {
                        var n2 = parseFloat(style['stroke-width']);
                        if (!isNaN(n2)) return n2;
                    }
                } catch (err) { /* ignore */ }
                return null;
            }

            function hasFill(node) {
                try {
                    var fillAttr = node.getAttribute('fill');
                    if (fillAttr && fillAttr !== 'none') return true;
                    var style = parseStyle(node.getAttribute('style'));
                    if (style.fill && style.fill !== 'none') return true;
                } catch (err) { /* ignore */ }
                return false;
            }

            function addHitAreas(interactiveEl, opts) {
                opts = opts || {};
                var minStroke = typeof opts.minStroke === 'number' ? opts.minStroke : 10;
                var hitStroke = typeof opts.hitStroke === 'number' ? opts.hitStroke : 16;
                var multiplier = typeof opts.multiplier === 'number' ? opts.multiplier : 2.5;

                try {
                    var shapes = [];
                    try { interactiveEl.querySelectorAll(shapeSelector).forEach(function (n) { shapes.push(n); }); } catch (err) { /* ignore */ }

                    shapes.forEach(function (shape) {
                        if (hasFill(shape)) return;
                        var sw = getStrokeWidthPx(shape);
                        if (!sw || sw >= minStroke) return;

                        var clone = shape.cloneNode(false);
                        clone.setAttribute('data-ba-hit', 'true');
                        // Prevent copied inline styles from making the hit area visible
                        clone.removeAttribute('style');
                        clone.removeAttribute('class');
                        clone.setAttribute('fill', 'none');
                        clone.setAttribute('stroke', 'transparent');
                        clone.setAttribute('stroke-opacity', '0');
                        clone.setAttribute('fill-opacity', '0');
                        clone.setAttribute('stroke-width', String(Math.max(hitStroke, sw * multiplier)));
                        clone.setAttribute('stroke-linecap', 'round');
                        clone.setAttribute('stroke-linejoin', 'round');
                        clone.setAttribute('vector-effect', 'non-scaling-stroke');
                        clone.setAttribute('pointer-events', 'stroke');
                        clone.setAttribute('tabindex', '-1');
                        clone.setAttribute('aria-hidden', 'true');

                        shape.parentNode && shape.parentNode.insertBefore(clone, shape);
                    });
                } catch (err) { /* ignore */ }
            }

            function addHitPadding(interactiveEl, padding) {
                padding = typeof padding === 'number' ? padding : 6;
                try {
                    if (!interactiveEl || !interactiveEl.getBBox) return;
                    var bb = interactiveEl.getBBox();
                    if (!bb || !isFinite(bb.x) || !isFinite(bb.width) || bb.width <= 0 || bb.height <= 0) return;

                    var ns = overlay.namespaceURI || 'http://www.w3.org/2000/svg';
                    var hit = document.createElementNS(ns, 'rect');
                    hit.setAttribute('data-ba-hit', 'true');
                    hit.setAttribute('aria-hidden', 'true');
                    hit.setAttribute('tabindex', '-1');
                    hit.setAttribute('x', String(bb.x - padding));
                    hit.setAttribute('y', String(bb.y - padding));
                    hit.setAttribute('width', String(bb.width + padding * 2));
                    hit.setAttribute('height', String(bb.height + padding * 2));
                    hit.setAttribute('fill', 'transparent');
                    hit.setAttribute('fill-opacity', '0');
                    hit.setAttribute('stroke', 'none');
                    hit.setAttribute('pointer-events', 'all');

                    interactiveEl.insertBefore(hit, interactiveEl.firstChild);
                } catch (err) { /* ignore */ }
            }

            function shouldExpandHitAreaForTitle(title) {
                var t = normalizeText(title);
                if (t.indexOf('gagater i sentrum') !== -1) return true;
                if (t.indexOf('prinsessegata ombygging') !== -1) return true;
                if (t.indexOf('bussfelt') !== -1) return true;
                if (t.indexOf('p-hus') !== -1 || t.indexOf('p hus') !== -1) return true;
                return false;
            }

            function isPHusTitle(title) {
                var t = normalizeText(title);
                return (t.indexOf('p-hus') !== -1 || t.indexOf('p hus') !== -1);
            }

            // Map overlay <title> -> page anchor
            var titleToHref = {
                'falkum-bad': 'pages/moteplasser.html#falkum-bad',
                'falkum-ringvei': 'pages/infrastruktur.html#falkum-ringvei',
                'bakkestranda-p-hus': 'pages/infrastruktur.html#bakkestranda-p-hus',
                'ibsenhuset-p-hus': 'pages/infrastruktur.html#ibsenhuset-p-hus',
                'moflata-rundkjoringer-og-lyskryss': 'pages/infrastruktur.html#moflata-rundkjoringer-og-trafikklys',
                'blabaerlia-utvidet-vei': 'pages/infrastruktur.html#blaabaerlia',
                'boletunnelen': 'pages/infrastruktur.html#boletunnelen',
                'bruforbindelse-klosteroya-jernbanebrygga': 'pages/infrastruktur.html#bruforbindelse-klosteroeya-jernbanebrygga',
                'kongens-gate-bussvei': 'pages/kollektivtransport.html#kongens-gate-bussvei',
                'klostergata-bussfelt': 'pages/kollektivtransport.html#klostergata-bussfelt',
                'bolevegen-bussfelt': 'pages/kollektivtransport.html#bolevegen-bussfelt',
                'prinsessegata-ombygging': 'pages/infrastruktur.html#prinsessegata-ombygging',
                'gagater-i-sentrum': 'pages/infrastruktur.html#gagater-i-sentrum',
                'myren-snarvei': 'pages/infrastruktur.html#myren-snarvei',
                'rundkjoringa-sentrum': 'pages/moteplasser.html#rundkjoringa-sentrum',
                'radhusplassen': 'pages/moteplasser.html#radhusplassen',
                'skien-aktiemolle': 'pages/arkitektur.html#skien-aktiemolle',
                'alexander-kjellands-gate-ovregate-frognervegen-havundvegen-bolehogda-ringvei': 'pages/infrastruktur.html#alexander-kjellands-gate-ovregate-frognervegen-haavundvegen-bolehogda-ringvei',
                'skien-togstasjon-i-fjellveggen': 'pages/kollektivtransport.html#skien-togstasjon-i-fjellveggen'
            };

            function hrefForTitle(title) {
                var raw = titleToHref[slugify(title)] || null;
                return decorateHrefWithFrom(raw, title);
            }

            function markInteractive(el, title, href) {
                try {
                    el.dataset.baLink = 'true';
                    el.dataset.baTitle = title;
                    if (href) el.dataset.baHref = href;
                } catch (err) { /* ignore */ }

                try {
                    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
                    el.setAttribute('role', 'link');
                    el.setAttribute('aria-label', title);
                } catch (err) { /* ignore */ }
            }

            function findInteractiveTarget(node) {
                var cur = node;
                while (cur && cur !== overlay) {
                    if (cur.dataset && cur.dataset.baLink === 'true') return cur;
                    cur = cur.parentNode;
                }
                return null;
            }

            function activateTarget(node) {
                var el = findInteractiveTarget(node);
                if (!el) return false;
                var href = el.dataset && el.dataset.baHref;
                if (!href) return false;
                try { setSelectedOverlay(el); } catch (err) { /* ignore */ }
                window.location.href = href;
                return true;
            }

            // Tag objects with a <title>
            try {
                var nodes = overlay.querySelectorAll('[id^="object-"]');
                nodes.forEach(function (el) {
                    if (!el || !el.id || el.id === 'object-19') return;
                    if (isShapeElement(el)) el = wrapSingleShapeObject(el);

                    var titleEl = el.querySelector('title');
                    if (!titleEl) return;
                    var title = (titleEl.textContent || '').trim();
                    if (!title) return;

                    // Prevent the browser's default tooltip (SVG <title>) so our styled tooltip is the only one.
                    try { titleEl.parentNode && titleEl.parentNode.removeChild(titleEl); } catch (err) { /* ignore */ }

                    var href = hrefForTitle(title);
                    markInteractive(el, title, href);

                    try {
                        overlayItems.push({
                            el: el,
                            title: title,
                            slug: slugify(title),
                            href: href
                        });
                    } catch (err) { /* ignore */ }

                    if (shouldExpandHitAreaForTitle(title)) {
                        if (isPHusTitle(title)) addHitPadding(el, 6);
                        else addHitAreas(el, { minStroke: 10, hitStroke: 16, multiplier: 2.5 });
                    }
                });
            } catch (err) { /* ignore */ }

            overlay.addEventListener('click', function (e) {
                activateTarget(e.target);
            });

            overlay.addEventListener('keydown', function (e) {
                if (!(e.key === 'Enter' || e.key === ' ')) return;
                if (activateTarget(e.target)) e.preventDefault();
            });

            // Used by pointer handler to avoid starting pan/drag when clicking an interactive SVG target
            overlay.__baFindInteractiveTarget = findInteractiveTarget;
        }

        setupOverlayLinks();

        // ----------------------------
        // Tooltip
        // ----------------------------
        function hideTooltip() {
            if (!tooltip) return;
            try {
                tooltip.classList.remove('is-visible');
                tooltip.setAttribute('aria-hidden', 'true');
            } catch (err) { /* ignore */ }
        }

        function showTooltip(text, clientX, clientY) {
            if (!tooltip || !text) return;
            try {
                tooltip.textContent = text;
                tooltip.setAttribute('aria-hidden', 'false');
            } catch (err) { /* ignore */ }

            try {
                var vr = view.getBoundingClientRect();
                var x = Math.round(clientX - vr.left) + 12;
                var y = Math.round(clientY - vr.top) + 12;

                tooltip.style.left = x + 'px';
                tooltip.style.top = y + 'px';
                tooltip.classList.add('is-visible');

                // Clamp after layout so we can read offsetWidth/Height.
                requestAnimationFrame(function () {
                    try {
                        var maxX = Math.max(0, Math.floor(vr.width - tooltip.offsetWidth - 8));
                        var maxY = Math.max(0, Math.floor(vr.height - tooltip.offsetHeight - 8));
                        var cx = clamp(x, 8, maxX);
                        var cy = clamp(y, 8, maxY);
                        tooltip.style.left = cx + 'px';
                        tooltip.style.top = cy + 'px';
                    } catch (err) { /* ignore */ }
                });
            } catch (err) { /* ignore */ }
        }

        function attachTooltipHandlers() {
            if (!overlay || !tooltip) return;

            overlay.addEventListener('pointermove', function (e) {
                try {
                    if (dragging || isPanning || zoomInteracting) return;
                    var el = overlay.__baFindInteractiveTarget && overlay.__baFindInteractiveTarget(e.target);
                    if (!el) return hideTooltip();
                    showTooltip(el.dataset.baTitle || '', e.clientX, e.clientY);
                } catch (err) { /* ignore */ }
            });

            overlay.addEventListener('pointerleave', function () {
                hideTooltip();
            });

            overlay.addEventListener('focusin', function (e) {
                try {
                    var el = overlay.__baFindInteractiveTarget && overlay.__baFindInteractiveTarget(e.target);
                    if (!el) return;
                    var r = el.getBoundingClientRect();
                    showTooltip(el.dataset.baTitle || '', r.left + r.width / 2, r.top + r.height / 2);
                } catch (err) { /* ignore */ }
            });

            overlay.addEventListener('focusout', function () {
                hideTooltip();
            });
        }

        attachTooltipHandlers();

        // ----------------------------
        // Search
        // ----------------------------
        function centerOnOverlayElement(el) {
            if (!el) return;
            try {
                // At 100% zoom, pan is clamped to 0, so we can't meaningfully "jump".
                // Auto-zoom slightly to enable panning.
                if (zoom <= 1.001) {
                    setZoom(1.5);
                    requestAnimationFrame(function () { centerOnOverlayElement(el); });
                    return;
                }

                var vr = view.getBoundingClientRect();
                var er = el.getBoundingClientRect();
                if (!vr.width || !vr.height || !er.width || !er.height) return;

                var viewCenterX = vr.left + vr.width / 2;
                var viewCenterY = vr.top + vr.height / 2;
                var elCenterX = er.left + er.width / 2;
                var elCenterY = er.top + er.height / 2;
                var dx = Math.round(elCenterX - viewCenterX);
                var dy = Math.round(elCenterY - viewCenterY);
                panX = panX + dx;
                panY = panY + dy;
                applyTransform();
            } catch (err) { /* ignore */ }
        }

        function findOverlayItemByQuery(q) {
            var s = slugify(q);
            if (!s) return null;
            for (var i = 0; i < overlayItems.length; i++) {
                if (overlayItems[i].slug === s) return overlayItems[i];
            }
            // fallback: substring match
            for (var j = 0; j < overlayItems.length; j++) {
                if (overlayItems[j].slug.indexOf(s) !== -1) return overlayItems[j];
            }
            return null;
        }

        function populateSearchList() {
            if (!searchList || !overlayItems || !overlayItems.length) return;
            try {
                searchList.innerHTML = '';
                var sorted = overlayItems.slice().sort(function (a, b) {
                    return normalizeText(a.title).localeCompare(normalizeText(b.title));
                });
                sorted.forEach(function (item) {
                    var opt = document.createElement('option');
                    opt.value = item.title;
                    searchList.appendChild(opt);
                });
            } catch (err) { /* ignore */ }
        }

        function setupSearch() {
            if (!searchForm || !searchInput) return;
            populateSearchList();

            searchForm.addEventListener('submit', function (e) {
                try { e.preventDefault(); } catch (err) { /* ignore */ }
                var q = (searchInput.value || '').trim();
                if (!q) return;
                var item = findOverlayItemByQuery(q);
                if (!item || !item.el) return;
                setSelectedOverlay(item.el);
                centerOnOverlayElement(item.el);

                try {
                    var r = item.el.getBoundingClientRect();
                    showTooltip(item.title, r.left + r.width / 2, r.top + r.height / 2);
                } catch (err) { /* ignore */ }
            });
        }

        setupSearch();

        // ----------------------------
        // Slider
        // ----------------------------
        function setValue(v) {
            v = clamp(Number(v) || 0, 0, 100);
            var rightInset = (100 - v) + '%';
            afterStack.style.clipPath = 'inset(0 ' + rightInset + ' 0 0)';
            afterStack.style.webkitClipPath = 'inset(0 ' + rightInset + ' 0 0)';
            divider.style.left = v + '%';
            handle.setAttribute('aria-valuenow', String(v));
            current = v;
        }

        setValue(current);

        // ----------------------------
        // Zoom + pan
        // ----------------------------
        var zoomRange = qs('#baZoomRange');
        var zoomValueEl = qs('#baZoomValue');
        var zoomInteracting = false;

        function updateZoomRangeFill() {
            if (!zoomRange) return;
            var min = Number(zoomRange.min) || 50;
            var max = Number(zoomRange.max) || 300;
            var val = Number(zoomRange.value) || 100;
            var pct = Math.round(((val - min) / (max - min)) * 100);
            zoomRange.style.background = 'linear-gradient(90deg, var(--accent) ' + pct + '%, #eee ' + pct + '%)';
        }

        function applyTransform() {
            var viewWidth = view.clientWidth || parseInt(view.style.width, 10) || 0;
            var viewHeight = view.clientHeight || parseInt(view.style.height, 10) || 0;
            var maxPanX = Math.max(0, Math.round((viewWidth * zoom) - viewWidth));
            var maxPanY = Math.max(0, Math.round((viewHeight * zoom) - viewHeight));
            panX = clamp(panX, 0, maxPanX);
            panY = clamp(panY, 0, maxPanY);

            var t = 'translate(' + (-panX) + 'px,' + (-panY) + 'px) scale(' + zoom + ')';

            if (beforeContent) {
                beforeContent.style.transformOrigin = '0 0';
                beforeContent.style.transform = t;
            } else {
                beforeLayer.style.transformOrigin = '0 0';
                beforeLayer.style.transform = t;
            }

            if (afterContent) {
                afterContent.style.transformOrigin = '0 0';
                afterContent.style.transform = t;
            } else {
                afterStack.style.transformOrigin = '0 0';
                afterStack.style.transform = t;
            }

            if (zoomValueEl) zoomValueEl.textContent = Math.round(zoom * 100) + '%';
            if (zoomRange) zoomRange.value = String(Math.round(zoom * 100));

            if (zoom > 1) view.classList.add('ba-pannable');
            else view.classList.remove('ba-pannable');

            updateZoomRangeFill();
        }

        function setZoom(newZ, focal) {
            if (!newZ) return;
            var oldZ = zoom;
            newZ = clamp(newZ, minZoom, maxZoom);

            try {
                if (!focal || typeof focal.x !== 'number') {
                    var rect = view.getBoundingClientRect();
                    focal = { x: Math.round(rect.width / 2), y: Math.round(rect.height / 2) };
                }
                var fx = focal.x + panX;
                var fy = focal.y + panY;
                var scale = newZ / oldZ;
                panX = Math.round(fx * scale - focal.x);
                panY = Math.round(fy * scale - focal.y);
            } catch (err) {
                panX = Math.round(panX * (newZ / oldZ));
                panY = Math.round(panY * (newZ / oldZ));
            }

            zoom = newZ;
            applyTransform();
        }

        function setZoomInteracting(v) {
            zoomInteracting = !!v;
            if (zoomInteracting) {
                view.classList.add('ba-zoom-interacting');
                handle.setAttribute('disabled', 'true');
            } else {
                view.classList.remove('ba-zoom-interacting');
                handle.removeAttribute('disabled');
            }
        }

        if (zoomRange) {
            zoomRange.addEventListener('input', function (e) {
                setZoom(Number(e.target.value) / 100);
            });

            zoomRange.addEventListener('pointerdown', function () { setZoomInteracting(true); });
            zoomRange.addEventListener('pointerup', function () { setZoomInteracting(false); });
            zoomRange.addEventListener('pointercancel', function () { setZoomInteracting(false); });
            zoomRange.addEventListener('blur', function () { setZoomInteracting(false); });
            zoomRange.addEventListener('focus', function () { setZoomInteracting(true); });

            document.addEventListener('pointerup', function () { setZoomInteracting(false); });
        }

        view.addEventListener('wheel', function (e) {
            if (!(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            var delta = (e.deltaY > 0) ? -zoomStep : zoomStep;
            var rect = view.getBoundingClientRect();
            var focal = { x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) };
            setZoom(clamp(zoom + delta, minZoom, maxZoom), focal);
        }, { passive: false });

        // ----------------------------
        // Pointer interactions (divider drag + pan)
        // ----------------------------
        view.addEventListener('pointerdown', function (e) {
            if (zoomInteracting) return;

            hideTooltip();

            // If this is a click on an interactive overlay element, let it behave like a link.
            try {
                if (overlay && overlay.__baFindInteractiveTarget && overlay.__baFindInteractiveTarget(e.target)) return;
            } catch (err) { /* ignore */ }

            try { e.preventDefault(); } catch (err) { /* ignore */ }

            var rect = view.getBoundingClientRect();
            var clickX = Math.round(e.clientX - rect.left);
            var clickPercent = (clickX / rect.width) * 100;
            var dividerPercent = parseFloat(divider.style.left) || current;
            var dividerLeftPx = Math.round((dividerPercent / 100) * rect.width);
            var tol = 20;

            if (Math.abs(clickX - dividerLeftPx) <= tol) {
                dragging = true;
                try { view.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
                setValue(clickPercent);
                return;
            }

            if (zoom > 1) {
                isPanning = true;
                panStart = { x: e.clientX, y: e.clientY };
                panStartOffset = { x: panX, y: panY };
                try { view.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
                view.classList.add('ba-panning');
            }
        });

        document.addEventListener('pointermove', function (e) {
            if (dragging) {
                var rect = view.getBoundingClientRect();
                setValue(((e.clientX - rect.left) / rect.width) * 100);
                return;
            }
            if (isPanning) {
                var dx = Math.round(e.clientX - panStart.x);
                var dy = Math.round(e.clientY - panStart.y);
                panX = panStartOffset.x - dx;
                panY = panStartOffset.y - dy;
                applyTransform();
            }
        });

        function stopPointerActions(e) {
            dragging = false;
            if (isPanning) {
                isPanning = false;
                view.classList.remove('ba-panning');
            }
            hideTooltip();
            try { view.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            try { handle.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        }

        document.addEventListener('pointerup', stopPointerActions);
        document.addEventListener('pointercancel', function () {
            dragging = false;
            isPanning = false;
            view.classList.remove('ba-panning');
            hideTooltip();
        });

        // Prevent native drag / selection inside the view
        document.addEventListener('dragstart', function (e) {
            try {
                if (e.target && (e.target.matches && (e.target.matches('.ba-image') || e.target.matches('#baOverlay') || e.target.closest('.ba-view')))) {
                    e.preventDefault();
                }
            } catch (err) { /* ignore */ }
        });

        try { view.addEventListener('selectstart', function (e) { e.preventDefault(); }); } catch (err) { /* ignore */ }

        // Handle pointerdown: explicit slider dragging
        handle.addEventListener('pointerdown', function (e) {
            if (zoomInteracting) return;
            try { e.preventDefault(); } catch (err) { /* ignore */ }
            try {
                var rect = view.getBoundingClientRect();
                var clickPercent = ((e.clientX - rect.left) / rect.width) * 100;
                setValue(clickPercent);
            } catch (err) { /* ignore */ }
            dragging = true;
            try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            e.stopPropagation();
        });

        // Keyboard control on the handle for accessibility
        handle.addEventListener('keydown', function (e) {
            if (zoomInteracting) return;
            var step = (e.shiftKey ? 10 : 1);
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { setValue(current - step); e.preventDefault(); }
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { setValue(current + step); e.preventDefault(); }
            if (e.key === 'Home') { setValue(0); e.preventDefault(); }
            if (e.key === 'End') { setValue(100); e.preventDefault(); }
        });

        // ----------------------------
        // Layout + overlay sizing
        // ----------------------------
        function alignDividerToImage() {
            try {
                beforeLayer.style.top = '0px';
                beforeLayer.style.height = '100%';
                afterStack.style.top = '0px';
                afterStack.style.height = '100%';
                divider.style.top = '0px';
                divider.style.bottom = '0px';
            } catch (err) { /* ignore */ }
        }

        function getPreferredBeforeSize() {
            return new Promise(function (resolve) {
                try {
                    var picture = document.querySelector('.ba-before-layer');
                    if (picture) {
                        var source = picture.querySelector('source[type="image/png"]');
                        var src = source && source.getAttribute('srcset');
                        if (src) {
                            var temp = new Image();
                            temp.src = src;
                            if (temp.complete) return resolve({ w: temp.naturalWidth, h: temp.naturalHeight });
                            temp.addEventListener('load', function () { resolve({ w: temp.naturalWidth, h: temp.naturalHeight }); });
                            temp.addEventListener('error', function () { resolve(null); });
                            return;
                        }
                    }
                } catch (err) { /* ignore */ }

                resolve({
                    w: beforeImg.naturalWidth || beforeImg.width,
                    h: beforeImg.naturalHeight || beforeImg.height
                });
            });
        }

        function setAspect() {
            return getPreferredBeforeSize().then(function (dims) {
                if (!dims || !dims.w || !dims.h) return;
                intrinsicW = dims.w;
                intrinsicH = dims.h;

                overlay.setAttribute('width', '100%');
                overlay.setAttribute('height', '100%');

                var existingViewBox = overlay.getAttribute('viewBox');
                if (!existingViewBox || !String(existingViewBox).trim()) {
                    overlay.setAttribute('viewBox', '0 0 ' + intrinsicW + ' ' + intrinsicH);
                    overlay.setAttribute('preserveAspectRatio', 'xMinYMin meet');
                }

                try {
                    var existing = overlay.querySelectorAll('[data-ba-test]');
                    existing.forEach(function (n) { n.parentNode && n.parentNode.removeChild(n); });
                } catch (err) { /* ignore */ }
            });
        }

        function measureLegendIntrinsicWidth(legendEl) {
            if (!legendEl) return 120;
            try {
                var clone = legendEl.cloneNode(true);
                clone.style.position = 'absolute';
                clone.style.left = '-9999px';
                clone.style.top = '0';
                clone.style.width = 'auto';
                clone.style.whiteSpace = 'nowrap';
                clone.style.display = 'inline-block';
                document.body.appendChild(clone);
                var w = Math.ceil(clone.offsetWidth || clone.clientWidth || 120);
                document.body.removeChild(clone);
                return w;
            } catch (err) {
                return Math.ceil(legendEl.clientWidth || 120);
            }
        }

        function setViewHeightFromIntrinsic() {
            var viewWidthPx = parseInt(view.style.width, 10) || view.clientWidth;
            var iw = intrinsicW || beforeImg.naturalWidth || parseInt(beforeImg.getAttribute('width')) || 0;
            var ih = intrinsicH || beforeImg.naturalHeight || parseInt(beforeImg.getAttribute('height')) || 0;
            if (iw && ih && viewWidthPx) {
                view.style.height = Math.round((viewWidthPx * ih) / iw) + 'px';
                return;
            }
            var fallbackH = Math.round(beforeImg.getBoundingClientRect().height) || view.clientHeight || Math.round(window.innerHeight * 0.5);
            view.style.height = fallbackH + 'px';
        }

        function updateLayout() {
            var w = beforeImg.naturalWidth || beforeImg.width;
            var h = beforeImg.naturalHeight || beforeImg.height;
            if (!w || !h) return;

            var header = document.querySelector('header');
            var footer = document.querySelector('footer');
            var reserved = 20;
            var availableHeight = window.innerHeight
                - (header ? header.offsetHeight : 0)
                - (footer ? footer.offsetHeight : 0)
                - reserved;

            // Full-width map layout (legend is stacked below in CSS).
            var container = view.parentElement;
            var containerWidth = (container ? container.clientWidth : window.innerWidth);
            view.style.width = '100%';

            var iw = intrinsicW || beforeImg.naturalWidth || w;
            var ih = intrinsicH || beforeImg.naturalHeight || h;
            var desiredHeight = (containerWidth && iw && ih)
                ? Math.round((containerWidth * ih) / iw)
                : Math.round(beforeImg.getBoundingClientRect().height) || Math.round(window.innerHeight * 0.5);

            // Desktop: prefer true aspect ratio (allow page to scroll).
            // Mobile: cap to available viewport height to avoid an overly tall viewport.
            var shouldCapHeight = (window.innerWidth || 0) <= 700;
            var finalHeight = desiredHeight;
            if (shouldCapHeight) finalHeight = Math.min(Math.round(availableHeight), desiredHeight);
            view.style.height = Math.max(200, finalHeight) + 'px';

            alignDividerToImage();
        }

        // Debounced layout updater
        var scheduled = null;
        function scheduleLayout() {
            if (scheduled) return;
            scheduled = requestAnimationFrame(function () {
                scheduled = null;
                setAspect().then(function () {
                    updateLayout();
                    alignDividerToImage();
                    applyTransform();
                });
            });
        }

        window.addEventListener('resize', scheduleLayout);

        var container = view.parentElement;
        if (window.ResizeObserver && container) {
            var ro = new ResizeObserver(function () { scheduleLayout(); });
            ro.observe(container);
        }

        // Watch devicePixelRatio changes (some browsers don't fire resize during zoom)
        var lastDPR = window.devicePixelRatio;
        setInterval(function () {
            if (window.devicePixelRatio !== lastDPR) {
                lastDPR = window.devicePixelRatio;
                scheduleLayout();
            }
        }, 250);

        beforeImg.addEventListener('load', scheduleLayout);
        afterImg.addEventListener('load', scheduleLayout);

        // Initial render
        setZoom(1);
        updateZoomRangeFill();

        function applyInitialFocusIfNeeded() {
            if (didApplyFocus) return;
            if (!pendingFocusSlug) return;
            var item = findOverlayItemByQuery(pendingFocusSlug);
            if (!item || !item.el) return;
            didApplyFocus = true;
            setSelectedOverlay(item.el);
            centerOnOverlayElement(item.el);
        }

        // Apply focus once layout is stable.
        scheduleLayout = function () {
            if (scheduled) return;
            scheduled = requestAnimationFrame(function () {
                scheduled = null;
                setAspect().then(function () {
                    updateLayout();
                    alignDividerToImage();
                    applyTransform();
                    applyInitialFocusIfNeeded();
                });
            });
        };

        scheduleLayout();
    });
})();
