// app.friendsgame/friendsgame.js

window.FriendsGame = {
  root: null,
  initialized: false,
  creators: [],

  /**
   * Initialize the FriendsGame application
   */
  init() {
    if (this.initialized) return;
    this.initialized = true;
    this.mount();
    this.loadCreators();
  },

  /**
   * Mount the app DOM
   */
  mount() {
    if (this.root) return;

    const container = document.getElementById('friendsgameScreen');
    if (!container) return;

    this.root = document.createElement('div');
    this.root.id = 'friendsgame-app';
    this.root.innerHTML = `
      <div class="fg-header">Friends' Games</div>
      <div class="fg-list" id="fgList">
        <div class="fg-loading">Loading...</div>
      </div>
    `;

    container.appendChild(this.root);
  },

  /**
   * Load creators from friendsgame.txt
   */
  async loadCreators() {
    try {
      const url = window.getAssetUrl
        ? window.getAssetUrl('friendsgame.txt')
        : 'friendsgame.txt';
      const res = await fetch(url);
      if (!res.ok) {
        this.showEmpty();
        return;
      }

      const txt = await res.text();
      this.creators = this.parseCreators(txt);
      this.render();
    } catch (e) {
      this.showEmpty();
    }
  },

  /**
   * Parse the friendsgame.txt file
   * Format:
   *   NOM : TITRE DU JEU
   *   icone : NOM.png
   *   Desc : Description
   *   Patreon = Link
   *   Boosty = Link
   *   Itch = Link
   *   SubscribeStar = Link
   *   -
   */
  parseCreators(txt) {
    const creators = [];
    const blocks = txt.split(/^-$/m);

    for (const block of blocks) {
      const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) continue;

      const creator = {
        name: '',
        icon: '',
        desc: '',
        links: {
          patreon: null,
          boosty: null,
          itch: null,
          subscribestar: null
        }
      };

      for (const line of lines) {
        // icone : filename.png (check commands FIRST to avoid treating them as name)
        const iconMatch = line.match(/^icone\s*:\s*(.+)$/i);
        if (iconMatch) {
          creator.icon = iconMatch[1].trim();
          continue;
        }

        // Desc : description
        const descMatch = line.match(/^desc\s*:\s*(.+)$/i);
        if (descMatch) {
          creator.desc = descMatch[1].trim();
          continue;
        }

        // Links: Platform = URL
        const linkMatch = line.match(/^(patreon|boosty|itch|subscribestar)\s*=\s*(.+)$/i);
        if (linkMatch) {
          const platform = linkMatch[1].toLowerCase();
          const url = linkMatch[2].trim();
          if (url && url !== '-' && url !== 'null') {
            creator.links[platform] = url;
          }
          continue;
        }

        // If no command matched and no name yet, this line is the creator name
        if (!creator.name) {
          creator.name = line;
        }
      }

      if (creator.name) {
        creators.push(creator);
      }
    }

    return creators;
  },

  /**
   * Render the creators list
   */
  render() {
    const list = this.root?.querySelector('#fgList');
    if (!list) return;

    if (this.creators.length === 0) {
      this.showEmpty();
      return;
    }

    let html = '';
    for (const creator of this.creators) {
      const iconSrc = creator.icon
        ? (window.getAssetUrl ? window.getAssetUrl(`assets/friendsgame/${creator.icon}`) : `assets/friendsgame/${creator.icon}`)
        : '';

      const iconHtml = iconSrc
        ? `<img class="fg-card-icon" src="${iconSrc}" alt="${this.escapeHtml(creator.name)}">`
        : `<div class="fg-card-icon fg-card-icon--placeholder">${creator.name.charAt(0).toUpperCase()}</div>`;

      const linksHtml = this.renderLinks(creator.links);

      html += `
        <div class="fg-card">
          ${iconHtml}
          <div class="fg-card-content">
            <div class="fg-card-title">${this.escapeHtml(creator.name)}</div>
            <div class="fg-card-desc">${this.escapeHtml(creator.desc)}</div>
            <div class="fg-card-links">${linksHtml}</div>
          </div>
        </div>
      `;
    }

    list.innerHTML = html;

    // Bind link clicks
    list.querySelectorAll('.fg-link:not(.fg-link--disabled)').forEach(link => {
      link.addEventListener('click', () => {
        const url = link.dataset.url;
        if (url) window.open(url, '_blank');
      });
    });
  },

  /**
   * Render platform link buttons (using PNG icons from assets/friendsgame/)
   */
  renderLinks(links) {
    const platforms = [
      { key: 'patreon', label: 'Patreon', icon: 'patreon.png' },
      { key: 'boosty', label: 'Boosty', icon: 'boosty.svg' },
      { key: 'itch', label: 'Itch.io', icon: 'itch.png' },
      { key: 'subscribestar', label: 'SubscribeStar', icon: 'subscribestar.png' }
    ];

    return platforms.map(p => {
      const url = links[p.key];
      const disabled = !url;
      const iconSrc = window.getAssetUrl
        ? window.getAssetUrl(`assets/friendsgame/${p.icon}`)
        : `assets/friendsgame/${p.icon}`;
      return `<button class="fg-link ${disabled ? 'fg-link--disabled' : ''}" ${!disabled ? `data-url="${this.escapeHtml(url)}"` : ''} title="${p.label}">
        <img class="fg-link-icon" src="${iconSrc}" alt="${p.label}">
      </button>`;
    }).join('');
  },

  showEmpty() {
    const list = this.root?.querySelector('#fgList');
    if (list) list.innerHTML = '<div class="fg-empty">No creators found</div>';
  },

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

};
