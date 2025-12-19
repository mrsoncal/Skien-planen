// Set current year
document.getElementById('year').textContent = new Date().getFullYear();

// Highlight the active nav link based on current location
(function () {
	try {
		var links = document.querySelectorAll('header nav a');
		var currentPath = location.pathname.replace(/index\.html$/, '').replace(/\/$/, '') || '/';
		links.forEach(function (a) {
			try {
				var linkPath = new URL(a.href, location.origin).pathname.replace(/index\.html$/, '').replace(/\/$/, '') || '/';
				if (linkPath === currentPath) {
					a.setAttribute('aria-current', 'page');
				} else {
					a.removeAttribute('aria-current');
				}
			} catch (err) { /* ignore */ }
		});
	} catch (err) { /* ignore */ }
})();