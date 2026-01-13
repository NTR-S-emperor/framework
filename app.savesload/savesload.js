// app.savesload/savesload.js

window.SavesLoad = {
    root: null,
    storyPath: null,
    storyTitle: null,
    saves: [],           // List of saves [{id, storyTitle, date, data}]
    eventsAttached: false,
    modalAction: null,   // 'load', 'load-ask-settings', 'load-ask-story-settings', 'overwrite', 'delete'
    modalSaveId: null,   // ID of the save concerned
    currentFilter: 'manual', // 'all', 'manual' or 'automatic'

    // Load options (set during multi-step load confirmation)
    loadOptions: {
        restoreSettings: true,
        restoreStorySettings: true
    },

    // Cloud API configuration
    cloudApiUrl: 'https://api.s-emperor.studio/cloud-saves.php',

    /**
     * Get or generate a unique device ID (stored in localStorage)
     */
    getDeviceId() {
        let deviceId = localStorage.getItem('studio_device_id');
        if (!deviceId) {
            // Generate a random ID
            deviceId = 'dev_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('studio_device_id', deviceId);
        }
        return deviceId;
    },

    // SVG Icons
    icons: {
        load: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15v4c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-4M17 9l-5 5-5-5M12 12.8V2.5"/></svg>',
        overwrite: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
        delete: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
        export: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/><path d="M9 15L20 4"/><path d="M15 3h6v6"/></svg>',
        import: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
        cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>'
    },

    /**
     * Initialize SavesLoad for a given story
     */
    async init(storyPath, storyTitle) {
        if (storyPath) {
            this.storyPath = storyPath;
        }
        if (storyTitle) {
            this.storyTitle = storyTitle;
        }

        this.mount();
        this.attachEvents();
        this.loadSaves();
    },

    /**
     * Update the current story
     */
    setStory(storyPath, storyTitle) {
        this.storyPath = storyPath;
        this.storyTitle = storyTitle;
    },

    /**
     * Load saves from localStorage
     */
    loadSaves() {
        try {
            const stored = localStorage.getItem('studio_saves');
            this.saves = stored ? JSON.parse(stored) : [];
        } catch (e) {
            this.saves = [];
        }
        this.render();
    },

    /**
     * Save the list to localStorage
     */
    persistSaves() {
        try {
            localStorage.setItem('studio_saves', JSON.stringify(this.saves));
        } catch (e) {
            // Silent error
        }
    },

    /**
     * Generate a unique ID
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    /**
     * Format a date as YYYY.MM.DD - HH:MM
     */
    formatDate(date) {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${year}.${month}.${day} - ${hours}:${minutes}`;
    },

    /**
     * Capture the complete game state for saving (optimized format)
     * Does NOT save playedMessages - they will be replayed on load
     * Compact format with short keys to reduce size
     *
     * Structure v3:
     * - progress: Story progression (conversations, unlocks, UI state)
     * - settings: Global app settings (language, volumes, wallpaper, speeds)
     * - storySettings: Story-specific settings (character names)
     */
    captureGameState() {
        const state = {
            v: 3, // save format version (v3 = separated sections)
            t: Date.now(),
            progress: this.captureProgress(),
            settings: this.captureSettings(),
            storySettings: this.captureStorySettings()
        };

        return state;
    },

    /**
     * Capture story progression (conversations, unlocks, UI state)
     */
    captureProgress() {
        const progress = {};

        if (window.Messenger) {
            // m=messenger, u=unlockedFiles, i=instaPosts, o=slutOnlyPosts, k=selectedKey, c=conversations
            // w=contactsWithNew, l=contactLastActivity, a=activeConversationKey, ch=conversationHistory
            progress.m = {
                u: [...(window.Messenger.unlockedFiles || ['start.txt'])],
                i: [...(window.Messenger.unlockedInstaPosts || [])],
                o: [...(window.Messenger.unlockedSlutOnlyPosts || [])],
                k: window.Messenger.selectedKey || null,
                w: [...(window.Messenger.contactsWithNew || [])],  // contacts with unread content
                l: { ...(window.Messenger.contactLastActivity || {}) },  // contact activity timestamps
                a: window.Messenger.activeConversationKey || null,  // active conversation (story continues here)
                ch: [...(window.Messenger.conversationHistory || [])],  // conversation history for back navigation
                c: {}
            };

            // Capture minimal state of each conversation
            // s=scriptIndex, n=nextChoiceIdx, w=waitingForChoice, a=activeChoiceIdx, h=choicesMade
            // r=nextRealChoiceIdx, rw=waitingForRealChoice, ra=activeRealChoiceIdx, rh=realChoicesMade, sp=selectedPath
            // ah=actionHistory
            if (window.Messenger.conversationsByKey) {
                for (const [key, conv] of Object.entries(window.Messenger.conversationsByKey)) {
                    if (conv) {
                        progress.m.c[key] = {
                            s: conv.scriptIndex || 0,
                            n: conv.nextChoiceIdx || 0,
                            w: conv.waitingForChoice || false,
                            a: conv.activeChoiceIdx,
                            h: conv.choicesMade ? [...conv.choicesMade] : [],
                            // Real choices (paths)
                            r: conv.nextRealChoiceIdx || 0,
                            rw: conv.waitingForRealChoice || false,
                            ra: conv.activeRealChoiceIdx,
                            rh: conv.realChoicesMade ? [...conv.realChoicesMade] : [],
                            sp: conv.selectedPath || null,
                            // Action history for back navigation
                            ah: conv.actionHistory ? [...conv.actionHistory] : []
                        };
                    }
                }
            }
        }

        // Spy app state (sp=spy)
        // u=unlocked, a=anchor, i=instaPosts, o=slutPosts, apps=spyAppsUnlocked
        progress.sp = {
            u: window.spyAppUnlocked || false,
            a: window.currentSpyAnchor || 0,
            i: [...(window.unlockedSpyInsta || [])],
            o: [...(window.unlockedSpySlut || [])],
            apps: window.spyAppsUnlocked ? { ...window.spyAppsUnlocked } : { instapics: false, onlyslut: false }
        };

        return progress;
    },

    /**
     * Capture global app settings
     */
    captureSettings() {
        if (window.Settings && window.Settings.values) {
            return {
                language: window.Settings.get('language'),
                musicVolume: window.Settings.get('musicVolume'),
                mediaVolume: window.Settings.get('mediaVolume'),
                doubleplaySpeed: window.Settings.get('doubleplaySpeed'),
                autoplaySpeed: window.Settings.get('autoplaySpeed'),
                wallpaper: window.Settings.get('wallpaper'),
                autoExpandMedia: window.Settings.get('autoExpandMedia'),
                showChoiceHints: window.Settings.get('showChoiceHints')
            };
        }
        return null;
    },

    /**
     * Capture story-specific settings (character names)
     */
    captureStorySettings() {
        const storySettings = {};

        // Capture the girlfriend's name (g=girlfriend)
        if (window.customizableCharacterInfo && window.customCharacterNames) {
            const key = window.customizableCharacterInfo.key;
            const name = window.customCharacterNames[key];
            if (name) {
                storySettings.g = {
                    k: key,                                          // character key
                    n: name,                                         // custom name
                    d: window.customizableCharacterInfo.defaultName, // default name
                    a: window.customizableCharacterInfo.aliases      // aliases
                };
            }
        }

        // Capture the player's nickname (p=player/mc)
        if (window.mcName) {
            storySettings.p = window.mcName;
        }

        return storySettings;
    },

    /**
     * Compress save data to base64
     */
    compressState(state) {
        try {
            const json = JSON.stringify(state);
            // Encode to base64 to reduce size and avoid encoding issues
            return btoa(unescape(encodeURIComponent(json)));
        } catch (e) {
            return JSON.stringify(state);
        }
    },

    /**
     * Decompress save data (base64 -> JSON)
     */
    decompressState(data) {
        try {
            if (typeof data === 'object') return data;
            const json = decodeURIComponent(escape(atob(data)));
            return JSON.parse(json);
        } catch (e) {
            return null;
        }
    },

    /**
     * Restore game state from a save (v3 format)
     *
     * @param {Object} state - The saved state object
     * @param {Object} options - Restore options
     * @param {boolean} options.restoreProgress - Restore story progression (default: true)
     * @param {boolean} options.restoreSettings - Restore global settings (default: true)
     * @param {boolean} options.restoreStorySettings - Restore story settings like character names (default: true)
     */
    async restoreGameState(state, options = {}) {
        // Default options: restore everything
        const opts = {
            restoreProgress: options.restoreProgress !== false,
            restoreSettings: options.restoreSettings !== false,
            restoreStorySettings: options.restoreStorySettings !== false
        };

        // Validate v3 format
        if (!state?.progress?.m || !window.Messenger) {
            return false;
        }

        // 1. Restore global settings (if requested and available)
        if (opts.restoreSettings && state.settings) {
            await this.restoreSettings(state.settings);
        }

        // 2. Restore story settings (character names) BEFORE reloading Messenger
        if (opts.restoreStorySettings && state.storySettings) {
            this.restoreStorySettings(state.storySettings);
        }

        // 3. Restore story progression
        if (opts.restoreProgress) {
            await this.restoreProgress(state.progress);
        }

        return true;
    },

    /**
     * Restore global app settings
     */
    async restoreSettings(settingsData) {
        if (!settingsData || !window.Settings) return;

        // Apply each setting
        if (settingsData.language !== undefined) {
            window.Settings.set('language', settingsData.language);
            if (window.Translations) {
                window.Translations.setLanguage(settingsData.language);
                window.Translations.updateDOM();
            }
        }
        if (settingsData.musicVolume !== undefined) {
            window.Settings.set('musicVolume', settingsData.musicVolume);
        }
        if (settingsData.mediaVolume !== undefined) {
            window.Settings.set('mediaVolume', settingsData.mediaVolume);
        }
        if (settingsData.doubleplaySpeed !== undefined) {
            window.Settings.set('doubleplaySpeed', settingsData.doubleplaySpeed);
        }
        if (settingsData.autoplaySpeed !== undefined) {
            window.Settings.set('autoplaySpeed', settingsData.autoplaySpeed);
        }
        if (settingsData.wallpaper !== undefined) {
            window.Settings.set('wallpaper', settingsData.wallpaper);

            // If wallpaper is "default" and defaultWallpaper not loaded, fetch it first
            if (settingsData.wallpaper === 'default' && !window.Settings.defaultWallpaper) {
                try {
                    const response = await fetch('wallpapers.php');
                    const data = await response.json();
                    window.Settings.defaultWallpaper = data.default;
                } catch (e) {}
            }

            window.Settings.applyWallpaper(settingsData.wallpaper);
        }
        if (settingsData.autoExpandMedia !== undefined) {
            window.Settings.set('autoExpandMedia', settingsData.autoExpandMedia);
        }
        if (settingsData.showChoiceHints !== undefined) {
            window.Settings.set('showChoiceHints', settingsData.showChoiceHints);
        }

        // Update Settings UI if visible
        if (window.Settings.updateSliderValues) {
            window.Settings.updateSliderValues();
        }

        // Apply volume changes
        if (window.applyGeneralVolume) {
            window.applyGeneralVolume();
        }
    },

    /**
     * Restore story-specific settings (character names)
     */
    restoreStorySettings(storySettingsData) {
        if (!storySettingsData) return;

        // Restore girlfriend's name
        if (storySettingsData.g) {
            const g = storySettingsData.g;
            // Restore customizable character info
            window.customizableCharacterInfo = {
                key: g.k,
                defaultName: g.d,
                aliases: g.a || [g.k]
            };

            // Restore custom name
            window.customCharacterNames = window.customCharacterNames || {};
            window.customCharacterNames[g.k] = g.n;
            if (g.a) {
                for (const alias of g.a) {
                    window.customCharacterNames[alias] = g.n;
                }
            }

            // Also save to localStorage
            try {
                const saved = localStorage.getItem('studioGirlfriendName') || '{}';
                const data = JSON.parse(saved);
                const storySlug = window.currentStorySlug || 'default';
                data[storySlug] = g.n;
                localStorage.setItem('studioGirlfriendName', JSON.stringify(data));
            } catch (e) {}

            // Update Settings display
            if (window.Settings?.updateGirlfriendDisplay) {
                window.Settings.updateGirlfriendDisplay();
            }
        }

        // Restore player's nickname (MC)
        if (storySettingsData.p) {
            window.mcName = storySettingsData.p;
            window.customCharacterNames = window.customCharacterNames || {};
            window.customCharacterNames['mc'] = storySettingsData.p;

            // Also save to localStorage
            try {
                const saved = localStorage.getItem('studioMcName') || '{}';
                const data = JSON.parse(saved);
                const storySlug = window.currentStorySlug || 'default';
                data[storySlug] = storySettingsData.p;
                localStorage.setItem('studioMcName', JSON.stringify(data));
            } catch (e) {}

            // Update Settings display
            if (window.Settings?.updateMcDisplay) {
                window.Settings.updateMcDisplay();
            }
        }
    },

    /**
     * Restore story progression (conversations, unlocks, UI state)
     */
    async restoreProgress(progressData) {
        if (!progressData?.m || !window.Messenger) return;

        const m = progressData.m;
        const savedUnlockedFiles = [...(m.u || ['start.txt'])];

        // Save state to restore AFTER reloadData
        const savedContactsWithNew = new Set(m.w || []);
        const savedContactLastActivity = { ...(m.l || {}) };
        const savedActiveConversationKey = m.a || null;

        // 1. COMPLETE RESET of Messenger - reset everything to zero
        window.Messenger.unlockedFiles = savedUnlockedFiles;
        window.Messenger.unlockedInstaPosts = [...(m.i || [])];
        window.Messenger.unlockedSlutOnlyPosts = [...(m.o || [])];
        window.Messenger.conversationsByKey = {};
        window.Messenger.contactLastActivity = {};
        window.Messenger.parsedFiles = [];
        window.Messenger.contacts = [];
        window.Messenger.selectedKey = null;
        window.Messenger.nameToKey = {};
        window.Messenger.keyToName = {};

        // 2. Reload data from unlocked files ONLY
        await window.Messenger.reloadData();

        // 3. VERIFICATION AND CLEANUP: keep ONLY saved conversations
        const savedConvKeys = Object.keys(m.c || {});

        // Delete conversations not in the save
        for (const key of Object.keys(window.Messenger.conversationsByKey)) {
            if (!savedConvKeys.includes(key)) {
                delete window.Messenger.conversationsByKey[key];
            }
        }

        // Filter contacts to keep only those with valid conversations
        const validKeys = new Set(Object.keys(window.Messenger.conversationsByKey));
        window.Messenger.contacts = window.Messenger.contacts.filter(c => validKeys.has(c.key));

        // 4. Restore state of each conversation
        if (m.c && window.Messenger.conversationsByKey) {
            for (const [key, savedConv] of Object.entries(m.c)) {
                const conv = window.Messenger.conversationsByKey[key];
                if (!conv || !savedConv) continue;

                window.Messenger.replayToState(
                    conv,
                    savedConv.s || 0,        // scriptIndex
                    savedConv.n || 0,        // nextChoiceIdx
                    savedConv.h || [],       // choicesMade
                    savedConv.w || false,    // waitingForChoice
                    savedConv.a,             // activeChoiceIdx
                    savedConv.r || 0,        // nextRealChoiceIdx
                    savedConv.rw || false,   // waitingForRealChoice
                    savedConv.ra,            // activeRealChoiceIdx
                    savedConv.rh || [],      // realChoicesMade
                    savedConv.sp || null     // selectedPath
                );
            }
        }

        // 4b. Restore actionHistory for each conversation
        if (m.c && window.Messenger.conversationsByKey) {
            for (const [key, savedConv] of Object.entries(m.c)) {
                const conv = window.Messenger.conversationsByKey[key];
                if (!conv || !savedConv) continue;

                // Restore action history for back navigation
                conv.actionHistory = savedConv.ah ? [...savedConv.ah] : [];
            }
        }

        // 5. Restore UI states (unread indicators, activity order, active conversation)
        window.Messenger.contactsWithNew = savedContactsWithNew;
        window.Messenger.contactLastActivity = savedContactLastActivity;
        window.Messenger.activeConversationKey = savedActiveConversationKey;
        window.Messenger.conversationHistory = m.ch ? [...m.ch] : [];

        // 6. Restore selected conversation
        if (m.k && window.Messenger.conversationsByKey[m.k]) {
            window.Messenger.selectedKey = m.k;
        } else if (window.Messenger.contacts.length > 0) {
            window.Messenger.selectedKey = window.Messenger.contacts[0].key;
        }

        // 7. Re-render
        window.Messenger.renderContacts();
        window.Messenger.renderConversation();

        // Update other apps
        if (window.InstaPics?.render) window.InstaPics.render();
        if (window.OnlySlut?.render) window.OnlySlut.render();
        if (window.Gallery?.render) window.Gallery.render();

        // Restore Spy app state
        if (progressData.sp) {
            const sp = progressData.sp;
            window.spyAppUnlocked = sp.u || false;
            window.currentSpyAnchor = sp.a || 0;
            window.unlockedSpyInsta = [...(sp.i || [])];
            window.unlockedSpySlut = [...(sp.o || [])];
            window.spyAppsUnlocked = sp.apps ? { ...sp.apps } : { instapics: false, onlyslut: false };

            // Update home screen to show/hide spy icon
            const spyBtn = document.getElementById('openSpyBtn');
            if (spyBtn) {
                if (window.spyAppUnlocked) {
                    spyBtn.classList.remove('hidden');
                } else {
                    spyBtn.classList.add('hidden');
                }
            }

            // Re-initialize SpyMessenger if it exists and spy is unlocked
            if (window.spyAppUnlocked && window.SpyMessenger?.init) {
                window.SpyMessenger.init();
            }

            // Update Spy apps if they exist
            if (window.SpyInstaPics?.render) window.SpyInstaPics.render();
            if (window.SpyOnlySlut?.render) window.SpyOnlySlut.render();
            if (window.SpyGallery?.loadImages) window.SpyGallery.loadImages();
        }
    },

    /**
     * Create a new save
     */
    createSave(customDescription = null, automatic = false) {
        if (!this.storyTitle) {
            return null;
        }

        const now = new Date();
        const save = {
            id: this.generateId(),
            storyTitle: this.storyTitle,
            storyPath: this.storyPath,
            date: now.toISOString(),
            displayName: `${this.storyTitle}.${this.formatDate(now)}`,
            customDescription: customDescription || null,
            automatic: automatic,
            data: this.captureGameState()
        };

        this.saves.unshift(save); // Add to start of list
        this.persistSaves();
        this.render();
        return save;
    },

    /**
     * Quick save (called from quick save button)
     */
    quickSave(customDescription = null) {
        const save = this.createSave(customDescription, false);
        return !!save;
    },

    /**
     * Auto save
     * Limits the number of auto saves to maxAutoSaves
     */
    autoSave(reason = null) {
        if (!this.storyTitle || !this.storyPath) {
            return false;
        }

        const maxAutoSaves = 10; // Max number of auto saves per story

        // Create automatic description
        const description = reason || 'Auto save';

        // Create save with automatic flag
        const save = this.createSave(description, true);

        if (save) {
            // Clean up old auto saves for this story
            const autoSavesForStory = this.saves.filter(
                s => s.automatic && s.storyPath === this.storyPath
            );

            // Remove oldest if exceeding limit
            if (autoSavesForStory.length > maxAutoSaves) {
                const toRemove = autoSavesForStory.slice(maxAutoSaves);
                for (const oldSave of toRemove) {
                    this.saves = this.saves.filter(s => s.id !== oldSave.id);
                }
                this.persistSaves();
            }

            return true;
        }
        return false;
    },

    /**
     * Load a save
     */
    async loadSave(saveId) {
        const save = this.saves.find(s => s.id === saveId);
        if (!save) return;

        // IMPORTANT: Set up storyPath on all apps BEFORE restoring state
        // This ensures reloadData() has the correct path to load from
        if (save.storyPath) {
            const basePath = save.storyPath;

            // Set Messenger storyPath
            if (window.Messenger) {
                window.Messenger.storyPath = basePath + '/messenger';
            }

            // Set InstaPics storyPath
            if (window.InstaPics) {
                window.InstaPics.storyPath = basePath + '/instapics';
            }

            // Set OnlySlut storyPath
            if (window.OnlySlut) {
                window.OnlySlut.storyPath = basePath + '/onlyslut';
            }

            // Set Gallery storyPath
            if (window.Gallery) {
                window.Gallery.storyPath = basePath;
            }

            // Update SavesLoad's own storyPath
            this.storyPath = basePath;
            this.storyTitle = save.storyTitle;
        }

        if (save.data) {
            await this.restoreGameState(save.data, {
                restoreProgress: true,
                restoreSettings: !this.loadOptions.restoreSettings,
                restoreStorySettings: !this.loadOptions.restoreStorySettings
            });
        }

        this.loadOptions = { restoreSettings: true, restoreStorySettings: true };
    },

    /**
     * Overwrite an existing save
     */
    overwriteSave(saveId) {
        const index = this.saves.findIndex(s => s.id === saveId);
        if (index === -1) return;

        const now = new Date();
        this.saves[index] = {
            ...this.saves[index],
            storyTitle: this.storyTitle || this.saves[index].storyTitle,
            storyPath: this.storyPath || this.saves[index].storyPath,
            date: now.toISOString(),
            displayName: `${this.storyTitle || this.saves[index].storyTitle}.${this.formatDate(now)}`,
            data: this.captureGameState()
        };

        this.persistSaves();
        this.render();
        this.closeModal();
    },

    /**
     * Delete a save
     */
    deleteSave(saveId) {
        this.saves = this.saves.filter(s => s.id !== saveId);
        this.persistSaves();
        this.render();
        this.closeModal();
    },

    /**
     * Edit a save's description
     */
    editDescription(saveId, element) {
        const save = this.saves.find(s => s.id === saveId);
        if (!save) return;

        // Avoid opening multiple inputs
        if (element.querySelector('input')) return;

        const currentDesc = save.customDescription || '';
        const importedText = save.imported ? ' (imported)' : '';

        // Create input
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'savesload-item-desc-input';
        input.value = currentDesc;
        input.placeholder = 'Add a note...';

        // Replace content
        element.innerHTML = '';
        element.appendChild(input);
        input.focus();
        input.select();

        // Save on blur or Enter
        const saveDescription = () => {
            const newDesc = input.value.trim();
            save.customDescription = newDesc;
            this.persistSaves();
            this.render();
        };

        input.addEventListener('blur', saveDescription);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                this.render(); // Cancel without saving
            }
        });
    },

    /**
     * Export a save to compressed file (.sav)
     * Format: Minified JSON encoded in base64
     */
    exportSave(saveId) {
        const save = this.saves.find(s => s.id === saveId);
        if (!save) return;

        // Create compressed content (minified JSON + base64)
        const compressed = this.compressState(save);

        // Create blob
        const blob = new Blob([compressed], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);

        // Create safe filename with .sav extension
        const safeName = save.displayName
            .replace(/[^a-zA-Z0-9àâäéèêëïîôùûüç\s.-]/g, '')
            .replace(/\s+/g, '_');
        const filename = `${safeName}.sav`;

        // Create temporary link for download
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Release URL
        URL.revokeObjectURL(url);
    },

    /**
     * Copy text to clipboard and show toast
     */
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showToast(window.t('saves.cloud.copied'));
        } catch (e) {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            this.showToast(window.t('saves.cloud.copied'));
        }
    },

    /**
     * Show a toast notification at bottom
     */
    showToast(message) {
        // Remove existing toast if any
        const existing = this.root?.querySelector('.savesload-toast');
        if (existing) existing.remove();

        // Create toast
        const toast = document.createElement('div');
        toast.className = 'savesload-toast';
        toast.textContent = message;

        // Add to root
        if (this.root) {
            this.root.appendChild(toast);

            // Trigger animation
            requestAnimationFrame(() => {
                toast.classList.add('savesload-toast--visible');
            });

            // Remove after 2 seconds
            setTimeout(() => {
                toast.classList.remove('savesload-toast--visible');
                setTimeout(() => toast.remove(), 300);
            }, 2000);
        }
    },

    /**
     * Import a save from .sav or .json file
     * Supports both formats (compressed and legacy)
     */
    importSave(file) {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const content = e.target.result;
                let importedSave;

                // Try to decompress (.sav format)
                importedSave = this.decompressState(content);

                // If decompression fails, try direct JSON (legacy)
                if (!importedSave) {
                    try {
                        importedSave = JSON.parse(content);
                    } catch {
                        alert(window.t('saves.error.invalid'));
                        return;
                    }
                }

                // Basic structure validation
                if (!importedSave.storyTitle || !importedSave.date) {
                    alert(window.t('saves.error.invalid'));
                    return;
                }

                // Generate new ID to avoid conflicts
                importedSave.id = this.generateId();

                // Mark as imported (manual file import, NOT on cloud)
                importedSave.imported = true;
                importedSave.cloudSync = false;  // Manual imports are NOT on cloud

                // Add to start of list
                this.saves.unshift(importedSave);
                this.persistSaves();
                this.render();
            } catch (err) {
                alert(window.t('saves.error.read'));
            }
        };

        reader.onerror = () => {
            alert(window.t('saves.error.file'));
        };

        reader.readAsText(file);
    },

    /**
     * Toggle cloud sync for a save
     * When enabled: uploads save to cloud and gets a code
     * When disabled: removes save from cloud
     */
    async toggleCloudSync(saveId) {
        const save = this.saves.find(s => s.id === saveId);
        if (!save) return;

        // Once uploaded, cannot be disabled (save remains in cloud forever)
        if (save.cloudSync) {
            return; // Already synced, toggle is locked
        }

        // Enable cloud sync - upload to cloud
        await this.uploadToCloud(save);
    },

    /**
     * Upload a save to the cloud
     */
    async uploadToCloud(save) {
        try {
            // Compress save data
            const compressedData = this.compressState(save);

            const response = await fetch(`${this.cloudApiUrl}?action=save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: compressedData,
                    deviceId: this.getDeviceId()
                })
            });

            const result = await response.json();

            if (result.success) {
                save.cloudSync = true;
                save.cloudCode = result.code;
                this.persistSaves();
                this.render();
                this.showCloudCodeModal(result.code);
            } else {
                // Handle specific error types
                if (response.status === 503 || result.error === 'api.offline') {
                    // API offline (circuit breaker triggered)
                    this.showCloudErrorModal('saves.cloud.error.title', 'saves.cloud.error.offline');
                } else if (response.status === 429) {
                    // Rate limit exceeded
                    this.showCloudErrorModal('saves.cloud.error.ratelimit.title', 'saves.cloud.error.ratelimit');
                } else if (result.error && result.error.includes('too large')) {
                    // Save too large
                    this.showCloudErrorModal('saves.cloud.error.title', 'saves.cloud.error.toolarge');
                } else {
                    // Generic upload error
                    this.showCloudErrorModal('saves.cloud.error.title', 'saves.cloud.error.upload');
                }
            }
        } catch (e) {
            this.showCloudErrorModal('saves.cloud.error.title', 'saves.cloud.error.network');
        }
    },

    /**
     * Remove cloud sync status locally (does NOT delete from database)
     * Saves remain in the cloud so anyone with the code can still import them
     */
    async removeFromCloud(save) {
        // Just remove local cloud status, keep the save in the database
        save.cloudSync = false;
        // Keep cloudCode so user can see it was previously synced
        this.persistSaves();
        this.render();
    },

    /**
     * Show modal with the cloud code
     */
    showCloudCodeModal(code) {
        const modal = document.querySelector(".savesload-modal");
        if (!modal) return;

        const title = modal.querySelector(".savesload-modal-title");
        const text = modal.querySelector(".savesload-modal-text");
        const confirmBtn = modal.querySelector(".savesload-modal-btn-confirm");
        const cancelBtn = modal.querySelector(".savesload-modal-btn-cancel");

        title.textContent = window.t('saves.cloud.success.title') || 'Saved to Cloud!';
        text.innerHTML = `
            <div style="margin-bottom: 15px;">${window.t('saves.cloud.success.message') || 'Your save code is:'}</div>
            <div style="font-size: 28px; font-weight: bold; letter-spacing: 8px; color: #6366f1; margin: 15px 0;">${code}</div>
            <div style="font-size: 11px; opacity: 0.6;">${window.t('saves.cloud.success.hint') || 'Use this code to import your save on any device.'}</div>
        `;
        confirmBtn.textContent = window.t('btn.close') || 'Close';
        confirmBtn.className = 'savesload-modal-btn savesload-modal-btn-confirm confirm-load';
        cancelBtn.style.display = 'none';

        this.modalAction = 'cloud-code';
        modal.classList.remove("hidden");
    },

    /**
     * Show modal for cloud import (with input field)
     */
    showCloudImportModal() {
        const modal = document.querySelector(".savesload-modal");
        if (!modal) return;

        const title = modal.querySelector(".savesload-modal-title");
        const text = modal.querySelector(".savesload-modal-text");
        const confirmBtn = modal.querySelector(".savesload-modal-btn-confirm");
        const cancelBtn = modal.querySelector(".savesload-modal-btn-cancel");

        title.textContent = window.t('saves.cloud.import.title') || 'Import from Cloud';
        text.innerHTML = `
            <div style="margin-bottom: 12px;">${window.t('saves.cloud.import.prompt') || 'Enter your 5-letter code:'}</div>
            <input type="text" class="savesload-cloud-input" maxlength="5" placeholder="XXXXX" style="
                width: 100%;
                padding: 12px;
                font-size: 24px;
                font-family: 'Roboto Mono', 'SF Mono', 'Consolas', monospace;
                text-align: center;
                text-transform: uppercase;
                letter-spacing: 8px;
                background: rgba(255, 255, 255, 0.1);
                border: 2px solid rgba(99, 102, 241, 0.3);
                border-radius: 8px;
                color: #fff;
                outline: none;
                box-sizing: border-box;
            " />
            <div style="font-size: 11px; opacity: 0.5; margin-top: 10px;">${window.t('saves.cloud.import.hint') || 'The code was given when the save was uploaded.'}</div>
        `;
        confirmBtn.textContent = window.t('saves.cloud.import.btn') || 'Import';
        confirmBtn.className = 'savesload-modal-btn savesload-modal-btn-confirm confirm-load';
        cancelBtn.style.display = '';

        this.modalAction = 'cloud-import';
        modal.classList.remove("hidden");

        // Focus input and add event listeners
        setTimeout(() => {
            const input = modal.querySelector('.savesload-cloud-input');
            if (input) {
                input.focus();
                input.addEventListener('input', (e) => {
                    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
                });
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.confirmModalAction();
                    }
                });
            }
        }, 50);
    },

    /**
     * Show error modal for cloud operations
     */
    showCloudErrorModal(titleKey, messageKey, customTitle = null, customMessage = null) {
        const modal = document.querySelector(".savesload-modal");
        if (!modal) return;

        const title = modal.querySelector(".savesload-modal-title");
        const text = modal.querySelector(".savesload-modal-text");
        const confirmBtn = modal.querySelector(".savesload-modal-btn-confirm");
        const cancelBtn = modal.querySelector(".savesload-modal-btn-cancel");

        title.textContent = customTitle || window.t(titleKey) || 'Error';
        text.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 36px; margin-bottom: 15px;">⚠️</div>
                <div>${customMessage || window.t(messageKey) || 'An error occurred.'}</div>
            </div>
        `;
        confirmBtn.textContent = window.t('btn.close') || 'Close';
        confirmBtn.className = 'savesload-modal-btn savesload-modal-btn-confirm';
        cancelBtn.style.display = 'none';

        this.modalAction = 'cloud-error';
        modal.classList.remove("hidden");
    },

    /**
     * Show success modal for cloud import
     */
    showCloudImportSuccessModal() {
        const modal = document.querySelector(".savesload-modal");
        if (!modal) return;

        const title = modal.querySelector(".savesload-modal-title");
        const text = modal.querySelector(".savesload-modal-text");
        const confirmBtn = modal.querySelector(".savesload-modal-btn-confirm");
        const cancelBtn = modal.querySelector(".savesload-modal-btn-cancel");

        title.textContent = window.t('saves.cloud.import.title') || 'Import from Cloud';
        text.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 36px; margin-bottom: 15px;">✅</div>
                <div>${window.t('saves.cloud.import.success') || 'Save imported successfully!'}</div>
            </div>
        `;
        confirmBtn.textContent = window.t('btn.close') || 'Close';
        confirmBtn.className = 'savesload-modal-btn savesload-modal-btn-confirm confirm-load';
        cancelBtn.style.display = 'none';

        this.modalAction = 'cloud-success';
        modal.classList.remove("hidden");
    },

    /**
     * Process cloud import with the entered code
     */
    async processCloudImport(code) {
        const cleanCode = code.trim().toUpperCase();
        if (!/^[A-Z]{5}$/.test(cleanCode)) {
            this.showCloudErrorModal('saves.cloud.error.title', 'saves.cloud.error.invalidcode');
            return;
        }

        try {
            const response = await fetch(`${this.cloudApiUrl}?action=load`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: cleanCode })
            });

            const result = await response.json();

            if (result.success) {
                // Decompress and import the save
                const importedSave = this.decompressState(result.data);

                if (!importedSave || !importedSave.storyTitle) {
                    this.showCloudErrorModal('saves.cloud.error.title', 'saves.error.invalid');
                    return;
                }

                // Generate new local ID
                importedSave.id = this.generateId();
                importedSave.imported = false;        // Not a manual file import
                importedSave.cloudImported = true;    // Imported from cloud
                importedSave.cloudSync = false;       // Not actively synced (just a local copy)
                importedSave.cloudCode = cleanCode;   // Keep code for reference

                // Add to saves
                this.saves.unshift(importedSave);
                this.persistSaves();
                this.render();

                this.showCloudImportSuccessModal();
            } else {
                // Handle specific error types
                if (response.status === 503 || result.error === 'api.offline') {
                    // API offline (circuit breaker triggered)
                    this.showCloudErrorModal('saves.cloud.error.title', 'saves.cloud.error.offline');
                } else if (response.status === 429) {
                    // Rate limit exceeded
                    this.showCloudErrorModal('saves.cloud.error.ratelimit.title', 'saves.cloud.error.ratelimit');
                } else {
                    this.showCloudErrorModal('saves.cloud.error.title', 'saves.cloud.error.notfound');
                }
            }
        } catch (e) {
            this.showCloudErrorModal('saves.cloud.error.title', 'saves.cloud.error.network');
        }
    },

    /**
     * Import save from cloud using a code (opens modal)
     */
    importFromCloud() {
        this.showCloudImportModal();
    },

    /**
     * Mount the app DOM
     */
    mount() {
        if (this.root) return;

        const container = document.getElementById("savesloadScreen");
        if (!container) return;

        this.root = document.createElement("div");
        this.root.id = "savesload-app";
        this.root.innerHTML = `
            <header class="savesload-header">
                <span class="savesload-title" data-i18n="app.saves">Saves</span>
                <span class="savesload-counter">0</span>
            </header>
            <div class="savesload-actions">
                <button class="savesload-new-btn" type="button">
                    <span class="savesload-new-btn-icon">+</span>
                    <span data-i18n="quicksave.title">New save</span>
                </button>
                <div class="savesload-import-group">
                    <button class="savesload-import-btn" type="button">
                        ${this.icons.import}
                        <span data-i18n="saves.import.manual">Import (manual)</span>
                    </button>
                    <button class="savesload-import-cloud-btn" type="button">
                        ${this.icons.cloud}
                        <span data-i18n="saves.import.cloud">Import (cloud)</span>
                    </button>
                </div>
                <input type="file" class="savesload-file-input" accept=".sav,.json" style="display: none;">
            </div>
            <div class="savesload-filters">
                <button class="savesload-filter" data-filter="all" data-i18n="gallery.all">All</button>
                <button class="savesload-filter savesload-filter--active" data-filter="manual" data-i18n="saves.manual">Manual</button>
                <button class="savesload-filter" data-filter="automatic" data-i18n="saves.automatic">Automatic</button>
            </div>
            <main class="savesload-content">
                <div class="savesload-list"></div>
            </main>
        `;

        container.appendChild(this.root);

        // Confirmation modal
        let modal = document.querySelector(".savesload-modal");
        if (!modal) {
            const phoneFrame = document.querySelector(".phone-frame");
            if (phoneFrame) {
                modal = document.createElement("div");
                modal.className = "savesload-modal hidden";
                modal.innerHTML = `
                    <div class="savesload-modal-content">
                        <div class="savesload-modal-title" data-i18n="saves.confirm">Confirmation</div>
                        <div class="savesload-modal-text"></div>
                        <div class="savesload-modal-actions">
                            <button class="savesload-modal-btn savesload-modal-btn-cancel" type="button" data-i18n="btn.cancel">Cancel</button>
                            <button class="savesload-modal-btn savesload-modal-btn-confirm" type="button" data-i18n="btn.confirm">Confirm</button>
                        </div>
                    </div>
                `;
                phoneFrame.appendChild(modal);
            }
        }

        // Apply translations
        if (window.Translations && window.Translations.loaded) {
            window.Translations.updateDOM();
        }
    },

    /**
     * Attach events
     */
    attachEvents() {
        if (this.eventsAttached) return;

        const phoneFrame = document.querySelector('.phone-frame');
        if (!phoneFrame) return;

        phoneFrame.addEventListener("click", (e) => {
            // New save button
            const newBtn = e.target.closest(".savesload-new-btn");
            if (newBtn && this.root && this.root.contains(newBtn)) {
                this.createSave();
                return;
            }

            // Import button
            const importBtn = e.target.closest(".savesload-import-btn");
            if (importBtn && this.root && this.root.contains(importBtn)) {
                const fileInput = this.root.querySelector(".savesload-file-input");
                if (fileInput) {
                    fileInput.click();
                }
                return;
            }

            // Import cloud button
            const importCloudBtn = e.target.closest(".savesload-import-cloud-btn");
            if (importCloudBtn && this.root && this.root.contains(importCloudBtn)) {
                this.importFromCloud();
                return;
            }

            // Cloud badge click - copy code
            const cloudBadge = e.target.closest(".savesload-cloud-badge");
            if (cloudBadge && this.root && this.root.contains(cloudBadge)) {
                const code = cloudBadge.textContent.trim();
                this.copyToClipboard(code);
                return;
            }

            // Export button
            const exportBtn = e.target.closest(".savesload-btn-export");
            if (exportBtn && this.root && this.root.contains(exportBtn)) {
                const saveId = exportBtn.dataset.id;
                this.exportSave(saveId);
                return;
            }

            // Load button
            const loadBtn = e.target.closest(".savesload-btn-load");
            if (loadBtn && this.root && this.root.contains(loadBtn)) {
                const saveId = loadBtn.dataset.id;
                this.showModal('load', saveId);
                return;
            }

            // Overwrite button
            const overwriteBtn = e.target.closest(".savesload-btn-overwrite");
            if (overwriteBtn && this.root && this.root.contains(overwriteBtn)) {
                const saveId = overwriteBtn.dataset.id;
                this.showModal('overwrite', saveId);
                return;
            }

            // Delete button
            const deleteBtn = e.target.closest(".savesload-btn-delete");
            if (deleteBtn && this.root && this.root.contains(deleteBtn)) {
                const saveId = deleteBtn.dataset.id;
                this.showModal('delete', saveId);
                return;
            }

            // Click on description to edit
            const descEl = e.target.closest(".savesload-item-desc");
            if (descEl && this.root && this.root.contains(descEl)) {
                const saveId = descEl.dataset.id;
                this.editDescription(saveId, descEl);
                return;
            }

            // Click on filter
            const filterBtn = e.target.closest(".savesload-filter");
            if (filterBtn && this.root && this.root.contains(filterBtn)) {
                const filter = filterBtn.dataset.filter;
                this.setFilter(filter);
                return;
            }

            // Modal: cancel
            const cancelBtn = e.target.closest(".savesload-modal-btn-cancel");
            if (cancelBtn) {
                this.handleModalCancel();
                return;
            }

            // Modal: confirm
            const confirmBtn = e.target.closest(".savesload-modal-btn-confirm");
            if (confirmBtn) {
                this.confirmModalAction();
                return;
            }
        });

        // Close with Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' || e.key === 'Esc') {
                if (this.isModalOpen()) {
                    this.closeModal();
                    e.preventDefault();
                }
            }
        });

        // Event for file input (import)
        const fileInput = this.root.querySelector(".savesload-file-input");
        if (fileInput) {
            fileInput.addEventListener("change", (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.importSave(file);
                }
                // Reset input to allow reimporting same file
                e.target.value = '';
            });
        }

        // Long-press on export button to upload to cloud
        let longPressTimer = null;
        let longPressTriggered = false;

        const startLongPress = (e) => {
            const exportBtn = e.target.closest(".savesload-btn-export");
            if (!exportBtn || !this.root || !this.root.contains(exportBtn)) return;

            longPressTriggered = false;
            longPressTimer = setTimeout(() => {
                longPressTriggered = true;
                const saveId = exportBtn.dataset.id;
                const save = this.saves.find(s => s.id === saveId);
                if (save && !save.cloudCode) {
                    this.uploadToCloud(save);
                }
            }, 500);
        };

        const cancelLongPress = () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        };

        phoneFrame.addEventListener('mousedown', startLongPress);
        phoneFrame.addEventListener('mouseup', cancelLongPress);
        phoneFrame.addEventListener('mouseleave', cancelLongPress);
        phoneFrame.addEventListener('touchstart', startLongPress, { passive: true });
        phoneFrame.addEventListener('touchend', cancelLongPress);
        phoneFrame.addEventListener('touchcancel', cancelLongPress);

        // Prevent normal click if long-press was triggered
        phoneFrame.addEventListener('click', (e) => {
            if (longPressTriggered) {
                const exportBtn = e.target.closest(".savesload-btn-export");
                if (exportBtn) {
                    e.stopPropagation();
                    e.preventDefault();
                    longPressTriggered = false;
                }
            }
        }, true);

        this.eventsAttached = true;
    },

    /**
     * Show confirmation modal
     */
    showModal(action, saveId) {
        const modal = document.querySelector(".savesload-modal");
        if (!modal) return;

        this.modalAction = action;
        if (saveId !== undefined) {
            this.modalSaveId = saveId;
        }

        const save = this.saves.find(s => s.id === this.modalSaveId);
        const title = modal.querySelector(".savesload-modal-title");
        const text = modal.querySelector(".savesload-modal-text");
        const confirmBtn = modal.querySelector(".savesload-modal-btn-confirm");
        const cancelBtn = modal.querySelector(".savesload-modal-btn-cancel");

        // Reset classes and visibility
        confirmBtn.classList.remove('confirm-load', 'confirm-overwrite');
        cancelBtn.style.display = '';

        const saveName = this.escapeHtml(save?.displayName || 'this save');

        if (action === 'load') {
            // Reset load options for new load
            this.loadOptions = { restoreSettings: true, restoreStorySettings: true };
            title.textContent = window.t('saves.load.title');
            text.innerHTML = window.t('saves.load.message', { name: saveName }).replace(/\\n/g, '<br>');
            confirmBtn.textContent = window.t('saves.load.btn');
            confirmBtn.classList.add('confirm-load');
        } else if (action === 'load-ask-settings') {
            title.textContent = window.t('saves.load.settings.title');
            text.innerHTML = window.t('saves.load.settings.message');
            confirmBtn.textContent = window.t('btn.yes');
            cancelBtn.textContent = window.t('btn.no');
            confirmBtn.classList.add('confirm-load');
        } else if (action === 'load-ask-story-settings') {
            title.textContent = window.t('saves.load.storySettings.title');
            text.innerHTML = window.t('saves.load.storySettings.message');
            confirmBtn.textContent = window.t('btn.yes');
            cancelBtn.textContent = window.t('btn.no');
            confirmBtn.classList.add('confirm-load');
        } else if (action === 'overwrite') {
            title.textContent = window.t('saves.overwrite.title');
            text.innerHTML = window.t('saves.overwrite.message', { name: saveName }).replace(/\\n/g, '<br>');
            confirmBtn.textContent = window.t('saves.overwrite.btn');
            confirmBtn.classList.add('confirm-overwrite');
        } else if (action === 'delete') {
            title.textContent = window.t('saves.delete.title');
            text.innerHTML = window.t('saves.delete.message', { name: saveName });
            confirmBtn.textContent = window.t('saves.delete.btn');
        }

        modal.classList.remove("hidden");
    },

    /**
     * Close modal
     */
    closeModal() {
        const modal = document.querySelector(".savesload-modal");
        if (modal) {
            modal.classList.add("hidden");
            // Reset cancel button visibility and text
            const cancelBtn = modal.querySelector(".savesload-modal-btn-cancel");
            if (cancelBtn) {
                cancelBtn.style.display = '';
                cancelBtn.textContent = window.t('btn.cancel');
            }
        }
        this.modalAction = null;
        this.modalSaveId = null;
    },

    /**
     * Handle cancel button click (used for Yes/No questions)
     */
    handleModalCancel() {
        if (this.modalAction === 'load-ask-settings') {
            // User chose "No" - don't restore settings from save (keep current)
            this.loadOptions.restoreSettings = false;
            this.showModal('load-ask-story-settings');
        } else if (this.modalAction === 'load-ask-story-settings') {
            // User chose "No" - don't restore story settings from save (keep current)
            this.loadOptions.restoreStorySettings = false;
            this.executeLoad();
        } else {
            // Normal cancel - just close
            this.closeModal();
        }
    },

    /**
     * Execute the load with collected options
     */
    executeLoad() {
        const saveId = this.modalSaveId;  // Save ID before closeModal resets it
        this.closeModal();
        this.loadSave(saveId);
    },

    /**
     * Execute confirmed action
     */
    confirmModalAction() {
        if (!this.modalAction) return;

        if (this.modalAction === 'cloud-code' || this.modalAction === 'cloud-error' || this.modalAction === 'cloud-success') {
            // Just close the modal
            this.closeModal();
        } else if (this.modalAction === 'cloud-import') {
            // Get the code from the input and process import
            const modal = document.querySelector(".savesload-modal");
            const input = modal?.querySelector('.savesload-cloud-input');
            if (input && input.value) {
                this.closeModal();
                this.processCloudImport(input.value);
            }
        } else if (this.modalSaveId) {
            if (this.modalAction === 'load') {
                // First confirmation - proceed to ask about settings
                this.showModal('load-ask-settings');
            } else if (this.modalAction === 'load-ask-settings') {
                // User chose "Yes" - restore settings from save
                this.loadOptions.restoreSettings = true;
                this.showModal('load-ask-story-settings');
            } else if (this.modalAction === 'load-ask-story-settings') {
                // User chose "Yes" - restore story settings from save
                this.loadOptions.restoreStorySettings = true;
                this.executeLoad();
            } else if (this.modalAction === 'overwrite') {
                this.overwriteSave(this.modalSaveId);
            } else if (this.modalAction === 'delete') {
                this.deleteSave(this.modalSaveId);
            }
        }
    },

    /**
     * Check if modal is open
     */
    isModalOpen() {
        const modal = document.querySelector(".savesload-modal");
        return modal && !modal.classList.contains("hidden");
    },

    /**
     * Change active filter
     */
    setFilter(filter) {
        this.currentFilter = filter;
        this.renderFilters();
        this.renderList();
        this.updateCounter();
    },

    /**
     * Return filtered saves for current story and category
     */
    getFilteredSaves() {
        let filtered = this.saves;

        // Filter by story
        if (this.storyPath) {
            filtered = filtered.filter(save => save.storyPath === this.storyPath);
        }

        // Filter by category
        if (this.currentFilter === 'automatic') {
            filtered = filtered.filter(save => save.automatic === true);
        } else if (this.currentFilter === 'manual') {
            filtered = filtered.filter(save => !save.automatic);
        }

        return filtered;
    },

    /**
     * Complete render
     */
    render() {
        this.renderHeader();
        this.renderFilters();
        this.renderList();
        this.updateCounter();
    },

    /**
     * Render filters
     */
    renderFilters() {
        if (!this.root) return;
        const filters = this.root.querySelectorAll('.savesload-filter');
        filters.forEach(btn => {
            if (btn.dataset.filter === this.currentFilter) {
                btn.classList.add('savesload-filter--active');
            } else {
                btn.classList.remove('savesload-filter--active');
            }
        });
    },

    /**
     * Update header with story name
     */
    renderHeader() {
        if (!this.root) return;
        const titleEl = this.root.querySelector(".savesload-title");
        if (!titleEl) return;

        if (this.storyTitle) {
            titleEl.textContent = window.t('saves.title', { title: this.storyTitle });
        } else {
            titleEl.textContent = window.t('app.saves');
        }
    },

    /**
     * Render save list
     */
    renderList() {
        if (!this.root) return;

        const container = this.root.querySelector(".savesload-content");
        if (!container) return;

        const filteredSaves = this.getFilteredSaves();

        if (filteredSaves.length === 0) {
            let message = window.t('saves.nosaves');
            let subMessage = window.t('saves.createfirst');

            if (this.currentFilter === 'automatic') {
                message = window.t('saves.noauto');
                subMessage = window.t('saves.autohere');
            } else if (this.currentFilter === 'manual') {
                message = window.t('saves.nomanual');
                subMessage = window.t('saves.usebutton');
            } else if (this.storyTitle) {
                message = window.t('saves.nosavesfor', { title: this.storyTitle });
            }

            container.innerHTML = `
                <div class="savesload-empty">
                    <div class="savesload-empty-icon">💾</div>
                    <div>${message}</div>
                    <div style="font-size: 12px;">${subMessage}</div>
                </div>
            `;
            return;
        }

        const listHtml = filteredSaves.map(save => {
            const descText = save.customDescription || '-';
            // Different tags for import types
            let importedTag = '';
            if (save.cloudImported) {
                importedTag = ` ${window.t('saves.imported.cloud')}`;
            } else if (save.imported) {
                importedTag = ` ${window.t('saves.imported.manual')}`;
            }
            const autoTag = save.automatic ? ` ${window.t('saves.auto')}` : '';
            // Display only the date (without story name)
            const displayDate = this.formatDate(save.date);
            // Overwrite button only for non-automatic saves
            const overwriteBtn = save.automatic ? '' : `
                    <button class="savesload-btn savesload-btn-overwrite" data-id="${save.id}">
                        ${this.icons.overwrite}
                    </button>`;
            // Cloud code badge (only if uploaded)
            const cloudBadge = save.cloudCode
                ? `<div class="savesload-cloud-badge">${save.cloudCode}</div>`
                : '';
            return `
            <div class="savesload-item${save.automatic ? ' savesload-item--auto' : ''}" data-id="${save.id}">
                ${cloudBadge}
                <div class="savesload-item-info">
                    <span class="savesload-item-name">${this.escapeHtml(displayDate)}</span>
                    <div class="savesload-item-desc" data-id="${save.id}">${this.escapeHtml(descText)}${importedTag}${autoTag}</div>
                </div>
                <div class="savesload-item-actions">${overwriteBtn}
                    <button class="savesload-btn savesload-btn-export" data-id="${save.id}">
                        ${this.icons.export}
                    </button>
                    <button class="savesload-btn savesload-btn-load" data-id="${save.id}">
                        ${this.icons.load}
                    </button>
                    <button class="savesload-btn savesload-btn-delete" data-id="${save.id}">
                        ${this.icons.delete}
                    </button>
                </div>
            </div>
        `}).join('');

        container.innerHTML = `<div class="savesload-list">${listHtml}</div>`;
    },

    /**
     * Update counter
     */
    updateCounter() {
        if (!this.root) return;
        const counter = this.root.querySelector(".savesload-counter");
        if (!counter) return;
        counter.textContent = this.getFilteredSaves().length;
    },

    /**
     * Called when app is opened
     */
    onOpen() {
        this.loadSaves();

        // Apply translations
        if (window.Translations && window.Translations.loaded) {
            window.Translations.updateDOM();
        }
    },

    /**
     * Called when app is closed
     */
    onClose() {},

    /**
     * Escape HTML characters
     */
    escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
};
