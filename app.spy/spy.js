// app.spy/spy.js

/**
 * Current spy anchor level (controls how much content is visible on GF's phone)
 */
window.currentSpyAnchor = 0;

/**
 * Unlocked spy content (InstaPics and OnlySlut post filenames)
 * Same system as MC: stores filenames like "1.txt" or "chapter1/1.txt"
 */
window.unlockedSpyInsta = [];
window.unlockedSpySlut = [];

/**
 * Unlock a SpyInstaPics post (called via $insta = filename.txt in GF's conversations)
 * Posts are recalculated on each SpyApp open based on current anchor - no persistence needed
 */
window.unlockSpyInsta = function(filename) {
  if (!window.unlockedSpyInsta.includes(filename)) {
    window.unlockedSpyInsta.push(filename);
  }
};

/**
 * Unlock a SpyOnlySlut post (called via $slut = filename.txt in GF's conversations)
 * Posts are recalculated on each SpyApp open based on current anchor - no persistence needed
 */
window.unlockSpySlut = function(filename) {
  if (!window.unlockedSpySlut.includes(filename)) {
    window.unlockedSpySlut.push(filename);
  }
};

/**
 * Get unlocked SpyInstaPics post filenames
 */
window.getUnlockedSpyInsta = function() {
  return window.unlockedSpyInsta;
};

/**
 * Get unlocked SpyOnlySlut post filenames
 */
window.getUnlockedSpySlut = function() {
  return window.unlockedSpySlut;
};

/**
 * Unlocked spy apps (InstaPics and OnlySlut visibility on GF's home screen)
 * Apps are hidden by default and unlocked via $spy_unlock_instapics / $spy_unlock_onlyslut
 */
window.spyAppsUnlocked = {
  instapics: false,
  onlyslut: false
};

/**
 * Unlock SpyInstaPics app (called via $spy_unlock_instapics in MC's conversations)
 */
window.unlockSpyInstapicsApp = function() {
  window.spyAppsUnlocked.instapics = true;
};

/**
 * Unlock SpyOnlySlut app (called via $spy_unlock_onlyslut in MC's conversations)
 */
window.unlockSpyOnlyslutApp = function() {
  window.spyAppsUnlocked.onlyslut = true;
};

/**
 * Check if SpyInstaPics app is unlocked
 */
window.isSpyInstapicsUnlocked = function() {
  return window.spyAppsUnlocked.instapics;
};

/**
 * Check if SpyOnlySlut app is unlocked
 */
window.isSpyOnlyslutUnlocked = function() {
  return window.spyAppsUnlocked.onlyslut;
};

/**
 * Reset spy unlocks (called when changing story)
 */
window.resetSpyUnlocks = function() {
  window.unlockedSpyInsta = [];
  window.unlockedSpySlut = [];
  window.spyAppsUnlocked = {
    instapics: false,
    onlyslut: false
  };
};

/**
 * Reset spy post unlocks (posts are recalculated when SpyApp opens based on anchor)
 */
window.restoreSpyTopics = function() {
  // Posts are now recalculated on SpyApp open, not restored from localStorage
  window.unlockedSpyInsta = [];
  window.unlockedSpySlut = [];
};

/**
 * Set the spy anchor level (called from Messenger via $spy_anchor_X command)
 */
window.setSpyAnchor = function(anchor) {
  const slug = window.currentStorySlug || 'default';

  // Only update if the new anchor is higher than current
  if (anchor > window.currentSpyAnchor) {
    window.currentSpyAnchor = anchor;

    // Save to localStorage
    try {
      const saved = localStorage.getItem('studioSpyAnchor') || '{}';
      const data = JSON.parse(saved);
      data[slug] = anchor;
      localStorage.setItem('studioSpyAnchor', JSON.stringify(data));
    } catch (e) {}
  }
};

/**
 * Get the current spy anchor level
 */
window.getSpyAnchor = function() {
  return window.currentSpyAnchor;
};

/**
 * Restore spy anchor from localStorage
 */
window.restoreSpyAnchor = function() {
  const slug = window.currentStorySlug || 'default';
  try {
    const saved = localStorage.getItem('studioSpyAnchor');
    if (saved) {
      const data = JSON.parse(saved);
      window.currentSpyAnchor = data[slug] || 0;
    }
  } catch (e) {
    window.currentSpyAnchor = 0;
  }
};

/**
 * Track if Spy app is unlocked in current session
 * NOT persisted in localStorage - tied to Messenger progression
 */
window.spyAppUnlocked = false;

/**
 * Unlock the Spy app (called from Messenger via $spy_unlock command)
 * Does NOT persist to localStorage - unlocked state is tied to conversation progress
 */
window.unlockSpyApp = function() {
  window.spyAppUnlocked = true;
  const spyBtn = document.getElementById('openSpyBtn');
  if (spyBtn) {
    spyBtn.classList.remove('hidden');
  }
};

/**
 * Check if Spy app is unlocked for current session
 */
window.isSpyUnlocked = function() {
  return window.spyAppUnlocked === true;
};

/**
 * Reset Spy app unlock state (called on story change or reset)
 */
window.resetSpyAppState = function() {
  window.spyAppUnlocked = false;
  const spyBtn = document.getElementById('openSpyBtn');
  if (spyBtn) {
    spyBtn.classList.add('hidden');
  }
};

/**
 * Restore Spy app visibility on story load
 * Shows the spy button if it was previously unlocked
 */
window.restoreSpyAppState = function() {
  if (window.spyAppUnlocked) {
    const spyBtn = document.getElementById('openSpyBtn');
    if (spyBtn) {
      spyBtn.classList.remove('hidden');
    }
  }
};

window.Spy = {
  root: null,
  storyPath: null,
  currentScreen: 'home', // 'home', 'messenger', 'instapics', 'onlyslut', 'gallery'

  // Store original MC key to swap with GF
  originalMcKey: 'mc',
  gfKey: null, // Will be set from customizableCharacterInfo

  /**
   * Initialize the Spy app
   */
  async init(storyBasePath) {
    this.storyPath = storyBasePath;

    // Get the GF key from the customizable character info
    if (window.customizableCharacterInfo && window.customizableCharacterInfo.key) {
      this.gfKey = window.customizableCharacterInfo.key;
    } else {
      this.gfKey = 'gf'; // Default fallback
    }

    // Set global spy mode flag
    window.spyMode = true;

    this.initDOM();

    // Preload messenger data to unlock posts for InstaPics/OnlySlut
    if (window.SpyMessenger) {
      await window.SpyMessenger.preloadData(this.storyPath + '/spy/messenger', this.gfKey);
    }

    this.showHomeScreen();
  },

  /**
   * Called when leaving the Spy app
   */
  cleanup() {
    window.spyMode = false;
    this.currentScreen = 'home';

    // Reset data loaded flag so data is reloaded next time (anchor may have changed)
    if (window.SpyMessenger) {
      window.SpyMessenger.dataLoaded = false;
    }
  },

  /**
   * Initialize the DOM structure
   */
  initDOM() {
    const container = document.getElementById('spyScreen');
    if (!container) return;

    const root = document.createElement('div');
    root.id = 'spy-app';
    root.innerHTML = `
      <!-- Spy Overlay Indicator -->
      <div class="spy-overlay-indicator">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
        </svg>
      </div>

      <!-- Phone Container -->
      <div class="spy-phone-container">
        <!-- Home Screen with Apps -->
        <div class="spy-home-screen" id="spyHomeScreen">
          <!-- Messenger -->
          <button class="spy-app-icon" data-app="messenger">
            <img class="spy-app-icon-image" src="assets/apps_icon/messenger.svg" alt="Messenger">
            <span class="spy-app-icon-label" data-i18n="app.messenger">Messenger</span>
          </button>

          <!-- InstaPics (hidden by default, unlocked via $spy_unlock_instapics) -->
          <button class="spy-app-icon" data-app="instapics" id="spyAppInstapics" style="display: none;">
            <img class="spy-app-icon-image" src="assets/apps_icon/instapics.svg" alt="InstaPics">
            <span class="spy-app-icon-label" data-i18n="app.instapics">InstaPics</span>
          </button>

          <!-- OnlySlut (hidden by default, unlocked via $spy_unlock_onlyslut) -->
          <button class="spy-app-icon" data-app="onlyslut" id="spyAppOnlyslut" style="display: none;">
            <img class="spy-app-icon-image" src="assets/apps_icon/onlyslut.png" alt="OnlySlut">
            <span class="spy-app-icon-label" data-i18n="app.onlyslut">OnlySlut</span>
          </button>

          <!-- Gallery -->
          <button class="spy-app-icon" data-app="gallery">
            <img class="spy-app-icon-image" src="assets/apps_icon/gallery.png" alt="Gallery">
            <span class="spy-app-icon-label" data-i18n="app.gallery">Gallery</span>
          </button>

          <!-- Settings (disabled) -->
          <button class="spy-app-icon spy-app-icon--disabled" data-app="settings">
            <img class="spy-app-icon-image" src="assets/apps_icon/settings.png" alt="Settings">
            <span class="spy-app-icon-label" data-i18n="app.settings">Settings</span>
          </button>

          <!-- Saves (disabled) -->
          <button class="spy-app-icon spy-app-icon--disabled" data-app="saves">
            <img class="spy-app-icon-image" src="assets/apps_icon/savesload.svg" alt="Saves">
            <span class="spy-app-icon-label" data-i18n="app.saves">Saves</span>
          </button>
        </div>

        <!-- Messenger Screen -->
        <div class="spy-app-screen" id="spyMessengerScreen">
          <div class="spy-header">
            <button class="spy-back-btn" id="spyMessengerBack">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </button>
            <div class="spy-header-title" data-i18n="app.messenger">Messenger</div>
          </div>
          <div class="spy-content" id="spyMessengerContent"></div>
        </div>

        <!-- InstaPics Screen -->
        <div class="spy-app-screen" id="spyInstapicsScreen">
          <div class="spy-header">
            <button class="spy-back-btn" id="spyInstapicsBack">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </button>
            <div class="spy-header-title" data-i18n="app.instapics">InstaPics</div>
          </div>
          <div class="spy-content" id="spyInstapicsContent"></div>
        </div>

        <!-- OnlySlut Screen -->
        <div class="spy-app-screen" id="spyOnlyslutScreen">
          <div class="spy-header">
            <button class="spy-back-btn" id="spyOnlyslutBack">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </button>
            <div class="spy-header-title" data-i18n="app.onlyslut">OnlySlut</div>
          </div>
          <div class="spy-content" id="spyOnlyslutContent"></div>
        </div>

        <!-- Gallery Screen -->
        <div class="spy-app-screen" id="spyGalleryScreen">
          <div class="spy-header">
            <button class="spy-back-btn" id="spyGalleryBack">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </button>
            <div class="spy-header-title" data-i18n="app.gallery">Gallery</div>
          </div>
          <div class="spy-content" id="spyGalleryContent"></div>
        </div>
      </div>
    `;

    container.innerHTML = '';
    container.appendChild(root);
    this.root = root;

    this.bindEvents();

    // Apply translations
    if (window.Translations && window.Translations.updateDOM) {
      window.Translations.updateDOM();
    }
  },

  /**
   * Bind click events
   */
  bindEvents() {
    // App icons
    const appIcons = this.root.querySelectorAll('.spy-app-icon:not(.spy-app-icon--disabled)');
    appIcons.forEach(icon => {
      icon.addEventListener('click', () => {
        const app = icon.dataset.app;
        this.openApp(app);
      });
    });

    // Back buttons
    const backBtns = [
      { id: 'spyMessengerBack', screen: 'messenger' },
      { id: 'spyInstapicsBack', screen: 'instapics' },
      { id: 'spyOnlyslutBack', screen: 'onlyslut' },
      { id: 'spyGalleryBack', screen: 'gallery' }
    ];

    backBtns.forEach(({ id }) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', () => this.showHomeScreen());
      }
    });
  },

  /**
   * Show home screen
   */
  showHomeScreen() {
    this.currentScreen = 'home';

    // Hide all app screens
    const screens = this.root.querySelectorAll('.spy-app-screen');
    screens.forEach(s => s.classList.remove('active'));

    // Show home screen
    const homeScreen = document.getElementById('spyHomeScreen');
    if (homeScreen) {
      homeScreen.style.display = 'grid';
    }

    // Update app visibility based on unlock state
    this.updateAppsVisibility();
  },

  /**
   * Update visibility of unlockable apps (InstaPics, OnlySlut)
   */
  updateAppsVisibility() {
    const instapicsApp = document.getElementById('spyAppInstapics');
    const onlyslutApp = document.getElementById('spyAppOnlyslut');

    const instapicsUnlocked = window.spyAppsUnlocked && window.spyAppsUnlocked.instapics;
    const onlyslutUnlocked = window.spyAppsUnlocked && window.spyAppsUnlocked.onlyslut;

    if (instapicsApp) {
      instapicsApp.style.display = instapicsUnlocked ? 'flex' : 'none';
    }
    if (onlyslutApp) {
      onlyslutApp.style.display = onlyslutUnlocked ? 'flex' : 'none';
    }
  },

  /**
   * Open an app
   */
  openApp(appName) {
    // Hide home screen
    const homeScreen = document.getElementById('spyHomeScreen');
    if (homeScreen) {
      homeScreen.style.display = 'none';
    }

    this.currentScreen = appName;

    switch (appName) {
      case 'messenger':
        this.openMessenger();
        break;
      case 'instapics':
        this.openInstaPics();
        break;
      case 'onlyslut':
        this.openOnlySlut();
        break;
      case 'gallery':
        this.openGallery();
        break;
    }
  },

  /**
   * Open Messenger in spy mode
   */
  openMessenger() {
    const screen = document.getElementById('spyMessengerScreen');
    const content = document.getElementById('spyMessengerContent');
    if (!screen || !content) return;

    screen.classList.add('active');
    content.classList.add('spy-mode');

    // Initialize spy messenger
    if (window.SpyMessenger) {
      window.SpyMessenger.init(this.storyPath + '/spy/messenger', content, this.gfKey);
    }
  },

  /**
   * Open InstaPics in spy mode
   */
  openInstaPics() {
    const screen = document.getElementById('spyInstapicsScreen');
    const content = document.getElementById('spyInstapicsContent');
    if (!screen || !content) return;

    screen.classList.add('active');
    content.classList.add('spy-mode');

    // Initialize spy instapics
    if (window.SpyInstaPics) {
      window.SpyInstaPics.init(this.storyPath + '/spy/instapics', content, this.gfKey);
    }
  },

  /**
   * Open OnlySlut in spy mode
   */
  openOnlySlut() {
    const screen = document.getElementById('spyOnlyslutScreen');
    const content = document.getElementById('spyOnlyslutContent');
    if (!screen || !content) return;

    screen.classList.add('active');
    content.classList.add('spy-mode');

    // Initialize spy onlyslut
    if (window.SpyOnlySlut) {
      window.SpyOnlySlut.init(this.storyPath + '/spy/onlyslut', content, this.gfKey);
    }
  },

  /**
   * Open Gallery in spy mode
   */
  openGallery() {
    const screen = document.getElementById('spyGalleryScreen');
    const content = document.getElementById('spyGalleryContent');
    if (!screen || !content) return;

    screen.classList.add('active');
    content.classList.add('spy-mode');

    // Initialize spy gallery
    if (window.SpyGallery) {
      window.SpyGallery.init(this.storyPath, content, this.gfKey);
    }
  }
};

