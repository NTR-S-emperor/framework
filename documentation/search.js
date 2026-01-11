// ===========================================
// RECHERCHE GLOBALE - Index de toutes les commandes
// ===========================================
(function() {
    // Index global de toutes les commandes du framework
    var searchIndex = [
        // Messenger - Variables
        { term: '$mc', description: 'MC\'s custom name variable', page: 'messenger.html', anchor: '#commands' },
        { term: '$gf', description: 'Girlfriend\'s custom name variable', page: 'messenger.html', anchor: '#commands' },

        // Messenger - Media
        { term: '$pics', description: 'Send a photo in conversation', page: 'messenger.html', anchor: '#media' },
        { term: '$vids', description: 'Send a video in conversation', page: 'messenger.html', anchor: '#media' },
        { term: '$audio', description: 'Send a voice note in conversation', page: 'messenger.html', anchor: '#media' },

        // Messenger - Navigation
        { term: '$talks', description: 'Start or continue a conversation file', page: 'messenger.html', anchor: '#conversations' },
        { term: '$status', description: 'Display a status bubble (date, time, etc.)', page: 'messenger.html', anchor: '#commands' },
        { term: '$delete', description: 'Delete the previous message', page: 'messenger.html', anchor: '#commands' },

        // Messenger - Reactions
        { term: '$react', description: 'Add emoji reactions to messages', page: 'messenger.html', anchor: '#reactions' },

        // Messenger - Thinking
        { term: '$thinking', description: 'Display MC\'s inner thoughts overlay', page: 'messenger.html', anchor: '#thinking' },
        { term: '$/', description: 'Separate thought bubbles', page: 'messenger.html', anchor: '#thinking' },

        // Messenger - Choices
        { term: '$choices', description: 'Choices with story impact (branching paths)', page: 'messenger.html', anchor: '#choices' },
        { term: '$fake.choices', description: 'Cosmetic choices without impact (immersion)', page: 'messenger.html', anchor: '#choices' },

        // Messenger - Locks
        { term: '$lock', description: 'Lock content behind premium tiers', page: 'messenger.html', anchor: '#choices' },

        // Social Media
        { term: '$insta', description: 'Unlock an InstaPics post', page: 'instapics.html', anchor: '#posts' },
        { term: '$slut', description: 'Unlock an OnlySlut post', page: 'onlyslut.html', anchor: '#posts' },

        // Spy App
        { term: '$spy_unlock', description: 'Unlock the Spy App for the MC', page: 'spy.html', anchor: '#unlock' },
        { term: '$spy_unlock_instapics', description: 'Show InstaPics on girlfriend\'s phone', page: 'spy.html', anchor: '#unlock' },
        { term: '$spy_unlock_onlyslut', description: 'Show OnlySlut on girlfriend\'s phone', page: 'spy.html', anchor: '#unlock' },
        { term: '$spy_anchor', description: 'Set visibility anchor for Spy App content', page: 'spy.html', anchor: '#anchors' }
    ];

    function search(query) {
        if (!query) return [];
        var lowerQuery = query.toLowerCase();
        // Remove $ if user typed it
        if (lowerQuery.indexOf('$') === 0) {
            lowerQuery = lowerQuery.substring(1);
        }
        var results = [];
        for (var i = 0; i < searchIndex.length; i++) {
            var item = searchIndex[i];
            // Search without the $ prefix
            var termWithout$ = item.term.indexOf('$') === 0 ? item.term.substring(1) : item.term;
            if (termWithout$.toLowerCase().indexOf(lowerQuery) !== -1 || item.description.toLowerCase().indexOf(lowerQuery) !== -1) {
                results.push(item);
            }
        }
        results.sort(function(a, b) {
            var termA = a.term.indexOf('$') === 0 ? a.term.substring(1) : a.term;
            var termB = b.term.indexOf('$') === 0 ? b.term.substring(1) : b.term;
            var aStarts = termA.toLowerCase().indexOf(lowerQuery) === 0;
            var bStarts = termB.toLowerCase().indexOf(lowerQuery) === 0;
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return a.term.localeCompare(b.term);
        });
        return results.slice(0, 15);
    }

    function initSearch() {
        var searchInputs = document.querySelectorAll('.search-input');
        searchInputs.forEach(function(input) {
            var parent = input.parentElement;
            parent.style.position = 'relative';

            var dropdown = document.createElement('div');
            dropdown.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:#2d2d44;border:1px solid #444;border-radius:0 0 6px 6px;max-height:300px;overflow-y:auto;display:none;z-index:1000;';
            parent.appendChild(dropdown);

            input.addEventListener('input', function(e) {
                var query = e.target.value.trim();
                var results = search(query);
                dropdown.innerHTML = '';

                if (results.length > 0) {
                    for (var i = 0; i < results.length; i++) {
                        var item = results[i];
                        var div = document.createElement('div');
                        div.style.cssText = 'padding:10px;cursor:pointer;border-bottom:1px solid #444;';
                        div.innerHTML = '<div style="color:#f472b6;font-family:monospace;">' + item.term + '</div><div style="color:#888;font-size:12px;">' + item.description + '</div>';
                        div.dataset.href = item.page + item.anchor;
                        div.addEventListener('click', function() { window.location.href = this.dataset.href; });
                        div.addEventListener('mouseenter', function() { this.style.background = '#3d3d54'; });
                        div.addEventListener('mouseleave', function() { this.style.background = ''; });
                        dropdown.appendChild(div);
                    }
                    dropdown.style.display = 'block';
                } else if (query.length > 0) {
                    dropdown.innerHTML = '<div style="padding:14px;color:#888;text-align:center;">No results found</div>';
                    dropdown.style.display = 'block';
                } else {
                    dropdown.style.display = 'none';
                }
            });

            input.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') dropdown.style.display = 'none';
                if (e.key === 'Enter') {
                    var first = dropdown.querySelector('div[data-href]');
                    if (first) window.location.href = first.dataset.href;
                }
            });

            document.addEventListener('click', function(e) {
                if (!parent.contains(e.target)) {
                    dropdown.style.display = 'none';
                }
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSearch);
    } else {
        initSearch();
    }
})();
