// Simple before/after slider
(function () {
    function qs(sel) { return document.querySelector(sel); }

    document.addEventListener('DOMContentLoaded', function () {
        var view = qs('#baView');
        var beforeImg = qs('.ba-before-img');
        var afterStack = qs('#baAfterStack');
        var afterImg = qs('.ba-after-img');
        var overlay = qs('#baOverlay');

        var beforeLayer = qs('.ba-before-layer');
        var divider = qs('#baDivider');
        var handle = qs('#baHandle');
        var beforeContent = beforeLayer ? beforeLayer.querySelector('.ba-content') : null;
        var afterContent = afterStack ? afterStack.querySelector('.ba-content') : null;

        if (!view || !beforeImg || !beforeLayer || !afterStack || !afterImg || !overlay || !divider || !handle) return;

        var current = 50; // percent
        var intrinsicW = null, intrinsicH = null;
        // zoom/pan state (zoom as percent/scale)
        var zoom = 1.0; // scale factor
        var minZoom = 0.5, maxZoom = 3.0, zoomStep = 0.1;
        var panX = 0, panY = 0; // pixel offsets (positive values move viewport right/down)
        var isPanning = false; var panStart = null; var panStartOffset = { x: 0, y: 0 };

        // Prefer using the actual PNG dimensions (if provided via <picture>) so aspect is correct.
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
                // fallback to the rendered img intrinsic size
                resolve({ w: beforeImg.naturalWidth || beforeImg.width, h: beforeImg.naturalHeight || beforeImg.height });
            });
        }

        // set preferred intrinsic size (PNG) so aspect is correct and overlay can match
        function setAspect() {
            return getPreferredBeforeSize().then(function (dims) {
                if (!dims || !dims.w || !dims.h) { alignDividerToImage(); return; }
                intrinsicW = dims.w;
                intrinsicH = dims.h;
                // set overlay viewBox so coordinates inside the SVG match the image pixel space
                overlay.setAttribute('viewBox', '0 0 ' + intrinsicW + ' ' + intrinsicH);
                overlay.setAttribute('width', '100%');
                overlay.setAttribute('height', '100%');
                // use meet so the overlay preserves the image aspect and aligns with the
                // top-left anchored image (object-position: left top)
                overlay.setAttribute('preserveAspectRatio', 'xMinYMin meet');
            });
        }
        setAspect().then(function () { updateLayout(); alignDividerToImage(); });
        beforeImg.addEventListener('load', function () { setAspect().then(function () { updateLayout(); alignDividerToImage(); }); });

        function setValue(v) {
            v = Math.max(0, Math.min(100, Number(v)));
            // clip the after stack (image + overlay) so they stay aligned
            var rightInset = (100 - v) + '%';
            afterStack.style.clipPath = 'inset(0 ' + rightInset + ' 0 0)';
            afterStack.style.webkitClipPath = 'inset(0 ' + rightInset + ' 0 0)';
            // position divider and update handle aria
            divider.style.left = v + '%';
            handle.setAttribute('aria-valuenow', String(v));
            current = v;
        }

        // initialize
        setValue(current);

        // Zoom UI / helpers
        var zoomInBtn = qs('#baZoomIn');
        var zoomOutBtn = qs('#baZoomOut');
        var zoomResetBtn = qs('#baZoomReset');
        var zoomRange = qs('#baZoomRange');
        var zoomValueEl = qs('#baZoomValue');

        function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

        function applyTransform() {
            // apply translate then scale using top-left origin (0 0)
            var viewWidth = view.clientWidth || parseInt(view.style.width, 10) || 0;
            var viewHeight = view.clientHeight || parseInt(view.style.height, 10) || 0;
            // clamp pan to valid ranges so we don't show empty space
            var maxPanX = Math.max(0, Math.round((viewWidth * zoom) - viewWidth));
            var maxPanY = Math.max(0, Math.round((viewHeight * zoom) - viewHeight));
            panX = clamp(panX, 0, maxPanX);
            panY = clamp(panY, 0, maxPanY);
            var t = 'translate(' + (-panX) + 'px,' + (-panY) + 'px) scale(' + zoom + ')';
            // apply transforms to the inner content wrappers so outer layers remain
            // untransformed; this ensures clip-path (on the outer layer) aligns with
            // divider positions in view coordinates even when zoom/pan are applied.
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
            // update display
            if (zoomValueEl) zoomValueEl.textContent = Math.round(zoom * 100) + '%';
            if (zoomRange) zoomRange.value = String(Math.round(zoom * 100));
            // show a panning cursor when zoomed
            if (zoom > 1) view.classList.add('ba-pannable'); else view.classList.remove('ba-pannable');
            // update the zoom range fill to reflect current value
            updateZoomRangeFill();
        }

        function updateZoomRangeFill() {
            if (!zoomRange) return;
            var min = Number(zoomRange.min) || 50;
            var max = Number(zoomRange.max) || 300;
            var val = Number(zoomRange.value) || 100;
            var pct = Math.round((val - min) / (max - min) * 100);
            // use CSS gradient so filled portion matches accent color
            zoomRange.style.background = 'linear-gradient(90deg, var(--accent) ' + pct + '%, #eee ' + pct + '%)';
        }

        function setZoom(newZ, focal) {
            if (!newZ) return;
            var oldZ = zoom;
            newZ = clamp(newZ, minZoom, maxZoom);
            // scale pan so the focal point stays approximately under the same point.
            // If no focal is provided (e.g. slider changes), default to the view center
            // so zoom/scale appears to be centered rather than anchored to top-left.
            try {
                if (!focal || typeof focal.x !== 'number') {
                    var rect = view.getBoundingClientRect();
                    focal = { x: Math.round(rect.width / 2), y: Math.round(rect.height / 2) };
                }
                // compute focal in content coords and adjust pan to keep focal stable
                var fx = focal.x + panX;
                var fy = focal.y + panY;
                var scale = newZ / oldZ;
                panX = Math.round(fx * scale - focal.x);
                panY = Math.round(fy * scale - focal.y);
            } catch (err) {
                // fallback proportional scaling if view metrics are unavailable
                panX = Math.round(panX * (newZ / oldZ));
                panY = Math.round(panY * (newZ / oldZ));
            }
            zoom = newZ;
            applyTransform();
        }

        // UI bindings
        if (zoomInBtn) zoomInBtn.addEventListener('click', function () { setZoom(clamp(zoom + zoomStep, minZoom, maxZoom), { x: view.clientWidth/2, y: view.clientHeight/2 }); });
        if (zoomOutBtn) zoomOutBtn.addEventListener('click', function () { setZoom(clamp(zoom - zoomStep, minZoom, maxZoom), { x: view.clientWidth/2, y: view.clientHeight/2 }); });
        if (zoomResetBtn) zoomResetBtn.addEventListener('click', function () { panX = 0; panY = 0; setZoom(1); });
        if (zoomRange) zoomRange.addEventListener('input', function (e) { setZoom(Number(e.target.value) / 100); });
        if (zoomRange) zoomRange.addEventListener('input', function (e) { updateZoomRangeFill(); });

        // Track whether the zoom range is being interacted with so we can disable
        // divider/slider interactions while adjusting zoom.
        var zoomInteracting = false;
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
            zoomRange.addEventListener('pointerdown', function () { setZoomInteracting(true); });
            zoomRange.addEventListener('pointerup', function () { setZoomInteracting(false); });
            zoomRange.addEventListener('pointercancel', function () { setZoomInteracting(false); });
            zoomRange.addEventListener('blur', function () { setZoomInteracting(false); });
            zoomRange.addEventListener('focus', function () { setZoomInteracting(true); });
            // ensure mouseup anywhere clears state
            document.addEventListener('pointerup', function () { setZoomInteracting(false); });
        }

        // wheel to zoom when ctrl/meta is pressed
        view.addEventListener('wheel', function (e) {
            if (!(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            var delta = (e.deltaY > 0) ? -zoomStep : zoomStep;
            // focal point is mouse position relative to view
            var rect = view.getBoundingClientRect();
            var focal = { x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) };
            setZoom(clamp(zoom + delta, minZoom, maxZoom), focal);
        }, { passive: false });

        // Unified pointer handling: start either slider drag (when clicking near divider/handle)
        // or panning (when zoomed in and clicking elsewhere). Also respect zoomInteracting flag.
        var dragging = false;
        view.addEventListener('pointerdown', function (e) {
            if (zoomInteracting) return;
            var rect = view.getBoundingClientRect();
            var clickX = Math.round(e.clientX - rect.left);
            var clickY = Math.round(e.clientY - rect.top);
            var clickPercent = (clickX / rect.width) * 100;
            var dividerPercent = parseFloat(divider.style.left) || current;
            var dividerLeftPx = Math.round((dividerPercent / 100) * rect.width);
            var tol = 20; // px tolerance from divider where clicks will move the divider

            if (e.target === handle) {
                // explicit handle drag -> slider
                dragging = true;
                handle.setPointerCapture(e.pointerId);
                e.stopPropagation();
                setValue(clickPercent);
                return;
            }

            if (Math.abs(clickX - dividerLeftPx) <= tol) {
                // click is near the divider -> teleport and begin slider drag
                dragging = true;
                view.setPointerCapture(e.pointerId);
                setValue(clickPercent);
                return;
            }

            // else start panning when zoomed in
            if (zoom > 1) {
                isPanning = true;
                panStart = { x: e.clientX, y: e.clientY };
                panStartOffset = { x: panX, y: panY };
                view.setPointerCapture(e.pointerId);
                view.classList.add('ba-panning');
            }
        });

        // pointermove handled at document level for both slider dragging and panning
        document.addEventListener('pointermove', function (e) {
            if (dragging) {
                var rect = view.getBoundingClientRect();
                setValue((e.clientX - rect.left) / rect.width * 100);
                return;
            }
            if (isPanning) {
                var dx = Math.round(e.clientX - panStart.x);
                var dy = Math.round(e.clientY - panStart.y);
                panX = panStartOffset.x - dx; // invert so dragging moves viewport
                panY = panStartOffset.y - dy;
                applyTransform();
            }
        });

        function stopDragging(e) {
            dragging = false;
            if (isPanning) {
                isPanning = false;
                view.classList.remove('ba-panning');
            }
            try { view.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            try { handle.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        }

        document.addEventListener('pointerup', stopDragging);
        document.addEventListener('pointercancel', function () { dragging = false; isPanning = false; view.classList.remove('ba-panning'); });

        // initialize transform
        setZoom(1);
        // initialize slider fill visual
        updateZoomRangeFill();

        // calculate and constrain the view width so its height fits within the viewport
        function updateLayout() {
            var w = beforeImg.naturalWidth || beforeImg.width;
            var h = beforeImg.naturalHeight || beforeImg.height;
            if (!w || !h) return;

            // estimate available max height (exclude header/footer and use small padding)
            var header = document.querySelector('header');
            var footer = document.querySelector('footer');
            var reserved = 20; // small extra spacing
            var availableHeight = window.innerHeight - (header ? header.offsetHeight : 0) - (footer ? footer.offsetHeight : 0) - reserved;
            // don't upscale images beyond their natural height
            var targetHeight = Math.min(availableHeight, h);

            // width required to achieve the target height at the image aspect
            var widthForMaxHeight = (targetHeight * w) / h;

            // measure legend intrinsic width (no wrapping) so decisions are stable across zoom
            var container = view.parentElement;
            var gap = 16; // px gap between image and legend (matches CSS)
            var legendEl = container ? container.querySelector('.ba-explain') : null;
            var legendIntrinsic = 120;
            if (legendEl) {
                // measure intrinsic non-wrapping width by cloning
                try {
                    var clone = legendEl.cloneNode(true);
                    clone.style.position = 'absolute';
                    clone.style.left = '-9999px';
                    clone.style.top = '0';
                    clone.style.width = 'auto';
                    clone.style.whiteSpace = 'nowrap';
                    clone.style.display = 'inline-block';
                    document.body.appendChild(clone);
                    legendIntrinsic = Math.ceil(clone.offsetWidth || clone.clientWidth || legendIntrinsic);
                    document.body.removeChild(clone);
                } catch (err) {
                    legendIntrinsic = Math.ceil(legendEl.clientWidth || 120);
                }
            }
            var maxWidthAllowed = (container ? container.clientWidth : window.innerWidth) - legendIntrinsic - gap;
            if (maxWidthAllowed < 200) maxWidthAllowed = (container ? container.clientWidth : window.innerWidth);

            var requiredTotal = widthForMaxHeight + legendIntrinsic + gap;
            var containerWidth = (container ? container.clientWidth : window.innerWidth);

            // Strategy: pick a candidate image width, apply it, then measure the legend width and
            // decide whether side-by-side fits; if not, try reducing the image width; otherwise stack.
            var candidateWidth = Math.min(widthForMaxHeight, maxWidthAllowed);
            if (containerWidth < 600) candidateWidth = Math.min(candidateWidth, containerWidth);
            candidateWidth = Math.max(200, Math.floor(candidateWidth));

            // Apply candidate and measure legend after layout (use clientWidth so wrapping is accounted for)
            view.style.width = candidateWidth + 'px';
            var legendWidthAfter = Math.ceil(legendEl ? (legendEl.clientWidth || legendEl.scrollWidth) : 0) || legendIntrinsic;

            // layout debug logging removed

            if (candidateWidth + gap + legendWidthAfter <= containerWidth) {
                // fits side-by-side
                container.classList.remove('ba-stack');
                // adjust if legend grew and leaves less room
                var maxAllowedNow = containerWidth - legendWidthAfter - gap;
                if (candidateWidth > maxAllowedNow) view.style.width = Math.max(200, Math.floor(maxAllowedNow)) + 'px';
            } else {
                // try reducing image width to make room
                var reduced = Math.max(200, Math.floor(containerWidth - legendWidthAfter - gap));
                if (reduced > 200 && reduced >= Math.floor(widthForMaxHeight * 0.5)) {
                    // allow reduction but not below half desired width
                    container.classList.remove('ba-stack');
                    view.style.width = reduced + 'px';
                } else {
                    // stack vertically
                    container.classList.add('ba-stack');
                    view.style.width = Math.max(200, Math.floor(Math.min(widthForMaxHeight, containerWidth))) + 'px';
                }
            }

            // set explicit pixel height based on intrinsic ratio so there's no extra padding area
            var viewWidthPx = parseInt(view.style.width, 10) || view.clientWidth;
            // prefer intrinsic size, but fall back to rendered image size if needed; always set explicit pixel height
            var iw = intrinsicW || beforeImg.naturalWidth || parseInt(beforeImg.getAttribute('width')) || 0;
            var ih = intrinsicH || beforeImg.naturalHeight || parseInt(beforeImg.getAttribute('height')) || 0;
            if (iw && ih && viewWidthPx) {
                var computedH = Math.round((viewWidthPx * ih) / iw);
                view.style.height = computedH + 'px';
            } else {
                // fallback to the currently rendered image height (if already laid out)
                var fallbackH = Math.round(beforeImg.getBoundingClientRect().height) || view.clientHeight || Math.round(window.innerHeight * 0.5);
                view.style.height = fallbackH + 'px';
            }

            // align divider after layout changes
            alignDividerToImage();
        }

        // Align the divider so its top/bottom match the actual rendered image inside the view
        function alignDividerToImage() {
            try {
                // Simplify alignment: when the view is sized to match the image aspect, anchor
                // the before/after stacks to the full view area so they always match the image position
                // (this avoids subtle vertical shifts when object-fit centering would otherwise occur).
                beforeLayer.style.top = '0px';
                beforeLayer.style.height = '100%';
                afterStack.style.top = '0px';
                afterStack.style.height = '100%';
                // divider spans the full view height
                divider.style.top = '0px';
                divider.style.bottom = '0px';
            } catch (err) {
                // ignore alignment errors
            }
        }

        // update layout on load and resize, and respond to container size / DPR changes
        updateLayout();

        // Debounced updater to avoid excessive work during rapid changes
        var scheduled = null;
        function scheduleLayout() {
            if (scheduled) return;
            scheduled = requestAnimationFrame(function () {
                scheduled = null;
                setAspect().then(function () { updateLayout(); alignDividerToImage();
                    // debug logging
                    try {
                        // cleaned debug instrumentation: no-op in production
                    } catch (err) { /* ignore */ }
                });
            });
        }

        window.addEventListener('resize', scheduleLayout);
        // watch the container for size changes (covers zoom/transform cases)
        var container = view.parentElement;
        if (window.ResizeObserver && container) {
            var ro = new ResizeObserver(function () { scheduleLayout(); });
            ro.observe(container);
        }

        // Also watch devicePixelRatio changes (some browsers don't fire resize during zoom)
        var lastDPR = window.devicePixelRatio;
        setInterval(function () {
            if (window.devicePixelRatio !== lastDPR) {
                lastDPR = window.devicePixelRatio;
                scheduleLayout();
            }
        }, 250);

        beforeImg.addEventListener('load', function () { scheduleLayout(); });
        afterImg.addEventListener('load', function () { scheduleLayout(); });

        // Note: slider drag and panning are handled by a unified pointer handler above.
        // The legacy per-element handlers were removed to avoid conflicts.

        // dragging when starting on the handle
        handle.addEventListener('pointerdown', function (e) {
            if (zoomInteracting) return;
            dragging = true;
            handle.setPointerCapture(e.pointerId);
            // prevent the view pointerdown handler from doing a duplicate pointer capture
            e.stopPropagation();
        });

        // keyboard control on the handle for accessibility
        handle.addEventListener('keydown', function (e) {
            if (zoomInteracting) return;
            var step = (e.shiftKey ? 10 : 1);
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { setValue(current - step); e.preventDefault(); }
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { setValue(current + step); e.preventDefault(); }
            if (e.key === 'Home') { setValue(0); e.preventDefault(); }
            if (e.key === 'End') { setValue(100); e.preventDefault(); }
        });
    });
})();
