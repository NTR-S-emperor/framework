// app.settings/settings.js

window.Settings = {
    root: null,
    eventsAttached: false,
    modalOpen: false,
    currentModal: null,

    // Default settings values
    defaults: {
        language: 'en',
        musicVolume: 20,
        mediaVolume: 30,
        doubleplaySpeed: 500,   // ms between each message in very fast mode (100-1000)
        autoplaySpeed: 1500,    // ms between each message in auto mode (500-5000)
        wallpaper: 'default',
        autoExpandMedia: true,  // Automatically open images/videos in lightbox when received
        showChoiceHints: true   // Show hints on story choices when available
    },

    // Current values (loaded from localStorage)
    values: {},

    /**
     * Initializes the Settings application
     */
    init() {
        this.loadSettings();
        this.mount();
        this.attachEvents();
    },

    /**
     * Loads settings from localStorage
     */
    loadSettings() {
        const saved = localStorage.getItem('studioSettings');
        if (saved) {
            try {
                this.values = { ...this.defaults, ...JSON.parse(saved) };
            } catch (e) {
                this.values = { ...this.defaults };
            }
        } else {
            this.values = { ...this.defaults };
        }
    },

    /**
     * Saves settings to localStorage
     */
    saveSettings() {
        localStorage.setItem('studioSettings', JSON.stringify(this.values));
    },

    /**
     * Gets a setting value
     */
    get(key) {
        return this.values[key] ?? this.defaults[key];
    },

    /**
     * Sets a setting value
     */
    set(key, value) {
        this.values[key] = value;
        this.saveSettings();
    },

    /**
     * Mounts the app's DOM
     */
    mount() {
        if (this.root) return;

        const container = document.getElementById("settingsScreen");
        if (!container) {
            return;
        }

        this.root = document.createElement("div");
        this.root.id = "settings-app";
        this.root.innerHTML = this.renderContent();

        container.appendChild(this.root);

        // Populate language dropdown from translations
        this.populateLanguageDropdown();

        // Initialize slider values
        this.updateSliderValues();

        // Apply translations to Settings content
        if (window.Translations && window.Translations.loaded) {
            window.Translations.updateDOM();
        }

        // Listen for language changes to update translations
        window.addEventListener('languageChanged', () => {
            if (window.Translations) {
                window.Translations.updateDOM();
            }
        });
    },

    /**
     * Renders the content
     */
    renderContent() {
        return `
            <header class="settings-header">
                <span class="settings-title" data-i18n="app.settings">Settings</span>
            </header>

            <main class="settings-content">
                <!-- SYSTEM CATEGORY -->
                <section class="settings-category">
                    <h2 class="settings-category-title" data-i18n="settings.cat.system">SYSTEM</h2>

                    <!-- Language -->
                    <div class="settings-item">
                        <div class="settings-item-label">
                            <span class="settings-item-icon">🌐</span>
                            <span data-i18n="settings.language">Language</span>
                        </div>
                        <div class="settings-item-control">
                            <div class="settings-dropdown" id="settings-language-dropdown">
                                <button class="settings-dropdown-toggle" type="button">
                                    <span class="settings-dropdown-value">English</span>
                                    <span class="settings-dropdown-arrow">▼</span>
                                </button>
                                <div class="settings-dropdown-menu hidden">
                                    <!-- Languages loaded dynamically from system_translations.txt -->
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Background music -->
                    <div class="settings-item">
                        <div class="settings-item-label">
                            <span class="settings-item-icon">🎵</span>
                            <span data-i18n="settings.music">Background music</span>
                        </div>
                        <div class="settings-item-control settings-slider-control">
                            <input type="range" id="settings-music-volume" class="settings-slider" min="0" max="100" value="50">
                            <span class="settings-slider-value" data-for="settings-music-volume">50%</span>
                        </div>
                    </div>

                    <!-- Wallpaper -->
                    <div class="settings-item">
                        <div class="settings-item-label">
                            <span class="settings-item-icon">🖼️</span>
                            <span data-i18n="settings.wallpaper">Wallpaper</span>
                        </div>
                        <div class="settings-item-control">
                            <button id="settings-wallpaper-btn" class="settings-button" data-i18n="settings.wallpaper.choose">Choose</button>
                        </div>
                    </div>

                    <!-- Reset settings -->
                    <div class="settings-item">
                        <div class="settings-item-label">
                            <span class="settings-item-icon">⚙️</span>
                            <span data-i18n="settings.default">Default settings</span>
                        </div>
                        <div class="settings-item-control">
                            <button id="settings-reset-settings-btn" class="settings-button settings-button-secondary" data-i18n="btn.reset">Reset</button>
                        </div>
                    </div>
                </section>

                <!-- MESSENGER CATEGORY -->
                <section class="settings-category">
                    <h2 class="settings-category-title" data-i18n="settings.cat.messenger">MESSENGER</h2>

                    <!-- Media volume -->
                    <div class="settings-item">
                        <div class="settings-item-label">
                            <span class="settings-item-icon">🔊</span>
                            <span data-i18n="settings.media">Media volume</span>
                        </div>
                        <div class="settings-item-control settings-slider-control">
                            <input type="range" id="settings-media-volume" class="settings-slider" min="0" max="100" value="50">
                            <span class="settings-slider-value" data-for="settings-media-volume">50%</span>
                        </div>
                    </div>

                    <!-- Autoplay speed (auto mode = simple play) -->
                    <div class="settings-item">
                        <div class="settings-item-label">
                            <span class="settings-item-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="#f97316"><path d="M8 5v14l11-7z"/></svg></span>
                            <span data-i18n="settings.autoscroll">Auto scroll</span>
                        </div>
                        <div class="settings-item-control settings-slider-control">
                            <input type="range" id="settings-autoplay-speed" class="settings-slider" min="500" max="5000" step="100" value="1500">
                            <span class="settings-slider-value settings-slider-value--ms" data-for="settings-autoplay-speed">1500ms</span>
                        </div>
                    </div>

                    <!-- Doubleplay speed (fast mode = double play) -->
                    <div class="settings-item">
                        <div class="settings-item-label">
                            <span class="settings-item-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="#f97316"><path d="M4 5v14l8-7zm9 0v14l8-7z"/></svg></span>
                            <span data-i18n="settings.fastscroll">Fast Scroll</span>
                        </div>
                        <div class="settings-item-control settings-slider-control">
                            <input type="range" id="settings-doubleplay-speed" class="settings-slider" min="100" max="1000" step="50" value="500">
                            <span class="settings-slider-value settings-slider-value--ms" data-for="settings-doubleplay-speed">500ms</span>
                        </div>
                    </div>

                    <!-- Auto-expand media -->
                    <div class="settings-item">
                        <div class="settings-item-label">
                            <span class="settings-item-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></span>
                            <span data-i18n="settings.autoexpand">Auto-expand media</span>
                        </div>
                        <div class="settings-item-control">
                            <label class="settings-checkbox">
                                <input type="checkbox" id="settings-auto-expand-media">
                                <span class="settings-checkbox-slider"></span>
                            </label>
                        </div>
                    </div>

                    <!-- Show choice hints -->
                    <div class="settings-item">
                        <div class="settings-item-label">
                            <span class="settings-item-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
                            <span data-i18n="settings.choicehints">Choice hints</span>
                        </div>
                        <div class="settings-item-control">
                            <label class="settings-checkbox">
                                <input type="checkbox" id="settings-show-choice-hints">
                                <span class="settings-checkbox-slider"></span>
                            </label>
                        </div>
                    </div>
                </section>

                <!-- STORY CATEGORY (visible only when a story is active) -->
                <section class="settings-category settings-category-story hidden" id="settings-story-category">
                    <h2 class="settings-category-title" id="settings-story-title" data-i18n="settings.cat.story">STORY</h2>

                    <!-- Girlfriend name -->
                    <div class="settings-item settings-item-girlfriend hidden" id="settings-girlfriend-item">
                        <div class="settings-item-label">
                            <span class="settings-item-icon">💕</span>
                            <span data-i18n="settings.gf.label">Girlfriend's name</span>
                        </div>
                        <div class="settings-item-control settings-girlfriend-control">
                            <span class="settings-girlfriend-name" id="settings-girlfriend-name">—</span>
                            <button id="settings-girlfriend-btn" class="settings-button settings-button-small" data-i18n="btn.edit">Edit</button>
                        </div>
                    </div>

                    <!-- Player nickname (MC) -->
                    <div class="settings-item settings-item-mc" id="settings-mc-item">
                        <div class="settings-item-label">
                            <span class="settings-item-icon">🎮</span>
                            <span data-i18n="settings.mc.label">Nickname</span>
                        </div>
                        <div class="settings-item-control settings-mc-control">
                            <span class="settings-mc-name" id="settings-mc-name">John</span>
                            <button id="settings-mc-btn" class="settings-button settings-button-small settings-button-mc" data-i18n="btn.edit">Edit</button>
                        </div>
                    </div>

                    <!-- Reset progress -->
                    <div class="settings-item settings-item-reset">
                        <div class="settings-item-label">
                            <span class="settings-item-icon">🔄</span>
                            <span data-i18n="settings.reset">Reset progress</span>
                        </div>
                        <div class="settings-item-control">
                            <button id="settings-reset-progress-btn" class="settings-button settings-button-danger" data-i18n="btn.reset">Reset</button>
                        </div>
                    </div>
                </section>
            </main>

            <!-- Modal for wallpaper selection -->
            <div id="settings-wallpaper-modal" class="settings-modal hidden">
                <div class="settings-modal-backdrop"></div>
                <div class="settings-modal-dialog">
                    <div class="settings-modal-header">
                        <h3 data-i18n="settings.wallpaper.title">Choose a wallpaper</h3>
                        <button class="settings-modal-close" type="button">×</button>
                    </div>
                    <div class="settings-modal-content">
                        <div class="settings-wallpaper-grid" id="settings-wallpaper-grid">
                            <!-- Wallpapers will be added here -->
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal for editing girlfriend name -->
            <div id="settings-girlfriend-modal" class="settings-modal hidden">
                <div class="settings-modal-backdrop"></div>
                <div class="settings-modal-dialog settings-modal-dialog--small">
                    <div class="settings-modal-header">
                        <h3 data-i18n="settings.gf.label">Girlfriend's name</h3>
                        <button class="settings-modal-close" type="button">×</button>
                    </div>
                    <div class="settings-modal-content">
                        <input type="text" id="settings-girlfriend-input" class="settings-girlfriend-input" placeholder="">
                        <p class="settings-girlfriend-hint" id="settings-girlfriend-hint" data-i18n="settings.gf.hint.empty">Leave empty for default name</p>
                        <button id="settings-girlfriend-confirm" class="settings-button settings-button-confirm" data-i18n="btn.confirm">Confirm</button>
                    </div>
                </div>
            </div>

            <!-- Modal for editing player nickname (MC) -->
            <div id="settings-mc-modal" class="settings-modal hidden">
                <div class="settings-modal-backdrop"></div>
                <div class="settings-modal-dialog settings-modal-dialog--small settings-modal-dialog--mc">
                    <div class="settings-modal-header">
                        <h3 data-i18n="settings.mc.label">Nickname</h3>
                        <button class="settings-modal-close" type="button">×</button>
                    </div>
                    <div class="settings-modal-content">
                        <input type="text" id="settings-mc-input" class="settings-mc-input" data-i18n-placeholder="charname.mc.placeholder" placeholder="John">
                        <p class="settings-mc-hint" data-i18n="settings.mc.hint">Leave empty for "John"</p>
                        <button id="settings-mc-confirm" class="settings-button settings-button-confirm settings-button-confirm--mc" data-i18n="btn.confirm">Confirm</button>
                    </div>
                </div>
            </div>

            <!-- Confirmation modal for resetting progress -->
            <div id="settings-reset-modal" class="settings-modal hidden">
                <div class="settings-modal-backdrop"></div>
                <div class="settings-modal-dialog settings-modal-dialog--small">
                    <div class="settings-modal-header">
                        <h3 data-i18n="settings.reset">Reset progress</h3>
                        <button class="settings-modal-close" type="button">×</button>
                    </div>
                    <div class="settings-modal-content">
                        <p class="settings-reset-warning" data-i18n="settings.reset.warning">You will lose all your progress in this story. This action is irreversible.</p>
                        <p class="settings-reset-note" data-i18n="settings.reset.note">Global settings will be preserved.</p>
                        <div class="settings-reset-buttons">
                            <button id="settings-reset-cancel" class="settings-button settings-button-secondary" data-i18n="btn.cancel">Cancel</button>
                            <button id="settings-reset-confirm" class="settings-button settings-button-danger" data-i18n="btn.reset">Reset</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Confirmation modal for resetting settings -->
            <div id="settings-reset-settings-modal" class="settings-modal hidden">
                <div class="settings-modal-backdrop"></div>
                <div class="settings-modal-dialog settings-modal-dialog--small">
                    <div class="settings-modal-header">
                        <h3 data-i18n="settings.default">Default settings</h3>
                        <button class="settings-modal-close" type="button">×</button>
                    </div>
                    <div class="settings-modal-content">
                        <p class="settings-reset-warning" data-i18n="settings.default.warning">All settings will be reset to their default values.</p>
                        <p class="settings-reset-note" data-i18n="settings.default.note">Story progress will not be affected.</p>
                        <div class="settings-reset-buttons">
                            <button id="settings-reset-settings-cancel" class="settings-button settings-button-secondary" data-i18n="btn.cancel">Cancel</button>
                            <button id="settings-reset-settings-confirm" class="settings-button settings-button-danger" data-i18n="btn.reset">Reset</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Populates the language dropdown from system_translations.txt
     */
    populateLanguageDropdown() {
        if (!this.root) return;

        const dropdown = this.root.querySelector('#settings-language-dropdown');
        if (!dropdown) return;

        const valueEl = dropdown.querySelector('.settings-dropdown-value');
        const menu = dropdown.querySelector('.settings-dropdown-menu');
        if (!valueEl || !menu) return;

        // Wait for translations to be loaded
        if (!window.Translations || !window.Translations.loaded) {
            // Retry after translations are loaded
            if (window.Translations) {
                window.Translations.onReady(() => this.populateLanguageDropdown());
            }
            return;
        }

        const languages = window.Translations.getAvailableLanguages();
        const currentLang = this.get('language');

        // Clear existing options
        menu.innerHTML = '';

        // Add options from translations
        for (const lang of languages) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'settings-dropdown-item';
            if (lang.code === currentLang) {
                item.classList.add('settings-dropdown-item--selected');
                valueEl.textContent = lang.name;
            }
            item.dataset.value = lang.code;
            item.textContent = lang.name;
            menu.appendChild(item);
        }

        // If no languages found, add a fallback
        if (languages.length === 0) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'settings-dropdown-item settings-dropdown-item--selected';
            item.dataset.value = 'en';
            item.textContent = 'English';
            menu.appendChild(item);
            valueEl.textContent = 'English';
        }
    },

    /**
     * Updates slider values display
     */
    updateSliderValues() {
        if (!this.root) return;

        // Language dropdown is populated separately (custom dropdown)
        // Value is updated in populateLanguageDropdown()

        // Music volume
        const musicSlider = this.root.querySelector('#settings-music-volume');
        if (musicSlider) {
            musicSlider.value = this.get('musicVolume');
            this.updateSliderDisplay(musicSlider, '%');
        }

        // Media volume
        const mediaSlider = this.root.querySelector('#settings-media-volume');
        if (mediaSlider) {
            mediaSlider.value = this.get('mediaVolume');
            this.updateSliderDisplay(mediaSlider, '%');
        }

        // Doubleplay speed
        const doubleplaySlider = this.root.querySelector('#settings-doubleplay-speed');
        if (doubleplaySlider) {
            doubleplaySlider.value = this.get('doubleplaySpeed');
            this.updateSliderDisplay(doubleplaySlider, 'ms');
        }

        // Autoplay speed
        const autoplaySlider = this.root.querySelector('#settings-autoplay-speed');
        if (autoplaySlider) {
            autoplaySlider.value = this.get('autoplaySpeed');
            this.updateSliderDisplay(autoplaySlider, 'ms');
        }

        // Auto-expand media checkbox
        const autoExpandCheckbox = this.root.querySelector('#settings-auto-expand-media');
        if (autoExpandCheckbox) {
            autoExpandCheckbox.checked = this.get('autoExpandMedia');
        }

        // Show choice hints checkbox
        const choiceHintsCheckbox = this.root.querySelector('#settings-show-choice-hints');
        if (choiceHintsCheckbox) {
            choiceHintsCheckbox.checked = this.get('showChoiceHints');
        }
    },

    /**
     * Updates a slider's display
     */
    updateSliderDisplay(slider, unit) {
        const valueEl = this.root.querySelector(`.settings-slider-value[data-for="${slider.id}"]`);
        if (valueEl) {
            valueEl.textContent = slider.value + unit;
        }
    },

    /**
     * Attaches events
     */
    attachEvents() {
        if (this.eventsAttached || !this.root) return;

        // Language dropdown (custom)
        const langDropdown = this.root.querySelector('#settings-language-dropdown');
        if (langDropdown) {
            const toggle = langDropdown.querySelector('.settings-dropdown-toggle');
            const menu = langDropdown.querySelector('.settings-dropdown-menu');
            const valueEl = langDropdown.querySelector('.settings-dropdown-value');

            // Toggle menu on click
            if (toggle) {
                toggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isOpen = !menu.classList.contains('hidden');
                    if (isOpen) {
                        menu.classList.add('hidden');
                        langDropdown.classList.remove('settings-dropdown--open');
                    } else {
                        menu.classList.remove('hidden');
                        langDropdown.classList.add('settings-dropdown--open');
                    }
                });
            }

            // Select item on click
            if (menu) {
                menu.addEventListener('click', (e) => {
                    const item = e.target.closest('.settings-dropdown-item');
                    if (!item) return;

                    const newLang = item.dataset.value;
                    this.set('language', newLang);

                    // Update selected state
                    menu.querySelectorAll('.settings-dropdown-item').forEach(i => {
                        i.classList.remove('settings-dropdown-item--selected');
                    });
                    item.classList.add('settings-dropdown-item--selected');

                    // Update displayed value
                    if (valueEl) {
                        valueEl.textContent = item.textContent;
                    }

                    // Close menu
                    menu.classList.add('hidden');
                    langDropdown.classList.remove('settings-dropdown--open');

                    // Apply the language change via translations system
                    if (window.Translations) {
                        window.Translations.setLanguage(newLang);
                        window.Translations.updateDOM();
                    }
                });
            }

            // Close on click outside
            document.addEventListener('click', (e) => {
                if (!langDropdown.contains(e.target)) {
                    menu.classList.add('hidden');
                    langDropdown.classList.remove('settings-dropdown--open');
                }
            });
        }

        // Sliders
        this.attachSliderEvent('#settings-music-volume', 'musicVolume', '%', (value) => {
            // Recalculate with general volume
            if (window.applyGeneralVolume) {
                window.applyGeneralVolume();
            }
        });
        this.attachSliderEvent('#settings-media-volume', 'mediaVolume', '%', (value) => {
            // Recalculate with general volume
            if (window.applyGeneralVolume) {
                window.applyGeneralVolume();
            }
        });
        this.attachSliderEvent('#settings-doubleplay-speed', 'doubleplaySpeed', 'ms');
        this.attachSliderEvent('#settings-autoplay-speed', 'autoplaySpeed', 'ms');

        // Auto-expand media checkbox
        const autoExpandCheckbox = this.root.querySelector('#settings-auto-expand-media');
        if (autoExpandCheckbox) {
            autoExpandCheckbox.addEventListener('change', (e) => {
                this.set('autoExpandMedia', e.target.checked);
            });
        }

        // Show choice hints checkbox
        const choiceHintsCheckbox = this.root.querySelector('#settings-show-choice-hints');
        if (choiceHintsCheckbox) {
            choiceHintsCheckbox.addEventListener('change', (e) => {
                this.set('showChoiceHints', e.target.checked);
            });
        }

        // Wallpaper button
        const wallpaperBtn = this.root.querySelector('#settings-wallpaper-btn');
        if (wallpaperBtn) {
            wallpaperBtn.addEventListener('click', () => {
                this.openWallpaperModal();
            });
        }

        // Wallpaper modal - close
        const modal = this.root.querySelector('#settings-wallpaper-modal');
        if (modal) {
            const closeBtn = modal.querySelector('.settings-modal-close');
            const backdrop = modal.querySelector('.settings-modal-backdrop');

            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.closeWallpaperModal());
            }
            if (backdrop) {
                backdrop.addEventListener('click', () => this.closeWallpaperModal());
            }
        }

        // Girlfriend name button
        const girlfriendBtn = this.root.querySelector('#settings-girlfriend-btn');
        if (girlfriendBtn) {
            girlfriendBtn.addEventListener('click', () => {
                this.openGirlfriendModal();
            });
        }

        // Girlfriend modal - close and confirm
        const gfModal = this.root.querySelector('#settings-girlfriend-modal');
        if (gfModal) {
            const closeBtn = gfModal.querySelector('.settings-modal-close');
            const backdrop = gfModal.querySelector('.settings-modal-backdrop');
            const confirmBtn = gfModal.querySelector('#settings-girlfriend-confirm');
            const input = gfModal.querySelector('#settings-girlfriend-input');

            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.closeGirlfriendModal());
            }
            if (backdrop) {
                backdrop.addEventListener('click', () => this.closeGirlfriendModal());
            }
            if (confirmBtn) {
                confirmBtn.addEventListener('click', () => this.confirmGirlfriendName());
            }
            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.confirmGirlfriendName();
                    }
                });
            }
        }

        // MC name button
        const mcBtn = this.root.querySelector('#settings-mc-btn');
        if (mcBtn) {
            mcBtn.addEventListener('click', () => {
                this.openMcModal();
            });
        }

        // MC modal - close and confirm
        const mcModal = this.root.querySelector('#settings-mc-modal');
        if (mcModal) {
            const closeBtn = mcModal.querySelector('.settings-modal-close');
            const backdrop = mcModal.querySelector('.settings-modal-backdrop');
            const confirmBtn = mcModal.querySelector('#settings-mc-confirm');
            const input = mcModal.querySelector('#settings-mc-input');

            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.closeMcModal());
            }
            if (backdrop) {
                backdrop.addEventListener('click', () => this.closeMcModal());
            }
            if (confirmBtn) {
                confirmBtn.addEventListener('click', () => this.confirmMcName());
            }
            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.confirmMcName();
                    }
                });
            }
        }

        // Reset progress button
        const resetBtn = this.root.querySelector('#settings-reset-progress-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.openResetModal();
            });
        }

        // Reset modal - close and confirm
        const resetModal = this.root.querySelector('#settings-reset-modal');
        if (resetModal) {
            const closeBtn = resetModal.querySelector('.settings-modal-close');
            const backdrop = resetModal.querySelector('.settings-modal-backdrop');
            const cancelBtn = resetModal.querySelector('#settings-reset-cancel');
            const confirmBtn = resetModal.querySelector('#settings-reset-confirm');

            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.closeResetModal());
            }
            if (backdrop) {
                backdrop.addEventListener('click', () => this.closeResetModal());
            }
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => this.closeResetModal());
            }
            if (confirmBtn) {
                confirmBtn.addEventListener('click', () => this.confirmResetProgress());
            }
        }

        // Reset settings button
        const resetSettingsBtn = this.root.querySelector('#settings-reset-settings-btn');
        if (resetSettingsBtn) {
            resetSettingsBtn.addEventListener('click', () => {
                this.openResetSettingsModal();
            });
        }

        // Reset settings modal - close and confirm
        const resetSettingsModal = this.root.querySelector('#settings-reset-settings-modal');
        if (resetSettingsModal) {
            const closeBtn = resetSettingsModal.querySelector('.settings-modal-close');
            const backdrop = resetSettingsModal.querySelector('.settings-modal-backdrop');
            const cancelBtn = resetSettingsModal.querySelector('#settings-reset-settings-cancel');
            const confirmBtn = resetSettingsModal.querySelector('#settings-reset-settings-confirm');

            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.closeResetSettingsModal());
            }
            if (backdrop) {
                backdrop.addEventListener('click', () => this.closeResetSettingsModal());
            }
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => this.closeResetSettingsModal());
            }
            if (confirmBtn) {
                confirmBtn.addEventListener('click', () => this.confirmResetSettings());
            }
        }

        // Close with Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' || e.key === 'Esc') {
                if (this.modalOpen) {
                    this.closeCurrentModal();
                    e.preventDefault();
                }
            }
        });

        this.eventsAttached = true;
    },

    /**
     * Closes the currently open modal
     */
    closeCurrentModal() {
        switch (this.currentModal) {
            case 'wallpaper':
                this.closeWallpaperModal();
                break;
            case 'girlfriend':
                this.closeGirlfriendModal();
                break;
            case 'mc':
                this.closeMcModal();
                break;
            case 'reset':
                this.closeResetModal();
                break;
            case 'resetSettings':
                this.closeResetSettingsModal();
                break;
            default:
                // Fallback: close all modals
                this.closeWallpaperModal();
                this.closeGirlfriendModal();
                this.closeMcModal();
                this.closeResetModal();
                this.closeResetSettingsModal();
        }
    },

    /**
     * Attaches an event to a slider
     */
    attachSliderEvent(selector, settingKey, unit, onChange = null) {
        const slider = this.root.querySelector(selector);
        if (slider) {
            slider.addEventListener('input', (e) => {
                this.updateSliderDisplay(e.target, unit);
                // Real-time callback during sliding
                if (onChange) {
                    onChange(parseInt(e.target.value, 10));
                }
            });
            slider.addEventListener('change', (e) => {
                const value = parseInt(e.target.value, 10);
                this.set(settingKey, value);
                // Callback at end of sliding
                if (onChange) {
                    onChange(value);
                }
            });
        }
    },

    /**
     * Opens the wallpaper selection modal
     */
    openWallpaperModal() {
        const modal = this.root.querySelector('#settings-wallpaper-modal');
        if (!modal) return;

        // Load available wallpapers
        this.loadWallpapers();

        modal.classList.remove('hidden');
        this.modalOpen = true;
        this.currentModal = 'wallpaper';
    },

    /**
     * Closes the wallpaper modal
     */
    closeWallpaperModal() {
        const modal = this.root.querySelector('#settings-wallpaper-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        this.modalOpen = false;
        this.currentModal = null;
    },

    /**
     * Loads available wallpapers from the server
     */
    async loadWallpapers() {
        const grid = this.root.querySelector('#settings-wallpaper-grid');
        if (!grid) return;

        // Display a loader during loading
        grid.innerHTML = `<div style="text-align: center; padding: 20px; color: #888;">${window.t('settings.wallpaper.loading')}</div>`;

        try {
            const response = await fetch('wallpapers.php');
            const data = await response.json();

            // Store the default wallpaper
            this.defaultWallpaper = data.default;

            const currentWallpaper = this.get('wallpaper');

            // Generate the wallpaper list
            let html = '';

            // "Default" option (uses wallpaper named "1" or a gradient if absent)
            const isDefaultSelected = !currentWallpaper || currentWallpaper === 'default';
            const defaultStyle = this.defaultWallpaper
                ? `background-image: url('${this.defaultWallpaper}')`
                : 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            html += `
                <button class="settings-wallpaper-item${isDefaultSelected ? ' settings-wallpaper-item--selected' : ''}" data-wallpaper="default" style="${defaultStyle}">
                    <span class="settings-wallpaper-label">${window.t('settings.wallpaper.default')}</span>
                    ${isDefaultSelected ? '<span class="settings-wallpaper-check">✓</span>' : ''}
                </button>
            `;

            // Other wallpapers
            data.wallpapers.forEach((wp, index) => {
                // Skip wallpaper "1" because it's already in "Default"
                if (wp.name === '1') return;

                const isSelected = currentWallpaper === wp.src;
                const selectedClass = isSelected ? ' settings-wallpaper-item--selected' : '';

                html += `
                    <button class="settings-wallpaper-item${selectedClass}" data-wallpaper="${wp.src}" style="background-image: url('${wp.src}')">
                        <span class="settings-wallpaper-label">${window.t('settings.wallpaper.item', { n: index + 1 })}</span>
                        ${isSelected ? '<span class="settings-wallpaper-check">✓</span>' : ''}
                    </button>
                `;
            });

            grid.innerHTML = html;

            // Attach events to items
            grid.querySelectorAll('.settings-wallpaper-item').forEach(item => {
                item.addEventListener('click', () => {
                    const wallpaperSrc = item.dataset.wallpaper;
                    this.selectWallpaper(wallpaperSrc === 'default' ? 'default' : wallpaperSrc);
                });
            });

        } catch (error) {
            grid.innerHTML = `<div style="text-align: center; padding: 20px; color: #f87171;">${window.t('settings.wallpaper.error')}</div>`;
        }
    },

    /**
     * Selects a wallpaper
     */
    selectWallpaper(src) {
        this.set('wallpaper', src);
        this.applyWallpaper(src);
        this.loadWallpapers(); // Refresh to show selection
        this.closeWallpaperModal();
    },

    /**
     * Applies the wallpaper to the phone (via CSS variable on ::before)
     */
    applyWallpaper(src) {
        const phoneFrame = document.querySelector('.phone-frame');
        if (phoneFrame) {
            // If "default", use the default wallpaper (1.*)
            let actualSrc = src;
            if (src === 'default') {
                actualSrc = this.defaultWallpaper;
            }

            if (actualSrc) {
                // Apply via CSS variable for ::before to use
                phoneFrame.style.setProperty('--wallpaper-url', `url('${actualSrc}')`);
            } else {
                phoneFrame.style.setProperty('--wallpaper-url', 'none');
            }
        }
    },

    /**
     * Opens the girlfriend name edit modal
     */
    openGirlfriendModal() {
        const modal = this.root.querySelector('#settings-girlfriend-modal');
        const input = this.root.querySelector('#settings-girlfriend-input');
        const hint = this.root.querySelector('#settings-girlfriend-hint');

        if (!modal || !window.customizableCharacterInfo) return;

        const info = window.customizableCharacterInfo;
        const currentName = window.customCharacterNames[info.key] || info.defaultName;

        if (input) {
            input.value = currentName;
            input.placeholder = info.defaultName;
        }
        if (hint) {
            hint.textContent = window.t('settings.gf.hint', { defaultName: info.defaultName });
        }

        modal.classList.remove('hidden');
        this.modalOpen = true;
        this.currentModal = 'girlfriend';

        setTimeout(() => {
            if (input) {
                input.focus();
                input.select();
            }
        }, 100);
    },

    /**
     * Closes the girlfriend name edit modal
     */
    closeGirlfriendModal() {
        const modal = this.root.querySelector('#settings-girlfriend-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        this.modalOpen = false;
        this.currentModal = null;
    },

    /**
     * Confirms the new girlfriend name
     */
    confirmGirlfriendName() {
        const input = this.root.querySelector('#settings-girlfriend-input');
        if (!input || !window.customizableCharacterInfo) return;

        const info = window.customizableCharacterInfo;
        const newName = input.value.trim() || info.defaultName;

        // Update global storage
        window.customCharacterNames[info.key] = newName;
        for (const alias of info.aliases) {
            window.customCharacterNames[alias] = newName;
        }

        // Save to localStorage
        this.saveGirlfriendName(newName);

        // Update display in Settings
        this.updateGirlfriendDisplay();

        // Update Messenger if it's loaded
        if (window.Messenger && window.Messenger.keyToName) {
            window.Messenger.keyToName[info.key] = newName;
            // Refresh contacts list if visible
            if (window.Messenger.renderContacts) {
                window.Messenger.contacts = window.Messenger.contacts.map(c => {
                    if (c.key === info.key) {
                        return { ...c, name: newName };
                    }
                    return c;
                });
            }
        }


        this.closeGirlfriendModal();
    },

    /**
     * Saves the girlfriend name to localStorage
     */
    saveGirlfriendName(name) {
        try {
            const saved = localStorage.getItem('studioGirlfriendName') || '{}';
            const data = JSON.parse(saved);

            // Use story slug as key
            const storySlug = window.currentStorySlug || 'default';
            data[storySlug] = name;

            localStorage.setItem('studioGirlfriendName', JSON.stringify(data));
        } catch (e) {
        }
    },

    /**
     * Loads the girlfriend name from localStorage
     */
    loadGirlfriendName() {
        try {
            const saved = localStorage.getItem('studioGirlfriendName');
            if (!saved) return null;

            const data = JSON.parse(saved);
            const storySlug = window.currentStorySlug || 'default';
            return data[storySlug] || null;
        } catch (e) {
            return null;
        }
    },

    /**
     * Updates the girlfriend name display in Settings
     */
    updateGirlfriendDisplay() {
        if (!this.root) return;

        const item = this.root.querySelector('#settings-girlfriend-item');
        const nameEl = this.root.querySelector('#settings-girlfriend-name');

        // Display option only if a customizable character exists
        if (window.customizableCharacterInfo) {
            const info = window.customizableCharacterInfo;
            const currentName = window.customCharacterNames[info.key] || info.defaultName;

            if (item) item.classList.remove('hidden');
            if (nameEl) nameEl.textContent = currentName;
        } else {
            if (item) item.classList.add('hidden');
        }
    },

    /**
     * Opens the MC nickname edit modal
     */
    openMcModal() {
        const modal = this.root.querySelector('#settings-mc-modal');
        const input = this.root.querySelector('#settings-mc-input');

        if (!modal) return;

        const currentName = window.mcName || 'John';

        if (input) {
            input.value = currentName === 'John' ? '' : currentName;
            input.placeholder = 'John';
        }

        modal.classList.remove('hidden');
        this.modalOpen = true;
        this.currentModal = 'mc';

        setTimeout(() => {
            if (input) {
                input.focus();
                input.select();
            }
        }, 100);
    },

    /**
     * Closes the MC nickname edit modal
     */
    closeMcModal() {
        const modal = this.root.querySelector('#settings-mc-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        this.modalOpen = false;
        this.currentModal = null;
    },

    /**
     * Confirms the new MC nickname
     */
    confirmMcName() {
        const input = this.root.querySelector('#settings-mc-input');
        if (!input) return;

        const newName = input.value.trim() || 'John';

        // Update global storage
        window.mcName = newName;
        window.customCharacterNames['mc'] = newName;

        // Save to localStorage
        this.saveMcName(newName);

        // Update display in Settings
        this.updateMcDisplay();


        this.closeMcModal();
    },

    /**
     * Saves the MC nickname to localStorage
     */
    saveMcName(name) {
        try {
            const saved = localStorage.getItem('studioMcName') || '{}';
            const data = JSON.parse(saved);

            // Use story slug as key
            const storySlug = window.currentStorySlug || 'default';
            data[storySlug] = name;

            localStorage.setItem('studioMcName', JSON.stringify(data));
        } catch (e) {
        }
    },

    /**
     * Loads the MC nickname from localStorage
     */
    loadMcName() {
        try {
            const saved = localStorage.getItem('studioMcName');
            if (!saved) return null;

            const data = JSON.parse(saved);
            const storySlug = window.currentStorySlug || 'default';
            return data[storySlug] || null;
        } catch (e) {
            return null;
        }
    },

    /**
     * Updates the MC nickname display in Settings
     */
    updateMcDisplay() {
        if (!this.root) return;

        const nameEl = this.root.querySelector('#settings-mc-name');
        const currentName = window.mcName || 'John';

        if (nameEl) nameEl.textContent = currentName;
    },

    /**
     * Updates the Story category display
     */
    updateStoryCategory() {
        if (!this.root) return;

        const category = this.root.querySelector('#settings-story-category');
        const title = this.root.querySelector('#settings-story-title');

        // Get story title from SavesLoad or a global variable
        const storyTitle = window.currentStoryTitle ||
                          (window.SavesLoad && window.SavesLoad.storyTitle) ||
                          null;

        if (storyTitle) {
            // Display category with story name
            if (category) category.classList.remove('hidden');
            if (title) title.textContent = window.t('settings.cat.story.title', { TITLE: storyTitle.toUpperCase() });
        } else {
            // Hide category if no story is active
            if (category) category.classList.add('hidden');
        }
    },

    /**
     * Opens the reset confirmation modal
     */
    openResetModal() {
        const modal = this.root.querySelector('#settings-reset-modal');
        if (modal) {
            modal.classList.remove('hidden');
            this.modalOpen = true;
            this.currentModal = 'reset';
        }
    },

    /**
     * Closes the reset modal
     */
    closeResetModal() {
        const modal = this.root.querySelector('#settings-reset-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        this.modalOpen = false;
        this.currentModal = null;
    },

    /**
     * Confirms and executes progress reset
     */
    async confirmResetProgress() {

        // Reset Messenger
        if (window.Messenger) {
            // Reset unlocked files
            window.Messenger.unlockedFiles = ['start.txt'];
            window.Messenger.unlockedInstaPosts = [];
            window.Messenger.unlockedSlutOnlyPosts = [];
            window.Messenger.parsedFiles = [];
            window.Messenger.conversationsByKey = {};
            window.Messenger.contacts = [];
            window.Messenger.selectedKey = null;
            window.Messenger.contactLastActivity = {};
            window.Messenger.contactsWithNew = new Set();

            // Reload data from the beginning
            await window.Messenger.reloadData();

            // Re-render
            window.Messenger.renderContacts();
            window.Messenger.renderConversation();
        }

        // Reset InstaPics
        if (window.InstaPics?.render) {
            window.InstaPics.render();
        }

        // Reset OnlySlut
        if (window.OnlySlut?.render) {
            window.OnlySlut.render();
        }

        // Reset Gallery
        if (window.Gallery?.render) {
            window.Gallery.render();
        }

        // Reset Spy app state
        const slug = window.currentStorySlug || 'default';
        try {
            // Remove spy anchor from localStorage
            const spyAnchor = localStorage.getItem('studioSpyAnchor');
            if (spyAnchor) {
                const data = JSON.parse(spyAnchor);
                delete data[slug];
                localStorage.setItem('studioSpyAnchor', JSON.stringify(data));
            }
            // Remove spy insta posts from localStorage
            const spyInsta = localStorage.getItem('studioSpyInsta');
            if (spyInsta) {
                const data = JSON.parse(spyInsta);
                delete data[slug];
                localStorage.setItem('studioSpyInsta', JSON.stringify(data));
            }
            // Remove spy slut posts from localStorage
            const spySlut = localStorage.getItem('studioSpySlut');
            if (spySlut) {
                const data = JSON.parse(spySlut);
                delete data[slug];
                localStorage.setItem('studioSpySlut', JSON.stringify(data));
            }
        } catch (e) {}

        // Reset spy global state
        window.currentSpyAnchor = 0;

        // Reset spy unlocks (posts + app visibility)
        if (window.resetSpyUnlocks) {
            window.resetSpyUnlocks();
        } else {
            window.unlockedSpyInsta = [];
            window.unlockedSpySlut = [];
            window.spyAppsUnlocked = { instapics: false, onlyslut: false };
        }

        // Reset and hide spy app
        if (window.resetSpyAppState) {
            window.resetSpyAppState();
        }

        // Force SpyMessenger to reload data next time SpyApp opens
        if (window.SpyMessenger) {
            window.SpyMessenger.dataLoaded = false;
            window.SpyMessenger.parsedFiles = [];
            window.SpyMessenger.conversationsByKey = {};
            window.SpyMessenger.conversations = [];
        }

        this.closeResetModal();
    },

    /**
     * Opens the confirmation modal for resetting settings
     */
    openResetSettingsModal() {
        const modal = this.root.querySelector('#settings-reset-settings-modal');
        if (modal) {
            modal.classList.remove('hidden');
            this.modalOpen = true;
            this.currentModal = 'resetSettings';
        }
    },

    /**
     * Closes the settings reset modal
     */
    closeResetSettingsModal() {
        const modal = this.root.querySelector('#settings-reset-settings-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
        this.modalOpen = false;
        this.currentModal = null;
    },

    /**
     * Confirms and executes settings reset
     */
    confirmResetSettings() {

        // Reset to default values
        this.values = { ...this.defaults };
        this.saveSettings();

        // Update display
        this.updateSliderValues();

        // Apply default wallpaper
        this.applyWallpaper('default');

        // Reset general volume to 100%
        if (window.resetGeneralVolume) {
            window.resetGeneralVolume();
        }

        // Apply default volumes (music and media)
        if (window.applyGeneralVolume) {
            window.applyGeneralVolume();
        }

        // Reset girlfriend name to default
        if (window.customizableCharacterInfo) {
            const info = window.customizableCharacterInfo;
            const defaultName = info.defaultName;

            // Update global storage
            window.customCharacterNames[info.key] = defaultName;
            for (const alias of info.aliases) {
                window.customCharacterNames[alias] = defaultName;
            }

            // Update localStorage
            this.saveGirlfriendName(defaultName);

            // Update display
            this.updateGirlfriendDisplay();

            // Update Messenger contacts
            if (window.Messenger && window.Messenger.keyToName) {
                window.Messenger.keyToName[info.key] = defaultName;
                window.Messenger.contacts = window.Messenger.contacts.map(c => {
                    if (c.key === info.key) {
                        return { ...c, name: defaultName };
                    }
                    return c;
                });
            }

        }

        // Reset MC name to default (John)
        window.mcName = 'John';
        window.customCharacterNames = window.customCharacterNames || {};
        window.customCharacterNames['mc'] = 'John';
        this.saveMcName('John');
        this.updateMcDisplay();


        this.closeResetSettingsModal();
    },

    /**
     * Called when the app is opened
     */
    onOpen() {
        this.populateLanguageDropdown();
        this.updateSliderValues();
        this.updateStoryCategory();
        this.updateGirlfriendDisplay();
        this.updateMcDisplay();

        // Apply translations
        if (window.Translations && window.Translations.loaded) {
            window.Translations.updateDOM();
        }
    },

    /**
     * Called when the app is closed
     */
    onClose() {
        this.closeWallpaperModal();
        this.closeGirlfriendModal();
        this.closeMcModal();
        this.closeResetModal();
        this.closeResetSettingsModal();
    }
};

// Apply wallpaper on load
document.addEventListener('DOMContentLoaded', async () => {
    // Load default wallpaper from server first
    try {
        const response = await fetch('wallpapers.php');
        const data = await response.json();
        Settings.defaultWallpaper = data.default;
    } catch (e) {
    }

    // Apply saved wallpaper or default
    const saved = localStorage.getItem('studioSettings');
    let wallpaperToApply = 'default'; // By default, use wallpaper "1.*"

    if (saved) {
        try {
            const settings = JSON.parse(saved);
            if (settings.wallpaper) {
                wallpaperToApply = settings.wallpaper;
            }
        } catch (e) {}
    }

    Settings.applyWallpaper(wallpaperToApply);
});
