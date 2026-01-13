// ============================================================
// AUTO-SCALE: Adapt phone size to screen on desktop
// ============================================================
(function initAutoScale() {
  const PHONE_HEIGHT = 780;       // Reference height in px
  const PHONE_WIDTH = 420;        // Reference width in px
  const TARGET_FILL = 0.92;       // Fill 92% of screen height
  const MOBILE_BREAKPOINT = 480;  // Don't apply on mobile

  function applyScale() {
    const phoneShell = document.querySelector('.phone-shell');
    if (!phoneShell) return;

    // Don't apply on mobile - CSS handles it
    if (window.innerWidth <= MOBILE_BREAKPOINT) {
      phoneShell.style.transform = '';
      phoneShell.style.transformOrigin = '';
      return;
    }

    // Target: phone fills TARGET_FILL % of viewport height
    const targetHeight = window.innerHeight * TARGET_FILL;
    const scale = targetHeight / PHONE_HEIGHT;

    phoneShell.style.transform = `scale(${scale})`;
    phoneShell.style.transformOrigin = 'center center';
  }

  // Apply on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyScale);
  } else {
    applyScale();
  }

  // Apply on resize with debounce
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(applyScale, 100);
  });
})();

// Wait for Loader to complete before initializing
function initApp() {
  // ============================================================
  // 1. Navigation between stories list and "phone" screen
  // ============================================================

  const phoneFrame    = document.querySelector('.phone-frame');
  const phonePages    = document.querySelector('#phonePages');
  const navRecentsBtn = document.querySelector('.nav-recents');
  const navHomeBtn    = document.querySelector('.nav-home');
  const navBackBtn    = document.querySelector('.nav-back');

  const storiesContainer = document.querySelector('#storiesContainer');

  // Patreon button (app)
  const patreonButton = document.querySelector('.app-patreon');

  // ----- Battery icon (the one we'll switch) -----
  // it's the .icon image that is NOT the wifi
  const batteryImg = document.querySelector('.status-icons img.icon:not(.wifi-icon)');
  const originalBatterySrc = batteryImg ? batteryImg.getAttribute('src') : null;
  const darkBatterySrc = 'assets/status_bar/battery_dark.svg';

  // Currently selected story
  let currentStory = null;
  let currentStoryInstapicsPath = null;
  let currentStoryOnlySlutPath = null;
  let currentStoryMessengerPath = null;

  // ============================================================
  // 1bis. Customizable names management (girlfriend + player)
  // ============================================================

  // Modal for custom names
  const characterNameModal = document.getElementById('characterNameModal');
  const stepGirlfriend = document.getElementById('stepGirlfriend');
  const stepMc = document.getElementById('stepMc');
  const girlfriendNameInput = document.getElementById('girlfriendNameInput');
  const girlfriendNameHint = document.getElementById('girlfriendNameHint');
  const confirmGirlfriendBtn = document.getElementById('confirmGirlfriendBtn');
  const mcNameInput = document.getElementById('mcNameInput');
  const confirmMcBtn = document.getElementById('confirmMcBtn');

  // Custom names storage: key -> customName
  // Exposed globally so Messenger can access it
  window.customCharacterNames = {};

  // Player's nickname (MC)
  window.mcName = 'John';

  // Info about the found customizable character
  let pendingCustomizableCharacter = null;
  let pendingStoryCallback = null;

  /**
   * Parse characters.txt to find customizable characters
   * Format: Girlfriend "Sarah" (gf.png) = gf
   * Returns { key, defaultName, genericName, aliases } or null
   */
  async function findCustomizableCharacter(messengerPath) {
    const url = `${messengerPath}/characters/characters.txt`;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;

      const txt = await res.text();
      const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

      for (const line of lines) {
        // Format with default name in quotes: GenericName "DefaultName" (avatar.png) = key
        const match = line.match(/^(.+?)\s+"(.+?)"\s*\((.+?)\)\s*=\s*(\S+)$/);
        if (match) {
          const genericName = match[1].trim();
          const defaultName = match[2].trim();
          const key = match[4].trim().toLowerCase();

          return {
            key,
            defaultName,
            genericName,
            aliases: [genericName.toLowerCase(), defaultName.toLowerCase(), key]
          };
        }
      }
    } catch (e) {
    }
    return null;
  }

  /**
   * Shows the modal with the MC step first
   */
  function showCharacterNameModal(gfDefaultName) {
    if (characterNameModal && mcNameInput) {
      // Pre-fill GF input for later
      if (girlfriendNameInput) {
        girlfriendNameInput.value = '';
        girlfriendNameInput.placeholder = gfDefaultName;
      }
      if (girlfriendNameHint) {
        girlfriendNameHint.textContent = `Leave empty for "${gfDefaultName}"`;
      }
      // Show MC step first, hide GF step
      if (stepMc) stepMc.classList.remove('hidden');
      if (stepGirlfriend) stepGirlfriend.classList.add('hidden');
      characterNameModal.classList.remove('hidden');
      // Pre-fill with saved name or empty
      const savedMcName = loadMcNameFromStorage();
      mcNameInput.value = savedMcName || '';
      setTimeout(() => mcNameInput.focus(), 100);
    }
  }

  /**
   * Switch to GF step (after MC)
   */
  function showGirlfriendStep() {
    if (stepMc) stepMc.classList.add('hidden');
    if (stepGirlfriend) stepGirlfriend.classList.remove('hidden');
    if (girlfriendNameInput) {
      setTimeout(() => girlfriendNameInput.focus(), 100);
    }
  }

  /**
   * Save girlfriend name to localStorage
   */
  function saveGirlfriendNameToStorage(name) {
    try {
      const saved = localStorage.getItem('studioGirlfriendName') || '{}';
      const data = JSON.parse(saved);
      const storySlug = window.currentStorySlug || 'default';
      data[storySlug] = name;
      localStorage.setItem('studioGirlfriendName', JSON.stringify(data));
    } catch (e) {
      
    }
  }

  /**
   * Load girlfriend name from localStorage
   */
  function loadGirlfriendNameFromStorage() {
    try {
      const saved = localStorage.getItem('studioGirlfriendName');
      if (!saved) return null;
      const data = JSON.parse(saved);
      const storySlug = window.currentStorySlug || 'default';
      return data[storySlug] || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Save MC nickname to localStorage
   */
  function saveMcNameToStorage(name) {
    try {
      const saved = localStorage.getItem('studioMcName') || '{}';
      const data = JSON.parse(saved);
      const storySlug = window.currentStorySlug || 'default';
      data[storySlug] = name;
      localStorage.setItem('studioMcName', JSON.stringify(data));
    } catch (e) {
      
    }
  }

  /**
   * Load MC nickname from localStorage
   */
  function loadMcNameFromStorage() {
    try {
      const saved = localStorage.getItem('studioMcName');
      if (!saved) return null;
      const data = JSON.parse(saved);
      const storySlug = window.currentStorySlug || 'default';
      return data[storySlug] || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Confirm MC nickname and switch to GF step (or finish if GF already saved)
   */
  function confirmMcName() {
    const customName = mcNameInput ? mcNameInput.value.trim() : '';
    const finalName = customName || 'John';

    // Store MC nickname
    window.mcName = finalName;
    window.customCharacterNames['mc'] = finalName;

    // Save to localStorage
    saveMcNameToStorage(finalName);

    

    // Check if GF name is already saved
    const savedGfName = loadGirlfriendNameFromStorage();
    if (savedGfName && pendingCustomizableCharacter) {
      // GF name already exists, use it and finish
      window.customCharacterNames[pendingCustomizableCharacter.key] = savedGfName;
      for (const alias of pendingCustomizableCharacter.aliases) {
        window.customCharacterNames[alias] = savedGfName;
      }
      window.customizableCharacterInfo = pendingCustomizableCharacter;

      

      // Close the modal
      if (characterNameModal) {
        characterNameModal.classList.add('hidden');
      }

      // Continue with story selection
      if (pendingStoryCallback) {
        pendingStoryCallback();
        pendingStoryCallback = null;
      }

      pendingCustomizableCharacter = null;
      return;
    }

    // Switch to GF step
    showGirlfriendStep();
  }

  /**
   * Confirm GF name and finish
   */
  function confirmGirlfriendName() {
    if (!pendingCustomizableCharacter) return;

    const customName = girlfriendNameInput.value.trim();
    const finalName = customName || pendingCustomizableCharacter.defaultName;

    // Store name for the key and all its aliases
    window.customCharacterNames[pendingCustomizableCharacter.key] = finalName;
    for (const alias of pendingCustomizableCharacter.aliases) {
      window.customCharacterNames[alias] = finalName;
    }

    // Expose customizable character info for Settings
    window.customizableCharacterInfo = pendingCustomizableCharacter;

    // Save to localStorage
    saveGirlfriendNameToStorage(finalName);

    

    // Close the modal
    if (characterNameModal) {
      characterNameModal.classList.add('hidden');
    }

    // Continue with story selection
    if (pendingStoryCallback) {
      pendingStoryCallback();
      pendingStoryCallback = null;
    }

    pendingCustomizableCharacter = null;
  }

  // Modal events - GF step
  if (confirmGirlfriendBtn) {
    confirmGirlfriendBtn.addEventListener('click', confirmGirlfriendName);
  }

  if (girlfriendNameInput) {
    girlfriendNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmGirlfriendName();
      }
    });
  }

  // Modal events - MC step
  if (confirmMcBtn) {
    confirmMcBtn.addEventListener('click', confirmMcName);
  }

  if (mcNameInput) {
    mcNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmMcName();
      }
    });
  }

  /**
   * Finalize story selection (called after name choice)
   */
  function finalizeStorySelection() {
    // Show quick save button
    updateQuickSaveVisibility();

    // Unblur the phone background
    if (phoneFrame) {
      phoneFrame.classList.add('phone-active');
    }

    // Show the "phone" page
    if (phonePages) {
      phonePages.classList.add('phone-pages--show-second');
    }

    // Start background music now that story is selected
    if (window.MusicPlayer && window.MusicPlayer.isInitialized && !window.MusicPlayer.isPlaying) {
      window.MusicPlayer.play();
    }

    // Restore spy anchor from localStorage to maintain consistency after page reload
    // This ensures SpyApp content matches what was previously unlocked
    if (typeof window.restoreSpyAnchor === 'function') {
      window.restoreSpyAnchor();
    }
  }

  async function handleStorySelection(story) {
    currentStory = story;

    // Try to guess the story folder name
    // stories.php may return story.folder, story.slug or story.id
    const slug = (story.folder || story.slug || story.id || '').trim();

    // Expose slug and title globally
    window.currentStorySlug = slug || 'default';
    window.currentStoryTitle = story.title || story.name || slug || null;

    if (slug) {
      currentStoryInstapicsPath = `stories/${slug}/instapics`;
      currentStoryOnlySlutPath = `stories/${slug}/onlyslut`;
      currentStoryMessengerPath = `stories/${slug}/messenger`;
    } else {
      currentStoryInstapicsPath = null;
      currentStoryOnlySlutPath = null;
      currentStoryMessengerPath = null;
    }

    // Reset custom names for this new story
    window.customCharacterNames = {};
    window.customizableCharacterInfo = null;

    // Check if there's a customizable character in this story
    if (currentStoryMessengerPath) {
      const customizable = await findCustomizableCharacter(currentStoryMessengerPath);

      if (customizable) {
        // Expose character info for Settings
        window.customizableCharacterInfo = customizable;

        // Check if names are already saved for this story
        const savedGfName = loadGirlfriendNameFromStorage();
        const savedMcName = loadMcNameFromStorage();

        if (savedGfName && savedMcName) {
          // Use saved names without showing the modal
          window.customCharacterNames[customizable.key] = savedGfName;
          for (const alias of customizable.aliases) {
            window.customCharacterNames[alias] = savedGfName;
          }
          window.mcName = savedMcName;
          window.customCharacterNames['mc'] = savedMcName;
          
          finalizeStorySelection();
          return;
        }

        // At least one name is missing, show the modal
        pendingCustomizableCharacter = customizable;
        pendingStoryCallback = finalizeStorySelection;

        // If MC name is saved but not GF, pre-fill MC and skip to GF step
        if (savedMcName && !savedGfName) {
          window.mcName = savedMcName;
          window.customCharacterNames['mc'] = savedMcName;
          showCharacterNameModal(customizable.defaultName);
          // Skip directly to GF step
          setTimeout(() => showGirlfriendStep(), 50);
        } else {
          // Show MC step first (default flow)
          showCharacterNameModal(customizable.defaultName);
        }
        return; // Rest will be called after confirmation
      }
    }

    // No customizable character, continue directly
    finalizeStorySelection();
  }

  // "Recent apps" button -> returns to stories list
  if (navRecentsBtn) {
    navRecentsBtn.addEventListener('click', () => {
      // close the app if it was open
      showHomeScreen();

      // Deselect the story
      currentStory = null;
      currentStoryInstapicsPath = null;
      currentStoryOnlySlutPath = null;
      currentStoryMessengerPath = null;

      // Reset global story variables
      window.currentStorySlug = null;
      window.currentStoryTitle = null;
      window.customizableCharacterInfo = null;
      window.customCharacterNames = {};

      // Hide quick save button
      updateQuickSaveVisibility();

      // Hide Spy app icon (will be restored on next story selection if unlocked)
      const spyBtn = document.getElementById('openSpyBtn');
      if (spyBtn) spyBtn.classList.add('hidden');

      if (phonePages) {
        phonePages.classList.remove('phone-pages--show-second');
      }
      if (phoneFrame) {
        phoneFrame.classList.remove('phone-active');
        phoneFrame.classList.remove('phone-app-white');
        phoneFrame.classList.remove('phone-app-dark');
      }
    });
  }

  // ============================================================
  // 2. InstaPics: opening / closing in phone screen
  // ============================================================

  const homeScreen       = document.getElementById('homeScreen');       // desktop with icons
  const instapicsScreen  = document.getElementById('instapicsScreen');  // InstaPics app screen
  const onlyslutScreen   = document.getElementById('onlyslutScreen');   // OnlySlut app screen
  const messengerScreen  = document.getElementById('messengerScreen');  // Messenger app screen
  const galleryScreen    = document.getElementById('galleryScreen');    // Gallery app screen
  const savesloadScreen  = document.getElementById('savesloadScreen');  // Saves & Load app screen
  const settingsScreen   = document.getElementById('settingsScreen');   // Settings app screen
  const tipsScreen       = document.getElementById('tipsScreen');       // Tips app screen
  const openInstapicsBtn = document.getElementById('openInstapicsBtn'); // InstaPics icon
  const openOnlySlutBtn  = document.getElementById('openOnlySlutBtn');  // OnlySlut icon
  const openMessengerBtn = document.getElementById('openMessengerBtn'); // Messenger icon
  const openGalleryBtn   = document.getElementById('openGalleryBtn');   // Gallery icon
  const openSavesLoadBtn = document.getElementById('openSavesLoadBtn'); // Saves & Load icon
  const openSettingsBtn  = document.querySelector('.app-settings');     // Settings icon
  const openTipsBtn      = document.getElementById('openTipsBtn');      // Tips icon
  const spyScreen        = document.getElementById('spyScreen');        // Spy app screen
  const openSpyBtn       = document.getElementById('openSpyBtn');       // Spy icon
  const disclaimerPopup  = document.getElementById('disclaimerPopup');  // Disclaimer popup
  const openDisclaimerBtn = document.getElementById('openDisclaimerBtn'); // Disclaimer icon
  const closeDisclaimerPopup = document.getElementById('closeDisclaimerPopup'); // Close disclaimer btn
  const disclaimerAgreeBtn = document.getElementById('disclaimerAgreeBtn'); // Agree btn
  const disclaimerDisagreeBtn = document.getElementById('disclaimerDisagreeBtn'); // Disagree btn

  function showHomeScreen() {
    if (!homeScreen) return;

    homeScreen.classList.remove('hidden');
    if (instapicsScreen) instapicsScreen.classList.add('hidden');
    if (onlyslutScreen) onlyslutScreen.classList.add('hidden');
    if (messengerScreen) messengerScreen.classList.add('hidden');
    if (galleryScreen) galleryScreen.classList.add('hidden');
    if (savesloadScreen) savesloadScreen.classList.add('hidden');
    if (settingsScreen) settingsScreen.classList.add('hidden');
    if (tipsScreen) tipsScreen.classList.add('hidden');
    if (spyScreen) spyScreen.classList.add('hidden');

    // Cleanup spy mode if it was active
    if (window.Spy && typeof window.Spy.cleanup === 'function') {
      window.Spy.cleanup();
    }

    // switch phone back to "wallpaper background" mode
    if (phoneFrame) {
      phoneFrame.classList.remove('phone-app-white');
      phoneFrame.classList.remove('phone-app-dark');
    }

    // restore battery to original light version
    if (batteryImg && originalBatterySrc) {
      batteryImg.setAttribute('src', originalBatterySrc);
    }
  }

  function showInstapics() {
    if (!homeScreen || !instapicsScreen) return;

    // Pause Messenger autoplay when leaving
    if (window.Messenger && typeof window.Messenger.onClose === 'function') {
      window.Messenger.onClose();
    }

    homeScreen.classList.add('hidden');
    instapicsScreen.classList.remove('hidden');
    if (onlyslutScreen) onlyslutScreen.classList.add('hidden');
    if (messengerScreen) messengerScreen.classList.add('hidden');
    if (galleryScreen) galleryScreen.classList.add('hidden');
    if (savesloadScreen) savesloadScreen.classList.add('hidden');
    if (settingsScreen) settingsScreen.classList.add('hidden');
    if (tipsScreen) tipsScreen.classList.add('hidden');
    if (spyScreen) spyScreen.classList.add('hidden');

    // force a uniform white background for the app
    if (phoneFrame) {
      phoneFrame.classList.add('phone-app-white');
      phoneFrame.classList.remove('phone-app-dark');
    }

    // switch battery to dark version
    if (batteryImg) {
      batteryImg.setAttribute('src', darkBatterySrc);
    }
  }

  // OnlySlut screen with white background (like InstaPics)
  function showOnlySlut() {
    if (!homeScreen || !onlyslutScreen) return;

    // Pause Messenger autoplay when leaving
    if (window.Messenger && typeof window.Messenger.onClose === 'function') {
      window.Messenger.onClose();
    }

    homeScreen.classList.add('hidden');
    onlyslutScreen.classList.remove('hidden');
    if (instapicsScreen) instapicsScreen.classList.add('hidden');
    if (messengerScreen) messengerScreen.classList.add('hidden');
    if (galleryScreen) galleryScreen.classList.add('hidden');
    if (savesloadScreen) savesloadScreen.classList.add('hidden');
    if (settingsScreen) settingsScreen.classList.add('hidden');
    if (tipsScreen) tipsScreen.classList.add('hidden');
    if (spyScreen) spyScreen.classList.add('hidden');

    // force a uniform white background for the app
    if (phoneFrame) {
      phoneFrame.classList.add('phone-app-white');
      phoneFrame.classList.remove('phone-app-dark');
    }

    // switch battery to dark version
    if (batteryImg) {
      batteryImg.setAttribute('src', darkBatterySrc);
    }
  }

  // new function: Messenger screen with dark background
  function showMessenger() {
    if (!homeScreen || !messengerScreen) return;

    homeScreen.classList.add('hidden');
    messengerScreen.classList.remove('hidden');
    if (instapicsScreen) instapicsScreen.classList.add('hidden');
    if (onlyslutScreen) onlyslutScreen.classList.add('hidden');
    if (galleryScreen) galleryScreen.classList.add('hidden');
    if (savesloadScreen) savesloadScreen.classList.add('hidden');
    if (settingsScreen) settingsScreen.classList.add('hidden');
    if (tipsScreen) tipsScreen.classList.add('hidden');
    if (spyScreen) spyScreen.classList.add('hidden');

    // dark background + texture (handled in CSS)
    if (phoneFrame) {
      phoneFrame.classList.add('phone-app-dark');
      phoneFrame.classList.remove('phone-app-white');
    }

    // on Messenger we keep the original light battery
    if (batteryImg && originalBatterySrc) {
      batteryImg.setAttribute('src', originalBatterySrc);
    }
  }

  // new function: Gallery screen with dark background (like Messenger)
  function showGallery() {
    if (!homeScreen || !galleryScreen) return;

    // Pause Messenger autoplay when leaving
    if (window.Messenger && typeof window.Messenger.onClose === 'function') {
      window.Messenger.onClose();
    }

    homeScreen.classList.add('hidden');
    galleryScreen.classList.remove('hidden');
    if (instapicsScreen) instapicsScreen.classList.add('hidden');
    if (onlyslutScreen) onlyslutScreen.classList.add('hidden');
    if (messengerScreen) messengerScreen.classList.add('hidden');
    if (savesloadScreen) savesloadScreen.classList.add('hidden');
    if (settingsScreen) settingsScreen.classList.add('hidden');
    if (tipsScreen) tipsScreen.classList.add('hidden');
    if (spyScreen) spyScreen.classList.add('hidden');

    // dark background (like Messenger)
    if (phoneFrame) {
      phoneFrame.classList.add('phone-app-dark');
      phoneFrame.classList.remove('phone-app-white');
    }

    // keep the original light battery
    if (batteryImg && originalBatterySrc) {
      batteryImg.setAttribute('src', originalBatterySrc);
    }
  }

  // new function: Saves & Load screen with dark background (like Messenger)
  function showSavesLoad() {
    if (!homeScreen || !savesloadScreen) return;

    // Pause Messenger autoplay when leaving
    if (window.Messenger && typeof window.Messenger.onClose === 'function') {
      window.Messenger.onClose();
    }

    homeScreen.classList.add('hidden');
    savesloadScreen.classList.remove('hidden');
    if (instapicsScreen) instapicsScreen.classList.add('hidden');
    if (onlyslutScreen) onlyslutScreen.classList.add('hidden');
    if (messengerScreen) messengerScreen.classList.add('hidden');
    if (galleryScreen) galleryScreen.classList.add('hidden');
    if (settingsScreen) settingsScreen.classList.add('hidden');
    if (tipsScreen) tipsScreen.classList.add('hidden');
    if (spyScreen) spyScreen.classList.add('hidden');

    // dark background (like Messenger)
    if (phoneFrame) {
      phoneFrame.classList.add('phone-app-dark');
      phoneFrame.classList.remove('phone-app-white');
    }

    // keep the original light battery
    if (batteryImg && originalBatterySrc) {
      batteryImg.setAttribute('src', originalBatterySrc);
    }
  }

  // new function: Settings screen with dark background (like Messenger)
  function showSettings() {
    if (!homeScreen || !settingsScreen) return;

    // Pause Messenger autoplay when leaving
    if (window.Messenger && typeof window.Messenger.onClose === 'function') {
      window.Messenger.onClose();
    }

    homeScreen.classList.add('hidden');
    settingsScreen.classList.remove('hidden');
    if (instapicsScreen) instapicsScreen.classList.add('hidden');
    if (onlyslutScreen) onlyslutScreen.classList.add('hidden');
    if (messengerScreen) messengerScreen.classList.add('hidden');
    if (galleryScreen) galleryScreen.classList.add('hidden');
    if (savesloadScreen) savesloadScreen.classList.add('hidden');
    if (tipsScreen) tipsScreen.classList.add('hidden');
    if (spyScreen) spyScreen.classList.add('hidden');

    // dark background (like Messenger)
    if (phoneFrame) {
      phoneFrame.classList.add('phone-app-dark');
      phoneFrame.classList.remove('phone-app-white');
    }

    // keep the original light battery
    if (batteryImg && originalBatterySrc) {
      batteryImg.setAttribute('src', originalBatterySrc);
    }
  }

  // new function: Tips screen with dark background
  function showTips() {
    if (!homeScreen || !tipsScreen) return;

    // Pause Messenger autoplay when leaving
    if (window.Messenger && typeof window.Messenger.onClose === 'function') {
      window.Messenger.onClose();
    }

    homeScreen.classList.add('hidden');
    tipsScreen.classList.remove('hidden');
    if (instapicsScreen) instapicsScreen.classList.add('hidden');
    if (onlyslutScreen) onlyslutScreen.classList.add('hidden');
    if (messengerScreen) messengerScreen.classList.add('hidden');
    if (galleryScreen) galleryScreen.classList.add('hidden');
    if (savesloadScreen) savesloadScreen.classList.add('hidden');
    if (settingsScreen) settingsScreen.classList.add('hidden');
    if (spyScreen) spyScreen.classList.add('hidden');

    // dark background (like Messenger)
    if (phoneFrame) {
      phoneFrame.classList.add('phone-app-dark');
      phoneFrame.classList.remove('phone-app-white');
    }

    // keep the original light battery
    if (batteryImg && originalBatterySrc) {
      batteryImg.setAttribute('src', originalBatterySrc);
    }
  }

  // new function: Spy screen with dark background
  function showSpy() {
    if (!homeScreen || !spyScreen) return;

    // Pause Messenger autoplay when leaving
    if (window.Messenger && typeof window.Messenger.onClose === 'function') {
      window.Messenger.onClose();
    }

    homeScreen.classList.add('hidden');
    spyScreen.classList.remove('hidden');
    if (instapicsScreen) instapicsScreen.classList.add('hidden');
    if (onlyslutScreen) onlyslutScreen.classList.add('hidden');
    if (messengerScreen) messengerScreen.classList.add('hidden');
    if (galleryScreen) galleryScreen.classList.add('hidden');
    if (savesloadScreen) savesloadScreen.classList.add('hidden');
    if (settingsScreen) settingsScreen.classList.add('hidden');
    if (tipsScreen) tipsScreen.classList.add('hidden');

    // dark background (like Messenger)
    if (phoneFrame) {
      phoneFrame.classList.add('phone-app-dark');
      phoneFrame.classList.remove('phone-app-white');
    }

    // keep the original light battery
    if (batteryImg && originalBatterySrc) {
      batteryImg.setAttribute('src', originalBatterySrc);
    }
  }

  // Global function to show a screen (callable from other modules)
  window.showScreen = function(screenName) {
    switch (screenName) {
      case 'home':
        showHomeScreen();
        break;
      case 'messenger':
        showMessenger();
        break;
      case 'instapics':
        showInstapics();
        break;
      case 'onlyslut':
        showOnlySlut();
        break;
      case 'gallery':
        showGallery();
        break;
      case 'savesload':
        showSavesLoad();
        break;
      case 'settings':
        showSettings();
        break;
      case 'tips':
        showTips();
        break;
      case 'spy':
        showSpy();
        break;
      default:

    }
  };

  // Click on InstaPics icon: open the app
  if (openInstapicsBtn) {
    openInstapicsBtn.addEventListener('click', () => {
      if (!currentStoryInstapicsPath) {
        alert(window.t('alert.instapics'));
        return;
      }

      showInstapics();

      // Load / reload content from the current story folder
      if (window.InstaPics && typeof window.InstaPics.init === 'function') {
        window.InstaPics.init(currentStoryInstapicsPath);
      }

      if (window.InstaPics && typeof window.InstaPics.onOpen === 'function') {
        window.InstaPics.onOpen();
      }
    });
  }

  // Click on OnlySlut icon: open the app
  if (openOnlySlutBtn) {
    openOnlySlutBtn.addEventListener('click', () => {
      if (!currentStoryOnlySlutPath) {
        alert(window.t('alert.onlyslut'));
        return;
      }

      showOnlySlut();

      // Load / reload content from the current story folder
      if (window.OnlySlut && typeof window.OnlySlut.init === 'function') {
        window.OnlySlut.init(currentStoryOnlySlutPath);
      }

      if (window.OnlySlut && typeof window.OnlySlut.onOpen === 'function') {
        window.OnlySlut.onOpen();
      }
    });
  }

  // Click on Messenger icon: open the app
  if (openMessengerBtn) {
    openMessengerBtn.addEventListener('click', () => {
      // Check that a story is selected
      if (!currentStoryMessengerPath) {
        alert(window.t('alert.messenger'));
        return;
      }

      showMessenger();

      // Pass the messenger folder path of the story
      if (window.Messenger && typeof window.Messenger.init === 'function') {
        window.Messenger.init(currentStoryMessengerPath);
      }

      // Resume autoplay if it was active
      if (window.Messenger && typeof window.Messenger.onOpen === 'function') {
        window.Messenger.onOpen();
      }
    });
  }

  // Click on Gallery icon: open the app
  if (openGalleryBtn) {
    openGalleryBtn.addEventListener('click', () => {
      // Check that a story is selected
      if (!currentStory) {
        alert(window.t('alert.gallery'));
        return;
      }

      showGallery();

      // Initialize Gallery with the story path
      const slug = (currentStory.folder || currentStory.slug || currentStory.id || '').trim();
      const storyPath = slug ? `stories/${slug}` : null;

      if (window.Gallery && typeof window.Gallery.init === 'function') {
        window.Gallery.init(storyPath);
      }

      if (window.Gallery && typeof window.Gallery.onOpen === 'function') {
        window.Gallery.onOpen();
      }
    });
  }

  // Click on Saves & Load icon: open the app
  if (openSavesLoadBtn) {
    openSavesLoadBtn.addEventListener('click', () => {
      showSavesLoad();

      // Get the current story title
      const storyTitle = currentStory ? (currentStory.title || currentStory.folder || currentStory.id || 'Story') : null;
      const slug = currentStory ? (currentStory.folder || currentStory.slug || currentStory.id || '').trim() : null;
      const storyPath = slug ? `stories/${slug}` : null;

      if (window.SavesLoad && typeof window.SavesLoad.init === 'function') {
        window.SavesLoad.init(storyPath, storyTitle);
      }

      if (window.SavesLoad && typeof window.SavesLoad.onOpen === 'function') {
        window.SavesLoad.onOpen();
      }
    });
  }

  // Click on Settings icon: open the app
  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', () => {
      showSettings();

      // Initialize Settings if needed
      if (window.Settings && typeof window.Settings.init === 'function') {
        window.Settings.init();
      }

      if (window.Settings && typeof window.Settings.onOpen === 'function') {
        window.Settings.onOpen();
      }
    });
  }

  // Click on Tips icon: open the app
  if (openTipsBtn) {
    openTipsBtn.addEventListener('click', () => {
      showTips();

      // Initialize Tips if needed
      if (window.Tips && typeof window.Tips.init === 'function') {
        window.Tips.init();
      }

      if (window.Tips && typeof window.Tips.onOpen === 'function') {
        window.Tips.onOpen();
      }
    });
  }

  // Click on Disclaimer icon: open the popup
  if (openDisclaimerBtn && disclaimerPopup) {
    openDisclaimerBtn.addEventListener('click', () => {
      disclaimerPopup.classList.remove('hidden');
      // Trigger reflow for transition
      void disclaimerPopup.offsetWidth;
      disclaimerPopup.classList.add('visible');
    });
  }

  // Close disclaimer popup (X button)
  if (closeDisclaimerPopup && disclaimerPopup) {
    closeDisclaimerPopup.addEventListener('click', () => {
      disclaimerPopup.classList.remove('visible');
      setTimeout(() => {
        disclaimerPopup.classList.add('hidden');
      }, 300);
    });
  }

  // Disclaimer agree button: close popup and continue
  if (disclaimerAgreeBtn && disclaimerPopup) {
    disclaimerAgreeBtn.addEventListener('click', () => {
      disclaimerPopup.classList.remove('visible');
      setTimeout(() => {
        disclaimerPopup.classList.add('hidden');
      }, 300);
    });
  }

  // Disclaimer disagree button: redirect to Google
  if (disclaimerDisagreeBtn) {
    disclaimerDisagreeBtn.addEventListener('click', () => {
      window.location.href = 'https://www.google.com';
    });
  }

  // Click on Spy icon: open the app
  if (openSpyBtn) {
    openSpyBtn.addEventListener('click', () => {
      // Check that a story is selected
      if (!currentStory) {
        alert(window.t('alert.spy') || 'Please select a story first.');
        return;
      }

      showSpy();

      // Initialize Spy with the story path
      const slug = (currentStory.folder || currentStory.slug || currentStory.id || '').trim();
      const storyPath = slug ? `stories/${slug}` : null;

      if (window.Spy && typeof window.Spy.init === 'function') {
        window.Spy.init(storyPath);
      }
    });
  }

  // Phone HOME button: returns to apps desktop
  if (navHomeBtn) {
    navHomeBtn.addEventListener('click', () => {
      // If an InstaPics popup is open, close it first
      if (window.InstaPics && typeof window.InstaPics.closeModal === 'function') {
        window.InstaPics.closeModal();
      }

      // If an OnlySlut popup is open, close it first
      if (window.OnlySlut && typeof window.OnlySlut.closeModal === 'function') {
        window.OnlySlut.closeModal();
      }

      // If the Messenger lightbox is open, close it first
      if (window.Messenger && window.Messenger.lightboxOpen) {
        window.Messenger.closeLightbox();
      }

      // If the Gallery modal is open, close it first
      if (window.Gallery && typeof window.Gallery.closeModal === 'function') {
        window.Gallery.closeModal();
      }

      // If the SavesLoad modal is open, close it first
      if (window.SavesLoad && typeof window.SavesLoad.closeModal === 'function') {
        window.SavesLoad.closeModal();
      }

      // If the Settings modal is open, close it first
      if (window.Settings && window.Settings.modalOpen) {
        window.Settings.closeWallpaperModal();
      }

      // If in Spy mode, cleanup
      if (window.Spy && typeof window.Spy.cleanup === 'function') {
        window.Spy.cleanup();
      }

      showHomeScreen();

      if (window.InstaPics && typeof window.InstaPics.onClose === 'function') {
        window.InstaPics.onClose();
      }
      if (window.OnlySlut && typeof window.OnlySlut.onClose === 'function') {
        window.OnlySlut.onClose();
      }
      if (window.Messenger && typeof window.Messenger.onClose === 'function') {
        window.Messenger.onClose();
      }
      if (window.Gallery && typeof window.Gallery.onClose === 'function') {
        window.Gallery.onClose();
      }
      if (window.SavesLoad && typeof window.SavesLoad.onClose === 'function') {
        window.SavesLoad.onClose();
      }
      if (window.Settings && typeof window.Settings.onClose === 'function') {
        window.Settings.onClose();
      }
    });
  }

  // BACK button:
  // - if Messenger lightbox open -> close lightbox
  // - if in Messenger (no lightbox) -> do nothing
  // - if Gallery modal open -> close modal
  // - if in Gallery (no modal) -> do nothing
  // - if SavesLoad modal open -> close modal
  // - if in SavesLoad (no modal) -> do nothing
  // - if Settings modal open -> close modal
  // - if in Settings (no modal) -> do nothing
  // - if InstaPics/OnlySlut modal open -> close modal
  // - if InstaPics/OnlySlut no modal -> reset feed
  if (navBackBtn) {
    navBackBtn.addEventListener('click', () => {
      // If the Messenger lightbox is open, close it
      if (window.Messenger && window.Messenger.lightboxOpen) {
        window.Messenger.closeLightbox();
        return;
      }

      // If in Messenger (no lightbox), back does nothing
      if (messengerScreen && !messengerScreen.classList.contains('hidden')) {
        return;
      }

      // If in Gallery
      if (galleryScreen && !galleryScreen.classList.contains('hidden')) {
        // If the modal is open, close it
        if (window.Gallery &&
            typeof window.Gallery.isModalOpen === 'function' &&
            window.Gallery.isModalOpen()) {
          if (typeof window.Gallery.closeModal === 'function') {
            window.Gallery.closeModal();
          }
        }
        // Otherwise, back does nothing (like Messenger)
        return;
      }

      // If in SavesLoad
      if (savesloadScreen && !savesloadScreen.classList.contains('hidden')) {
        // If the modal is open, close it
        if (window.SavesLoad &&
            typeof window.SavesLoad.isModalOpen === 'function' &&
            window.SavesLoad.isModalOpen()) {
          if (typeof window.SavesLoad.closeModal === 'function') {
            window.SavesLoad.closeModal();
          }
        }
        // Otherwise, back does nothing (like Messenger)
        return;
      }

      // If in Settings
      if (settingsScreen && !settingsScreen.classList.contains('hidden')) {
        // If the wallpaper modal is open, close it
        if (window.Settings && window.Settings.modalOpen) {
          window.Settings.closeWallpaperModal();
        }
        // Otherwise, back does nothing (like Messenger)
        return;
      }

      if (instapicsScreen && !instapicsScreen.classList.contains('hidden')) {
        // In InstaPics
        if (window.InstaPics &&
            typeof window.InstaPics.isModalOpen === 'function' &&
            window.InstaPics.isModalOpen()) {
          // First back: close the popup
          if (typeof window.InstaPics.closeModal === 'function') {
            window.InstaPics.closeModal();
          }
        } else {
          // No popup: return to main feed
          if (window.InstaPics && typeof window.InstaPics.resetFilter === 'function') {
            window.InstaPics.resetFilter();
          }
        }
        return;
      }

      if (onlyslutScreen && !onlyslutScreen.classList.contains('hidden')) {
        // In OnlySlut
        if (window.OnlySlut &&
            typeof window.OnlySlut.isModalOpen === 'function' &&
            window.OnlySlut.isModalOpen()) {
          // First back: close the popup
          if (typeof window.OnlySlut.closeModal === 'function') {
            window.OnlySlut.closeModal();
          }
        } else {
          // No popup: return to main feed
          if (window.OnlySlut && typeof window.OnlySlut.resetFilter === 'function') {
            window.OnlySlut.resetFilter();
          }
        }
        return;
      }

      // If in Spy screen
      if (spyScreen && !spyScreen.classList.contains('hidden')) {
        // If not on home screen of spy, go back to spy home
        if (window.Spy && window.Spy.currentScreen !== 'home') {
          window.Spy.showHomeScreen();
        }
        // Otherwise, back does nothing (like Messenger)
        return;
      }
    });
  }

  // ============================================================
  // 3. Dynamic loading of stories from stories.php
  // ============================================================

  function createStoryCard(story) {
    const article = document.createElement('article');
    article.className = 'story-card';

    const iconDiv = document.createElement('div');
    iconDiv.className = 'story-icon';

    if (story.icon) {
      const img = document.createElement('img');
      img.src = story.icon;
      img.alt = story.title || '';
      iconDiv.appendChild(img);
    } else {
      iconDiv.textContent = story.initials || '?';
    }

    const infoDiv = document.createElement('div');

    const titleEl = document.createElement('h2');
    titleEl.className = 'story-title';
    titleEl.textContent = story.title || 'Story';

    const descEl = document.createElement('p');
    descEl.className = 'story-description';
    descEl.textContent = story.description || '';

    infoDiv.appendChild(titleEl);
    infoDiv.appendChild(descEl);

    const arrowDiv = document.createElement('div');
    arrowDiv.className = 'story-arrow';
    const arrowImg = document.createElement('img');
    arrowImg.src = 'assets/system/arrow-right.svg';
    arrowImg.alt = '';
    arrowImg.className = 'arrow-icon';
    arrowDiv.appendChild(arrowImg);

    article.appendChild(iconDiv);
    article.appendChild(infoDiv);
    article.appendChild(arrowDiv);

    article.addEventListener('click', () => {
      // Pass the full object to deduce the Instapics folder
      handleStorySelection(story);
    });

    return article;
  }

  function loadStoriesFromPhp() {
    if (!storiesContainer) return;

    fetch('stories.php')
      .then(response => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(data => {
        storiesContainer.innerHTML = '';
        data.forEach(story => {
          const card = createStoryCard(story);
          storiesContainer.appendChild(card);
        });
      })
      .catch(() => {});
  }

  loadStoriesFromPhp();

  // ============================================================
  // 4. Patreon button (placeholder)
  // ============================================================

  if (patreonButton) {
    patreonButton.addEventListener('click', () => {
      window.open('https://www.patreon.com/c/NTREmperor', '_blank');
    });
  }

  // ============================================================
  // 4 bis. Quick Save button
  // ============================================================

  const quickSaveBtn = document.getElementById('quickSaveBtn');
  const quickSaveModal = document.getElementById('quickSaveModal');
  const quickSaveInput = document.getElementById('quickSaveInput');
  const quickSaveConfirmBtn = document.querySelector('.quick-save-modal-confirm');
  const quickSaveCancelBtn = document.querySelector('.quick-save-modal-cancel');
  const quickSaveBackdrop = document.querySelector('.quick-save-modal-backdrop');

  let quickSaveLongPressTimer = null;
  let quickSaveIsLongPress = false;

  // Controls container (quick-save + volume)
  const statusControls = document.getElementById('statusControls');

  // Show/hide controls depending on whether a story is selected
  function updateQuickSaveVisibility() {
    if (statusControls) {
      if (currentStory) {
        statusControls.classList.remove('hidden');
      } else {
        statusControls.classList.add('hidden');
      }
    }
  }

  // Open save modal
  function openQuickSaveModal() {
    if (quickSaveModal && quickSaveInput) {
      quickSaveInput.value = '';
      quickSaveModal.classList.remove('hidden');
      setTimeout(() => quickSaveInput.focus(), 100);
    }
  }

  // Close save modal
  function closeQuickSaveModal() {
    if (quickSaveModal) {
      quickSaveModal.classList.add('hidden');
    }
  }

  // Perform save (with or without name)
  function doQuickSave(customDescription = null) {
    if (!currentStory) {
      
      return;
    }

    // Make sure SavesLoad has the right info
    const storyTitle = currentStory.title || currentStory.folder || currentStory.id || 'Story';
    const slug = (currentStory.folder || currentStory.slug || currentStory.id || '').trim();
    const storyPath = slug ? `stories/${slug}` : null;

    if (window.SavesLoad) {
      window.SavesLoad.setStory(storyPath, storyTitle);

      const success = window.SavesLoad.quickSave(customDescription);
      if (success && quickSaveBtn) {
        // Confirmation animation (flash)
        quickSaveBtn.classList.add('saving');
        setTimeout(() => {
          quickSaveBtn.classList.remove('saving');
        }, 1200);
      }
    }
  }

  // Quick save function
  function performQuickSave(withModal = false) {
    if (!currentStory) {
      
      return;
    }

    if (withModal) {
      openQuickSaveModal();
    } else {
      doQuickSave(null);
    }
  }

  // Modal events
  if (quickSaveConfirmBtn) {
    quickSaveConfirmBtn.addEventListener('click', () => {
      const name = quickSaveInput ? quickSaveInput.value.trim() || null : null;
      closeQuickSaveModal();
      doQuickSave(name);
    });
  }

  if (quickSaveCancelBtn) {
    quickSaveCancelBtn.addEventListener('click', closeQuickSaveModal);
  }

  if (quickSaveBackdrop) {
    quickSaveBackdrop.addEventListener('click', closeQuickSaveModal);
  }

  // Enter key to validate in input
  if (quickSaveInput) {
    quickSaveInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const name = quickSaveInput.value.trim() || null;
        closeQuickSaveModal();
        doQuickSave(name);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeQuickSaveModal();
      }
    });
  }

  if (quickSaveBtn) {
    // Long press handling (mousedown/mouseup for desktop)
    quickSaveBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      quickSaveIsLongPress = false;
      quickSaveLongPressTimer = setTimeout(() => {
        quickSaveIsLongPress = true;
        performQuickSave(true); // With modal
      }, 500);
    });

    quickSaveBtn.addEventListener('mouseup', (e) => {
      e.preventDefault();
      if (quickSaveLongPressTimer) {
        clearTimeout(quickSaveLongPressTimer);
        quickSaveLongPressTimer = null;
      }
      if (!quickSaveIsLongPress) {
        performQuickSave(false); // Without modal
      }
    });

    quickSaveBtn.addEventListener('mouseleave', () => {
      if (quickSaveLongPressTimer) {
        clearTimeout(quickSaveLongPressTimer);
        quickSaveLongPressTimer = null;
      }
    });

    // Touch handling (touchstart/touchend for mobile)
    quickSaveBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      quickSaveIsLongPress = false;
      quickSaveLongPressTimer = setTimeout(() => {
        quickSaveIsLongPress = true;
        performQuickSave(true); // With modal
      }, 500);
    });

    quickSaveBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (quickSaveLongPressTimer) {
        clearTimeout(quickSaveLongPressTimer);
        quickSaveLongPressTimer = null;
      }
      if (!quickSaveIsLongPress) {
        performQuickSave(false); // Without modal
      }
    });

    quickSaveBtn.addEventListener('touchcancel', () => {
      if (quickSaveLongPressTimer) {
        clearTimeout(quickSaveLongPressTimer);
        quickSaveLongPressTimer = null;
      }
    });
  }

  // ============================================================
  // 5. Date and time display
  // ============================================================

  const dateEl = document.querySelector('.date');
  const timeEl = document.querySelector('.time');

  function updateDateTime() {
    const now = new Date();
    const locale = navigator.language || 'fr-FR';

    if (dateEl) {
      const options = { weekday: 'short', day: 'numeric', month: 'short' };
      const formattedDate = now.toLocaleDateString(locale, options)
        .replace('.', '')
        .replace(/,/g, '');
      dateEl.textContent = formattedDate;
    }

    if (timeEl) {
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      timeEl.textContent = `${hours}:${minutes}`;
    }
  }

  updateDateTime();
  setInterval(updateDateTime, 60000);

  // ============================================================
  // 5 bis. Version display (version.txt)
  // ============================================================

 const versionSpan = document.getElementById('statusVersion');
  if (versionSpan) {
    fetch(window.getAssetUrl('version.txt'))
      .then(response => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      })
      .then(text => {
        const cleaned = text.trim();
        if (cleaned) {
          versionSpan.textContent = cleaned;
        }
      })
      .catch(err => {

      });
  }

  // ============================================================
  // 5 ter. Protection: right-click & text selection disabled
  //        (with secret triple-click unlock on version)
  // ============================================================

  let protectionDisabled = false;

  // Disable right-click (contextmenu)
  function preventContextMenu(e) {
    if (!protectionDisabled) {
      e.preventDefault();
      return false;
    }
  }
  document.addEventListener('contextmenu', preventContextMenu);

  // Disable text selection via CSS
  function updateSelectionProtection() {
    if (protectionDisabled) {
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
      document.body.style.msUserSelect = '';
      document.body.style.webkitTouchCallout = '';
    } else {
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';
      document.body.style.msUserSelect = 'none';
      document.body.style.webkitTouchCallout = 'none';
    }
  }
  // Apply protection on load
  updateSelectionProtection();

  // Secret: triple-click on version to toggle protection
  if (versionSpan) {
    let clickCount = 0;
    let clickTimer = null;

    versionSpan.addEventListener('click', function() {
      clickCount++;

      if (clickTimer) {
        clearTimeout(clickTimer);
      }

      if (clickCount >= 3) {
        // Triple click detected - toggle protection
        protectionDisabled = !protectionDisabled;
        updateSelectionProtection();
        clickCount = 0;

        // Visual feedback (brief flash)
        versionSpan.style.transition = 'opacity 0.1s';
        versionSpan.style.opacity = '0.3';
        setTimeout(() => {
          versionSpan.style.opacity = '1';
        }, 100);
      } else {
        // Reset after 500ms if no more clicks
        clickTimer = setTimeout(function() {
          clickCount = 0;
        }, 500);
      }
    });
  }

  // ============================================================
  // 6. Volume toggle button (mute music + media)
  // ============================================================

  const volumeToggleBtn = document.getElementById('volumeToggleBtn');
  const volumeSliderPopup = document.getElementById('volumeSliderPopup');
  const volumeSliderInput = document.getElementById('volumeSliderInput');
  const volumeSliderValue = document.getElementById('volumeSliderValue');

  let isMuted = false;
  let generalVolume = 1.0; // General volume multiplier (0 to 1)
  let volumeLongPressTimer = null;
  let volumeIsLongPress = false;

  // Load mute state from localStorage
  const savedMuteState = localStorage.getItem('studioMuted');
  if (savedMuteState === 'true') {
    isMuted = true;
    if (volumeToggleBtn) volumeToggleBtn.classList.add('muted');
  }

  // Load general volume from localStorage
  const savedGeneralVolume = localStorage.getItem('studioGeneralVolume');
  if (savedGeneralVolume !== null) {
    generalVolume = parseFloat(savedGeneralVolume);
    if (volumeSliderInput) volumeSliderInput.value = Math.round(generalVolume * 100);
    if (volumeSliderValue) volumeSliderValue.textContent = Math.round(generalVolume * 100) + '%';
  }

  // Apply volumes at startup (after MusicPlayer is initialized)
  setTimeout(() => {
    if (isMuted) applyMuteState(true);
    applyGeneralVolume();
  }, 100);

  function applyMuteState(muted) {
    // Mute/unmute music
    if (window.MusicPlayer && window.MusicPlayer.audio) {
      window.MusicPlayer.audio.muted = muted;
    }

    // Mute/unmute Messenger media
    if (window.Messenger) {
      // Mute all active audio elements
      window.Messenger.activeAudioElements.forEach(audio => {
        if (audio) audio.muted = muted;
      });

      // Mute lightbox video if it exists
      if (window.Messenger.lightboxEl) {
        const video = window.Messenger.lightboxEl.querySelector('.ms-lightbox-video');
        if (video) video.muted = muted;
      }
    }
  }

  function applyGeneralVolume() {
    // Get individual volumes from settings
    let musicVolume = 0.2;
    let mediaVolume = 0.3;

    const savedSettings = localStorage.getItem('studioSettings');
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings);
        if (typeof settings.musicVolume === 'number') musicVolume = settings.musicVolume / 100;
        if (typeof settings.mediaVolume === 'number') mediaVolume = settings.mediaVolume / 100;
      } catch (e) {}
    }

    // Apply general volume as multiplier
    const effectiveMusicVolume = musicVolume * generalVolume;
    const effectiveMediaVolume = mediaVolume * generalVolume;

    // Apply to MusicPlayer
    if (window.MusicPlayer) {
      window.MusicPlayer.setVolume(effectiveMusicVolume);
    }

    // Apply to Messenger
    if (window.Messenger) {
      window.Messenger.mediaVolume = effectiveMediaVolume;
      window.Messenger.activeAudioElements.forEach(audio => {
        if (audio) audio.volume = effectiveMediaVolume;
      });
      if (window.Messenger.lightboxEl) {
        const video = window.Messenger.lightboxEl.querySelector('.ms-lightbox-video');
        if (video) video.volume = effectiveMediaVolume;
      }
    }
  }

  // Expose function to recalculate when settings change
  window.applyGeneralVolume = applyGeneralVolume;
  window.getGeneralVolume = () => generalVolume;

  // Function to reset general volume to 100%
  function resetGeneralVolume() {
    generalVolume = 1.0;
    localStorage.setItem('studioGeneralVolume', generalVolume);
    if (volumeSliderInput) volumeSliderInput.value = 100;
    if (volumeSliderValue) volumeSliderValue.textContent = '100%';
    applyGeneralVolume();
    
  }
  window.resetGeneralVolume = resetGeneralVolume;

  function toggleMute() {
    isMuted = !isMuted;
    volumeToggleBtn.classList.toggle('muted', isMuted);
    applyMuteState(isMuted);
    localStorage.setItem('studioMuted', isMuted);
    volumeToggleBtn.title = isMuted ? 'Unmute' : 'Mute';
  }

  function showVolumeSlider() {
    if (volumeSliderPopup && volumeToggleBtn) {
      // Calculate button position to place popup below
      const btnRect = volumeToggleBtn.getBoundingClientRect();
      volumeSliderPopup.style.top = (btnRect.bottom + 8) + 'px';
      volumeSliderPopup.style.left = (btnRect.left + btnRect.width / 2) + 'px';
      volumeSliderPopup.style.transform = 'translateX(-50%)';
      volumeSliderPopup.classList.remove('hidden');
    }
  }

  function hideVolumeSlider() {
    if (volumeSliderPopup) {
      volumeSliderPopup.classList.add('hidden');
    }
  }

  // Flag to avoid immediate popup closure
  let volumePopupJustOpened = false;

  function showVolumeSliderSafe() {
    showVolumeSlider();
    volumePopupJustOpened = true;
    setTimeout(() => { volumePopupJustOpened = false; }, 200);
  }

  if (volumeToggleBtn) {
    // Long press handling (mousedown/mouseup for desktop)
    volumeToggleBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      volumeIsLongPress = false;
      volumeLongPressTimer = setTimeout(() => {
        volumeIsLongPress = true;
        showVolumeSliderSafe();
      }, 400);
    });

    volumeToggleBtn.addEventListener('mouseup', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (volumeLongPressTimer) {
        clearTimeout(volumeLongPressTimer);
        volumeLongPressTimer = null;
      }
      if (!volumeIsLongPress) {
        toggleMute();
      }
    });

    volumeToggleBtn.addEventListener('mouseleave', () => {
      if (volumeLongPressTimer) {
        clearTimeout(volumeLongPressTimer);
        volumeLongPressTimer = null;
      }
    });

    // Touch handling (touchstart/touchend for mobile)
    volumeToggleBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      volumeIsLongPress = false;
      volumeLongPressTimer = setTimeout(() => {
        volumeIsLongPress = true;
        showVolumeSliderSafe();
      }, 400);
    });

    volumeToggleBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (volumeLongPressTimer) {
        clearTimeout(volumeLongPressTimer);
        volumeLongPressTimer = null;
      }
      if (!volumeIsLongPress) {
        toggleMute();
      }
    });

    volumeToggleBtn.addEventListener('touchcancel', () => {
      if (volumeLongPressTimer) {
        clearTimeout(volumeLongPressTimer);
        volumeLongPressTimer = null;
      }
    });
  }

  // General volume slider handling
  if (volumeSliderInput) {
    // Prevent propagation to avoid closing the popup
    volumeSliderInput.addEventListener('mousedown', (e) => e.stopPropagation());
    volumeSliderInput.addEventListener('touchstart', (e) => e.stopPropagation());

    volumeSliderInput.addEventListener('input', (e) => {
      const value = parseInt(e.target.value, 10);
      generalVolume = value / 100;
      if (volumeSliderValue) volumeSliderValue.textContent = value + '%';
      applyGeneralVolume();
    });

    volumeSliderInput.addEventListener('change', (e) => {
      const value = parseInt(e.target.value, 10);
      generalVolume = value / 100;
      localStorage.setItem('studioGeneralVolume', generalVolume);
    });
  }

  // Prevent popup from closing when clicking on it
  if (volumeSliderPopup) {
    volumeSliderPopup.addEventListener('mousedown', (e) => e.stopPropagation());
    volumeSliderPopup.addEventListener('click', (e) => e.stopPropagation());
    volumeSliderPopup.addEventListener('touchstart', (e) => e.stopPropagation());
  }

  // Close popup when clicking elsewhere
  document.addEventListener('mousedown', (e) => {
    if (volumeSliderPopup && !volumeSliderPopup.classList.contains('hidden') && !volumePopupJustOpened) {
      // Check if click is on volume button or popup
      const isOnVolumeBtn = volumeToggleBtn && volumeToggleBtn.contains(e.target);
      const isOnPopup = volumeSliderPopup.contains(e.target);
      if (!isOnVolumeBtn && !isOnPopup) {
        hideVolumeSlider();
      }
    }
  });

  // Expose function so Messenger can use it on new media
  window.isGlobalMuted = () => isMuted;

  // ============================================================
  // 7. Check for InstaPics presence
  // ============================================================

  if (!window.InstaPics) {
    
    
  }
}