// ============================================================
// SPY MESSENGER - Read-only messenger for GF's conversations
// Uses same CSS classes as MC's Messenger (ms-*)
// Implements $talks system like MC's Messenger
// Shows GF's conversations with other characters (not MC)
// ============================================================

window.SpyMessenger = {
  container: null,
  basePath: null,        // spy/messenger path
  gfKey: null,
  characters: {},
  conversations: [],     // Contacts (sorted by recent activity)
  conversationsByKey: {}, // key -> { messages, lastActivity, isGroup, participants }
  currentConversation: null,
  viewMode: 'contacts', // 'contacts' or 'chat'
  parsedFiles: [],      // Track which files have been parsed
  keyToName: {},        // key -> display name
  dataLoaded: false,    // Track if data has been preloaded

  // Lightbox
  lightboxEl: null,
  lightboxOpen: false,
  lightboxType: null,

  // Virtual scrolling configuration (same as MC's Messenger)
  virtualScroll: {
    enabled: false,
    buffer: 10,
    estimatedHeights: {
      text: 52,
      image: 220,
      video: 220,
      audio: 60,
      spacerMin: 8
    },
    cachedHeights: {},
    visibleRange: { start: 0, end: 50 },
    totalHeight: 0,
    scrollTimeout: null
  },

  // Colors for group participants (same as MC)
  groupColors: ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb923c'],

  /**
   * Preload data only (characters + conversations) without rendering UI
   * This unlocks posts for InstaPics/OnlySlut
   */
  async preloadData(basePath, gfKey) {
    // Always recalculate posts based on current anchor
    // Reset unlocked posts before parsing
    window.unlockedSpyInsta = [];
    window.unlockedSpySlut = [];

    this.basePath = basePath;
    this.gfKey = gfKey || 'gf';
    this.conversations = [];
    this.conversationsByKey = {};
    this.parsedFiles = [];
    this.nameToKey = {};
    this.keyToName = {};
    this.characters = {};

    await this.loadCharacters();
    await this.loadConversationsFromStart();

    this.dataLoaded = true;
  },

  /**
   * Initialize SpyMessenger
   */
  async init(basePath, container, gfKey) {
    this.container = container;
    this.viewMode = 'contacts';
    this.currentConversation = null;
    this.selectedKey = null;

    // Reset lightbox (remove old one if exists)
    if (this.lightboxEl && this.lightboxEl.parentNode) {
      this.lightboxEl.parentNode.removeChild(this.lightboxEl);
    }
    this.lightboxEl = null;
    this.lightboxOpen = false;

    // Reset virtual scroll
    this.resetVirtualScroll();

    // Element references (set by renderMessengerLayout)
    this.contactsListEl = null;
    this.chatHeaderEl = null;
    this.chatMessagesEl = null;
    this.contactsPaneEl = null;

    // Load data if not already preloaded
    if (!this.dataLoaded || this.basePath !== basePath) {
      await this.preloadData(basePath, gfKey);
    }

    this.renderMessengerLayout();
  },

  /**
   * Load characters from spy/messenger/characters/characters.txt
   * Same format as MC's Messenger
   */
  async loadCharacters() {
    this.characters = {};
    this.nameToKey = {};
    this.keyToName = {};
    const url = `${this.basePath}/characters/characters.txt`;

    try {
      const res = await fetch(url);
      if (!res.ok) return;

      const txt = await res.text();
      const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

      for (const line of lines) {
        // Format: Name "DisplayName" (avatar.png) = key
        // or: Name (avatar.png) = key
        const matchWithQuotes = line.match(/^(.+?)\s+"(.+?)"\s*\((.+?)\)\s*=\s*(\S+)$/);
        const matchSimple = line.match(/^(.+?)\s*\((.+?)\)\s*=\s*(\S+)$/);

        if (matchWithQuotes) {
          const fullName = matchWithQuotes[1].trim();
          const displayName = matchWithQuotes[2].trim();
          const avatar = matchWithQuotes[3].trim();
          const key = matchWithQuotes[4].trim().toLowerCase();

          this.characters[key] = {
            name: displayName,
            avatar: `${this.basePath}/characters/avatar/${avatar}`,
            key
          };
          // Map both full name and key to the key
          this.nameToKey[fullName.toLowerCase()] = key;
          this.nameToKey[key] = key;
          // Reverse mapping for display
          this.keyToName[key] = displayName;
        } else if (matchSimple) {
          const name = matchSimple[1].trim();
          const avatar = matchSimple[2].trim();
          const key = matchSimple[3].trim().toLowerCase();

          this.characters[key] = {
            name,
            avatar: `${this.basePath}/characters/avatar/${avatar}`,
            key
          };
          // Map both name and key to the key
          this.nameToKey[name.toLowerCase()] = key;
          this.nameToKey[key] = key;
          // Reverse mapping for display
          this.keyToName[key] = name;
        }
      }
    } catch (e) {
      // spy/messenger/characters/ might not exist, that's ok
    }
  },

  /**
   * Resolve a name/abbreviation to the normalized key
   */
  resolveKey(rawKey) {
    const lower = rawKey.toLowerCase();
    if (lower === this.gfKey) return this.gfKey;
    if (this.nameToKey && this.nameToKey[lower]) {
      return this.nameToKey[lower];
    }
    return lower;
  },

  /**
   * Load conversations starting from start.txt, following $talks
   * Uses same format as MC's Messenger: "key : message"
   * Supports groups (comma-separated names) and media ($pics, $vids, $audio)
   */
  async loadConversationsFromStart() {
    const filesToParse = ['start.txt'];
    const currentAnchor = window.getSpyAnchor ? window.getSpyAnchor() : 0;
    let fileIndex = 0;
    let stopParsing = false;

    // If anchor is 0, don't parse any content (SpyApp is unlocked but empty)
    // Content before $spy_anchor_1 requires currentAnchor >= 1
    if (currentAnchor === 0) {
      return;
    }

    while (fileIndex < filesToParse.length && !stopParsing) {
      const filename = filesToParse[fileIndex];

      if (this.parsedFiles.includes(filename)) {
        fileIndex++;
        continue;
      }

      const url = `${this.basePath}/talks/${filename}`;

      try {
        // Use line-level merge for translations (like MC's Messenger)
        let txt;
        if (window.Translations && window.Translations.fetchMergedContent) {
          txt = await window.Translations.fetchMergedContent(url);
        } else {
          const res = await fetch(url);
          txt = res.ok ? await res.text() : null;
        }

        if (txt === null) {
          fileIndex++;
          continue;
        }

        const lines = txt.split(/\r?\n/);

        // Extract parent directory for relative media paths
        const parentDir = filename.includes('/') ? filename.substring(0, filename.lastIndexOf('/')) : '';

        let contactKey = null;
        let isGroup = false;
        let participants = [];
        let i = 0;

        // First line is the contact name or group (not a message)
        if (lines.length > 0) {
          const firstLine = lines[0].trim();
          if (firstLine && !firstLine.startsWith('$')) {
            // Check if it's a message (contains ":" with text after)
            const msgMatch = firstLine.match(/^([^:]+)\s*:\s*(.+)$/);
            if (!msgMatch) {
              // Check if it's a group (contains comma)
              if (firstLine.includes(',')) {
                isGroup = true;
                const names = firstLine.split(',').map(n => n.trim()).filter(Boolean);
                for (const name of names) {
                  const key = this.resolveKey(name);
                  // Exclude GF from participants (like MC is excluded in MC's messenger)
                  if (key !== this.gfKey) {
                    participants.push(key);
                  }
                }
                // Group key: sorted participant keys
                contactKey = 'group_' + participants.sort().join('_');
              } else {
                // Single contact
                contactKey = this.resolveKey(firstLine);
              }
              i = 1; // Start parsing from line 2

              // Initialize conversation if needed
              if (!this.conversationsByKey[contactKey]) {
                // Build participant colors map (same as MC)
                const participantColors = {};
                participants.forEach((key, i) => {
                  participantColors[key] = this.groupColors[i % this.groupColors.length];
                });

                this.conversationsByKey[contactKey] = {
                  messages: [],
                  lastActivity: Date.now() - (1000 * fileIndex),
                  isGroup: isGroup,
                  participants: participants,
                  participantColors: participantColors
                };
              }
            }
          }
        }

        // Parse messages
        while (i < lines.length) {
          const line = lines[i];
          const trimmed = line.trim();
          i++;

          if (!trimmed) continue;

          // Check for $spy_anchor_X - stop if anchor >= currentAnchor
          // Content after $spy_anchor_N requires MC to have called $spy_anchor_N+1
          const anchorMatch = trimmed.match(/^\$spy_anchor[_\s]*(\d+)$/i);
          if (anchorMatch) {
            const anchor = parseInt(anchorMatch[1], 10);
            if (anchor >= currentAnchor) {
              stopParsing = true;
              break;
            }
            // Add a separator to mark the boundary between anchor sections
            // This helps users see where "old content" begins when scrolling up
            if (contactKey && this.conversationsByKey[contactKey]) {
              this.conversationsByKey[contactKey].messages.push({
                type: 'separator',
                anchor: anchor
              });
            }
            continue;
          }

          // Check for $talks = filename.txt - add to files to parse
          const talksMatch = trimmed.match(/^\$talks\s*=\s*(.+)$/i);
          if (talksMatch) {
            const nextFile = talksMatch[1].trim();
            if (!filesToParse.includes(nextFile) && !this.parsedFiles.includes(nextFile)) {
              filesToParse.push(nextFile);
            }
            continue;
          }

          // Check for $insta / $slut unlocks (same format as MC)
          const instaMatch = trimmed.match(/^\$insta\s*=\s*(.+)$/i);
          if (instaMatch) {
            if (window.unlockSpyInsta) window.unlockSpyInsta(instaMatch[1].trim());
            continue;
          }

          const slutMatch = trimmed.match(/^\$slut\s*=\s*(.+)$/i);
          if (slutMatch) {
            if (window.unlockSpySlut) window.unlockSpySlut(slutMatch[1].trim());
            continue;
          }

          // Handle $delete (simple) - mark previous message as deleted
          // Note: $delete = XXXX (timed deletion) is disabled in GF's conversations
          if (trimmed === '$delete') {
            const msgs = this.conversationsByKey[contactKey]?.messages;
            if (msgs && msgs.length > 0) {
              msgs[msgs.length - 1].deleted = true;
            }
            continue;
          }

          // Explicitly ignore disabled commands in GF's conversations:
          // - $delete = XXXX (timed deletion)
          // - $choices / $fake.choices (choice system)
          // - $lock (premium locks)
          if (trimmed.match(/^\$delete\s*=\s*\d+$/i)) continue;
          if (trimmed.match(/^\$(fake\.)?choices\s*=/i)) continue;
          if (trimmed.match(/^\$lock\s*=/i)) continue;

          // Skip other $ commands that are not part of messages
          if (trimmed.startsWith('$') && !trimmed.match(/^[^:]+\s*:\s*\$/)) continue;

          // Check for message format: "key : message"
          const msgMatch = trimmed.match(/^([^:]+)\s*:\s*(.+)$/);
          if (msgMatch && contactKey) {
            const senderKey = this.resolveKey(msgMatch[1].trim());
            let text = msgMatch[2].trim();

            // Check for media commands in message text
            const picsMatch = text.match(/^\$pics\s*=\s*(.+)$/i);
            const vidsMatch = text.match(/^\$vids\s*=\s*(.+)$/i);
            const audioMatch = text.match(/^\$audio\s*=\s*(.+)$/i);

            if (picsMatch) {
              // Image message
              this.conversationsByKey[contactKey].messages.push({
                kind: 'image',
                sender: senderKey,
                image: picsMatch[1].trim(),
                parentDir: parentDir
              });
            } else if (vidsMatch) {
              // Video message
              this.conversationsByKey[contactKey].messages.push({
                kind: 'video',
                sender: senderKey,
                video: vidsMatch[1].trim(),
                parentDir: parentDir
              });
            } else if (audioMatch) {
              // Audio message
              this.conversationsByKey[contactKey].messages.push({
                kind: 'audio',
                sender: senderKey,
                audio: audioMatch[1].trim(),
                parentDir: parentDir
              });
            } else {
              // Text message - replace $gf and $mc with actual names
              if (window.customCharacterNames) {
                if (window.customCharacterNames[this.gfKey]) {
                  text = text.replace(/\$gf/gi, window.customCharacterNames[this.gfKey]);
                }
                if (window.customCharacterNames['mc']) {
                  text = text.replace(/\$mc/gi, window.customCharacterNames['mc']);
                }
              }

              this.conversationsByKey[contactKey].messages.push({
                kind: 'text',
                sender: senderKey,
                text: text
              });
            }

            // Update last activity
            this.conversationsByKey[contactKey].lastActivity = Date.now() - (1000 * (filesToParse.length - fileIndex));
          }
        }

        this.parsedFiles.push(filename);
      } catch (e) {
        console.error(`SpyMessenger: Failed to parse ${filename}`, e);
      }

      if (stopParsing) break;
      fileIndex++;
    }

    // Build conversations list from conversationsByKey
    this.conversations = [];
    for (const key of Object.keys(this.conversationsByKey)) {
      const convData = this.conversationsByKey[key];
      if (convData.messages.length > 0) {
        const char = this.characters[key];
        this.conversations.push({
          key,
          name: char ? char.name : key,
          avatar: char ? char.avatar : '',
          messages: convData.messages,
          lastActivity: convData.lastActivity,
          isGroup: convData.isGroup || false,
          participants: convData.participants || [],
          participantColors: convData.participantColors || {}
        });
      }
    }

    // Sort by most recent activity (higher = more recent = top)
    this.conversations.sort((a, b) => b.lastActivity - a.lastActivity);
  },

  /**
   * Render the full Messenger layout (identical to MC's Messenger)
   */
  renderMessengerLayout() {
    if (!this.container) return;

    // Create the same structure as MC's Messenger
    this.container.innerHTML = `
      <div id="spy-messenger-app" class="spy-messenger-app">
        <div class="ms-header" data-i18n="app.messenger">Messenger</div>
        <div class="ms-layout">
          <aside class="ms-contacts">
            <div class="ms-contacts-title" data-i18n="messenger.contacts">Contacts</div>
            <div class="ms-contacts-list" id="spyMsContactsList"></div>
          </aside>
          <section class="ms-chat">
            <div class="ms-chat-header" id="spyMsChatHeader">
              <div class="ms-placeholder" data-i18n="messenger.selectcontact">Select a contact.</div>
            </div>
            <div class="ms-chat-messages" id="spyMsChatMessages">
              <div class="ms-placeholder" data-i18n="messenger.selectcontact.long">
                Select a contact on the left to view the conversation.
              </div>
            </div>
          </section>
        </div>
      </div>
    `;

    // Store references
    this.contactsListEl = this.container.querySelector('#spyMsContactsList');
    this.chatHeaderEl = this.container.querySelector('#spyMsChatHeader');
    this.chatMessagesEl = this.container.querySelector('#spyMsChatMessages');
    this.contactsPaneEl = this.container.querySelector('.ms-contacts');

    // Create toggle zone for contacts (same as MC)
    if (this.contactsPaneEl && !this.contactsPaneEl.querySelector('.ms-contacts-toggle-zone')) {
      const toggleZone = document.createElement('div');
      toggleZone.className = 'ms-contacts-toggle-zone';
      this.contactsPaneEl.appendChild(toggleZone);
      toggleZone.addEventListener('click', (e) => {
        e.stopPropagation();
        this.contactsPaneEl.classList.toggle('ms-contacts--expanded');
      });
    }

    this.renderContactsList();

    // Apply translations
    if (window.Translations && window.Translations.updateDOM) {
      window.Translations.updateDOM();
    }

    // Auto-select the first (most recent) conversation
    if (this.conversations.length > 0) {
      this.selectConversation(this.conversations[0].key);
    }
  },

  /**
   * Render contacts list (identical to MC's Messenger)
   */
  renderContactsList() {
    if (!this.contactsListEl) return;

    this.viewMode = 'contacts';
    let html = '';

    if (this.conversations.length === 0) {
      html = '<div class="ms-placeholder">No conversations</div>';
    } else {
      // Contacts sorted by recent activity
      for (const conv of this.conversations) {
        const isActive = this.selectedKey === conv.key;
        let avatarHtml;

        if (conv.isGroup && conv.participants && conv.participants.length > 0) {
          // Group: generate pizza avatar with initials
          avatarHtml = `<div class="ms-contact-avatar ms-contact-avatar--group">${this.generateGroupAvatarSVG(conv.participants)}</div>`;
        } else {
          // Single contact: use avatar image
          avatarHtml = `<div class="ms-contact-avatar"><img src="${conv.avatar}" alt=""></div>`;
        }

        html += `
          <div class="ms-contact ${isActive ? 'ms-contact--active' : ''}" data-key="${conv.key}">
            ${avatarHtml}
            <span class="ms-contact-name">${conv.isGroup ? this.getGroupName(conv.participants) : conv.name}</span>
          </div>
        `;
      }
    }

    this.contactsListEl.innerHTML = html;

    // Bind click events
    const contacts = this.contactsListEl.querySelectorAll('.ms-contact');
    contacts.forEach(contact => {
      contact.addEventListener('click', () => {
        const key = contact.dataset.key;
        this.selectConversation(key);
      });
    });
  },

  /**
   * Get group name from participants
   */
  getGroupName(participants) {
    if (!participants || participants.length === 0) return 'Group';
    return participants.map(key => this.keyToName[key] || key).join(', ');
  },

  /**
   * Select a conversation (show in chat panel)
   */
  selectConversation(key) {
    this.selectedKey = key;

    const conv = this.conversations.find(c => c.key === key);
    if (!conv) return;

    const messages = conv.messages || [];

    this.currentConversation = conv;
    this.renderContactsList(); // Update selection highlight
    this.renderChatHeader(conv);
    this.renderChatMessages(messages);
  },

  /**
   * Render chat header (identical to MC's Messenger)
   * No avatar in header, name(s) on left, colors for groups
   */
  renderChatHeader(conv) {
    if (!this.chatHeaderEl) return;

    let nameHtml;

    if (conv.isGroup && conv.participants && conv.participants.length > 0) {
      // For groups: each name with its color
      nameHtml = conv.participants
        .map((key, i) => {
          const name = this.keyToName[key] || key;
          const color = this.groupColors[i % this.groupColors.length];
          return `<span style="color: ${color}">${this.escapeHtml(name)}</span>`;
        })
        .join('<span class="ms-chat-name-separator">, </span>');
    } else {
      // Simple conversation: just the name
      nameHtml = this.escapeHtml(conv.name);
    }

    this.chatHeaderEl.innerHTML = `
      <div class="ms-chat-header-main">
        <div class="ms-chat-info">
          <div class="ms-chat-name">${nameHtml}</div>
        </div>
      </div>
    `;
  },

  /**
   * Render chat messages with virtual scrolling support
   * In spy mode: GF is "mc" (right side, green), others are "npc" (left side, dark)
   * For groups: show avatar and speaker name with color
   */
  renderChatMessages(messages) {
    if (!this.chatMessagesEl) return;

    const conv = this.currentConversation;
    if (!conv) return;

    if (messages.length === 0) {
      this.chatMessagesEl.innerHTML = '<div class="ms-placeholder">No messages</div>';
      return;
    }

    // Reset virtual scroll for new conversation
    this.resetVirtualScroll();

    // Initialize scroll listener
    this.initVirtualScroll();

    // Check if we need virtual scrolling (100+ messages)
    const useVirtualScroll = messages.length >= 100;

    if (useVirtualScroll) {
      // Calculate heights and set initial range to show last messages
      const cumulativeHeights = this.calculateCumulativeHeights(messages);
      const totalMessages = messages.length;
      const buffer = this.virtualScroll.buffer;

      this.virtualScroll.visibleRange = {
        start: Math.max(0, totalMessages - 50 - buffer),
        end: totalMessages
      };

      this.renderVirtualMessages(conv, messages, cumulativeHeights, true);
    } else {
      // Standard rendering for small conversations
      this.virtualScroll.enabled = false;
      this.renderAllMessages(conv, messages);
    }
  },

  /**
   * Render all messages (for small conversations < 100 messages)
   */
  renderAllMessages(conv, messages) {
    let html = '';
    let lastSender = null;

    for (let i = 0; i < messages.length; i++) {
      html += this.createMessageHtml(messages[i], i, conv, lastSender);
      lastSender = messages[i].sender;
    }

    this.chatMessagesEl.innerHTML = html;
    this.bindMediaEvents();
    this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
  },

  /**
   * Render messages with virtual scrolling (for large conversations)
   */
  renderVirtualMessages(conv, messages, cumulativeHeights, scrollToEnd = false) {
    if (messages.length < 100) {
      this.virtualScroll.enabled = false;
      return false;
    }

    this.virtualScroll.enabled = true;

    const { start, end } = this.virtualScroll.visibleRange;
    const totalHeight = this.virtualScroll.totalHeight;

    // Calculate spacer heights
    const topSpacerHeight = start > 0 ? cumulativeHeights[start] : 0;
    const bottomSpacerHeight = end < messages.length
      ? totalHeight - cumulativeHeights[end]
      : 0;

    // Build HTML
    let html = '';

    // Top spacer
    if (topSpacerHeight > 0) {
      html += `<div class="ms-virtual-spacer ms-virtual-spacer--top" style="height:${topSpacerHeight}px"></div>`;
    }

    // Visible messages
    let lastSender = start > 0 ? messages[start - 1].sender : null;
    for (let i = start; i < end && i < messages.length; i++) {
      html += this.createMessageHtml(messages[i], i, conv, lastSender);
      lastSender = messages[i].sender;
    }

    // Bottom spacer
    if (bottomSpacerHeight > 0) {
      html += `<div class="ms-virtual-spacer ms-virtual-spacer--bottom" style="height:${bottomSpacerHeight}px"></div>`;
    }

    this.chatMessagesEl.innerHTML = html;
    this.bindMediaEvents();

    if (scrollToEnd) {
      this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
    }

    return true;
  },

  /**
   * Create HTML for a single message
   */
  createMessageHtml(msg, index, conv, previousSender) {
    // Handle separator (anchor boundary)
    if (msg.type === 'separator') {
      const separatorText = window.Translations
        ? window.Translations.get('spy.separator.old')
        : 'Previous content';
      return `<div class="ms-separator" data-anchor="${msg.anchor}"><span class="ms-separator-text">${separatorText}</span></div>`;
    }

    const isGf = msg.sender === this.gfKey;
    const sideClass = isGf ? 'ms-msg--mc' : 'ms-msg--npc';
    const isFirstOfSeries = msg.sender !== previousSender;
    const firstClass = isFirstOfSeries ? 'ms-msg--first' : '';

    // Avatar handling for groups (NPC side only)
    let avatarHtml = '';
    if (conv.isGroup && !isGf) {
      if (isFirstOfSeries) {
        const avatarPath = this.characters[msg.sender] ? this.characters[msg.sender].avatar : '';
        if (avatarPath) {
          avatarHtml = `<div class="ms-msg-avatar"><img src="${avatarPath}" alt="${this.keyToName[msg.sender] || msg.sender}"></div>`;
        }
      } else {
        avatarHtml = `<div class="ms-msg-avatar-spacer"></div>`;
      }
    }

    // Speaker name for groups
    let speakerHtml = '';
    if (conv.isGroup && !isGf && isFirstOfSeries) {
      const speakerName = this.keyToName[msg.sender] || msg.sender;
      const speakerColor = conv.participantColors[msg.sender] || '#ffffff';
      speakerHtml = `<span class="ms-msg-speaker" style="color: ${speakerColor}">${this.escapeHtml(speakerName)}</span>`;
    }

    let bubbleContent = '';
    let bubbleClass = 'ms-msg-bubble';

    // Handle deleted messages
    if (msg.deleted) {
      bubbleClass += ' ms-msg-bubble--deleted';
      bubbleContent = `${speakerHtml}<em>Message deleted</em>`;
      return `<div class="ms-msg ${sideClass} ${firstClass}" data-msg-index="${index}">${avatarHtml}<div class="${bubbleClass}">${bubbleContent}</div></div>`;
    }

    if (msg.kind === 'image') {
      bubbleClass += ' ms-msg-bubble--image';
      const picsBasePath = msg.parentDir
        ? `${this.basePath}/talks/${msg.parentDir}/pics`
        : `${this.basePath}/talks/pics`;
      bubbleContent = `${speakerHtml}<img class="ms-msg-image" src="${picsBasePath}/${msg.image}" alt="Image">`;
    } else if (msg.kind === 'video') {
      bubbleClass += ' ms-msg-bubble--video';
      const vidsBasePath = msg.parentDir
        ? `${this.basePath}/talks/${msg.parentDir}/vids`
        : `${this.basePath}/talks/vids`;
      bubbleContent = `${speakerHtml}<div class="ms-msg-video-container"><video class="ms-msg-video" src="${vidsBasePath}/${msg.video}" muted loop playsinline preload="metadata"></video><div class="ms-msg-video-play-overlay">▶</div></div>`;
    } else if (msg.kind === 'audio') {
      bubbleClass += ' ms-msg-bubble--audio';
      const audioBasePath = msg.parentDir
        ? `${this.basePath}/talks/${msg.parentDir}/audio`
        : `${this.basePath}/talks/audio`;
      bubbleContent = `${speakerHtml}<div class="ms-msg-audio-container"><button class="ms-msg-audio-play ms-msg-audio-play--paused" type="button">▶</button><div class="ms-msg-audio-progress"><div class="ms-msg-audio-progress-bar"></div></div><div class="ms-msg-audio-duration">--:--</div><audio src="${audioBasePath}/${msg.audio}" preload="metadata"></audio></div>`;
    } else {
      bubbleContent = `${speakerHtml}${this.escapeHtml(msg.text || '')}`;
    }

    return `<div class="ms-msg ${sideClass} ${firstClass}" data-msg-index="${index}">${avatarHtml}<div class="${bubbleClass}">${bubbleContent}</div></div>`;
  },

  /**
   * Initialize virtual scroll listener
   */
  initVirtualScroll() {
    if (!this.chatMessagesEl) return;

    // Remove existing listener
    if (this._boundVirtualScroll) {
      this.chatMessagesEl.removeEventListener('scroll', this._boundVirtualScroll);
    }

    this._boundVirtualScroll = this.onVirtualScroll.bind(this);
    this.chatMessagesEl.addEventListener('scroll', this._boundVirtualScroll, { passive: true });
  },

  /**
   * Handle scroll event for virtual scrolling
   */
  onVirtualScroll() {
    if (!this.virtualScroll.enabled) return;
    if (!this.chatMessagesEl || !this.currentConversation) return;

    const messages = this.currentConversation.messages;
    if (!messages || messages.length < 100) return;

    // Debounce
    if (this.virtualScroll.scrollTimeout) {
      clearTimeout(this.virtualScroll.scrollTimeout);
    }

    this.virtualScroll.scrollTimeout = setTimeout(() => {
      this.updateVirtualScroll();
    }, 16);
  },

  /**
   * Update visible range based on scroll position
   */
  updateVirtualScroll() {
    if (!this.chatMessagesEl || !this.currentConversation) return;

    const messages = this.currentConversation.messages;
    if (!messages || messages.length === 0) return;

    const scrollTop = this.chatMessagesEl.scrollTop;
    const containerHeight = this.chatMessagesEl.clientHeight;
    const cumulativeHeights = this.calculateCumulativeHeights(messages);

    const newRange = this.calculateVisibleRange(scrollTop, containerHeight, cumulativeHeights, messages.length);

    // Check if range changed
    const currentRange = this.virtualScroll.visibleRange;
    if (newRange.start === currentRange.start && newRange.end === currentRange.end) {
      return;
    }

    this.virtualScroll.visibleRange = newRange;
    this.renderVirtualMessages(this.currentConversation, messages, cumulativeHeights, false);
  },

  /**
   * Estimate message height
   */
  estimateMessageHeight(msg, index) {
    if (this.virtualScroll.cachedHeights[index] !== undefined) {
      return this.virtualScroll.cachedHeights[index];
    }

    const heights = this.virtualScroll.estimatedHeights;
    let height = heights.spacerMin;

    if (msg.deleted) {
      height += 40;
    } else if (msg.kind === 'image') {
      height += heights.image;
    } else if (msg.kind === 'video') {
      height += heights.video;
    } else if (msg.kind === 'audio') {
      height += heights.audio;
    } else {
      height += heights.text;
    }

    return height;
  },

  /**
   * Calculate cumulative heights for all messages
   */
  calculateCumulativeHeights(messages) {
    const heights = [0];
    let cumulative = 0;

    for (let i = 0; i < messages.length; i++) {
      cumulative += this.estimateMessageHeight(messages[i], i);
      heights.push(cumulative);
    }

    this.virtualScroll.totalHeight = cumulative;
    return heights;
  },

  /**
   * Calculate visible range based on scroll position
   */
  calculateVisibleRange(scrollTop, containerHeight, cumulativeHeights, totalMessages) {
    const buffer = this.virtualScroll.buffer;

    // Binary search to find start index
    let start = 0;
    let end = totalMessages - 1;

    while (start < end) {
      const mid = Math.floor((start + end) / 2);
      if (cumulativeHeights[mid + 1] < scrollTop) {
        start = mid + 1;
      } else {
        end = mid;
      }
    }

    const visibleStart = Math.max(0, start - buffer);

    // Find end index
    const viewportEnd = scrollTop + containerHeight;
    start = 0;
    end = totalMessages - 1;

    while (start < end) {
      const mid = Math.floor((start + end) / 2);
      if (cumulativeHeights[mid] < viewportEnd) {
        start = mid + 1;
      } else {
        end = mid;
      }
    }

    const visibleEnd = Math.min(totalMessages, start + buffer);

    return { start: visibleStart, end: visibleEnd };
  },

  /**
   * Reset virtual scroll state
   */
  resetVirtualScroll() {
    this.virtualScroll.cachedHeights = {};
    this.virtualScroll.visibleRange = { start: 0, end: 50 };
    this.virtualScroll.totalHeight = 0;
    this.virtualScroll.enabled = false;
    if (this.virtualScroll.scrollTimeout) {
      clearTimeout(this.virtualScroll.scrollTimeout);
      this.virtualScroll.scrollTimeout = null;
    }
  },

  /**
   * Bind click events for media (images, videos, audio)
   */
  bindMediaEvents() {
    if (!this.chatMessagesEl) return;

    // Images - click to open lightbox
    const images = this.chatMessagesEl.querySelectorAll('.ms-msg-image');
    images.forEach(img => {
      img.style.cursor = 'pointer';
      img.addEventListener('click', () => {
        this.openLightbox(img.src, 'image');
      });
    });

    // Videos - click on container to open lightbox
    const videoContainers = this.chatMessagesEl.querySelectorAll('.ms-msg-video-container');
    videoContainers.forEach(container => {
      container.style.cursor = 'pointer';
      const video = container.querySelector('.ms-msg-video');
      if (video) {
        container.addEventListener('click', () => {
          this.openLightbox(video.src, 'video');
        });

        // Seek to a better frame for thumbnail (avoid black first frame)
        video.addEventListener('loadedmetadata', () => {
          const duration = video.duration;
          const thumbnailTime = Math.min(0.5, duration * 0.1);
          if (thumbnailTime > 0 && duration > 0) {
            video.currentTime = thumbnailTime;
          }
        });
      }
    });

    // Audio - play/pause functionality
    const audioContainers = this.chatMessagesEl.querySelectorAll('.ms-msg-audio-container');
    audioContainers.forEach(container => {
      const playBtn = container.querySelector('.ms-msg-audio-play');
      const audio = container.querySelector('audio');
      const progressBar = container.querySelector('.ms-msg-audio-progress-bar');
      const durationEl = container.querySelector('.ms-msg-audio-duration');

      if (!audio || !playBtn) return;

      // Update duration when metadata loaded
      audio.addEventListener('loadedmetadata', () => {
        const duration = audio.duration;
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        if (durationEl) {
          durationEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
      });

      // Play/pause button
      playBtn.addEventListener('click', () => {
        if (audio.paused) {
          // Pause all other audios first
          document.querySelectorAll('.ms-msg-audio-container audio').forEach(a => {
            if (a !== audio && !a.paused) {
              a.pause();
              a.closest('.ms-msg-audio-container').querySelector('.ms-msg-audio-play').classList.add('ms-msg-audio-play--paused');
              a.closest('.ms-msg-audio-container').querySelector('.ms-msg-audio-play').innerHTML = '▶';
            }
          });
          audio.volume = this.getMediaVolume();
          if (window.isGlobalMuted && window.isGlobalMuted()) {
            audio.muted = true;
          }
          audio.play();
          playBtn.classList.remove('ms-msg-audio-play--paused');
          playBtn.innerHTML = '❚❚';
        } else {
          audio.pause();
          playBtn.classList.add('ms-msg-audio-play--paused');
          playBtn.innerHTML = '▶';
        }
      });

      // Update progress bar
      audio.addEventListener('timeupdate', () => {
        if (audio.duration && progressBar) {
          const percent = (audio.currentTime / audio.duration) * 100;
          progressBar.style.width = percent + '%';
        }
      });

      // Reset when ended
      audio.addEventListener('ended', () => {
        playBtn.classList.add('ms-msg-audio-play--paused');
        playBtn.innerHTML = '▶';
        if (progressBar) progressBar.style.width = '0%';
      });
    });

    // Group avatars in messages - click to open lightbox
    const msgAvatars = this.chatMessagesEl.querySelectorAll('.ms-msg-avatar img');
    msgAvatars.forEach(img => {
      img.style.cursor = 'pointer';
      img.addEventListener('click', () => {
        this.openLightbox(img.src, 'avatar');
      });
    });
  },

  /**
   * Generates a pizza-shaped SVG for group avatar (same as MC's Messenger)
   * Each participant has their slice with their first letter
   */
  generateGroupAvatarSVG(participants) {
    if (!participants || !participants.length) {
      return '';
    }

    const size = 46;
    const center = size / 2;
    const radius = size / 2;
    const n = Math.min(participants.length, 6); // Max 6 slices
    const anglePerSlice = (2 * Math.PI) / n;

    // Font size adapted to the number of participants
    const fontSizes = { 2: 14, 3: 12, 4: 11, 5: 10, 6: 9 };
    const fontSize = fontSizes[n] || 10;

    // Unique ID for clipPath
    const clipId = `spyCircleClip_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<defs><clipPath id="${clipId}"><circle cx="${center}" cy="${center}" r="${radius}"/></clipPath></defs>`;
    svg += `<g clip-path="url(#${clipId})">`;

    // Draw each slice
    for (let i = 0; i < n; i++) {
      const startAngle = i * anglePerSlice - Math.PI / 2;
      const endAngle = (i + 1) * anglePerSlice - Math.PI / 2;

      const x1 = center + radius * Math.cos(startAngle);
      const y1 = center + radius * Math.sin(startAngle);
      const x2 = center + radius * Math.cos(endAngle);
      const y2 = center + radius * Math.sin(endAngle);

      const largeArc = anglePerSlice > Math.PI ? 1 : 0;
      const pathD = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

      svg += `<path d="${pathD}" fill="#2d3748"/>`;

      // Text position
      const midAngle = startAngle + anglePerSlice / 2;
      const textRadius = radius * 0.55;
      const textX = center + textRadius * Math.cos(midAngle);
      const textY = center + textRadius * Math.sin(midAngle);

      // Participant's letter with color
      const key = participants[i];
      const name = this.keyToName[key] || key;
      const letter = name.charAt(0).toUpperCase();
      const letterColor = this.groupColors[i % this.groupColors.length];

      svg += `<text x="${textX}" y="${textY}" fill="${letterColor}" font-size="${fontSize}" font-weight="700" text-anchor="middle" dominant-baseline="central">${letter}</text>`;
    }

    // Draw separation lines
    for (let i = 0; i < n; i++) {
      const angle = i * anglePerSlice - Math.PI / 2;
      const x = center + radius * Math.cos(angle);
      const y = center + radius * Math.sin(angle);
      svg += `<line x1="${center}" y1="${center}" x2="${x}" y2="${y}" stroke="#4a5568" stroke-width="1"/>`;
    }

    svg += `</g></svg>`;
    return svg;
  },

  /**
   * Escape HTML
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * Create lightbox element (same as MC's Messenger)
   */
  createLightbox() {
    const lightbox = document.createElement('div');
    lightbox.className = 'ms-lightbox';
    lightbox.innerHTML = `
      <div class="ms-lightbox-backdrop"></div>
      <div class="ms-lightbox-content">
        <button class="ms-lightbox-close" type="button" aria-label="Close">&times;</button>
        <img class="ms-lightbox-image" src="" alt="Enlarged image">
        <div class="ms-lightbox-video-wrapper" style="display: none;">
          <video class="ms-lightbox-video" loop playsinline></video>
          <div class="ms-lightbox-progress">
            <div class="ms-lightbox-progress-bar"></div>
          </div>
        </div>
      </div>
    `;

    // Close by clicking on backdrop
    lightbox.querySelector('.ms-lightbox-backdrop').addEventListener('click', () => {
      this.closeLightbox();
    });

    // Close with X button
    lightbox.querySelector('.ms-lightbox-close').addEventListener('click', () => {
      this.closeLightbox();
    });

    // Click on video for play/pause
    const video = lightbox.querySelector('.ms-lightbox-video');
    const progressBar = lightbox.querySelector('.ms-lightbox-progress-bar');
    const progressContainer = lightbox.querySelector('.ms-lightbox-progress');

    video.addEventListener('click', (e) => {
      e.stopPropagation();
      if (video.paused) {
        video.play();
      } else {
        video.pause();
      }
    });

    // Update progress bar during playback
    video.addEventListener('timeupdate', () => {
      if (video.duration) {
        const percent = (video.currentTime / video.duration) * 100;
        progressBar.style.width = percent + '%';
      }
    });

    // Click on progress bar to seek
    progressContainer.addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = progressContainer.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percent = clickX / rect.width;
      video.currentTime = percent * video.duration;
    });

    // Close with Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.lightboxOpen) {
        this.closeLightbox();
      }
    });

    // Add to spy screen container
    const spyScreen = document.getElementById('spyScreen');
    if (spyScreen) {
      spyScreen.appendChild(lightbox);
    } else {
      document.body.appendChild(lightbox);
    }

    this.lightboxEl = lightbox;
  },

  /**
   * Open lightbox with image or video
   */
  openLightbox(src, type = 'image') {
    if (!this.lightboxEl) {
      this.createLightbox();
    }

    const img = this.lightboxEl.querySelector('.ms-lightbox-image');
    const videoWrapper = this.lightboxEl.querySelector('.ms-lightbox-video-wrapper');
    const video = this.lightboxEl.querySelector('.ms-lightbox-video');

    // Remove avatar class if it was present
    img.classList.remove('ms-lightbox-image--avatar');

    if (type === 'video') {
      img.style.display = 'none';
      videoWrapper.style.display = 'block';
      video.src = src;
      video.currentTime = 0;
      video.volume = this.getMediaVolume();
      // Apply global mute if active
      if (window.isGlobalMuted && window.isGlobalMuted()) {
        video.muted = true;
      }
      video.play().catch(err => {});
    } else if (type === 'avatar') {
      videoWrapper.style.display = 'none';
      video.src = '';
      video.pause();
      img.style.display = 'block';
      img.src = src;
      img.classList.add('ms-lightbox-image--avatar');
    } else {
      videoWrapper.style.display = 'none';
      video.src = '';
      video.pause();
      img.style.display = 'block';
      img.src = src;
    }

    this.lightboxEl.classList.add('ms-lightbox--open');
    this.lightboxOpen = true;
    this.lightboxType = type;
  },

  /**
   * Close lightbox
   */
  closeLightbox() {
    if (this.lightboxEl) {
      this.lightboxEl.classList.remove('ms-lightbox--open');
      const video = this.lightboxEl.querySelector('.ms-lightbox-video');
      const progressBar = this.lightboxEl.querySelector('.ms-lightbox-progress-bar');
      if (video) {
        video.pause();
        video.currentTime = 0;
      }
      if (progressBar) {
        progressBar.style.width = '0%';
      }
    }
    this.lightboxOpen = false;
  },

  /**
   * Get media volume from settings
   */
  getMediaVolume() {
    let mediaVolume = 0.5;
    const saved = localStorage.getItem('studioSettings');
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        if (typeof settings.mediaVolume === 'number') {
          mediaVolume = settings.mediaVolume / 100;
        }
      } catch (e) {}
    }
    const generalVolume = window.getGeneralVolume ? window.getGeneralVolume() : 1.0;
    return mediaVolume * generalVolume;
  }
};

