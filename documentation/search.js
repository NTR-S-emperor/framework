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
        { term: '$status', description: 'Display a status bubble (date, time, etc.)', page: 'messenger.html', anchor: '#status' },
        { term: '$delete', description: 'Delete the previous message', page: 'messenger.html', anchor: '#delete' },
        { term: '$typing', description: 'Display typing indicator (bouncing dots)', page: 'messenger.html', anchor: '#typing' },

        // Messenger - Reactions
        { term: '$react', description: 'Add emoji reactions to messages', page: 'messenger.html', anchor: '#reactions' },

        // Messenger - Thinking
        { term: '$thinking', description: 'Display MC\'s inner thoughts overlay', page: 'messenger.html', anchor: '#thinking' },
        { term: '$/', description: 'Separate thought bubbles', page: 'messenger.html', anchor: '#thinking' },

        // Messenger - Choices
        { term: '$choices', description: 'Choices with story impact (branching paths)', page: 'messenger.html', anchor: '#choices' },
        { term: '$fake.choices', description: 'Cosmetic choices without impact (immersion)', page: 'messenger.html', anchor: '#choices' },
        { term: 'hints', description: 'Add colored hint badges to choices', page: 'messenger.html', anchor: '#hints' },

        // Messenger - Locks
        { term: '$lock', description: 'Lock content behind premium tiers', page: 'messenger.html', anchor: '#locks' },

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

    function navigateTo(href) {
        var parts = href.split('#');
        var anchor = parts[1] ? '#' + parts[1] : '';

        // Check if target element exists on current page
        if (anchor) {
            var target = document.getElementById(anchor.substring(1));
            if (target) {
                // Element exists on current page: scroll to it
                target.scrollIntoView({ behavior: 'smooth' });
                history.pushState(null, '', anchor);
                return;
            }
        }

        // Element not found or no anchor: navigate to the page
        window.location.href = href;
    }

    function initSearch() {
        var searchInputs = document.querySelectorAll('.search-input');
        searchInputs.forEach(function(input) {
            var parent = input.parentElement;
            parent.style.position = 'relative';

            var dropdown = document.createElement('div');
            dropdown.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:#2d2d44;border:1px solid #444;border-radius:0 0 6px 6px;max-height:300px;overflow-y:auto;display:none;z-index:1000;';
            parent.appendChild(dropdown);

            var selectedIndex = -1;

            function updateSelection() {
                var items = dropdown.querySelectorAll('div[data-href]');
                items.forEach(function(item, idx) {
                    item.style.background = (idx === selectedIndex) ? '#3d3d54' : '';
                });
                // Scroll selected item into view
                if (selectedIndex >= 0 && items[selectedIndex]) {
                    items[selectedIndex].scrollIntoView({ block: 'nearest' });
                }
            }

            input.addEventListener('input', function(e) {
                var query = e.target.value.trim();
                var results = search(query);
                dropdown.innerHTML = '';
                selectedIndex = -1;

                if (results.length > 0) {
                    for (var i = 0; i < results.length; i++) {
                        var item = results[i];
                        var div = document.createElement('div');
                        div.style.cssText = 'padding:10px;cursor:pointer;border-bottom:1px solid #444;';
                        div.innerHTML = '<div style="color:#f472b6;font-family:monospace;">' + item.term + '</div><div style="color:#888;font-size:12px;">' + item.description + '</div>';
                        div.dataset.href = item.page + item.anchor;
                        div.dataset.index = i;
                        div.addEventListener('click', function() {
                            navigateTo(this.dataset.href);
                            dropdown.style.display = 'none';
                            input.value = '';
                        });
                        div.addEventListener('mouseenter', function() {
                            selectedIndex = parseInt(this.dataset.index);
                            updateSelection();
                        });
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
                var items = dropdown.querySelectorAll('div[data-href]');
                var itemCount = items.length;

                if (e.key === 'Escape') {
                    dropdown.style.display = 'none';
                    selectedIndex = -1;
                }

                if (e.key === 'ArrowDown' && itemCount > 0) {
                    e.preventDefault();
                    selectedIndex = (selectedIndex + 1) % itemCount;
                    updateSelection();
                }

                if (e.key === 'ArrowUp' && itemCount > 0) {
                    e.preventDefault();
                    selectedIndex = selectedIndex <= 0 ? itemCount - 1 : selectedIndex - 1;
                    updateSelection();
                }

                if (e.key === 'Enter') {
                    var targetItem = selectedIndex >= 0 ? items[selectedIndex] : items[0];
                    if (targetItem) {
                        navigateTo(targetItem.dataset.href);
                        dropdown.style.display = 'none';
                        input.value = '';
                        selectedIndex = -1;
                    }
                }
            });

            document.addEventListener('click', function(e) {
                if (!parent.contains(e.target)) {
                    dropdown.style.display = 'none';
                    selectedIndex = -1;
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