// ============================================================
// 7. Network / Wi-Fi icons randomizer
// ============================================================

(function setupStatusRandomizer() {
  const signalImg = document.querySelector('.network-icon');
  const wifiImg   = document.querySelector('.wifi-icon');

  if (!signalImg || !wifiImg) return;

  const signalIcons = [
    'assets/status_bar/signal-1.svg',
    'assets/status_bar/signal-2.svg',
    'assets/status_bar/signal-3.svg',
    'assets/status_bar/signal-4.svg',
    'assets/status_bar/signal-5.svg'
  ];

  const wifiIcons = [
    'assets/status_bar/wifi-1.svg',
    'assets/status_bar/wifi-2.svg',
    'assets/status_bar/wifi-3.svg',
  ];

  function randomizeStatusIcons() {
    const signalIndex = Math.floor(Math.random() * signalIcons.length);
    const wifiIndex   = Math.floor(Math.random() * wifiIcons.length);

    signalImg.setAttribute('src', signalIcons[signalIndex]);
    wifiImg.setAttribute('src', wifiIcons[wifiIndex]);
  }

  function scheduleNextRandomize() {
    const delay = 20000 + Math.random() * 40000; // 20 to 60 sec
    setTimeout(() => {
      randomizeStatusIcons();
      scheduleNextRandomize();
    }, delay);
  }

  // first random on load
  randomizeStatusIcons();
  // then loop
  scheduleNextRandomize();
})();