// ============================================================
// SPY INSTAPICS - Read-only InstaPics feed
// Uses IDENTICAL HTML structure and CSS classes as MC's InstaPics (ip-*)
// Posts are unlocked via $insta = filename.txt in GF's messenger conversations
// ============================================================

window.SpyInstaPics = {
  container: null,
  basePath: null,
  gfKey: null,
  users: [],
  posts: [],
  filterUser: null,
  userPageStart: 0,
  maxUsersPerPage: 4,

  async init(basePath, container, gfKey) {
    this.basePath = basePath;
    this.container = container;
    this.gfKey = gfKey;
    this.users = [];
    this.posts = [];
    this.filterUser = null;
    this.userPageStart = 0;

    await this.loadData();
    this.mount();
    this.renderUsers();
    this.renderFeed();
    this.attachEvents();
  },

  mount() {
    if (!this.container) return;

    // Use same structure as MC's InstaPics
    this.container.innerHTML = `
      <div id="spy-instapics-app" class="spy-instapics-app">
        <div class="ip-users-row">
          <button class="ip-users-nav ip-users-nav-left" data-dir="left" aria-label="Previous users">‹</button>
          <div class="ip-users"></div>
          <button class="ip-users-nav ip-users-nav-right" data-dir="right" aria-label="Next users">›</button>
        </div>
        <div class="ip-feed"></div>
      </div>
    `;

    // Create modal on the spy screen (like MC attaches to phone-frame)
    const spyScreen = this.container.closest('.spy-app-screen');
    if (spyScreen && !spyScreen.querySelector('.ip-modal')) {
      const modal = document.createElement('div');
      modal.className = 'ip-modal hidden';
      modal.innerHTML = `
        <div class="ip-modal-backdrop"></div>
        <div class="ip-modal-dialog">
          <button class="ip-modal-close" type="button" aria-label="Close">×</button>
          <div class="ip-modal-content"></div>
        </div>
      `;
      spyScreen.appendChild(modal);
    }
  },

  eventsAttached: false,

  attachEvents() {
    if (!this.container) return;
    if (this.eventsAttached) return;
    this.eventsAttached = true;

    const spyScreen = this.container.closest('.spy-app-screen');
    if (!spyScreen) return;

    spyScreen.addEventListener('click', (e) => {
      // Navigation buttons
      const navBtn = e.target.closest('.ip-users-nav');
      if (navBtn) {
        const dir = navBtn.dataset.dir;
        const delta = dir === 'left' ? -1 : 1;
        this.changeUserPage(delta);
        return;
      }

      // User profile buttons
      const userBtn = e.target.closest('.ip-user');
      if (userBtn) {
        const key = userBtn.dataset.user;
        if (key === 'all') {
          this.filterUser = null;
        } else {
          const id = parseInt(key, 10);
          this.filterUser = (this.filterUser === id) ? null : id;
        }
        this.renderFeed();
        this.renderUsers();
        return;
      }

      // See more... (open the modal)
      const moreBtn = e.target.closest('.ip-comments-more');
      if (moreBtn) {
        const postIndex = parseInt(moreBtn.dataset.postIndex, 10);
        this.openPostModal(postIndex);
        return;
      }

      // Click on the image (open the modal)
      const photoBtn = e.target.closest('.ip-photo-clickable');
      if (photoBtn) {
        const postIndex = parseInt(photoBtn.dataset.postIndex, 10);
        this.openPostModal(postIndex);
        return;
      }

      // Click on post avatar (display large)
      const avatarBtn = e.target.closest('.ip-avatar-clickable');
      if (avatarBtn) {
        const avatarUrl = avatarBtn.dataset.avatar;
        if (avatarUrl) {
          this.openAvatarModal(avatarUrl);
        }
        return;
      }

      // Close modal (cross or backdrop)
      const closeBtn = e.target.closest('.ip-modal-close');
      const backdrop = e.target.closest('.ip-modal-backdrop');
      if (closeBtn || backdrop) {
        this.closeModal();
        return;
      }
    });
  },

  getModal() {
    const spyScreen = this.container?.closest('.spy-app-screen');
    return spyScreen?.querySelector('.ip-modal');
  },

  openPostModal(postIndex) {
    const post = this.posts.find(p => p.index === postIndex);
    if (!post) return;

    const user = this.users.find(u => u.id === post.userId);
    if (!user) return;

    const modal = this.getModal();
    const content = modal?.querySelector('.ip-modal-content');
    if (!modal || !content) return;

    if (window.InstaPicsTemplates) {
      content.innerHTML = window.InstaPicsTemplates.fullPostCard(post, user);
    }
    modal.classList.remove('hidden');
  },

  openAvatarModal(avatarUrl) {
    const modal = this.getModal();
    const content = modal?.querySelector('.ip-modal-content');
    if (!modal || !content) return;

    content.innerHTML = `
      <div class="ip-avatar-modal">
        <img class="ip-avatar-large" src="${avatarUrl}" alt="Avatar">
      </div>
    `;
    modal.classList.remove('hidden');
  },

  closeModal() {
    const modal = this.getModal();
    if (modal) {
      modal.classList.add('hidden');
    }
  },

  changeUserPage(delta) {
    const maxStart = Math.max(0, this.users.length - this.maxUsersPerPage);
    this.userPageStart = Math.min(maxStart, Math.max(0, this.userPageStart + delta));
    this.renderUsers();
  },

  async loadData() {
    try {
      const [users, posts] = await Promise.all([
        this.loadCharacters(),
        this.loadPosts()
      ]);

      // Keep only users who have at least one post
      const usedNames = new Set(posts.map(p => p.authorName));
      this.users = users.filter(u => usedNames.has(u.name));

      const nameToId = new Map(this.users.map(u => [u.name, u.id]));

      // Attach each post to the user id
      this.posts = posts
        .filter(p => nameToId.has(p.authorName))
        .map(p => ({
          ...p,
          userId: nameToId.get(p.authorName)
        }));

      // Sort by most recent (highest index first)
      this.posts.sort((a, b) => b.index - a.index);
    } catch (e) {
      console.error('SpyInstaPics: Failed to load data', e);
    }
  },

  async loadCharacters() {
    const url = `${this.basePath}/characters/characters.txt`;
    const users = [];

    try {
      const res = await fetch(url);
      if (!res.ok) return users;

      const txt = await res.text();
      const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

      let id = 1;
      for (const line of lines) {
        const match = line.match(/^(.+?)\s*\((.+?)\)\s*$/);
        if (!match) continue;

        const name = match[1].trim();
        const file = match[2].trim();

        users.push({
          id: id++,
          name,
          avatar: `${this.basePath}/characters/avatar/${file}`
        });
      }
    } catch (e) {
      console.error('SpyInstaPics: Failed to load characters', e);
    }

    return users;
  },

  async loadPosts() {
    const posts = [];

    // Get list of unlocked posts
    const unlockedPosts = window.getUnlockedSpyInsta ? window.getUnlockedSpyInsta() : [];

    if (unlockedPosts.length === 0) {
      return posts;
    }

    // Load each unlocked post (supports subfolders like "chapter1/1.txt")
    for (let i = 0; i < unlockedPosts.length; i++) {
      const filePath = unlockedPosts[i];
      const url = `${this.basePath}/posts/${filePath}`;

      try {
        // Use line-level merge for translations (like MC's InstaPics)
        let content;
        if (window.Translations && window.Translations.fetchMergedContent) {
          content = await window.Translations.fetchMergedContent(url);
        } else {
          const res = await fetch(url);
          content = res.ok ? await res.text() : null;
        }

        if (content === null) continue;

        const parentDir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
        const parsed = this.parsePost(content, i + 1, parentDir);
        if (parsed) posts.push(parsed);
      } catch (e) {
        console.error(`SpyInstaPics: Failed to load post ${filePath}`, e);
      }
    }

    return posts;
  },

  parsePost(content, index, parentDir = '') {
    const lines = content.split(/\r?\n/);
    if (!lines.length) return null;

    const authorName = (lines[0] || '').trim();
    if (!authorName) return null;

    const post = {
      index,
      authorName,
      image: null,
      text: '',
      likes: 0,
      gfLiked: false,
      comments: [],
      commentCount: 0
    };

    let inComments = false;
    let lastRoot = null;
    let lastReply = null;

    const imagesBasePath = parentDir
      ? `${this.basePath}/posts/${parentDir}/images`
      : `${this.basePath}/posts/images`;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (!inComments) {
        const lower = line.toLowerCase();

        if (lower.startsWith('image')) {
          const after = line.split(':')[1];
          if (after) {
            const file = after.trim();
            if (file) {
              post.image = `${imagesBasePath}/${file}`;
            }
          }
        } else if (lower.startsWith('text')) {
          const after = line.split(':')[1];
          if (after) {
            post.text = after.trim();
          }
        } else if (lower.startsWith('like')) {
          const after = line.split(':')[1];
          if (after) {
            const likesValue = after.trim();
            // Check for "(liked)" marker - means GF liked this post
            if (likesValue.toLowerCase().includes('(liked)')) {
              post.gfLiked = true;
              // Extract base count before "(liked)"
              const baseCount = parseInt(likesValue, 10);
              post.likes = (!Number.isNaN(baseCount) ? baseCount : 0) + 1;
            } else {
              const n = parseInt(likesValue, 10);
              if (!Number.isNaN(n)) {
                post.likes = n;
              }
            }
          }
        } else if (lower.startsWith('comments')) {
          inComments = true;
        }
      } else {
        // Comment parsing (same format as MC's InstaPics)
        const match = line.match(/^(.+?)(?:\s+(\d+))?(?:\s+"(comments\.replied|replied\.replied)")?\s*=\s*(.+)$/);
        if (!match) continue;

        const rawAuthor = match[1].trim();
        const likesRaw = match[2] ? match[2].trim() : null;
        const tag = match[3] ? match[3].trim() : null;
        const text = match[4].trim();

        if (!rawAuthor || !text) continue;

        const likeCount = likesRaw ? parseInt(likesRaw, 10) || 0 : 0;
        post.commentCount++;

        if (!tag) {
          const comment = { author: rawAuthor, text, likes: likeCount, replies: [] };
          post.comments.push(comment);
          lastRoot = comment;
          lastReply = null;
        } else if (tag === 'comments.replied') {
          const reply = { author: rawAuthor, text, likes: likeCount, replies: [] };
          if (lastRoot) {
            lastRoot.replies.push(reply);
            lastReply = reply;
          } else {
            post.comments.push(reply);
            lastRoot = reply;
            lastReply = null;
          }
        } else if (tag === 'replied.replied') {
          const subReply = { author: rawAuthor, text, likes: likeCount, replies: [] };
          if (lastReply) {
            lastReply.replies.push(subReply);
          } else if (lastRoot) {
            lastRoot.replies.push(subReply);
          } else {
            post.comments.push(subReply);
          }
        }
      }
    }

    return post;
  },

  renderUsers() {
    if (!this.container) return;
    const ctn = this.container.querySelector('.ip-users');
    if (!ctn) return;

    const totalUsers = this.users.length;
    const maxStart = Math.max(0, totalUsers - this.maxUsersPerPage);
    if (this.userPageStart > maxStart) {
      this.userPageStart = maxStart;
    }
    if (this.userPageStart < 0) {
      this.userPageStart = 0;
    }

    const visibleUsers = this.users.slice(
      this.userPageStart,
      this.userPageStart + this.maxUsersPerPage
    );

    // Use InstaPicsTemplates if available
    let html = '';
    if (window.InstaPicsTemplates) {
      html = window.InstaPicsTemplates.homeButton(this.filterUser === null);
      html += visibleUsers
        .map(u => window.InstaPicsTemplates.userBubble(u, this.filterUser === u.id))
        .join('');
    } else {
      // Fallback
      const homeActive = this.filterUser === null ? 'ip-user--active' : '';
      html = `<button class="ip-user ip-user-home ${homeActive}" data-user="all">
        <img src="assets/instapics/home_insta.svg" alt="">
        <span>Home</span>
      </button>`;
      html += visibleUsers.map(u => {
        const active = this.filterUser === u.id ? 'ip-user--active' : '';
        return `<button class="ip-user ${active}" data-user="${u.id}">
          <img src="${u.avatar}" alt="">
          <span>${u.name}</span>
        </button>`;
      }).join('');
    }

    ctn.innerHTML = html;

    // Update navigation buttons
    const leftBtn = this.container.querySelector('.ip-users-nav-left');
    const rightBtn = this.container.querySelector('.ip-users-nav-right');
    if (leftBtn) leftBtn.disabled = (this.userPageStart === 0);
    if (rightBtn) rightBtn.disabled = (this.userPageStart >= maxStart);
  },

  renderFeed() {
    if (!this.container) return;
    const ctn = this.container.querySelector('.ip-feed');
    if (!ctn) return;

    let posts = this.posts.slice();
    posts.sort((a, b) => b.index - a.index);

    if (this.filterUser) {
      posts = posts.filter(p => p.userId === this.filterUser);
    }

    if (posts.length === 0) {
      ctn.innerHTML = `<div class="ip-empty-message">${window.t ? window.t('instapics.noposts') : 'No posts yet'}</div>`;
      return;
    }

    // Use InstaPicsTemplates if available
    if (window.InstaPicsTemplates) {
      ctn.innerHTML = posts.map(post => {
        const user = this.users.find(u => u.id === post.userId);
        if (!user) return '';
        return window.InstaPicsTemplates.postCard(post, user);
      }).join('');
    } else {
      // Fallback simple render
      ctn.innerHTML = posts.map(post => {
        const user = this.users.find(u => u.id === post.userId);
        if (!user) return '';
        return `
          <article class="ip-post">
            <header>
              <img class="avatar" src="${user.avatar}" alt="">
              <span>${user.name}</span>
            </header>
            ${post.image ? `<div class="ip-photo-container"><img class="photo" src="${post.image}" alt=""></div>` : ''}
            <footer>
              ${post.text ? `<p class="caption">${post.text}</p>` : ''}
            </footer>
          </article>
        `;
      }).join('');
    }
  }
};

