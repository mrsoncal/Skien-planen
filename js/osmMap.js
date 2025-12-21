(function () {
    const statusEl = document.getElementById('osmStatus');
    const mapEl = document.getElementById('osmMap');

    function setStatus(message) {
        if (!statusEl) return;
        statusEl.textContent = message;
    }

    function warnStatus(message) {
        if (!statusEl) return;
        statusEl.textContent = message;
    }

    function hasLibs() {
        return !!(window.maplibregl && window.pmtiles);
    }

    function includesAny(haystack, needles) {
        const h = String(haystack || '').toLowerCase();
        return needles.some((n) => h.includes(String(n).toLowerCase()));
    }

    async function loadGroupConfig() {
        try {
            const res = await fetch('map/layer-groups.json', { cache: 'no-store' });
            if (!res.ok) throw new Error(String(res.status));
            const json = await res.json();
            return json;
        } catch (err) {
            // Fallback to a minimal config so the page still works.
            return {
                labels: { match: ['label', 'place', 'poi'] },
                roads: { match: ['road', 'street', 'highway', 'transport'] },
                parks: { match: ['park', 'landuse', 'green', 'forest'] },
                rail: { match: ['rail', 'railway'] },
                water: { match: ['water', 'river', 'ocean', 'lake'] },
            };
        }
    }

    function buildLayerMatches(map, groupConfig) {
        const style = map.getStyle && map.getStyle();
        const layers = (style && style.layers) || [];

        const result = {};
        Object.keys(groupConfig || {}).forEach((groupName) => {
            const matchTokens = (groupConfig[groupName] && groupConfig[groupName].match) || [];

            result[groupName] = layers
                .map((l) => l && l.id)
                .filter(Boolean)
                .filter((layerId) => includesAny(layerId, matchTokens));
        });

        return result;
    }

    function applyVisibility(map, layerIds, visible) {
        const v = visible ? 'visible' : 'none';

        (layerIds || []).forEach((id) => {
            try {
                // Skip missing layers (e.g. style changed).
                if (!map.getLayer || !map.getLayer(id)) return;
                map.setLayoutProperty(id, 'visibility', v);
            } catch (err) {
                // Keep going; partial failures should not break the UI.
            }
        });
    }

    async function wireToggles(map) {
        const panel = document.querySelector('.osm-panel');
        const inputs = Array.from(document.querySelectorAll('input[type="checkbox"][data-layer-group]'));
        if (!panel || inputs.length === 0) return;

        const groupConfig = await loadGroupConfig();
        let matched = buildLayerMatches(map, groupConfig);

        function refreshMatchesAndApplyAll() {
            matched = buildLayerMatches(map, groupConfig);
            inputs.forEach((input) => {
                const group = input.getAttribute('data-layer-group');
                applyVisibility(map, matched[group] || [], input.checked);
            });
        }

        // Initial apply once style is ready.
        refreshMatchesAndApplyAll();

        panel.addEventListener('change', (e) => {
            const target = e.target;
            if (!(target instanceof HTMLInputElement)) return;
            if (target.type !== 'checkbox') return;

            const group = target.getAttribute('data-layer-group');
            if (!group) return;

            applyVisibility(map, matched[group] || [], target.checked);

            const count = (matched[group] || []).length;
            if (count === 0) {
                warnStatus('Ingen lag matchet denne gruppen ennå (oppdater style.json med faktiske lag).');
            } else {
                setStatus('');
            }
        });

        // If style reloads (e.g. setStyle), recompute group matches.
        map.on('styledata', () => {
            if (!map.isStyleLoaded || !map.isStyleLoaded()) return;
            refreshMatchesAndApplyAll();
        });
    }

    function init() {
        if (!mapEl) return;

        if (!hasLibs()) {
            setStatus('Kunne ikke laste kartbibliotekene. Sjekk nettverk og konsoll.');
            return;
        }

        setStatus('Laster kart…');

        try {
            const protocol = new window.pmtiles.Protocol();
            window.maplibregl.addProtocol('pmtiles', protocol.tile);

            const map = new window.maplibregl.Map({
                container: mapEl,
                style: 'map/style.json',
                // Respect style.json defaults; center/zoom here are only fallback.
                center: [9.61, 59.209],
                zoom: 12,
                attributionControl: true,
            });

            map.on('error', (e) => {
                const msg = (e && e.error && e.error.message) ? e.error.message : 'Ukjent kartfeil';
                setStatus(`Kartfeil: ${msg}`);
                // eslint-disable-next-line no-console
                console.error(e);
            });

            map.on('load', () => {
                setStatus('Kart klart.');
                wireToggles(map);
            });
        } catch (err) {
            setStatus('Klarte ikke å starte kartet.');
            // eslint-disable-next-line no-console
            console.error(err);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
