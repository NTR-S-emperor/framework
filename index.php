<?php
/**
 * Dynamic index with cache-busting
 * Generates all asset URLs with their hash for automatic cache invalidation
 */

// Prevent browser/CDN from caching this HTML page
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
header('CDN-Cache-Control: no-store');
header('Cloudflare-CDN-Cache-Control: no-store');

// Clear PHP file stat cache to ensure fresh hashes
clearstatcache(true);

// Clear OPcache if available (forces PHP to re-read files)
if (function_exists('opcache_reset')) {
    opcache_reset();
}

// Build manifest of file hashes
$manifest = [];
$extensions = ['js', 'css', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp4', 'webm', 'mp3'];

function scanForManifest($dir, $basePath, $extensions, &$manifest) {
    if (!is_dir($dir)) return;
    $items = scandir($dir);
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        $path = $dir . '/' . $item;
        $relativePath = $basePath ? $basePath . '/' . $item : $item;
        $relativePath = preg_replace('#^\./#', '', $relativePath);

        if (is_dir($path)) {
            scanForManifest($path, $relativePath, $extensions, $manifest);
        } else {
            $ext = strtolower(pathinfo($item, PATHINFO_EXTENSION));
            if (in_array($ext, $extensions)) {
                $manifest[$relativePath] = substr(md5_file($path), 0, 8);
            }
        }
    }
}

scanForManifest('.', '', $extensions, $manifest);