// ============================================================
// SPY ONLYSLUT - Read-only OnlySlut feed
// Uses IDENTICAL HTML structure and CSS classes as MC's OnlySlut (os-*)
// Posts are unlocked via $slut = filename.txt in GF's messenger conversations
// ============================================================

window.SpyOnlySlut = {
  container: null,
  basePath: null,
  gfKey: null,
  users: [],
  posts: [],
  filterUser: null,

  async init(basePath, container, gfKey) {
    this.basePath = basePath;
    this.container = container;
    this.gfKey = gfKey;
    this.users = [];
    this.posts = [];
    this.filterUser = null;

    await this.loadData();
    this.mount();
    this.renderUsers();
    this.renderFeed();
    this.attachEvents();
  },

  mount() {
    if (!this.container) return;

    // Use same structure as MC's OnlySlut
    this.container.innerHTML = `
      <div id="spy-onlyslut-app" class="spy-onlyslut-app">
        <header class="os-header">
          <img class="os-logo" src="assets/apps_icon/onlyslut.png" alt="OnlySlut">
        </header>
        <div class="os-layout">
          <aside class="os-sidebar">
            <div class="os-users"></div>
          </aside>
          <main class="os-content">
            <div class="os-feed"></div>
          </main>
        </div>
      </div>
    `;

    // Create modal on the spy screen (like MC attaches to phone-frame)
    const spyScreen = this.container.closest('.spy-app-screen');
    if (spyScreen && !spyScreen.querySelector('.os-modal')) {
      const modal = document.createElement('div');
      modal.className = 'os-modal hidden';
      modal.innerHTML = `
        <div class="os-modal-backdrop"></div>
        <div class="os-modal-dialog">
          <button class="os-modal-close" type="button" aria-label="Close">×</button>
          <div class="os-modal-content"></div>
        </div>
      `;
      spyScreen.appendChild(modal);
    }
  },

  eventsAttached: false,

  attachEvents() {
    if (!this.container) return;
    if (this.eventsAttached) return;
    this.eventsAttached = true;

    const spyScreen = this.container.closest('.spy-app-screen');
    if (!spyScreen) return;

    spyScreen.addEventListener('click', (e) => {
      // User profile buttons
      const userBtn = e.target.closest('.os-user');
      if (userBtn) {
        const key = userBtn.dataset.user;
        if (key === 'all') {
          this.filterUser = null;
        } else {
          const id = parseInt(key, 10);
          this.filterUser = (this.filterUser === id) ? null : id;
        }
        this.renderFeed();
        this.renderUsers();
        return;
      }

      // See more... (open the modal)
      const moreBtn = e.target.closest('.os-comments-more');
      if (moreBtn) {
        const postIndex = parseInt(moreBtn.dataset.postIndex, 10);
        this.openPostModal(postIndex);
        return;
      }

      // Click on the image (open the modal)
      const photoBtn = e.target.closest('.os-photo-clickable');
      if (photoBtn) {
        const postIndex = parseInt(photoBtn.dataset.postIndex, 10);
        this.openPostModal(postIndex);
        return;
      }

      // Click on post avatar (display large)
      const avatarBtn = e.target.closest('.os-avatar-clickable');
      if (avatarBtn) {
        const avatarUrl = avatarBtn.dataset.avatar;
        if (avatarUrl) {
          this.openAvatarModal(avatarUrl);
        }
        return;
      }

      // Close modal (cross or backdrop)
      const closeBtn = e.target.closest('.os-modal-close');
      const backdrop = e.target.closest('.os-modal-backdrop');
      if (closeBtn || backdrop) {
        this.closeModal();
        return;
      }
    });
  },

  getModal() {
    const spyScreen = this.container?.closest('.spy-app-screen');
    return spyScreen?.querySelector('.os-modal');
  },

  openPostModal(postIndex) {
    const post = this.posts.find(p => p.index === postIndex);
    if (!post) return;

    const user = this.users.find(u => u.id === post.userId);
    if (!user) return;

    const modal = this.getModal();
    const content = modal?.querySelector('.os-modal-content');
    if (!modal || !content) return;

    if (window.OnlySlutTemplates) {
      content.innerHTML = window.OnlySlutTemplates.fullPostCard(post, user);
    }
    modal.classList.remove('hidden');
  },

  openAvatarModal(avatarUrl) {
    const modal = this.getModal();
    const content = modal?.querySelector('.os-modal-content');
    if (!modal || !content) return;

    content.innerHTML = `
      <div class="os-avatar-modal">
        <img class="os-avatar-large" src="${avatarUrl}" alt="Avatar">
      </div>
    `;
    modal.classList.remove('hidden');
  },

  closeModal() {
    const modal = this.getModal();
    if (modal) {
      modal.classList.add('hidden');
    }
  },

  async loadData() {
    try {
      const [users, posts] = await Promise.all([
        this.loadCharacters(),
        this.loadPosts()
      ]);

      // Keep only users who have at least one post
      const usedNames = new Set(posts.map(p => p.authorName));
      this.users = users.filter(u => usedNames.has(u.name));

      const nameToId = new Map(this.users.map(u => [u.name, u.id]));

      // Attach each post to the user id
      this.posts = posts
        .filter(p => nameToId.has(p.authorName))
        .map(p => ({
          ...p,
          userId: nameToId.get(p.authorName)
        }));

      // Sort by most recent (highest index first)
      this.posts.sort((a, b) => b.index - a.index);
    } catch (e) {
      console.error('SpyOnlySlut: Failed to load data', e);
    }
  },

  async loadCharacters() {
    const url = `${this.basePath}/characters/characters.txt`;
    const users = [];

    try {
      const res = await fetch(url);
      if (!res.ok) return users;

      const txt = await res.text();
      const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

      let id = 1;
      for (const line of lines) {
        const match = line.match(/^(.+?)\s*\((.+?)\)\s*$/);
        if (!match) continue;

        const name = match[1].trim();
        const file = match[2].trim();

        users.push({
          id: id++,
          name,
          avatar: `${this.basePath}/characters/avatar/${file}`
        });
      }
    } catch (e) {
      console.error('SpyOnlySlut: Failed to load characters', e);
    }

    return users;
  },

  async loadPosts() {
    const posts = [];

    // Get list of unlocked posts
    const unlockedPosts = window.getUnlockedSpySlut ? window.getUnlockedSpySlut() : [];

    if (unlockedPosts.length === 0) {
      return posts;
    }

    // Load each unlocked post (supports subfolders like "chapter1/1.txt")
    for (let i = 0; i < unlockedPosts.length; i++) {
      const filePath = unlockedPosts[i];
      const url = `${this.basePath}/posts/${filePath}`;

      try {
        // Use line-level merge for translations (like MC's OnlySlut)
        let content;
        if (window.Translations && window.Translations.fetchMergedContent) {
          content = await window.Translations.fetchMergedContent(url);
        } else {
          const res = await fetch(url);
          content = res.ok ? await res.text() : null;
        }

        if (content === null) continue;

        const parentDir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
        const parsed = this.parsePost(content, i + 1, parentDir);
        if (parsed) posts.push(parsed);
      } catch (e) {
        console.error(`SpyOnlySlut: Failed to load post ${filePath}`, e);
      }
    }

    return posts;
  },

  parsePost(content, index, parentDir = '') {
    const lines = content.split(/\r?\n/);
    if (!lines.length) return null;

    const authorName = (lines[0] || '').trim();
    if (!authorName) return null;

    const post = {
      index,
      authorName,
      image: null,
      text: '',
      likes: 0,
      gfLiked: false,
      comments: [],
      commentCount: 0
    };

    let inComments = false;
    let lastRoot = null;
    let lastReply = null;

    const imagesBasePath = parentDir
      ? `${this.basePath}/posts/${parentDir}/images`
      : `${this.basePath}/posts/images`;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (!inComments) {
        const lower = line.toLowerCase();

        if (lower.startsWith('image')) {
          const after = line.split(':')[1];
          if (after) {
            const file = after.trim();
            if (file) {
              post.image = `${imagesBasePath}/${file}`;
            }
          }
        } else if (lower.startsWith('text')) {
          const after = line.split(':')[1];
          if (after) {
            post.text = after.trim();
          }
        } else if (lower.startsWith('like')) {
          const after = line.split(':')[1];
          if (after) {
            const likesValue = after.trim();
            // Check for "(liked)" marker - means GF liked this post
            if (likesValue.toLowerCase().includes('(liked)')) {
              post.gfLiked = true;
              // Extract base count before "(liked)"
              const baseCount = parseInt(likesValue, 10);
              post.likes = (!Number.isNaN(baseCount) ? baseCount : 0) + 1;
            } else {
              const n = parseInt(likesValue, 10);
              if (!Number.isNaN(n)) {
                post.likes = n;
              }
            }
          }
        } else if (lower.startsWith('comments')) {
          inComments = true;
        }
      } else {
        // Comment parsing (same format as MC's OnlySlut)
        const match = line.match(/^(.+?)(?:\s+(\d+))?(?:\s+"(comments\.replied|replied\.replied)")?\s*=\s*(.+)$/);
        if (!match) continue;

        const rawAuthor = match[1].trim();
        const likesRaw = match[2] ? match[2].trim() : null;
        const tag = match[3] ? match[3].trim() : null;
        const text = match[4].trim();

        if (!rawAuthor || !text) continue;

        const likeCount = likesRaw ? parseInt(likesRaw, 10) || 0 : 0;
        post.commentCount++;

        if (!tag) {
          const comment = { author: rawAuthor, text, likes: likeCount, replies: [] };
          post.comments.push(comment);
          lastRoot = comment;
          lastReply = null;
        } else if (tag === 'comments.replied') {
          const reply = { author: rawAuthor, text, likes: likeCount, replies: [] };
          if (lastRoot) {
            lastRoot.replies.push(reply);
            lastReply = reply;
          } else {
            post.comments.push(reply);
            lastRoot = reply;
            lastReply = null;
          }
        } else if (tag === 'replied.replied') {
          const subReply = { author: rawAuthor, text, likes: likeCount, replies: [] };
          if (lastReply) {
            lastReply.replies.push(subReply);
          } else if (lastRoot) {
            lastRoot.replies.push(subReply);
          } else {
            post.comments.push(subReply);
          }
        }
      }
    }

    return post;
  },

  renderUsers() {
    if (!this.container) return;
    const ctn = this.container.querySelector('.os-users');
    if (!ctn) return;

    // Use OnlySlutTemplates if available
    let html = '';
    if (window.OnlySlutTemplates) {
      html = window.OnlySlutTemplates.homeButton(this.filterUser === null);
      html += this.users
        .map(u => window.OnlySlutTemplates.userBubble(u, this.filterUser === u.id))
        .join('');
    } else {
      // Fallback
      const homeActive = this.filterUser === null ? 'os-user--active' : '';
      html = `<button class="os-user os-user-home ${homeActive}" data-user="all">
        <div class="os-user-avatar">
          <img src="assets/onlyslut/home.svg" alt="">
        </div>
        <span class="os-user-name">Home</span>
      </button>`;
      html += this.users.map(u => {
        const active = this.filterUser === u.id ? 'os-user--active' : '';
        return `<button class="os-user ${active}" data-user="${u.id}">
          <div class="os-user-avatar">
            <img src="${u.avatar}" alt="">
          </div>
          <span class="os-user-name">${u.name}</span>
        </button>`;
      }).join('');
    }

    ctn.innerHTML = html;
  },

  renderFeed() {
    if (!this.container) return;
    const ctn = this.container.querySelector('.os-feed');
    if (!ctn) return;

    let posts = this.posts.slice();
    posts.sort((a, b) => b.index - a.index);

    if (this.filterUser) {
      posts = posts.filter(p => p.userId === this.filterUser);
    }

    if (posts.length === 0) {
      ctn.innerHTML = `<div class="os-empty-message">${window.t ? window.t('instapics.noposts') : 'No posts yet'}</div>`;
      return;
    }

    // Use OnlySlutTemplates if available
    if (window.OnlySlutTemplates) {
      ctn.innerHTML = posts.map(post => {
        const user = this.users.find(u => u.id === post.userId);
        if (!user) return '';
        return window.OnlySlutTemplates.postCard(post, user);
      }).join('');
    } else {
      // Fallback simple render
      ctn.innerHTML = posts.map(post => {
        const user = this.users.find(u => u.id === post.userId);
        if (!user) return '';
        return `
          <article class="os-post">
            <header>
              <img class="avatar" src="${user.avatar}" alt="">
              <span>${user.name}</span>
            </header>
            ${post.image ? `<div class="os-photo-container"><img class="photo" src="${post.image}" alt=""></div>` : ''}
            <footer>
              ${post.text ? `<p class="caption">${post.text}</p>` : ''}
            </footer>
          </article>
        `;
      }).join('');
    }
  }
};

