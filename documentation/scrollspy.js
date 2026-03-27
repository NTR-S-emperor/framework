// ===========================================
// SCROLL SPY - Auto-detect sections on any page
// ===========================================
(function() {
    // Get current page name
    var currentPage = window.location.pathname.split('/').pop() || 'index.html';
    // Remove query string if present
    if (currentPage.indexOf('?') !== -1) {
        currentPage = currentPage.split('?')[0];
    }
    // Default to index.html if empty
    if (!currentPage || currentPage === '') {
        currentPage = 'index.html';
    }

    function getOffsetTop(el) {
        var top = 0;
        while (el) {
            top += el.offsetTop;
            el = el.offsetParent;
        }
        return top;
    }

    function isLinkForCurrentPage(href) {
        if (!href) return false;

        // Link is just an anchor (e.g., "#characters") - it's for current page
        if (href.indexOf('#') === 0) return true;

        // Link starts with current page name (e.g., "instapics.html#characters")
        if (href.indexOf(currentPage) === 0) return true;

        return false;
    }

    function updateActiveNav() {
        // Find all h2/h3 elements with an id attribute
        var sections = document.querySelectorAll('h2[id], h3[id]');
        if (sections.length === 0) return;

        var scrollPos = window.scrollY + 150;
        var activeId = null;

        // Find which section we're currently in
        sections.forEach(function(section) {
            if (scrollPos >= getOffsetTop(section)) {
                activeId = section.id;
            }
        });

        // Update sidebar links
        document.querySelectorAll('.sidebar-nav .nav-link').forEach(function(link) {
            var href = link.getAttribute('href');

            // Only highlight if link is for current page AND matches active section
            var isForCurrentPage = isLinkForCurrentPage(href);
            var matchesSection = href && activeId && href.indexOf('#' + activeId) !== -1;
            var isActive = isForCurrentPage && matchesSection;

            if (isActive) {
                link.style.background = 'rgba(255,255,255,0.08)';
                link.style.borderRadius = '6px';
                link.style.marginLeft = '4px';
                link.style.marginRight = '4px';
            } else {
                link.style.background = '';
                link.style.borderRadius = '';
                link.style.marginLeft = '';
                link.style.marginRight = '';
            }
        });
    }

    window.addEventListener('scroll', updateActiveNav);
    // Initial check after page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(updateActiveNav, 100);
        });
    } else {
        setTimeout(updateActiveNav, 100);
    }
})();