// Helper function to get versioned URL
function v($path) {
    global $manifest;
    $hash = isset($manifest[$path]) ? $manifest[$path] : '';
    return $hash ? $path . '?v=' . $hash : $path;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>NTR/S Emperor Studio</title>
  <link rel="icon" type="image/png" href="<?= v('favicon.png') ?>">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400&family=Sour+Gummy:wght@200&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="<?= v('style.css') ?>">
  <link rel="stylesheet" href="<?= v('app.instapics/instapics.css') ?>">
  <link rel="stylesheet" href="<?= v('app.onlyslut/slutonly.css') ?>">
  <link rel="stylesheet" href="<?= v('app.messenger/messenger.css') ?>">
  <link rel="stylesheet" href="<?= v('app.gallery/gallery.css') ?>">
  <link rel="stylesheet" href="<?= v('app.savesload/savesload.css') ?>">
  <link rel="stylesheet" href="<?= v('app.settings/settings.css') ?>">
  <link rel="stylesheet" href="<?= v('app.tips/tips.css') ?>">
  <link rel="stylesheet" href="<?= v('app.spy/spy.css') ?>">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js"></script>
  <!-- Pre-calculate scale before content renders to avoid visual jump -->
  <script>
    (function() {
      var PHONE_HEIGHT = 780;
      var TARGET_FILL = 0.92;
      var MOBILE_BREAKPOINT = 480;
      if (window.innerWidth > MOBILE_BREAKPOINT) {
        var scale = (window.innerHeight * TARGET_FILL) / PHONE_HEIGHT;
        var style = document.createElement('style');
        style.id = 'phone-prescale';
        style.textContent = '.phone-shell { transform: scale(' + scale + '); transform-origin: center center; }';
        document.head.appendChild(style);
      }
    })();
  </script>
</head>
<body class="app-body">
  <div class="phone-shell">
    <div class="phone-frame">

      <!-- LOADING SCREEN -->
      <div class="loading-screen" id="loadingScreen">
        <div class="loading-video" id="lottieLoader"></div>
        <script>
          lottie.loadAnimation({
            container: document.getElementById('lottieLoader'),
            renderer: 'svg',
            loop: true,
            autoplay: true,
            path: '<?= v('assets/system/walking.json') ?>'
          });
        </script>
        <div class="loading-progress">
          <div class="loading-bar">
            <div class="loading-bar-fill" id="loadingBarFill"></div>
          </div>
          <span class="loading-percent" id="loadingPercent">0%</span>
        </div>
        <!-- Age disclaimer (shown after loading, before game) -->
        <div class="age-disclaimer hidden" id="ageDisclaimer">
          <div class="age-disclaimer-box">
            <p class="age-disclaimer-text">Before continuing, you must confirm that you are of legal age in your country to access mature content.</p>
            <p class="age-disclaimer-legal">
              All characters depicted are entirely fictional and are 18 years of age or older. Any resemblance to real persons, living or dead, is purely coincidental.<br><br>
              All scenarios portrayed involve consenting adults. Any beverages shown do not contain alcohol. Any scenes that may appear to depict coercion are purely fictional; all interactions are fully consensual between all participants.
            </p>
            <div class="age-disclaimer-buttons">
              <button type="button" class="age-disclaimer-btn age-disclaimer-yes" id="ageYesBtn">Yes, I confirm</button>
              <button type="button" class="age-disclaimer-btn age-disclaimer-no" id="ageNoBtn">No</button>
            </div>
          </div>
        </div>
      </div>

      <!-- DISCLAIMER POPUP (opened from app icon) -->
      <div class="disclaimer-popup hidden" id="disclaimerPopup">
        <div class="disclaimer-popup-box">
          <button type="button" class="disclaimer-popup-close" id="closeDisclaimerPopup">&times;</button>
          <h3 class="disclaimer-popup-title" data-i18n="disclaimer.title">Disclaimer</h3>
          <p class="disclaimer-popup-text" data-i18n="disclaimer.text1">All characters depicted are entirely fictional and are 18 years of age or older. Any resemblance to real persons, living or dead, is purely coincidental.</p>
          <p class="disclaimer-popup-text" data-i18n="disclaimer.text2">All scenarios portrayed involve consenting adults. Any beverages shown do not contain alcohol. Any scenes that may appear to depict coercion are purely fictional; all interactions are fully consensual between all participants.</p>
          <div class="disclaimer-popup-buttons">
            <button type="button" class="disclaimer-popup-btn disclaimer-agree" id="disclaimerAgreeBtn" data-i18n="disclaimer.agree">I still agree</button>
            <button type="button" class="disclaimer-popup-btn disclaimer-disagree" id="disclaimerDisagreeBtn" data-i18n="disclaimer.disagree">I no longer agree</button>
          </div>
        </div>
      </div>

      <!-- SMARTPHONE STATUS BAR -->
      <div class="phone-top">
        <div class="status-controls hidden" id="statusControls">
          <button class="quick-save-btn" id="quickSaveBtn">
            <img src="<?= v('assets/status_bar/quick_save.svg') ?>" alt="Quick Save">
          </button>
          <button class="volume-toggle-btn" id="volumeToggleBtn">
            <img src="<?= v('assets/status_bar/volume.svg') ?>" alt="Volume" class="volume-icon-on">
            <img src="<?= v('assets/status_bar/volume_muted.svg') ?>" alt="Muted" class="volume-icon-off">
          </button>
        </div>
        <div class="dynamic-island"></div>

        <!-- VERSION TEXT TOP LEFT -->
        <div class="status-left">
          <span id="statusVersion" class="status-version"></span>
        </div>

        <div class="status-icons">
          <div class="network-wrapper">
            <img src="<?= v('assets/status_bar/signal-5.svg') ?>" class="network-icon" alt="">
          </div>
          <img src="<?= v('assets/status_bar/wifi-3.svg') ?>" class="icon wifi-icon" alt="">
          <img src="<?= v('assets/status_bar/battery.svg') ?>" class="icon" alt="">
        </div>
      </div>

      <!-- NOTIFICATIONS CONTAINER -->
      <div id="notificationContainer" class="notification-container"></div>

      <div class="separator"></div>

      <!-- SCROLLABLE CONTENT INSIDE THE PHONE -->
      <main class="app-main">
        <section class="scroll-area">

          <!-- Two pages: 1 = story selection, 2 = phone -->
          <div class="phone-pages" id="phonePages">
            <!-- PAGE 1: stories list -->
            <section class="phone-page phone-page-stories">
              <section class="stories-list" id="storiesContainer">
                <!-- Dynamically filled by main.js -->
              </section>
            </section>

            <!-- PAGE 2: phone desktop -->
            <section class="phone-page phone-page-home">

              <!-- desktop screen (icons) -->
              <div class="apps-grid" id="homeScreen">

                <!-- 1. MESSENGER -->
                <button class="app-icon app-messenger" id="openMessengerBtn">
                  <div class="app-icon-image">
                    <img src="<?= v('assets/apps_icon/messenger.svg') ?>" alt="Messenger">
                  </div>
                  <span class="app-icon-label" data-i18n="app.messenger">Messenger</span>
                </button>

                <!-- 2. INSTAPICS -->
                <button class="app-icon app-instapics" id="openInstapicsBtn">
                  <div class="app-icon-image">
                    <img src="<?= v('assets/apps_icon/instapics.svg') ?>" alt="InstaPics">
                  </div>
                  <span class="app-icon-label" data-i18n="app.instapics">InstaPics</span>
                </button>

                <!-- 3. ONLYSLUT -->
                <button class="app-icon app-onlyslut" id="openOnlySlutBtn">
                  <div class="app-icon-image">
                    <img src="<?= v('assets/apps_icon/onlyslut.png') ?>" alt="OnlySlut">
                  </div>
                  <span class="app-icon-label" data-i18n="app.onlyslut">OnlySlut</span>
                </button>

                <!-- 4. GALLERY -->
                <button class="app-icon app-gallery" id="openGalleryBtn">
                  <div class="app-icon-image">
                    <img src="<?= v('assets/apps_icon/gallery.png') ?>" alt="Gallery">
                  </div>
                  <span class="app-icon-label" data-i18n="app.gallery">Gallery</span>
                </button>

                <!-- 5. SETTINGS -->
                <button class="app-icon app-settings">
                  <div class="app-icon-image">
                    <img src="<?= v('assets/apps_icon/settings.png') ?>" alt="Settings">
                  </div>
                  <span class="app-icon-label" data-i18n="app.settings">Settings</span>
                </button>

                <!-- 6. SAVES & LOAD -->
                <button class="app-icon app-savesload" id="openSavesLoadBtn">
                  <div class="app-icon-image">
                    <img src="<?= v('assets/apps_icon/savesload.svg') ?>" alt="Saves">
                  </div>
                  <span class="app-icon-label" data-i18n="app.saves">Saves</span>
                </button>

                <!-- 7. PATREON -->
                <button class="app-icon app-patreon">
                  <div class="app-icon-image">
                    <img src="<?= v('assets/apps_icon/patreon.png') ?>" alt="Patreon">
                  </div>
                  <span class="app-icon-label" data-i18n="app.patreon">Patreon</span>
                </button>

                <!-- 8. TIPS -->
                <button class="app-icon app-tips" id="openTipsBtn">
                  <div class="app-icon-image">
                    <img src="<?= v('assets/apps_icon/tips.svg') ?>" alt="Tips">
                  </div>
                  <span class="app-icon-label" data-i18n="app.tips">Tips</span>
                </button>

                <!-- 9. DISCLAIMER -->
                <button class="app-icon app-disclaimer" id="openDisclaimerBtn">
                  <div class="app-icon-image">
                    <img src="<?= v('assets/apps_icon/disclaimer.svg') ?>" alt="Disclaimer">
                  </div>
                  <span class="app-icon-label" data-i18n="app.disclaimer">Disclaimer</span>
                </button>

                <!-- 10. SPY (hidden by default, shown when unlocked) -->
                <button class="app-icon app-spy hidden" id="openSpyBtn">
                  <div class="app-icon-image app-icon-spy-svg">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="12" cy="12" r="11" fill="#1a1a2e"/>
                      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="#e94560"/>
                    </svg>
                  </div>
                  <span class="app-icon-label" data-i18n="app.spy">Spy</span>
                </button>

              </div>

              <!-- Messenger screen -->
              <div id="messengerScreen" class="hidden"></div>

              <!-- InstaPics screen, hidden by default -->
              <div id="instapicsScreen" class="hidden"></div>

              <!-- OnlySlut screen, hidden by default -->
              <div id="onlyslutScreen" class="hidden"></div>

              <!-- Gallery screen, hidden by default -->
              <div id="galleryScreen" class="hidden"></div>

              <!-- Saves & Load screen, hidden by default -->
              <div id="savesloadScreen" class="hidden"></div>

              <!-- Settings screen, hidden by default -->
              <div id="settingsScreen" class="hidden"></div>

              <!-- Tips screen, hidden by default -->
              <div id="tipsScreen" class="hidden"></div>

              <!-- Spy screen, hidden by default -->
              <div id="spyScreen" class="hidden"></div>

            </section>
          </div>

        </section>
      </main>

      <!-- QUICK SAVE MODAL (on top of everything) -->
      <div id="quickSaveModal" class="quick-save-modal hidden">
        <div class="quick-save-modal-backdrop"></div>
        <div class="quick-save-modal-content">
          <div class="quick-save-modal-title" data-i18n="quicksave.title">New save</div>
          <input type="text" id="quickSaveInput" class="quick-save-modal-input" data-i18n-placeholder="quicksave.placeholder" placeholder="Name (optional)">
          <div class="quick-save-modal-buttons">
            <button type="button" class="quick-save-modal-btn quick-save-modal-cancel" data-i18n="btn.cancel">Cancel</button>
            <button type="button" class="quick-save-modal-btn quick-save-modal-confirm" data-i18n="btn.save">Save</button>
          </div>
        </div>
      </div>

      <!-- LOCK MODAL (subscription tier gate) -->
      <div id="lockModal" class="lock-modal hidden">
        <div class="lock-modal-backdrop"></div>
        <div class="lock-modal-content">
          <div class="lock-modal-title" data-i18n="lock.title">Premium Content</div>
          <div class="lock-tier-row">
            <span id="lockTierLabel" class="lock-tier-badge lock-tier-gold">GOLD</span>
            <span class="lock-tier-hint" data-i18n="lock.orhigher">or higher</span>
          </div>
          <p class="lock-modal-description" data-i18n="lock.description">This content requires a subscription code.</p>
          <input type="text" id="lockCodeInput" class="lock-modal-input" data-i18n-placeholder="lock.placeholder" placeholder="Enter your code">
          <div id="lockError" class="lock-modal-error"></div>
          <div class="lock-modal-buttons">
            <button type="button" id="lockCancelBtn" class="lock-modal-btn lock-modal-cancel" data-i18n="btn.cancel">Cancel</button>
            <button type="button" id="lockConfirmBtn" class="lock-modal-btn lock-modal-confirm" data-i18n="lock.confirm">Confirm</button>
          </div>
        </div>
      </div>

      <!-- ANDROID-STYLE BOTTOM NAVIGATION BAR -->
      <div class="phone-bottom-nav">
        <button class="nav-button nav-recents" aria-label="Recent apps">
          <img src="<?= v('assets/nav_bar/square.svg') ?>" class="nav-icon" alt="">
        </button>

        <button class="nav-button nav-home" aria-label="Home">
          <img src="<?= v('assets/nav_bar/home.svg') ?>" class="nav-icon" alt="">
        </button>

        <button class="nav-button nav-back" aria-label="Back">
          <img src="<?= v('assets/nav_bar/back.svg') ?>" class="nav-icon" alt="">
        </button>
      </div>
    </div>
  </div>

  <!-- Volume popup OUTSIDE phone-frame to avoid z-index and overflow issues -->
  <div class="volume-slider-popup hidden" id="volumeSliderPopup">
    <input type="range" class="volume-slider-input" id="volumeSliderInput" min="0" max="100" value="100">
    <span class="volume-slider-value" id="volumeSliderValue">100%</span>
  </div>

  <!-- Character name customization modal (girlfriend + player) -->
  <div class="character-name-modal hidden" id="characterNameModal">
    <div class="character-name-modal-backdrop"></div>
    <!-- Step 1: Player's nickname (shown first) -->
    <div class="character-name-modal-content character-name-step character-name-step-mc" id="stepMc">
      <div class="character-name-modal-title" data-i18n="charname.mc.title">What's your nickname?</div>
      <input type="text" id="mcNameInput" class="character-name-modal-input character-name-input-mc" data-i18n-placeholder="charname.mc.placeholder" placeholder="John">
      <p class="character-name-modal-hint" data-i18n="charname.mc.hint">Leave empty for "John"</p>
      <div class="character-name-modal-buttons">
        <button type="button" class="character-name-modal-btn character-name-btn-mc" id="confirmMcBtn" data-i18n="charname.btn.continue">Continue</button>
      </div>
    </div>
    <!-- Step 2: Girlfriend's name -->
    <div class="character-name-modal-content character-name-step character-name-step-gf hidden" id="stepGirlfriend">
      <div class="character-name-modal-title" data-i18n="charname.gf.title">What's your girlfriend's name?</div>
      <input type="text" id="girlfriendNameInput" class="character-name-modal-input character-name-input-gf" placeholder="">
      <p class="character-name-modal-hint" id="girlfriendNameHint" data-i18n="charname.gf.hint">Leave empty to keep the default name</p>
      <div class="character-name-modal-buttons">
        <button type="button" class="character-name-modal-btn character-name-btn-gf" id="confirmGirlfriendBtn" data-i18n="charname.btn.start">Start</button>
      </div>
    </div>
  </div>

  <!-- Expose manifest to JavaScript for dynamic asset loading -->
  <script>
    window.assetManifest = <?= json_encode($manifest) ?>;
    window.getAssetUrl = function(path) {
      var hash = window.assetManifest[path];
      // Use manifest hash if available, otherwise use timestamp fallback to bust cache
      return hash ? path + '?v=' + hash : path + '?t=' + Date.now();
    };
  </script>

  <script src="<?= v('loader.js') ?>"></script>
  <script src="<?= v('translations.js') ?>"></script>
  <script src="<?= v('main.js') ?>"></script>
  <script src="<?= v('music.js') ?>"></script>
  <script src="<?= v('notifications.js') ?>"></script>
  <script src="<?= v('app.instapics/templates.js') ?>"></script>
  <script src="<?= v('app.instapics/instapics.js') ?>"></script>
  <script src="<?= v('app.onlyslut/templates.js') ?>"></script>
  <script src="<?= v('app.onlyslut/slutonly.js') ?>"></script>
  <script src="<?= v('app.messenger/messenger.js') ?>"></script>
  <script src="<?= v('app.gallery/gallery.js') ?>"></script>
  <script src="<?= v('app.savesload/savesload.js') ?>"></script>
  <script src="<?= v('app.settings/settings.js') ?>"></script>
  <script src="<?= v('app.tips/tips.js') ?>"></script>
  <script src="<?= v('app.spy/spy.js') ?>"></script>
</body>
</html>