// ============================================================
// SPY GALLERY - Media from GF's spy messenger conversations
// Same structure as MC's Gallery but for GF's phone
// ============================================================

window.SpyGallery = {
  container: null,
  basePath: null,
  gfKey: null,
  images: [],
  videos: [],
  filterUser: null,
  viewMode: 'images',
  modalEl: null,

  async init(basePath, container, gfKey) {
    this.basePath = basePath;
    this.container = container;
    this.gfKey = gfKey || 'gf';
    this.images = [];
    this.videos = [];
    this.filterUser = null;
    this.viewMode = 'images';

    // Clean up old modal if exists
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
    }
    this.modalEl = null;

    this.loadMedia();
    this.mount();
    this.render();
  },

  /**
   * Load images and videos from SpyMessenger conversations
   */
  loadMedia() {
    this.images = [];
    this.videos = [];

    if (!window.SpyMessenger || !window.SpyMessenger.conversationsByKey) {
      return;
    }

    const conversationsByKey = window.SpyMessenger.conversationsByKey;

    for (const contactKey of Object.keys(conversationsByKey)) {
      const conv = conversationsByKey[contactKey];

      for (const msg of conv.messages || []) {
        // In Spy mode: gfKey is "me" (the owner of the phone)
        const isMe = msg.sender === this.gfKey;

        const senderInfo = {
          sender: isMe ? 'me' : msg.sender,
          senderKey: msg.sender,
          contactKey: contactKey,
          isMe: isMe,
          parentDir: msg.parentDir || ''
        };

        // Images
        if (msg.kind === 'image' && msg.image) {
          const picsBasePath = msg.parentDir
            ? `${window.SpyMessenger.basePath}/talks/${msg.parentDir}/pics`
            : `${window.SpyMessenger.basePath}/talks/pics`;
          this.images.push({
            src: `${picsBasePath}/${msg.image}`,
            ...senderInfo
          });
        }

        // Videos
        if (msg.kind === 'video' && msg.video) {
          const vidsBasePath = msg.parentDir
            ? `${window.SpyMessenger.basePath}/talks/${msg.parentDir}/vids`
            : `${window.SpyMessenger.basePath}/talks/vids`;
          this.videos.push({
            src: `${vidsBasePath}/${msg.video}`,
            ...senderInfo
          });
        }
      }
    }
  },

  /**
   * Mount the gallery DOM
   */
  mount() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="spy-gallery-app">
        <header class="gallery-header">
          <span class="gallery-title" data-i18n="app.gallery">Gallery</span>
          <span class="gallery-counter">0</span>
        </header>
        <div class="gallery-tabs">
          <button class="gallery-tab gallery-tab--active" data-tab="images" data-i18n="gallery.photos">Photos</button>
          <button class="gallery-tab" data-tab="videos" data-i18n="gallery.videos">Videos</button>
        </div>
        <div class="gallery-filters"></div>
        <main class="gallery-content">
          <div class="gallery-grid"></div>
        </main>
      </div>
    `;

    // Create modal if not exists
    if (!this.modalEl) {
      this.modalEl = document.createElement('div');
      this.modalEl.className = 'gallery-modal hidden';
      this.modalEl.innerHTML = `
        <div class="gallery-modal-backdrop"></div>
        <div class="gallery-modal-content">
          <button class="gallery-modal-close" type="button" aria-label="Close">×</button>
          <img src="" alt="">
          <video controls playsinline style="display: none;"></video>
          <div class="gallery-modal-info"></div>
        </div>
      `;

      const spyScreen = document.getElementById('spyScreen');
      if (spyScreen) {
        spyScreen.appendChild(this.modalEl);
      }
    }

    this.attachEvents();

    // Apply translations
    if (window.Translations && window.Translations.updateDOM) {
      window.Translations.updateDOM();
    }
  },

  /**
   * Attach click events
   */
  attachEvents() {
    if (!this.container) return;

    this.container.addEventListener('click', (e) => {
      // Tab click
      const tabBtn = e.target.closest('.gallery-tab');
      if (tabBtn) {
        const tabValue = tabBtn.dataset.tab;
        if (tabValue && tabValue !== this.viewMode) {
          this.viewMode = tabValue;
          this.filterUser = null;
          this.render();
        }
        return;
      }

      // Filter click
      const filterBtn = e.target.closest('.gallery-filter');
      if (filterBtn) {
        const filterValue = filterBtn.dataset.filter;
        this.filterUser = filterValue === 'all' ? null : filterValue;
        this.render();
        return;
      }

      // Gallery item click
      const galleryItem = e.target.closest('.gallery-item');
      if (galleryItem) {
        const src = galleryItem.dataset.src;
        const info = galleryItem.dataset.info;
        const isVideo = galleryItem.dataset.type === 'video';
        this.openModal(src, info, isVideo);
        return;
      }
    });

    // Modal events
    if (this.modalEl) {
      this.modalEl.addEventListener('click', (e) => {
        if (e.target.closest('.gallery-modal-close') || e.target.closest('.gallery-modal-backdrop')) {
          this.closeModal();
        }
      });
    }

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isModalOpen()) {
        this.closeModal();
        e.preventDefault();
      }
    });
  },

  /**
   * Resolve sender key to display name
   */
  resolveName(key) {
    if (!key) return key;
    if (key === 'me' || key === this.gfKey) {
      return window.t ? window.t('gallery.me') : 'Me';
    }

    // Try SpyMessenger keyToName
    if (window.SpyMessenger && window.SpyMessenger.keyToName) {
      const name = window.SpyMessenger.keyToName[key];
      if (name) return name;
    }

    return key;
  },

  /**
   * Full render
   */
  render() {
    this.renderTabs();
    this.renderFilters();
    this.renderGrid();
    this.updateCounter();
  },

  /**
   * Render tabs
   */
  renderTabs() {
    if (!this.container) return;
    const tabs = this.container.querySelectorAll('.gallery-tab');
    tabs.forEach(tab => {
      const isActive = tab.dataset.tab === this.viewMode;
      tab.classList.toggle('gallery-tab--active', isActive);
    });
  },

  /**
   * Render filters
   */
  renderFilters() {
    if (!this.container) return;
    const filtersEl = this.container.querySelector('.gallery-filters');
    if (!filtersEl) return;

    const dataSource = this.viewMode === 'videos' ? this.videos : this.images;

    // Collect unique users
    const users = new Map();
    users.set('all', window.t ? window.t('gallery.all') : 'All');
    users.set('me', window.t ? window.t('gallery.me') : 'Me');

    for (const item of dataSource) {
      if (!item.isMe && item.sender && item.sender !== 'me') {
        const resolvedName = this.resolveName(item.senderKey || item.sender);
        users.set(item.sender, resolvedName);
      }
    }

    let html = '';
    for (const [key, name] of users) {
      const isActive = (key === 'all' && this.filterUser === null) || (key === this.filterUser);
      const activeClass = isActive ? ' gallery-filter--active' : '';
      html += `<button class="gallery-filter${activeClass}" data-filter="${key}">${name}</button>`;
    }

    filtersEl.innerHTML = html;
  },

  /**
   * Render image/video grid
   */
  renderGrid() {
    if (!this.container) return;

    const contentEl = this.container.querySelector('.gallery-content');
    if (!contentEl) return;

    const filtered = this.getFilteredItems();
    const isVideoMode = this.viewMode === 'videos';
    const emptyMessage = isVideoMode
      ? (window.t ? window.t('gallery.novideos') : 'No videos')
      : (window.t ? window.t('gallery.nophotos') : 'No photos');

    if (filtered.length === 0) {
      contentEl.innerHTML = `<div class="gallery-empty">${emptyMessage}</div>`;
      return;
    }

    let gridEl = contentEl.querySelector('.gallery-grid');
    if (!gridEl) {
      contentEl.innerHTML = '<div class="gallery-grid"></div>';
      gridEl = contentEl.querySelector('.gallery-grid');
    }

    gridEl.innerHTML = filtered.map(item => {
      const senderName = this.resolveName(item.senderKey || item.sender);
      const contactName = this.resolveName(item.contactKey);
      const info = item.isMe
        ? (window.t ? window.t('gallery.sentto', { name: contactName }) : `Sent to ${contactName}`)
        : (window.t ? window.t('gallery.receivedfrom', { name: senderName }) : `From ${senderName}`);

      if (isVideoMode) {
        return `<div class="gallery-item gallery-item--video" data-src="${item.src}" data-info="${info}" data-type="video"><video src="${item.src}" preload="metadata"></video><div class="gallery-item-play">▶</div><div class="gallery-item-overlay">${senderName}</div></div>`;
      } else {
        return `<div class="gallery-item" data-src="${item.src}" data-info="${info}" data-type="image"><img src="${item.src}" alt=""><div class="gallery-item-overlay">${senderName}</div></div>`;
      }
    }).join('');
  },

  /**
   * Get filtered items based on current mode and filter
   */
  getFilteredItems() {
    const dataSource = this.viewMode === 'videos' ? this.videos : this.images;

    if (this.filterUser === null) {
      return dataSource;
    }

    if (this.filterUser === 'me') {
      return dataSource.filter(item => item.isMe);
    }

    return dataSource.filter(item => item.sender === this.filterUser);
  },

  /**
   * Update counter
   */
  updateCounter() {
    if (!this.container) return;
    const counter = this.container.querySelector('.gallery-counter');
    if (counter) {
      counter.textContent = this.getFilteredItems().length;
    }
  },

  /**
   * Open modal
   */
  openModal(src, info, isVideo = false) {
    if (!this.modalEl) return;

    const img = this.modalEl.querySelector('img');
    const video = this.modalEl.querySelector('video');
    const infoDiv = this.modalEl.querySelector('.gallery-modal-info');

    if (isVideo) {
      if (img) img.style.display = 'none';
      if (video) {
        video.style.display = 'block';
        video.src = src;
        video.play();
      }
    } else {
      if (video) {
        video.style.display = 'none';
        video.pause();
        video.src = '';
      }
      if (img) {
        img.style.display = 'block';
        img.src = src;
      }
    }

    if (infoDiv) infoDiv.textContent = info || '';
    this.modalEl.classList.remove('hidden');
  },

  /**
   * Close modal
   */
  closeModal() {
    if (!this.modalEl) return;
    const video = this.modalEl.querySelector('video');
    if (video) {
      video.pause();
      video.src = '';
    }
    this.modalEl.classList.add('hidden');
  },

  /**
   * Check if modal is open
   */
  isModalOpen() {
    return this.modalEl && !this.modalEl.classList.contains('hidden');
  }
};