// Initialize app when Loader is ready
document.addEventListener('DOMContentLoaded', () => {
  if (window.Loader) {
    window.Loader.onReady(initApp);
  } else {
    initApp();
  }
});

// ============================================================
// 8. Block scroll on mobile (outside scrollable areas)
// ============================================================

(function setupMobileScrollBlock() {
  // Detect mobile device
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
                   || (window.innerWidth <= 768);

  if (!isMobile) return;

  // Selectors for scrollable areas
  const scrollableSelectors = [
    '.scroll-area',
    '.ms-chat-messages',
    '.ms-contacts-list',
    '.gallery-content',
    '.savesload-content',
    '.settings-content',
    '.os-content',
    '.os-users',
    '.ip-feed',
    '.stories-list'
  ];

  // Check if element is inside a scrollable area
  function isInScrollableArea(el) {
    if (!el) return false;
    for (const selector of scrollableSelectors) {
      if (el.closest(selector)) return true;
    }
    return false;
  }

  // Check if scrollable element is at its scroll boundary
  function isAtScrollBoundary(el, deltaY) {
    const scrollable = el.closest(scrollableSelectors.join(','));
    if (!scrollable) return true;

    const atTop = scrollable.scrollTop <= 0;
    const atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight;

    // Block if trying to scroll past boundaries (prevents pull-to-refresh)
    if (deltaY < 0 && atTop) return true;
    if (deltaY > 0 && atBottom) return true;

    return false;
  }

  // Track touch start position
  let touchStartY = 0;

  document.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  // Block wheel events outside scrollable areas
  document.addEventListener('wheel', (e) => {
    if (!isInScrollableArea(e.target)) {
      e.preventDefault();
    }
  }, { passive: false });

  // Block touchmove events outside scrollable areas or at boundaries
  document.addEventListener('touchmove', (e) => {
    if (!isInScrollableArea(e.target)) {
      e.preventDefault();
      return;
    }

    // Block pull-to-refresh when at top of scrollable area
    const deltaY = touchStartY - e.touches[0].clientY;
    if (isAtScrollBoundary(e.target, deltaY)) {
      e.preventDefault();
    }
  }, { passive: false });
})();
