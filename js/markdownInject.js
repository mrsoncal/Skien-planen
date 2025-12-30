(function () {
    function getRootPrefix() {
        // Works for current site structure where pages live in /pages/
        return window.location.pathname.includes('/pages/') ? '../' : '';
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function stripDuplicateTitle(markdown, headingText) {
        const head = String(headingText || '').trim();
        if (!head) return markdown;

        const lines = String(markdown || '').split(/\r?\n/);
        if (lines.length === 0) return markdown;

        const first = (lines[0] || '').trim();
        if (first.toLowerCase() !== head.toLowerCase()) return markdown;

        // Remove first line and any immediate blank lines after.
        let i = 1;
        while (i < lines.length && String(lines[i]).trim() === '') i++;
        return lines.slice(i).join('\n');
    }

    function normalizeNewlines(markdown) {
        return String(markdown || '').replace(/\r\n/g, '\n');
    }

    function splitByBlankRuns(markdown) {
        const text = normalizeNewlines(markdown);
        const lines = text.split('\n');

        const segments = [];
        let buffer = [];
        let blankCount = 0;

        function flushBuffer() {
            const joined = buffer.join('\n').trimEnd();
            if (joined.trim().length > 0) {
                segments.push({ type: 'markdown', text: joined });
            }
            buffer = [];
        }

        function flushBlanks() {
            if (blankCount > 0) {
                segments.push({ type: 'blank', count: blankCount });
                blankCount = 0;
            }
        }

        for (const line of lines) {
            if (String(line).trim() === '') {
                if (buffer.length > 0) {
                    flushBuffer();
                }
                blankCount += 1;
                continue;
            }

            if (blankCount > 0) flushBlanks();
            buffer.push(line);
        }

        if (buffer.length > 0) flushBuffer();
        // trailing blanks are not meaningful visually; ignore
        return segments;
    }

    function ensureMarkedLoaded() {
        return new Promise((resolve) => {
            if (window.marked && typeof window.marked.parse === 'function') return resolve(true);

            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
            script.defer = true;
            script.onload = () => {
                try {
                    if (window.marked && typeof window.marked.setOptions === 'function') {
                        window.marked.setOptions({
                            gfm: true,
                            breaks: true,
                        });
                    }
                } catch (e) {
                    // Ignore; fallback rendering will still work.
                }
                resolve(true);
            };
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        });
    }

    async function injectOneHeading(headingEl) {
        const rootPrefix = getRootPrefix();

        const next = headingEl.nextElementSibling;
        const nextHasMd = next && next.classList && next.classList.contains('md-content');
        const explicit = headingEl.getAttribute('data-md') || (nextHasMd ? next.getAttribute('data-md') : null);
        const fileName = explicit || `${headingEl.textContent.trim()}.md`;
        if (!fileName || fileName === '.md') return;

        const url = `${rootPrefix}text/${encodeURIComponent(fileName)}`;

        let response;
        try {
            response = await fetch(url, { cache: 'no-store' });
        } catch (e) {
            return;
        }

        if (!response || !response.ok) return;

        const markdownRaw = await response.text();
        const markdownNormalized = normalizeNewlines(markdownRaw);
        const markdownDeduped = stripDuplicateTitle(markdownNormalized, headingEl.textContent);
        const segments = splitByBlankRuns(markdownDeduped);

        // Insert container only if content exists.
        let container = headingEl.nextElementSibling;
        if (!container || !container.classList.contains('md-content')) {
            container = document.createElement('div');
            container.className = 'md-content';
            headingEl.insertAdjacentElement('afterend', container);
        }

        const hasMarked = await ensureMarkedLoaded();
        if (hasMarked && window.marked && typeof window.marked.parse === 'function') {
            // Ensure options are applied even if marked was already present.
            try {
                if (typeof window.marked.setOptions === 'function') {
                    window.marked.setOptions({ gfm: true, breaks: true });
                }
            } catch (e) {
                // Ignore.
            }
            const htmlParts = [];
            for (const seg of segments) {
                if (seg.type === 'markdown') {
                    htmlParts.push(window.marked.parse(seg.text));
                    continue;
                }

                if (seg.type === 'blank') {
                    // Markdown needs only one blank line to separate blocks.
                    // Extra blank lines become explicit spacers.
                    const extra = Math.max(0, (seg.count || 0) - 1);
                    for (let i = 0; i < extra; i += 1) {
                        htmlParts.push('<div class="md-blank" aria-hidden="true"></div>');
                    }
                }
            }

            container.innerHTML = htmlParts.join('');
        } else {
            // Fallback: preserve line breaks only.
            container.innerHTML = escapeHtml(markdownDeduped).replace(/\r?\n/g, '<br>');
        }

        // Turn literal <img> in markdown into a real placeholder image.
        // Important: each placeholder gets a stable per-section index so it can be swapped later.
        const placeholderSrc = `${rootPrefix}images/placeholder.png`;
        const sectionKey = headingEl.id || headingEl.textContent.trim();
        let placeholderIndex = 0;
        container.querySelectorAll('img').forEach((img) => {
            const src = (img.getAttribute('src') || '').trim();
            if (src) return;

            placeholderIndex += 1;
            img.setAttribute('src', placeholderSrc);
            if (!img.getAttribute('alt')) {
                img.setAttribute('alt', 'Bilde (erstatt senere)');
            }
            img.setAttribute('loading', 'lazy');
            img.setAttribute('decoding', 'async');
            img.classList.add('md-img');
            img.dataset.mdPlaceholder = 'true';
            img.dataset.mdPlaceholderIndex = String(placeholderIndex);
            img.dataset.mdSection = sectionKey;
            img.dataset.mdFile = fileName;
        });

        container.classList.add('md-loaded');

        // Notify other scripts (e.g., hash scroll/flash) that layout may have shifted.
        try {
            if (typeof window.CustomEvent === 'function') {
                document.dispatchEvent(new CustomEvent('md:injected', {
                    detail: { id: headingEl.id || null, file: fileName || null }
                }));
            }
        } catch (e) { /* ignore */ }
    }

    async function init() {
        const headings = Array.from(document.querySelectorAll('.section-anchor'));
        if (headings.length === 0) return;

        // Sequential to avoid hammering fetch on slow servers.
        for (const h of headings) {
            // eslint-disable-next-line no-await-in-loop
            await injectOneHeading(h);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
