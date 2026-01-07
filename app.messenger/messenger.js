// app.messenger/messenger.js

window.Messenger = {
  root: null,

  // e.g.: "stories/1-Story 1/messenger"
  storyPath: null,

  /**
   * Get URL with cache-busting hash from manifest
   * Ensures the latest version of any file is loaded
   */
  getCacheBustedUrl(url) {
    if (window.getAssetUrl) {
      return window.getAssetUrl(url);
    }
    return url;
  },

  contacts: [],              // { key, name, avatar }
  conversationsByKey: {},    // key -> { key, messages: [...], isGroup, participants, participantColors }
  selectedKey: null,
  nameToKey: {},             // mapping full name (lowercase) -> key (abbreviation)
  keyToName: {},             // reverse mapping: key (abbreviation) -> full name
  avatarsByKey: {},          // key -> avatar path (for all characters, even without conversations)
  contactsWithNew: new Set(), // contacts with new content (notification)
  contactLastActivity: {},   // key -> timestamp of last activity (for sorting)

  // Tracking the active conversation (for the back button)
  activeConversationKey: null,       // key of the currently active conversation
  conversationHistory: [],           // conversation history [{key, file}] for going back
  conversationSourceFiles: {},       // key -> [source files] for each conversation

  // Color palette for group participants
  groupColors: [
    '#E57373', // light red
    '#64B5F6', // light blue
    '#81C784', // light green
    '#FFB74D', // light orange
    '#BA68C8', // purple
    '#4DD0E1', // cyan
    '#F06292', // pink
    '#AED581', // lime green
  ],

  contactsListEl: null,
  chatHeaderEl: null,
  chatMessagesEl: null,
  contactsPaneEl: null,
  contactsExpanded: false,
  chatInputEl: null,
  chatInputHeaderEl: null,
  chatInputBodyEl: null,
  chatInputMainEl: null,
  chatSendBtnEl: null,

  // Lightbox for images
  lightboxEl: null,
  lightboxOpen: false,

  // Media volume (videos and audios)
  mediaVolume: 0.5,
  activeAudioElements: [], // references to created audio elements

  // Autoplay: 'manual' | 'auto' | 'fast'
  autoplayMode: 'manual',
  autoplayInterval: null,
  autoplayLongPressTimer: null,
  autoplayLongPressActive: false, // Flag to block events after long press activation

  // Virtual scrolling configuration
  virtualScroll: {
    enabled: true,
    buffer: 10,              // Number of messages to render above/below viewport
    estimatedHeights: {
      text: 52,              // Average height for text message
      image: 220,            // Height for image message
      video: 220,            // Height for video message
      audio: 70,             // Height for audio message
      status: 40,            // Height for status message
      spacerMin: 8           // Minimum spacer between messages
    },
    cachedHeights: {},       // messageIndex -> actual measured height
    visibleRange: { start: 0, end: 50 },
    totalHeight: 0,
    scrollTop: 0,
    containerHeight: 0,
    isScrolling: false,
    scrollTimeout: null,
    isScrollingToBottom: false  // Flag to prevent onVirtualScroll during scrollToBottom
  },

  // Scroll management to prevent race conditions
  pendingScrollRAF: null,
  pendingScrollTimeout: null,
  renderVersion: 0,

  /**
   * Initializes the Messenger app for a given story.
   * storyPath = "stories/XXX/messenger"
   */
  async init(storyPath) {
    // Load media volume from settings
    this.mediaVolume = this.getMediaVolume();

    if (storyPath) {
      if (this.storyPath && this.storyPath !== storyPath) {
        // Changing story: reset everything
        this.selectedKey = null;
        this.unlockedFiles = ['start.txt'];
        this.parsedFiles = [];
        this.conversationsByKey = {};
        this.contactsWithNew = new Set();
        this.contactLastActivity = {};
        this.avatarsByKey = {};
        this.unlockedInstaPosts = [];
        this.unlockedSlutOnlyPosts = [];
        this.activeConversationKey = null;
        this.conversationHistory = [];
        this.conversationSourceFiles = {};
        this.activeAudioElements = []; // Reset audio references
      }
      this.storyPath = storyPath;
    }

    if (!this.storyPath) {
      return;
    }

    if (!this.root) {
      this.mount();
    }

    await this.reloadData();
  },

  async reloadData() {
    if (!this.storyPath) return;

    try {
      // Load characters first (fills nameToKey)
      // then chapters (which use nameToKey to resolve names)
      const contacts = await this.loadCharacters();
      const newConversations = await this.loadChapters();

      // load contacts
      this.contacts = contacts;

      // Merge new conversations with existing ones (keep runtime state)
      for (const key of Object.keys(newConversations)) {
        if (!this.conversationsByKey[key]) {
          // New conversation: add it and prepare its runtime state
          this.conversationsByKey[key] = newConversations[key];
          this.prepareConversationRuntime(this.conversationsByKey[key]);
          // Initialize activity if not yet defined (start.txt case)
          if (!this.contactLastActivity[key]) {
            this.contactLastActivity[key] = Date.now();
          }
          // Initialize active conversation if this is the first one (start.txt)
          if (!this.activeConversationKey) {
            this.activeConversationKey = key;
            // Register start.txt as source file for this conversation
            if (!this.conversationSourceFiles[key]) {
              this.conversationSourceFiles[key] = ['start.txt'];
            }
          }
        } else {
          // Conversation already exists: merge new messages
          const existingConv = this.conversationsByKey[key];
          const newConv = newConversations[key];

          // Offset to adjust fakeChoices indices
          const offset = existingConv.messages.length;

          // Add new messages to the end
          if (newConv.messages && newConv.messages.length) {
            existingConv.messages.push(...newConv.messages);
          }

          // Add new choice blocks with adjusted indices
          if (newConv.fakeChoices && newConv.fakeChoices.length) {
            for (const choice of newConv.fakeChoices) {
              existingConv.fakeChoices.push({
                ...choice,
                messageIndex: choice.messageIndex + offset
              });
            }
          }

          // Add new real choice blocks with adjusted indices
          if (newConv.realChoices && newConv.realChoices.length) {
            // Offset for real choice block indices
            const realChoiceOffset = existingConv.realChoices ? existingConv.realChoices.length : 0;

            // Adjust choiceBlockIndex in messages we just added
            const newMessagesStart = existingConv.messages.length - (newConv.messages ? newConv.messages.length : 0);
            for (let i = newMessagesStart; i < existingConv.messages.length; i++) {
              const msg = existingConv.messages[i];
              if (msg && msg.kind === "realChoice" && typeof msg.choiceBlockIndex === "number") {
                msg.choiceBlockIndex += realChoiceOffset;
              }
            }

            // Add real choice blocks
            if (!existingConv.realChoices) {
              existingConv.realChoices = [];
            }
            for (const choice of newConv.realChoices) {
              existingConv.realChoices.push({
                ...choice,
                messageIndex: choice.messageIndex + offset
              });
            }
          }
        }
      }

      // Keep only contacts that have at least one conversation
      const usedKeys = new Set(Object.keys(this.conversationsByKey));
      this.contacts = this.contacts.filter(c => usedKeys.has(c.key));

      // Add groups as "virtual contacts"
      for (const key of usedKeys) {
        const conv = this.conversationsByKey[key];
        if (conv && conv.isGroup && !this.contacts.find(c => c.key === key)) {
          // Create a name for the group from participants
          const participantNames = conv.participants
            .map(k => this.keyToName[k] || k)
            .join(", ");
          this.contacts.push({
            key: key,
            name: participantNames,
            avatar: null, // no avatar for now
            isGroup: true,
            participants: conv.participants
          });
        }
      }

      if (!this.contacts.length) {
        this.selectedKey = null;
      } else if (!this.selectedKey || !usedKeys.has(this.selectedKey)) {
        this.selectedKey = this.contacts[0].key;
      }

      this.renderContacts();
      this.renderConversation();
    } catch (e) {
      console.error('Reload data error:', e.message);
    }
  },

  /**
   * Reloads all conversations in the new language while preserving progress
   * Called when the user changes the language in settings
   */
  async reloadForLanguageChange() {
    if (!this.storyPath) return;


    // 1. Save the state of all conversations
    const savedStates = {};
    for (const key of Object.keys(this.conversationsByKey)) {
      const conv = this.conversationsByKey[key];
      if (conv) {
        savedStates[key] = {
          scriptIndex: conv.scriptIndex || 0,
          playedCount: conv.playedMessages ? conv.playedMessages.length : 0,
          nextChoiceIdx: conv.nextChoiceIdx || 0,
          choicesMade: [...(conv.choicesMade || [])],
          waitingForChoice: conv.waitingForChoice || false,
          activeChoiceIdx: conv.activeChoiceIdx,
          nextRealChoiceIdx: conv.nextRealChoiceIdx || 0,
          waitingForRealChoice: conv.waitingForRealChoice || false,
          activeRealChoiceIdx: conv.activeRealChoiceIdx,
          realChoicesMade: [...(conv.realChoicesMade || [])],
          selectedPath: conv.selectedPath || null,
          waitingForLock: conv.waitingForLock || false
        };
      }
    }

    // 2. Save other important state
    const savedUnlockedFiles = [...this.unlockedFiles];
    const savedSelectedKey = this.selectedKey;
    const savedActiveConversationKey = this.activeConversationKey;
    const savedConversationSourceFiles = { ...this.conversationSourceFiles };
    const savedContactLastActivity = { ...this.contactLastActivity };
    const savedUnlockedInstaPosts = [...this.unlockedInstaPosts];
    const savedUnlockedSlutOnlyPosts = [...this.unlockedSlutOnlyPosts];

    // 3. Clear parsed files and conversations (but keep unlocked files)
    this.parsedFiles = [];
    this.conversationsByKey = {};

    // 4. Reload all unlocked files in the new language
    this.unlockedFiles = savedUnlockedFiles;
    this.conversationSourceFiles = savedConversationSourceFiles;
    this.contactLastActivity = savedContactLastActivity;
    this.unlockedInstaPosts = savedUnlockedInstaPosts;
    this.unlockedSlutOnlyPosts = savedUnlockedSlutOnlyPosts;

    try {
      // Reload characters and chapters
      const contacts = await this.loadCharacters();
      const newConversations = await this.loadChapters();

      this.contacts = contacts;

      // Add new conversations
      for (const key of Object.keys(newConversations)) {
        this.conversationsByKey[key] = newConversations[key];
        this.prepareConversationRuntime(this.conversationsByKey[key]);
      }

      // 5. Replay each conversation to its saved state
      for (const key of Object.keys(savedStates)) {
        const conv = this.conversationsByKey[key];
        const state = savedStates[key];

        if (conv) {
          // Always try to replay, even if scriptIndex is 0
          // This ensures the conversation state is properly restored
          const targetIndex = state.scriptIndex || 0;

          if (targetIndex > 0 || state.choicesMade.length > 0 || state.realChoicesMade.length > 0) {
            this.replayToState(
              conv,
              targetIndex,
              state.nextChoiceIdx,
              state.choicesMade,
              state.waitingForChoice,
              state.activeChoiceIdx,
              state.nextRealChoiceIdx,
              state.waitingForRealChoice,
              state.activeRealChoiceIdx,
              state.realChoicesMade,
              state.selectedPath
            );
          }

          // Restore waiting states even if no replay was needed
          if (state.waitingForChoice) {
            conv.waitingForChoice = true;
            conv.activeChoiceIdx = state.activeChoiceIdx;
          }
          if (state.waitingForRealChoice) {
            conv.waitingForRealChoice = true;
            conv.activeRealChoiceIdx = state.activeRealChoiceIdx;
          }
          if (state.waitingForLock) {
            conv.waitingForLock = true;
          }

        } else {
        }
      }

      // Restore selection
      this.selectedKey = savedSelectedKey;
      this.activeConversationKey = savedActiveConversationKey;

      // Keep only contacts that have conversations
      const usedKeys = new Set(Object.keys(this.conversationsByKey));
      this.contacts = this.contacts.filter(c => usedKeys.has(c.key));

      // Add groups as virtual contacts
      for (const key of usedKeys) {
        const conv = this.conversationsByKey[key];
        if (conv && conv.isGroup && !this.contacts.find(c => c.key === key)) {
          const participantNames = conv.participants
            .map(k => this.keyToName[k] || k)
            .join(", ");
          this.contacts.push({
            key: key,
            name: participantNames,
            avatar: null,
            isGroup: true,
            participants: conv.participants
          });
        }
      }

      // Re-render
      this.renderContacts();
      this.renderConversation();

    } catch (e) {
    }
  },

  // -------------------------------------------------------------------
  // DOM MOUNTING
  // -------------------------------------------------------------------
  mount() {
    const container = document.getElementById('messengerScreen');
    if (!container) {
      return;
    }

    const root = document.createElement('div');
    root.id = 'messenger-app';
    root.innerHTML = `
      <div class="ms-header" data-i18n="app.messenger">Messenger</div>
      <div class="ms-layout">
        <aside class="ms-contacts">
          <div class="ms-contacts-title" data-i18n="messenger.contacts">Contacts</div>
          <div class="ms-contacts-list" id="msContactsList"></div>
        </aside>

        <section class="ms-chat">
          <div class="ms-chat-header" id="msChatHeader">
            <div class="ms-placeholder" data-i18n="messenger.selectcontact">Select a contact.</div>
          </div>
          <div class="ms-chat-messages" id="msChatMessages">
            <div class="ms-placeholder" data-i18n="messenger.selectcontact.long">
              Select a contact on the left to view the conversation.
            </div>
          </div>

          <!-- New text/response area at bottom -->
          <div class="ms-chat-input" id="msChatInput">
            <div class="ms-chat-input-header"></div>
            <div class="ms-chat-input-body">
              <div class="ms-chat-input-main">
                <div class="ms-chat-input-idle">. . .</div>
              </div>
              <button class="ms-chat-send-btn" type="button"></button>
            </div>
          </div>
        </section>
      </div>
    `;

    container.innerHTML = "";
    container.appendChild(root);

    this.root               = root;
    this.contactsListEl     = root.querySelector('#msContactsList');
    this.chatHeaderEl       = root.querySelector('#msChatHeader');
    this.chatMessagesEl     = root.querySelector('#msChatMessages');
    this.contactsPaneEl     = root.querySelector('.ms-contacts');
    this.chatInputEl        = root.querySelector('#msChatInput');
    this.chatInputHeaderEl  = root.querySelector('.ms-chat-input-header');
    this.chatInputBodyEl    = root.querySelector('.ms-chat-input-body');
    this.chatInputMainEl    = root.querySelector('.ms-chat-input-main');
    this.chatSendBtnEl      = root.querySelector('.ms-chat-send-btn');

    if (this.chatSendBtnEl) {
      this.chatSendBtnEl.addEventListener('click', () => {
        this.onSendButtonClick();
      });
    }

    // Create clickable zone to expand/collapse the column
    if (this.contactsPaneEl && !this.contactsPaneEl.querySelector('.ms-contacts-toggle-zone')) {
      const toggleZone = document.createElement('div');
      toggleZone.className = 'ms-contacts-toggle-zone';
      this.contactsPaneEl.appendChild(toggleZone);

      toggleZone.addEventListener('click', (event) => {
        event.stopPropagation();  // don't trigger contact click
        this.toggleContactsExpanded();
      });
    }

    // initial state: collapsed column (avatars only)
    this.setContactsExpanded(false);

    // Listen for language changes to reload content
    window.addEventListener('languageChanged', () => {
      if (this.storyPath) {
        this.reloadForLanguageChange();
      }
    });
  },

  setContactsExpanded(expanded) {
    this.contactsExpanded = !!expanded;
    if (!this.contactsPaneEl) return;

    if (this.contactsExpanded) {
      this.contactsPaneEl.classList.add('ms-contacts--expanded');
    } else {
      this.contactsPaneEl.classList.remove('ms-contacts--expanded');
    }
  },

  toggleContactsExpanded() {
    this.setContactsExpanded(!this.contactsExpanded);
  },

  onSendButtonClick() {
    // a conversation must be selected
    if (!this.selectedKey) return;
    const conv = this.conversationsByKey[this.selectedKey];
    if (!conv) return;

    // If autoplay or fast mode is active, clicking the button stops it
    if (this.autoplayMode !== 'manual') {
      this.stopAutoPlay();
      // Don't advance - just stop the autoplay
      return;
    }

    // If another conversation has become active (due to an unlock),
    // we cannot advance in the old conversation
    // EXCEPT if the active conversation is finished
    if (this.activeConversationKey &&
        this.selectedKey !== this.activeConversationKey &&
        this.conversationsByKey[this.activeConversationKey]) {
      const activeConv = this.conversationsByKey[this.activeConversationKey];
      if (!this.isConversationFinished(activeConv)) {
        // The active conversation is not finished, we block
        return;
      }
    }

    // if we're waiting for a choice (fake or real) or lock, do nothing
    if (conv.waitingForChoice || conv.waitingForRealChoice || conv.waitingForLock) return;

    // if the conversation is finished, do nothing
    if (this.isConversationFinished(conv)) return;

    this.advanceConversation(conv);
  },

  /**
   * Checks if a conversation has exhausted all its scripted messages
   */
  isConversationFinished(conv) {
    if (!conv) return true;
    if (conv.waitingForChoice || conv.waitingForRealChoice || conv.waitingForLock) return false;
    const scriptIndex = typeof conv.scriptIndex === "number" ? conv.scriptIndex : 0;
    const messages = Array.isArray(conv.messages) ? conv.messages : [];
    return scriptIndex >= messages.length;
  },

  /**
   * Displays the next element of the script for a conversation:
   * - either a message/status
   * - or a fake choice block if we reach its position in the script
   */
  advanceConversation(conv) {
    if (!conv) return;

    if (!Array.isArray(conv.messages)) {
      conv.messages = [];
    }
    if (!Array.isArray(conv.fakeChoices)) {
      conv.fakeChoices = [];
    }
    if (!Array.isArray(conv.playedMessages)) {
      conv.playedMessages = [];
    }
    if (typeof conv.scriptIndex !== "number") {
      conv.scriptIndex = 0;
    }
    if (typeof conv.nextChoiceIdx !== "number") {
      conv.nextChoiceIdx = 0;
    }

    const scriptMessages = conv.messages;
    const fakeChoices = conv.fakeChoices;

    const scriptMsg =
      conv.scriptIndex < scriptMessages.length
        ? scriptMessages[conv.scriptIndex]
        : null;

    const nextChoice =
      conv.nextChoiceIdx < fakeChoices.length
        ? fakeChoices[conv.nextChoiceIdx]
        : null;

    // Decide if we should display a choice block now
    let shouldShowChoice = false;

    if (nextChoice) {
      if (typeof nextChoice.messageIndex === "number") {
        // Display the block as soon as the next message index
        // reaches the block's position
        if (conv.scriptIndex >= nextChoice.messageIndex) {
          shouldShowChoice = true;
        }
      } else {
        // Fallback if a block doesn't have messageIndex
        if (!scriptMsg || scriptMsg.chapter > nextChoice.chapter) {
          shouldShowChoice = true;
        }
      }
    }

    if (shouldShowChoice) {
      conv.waitingForChoice = true;
      conv.activeChoiceIdx = conv.nextChoiceIdx;
      this.renderConversation();
      // Auto-save when choice appears
      if (window.SavesLoad && typeof window.SavesLoad.autoSave === 'function') {
        window.SavesLoad.autoSave('Before choice');
      }
      return;
    }

    // No more scripted messages
    if (!scriptMsg) {
      this.renderConversation();
      return;
    }

    // --- Handling REAL CHOICES (realChoice) ---
    if (scriptMsg.kind === "realChoice") {
      const realChoices = conv.realChoices || [];
      const blockIdx = scriptMsg.choiceBlockIndex;
      const block = realChoices[blockIdx];


      if (block && block.options && block.options.length) {
        conv.waitingForRealChoice = true;
        conv.activeRealChoiceIdx = blockIdx;
        this.renderConversation();
        // Auto-save when important choice appears
        if (window.SavesLoad && typeof window.SavesLoad.autoSave === 'function') {
          window.SavesLoad.autoSave('Before important choice');
        }
        return;
      } else {
        // Invalid block, skip to next
        conv.scriptIndex += 1;
        this.advanceConversation(conv);
        return;
      }
    }

    // --- Handling PATHS ---
    if (scriptMsg.kind === "pathStart") {
      const pathLabel = scriptMsg.pathLabel;
      conv.scriptIndex += 1;

      // If we don't have a selected path OR the path doesn't match
      if (!conv.selectedPath || conv.selectedPath !== pathLabel) {
        // Skip everything until End path
        let depth = 1;
        while (conv.scriptIndex < scriptMessages.length && depth > 0) {
          const msg = scriptMessages[conv.scriptIndex];
          if (msg.kind === "pathStart") {
            depth++;
          } else if (msg.kind === "pathEnd") {
            depth--;
          }
          conv.scriptIndex++;
        }
        // Continue with the next message after End path
        this.advanceConversation(conv);
        return;
      }
      // The path matches, continue normally
      this.advanceConversation(conv);
      return;
    }

    if (scriptMsg.kind === "pathEnd") {
      // End of path, reset the selected path
      conv.selectedPath = null;
      conv.scriptIndex += 1;
      this.advanceConversation(conv);
      return;
    }

    // If it's an "unlock" message, unlock the file
    // Do NOT continue automatically - the unlock may trigger a conversation change
    if (scriptMsg.kind === "unlock") {
      // Check if this file is already unlocked (already in unlockedFiles)
      // If yes, simply move to the next message
      if (this.unlockedFiles.includes(scriptMsg.file)) {
        conv.scriptIndex += 1;
        this.advanceConversation(conv);
        return;
      }

      // Record the action in history for going back
      if (!Array.isArray(conv.actionHistory)) conv.actionHistory = [];
      conv.actionHistory.push({
        type: 'unlock',
        file: scriptMsg.file,
        previousScriptIndex: conv.scriptIndex,
        previousActiveConversationKey: this.activeConversationKey
      });

      conv.scriptIndex += 1;
      this.unlockFile(scriptMsg.file);
      // Stop here - unlockFile will call reloadData() which calls renderConversation()
      // Do NOT call renderConversation() here as it creates a race condition with the
      // render that happens inside reloadData(), causing scroll issues
      return;
    }

    // If it's an "unlockInsta" message, unlock the InstaPics post and move to next
    if (scriptMsg.kind === "unlockInsta") {
      conv.scriptIndex += 1;
      this.unlockInstaPost(scriptMsg.file);
      // Continue to display the next message
      this.advanceConversation(conv);
      return;
    }

    // If it's an "unlockSlutOnly" message, unlock the SlutOnly post and move to next
    if (scriptMsg.kind === "unlockSlutOnly") {
      conv.scriptIndex += 1;
      this.unlockSlutOnlyPost(scriptMsg.file);
      // Continue to display the next message
      this.advanceConversation(conv);
      return;
    }

    // If it's a "lock" message, check tier and show modal if needed
    if (scriptMsg.kind === "lock") {
      this.handleLockMessage(conv, scriptMsg);
      return;
    }

    // If it's a "spy_unlock" message, unlock the Spy app
    if (scriptMsg.kind === "spy_unlock") {
      if (typeof window.unlockSpyApp === 'function') {
        window.unlockSpyApp();
      }

      // Show notification for SpyApp installation
      if (window.Notifications && window.Notifications.showSpy) {
        const notifText = window.Translations ? window.Translations.get('notif.spy.installed') : 'SpyApp has been successfully installed';
        window.Notifications.showSpy(notifText);
      }

      // Move to next message
      conv.scriptIndex += 1;
      this.advanceConversation(conv);
      return;
    }

    // If it's a "spy_anchor" message, update the spy anchor level
    if (scriptMsg.kind === "spy_anchor") {
      if (typeof window.setSpyAnchor === 'function') {
        window.setSpyAnchor(scriptMsg.anchor);
      }

      // Show notification for new spy content
      if (window.Notifications && window.Notifications.showSpy) {
        const notifText = window.Translations ? window.Translations.get('notif.spy') : 'SpyApp intercepted new content';
        window.Notifications.showSpy(notifText);
      }

      // Move to next message
      conv.scriptIndex += 1;
      this.advanceConversation(conv);
      return;
    }

    // If it's a "spy_unlock_instapics" message, unlock InstaPics on GF's phone
    if (scriptMsg.kind === "spy_unlock_instapics") {
      if (typeof window.unlockSpyInstapicsApp === 'function') {
        window.unlockSpyInstapicsApp();
      }

      // Show notification for new app detected
      if (window.Notifications && window.Notifications.showSpy) {
        const notifText = window.Translations ? window.Translations.get('notif.spy.instapics') : 'New app detected: InstaPics';
        window.Notifications.showSpy(notifText);
      }

      // Move to next message
      conv.scriptIndex += 1;
      this.advanceConversation(conv);
      return;
    }

    // If it's a "spy_unlock_onlyslut" message, unlock OnlySlut on GF's phone
    if (scriptMsg.kind === "spy_unlock_onlyslut") {
      if (typeof window.unlockSpyOnlyslutApp === 'function') {
        window.unlockSpyOnlyslutApp();
      }

      // Show notification for new app detected
      if (window.Notifications && window.Notifications.showSpy) {
        const notifText = window.Translations ? window.Translations.get('notif.spy.onlyslut') : 'New app detected: OnlySlut';
        window.Notifications.showSpy(notifText);
      }

      // Move to next message
      conv.scriptIndex += 1;
      this.advanceConversation(conv);
      return;
    }

    // If it's a "thinking" message, handle the thinking overlay
    if (scriptMsg.kind === "thinking") {
      const blocks = scriptMsg.blocks || [];

      // Initialize thinking state if not already set
      if (typeof conv.thinkingBlockIndex !== "number") {
        conv.thinkingBlockIndex = 0;
      }

      // Check if we have more blocks to show
      if (conv.thinkingBlockIndex < blocks.length) {
        // Show the current thinking block
        conv.activeThinking = {
          text: blocks[conv.thinkingBlockIndex],
          blockIndex: conv.thinkingBlockIndex,
          totalBlocks: blocks.length
        };
        conv.thinkingBlockIndex += 1;
        this.renderConversation();
        return;
      }

      // All blocks shown, close thinking and move to next message
      conv.activeThinking = null;
      conv.thinkingBlockIndex = undefined;

      // Record the action in history for going back (with blocks info)
      if (!Array.isArray(conv.actionHistory)) conv.actionHistory = [];
      conv.actionHistory.push({
        type: 'thinking',
        previousScriptIndex: conv.scriptIndex,
        totalBlocks: blocks.length
      });

      conv.scriptIndex += 1;
      this.advanceConversation(conv);
      return;
    }

    // If it's a "delete" message, handle the deletion
    if (scriptMsg.kind === "delete") {
      conv.scriptIndex += 1;

      // Find the last deletable message (not a status, not a delete)
      const deletableKinds = ['talk', 'image', 'video', 'audio'];
      let targetMsg = null;
      for (let i = conv.playedMessages.length - 1; i >= 0; i--) {
        const msg = conv.playedMessages[i];
        if (deletableKinds.includes(msg.kind) && !msg.deleted) {
          targetMsg = msg;
          break;
        }
      }

      if (targetMsg) {
        // Record the deletion action in history
        if (!Array.isArray(conv.actionHistory)) conv.actionHistory = [];
        conv.actionHistory.push({
          type: 'delete',
          deletedMessage: targetMsg,
          previousScriptIndex: conv.scriptIndex - 1
        });

        if (scriptMsg.timer !== null && scriptMsg.timer > 0) {
          // Deletion with timer: auto-delete after X ms (independent of clicks)
          // Continue immediately to the next message
          const deleteScriptIndex = conv.scriptIndex - 1;
          if (!Array.isArray(conv.pendingDeleteTimers)) conv.pendingDeleteTimers = [];
          const timeoutId = setTimeout(() => {
            targetMsg.deleted = true;
            targetMsg.deletedAtScriptIndex = deleteScriptIndex;
            // Remove this timer from the pending timers list
            conv.pendingDeleteTimers = conv.pendingDeleteTimers.filter(t => t.timeoutId !== timeoutId);
            this.renderConversation();
          }, scriptMsg.timer);
          conv.pendingDeleteTimers.push({
            timeoutId,
            message: targetMsg,
            scriptIndex: deleteScriptIndex
          });
          // Continue to the next message
          this.advanceConversation(conv);
        } else {
          // Deletion without timer: immediate deletion, it's a standalone action
          targetMsg.deleted = true;
          targetMsg.deletedAtScriptIndex = conv.scriptIndex - 1;
          this.renderConversation();
          // Stop here, the next message will come on the next click
        }
      } else {
        // No message to delete, continue
        this.advanceConversation(conv);
      }
      return;
    }

    // Add the scripted message to the displayed timeline
    conv.playedMessages.push(scriptMsg);

    // Record the action in history for going back
    if (!Array.isArray(conv.actionHistory)) conv.actionHistory = [];
    conv.actionHistory.push({
      type: 'script',
      previousScriptIndex: conv.scriptIndex
    });

    conv.scriptIndex += 1;

    // Check if the next element is a $delete with timer
    // If yes, start the timer immediately and skip the $delete instruction
    const nextScriptMsg = conv.scriptIndex < scriptMessages.length
      ? scriptMessages[conv.scriptIndex]
      : null;

    if (nextScriptMsg && nextScriptMsg.kind === "delete" && nextScriptMsg.timer !== null && nextScriptMsg.timer > 0) {
      // Start the timer to delete this message
      const msgToDelete = scriptMsg;
      const deleteScriptIndex = conv.scriptIndex;
      if (!Array.isArray(conv.pendingDeleteTimers)) conv.pendingDeleteTimers = [];
      const timeoutId = setTimeout(() => {
        msgToDelete.deleted = true;
        msgToDelete.deletedAtScriptIndex = deleteScriptIndex;
        // Remove this timer from the pending timers list
        conv.pendingDeleteTimers = conv.pendingDeleteTimers.filter(t => t.timeoutId !== timeoutId);
        this.renderConversation();
      }, nextScriptMsg.timer);
      conv.pendingDeleteTimers.push({
        timeoutId,
        message: msgToDelete,
        scriptIndex: deleteScriptIndex
      });
      // Skip the $delete instruction since we've already processed it
      conv.scriptIndex += 1;
    }

    this.renderConversation();

    // Auto-expand media in lightbox if enabled (only for images and videos, not audio)
    if ((scriptMsg.kind === 'image' || scriptMsg.kind === 'video') &&
        window.Settings && window.Settings.get('autoExpandMedia')) {
      // Build the media source path
      let mediaSrc;
      if (scriptMsg.kind === 'image') {
        const picsBasePath = scriptMsg.parentDir
          ? `${this.storyPath}/talks/${scriptMsg.parentDir}/pics`
          : `${this.storyPath}/talks/pics`;
        mediaSrc = this.getCacheBustedUrl(`${picsBasePath}/${scriptMsg.image}`);
        this.openLightbox(mediaSrc, 'image');
      } else if (scriptMsg.kind === 'video') {
        const vidsBasePath = scriptMsg.parentDir
          ? `${this.storyPath}/talks/${scriptMsg.parentDir}/vids`
          : `${this.storyPath}/talks/vids`;
        mediaSrc = this.getCacheBustedUrl(`${vidsBasePath}/${scriptMsg.video}`);
        this.openLightbox(mediaSrc, 'video');
      }
    }

    // Auto-save after receiving media (image, video, audio)
    if (scriptMsg.kind === 'image' || scriptMsg.kind === 'video' || scriptMsg.kind === 'audio') {
      if (window.SavesLoad && typeof window.SavesLoad.autoSave === 'function') {
        window.SavesLoad.autoSave('After media');
      }
    }
  },

  // -------------------------------------------------------------------
  // TEXT VARIABLES
  // -------------------------------------------------------------------
  /**
   * Replaces variables in text (e.g.: $gf -> girlfriend's name)
   */
  replaceVariables(text) {
    if (!text) return text;

    let result = text;

    // Replace $gf with the girlfriend's custom name
    if (window.customizableCharacterInfo && window.customCharacterNames) {
      const info = window.customizableCharacterInfo;
      const customName = window.customCharacterNames[info.key];

      if (customName) {
        // Replace $gf (case insensitive)
        result = result.replace(/\$gf\b/gi, customName);
        // Also replace $girlfriend if used
        result = result.replace(/\$girlfriend\b/gi, customName);
      }
    }

    // Replace $mc with the player's username
    if (window.mcName) {
      result = result.replace(/\$mc\b/gi, window.mcName);
      result = result.replace(/\$player\b/gi, window.mcName);
    }

    return result;
  },

  // -------------------------------------------------------------------
  // DATA LOADING
  // -------------------------------------------------------------------

  async loadCharacters() {
    const url = `${this.storyPath}/characters/characters.txt`;
    const res = await fetch(this.getCacheBustedUrl(url));

    if (!res.ok) {
      return [];
    }

    const txt = await res.text();
    const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    const contacts = [];
    const seenKeys = new Set();
    const nameToKey = {}; // mapping full name (lowercase) -> key

    for (const line of lines) {
      let name, file, key;

      // Format with customizable name: GenericName "DefaultName" (avatar.png) = key
      // e.g.: Girlfriend "Sarah" (gf.png) = gf
      const matchCustom = line.match(/^(.+?)\s+"(.+?)"\s*\((.+?)\)\s*=\s*(\S+)$/);

      if (matchCustom) {
        const genericName = matchCustom[1].trim();
        const defaultName = matchCustom[2].trim();
        file = matchCustom[3].trim();
        key = matchCustom[4].trim().toLowerCase();

        // The displayed name will be the one customized by the user, or the default name
        name = (window.customCharacterNames && window.customCharacterNames[key])
          ? window.customCharacterNames[key]
          : defaultName;

        // Add all possible aliases to the mapping
        nameToKey[genericName.toLowerCase()] = key;
        nameToKey[defaultName.toLowerCase()] = key;
      } else {
        // Standard format: Name (avatar.png) = abbreviation
        // e.g.: Sarah (sarah.png) = gf
        const match = line.match(/^(.+?)\s*\((.+?)\)\s*=\s*(\S+)$/);
        if (!match) continue;

        name = match[1].trim();
        file = match[2].trim();
        key = match[3].trim().toLowerCase();

        // Add the mapping full name -> abbreviation (case insensitive)
        nameToKey[name.toLowerCase()] = key;
      }

      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      // Also add the abbreviation itself for consistency
      nameToKey[key] = key;

      // Reverse mapping: key -> full name
      this.keyToName[key] = name;

      // Store the avatar for all characters (even those without conversations)
      // Use cache-busting to ensure latest version
      const avatarPath = this.getCacheBustedUrl(`${this.storyPath}/characters/avatar/${file}`);
      this.avatarsByKey[key] = avatarPath;

      contacts.push({
        key,
        name,
        avatar: avatarPath
      });
    }

    // Store the mapping for use in parseChapter
    this.nameToKey = nameToKey;

    return contacts;
  },

  // List of unlocked files (starts with start.txt)
  unlockedFiles: ['start.txt'],
  // List of already parsed files (to avoid reparsing)
  parsedFiles: [],
  // List of unlocked InstaPics posts (e.g.: ['1.txt', '2.txt'])
  unlockedInstaPosts: [],
  // List of unlocked SlutOnly posts (e.g.: ['1.txt', '2.txt'])
  unlockedSlutOnlyPosts: [],
  // Files pending unlock (will be unlocked when the user reaches $talks)
  pendingUnlocks: {}, // filename -> { unlockFile, messageIndex }

  async loadChapters() {
    const base = `${this.storyPath}/talks`;
    const conversations = {}; // alias -> { key, messages: [] }

    // Only load unlocked files that haven't been parsed yet
    for (const filename of this.unlockedFiles) {
      if (this.parsedFiles.includes(filename)) continue;

      const url = `${base}/${filename}`;
      let content;
      try {
        // Use line-level merge for translations (missing lines fall back to default)
        if (window.Translations && window.Translations.fetchMergedContent) {
          content = await window.Translations.fetchMergedContent(url);
        } else {
          // Fallback with cache-busting
          const res = await fetch(this.getCacheBustedUrl(url));
          content = res.ok ? await res.text() : null;
        }
      } catch (e) {
        continue;
      }

      if (content === null) {
        continue;
      }

      this.parseChapter(content, filename, conversations);
      this.parsedFiles.push(filename);
    }

    return conversations;
  },

  /**
   * Unlocks a new file and reloads the data
   */
  async unlockFile(filename) {
    if (this.unlockedFiles.includes(filename)) {
      return;
    }

    this.unlockedFiles.push(filename);

    // Load the file to know which conversation it belongs to
    // and mark this contact as having new content
    const base = `${this.storyPath}/talks`;
    const url = `${base}/${filename}`;
    let newConversationKey = null;

    try {
      // Use line-level merge for translations
      let content;
      if (window.Translations && window.Translations.fetchMergedContent) {
        content = await window.Translations.fetchMergedContent(url);
      } else {
        // Fallback with cache-busting
        const res = await fetch(this.getCacheBustedUrl(url));
        content = res.ok ? await res.text() : null;
      }

      if (content) {
        const lines = content.split(/\r?\n/);
        // Look for the first line that identifies the contact or group
        if (lines.length > 0) {
          const firstLine = lines[0].trim();
          // Check if it's a message (contains ":" with text after)
          const msgMatch = firstLine.match(/^([^:]+)\s*:\s*(.+)$/);
          if (firstLine && !firstLine.startsWith("$") && !msgMatch) {
            // It's either a single contact or a group
            if (firstLine.includes(",")) {
              // It's a group!
              const names = firstLine.split(",").map(n => n.trim()).filter(Boolean);
              const keys = names.map(n => this.nameToKey[n.toLowerCase()] || n.toLowerCase());
              const groupKey = "group_" + keys.sort().join("_");
              this.contactsWithNew.add(groupKey);
              this.contactLastActivity[groupKey] = Date.now();
              newConversationKey = groupKey;
            } else {
              // Single contact
              const contactKey = this.nameToKey[firstLine.toLowerCase()] || firstLine.toLowerCase();
              this.contactsWithNew.add(contactKey);
              this.contactLastActivity[contactKey] = Date.now();
              newConversationKey = contactKey;
            }
          } else if (!msgMatch) {
            // Otherwise, look for the first NPC message to identify the contact
            for (const line of lines) {
              const match = line.match(/^([^:]+)\s*:(.*)$/);
              if (match) {
                const rawKey = match[1].trim().toLowerCase();
                if (rawKey !== "mc") {
                  const contactKey = this.nameToKey[rawKey] || rawKey;
                  this.contactsWithNew.add(contactKey);
                  this.contactLastActivity[contactKey] = Date.now();
                  newConversationKey = contactKey;
                  break;
                }
              }
            }
          }
        }
      }
    } catch (e) {
      // Continue even if we couldn't identify the contact
    }

    // Determine if we're switching conversations
    const isConversationSwitch = newConversationKey && newConversationKey !== this.activeConversationKey;

    // Update conversation history if switching conversations
    if (isConversationSwitch) {
      // Save the previous conversation in history
      if (this.activeConversationKey) {
        this.conversationHistory.push({
          key: this.activeConversationKey,
          file: filename // file that triggered the change
        });
      }
      this.activeConversationKey = newConversationKey;
    }

    // Register the source file for this conversation
    if (newConversationKey) {
      if (!this.conversationSourceFiles[newConversationKey]) {
        this.conversationSourceFiles[newConversationKey] = [];
      }
      if (!this.conversationSourceFiles[newConversationKey].includes(filename)) {
        this.conversationSourceFiles[newConversationKey].push(filename);
      }
    }

    await this.reloadData();

    // If we changed conversation, add an entry marker in actionHistory
    // This allows the back button to stop at the entry point
    if (isConversationSwitch && newConversationKey) {
      const conv = this.conversationsByKey[newConversationKey];
      if (conv) {
        if (!Array.isArray(conv.actionHistory)) conv.actionHistory = [];
        conv.actionHistory.push({
          type: 'conversationEntry',
          fromConversationKey: this.conversationHistory.length > 0
            ? this.conversationHistory[this.conversationHistory.length - 1].key
            : null
        });
      }
    }

    // Auto-save when a conversation is unlocked
    if (window.SavesLoad && typeof window.SavesLoad.autoSave === 'function') {
      window.SavesLoad.autoSave('New conversation');
    }
  },

  // ============================================================================
  // LOCK SYSTEM - Subscription tier gating
  // ============================================================================

  // Tier hierarchy (higher = more access)
  TIER_HIERARCHY: {
    'BRONZE': 1,
    'SILVER': 2,
    'GOLD': 3,
    'DIAMOND': 4,
    'PLATINUM': 5
  },

  // API endpoint for code verification
  LOCK_API_URL: 'https://api.s-emperor.studio/verify-code.php',

  /**
   * Get stored tiers from localStorage
   * Returns object: { code: tier } e.g. { "MYCODE123": "GOLD" }
   */
  getStoredTiers() {
    try {
      const data = localStorage.getItem('studio_subscription_tiers');
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  },

  /**
   * Save a validated tier to localStorage
   */
  saveTier(code, tier) {
    const tiers = this.getStoredTiers();
    tiers[code.toUpperCase()] = tier.toUpperCase();
    localStorage.setItem('studio_subscription_tiers', JSON.stringify(tiers));
  },

  /**
   * Get the highest tier level the user has access to
   */
  getHighestTierLevel() {
    const tiers = this.getStoredTiers();
    let highest = 0;
    for (const code in tiers) {
      const tierName = tiers[code];
      const level = this.TIER_HIERARCHY[tierName] || 0;
      if (level > highest) highest = level;
    }
    return highest;
  },

  /**
   * Check if user has access to a specific tier (local check only)
   */
  hasLocalAccessToTier(requiredTier) {
    const requiredLevel = this.TIER_HIERARCHY[requiredTier.toUpperCase()] || 0;
    const userLevel = this.getHighestTierLevel();
    return userLevel >= requiredLevel;
  },

  /**
   * Verify stored codes with the API and return the best valid code for the tier
   * Returns { valid: true, code, tier } or { valid: false }
   */
  async verifyStoredCodes(requiredTier) {
    const storedTiers = this.getStoredTiers();
    const requiredLevel = this.TIER_HIERARCHY[requiredTier.toUpperCase()] || 0;

    // Find codes that might give access to this tier
    const candidates = [];
    for (const code in storedTiers) {
      const tierName = storedTiers[code];
      const level = this.TIER_HIERARCHY[tierName] || 0;
      if (level >= requiredLevel) {
        candidates.push({ code, tier: tierName, level });
      }
    }

    if (candidates.length === 0) {
      return { valid: false };
    }

    // Sort by level descending (check highest tier first)
    candidates.sort((a, b) => b.level - a.level);

    // Verify each candidate with the API
    for (const candidate of candidates) {
      try {
        const response = await fetch(this.LOCK_API_URL + '?action=verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: candidate.code,
            tier: requiredTier
          })
        });

        const result = await response.json();

        if (result.success) {
          // Code is still valid
          return { valid: true, code: candidate.code, tier: result.tier };
        } else {
          // Code is no longer valid, remove it from storage
          this.removeTier(candidate.code);
        }
      } catch (e) {
        // Network error - keep the code and assume valid for now
        return { valid: true, code: candidate.code, tier: candidate.tier };
      }
    }

    // No valid codes found
    return { valid: false };
  },

  /**
   * Remove a tier from localStorage
   */
  removeTier(code) {
    const tiers = this.getStoredTiers();
    delete tiers[code.toUpperCase()];
    localStorage.setItem('studio_subscription_tiers', JSON.stringify(tiers));
  },

  /**
   * Parse a lock file and return { tier, targetFile }
   * Lock file format:
   *   [GOLD]
   *   $talks = chapter2/sun.txt
   */
  async parseLockFile(lockFilePath) {
    const base = `${this.storyPath}/talks`;
    const url = `${base}/${lockFilePath}`;

    try {
      const res = await fetch(this.getCacheBustedUrl(url));
      if (!res.ok) return null;

      const content = await res.text();
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

      let tier = null;
      let targetFile = null;

      for (const line of lines) {
        // Check for tier: [GOLD], [SILVER], etc.
        const tierMatch = line.match(/^\[([A-Z]+)\]$/i);
        if (tierMatch) {
          tier = tierMatch[1].toUpperCase();
          continue;
        }

        // Check for $talks = file.txt
        const talksMatch = line.match(/^\$talks\s*=\s*(.+)$/i);
        if (talksMatch) {
          targetFile = talksMatch[1].trim();
          continue;
        }
      }

      return { tier, targetFile };
    } catch (e) {
      return null;
    }
  },

  /**
   * Handle a lock message - check access and show modal if needed
   */
  async handleLockMessage(conv, scriptMsg) {
    // Stop autoplay during lock check
    this.pauseAutoPlay();

    const lockData = await this.parseLockFile(scriptMsg.file);

    if (!lockData || !lockData.tier || !lockData.targetFile) {
      conv.scriptIndex += 1;
      this.advanceConversation(conv);
      return;
    }

    // Verify stored codes with the API
    const verification = await this.verifyStoredCodes(lockData.tier);

    if (verification.valid) {
      // Record the action in history for going back
      if (!Array.isArray(conv.actionHistory)) conv.actionHistory = [];
      conv.actionHistory.push({
        type: 'lock',
        file: scriptMsg.file,
        targetFile: lockData.targetFile,
        tier: lockData.tier,
        previousScriptIndex: conv.scriptIndex,
        previousActiveConversationKey: this.activeConversationKey
      });

      // User has a valid code - unlock the target file
      conv.scriptIndex += 1;
      await this.unlockFile(lockData.targetFile);
      this.renderConversation();
    } else {
      // User needs to enter a code - show modal
      this.showLockModal(conv, scriptMsg, lockData);
    }
  },

  /**
   * Show the lock modal for code entry
   */
  showLockModal(conv, scriptMsg, lockData) {
    const modal = document.getElementById('lockModal');
    if (!modal) {
      console.error('Lock modal not found');
      return;
    }

    // Set waiting flag and pause autoplay
    conv.waitingForLock = true;
    this.pauseAutoPlay();

    const tierLabel = document.getElementById('lockTierLabel');
    const input = document.getElementById('lockCodeInput');
    const errorEl = document.getElementById('lockError');
    const confirmBtn = document.getElementById('lockConfirmBtn');
    const cancelBtn = document.getElementById('lockCancelBtn');

    // Set tier label
    if (tierLabel) {
      tierLabel.textContent = lockData.tier;
      tierLabel.className = 'lock-tier-badge lock-tier-' + lockData.tier.toLowerCase();
    }

    // Reset state
    if (input) input.value = '';
    if (errorEl) errorEl.textContent = '';

    // Store context for callbacks
    this._lockContext = { conv, scriptMsg, lockData };

    // Show modal
    modal.classList.remove('hidden');

    // Focus input
    if (input) input.focus();

    // Setup event listeners (remove old ones first)
    if (this._lockConfirmHandler) {
      confirmBtn.removeEventListener('click', this._lockConfirmHandler);
    }
    if (this._lockCancelHandler) {
      cancelBtn.removeEventListener('click', this._lockCancelHandler);
    }
    if (this._lockKeyHandler) {
      input.removeEventListener('keydown', this._lockKeyHandler);
    }

    this._lockConfirmHandler = () => this.onLockConfirm();
    this._lockCancelHandler = () => this.onLockCancel();
    this._lockKeyHandler = (e) => {
      if (e.key === 'Enter') this.onLockConfirm();
      if (e.key === 'Escape') this.onLockCancel();
    };

    confirmBtn.addEventListener('click', this._lockConfirmHandler);
    cancelBtn.addEventListener('click', this._lockCancelHandler);
    input.addEventListener('keydown', this._lockKeyHandler);
  },

  /**
   * Handle lock modal confirmation
   */
  async onLockConfirm() {
    const input = document.getElementById('lockCodeInput');
    const errorEl = document.getElementById('lockError');
    const confirmBtn = document.getElementById('lockConfirmBtn');

    if (!this._lockContext) return;

    const code = (input.value || '').trim().toUpperCase();
    if (!code) {
      if (errorEl) errorEl.textContent = 'Please enter a code';
      return;
    }

    const { conv, scriptMsg, lockData } = this._lockContext;

    // Disable button during verification
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = '...';
    }

    try {
      // Verify code via API
      const response = await fetch(this.LOCK_API_URL + '?action=verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code,
          tier: lockData.tier
        })
      });

      const result = await response.json();

      if (result.success) {
        // Save the tier
        this.saveTier(code, result.tier);

        // Close modal
        this.closeLockModal();

        // Record the action in history for going back
        if (!Array.isArray(conv.actionHistory)) conv.actionHistory = [];
        conv.actionHistory.push({
          type: 'lock',
          file: scriptMsg.file,
          targetFile: lockData.targetFile,
          tier: lockData.tier,
          previousScriptIndex: conv.scriptIndex,
          previousActiveConversationKey: this.activeConversationKey
        });

        // Proceed with unlock
        conv.scriptIndex += 1;
        await this.unlockFile(lockData.targetFile);
        this.renderConversation();
      } else {
        // Show error
        if (errorEl) {
          if (result.error === 'Tier insufficient') {
            errorEl.textContent = `Code "${result.codeTier}" insufficient. Requires ${result.requiredTier} or higher.`;
          } else {
            errorEl.textContent = result.error || 'Invalid code';
          }
        }
      }
    } catch (e) {
      if (errorEl) errorEl.textContent = 'Connection error. Please try again.';
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirm';
      }
    }
  },

  /**
   * Handle lock modal cancellation
   */
  onLockCancel() {
    this.closeLockModal();
    // Don't advance - user stays at current position
    this.renderConversation();
  },

  /**
   * Close the lock modal
   */
  closeLockModal() {
    const modal = document.getElementById('lockModal');
    if (modal) modal.classList.add('hidden');

    // Reset waiting flag
    if (this._lockContext && this._lockContext.conv) {
      this._lockContext.conv.waitingForLock = false;
    }

    this._lockContext = null;
  },

  /**
   * Unlocks an InstaPics post
   */
  unlockInstaPost(filename) {
    if (this.unlockedInstaPosts.includes(filename)) return;

    this.unlockedInstaPosts.push(filename);

    // Reserve a spot in the queue BEFORE async loading
    const reservationId = window.Notifications ? window.Notifications.reserve() : null;

    // Load and display the notification (async)
    this.showInstaNotification(filename, reservationId);

    // If InstaPics is loaded, notify it of the new post
    if (window.InstaPics && typeof window.InstaPics.onPostUnlocked === 'function') {
      window.InstaPics.onPostUnlocked(filename);
    }
  },

  /**
   * Loads and displays a notification for an InstaPics post
   */
  async showInstaNotification(filename, reservationId) {
    try {
      // Derive instapics path from storyPath (stories/X/messenger -> stories/X/instapics)
      const basePath = this.storyPath.replace(/\/messenger$/, '');
      const instaPath = `${basePath}/instapics`;

      // Load the post file with translation support
      const postUrl = `${instaPath}/posts/${filename}`;
      let content;
      if (window.Translations && window.Translations.fetchMergedContent) {
        content = await window.Translations.fetchMergedContent(postUrl);
      } else {
        const postRes = await fetch(this.getCacheBustedUrl(postUrl));
        if (!postRes.ok) return;
        content = await postRes.text();
      }
      if (!content) return;
      const lines = content.split(/\r?\n/);
      if (!lines.length) return;

      const authorName = (lines[0] || '').trim();
      if (!authorName) return;

      // Get the post text
      let postText = '';
      for (const line of lines) {
        if (line.toLowerCase().startsWith('text')) {
          const after = line.split(':')[1];
          if (after) postText = after.trim();
          break;
        }
      }

      // Load characters to get the avatar
      const charsUrl = `${instaPath}/characters/characters.txt`;
      const charsRes = await fetch(this.getCacheBustedUrl(charsUrl));
      let avatar = 'assets/instapics.png'; // fallback

      if (charsRes.ok) {
        const charsTxt = await charsRes.text();
        const charLines = charsTxt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        for (const line of charLines) {
          const match = line.match(/^(.+?)\s*\((.+?)\)\s*$/);
          if (match && match[1].trim() === authorName) {
            avatar = `${instaPath}/characters/avatar/${match[2].trim()}`;
            break;
          }
        }
      }

      // Extract post index from filename (e.g.: "1.txt" -> 1)
      const indexMatch = filename.match(/^(\d+)\.txt$/);
      const postIndex = indexMatch ? parseInt(indexMatch[1], 10) : 0;

      // Fill the reservation with data
      if (window.Notifications && reservationId) {
        window.Notifications.fulfill(reservationId, {
          app: 'InstaPics',
          appIcon: 'assets/apps_icon/instapics.svg',
          avatar: avatar,
          author: authorName,
          text: postText,
          postIndex: postIndex
        });
      }
    } catch (e) {
    }
  },

  /**
   * Returns the list of unlocked InstaPics posts
   */
  getUnlockedInstaPosts() {
    return [...this.unlockedInstaPosts];
  },

  /**
   * Unlocks a SlutOnly post
   */
  unlockSlutOnlyPost(filename) {
    if (this.unlockedSlutOnlyPosts.includes(filename)) return;

    this.unlockedSlutOnlyPosts.push(filename);

    // Reserve a spot in the queue BEFORE async loading
    const reservationId = window.Notifications ? window.Notifications.reserve() : null;

    // Load and display the notification (async)
    this.showSlutOnlyNotification(filename, reservationId);

    // If OnlySlut is loaded, notify it of the new post
    if (window.OnlySlut && typeof window.OnlySlut.onPostUnlocked === 'function') {
      window.OnlySlut.onPostUnlocked(filename);
    }
  },

  /**
   * Loads and displays a notification for an OnlySlut post
   */
  async showSlutOnlyNotification(filename, reservationId) {
    try {
      // Derive onlyslut path from storyPath (stories/X/messenger -> stories/X/onlyslut)
      const basePath = this.storyPath.replace(/\/messenger$/, '');
      const slutPath = `${basePath}/onlyslut`;

      // Load the post file with translation support
      const postUrl = `${slutPath}/posts/${filename}`;
      let content;
      if (window.Translations && window.Translations.fetchMergedContent) {
        content = await window.Translations.fetchMergedContent(postUrl);
      } else {
        const postRes = await fetch(this.getCacheBustedUrl(postUrl));
        if (!postRes.ok) return;
        content = await postRes.text();
      }
      if (!content) return;
      const lines = content.split(/\r?\n/);
      if (!lines.length) return;

      const authorName = (lines[0] || '').trim();
      if (!authorName) return;

      // Get the post text
      let postText = '';
      for (const line of lines) {
        if (line.toLowerCase().startsWith('text')) {
          const after = line.split(':')[1];
          if (after) postText = after.trim();
          break;
        }
      }

      // Load characters to get the avatar
      const charsUrl = `${slutPath}/characters/characters.txt`;
      const charsRes = await fetch(this.getCacheBustedUrl(charsUrl));
      let avatar = 'assets/apps_icon/onlyslut.png'; // fallback

      if (charsRes.ok) {
        const charsTxt = await charsRes.text();
        const charLines = charsTxt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        for (const line of charLines) {
          const match = line.match(/^(.+?)\s*\((.+?)\)\s*$/);
          if (match && match[1].trim() === authorName) {
            avatar = `${slutPath}/characters/avatar/${match[2].trim()}`;
            break;
          }
        }
      }

      // Extract post index from filename (e.g.: "1.txt" -> 1)
      const indexMatch = filename.match(/^(\d+)\.txt$/);
      const postIndex = indexMatch ? parseInt(indexMatch[1], 10) : 0;

      // Fill the reservation with data
      if (window.Notifications && reservationId) {
        window.Notifications.fulfill(reservationId, {
          app: 'OnlySlut',
          appIcon: 'assets/apps_icon/onlyslut.png',
          avatar: avatar,
          author: authorName,
          text: postText,
          postIndex: postIndex
        });
      }
    } catch (e) {
    }
  },

  /**
   * Returns the list of unlocked SlutOnly posts
   */
  getUnlockedSlutOnlyPosts() {
    return [...this.unlockedSlutOnlyPosts];
  },

  /**
   * Parses a dialogue file (start.txt, 2.txt, etc.)
   * Line format:
   *   Line 1: Contact name (optional, if no ":" or "$")
   *   mc: Hi
   *   gf: Hey :)
   *   $talks = 2.txt   <- unlocks a new conversation
   *
   * Returns an array of files to unlock via $talks = X.txt
   */
  parseChapter(content, filename, conversations) {
    const lines = content.split(/\r?\n/);

    const rawMessages = [];
    const npcKeys = new Set();
    const choiceBlocks = [];      // fake choices (immersion)
    const realChoiceBlocks = [];  // real choices (influence the story)
    const newUnlocks = []; // files to unlock

    // Extract parent directory for relative media
    const parentDir = filename.includes('/') ? filename.substring(0, filename.lastIndexOf('/')) : '';

    // Contact identifier defined by the first line (if applicable)
    let declaredContactKey = null;

    let currentKey = null;
    let currentText = "";

    // Helper to resolve a name/abbreviation to the normalized key
    const resolveKey = (rawKey) => {
      const lower = rawKey.toLowerCase();
      // If it's "mc", keep it as is
      if (lower === "mc") return "mc";
      // Otherwise look in the mapping (full name or abbreviation)
      if (this.nameToKey && this.nameToKey[lower]) {
        return this.nameToKey[lower];
      }
      // Fallback: return the key in lowercase
      return lower;
    };

    const flushCurrentMessage = () => {
      if (currentKey !== null) {
        const text = currentText.trim();
        if (text) {
          // Check if it's an image send: $pics = filename
          const picsMatch = text.match(/^\$pics\s*=\s*(.+)$/i);
          // Check if it's a video send: $vids = filename
          const vidsMatch = text.match(/^\$vids\s*=\s*(.+)$/i);
          // Check if it's an audio send: $audio = filename
          const audioMatch = text.match(/^\$audio\s*=\s*(.+)$/i);

          if (picsMatch) {
            const imageFile = picsMatch[1].trim();
            rawMessages.push({ kind: "image", key: currentKey, image: imageFile, parentDir });
          } else if (vidsMatch) {
            const videoFile = vidsMatch[1].trim();
            rawMessages.push({ kind: "video", key: currentKey, video: videoFile, parentDir });
          } else if (audioMatch) {
            const audioFile = audioMatch[1].trim();
            rawMessages.push({ kind: "audio", key: currentKey, audio: audioFile, parentDir });
          } else {
            rawMessages.push({ kind: "talk", key: currentKey, text });
          }
          if (currentKey !== "mc") {
            npcKeys.add(currentKey);
          }
        }
        currentKey = null;
        currentText = "";
      }
    };

    let i = 0;

    // Group info (if it's a group conversation)
    let isGroup = false;
    let groupParticipants = []; // list of participant keys
    let participantColors = {}; // key -> color

    // Check if the first line is a contact or group identifier
    // (not a message "xxx : yyy", not a "$xxx" command)
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      // If the line is not empty, doesn't contain ":" alone and doesn't start with "$"
      // Check if it's a group (contains a comma)
      if (firstLine && !firstLine.startsWith("$")) {
        // Check if it's a message (contains ":" with text after)
        const msgMatch = firstLine.match(/^([^:]+)\s*:\s*(.+)$/);
        if (!msgMatch) {
          // It's either a single contact or a group
          if (firstLine.includes(",")) {
            // It's a group!
            isGroup = true;
            const names = firstLine.split(",").map(n => n.trim()).filter(Boolean);
            for (let idx = 0; idx < names.length; idx++) {
              const key = resolveKey(names[idx]);
              groupParticipants.push(key);
              npcKeys.add(key);
              // Assign a color to each participant
              participantColors[key] = this.groupColors[idx % this.groupColors.length];
            }
            // For a group, use a composite key
            declaredContactKey = "group_" + groupParticipants.sort().join("_");
          } else {
            // Single contact
            declaredContactKey = resolveKey(firstLine);
            npcKeys.add(declaredContactKey);
          }
          i = 1; // Start parsing from line 2
        }
      }
    }

    while (i < lines.length) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      // --- FAKE CHOICES Block ---
      if (/^\$fake\.choices\b/.test(trimmed)) {
        flushCurrentMessage();
        i++; // move to the line after "$fake.choices ="

        const block = {
          filename: filename,
          options: [],
          afterIndex: rawMessages.length
        };

        let currentChoiceLines = [];

        while (i < lines.length) {
          const line = lines[i];
          const t = line.trim();

          const speakerMatch = line.match(/^([^:]+)\s*:(.*)$/);
          if (speakerMatch) {
            if (currentChoiceLines.length) {
              const joined = currentChoiceLines.join("\n").trim();
              if (joined) block.options.push(joined);
              currentChoiceLines = [];
            }
            break;
          }

          const markerIndex = line.indexOf("$/");
          if (markerIndex !== -1) {
            const before = line.slice(0, markerIndex);

            if (before.trim().length || currentChoiceLines.length) {
              currentChoiceLines.push(before);
            }

            const joined = currentChoiceLines.join("\n").trim();
            if (joined) block.options.push(joined);
            currentChoiceLines = [];

            const after = line.slice(markerIndex + 2).trim();
            if (after) {
              currentChoiceLines.push(after);
            }
          } else {
            if (t.length === 0 && !currentChoiceLines.length) {
              // ignore lignes vides en tête
            } else {
              currentChoiceLines.push(line);
            }
          }

          i++;
        }

        if (currentChoiceLines.length) {
          const joined = currentChoiceLines.join("\n").trim();
          if (joined) block.options.push(joined);
        }

        if (block.options.length) {
          choiceBlocks.push(block);
        }

        continue;
      }

      // --- REAL CHOICES Block (influences the story) ---
      if (/^\$choices\b/.test(trimmed)) {
        flushCurrentMessage();
        i++; // move to the line after "$choices ="

        const block = {
          filename: filename,
          options: [],    // { label: 'A', text: 'Option text' }
          afterIndex: rawMessages.length
        };

        let currentChoiceLines = [];
        let currentLabel = null;

        while (i < lines.length) {
          const line = lines[i];
          const t = line.trim();

          // Check if this is a new dialogue line (end of choice block)
          const speakerMatch = line.match(/^([^:]+)\s*:(.*)$/);
          if (speakerMatch) {
            // Flush the current choice in progress
            if (currentLabel && currentChoiceLines.length) {
              const joined = currentChoiceLines.join("\n").trim();
              if (joined) block.options.push({ label: currentLabel, text: joined });
            }
            // Reset to avoid double flush after the loop
            currentLabel = null;
            currentChoiceLines = [];
            break;
          }

          // Check if it's a path start (end of choice block)
          if (/^path\s+\w+$/i.test(t)) {
            if (currentLabel && currentChoiceLines.length) {
              const joined = currentChoiceLines.join("\n").trim();
              if (joined) block.options.push({ label: currentLabel, text: joined });
            }
            // Reset to avoid double flush after the loop
            currentLabel = null;
            currentChoiceLines = [];
            break;
          }

          // Look for the option end marker $/
          const markerIndex = line.indexOf("$/");
          if (markerIndex !== -1) {
            const before = line.slice(0, markerIndex);

            // Check if this line starts with a label (A., B., etc.)
            const labelMatch = before.match(/^\s*([A-Z])\.\s*(.*)$/i);
            if (labelMatch) {
              // Flush the previous choice
              if (currentLabel && currentChoiceLines.length) {
                const joined = currentChoiceLines.join("\n").trim();
                if (joined) block.options.push({ label: currentLabel, text: joined });
              }
              currentLabel = labelMatch[1].toUpperCase();
              currentChoiceLines = [labelMatch[2]];
            } else if (before.trim().length || currentChoiceLines.length) {
              currentChoiceLines.push(before);
            }

            // Flush this choice (marker $/ found)
            const joined = currentChoiceLines.join("\n").trim();
            if (joined && currentLabel) {
              block.options.push({ label: currentLabel, text: joined });
            }
            currentChoiceLines = [];
            currentLabel = null;

            // Text after the marker
            const after = line.slice(markerIndex + 2).trim();
            if (after) {
              const afterLabelMatch = after.match(/^([A-Z])\.\s*(.*)$/i);
              if (afterLabelMatch) {
                currentLabel = afterLabelMatch[1].toUpperCase();
                currentChoiceLines = [afterLabelMatch[2]];
              }
            }
          } else {
            // No $/ marker, continuation line or new choice
            const labelMatch = t.match(/^([A-Z])\.\s*(.*)$/i);
            if (labelMatch) {
              // New label
              if (currentLabel && currentChoiceLines.length) {
                const joined = currentChoiceLines.join("\n").trim();
                if (joined) block.options.push({ label: currentLabel, text: joined });
              }
              currentLabel = labelMatch[1].toUpperCase();
              currentChoiceLines = [labelMatch[2]];
            } else if (t.length === 0 && !currentChoiceLines.length) {
              // ignore leading empty lines
            } else if (currentLabel) {
              currentChoiceLines.push(line);
            }
          }

          i++;
        }

        // Flush the last choice if not done yet
        if (currentLabel && currentChoiceLines.length) {
          const joined = currentChoiceLines.join("\n").trim();
          if (joined) block.options.push({ label: currentLabel, text: joined });
        }

        if (block.options.length) {
          // Add a special message to mark the choice point
          rawMessages.push({
            kind: "realChoice",
            choiceBlockIndex: realChoiceBlocks.length
          });
          realChoiceBlocks.push(block);
        } else {
        }

        continue;
      }

      // --- PATH start marker ---
      if (/^path\s+\w+$/i.test(trimmed)) {
        flushCurrentMessage();
        const pathMatch = trimmed.match(/^path\s+(\w+)$/i);
        if (pathMatch) {
          rawMessages.push({
            kind: "pathStart",
            pathLabel: pathMatch[1].toUpperCase()
          });
        }
        i++;
        continue;
      }

      // --- PATH end marker ---
      if (/^end\s*path$/i.test(trimmed)) {
        flushCurrentMessage();
        rawMessages.push({
          kind: "pathEnd"
        });
        i++;
        continue;
      }

      // --- DELETION LINE: $delete or $delete = <time> ---
      if (/^\$delete\b/.test(trimmed)) {
        flushCurrentMessage();

        const m = trimmed.match(/^\$delete\s*(?:=\s*(\d+))?$/i);
        const deleteTimer = m && m[1] ? parseInt(m[1], 10) : null;

        rawMessages.push({
          kind: "delete",
          timer: deleteTimer
        });

        i++;
        continue;
      }

      // --- STATUS LINE: $status = ... ---
      if (/^\$status\b/.test(trimmed)) {
        flushCurrentMessage();

        const m = trimmed.match(/^\$status\s*=\s*(.+)$/);
        if (m && m[1].trim()) {
          rawMessages.push({
            kind: "status",
            text: m[1].trim()
          });
        }

        i++;
        continue;
      }

      // --- UNLOCK LINE: $talks = X.txt ---
      if (/^\$talks\b/.test(trimmed)) {
        flushCurrentMessage();

        const m = trimmed.match(/^\$talks\s*=\s*(.+)$/);
        if (m && m[1].trim()) {
          const unlockFile = m[1].trim();
          // Store as a special "unlock" message that will be processed on read
          rawMessages.push({
            kind: "unlock",
            file: unlockFile
          });
        }

        i++;
        continue;
      }

      // --- INSTAPICS UNLOCK LINE: $insta = X.txt ---
      if (/^\$insta\b/.test(trimmed)) {
        flushCurrentMessage();

        const m = trimmed.match(/^\$insta\s*=\s*(.+)$/);
        if (m && m[1].trim()) {
          const instaFile = m[1].trim();
          rawMessages.push({
            kind: "unlockInsta",
            file: instaFile
          });
        }

        i++;
        continue;
      }

      // --- SLUTONLY UNLOCK LINE: $slut = X.txt ---
      if (/^\$slut\b/.test(trimmed)) {
        flushCurrentMessage();

        const m = trimmed.match(/^\$slut\s*=\s*(.+)$/);
        if (m && m[1].trim()) {
          const slutFile = m[1].trim();
          rawMessages.push({
            kind: "unlockSlutOnly",
            file: slutFile
          });
        }

        i++;
        continue;
      }

      // --- LOCK LINE: $lock = X.txt ---
      if (/^\$lock\b/.test(trimmed)) {
        flushCurrentMessage();

        const m = trimmed.match(/^\$lock\s*=\s*(.+)$/);
        if (m && m[1].trim()) {
          const lockFile = m[1].trim();
          rawMessages.push({
            kind: "lock",
            file: lockFile
          });
        }

        i++;
        continue;
      }

      // --- SPY UNLOCK: $spy_unlock ---
      if (/^\$spy_unlock\b/i.test(trimmed)) {
        flushCurrentMessage();

        rawMessages.push({
          kind: "spy_unlock"
        });

        i++;
        continue;
      }

      // --- SPY ANCHOR: $spy_anchor_X ---
      const spyAnchorMatch = trimmed.match(/^\$spy_anchor[_\s]*(\d+)$/i);
      if (spyAnchorMatch) {
        flushCurrentMessage();

        rawMessages.push({
          kind: "spy_anchor",
          anchor: parseInt(spyAnchorMatch[1], 10)
        });

        i++;
        continue;
      }

      // --- SPY UNLOCK INSTAPICS: $spy_unlock_instapics ---
      if (/^\$spy_unlock_instapics\b/i.test(trimmed)) {
        flushCurrentMessage();

        rawMessages.push({
          kind: "spy_unlock_instapics"
        });

        i++;
        continue;
      }

      // --- SPY UNLOCK ONLYSLUT: $spy_unlock_onlyslut ---
      if (/^\$spy_unlock_onlyslut\b/i.test(trimmed)) {
        flushCurrentMessage();

        rawMessages.push({
          kind: "spy_unlock_onlyslut"
        });

        i++;
        continue;
      }

      // --- THINKING BLOCK: $thinking ... (until next message) ---
      if (/^\$thinking\b/i.test(trimmed)) {
        flushCurrentMessage();

        // Collect all lines until we hit a normal message line (key : text)
        const thinkingLines = [];
        i++;

        while (i < lines.length) {
          const thinkLine = lines[i];
          const thinkTrimmed = thinkLine.trim();

          // Check if this line is a normal message (key : text)
          // This ends the thinking block
          if (/^([^:]+)\s*:(.*)$/.test(thinkLine) && !thinkTrimmed.startsWith('$')) {
            break;
          }

          // Check for other $ commands that would end thinking
          if (/^\$(status|talks|insta|slut|lock|delete|thinking|spy_unlock|spy_unlock_instapics|spy_unlock_onlyslut|spy_anchor)\b/i.test(thinkTrimmed)) {
            break;
          }

          // Check for choice/path markers that would end thinking
          if (/^(choice|real\s*choice|path\s+\w+|end\s*path)$/i.test(thinkTrimmed)) {
            break;
          }

          // Check for character header [Name]
          if (/^\[.+\]$/.test(thinkTrimmed)) {
            break;
          }

          thinkingLines.push(thinkLine);
          i++;
        }

        // Parse thinking blocks separated by $/
        const thinkingText = thinkingLines.join('\n');
        const blocks = thinkingText.split(/\$\//).map(block => block.trim()).filter(block => block.length > 0);

        if (blocks.length > 0) {
          rawMessages.push({
            kind: "thinking",
            blocks: blocks
          });
        }

        continue;
      }

      // --- Normal lines: NPC / MC messages ---
      const match = rawLine.match(/^([^:]+)\s*:(.*)$/);
      if (match) {
        flushCurrentMessage();

        const rawKey = match[1].trim();
        // Use resolveKey to accept full name or abbreviation
        const key = resolveKey(rawKey);
        const firstPart = match[2] || "";

        currentKey = key;
        currentText = firstPart;
        i++;
        continue;
      }

      // message continuation line
      if (currentKey !== null) {
        currentText += "\n" + rawLine;
      }

      i++;
    }

    // end of file: flush the last message
    flushCurrentMessage();

    // if there are no messages or choices, still return unlocks
    if (!rawMessages.length && !choiceBlocks.length) return newUnlocks;
    if (!npcKeys.size) return newUnlocks; // file where only MC speaks → ignore messages

    // Use the contact declared in the first line if available, otherwise the first NPC found
    const convKey = declaredContactKey || npcKeys.values().next().value;

    if (!conversations[convKey]) {
      conversations[convKey] = {
        key: convKey,
        messages: [],
        fakeChoices: [],
        realChoices: [],
        isGroup: isGroup,
        participants: groupParticipants,
        participantColors: participantColors
      };
    }

    const convObj = conversations[convKey];

    // Global index of the first message of THIS file for this conversation
    const baseIndex = convObj.messages.length;

    // Adding messages (now includes statuses, unlocks and images)
    for (const msg of rawMessages) {
      if (msg.kind === "status") {
        convObj.messages.push({
          kind: "status",
          text: msg.text,
          filename: filename
        });
      } else if (msg.kind === "delete") {
        convObj.messages.push({
          kind: "delete",
          timer: msg.timer,
          filename: filename
        });
      } else if (msg.kind === "unlock") {
        convObj.messages.push({
          kind: "unlock",
          file: msg.file,
          filename: filename
        });
      } else if (msg.kind === "unlockInsta") {
        convObj.messages.push({
          kind: "unlockInsta",
          file: msg.file,
          filename: filename
        });
      } else if (msg.kind === "unlockSlutOnly") {
        convObj.messages.push({
          kind: "unlockSlutOnly",
          file: msg.file,
          filename: filename
        });
      } else if (msg.kind === "lock") {
        convObj.messages.push({
          kind: "lock",
          file: msg.file,
          filename: filename
        });
      } else if (msg.kind === "image") {
        convObj.messages.push({
          kind: "image",
          from: msg.key === "mc" ? "mc" : convKey,
          speakerKey: msg.key,
          image: msg.image,
          parentDir: msg.parentDir,
          filename: filename
        });
      } else if (msg.kind === "video") {
        convObj.messages.push({
          kind: "video",
          from: msg.key === "mc" ? "mc" : convKey,
          speakerKey: msg.key,
          video: msg.video,
          parentDir: msg.parentDir,
          filename: filename
        });
      } else if (msg.kind === "audio") {
        convObj.messages.push({
          kind: "audio",
          from: msg.key === "mc" ? "mc" : convKey,
          speakerKey: msg.key,
          audio: msg.audio,
          parentDir: msg.parentDir,
          filename: filename
        });
      } else if (msg.kind === "realChoice") {
        convObj.messages.push({
          kind: "realChoice",
          choiceBlockIndex: msg.choiceBlockIndex,
          filename: filename
        });
      } else if (msg.kind === "pathStart") {
        convObj.messages.push({
          kind: "pathStart",
          pathLabel: msg.pathLabel,
          filename: filename
        });
      } else if (msg.kind === "pathEnd") {
        convObj.messages.push({
          kind: "pathEnd",
          filename: filename
        });
      } else if (msg.kind === "thinking") {
        convObj.messages.push({
          kind: "thinking",
          blocks: msg.blocks,
          filename: filename
        });
      } else if (msg.kind === "spy_unlock") {
        convObj.messages.push({
          kind: "spy_unlock",
          filename: filename
        });
      } else if (msg.kind === "spy_anchor") {
        convObj.messages.push({
          kind: "spy_anchor",
          anchor: msg.anchor,
          filename: filename
        });
      } else if (msg.kind === "spy_unlock_instapics") {
        convObj.messages.push({
          kind: "spy_unlock_instapics",
          filename: filename
        });
      } else if (msg.kind === "spy_unlock_onlyslut") {
        convObj.messages.push({
          kind: "spy_unlock_onlyslut",
          filename: filename
        });
      } else {
        convObj.messages.push({
          kind: "talk",
          from: msg.key === "mc" ? "mc" : convKey,
          speakerKey: msg.key, // original speaker's key (for groups)
          text: msg.text,
          filename: filename
        });
      }
    }

    // Adding fake choice blocks
    if (choiceBlocks.length) {
      if (!convObj.fakeChoices) {
        convObj.fakeChoices = [];
      }

      for (const block of choiceBlocks) {
        if (block.options && block.options.length) {
          convObj.fakeChoices.push({
            filename: block.filename,
            options: block.options,
            // exact position in the message list
            messageIndex: baseIndex + (typeof block.afterIndex === "number" ? block.afterIndex : 0)
          });
        }
      }
    }

    // Adding real choice blocks (influences the story)
    if (realChoiceBlocks.length) {
      if (!convObj.realChoices) {
        convObj.realChoices = [];
      }

      for (const block of realChoiceBlocks) {
        if (block.options && block.options.length) {
          convObj.realChoices.push({
            filename: block.filename,
            options: block.options, // { label: 'A', text: 'Option text' }
            messageIndex: baseIndex + (typeof block.afterIndex === "number" ? block.afterIndex : 0)
          });
        }
      }
    }

    return newUnlocks;
  },

  prepareConversationsRuntime() {
    const all = this.conversationsByKey || {};
    for (const key of Object.keys(all)) {
      this.prepareConversationRuntime(all[key]);
    }
  },

  prepareConversationRuntime(conv) {
    if (!conv) return;

    if (!Array.isArray(conv.messages)) {
      conv.messages = [];
    }
    if (!Array.isArray(conv.fakeChoices)) {
      conv.fakeChoices = [];
    }
    if (!Array.isArray(conv.realChoices)) {
      conv.realChoices = [];
    }

    // runtime state: already displayed messages + index of next scripted message
    conv.playedMessages = [];
    conv.scriptIndex = 0;

    // index of next fake choice block to process
    conv.nextChoiceIdx = 0;

    // fake choice block currently visible in the bottom bar
    conv.activeChoiceIdx = null;

    // true when waiting for the player to click on one of the choices
    conv.waitingForChoice = false;

    // history of choices made (text of selected options, in order)
    conv.choicesMade = [];

    // action history for going back
    conv.actionHistory = [];

    // --- Real choices (paths) ---
    // index of next real choice block to process
    conv.nextRealChoiceIdx = 0;

    // currently visible real choice block
    conv.activeRealChoiceIdx = null;

    // true when waiting for a real choice
    conv.waitingForRealChoice = false;

    // label of currently selected path (A, B, C, etc.) or null
    conv.selectedPath = null;

    // history of real choices made { label, text }
    conv.realChoicesMade = [];
  },

  /**
   * Replays a conversation up to a given state (for save restoration)
   * Reconstructs playedMessages without saving all messages
   * @param {Object} conv - The conversation
   * @param {number} targetScriptIndex - Target index in the script
   * @param {number} targetNextChoiceIdx - Index of next fake choice
   * @param {Array} choicesMade - List of fake choices made (texts)
   * @param {boolean} wasWaitingForChoice - If we were waiting for a fake choice
   * @param {number|null} savedActiveChoiceIdx - Index of active fake choice
   * @param {number} targetNextRealChoiceIdx - Index of next real choice
   * @param {boolean} wasWaitingForRealChoice - If we were waiting for a real choice
   * @param {number|null} savedActiveRealChoiceIdx - Index of active real choice
   * @param {Array} realChoicesMade - List of real choices made ({label, text})
   * @param {string|null} savedSelectedPath - Currently selected path
   */
  replayToState(conv, targetScriptIndex, targetNextChoiceIdx, choicesMade, wasWaitingForChoice, savedActiveChoiceIdx,
                targetNextRealChoiceIdx = 0, wasWaitingForRealChoice = false, savedActiveRealChoiceIdx = null,
                realChoicesMade = [], savedSelectedPath = null) {
    if (!conv || !Array.isArray(conv.messages)) return;

    // Reset state
    conv.playedMessages = [];
    conv.scriptIndex = 0;
    conv.nextChoiceIdx = 0;
    conv.choicesMade = [];
    conv.actionHistory = [];
    conv.waitingForChoice = false;
    conv.activeChoiceIdx = null;

    // Reset real choices
    conv.nextRealChoiceIdx = 0;
    conv.realChoicesMade = [];
    conv.waitingForRealChoice = false;
    conv.activeRealChoiceIdx = null;
    conv.selectedPath = null;

    const fakeChoices = conv.fakeChoices || [];
    const realChoices = conv.realChoices || [];
    let choicePointer = 0;
    let realChoicePointer = 0;

    // Replay up to target index
    while (conv.scriptIndex < targetScriptIndex) {
      // Check if there's a fake choice at this point
      const nextChoice = fakeChoices[conv.nextChoiceIdx];
      if (nextChoice && conv.scriptIndex >= nextChoice.messageIndex) {
        // We're at a fake choice point - add the player's response
        if (choicePointer < choicesMade.length) {
          const choiceText = choicesMade[choicePointer];
          conv.playedMessages.push({
            kind: "talk",
            from: "mc",
            text: choiceText,
            chapter: nextChoice.chapter || null
          });
          conv.choicesMade.push(choiceText);
          conv.actionHistory.push({
            type: 'choice',
            choiceIdx: conv.nextChoiceIdx,
            previousNextChoiceIdx: conv.nextChoiceIdx
          });
          choicePointer++;
        }
        conv.nextChoiceIdx++;
        continue;
      }

      const scriptMsg = conv.messages[conv.scriptIndex];
      if (!scriptMsg) break;

      // "realChoice" message: add player's response and set the path
      if (scriptMsg.kind === "realChoice") {
        if (realChoicePointer < realChoicesMade.length) {
          const choice = realChoicesMade[realChoicePointer];
          conv.playedMessages.push({
            kind: "talk",
            from: "mc",
            text: choice.text,
            chapter: null
          });
          conv.realChoicesMade.push(choice);
          conv.selectedPath = choice.label;
          conv.actionHistory.push({
            type: 'realChoice',
            choiceIdx: conv.nextRealChoiceIdx,
            previousNextRealChoiceIdx: conv.nextRealChoiceIdx,
            previousSelectedPath: null
          });
          realChoicePointer++;
        }
        conv.nextRealChoiceIdx++;
        conv.scriptIndex++;
        continue;
      }

      // "pathStart" message: check if path matches
      if (scriptMsg.kind === "pathStart") {
        conv.scriptIndex++;
        if (!conv.selectedPath || conv.selectedPath !== scriptMsg.pathLabel) {
          // Skip until End path
          let depth = 1;
          while (conv.scriptIndex < targetScriptIndex && depth > 0) {
            const msg = conv.messages[conv.scriptIndex];
            if (msg && msg.kind === "pathStart") depth++;
            else if (msg && msg.kind === "pathEnd") depth--;
            conv.scriptIndex++;
          }
        }
        continue;
      }

      // "pathEnd" message: reset path
      if (scriptMsg.kind === "pathEnd") {
        conv.selectedPath = null;
        conv.scriptIndex++;
        continue;
      }

      // Special messages: skip them (unlocks, locks, thinking, spy commands are handled separately)
      if (scriptMsg.kind === "unlock" || scriptMsg.kind === "unlockInsta" || scriptMsg.kind === "unlockSlutOnly" || scriptMsg.kind === "lock" || scriptMsg.kind === "thinking" || scriptMsg.kind === "spy_unlock" || scriptMsg.kind === "spy_anchor" || scriptMsg.kind === "spy_unlock_instapics" || scriptMsg.kind === "spy_unlock_onlyslut") {
        conv.scriptIndex++;
        continue;
      }

      // "delete" message: process it but without animation
      if (scriptMsg.kind === "delete") {
        const deleteScriptIndex = conv.scriptIndex;
        conv.scriptIndex++;
        // Mark the last message as deleted
        const deletableKinds = ['talk', 'image', 'video', 'audio'];
        for (let i = conv.playedMessages.length - 1; i >= 0; i--) {
          const msg = conv.playedMessages[i];
          if (deletableKinds.includes(msg.kind) && !msg.deleted) {
            msg.deleted = true;
            msg.deletedAtScriptIndex = deleteScriptIndex;
            break;
          }
        }
        continue;
      }

      // Normal message - add to playedMessages
      conv.playedMessages.push(scriptMsg);
      conv.actionHistory.push({
        type: 'script',
        previousScriptIndex: conv.scriptIndex
      });
      conv.scriptIndex++;
    }

    // Restore final state
    conv.scriptIndex = targetScriptIndex;
    conv.nextChoiceIdx = targetNextChoiceIdx;
    conv.waitingForChoice = wasWaitingForChoice;
    conv.activeChoiceIdx = savedActiveChoiceIdx;

    // Restore final state of real choices
    conv.nextRealChoiceIdx = targetNextRealChoiceIdx;
    conv.waitingForRealChoice = wasWaitingForRealChoice;
    conv.activeRealChoiceIdx = savedActiveRealChoiceIdx;
    conv.selectedPath = savedSelectedPath;
  },

  // -------------------------------------------------------------------
  // RENDERING
  // -------------------------------------------------------------------
  renderContacts() {
    if (!this.contactsListEl) return;

    this.contactsListEl.innerHTML = "";

    if (!this.contacts.length) {
      const empty = document.createElement('div');
      empty.className = 'ms-placeholder';
      empty.textContent = "No contacts for this story.";
      this.contactsListEl.appendChild(empty);
      return;
    }

    // Sort contacts: by recent activity (most recent first)
    const sortedContacts = [...this.contacts].sort((a, b) => {
      const aActivity = this.contactLastActivity[a.key] || 0;
      const bActivity = this.contactLastActivity[b.key] || 0;
      return bActivity - aActivity; // most recent first
    });

    for (const contact of sortedContacts) {
      const btn = document.createElement('button');
      btn.type = 'button';

      // Classes : active + has-new + story-active si applicable
      let classes = 'ms-contact';
      if (contact.key === this.selectedKey) classes += ' ms-contact--active';
      if (this.contactsWithNew.has(contact.key)) classes += ' ms-contact--has-new';
      if (contact.isGroup) classes += ' ms-contact--group';
      if (contact.key === this.activeConversationKey) classes += ' ms-contact--story-active';
      btn.className = classes;
      btn.dataset.key = contact.key;

      // "Online" indicator for the active conversation (where the story takes place)
      const onlineIndicator = contact.key === this.activeConversationKey
        ? '<span class="ms-contact-online"></span>'
        : '';

      // For groups: display a pizza avatar with initials
      let avatarHtml;
      if (contact.isGroup) {
        avatarHtml = `<div class="ms-contact-avatar ms-contact-avatar--group">${this.generateGroupAvatarSVG(contact.participants)}${onlineIndicator}</div>`;
      } else {
        avatarHtml = `<div class="ms-contact-avatar"><img src="${contact.avatar}" alt="${this.escapeHtml(contact.name)}">${onlineIndicator}</div>`;
      }

      btn.innerHTML = `
        ${avatarHtml}
        <div class="ms-contact-name">${this.escapeHtml(contact.name)}</div>
      `;

      btn.addEventListener('click', () => {
        // Pause autoplay if switching contacts (without resetting the mode)
        if (this.selectedKey !== contact.key) {
          this.pauseAutoPlay();
        }
        this.selectedKey = contact.key;
        // Remove the "new" indicator when clicking on the contact
        this.contactsWithNew.delete(contact.key);
        this.renderContacts();
        this.renderConversation();
        // Resume autoplay if the mode was active
        this.resumeAutoPlay();
      });

      this.contactsListEl.appendChild(btn);
    }
  },

  renderConversation() {
    const conv = this.conversationsByKey[this.selectedKey];

    if (!this.chatHeaderEl || !this.chatMessagesEl) return;

    // Cancel any pending scroll operations to prevent race conditions
    if (this.pendingScrollRAF) {
      cancelAnimationFrame(this.pendingScrollRAF);
      this.pendingScrollRAF = null;
    }
    if (this.pendingScrollTimeout) {
      clearTimeout(this.pendingScrollTimeout);
      this.pendingScrollTimeout = null;
    }
    // Increment render version to invalidate any in-flight scroll callbacks
    this.renderVersion++;

    this.chatHeaderEl.innerHTML = "";
    this.chatMessagesEl.innerHTML = "";

    // Reset virtual scroll state for fresh render
    this.resetVirtualScroll();

    // no contact selected
    if (!this.selectedKey) {
      const placeholder = document.createElement('div');
      placeholder.className = 'ms-placeholder';
      placeholder.textContent = "Select a contact on the left.";
      this.chatHeaderEl.appendChild(placeholder);

      const placeholder2 = placeholder.cloneNode(true);
      this.chatMessagesEl.appendChild(placeholder2);
      this.renderChoices(null);
      return;
    }

    const contact = this.contacts.find(c => c.key === this.selectedKey);
    // conv already declared at top of function for logging

    if (!contact || !conv) {
      const placeholder = document.createElement('div');
      placeholder.className = 'ms-placeholder';
      placeholder.textContent = window.t('messenger.nomessages');
      this.chatHeaderEl.appendChild(placeholder);
      this.renderChoices(null);
      return;
    }

    // --- header (single name, or colored names for groups) ---
    const header = document.createElement('div');
    header.className = 'ms-chat-header-main';

    let nameHtml;
    if (conv.isGroup && conv.participants && conv.participantColors) {
      // For groups: each name with its color, clickable if avatar available
      nameHtml = conv.participants
        .map(key => {
          const name = this.keyToName[key] || key;
          const color = conv.participantColors[key] || '#ffffff';
          const avatar = this.avatarsByKey[key];
          if (avatar) {
            return `<span class="ms-chat-name-clickable" style="color: ${color}; cursor: pointer;" data-avatar="${avatar}">${this.escapeHtml(name)}</span>`;
          }
          return `<span style="color: ${color}">${this.escapeHtml(name)}</span>`;
        })
        .join('<span class="ms-chat-name-separator">, </span>');
    } else {
      // Simple conversation: clickable name if avatar available
      const avatar = this.avatarsByKey[contact.key];
      if (avatar) {
        nameHtml = `<span class="ms-chat-name-clickable" style="cursor: pointer;" data-avatar="${avatar}">${this.escapeHtml(contact.name)}</span>`;
      } else {
        nameHtml = this.escapeHtml(contact.name);
      }
    }

    // Vérifie si on peut revenir en arrière :
    // - Il y a un historique d'actions OU on attend un choix
    // Note: on permet TOUJOURS le retour en arrière, même si ce n'est pas la conversation active
    // La restriction activeConversationKey ne s'applique qu'à l'avancement
    const hasHistory = Array.isArray(conv.actionHistory) && conv.actionHistory.length > 0;
    const canGoBack = hasHistory || conv.waitingForChoice || conv.waitingForRealChoice;

    // Determine the icon and class of the autoplay button
    let autoplayIconHtml;
    let autoplayClass = 'ms-chat-autoplay-btn';
    if (this.autoplayMode === 'auto') {
      autoplayClass += ' ms-chat-autoplay-btn--auto';
      autoplayIconHtml = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z"/></svg>`;
    } else if (this.autoplayMode === 'fast') {
      autoplayClass += ' ms-chat-autoplay-btn--fast';
      autoplayIconHtml = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M4 5v14l8-7z"/><path d="M12 5v14l8-7z"/></svg>`;
    } else {
      // manual - hand icon
      autoplayIconHtml = `<svg viewBox="0 0 93.49 122.88" fill="currentColor"><path d="M2.34,62.52l-0.26,0.27l-2.08-0.83V31.27c0-1.42,0.42-2.76,1.14-3.89l0,0c0.14-0.22,0.29-0.44,0.46-0.64 c0.17-0.22,0.35-0.42,0.53-0.6l0.02-0.02c0.54-0.54,1.18-1.01,1.89-1.36l0.03-0.01l0.35-0.17l0.04-0.02 c0.86-0.37,1.82-0.58,2.81-0.58l0,0h0.04v0c2.01,0,3.84,0.82,5.16,2.14c0.54,0.54,1.01,1.18,1.36,1.88l0.02,0.04l0.16,0.35 l0.01,0.03c0.37,0.86,0.58,1.82,0.58,2.81l0,0.01v0.04v24.96v1.13l-1.13,0.07c-3.08,0.19-5.92,1.18-8.32,2.77 c-0.48,0.32-0.94,0.66-1.38,1.02c-0.41,0.34-0.84,0.72-1.26,1.15L2.34,62.52L2.34,62.52L2.34,62.52z M65.62,83.35l1.23,0.46 l0.53,0.39c0.09,0.12,0.2,0.22,0.33,0.31l0,0l0.16,0.09l0,0.01c0.17,0.08,0.35,0.12,0.54,0.12v0h0.03c0.18,0,0.34-0.03,0.49-0.09 l0.12-0.06l0.12-0.07l0.04-0.02l0.04-0.02c0.54-0.31,1.26-0.85,2.05-1.5c0.8-0.67,1.71-1.49,2.61-2.33 c1.76-1.66,3.76-3.66,4.56-4.45l0.04-0.04c2.53-2.53,5.11-3.7,7.38-3.85c0.46-0.03,0.92-0.02,1.35,0.03 c0.44,0.05,0.87,0.14,1.28,0.27h0.01l0.05,0.02l0.01,0c0.81,0.26,1.56,0.67,2.22,1.2l0.03,0.03l0.31,0.27l0.06,0.05l0.29,0.29 l0.05,0.06l0.01,0.01l0,0l0.01,0.02l0,0c0.56,0.62,1.01,1.35,1.34,2.16l0.02,0.03l0.15,0.42l0.02,0.09l0.12,0.43l0.01,0.05 l0.01,0.06h0c0.57,2.38,0.1,5.27-1.88,8.17c-0.37,0.55-0.81,1.11-1.29,1.65c-0.48,0.54-1.02,1.09-1.62,1.62l0,0l-0.08,0.07 l-0.1,0.09l-0.07,0.07l-0.04,0.04L63.64,114.3l-0.85,0.93l-0.06-0.06c-1.35,1.23-2.67,2.29-4.01,3.2c-1.6,1.08-3.22,1.95-4.9,2.61 c-1.69,0.67-3.46,1.15-5.33,1.46c-1.87,0.3-3.84,0.45-5.94,0.45h-15.9c-5.3,0-10.23-1.56-14.36-4.23l0,0 c-0.79-0.51-1.57-1.08-2.32-1.69c-0.76-0.62-1.47-1.26-2.12-1.92l-0.02-0.02l0,0c-2.01-2.04-3.71-4.42-5-7.03 c-0.25-0.52-0.49-1.04-0.71-1.56C0.76,103.2,0.01,99.65,0,95.93h0V95.9V74.93c0-1.93,0.36-3.79,1-5.49l0-0.01 c0.12-0.31,0.26-0.64,0.41-0.97h0c0.15-0.32,0.31-0.64,0.48-0.95l0.01-0.02l0.03-0.05l0.02-0.04c0.62-0.97,1.36-1.88,2.19-2.69 l0.02-0.02l0.46-0.43l0.04-0.03l0.48-0.41l0.04-0.04l0.02-0.02l0,0c1.06-0.85,2.24-1.57,3.51-2.11h0c0.29-0.12,0.57-0.24,0.76-0.3 v0c1.56-0.57,3.25-0.88,5.01-0.88v0h0.04h0.64l0.29,0.04l0.27,0.07l0.21,0.02v0h17.27v0l0.11,0h0.08l0.11,0v0h17.27v0l0.05,0h0.07 l0.05,0v0h1.28c2.54,0,4.94,0.65,7.05,1.79l0,0c0.42,0.23,0.82,0.47,1.19,0.72v0l0.01,0c0.36,0.24,0.74,0.52,1.11,0.82l0.01,0.01 l0.02,0.02l0,0c1.82,1.49,3.3,3.41,4.25,5.6c0.2,0.45,0.37,0.89,0.5,1.31v0c0.15,0.45,0.27,0.91,0.38,1.37v0.01l0.01,0.07 l0.02,0.11c0.01,0.08,0.02,0.16,0.04,0.22h0l0.01,0.03h0l0.04,0.11h0l0.02,0.06L67,73.21l0.06,0.65l0,0.04l0.02,0.26v0.04 l0.02,0.46v0.03l0,0.25l0,0.01v4.43v1.66l-1.58-0.52c-2.46-0.81-4.81-1.36-7.03-1.66h0c-0.5-0.07-0.98-0.12-1.42-0.17 c-0.45-0.04-0.92-0.08-1.39-0.1l-1.02-0.03c-2.85-0.04-5.48,0.37-7.81,1.17c-0.51,0.18-0.99,0.36-1.42,0.55 c-0.45,0.2-0.9,0.41-1.32,0.64l-0.71,0.41c-2.23,1.34-4.08,3.14-5.49,5.34c-0.29,0.46-0.56,0.9-0.78,1.33 c-0.24,0.45-0.46,0.94-0.68,1.44v0l-0.01,0.03h0c-0.68,1.62-1.17,3.4-1.45,5.33c-0.06,0.44-0.12,0.87-0.15,1.28 c-0.03,0.34-0.07,0.7-0.08,1.06l2.66,0.03c0.08-1.35,0.28-2.64,0.57-3.84h0c0.09-0.37,0.18-0.72,0.27-1.03h0 c0.09-0.3,0.2-0.64,0.33-0.98v0l0.32-0.82l0,0c0.89-2.13,2.18-3.94,3.8-5.38c0.32-0.28,0.66-0.55,0.99-0.8 c0.37-0.27,0.72-0.51,1.06-0.71l0.02-0.01l0.03-0.02v0c1.7-1.02,3.68-1.73,5.9-2.09c0.45-0.07,0.94-0.14,1.44-0.18 c0.49-0.05,1-0.07,1.49-0.09h0.03l0.98,0h0.02c2.3,0.03,4.79,0.39,7.44,1.07v0c0.61,0.15,1.18,0.32,1.72,0.49 c0.62,0.19,1.21,0.39,1.77,0.58L65.62,83.35L65.62,83.35z M15.74,60.59L15.74,60.59L15.74,60.59L15.74,60.59L15.74,60.59z M48.24,57.4H36.05h-1.2v-1.2V7.3h0c0-2.01,0.82-3.84,2.14-5.16c0.54-0.54,1.18-1.01,1.88-1.36l0.03-0.01l0.35-0.17l0.04-0.02 c0.86-0.37,1.81-0.58,2.81-0.58l0-0.01h0.04v0.01c2.01,0,3.84,0.82,5.16,2.14c0.54,0.54,1,1.18,1.36,1.88l0.02,0.03l0.16,0.35 l0.02,0.04c0.37,0.86,0.58,1.81,0.58,2.81l0,0.01V7.3v48.89v1.2H48.24L48.24,57.4z M53.63,57.45l-0.22-0.02l-1.12-0.09v-1.11V19.01 h0c0-2.01,0.82-3.84,2.14-5.16c0.54-0.54,1.18-1,1.89-1.36l0.04-0.02l0.35-0.16l0.03-0.02c0.86-0.37,1.81-0.58,2.81-0.58l0,0h0.04 c1.42,0,2.76,0.42,3.89,1.14l0,0l0.01,0.01c0.22,0.13,0.43,0.29,0.63,0.45l0,0l0.01,0.01c0.21,0.16,0.41,0.34,0.59,0.52l0.02,0.02 c0.54,0.54,1.01,1.18,1.36,1.88l0.01,0.03l0.17,0.35l0.02,0.04c0.37,0.86,0.58,1.82,0.58,2.81l0,0v0.04v42.9l-2.07,0.84l-0.2-0.2 c-2.06-2.06-4.63-3.62-7.49-4.45c-0.57-0.17-1.16-0.31-1.73-0.41C54.84,57.58,54.24,57.5,53.63,57.45L53.63,57.45z M30.68,57.4 H18.49h-1.21v-1.2V31.27h0V18.89h0c0-1.42,0.42-2.77,1.14-3.9h0c0.14-0.23,0.3-0.45,0.46-0.65c0.17-0.22,0.35-0.42,0.52-0.59 l0.02-0.02c0.54-0.54,1.18-1,1.89-1.36l0.03-0.01l0.35-0.16l0.04-0.02c0.86-0.37,1.81-0.58,2.81-0.58l0,0h0.04v0 c2.01,0,3.84,0.82,5.16,2.14c0.54,0.54,1,1.18,1.36,1.88l0.01,0.03L31.28,16l0.02,0.04c0.37,0.86,0.58,1.82,0.58,2.81l0,0v0.04 v37.3v1.2H30.68L30.68,57.4z"/></svg>`;
    }

    header.innerHTML = `
      <div class="ms-chat-info">
        <div class="ms-chat-name">${nameHtml}</div>
      </div>
      <div class="ms-chat-header-actions">
        <button class="${autoplayClass}" type="button">
          <span class="ms-autoplay-icon">${autoplayIconHtml}</span>
        </button>
        <button class="ms-chat-back-btn${canGoBack ? '' : ' ms-chat-back-btn--disabled'}" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 14L4 9l5-5"/>
            <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>
          </svg>
        </button>
      </div>
    `;

    // Add event listener for back button
    const backBtn = header.querySelector('.ms-chat-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.goBack();
      });
    }

    // Add event listeners for clickable names (display avatar)
    const clickableNames = header.querySelectorAll('.ms-chat-name-clickable');
    clickableNames.forEach(nameEl => {
      nameEl.addEventListener('click', () => {
        const avatarUrl = nameEl.dataset.avatar;
        if (avatarUrl) {
          this.openLightbox(avatarUrl, 'avatar');
        }
      });
    });

    // Add event listeners for autoplay button (click + long press)
    const autoplayBtn = header.querySelector('.ms-chat-autoplay-btn');
    if (autoplayBtn) {
      const startLongPress = () => {
        // Reset flag at the start of a new press cycle
        this.autoplayLongPressActive = false;

        this.autoplayLongPressTimer = setTimeout(() => {
          // Activate fast mode and mark as long press
          this.autoplayLongPressActive = true;
          this.activateFastMode();
        }, 500); // 500ms to trigger long press
      };

      const endLongPress = (e) => {
        e.preventDefault();

        // Clear the timer if still running
        if (this.autoplayLongPressTimer) {
          clearTimeout(this.autoplayLongPressTimer);
          this.autoplayLongPressTimer = null;
        }

        // If long press was activated, do nothing - user must click again to change mode
        if (this.autoplayLongPressActive) {
          // Keep the flag true until next mousedown/touchstart
          return;
        }

        // It's a simple click → toggle mode
        this.toggleAutoPlay();
      };

      const cancelLongPress = () => {
        if (this.autoplayLongPressTimer) {
          clearTimeout(this.autoplayLongPressTimer);
          this.autoplayLongPressTimer = null;
        }
      };

      // Mouse events
      autoplayBtn.addEventListener('mousedown', startLongPress);
      autoplayBtn.addEventListener('mouseup', endLongPress);
      autoplayBtn.addEventListener('mouseleave', cancelLongPress);

      // Touch events
      autoplayBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startLongPress();
      });
      autoplayBtn.addEventListener('touchend', endLongPress);
      autoplayBtn.addEventListener('touchcancel', cancelLongPress);
    }

    this.chatHeaderEl.appendChild(header);

    // safety: if there's no timeline yet, start from 0
    if (!Array.isArray(conv.playedMessages)) {
      conv.playedMessages = [];
    }

    // Initialize virtual scroll listener
    this.initVirtualScroll();

    // Check if we should use virtual scrolling (>= 100 messages)
    const useVirtualScroll = conv.playedMessages.length >= 100;

    if (useVirtualScroll) {
      // Calculate heights and set initial range to show last messages
      const cumulativeHeights = this.calculateCumulativeHeights(conv.playedMessages);

      // Set range to show last messages
      const totalMessages = conv.playedMessages.length;
      const buffer = this.virtualScroll.buffer;

      // Start from the end
      this.virtualScroll.visibleRange = {
        start: Math.max(0, totalMessages - 50 - buffer),
        end: totalMessages
      };

      // Don't scroll here - scrollToBottom() is called at the end of renderConversation()
      this.renderVirtualMessages(conv, cumulativeHeights, false);
    } else {
      // Standard rendering for small conversations
      this.virtualScroll.enabled = false;

      let previousFrom = null;
      for (let i = 0; i < conv.playedMessages.length; i++) {
        const msg = conv.playedMessages[i];
        const { element, newPreviousFrom } = this.createMessageElement(msg, i, conv, previousFrom);
        this.chatMessagesEl.appendChild(element);
        previousFrom = newPreviousFrom;
      }
    }

    // Render thinking overlay if active
    this.renderThinkingOverlay(conv);

    // Display the correct area at bottom (idle or active choice block)
    this.renderChoices(conv);

    // Scroll to bottom AFTER all DOM modifications are complete
    this.scrollToBottom();
  },

  renderThinkingOverlay(conv) {
    // Remove existing overlay if any
    const existingOverlay = this.root.querySelector('.ms-thinking-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }

    // Check if we have active thinking to display
    if (!conv || !conv.activeThinking) {
      return;
    }

    // Create the overlay element
    const overlay = document.createElement('div');
    overlay.className = 'ms-thinking-overlay';
    overlay.textContent = conv.activeThinking.text;

    // Insert the overlay in the chat section
    const chatSection = this.root.querySelector('.ms-chat');
    if (chatSection) {
      chatSection.appendChild(overlay);
    }
  },

  renderChoices(conv) {
    // we now work in .ms-chat-input-main
    if (!this.chatInputMainEl) return;

    // reset center content
    this.chatInputMainEl.innerHTML = "";

    // Check if we have active REAL choices
    const hasActiveRealChoices =
      conv &&
      conv.waitingForRealChoice &&
      typeof conv.activeRealChoiceIdx === "number" &&
      conv.activeRealChoiceIdx >= 0 &&
      conv.realChoices &&
      conv.realChoices[conv.activeRealChoiceIdx] &&
      Array.isArray(conv.realChoices[conv.activeRealChoiceIdx].options) &&
      conv.realChoices[conv.activeRealChoiceIdx].options.length > 0;

    // Check if we have active FAKE choices
    const hasActiveFakeChoices =
      conv &&
      conv.waitingForChoice &&
      typeof conv.activeChoiceIdx === "number" &&
      conv.activeChoiceIdx >= 0 &&
      conv.fakeChoices &&
      conv.fakeChoices[conv.activeChoiceIdx] &&
      Array.isArray(conv.fakeChoices[conv.activeChoiceIdx].options) &&
      conv.fakeChoices[conv.activeChoiceIdx].options.length > 0;

    const hasActiveChoices = hasActiveRealChoices || hasActiveFakeChoices;

    // Check if the conversation is finished
    const isFinished = this.isConversationFinished(conv);

    // Check if user is blocked (another conversation is active)
    const isBlocked = this.activeConversationKey &&
                      this.selectedKey !== this.activeConversationKey &&
                      this.conversationsByKey[this.activeConversationKey] &&
                      !this.isConversationFinished(this.conversationsByKey[this.activeConversationKey]);

    // send button: hide if active choices, gray if conversation finished or blocked
    if (this.chatSendBtnEl) {
      if (hasActiveChoices) {
        this.chatSendBtnEl.style.display = "none";
      } else {
        this.chatSendBtnEl.style.display = "flex";
        if (isFinished || isBlocked) {
          this.chatSendBtnEl.classList.add("ms-chat-send-btn--disabled");
        } else {
          this.chatSendBtnEl.classList.remove("ms-chat-send-btn--disabled");
        }
      }
    }

    // no active choice block -> "idle" mode with . . . (unless conversation finished)
    if (!hasActiveChoices) {
      if (!isFinished) {
        const idle = document.createElement("div");
        idle.className = "ms-chat-input-idle";
        idle.textContent = ". . .";
        this.chatInputMainEl.appendChild(idle);
      }
      return;
    }

    const listEl = document.createElement("div");
    listEl.className = "ms-choice-list";

    // Timestamp for accidental click protection
    const choicesDisplayedAt = Date.now();

    // --- REAL CHOICES (priority) ---
    if (hasActiveRealChoices) {
      const blockIndex = conv.activeRealChoiceIdx;
      const block = conv.realChoices[blockIndex];
      const options = block.options || []; // { label: 'A', text: 'Option text' }

      // Add special class for real choices
      listEl.classList.add("ms-choice-list--real");

      options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ms-choice ms-choice--real";
        btn.textContent = opt.text; // Display only text, not label

        btn.addEventListener("click", (e) => {
          const timeSinceDisplay = Date.now() - choicesDisplayedAt;
          if (timeSinceDisplay < 1500) {
            const rect = btn.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const buttonWidth = rect.width;
            const rightZoneStart = buttonWidth * 0.85;

            if (clickX > rightZoneStart) {
              return;
            }
          }
          this.onRealChoiceSelected(conv, blockIndex, opt);
        });

        listEl.appendChild(btn);
      });
    }
    // --- FAKE CHOICES ---
    else if (hasActiveFakeChoices) {
      const blockIndex = conv.activeChoiceIdx;
      const block = conv.fakeChoices[blockIndex];
      const options = block.options || [];

      options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ms-choice";
        btn.textContent = opt;

        btn.addEventListener("click", (e) => {
          const timeSinceDisplay = Date.now() - choicesDisplayedAt;
          if (timeSinceDisplay < 1500) {
            const rect = btn.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const buttonWidth = rect.width;
            const rightZoneStart = buttonWidth * 0.85;

            if (clickX > rightZoneStart) {
              return;
            }
          }
          this.onChoiceSelected(conv, blockIndex, opt);
        });

        listEl.appendChild(btn);
      });
    }

    this.chatInputMainEl.appendChild(listEl);

    // Scroll to bottom so last messages stay visible with choices
    this.scrollToBottom();
  },

  /**
   * When the player clicks on one of the fake choices:
   * - add it as an MC message
   * - mark the block as consumed
   * - let the script continue on the next click on "Send"
   */
  // -------------------------------------------------------------------
  // LIGHTBOX FOR IMAGES AND VIDEOS
  // -------------------------------------------------------------------
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
      video.volume = this.getMediaVolume(); // Apply volume from settings
      // Apply global mute if active
      if (window.isGlobalMuted && window.isGlobalMuted()) {
        video.muted = true;
      }
      // Start video automatically
      video.play().catch(err => {
      });
    } else if (type === 'avatar') {
      // Avatar: round image
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

  closeLightbox() {
    if (this.lightboxEl) {
      this.lightboxEl.classList.remove('ms-lightbox--open');
      // Stop video if playing
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
      e.stopPropagation(); // prevent closing
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

    // Add to phone container (to stay within bounds)
    const phoneFrame = document.querySelector('.phone-frame');
    if (phoneFrame) {
      phoneFrame.appendChild(lightbox);
    } else {
      document.body.appendChild(lightbox);
    }

    this.lightboxEl = lightbox;
  },

  onChoiceSelected(conv, blockIndex, optionText) {
    if (!conv) return;
    if (this.selectedKey !== conv.key) return;

    if (!Array.isArray(conv.playedMessages)) {
      conv.playedMessages = [];
    }

    const block =
      Array.isArray(conv.fakeChoices) && conv.fakeChoices[blockIndex]
        ? conv.fakeChoices[blockIndex]
        : null;

    conv.playedMessages.push({
      kind: "talk",
      from: "mc",
      text: optionText,
      chapter: block ? block.chapter : null
    });

    // Save choice for optimized saving
    if (!Array.isArray(conv.choicesMade)) conv.choicesMade = [];
    conv.choicesMade.push(optionText);

    // Save action in history for going back
    if (!Array.isArray(conv.actionHistory)) conv.actionHistory = [];
    conv.actionHistory.push({
      type: 'choice',
      choiceIdx: blockIndex,
      previousNextChoiceIdx: conv.nextChoiceIdx
    });

    // this block is consumed
    conv.waitingForChoice = false;
    conv.activeChoiceIdx = null;

    if (typeof conv.nextChoiceIdx === "number" && conv.nextChoiceIdx <= blockIndex) {
      conv.nextChoiceIdx = blockIndex + 1;
    }

    // re-render with player message added
    this.renderConversation();

    // Resume autoplay if mode was active (auto or fast)
    this.resumeAutoPlay();
  },

  /**
   * When the player clicks on one of the REAL choices:
   * - add it as an MC message
   * - save the label of the selected path
   * - advance in the script to the corresponding path
   */
  onRealChoiceSelected(conv, blockIndex, option) {
    if (!conv) return;
    if (this.selectedKey !== conv.key) return;

    if (!Array.isArray(conv.playedMessages)) {
      conv.playedMessages = [];
    }

    const block =
      Array.isArray(conv.realChoices) && conv.realChoices[blockIndex]
        ? conv.realChoices[blockIndex]
        : null;

    // Add choice text as MC message
    conv.playedMessages.push({
      kind: "talk",
      from: "mc",
      text: option.text,
      chapter: block ? block.chapter : null
    });

    // Save choice in real choices history
    if (!Array.isArray(conv.realChoicesMade)) conv.realChoicesMade = [];
    conv.realChoicesMade.push({ label: option.label, text: option.text });

    // Save action in history for going back
    if (!Array.isArray(conv.actionHistory)) conv.actionHistory = [];
    conv.actionHistory.push({
      type: 'realChoice',
      choiceIdx: blockIndex,
      previousScriptIndex: conv.scriptIndex, // Save current index (pointing to realChoice)
      previousNextRealChoiceIdx: conv.nextRealChoiceIdx,
      previousSelectedPath: conv.selectedPath
    });

    // Set selected path
    conv.selectedPath = option.label;

    // This block is consumed
    conv.waitingForRealChoice = false;
    conv.activeRealChoiceIdx = null;

    if (typeof conv.nextRealChoiceIdx === "number" && conv.nextRealChoiceIdx <= blockIndex) {
      conv.nextRealChoiceIdx = blockIndex + 1;
    }

    // Advance one step in the script (pass the realChoice message)
    conv.scriptIndex += 1;

    // Re-render
    this.renderConversation();

    // Resume autoplay if mode was active
    this.resumeAutoPlay();
  },

  /**
   * Goes back one action in the conversation
   * Removes the last displayed message and restores previous state
   */
  goBack() {
    if (!this.selectedKey) return;
    const conv = this.conversationsByKey[this.selectedKey];
    if (!conv) return;

    // Allow going back even if not active conversation (for canceling unlocks)

    // If autoplay mode is active, switch to manual
    if (this.autoplayMode !== 'manual') {
      this.stopAutoPlay();
    }

    // If we're waiting for a fake choice, cancel waiting state
    if (conv.waitingForChoice) {
      conv.waitingForChoice = false;
      conv.activeChoiceIdx = null;

      // Continue to also delete last message if possible
      if (!Array.isArray(conv.actionHistory) || !conv.actionHistory.length) {
        this.renderConversation();
        return;
      }
    }

    // If we're waiting for a real choice, cancel waiting state
    if (conv.waitingForRealChoice) {
      conv.waitingForRealChoice = false;
      conv.activeRealChoiceIdx = null;

      // Continue to also delete last message if possible
      if (!Array.isArray(conv.actionHistory) || !conv.actionHistory.length) {
        this.renderConversation();
        return;
      }
    }

    // If we're in the middle of a thinking block, go back to previous block or exit thinking
    if (conv.activeThinking) {
      const currentBlockIndex = conv.activeThinking.blockIndex;

      if (currentBlockIndex > 0) {
        // Go back to previous block
        const scriptMsg = conv.messages[conv.scriptIndex];
        if (scriptMsg && scriptMsg.kind === 'thinking') {
          conv.thinkingBlockIndex = currentBlockIndex;
          conv.activeThinking = {
            text: scriptMsg.blocks[currentBlockIndex - 1],
            blockIndex: currentBlockIndex - 1,
            totalBlocks: scriptMsg.blocks.length
          };
        }
        this.renderConversation();
        return;
      } else {
        // Exit thinking mode completely (we're at first block)
        conv.activeThinking = null;
        conv.thinkingBlockIndex = undefined;
        // Continue to normal goBack logic if there's history
        if (!Array.isArray(conv.actionHistory) || !conv.actionHistory.length) {
          this.renderConversation();
          return;
        }
      }
    }

    // If no history or empty, nothing to do
    if (!Array.isArray(conv.actionHistory) || !conv.actionHistory.length) return;

    // Get and remove last action
    const lastAction = conv.actionHistory.pop();

    // Special case: conversation entry marker
    // Return to previous conversation
    if (lastAction.type === 'conversationEntry') {
      // Check if current conversation is now empty and should be deleted
      const isCurrentConvEmpty = (!conv.playedMessages || conv.playedMessages.length === 0) &&
                                  (!conv.actionHistory || conv.actionHistory.length === 0) &&
                                  conv.scriptIndex === 0;

      if (isCurrentConvEmpty) {
        // Remove source files of this conversation from unlockedFiles and parsedFiles
        const sourceFiles = this.conversationSourceFiles[this.selectedKey] || [];
        for (const file of sourceFiles) {
          if (file !== 'start.txt') {
            const unlockedIdx = this.unlockedFiles.indexOf(file);
            if (unlockedIdx !== -1) {
              this.unlockedFiles.splice(unlockedIdx, 1);
            }
            const parsedIdx = this.parsedFiles.indexOf(file);
            if (parsedIdx !== -1) {
              this.parsedFiles.splice(parsedIdx, 1);
            }
          }
        }

        // Remove conversation from conversationsByKey
        delete this.conversationsByKey[this.selectedKey];

        // Remove source files of this conversation
        delete this.conversationSourceFiles[this.selectedKey];

        // Remove this contact from contacts list
        this.contacts = this.contacts.filter(c => c.key !== this.selectedKey);

        // Remove from contactsWithNew
        this.contactsWithNew.delete(this.selectedKey);

        // Remove from contactLastActivity
        delete this.contactLastActivity[this.selectedKey];
      }

      if (this.conversationHistory.length > 0) {
        const previousEntry = this.conversationHistory.pop();
        if (previousEntry) {
          this.activeConversationKey = previousEntry.key;
          this.selectedKey = previousEntry.key;
          // Update activity so conversation moves to top of list
          this.contactLastActivity[previousEntry.key] = Date.now();
          this.renderContacts();
          this.renderConversation();
          return;
        }
      }
      // No previous conversation, just render without doing anything else
      this.renderContacts();
      this.renderConversation();
      return;
    }

    // Special case: canceling file unlock
    if (lastAction.type === 'unlock') {
      const file = lastAction.file;


      // Remove file from unlockedFiles (so it's no longer loaded)
      const unlockedIdx = this.unlockedFiles.indexOf(file);
      if (unlockedIdx !== -1) {
        this.unlockedFiles.splice(unlockedIdx, 1);
      }

      // Restore script index
      conv.scriptIndex = lastAction.previousScriptIndex;

      // Variable to know if we deleted the conversation created by this unlock
      let deletedOrphanConversation = false;

      // Restore active conversation if it changed due to this unlock
      if (lastAction.previousActiveConversationKey &&
          this.activeConversationKey !== lastAction.previousActiveConversationKey) {
        // Save the key of the conversation that will be "orphaned"
        const orphanedConvKey = this.activeConversationKey;

        // Remove the conversationHistory entry that was added by the unlock
        if (this.conversationHistory.length > 0) {
          const lastHistoryEntry = this.conversationHistory[this.conversationHistory.length - 1];
          if (lastHistoryEntry && lastHistoryEntry.key === lastAction.previousActiveConversationKey) {
            this.conversationHistory.pop();
          }
        }
        this.activeConversationKey = lastAction.previousActiveConversationKey;
        // Update activity so conversation moves to top of list
        this.contactLastActivity[lastAction.previousActiveConversationKey] = Date.now();

        // Clean up orphaned conversation
        const orphanedConv = this.conversationsByKey[orphanedConvKey];
        if (orphanedConv) {
          // Completely reset runtime state of orphaned conversation
          // because we're canceling having entered it
          orphanedConv.playedMessages = [];
          orphanedConv.actionHistory = [];
          orphanedConv.scriptIndex = 0;
          orphanedConv.waitingForChoice = false;
          orphanedConv.activeChoiceIdx = null;
          orphanedConv.nextChoiceIdx = 0;
          orphanedConv.waitingForRealChoice = false;
          orphanedConv.activeRealChoiceIdx = null;
          orphanedConv.nextRealChoiceIdx = 0;
          orphanedConv.waitingForLock = false;
          orphanedConv.selectedPath = null;
          orphanedConv.choicesMade = [];
          orphanedConv.realChoicesMade = [];

          // Check if conversation should be deleted
          // (if it has no scripted messages, it was created by this unlock)
          const hasNoContent = !orphanedConv.messages || orphanedConv.messages.length === 0;

          if (hasNoContent) {
            // Remove conversation from conversationsByKey
            delete this.conversationsByKey[orphanedConvKey];

            // Remove source files of this conversation
            delete this.conversationSourceFiles[orphanedConvKey];

            // Remove this contact from contacts list
            this.contacts = this.contacts.filter(c => c.key !== orphanedConvKey);

            // Remove from contactsWithNew
            this.contactsWithNew.delete(orphanedConvKey);

            // Remove from contactLastActivity
            delete this.contactLastActivity[orphanedConvKey];

            deletedOrphanConversation = true;
          } else {
            // Conversation has content, we keep it but it's reset
          }
        }
      }

      // Remove file from parsedFiles ONLY if we deleted the conversation it created
      // Otherwise, keeping it in parsedFiles avoids message duplication if unlock is redone
      if (deletedOrphanConversation) {
        const parsedIdx = this.parsedFiles.indexOf(file);
        if (parsedIdx !== -1) {
          this.parsedFiles.splice(parsedIdx, 1);
        }
      }

      // Unlock doesn't add a message, so no pop on playedMessages
      this.renderContacts();
      this.renderConversation();
      return;
    }

    // Special case: canceling lock unlock (similar to regular unlock)
    if (lastAction.type === 'lock') {
      const file = lastAction.targetFile; // Lock uses targetFile

      // Remove file from unlockedFiles (so it's no longer loaded)
      const unlockedIdx = this.unlockedFiles.indexOf(file);
      if (unlockedIdx !== -1) {
        this.unlockedFiles.splice(unlockedIdx, 1);
      }

      // ALWAYS remove from parsedFiles to ensure file is parsed fresh when re-unlocking
      // This prevents the blocking issue where the orphaned conversation exists but is reset
      const parsedIdx = this.parsedFiles.indexOf(file);
      if (parsedIdx !== -1) {
        this.parsedFiles.splice(parsedIdx, 1);
      }

      // Restore script index
      conv.scriptIndex = lastAction.previousScriptIndex;

      // Restore active conversation if it changed due to this lock
      if (lastAction.previousActiveConversationKey &&
          this.activeConversationKey !== lastAction.previousActiveConversationKey) {
        // Save the key of the conversation that will be "orphaned"
        const orphanedConvKey = this.activeConversationKey;

        // Remove the conversationHistory entry that was added by the unlock
        if (this.conversationHistory.length > 0) {
          const lastHistoryEntry = this.conversationHistory[this.conversationHistory.length - 1];
          if (lastHistoryEntry && lastHistoryEntry.key === lastAction.previousActiveConversationKey) {
            this.conversationHistory.pop();
          }
        }
        this.activeConversationKey = lastAction.previousActiveConversationKey;
        // Update activity so conversation moves to top of list
        this.contactLastActivity[lastAction.previousActiveConversationKey] = Date.now();

        // ALWAYS delete orphaned conversation entirely
        // Since we removed from parsedFiles, the file will be re-parsed when re-unlocking
        // If we just reset the conversation, messages would be duplicated on re-parse
        if (this.conversationsByKey[orphanedConvKey]) {
          delete this.conversationsByKey[orphanedConvKey];
          delete this.conversationSourceFiles[orphanedConvKey];
          this.contacts = this.contacts.filter(c => c.key !== orphanedConvKey);
          this.contactsWithNew.delete(orphanedConvKey);
          delete this.contactLastActivity[orphanedConvKey];
        }
      }

      // Lock doesn't add a message, so no pop on playedMessages
      this.renderContacts();
      this.renderConversation();
      return;
    }

    if (lastAction.type === 'delete') {
      // Restore deleted message
      if (lastAction.deletedMessage) {
        lastAction.deletedMessage.deleted = false;
        delete lastAction.deletedMessage.deletedAtScriptIndex;
      }
      // Restore script index
      conv.scriptIndex = lastAction.previousScriptIndex;
      // Don't pop playedMessages because delete doesn't add a message
    } else if (lastAction.type === 'thinking') {
      // Restore thinking state - show the last block of thinking
      conv.scriptIndex = lastAction.previousScriptIndex;

      // Get the thinking message and show the last block
      const scriptMsg = conv.messages[conv.scriptIndex];
      if (scriptMsg && scriptMsg.kind === 'thinking') {
        const lastBlockIndex = lastAction.totalBlocks - 1;
        conv.thinkingBlockIndex = lastAction.totalBlocks;
        conv.activeThinking = {
          text: scriptMsg.blocks[lastBlockIndex],
          blockIndex: lastBlockIndex,
          totalBlocks: lastAction.totalBlocks
        };
      }
      // Don't pop playedMessages because thinking doesn't add a message
    } else {
      // Remove last displayed message (for script and choice)
      if (conv.playedMessages.length > 0) {
        conv.playedMessages.pop();
      }

      if (lastAction.type === 'script') {
        // Restore script index
        conv.scriptIndex = lastAction.previousScriptIndex;
      } else if (lastAction.type === 'choice') {
        // Restore fake choice state
        conv.waitingForChoice = true;
        conv.activeChoiceIdx = lastAction.choiceIdx;
        conv.nextChoiceIdx = lastAction.previousNextChoiceIdx;
        // Remove last choice from choice history
        if (Array.isArray(conv.choicesMade) && conv.choicesMade.length > 0) {
          conv.choicesMade.pop();
        }
      } else if (lastAction.type === 'realChoice') {
        // Restore real choice state
        conv.waitingForRealChoice = true;
        conv.activeRealChoiceIdx = lastAction.choiceIdx;
        conv.nextRealChoiceIdx = lastAction.previousNextRealChoiceIdx;
        conv.selectedPath = lastAction.previousSelectedPath;
        // Restore script index (points to realChoice message)
        conv.scriptIndex = lastAction.previousScriptIndex;
        // Remove last real choice from history
        if (Array.isArray(conv.realChoicesMade) && conv.realChoicesMade.length > 0) {
          conv.realChoicesMade.pop();
        }
      }
    }

    // Cancel pending deletion timers that are beyond current position
    if (Array.isArray(conv.pendingDeleteTimers)) {
      conv.pendingDeleteTimers = conv.pendingDeleteTimers.filter(timer => {
        if (timer.scriptIndex >= conv.scriptIndex) {
          clearTimeout(timer.timeoutId);
          // Restore message if it was already marked as deleted
          if (timer.message && timer.message.deleted) {
            timer.message.deleted = false;
            delete timer.message.deletedAtScriptIndex;
          }
          return false;
        }
        return true;
      });
    }

    // Reset deleted messages beyond current script position
    for (const msg of conv.playedMessages) {
      if (msg.deleted && msg.deletedAtScriptIndex !== undefined && msg.deletedAtScriptIndex >= conv.scriptIndex) {
        msg.deleted = false;
        delete msg.deletedAtScriptIndex;
      }
    }

    // Check if conversation is now empty and should be removed
    const isConversationEmpty = (!conv.playedMessages || conv.playedMessages.length === 0) &&
                                 (!conv.actionHistory || conv.actionHistory.length === 0) &&
                                 conv.scriptIndex === 0;

    // If conversation is empty and isn't the initial conversation, remove it
    if (isConversationEmpty && this.conversationHistory.length > 0) {
      // Get history of this conversation to go back
      const previousEntry = this.conversationHistory.pop();

      if (previousEntry) {
        // Remove source files of this conversation from unlockedFiles and parsedFiles
        const sourceFiles = this.conversationSourceFiles[this.selectedKey] || [];
        for (const file of sourceFiles) {
          // Only remove files that aren't start.txt
          if (file !== 'start.txt') {
            const unlockedIdx = this.unlockedFiles.indexOf(file);
            if (unlockedIdx !== -1) {
              this.unlockedFiles.splice(unlockedIdx, 1);
            }
            const parsedIdx = this.parsedFiles.indexOf(file);
            if (parsedIdx !== -1) {
              this.parsedFiles.splice(parsedIdx, 1);
            }
          }
        }

        // Remove conversation from conversationsByKey
        delete this.conversationsByKey[this.selectedKey];

        // Remove source files of this conversation
        delete this.conversationSourceFiles[this.selectedKey];

        // Remove this contact from contacts list
        this.contacts = this.contacts.filter(c => c.key !== this.selectedKey);

        // Remove from contactsWithNew
        this.contactsWithNew.delete(this.selectedKey);

        // Remove from contactLastActivity
        delete this.contactLastActivity[this.selectedKey];

        // Update active conversation
        this.activeConversationKey = previousEntry.key;

        // Automatically select the old conversation
        this.selectedKey = previousEntry.key;

        // Re-render contacts and conversation
        this.renderContacts();
        this.renderConversation();
        return;
      }
    }

    this.renderConversation();
  },

  /**
   * Gets autoplay speed from Settings
   */
  getAutoplaySpeed() {
    const saved = localStorage.getItem('studioSettings');
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        if (typeof settings.autoplaySpeed === 'number') {
          return settings.autoplaySpeed;
        }
      } catch (e) {}
    }
    return 1500; // default value
  },

  /**
   * Gets doubleplay speed from Settings
   */
  getDoubleplaySpeed() {
    const saved = localStorage.getItem('studioSettings');
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        if (typeof settings.doubleplaySpeed === 'number') {
          return settings.doubleplaySpeed;
        }
      } catch (e) {}
    }
    return 500; // default value
  },

  /**
   * Starts autoplay with a given interval
   * @param {string} mode - 'auto' or 'fast'
   */
  startAutoPlay(mode = 'auto') {
    // Stop previous interval if active (without touching mode)
    if (this.autoplayInterval) {
      clearInterval(this.autoplayInterval);
      this.autoplayInterval = null;
    }

    this.autoplayMode = mode;
    // Use speeds configured in Settings
    const interval = mode === 'fast' ? this.getDoubleplaySpeed() : this.getAutoplaySpeed();

    this.autoplayInterval = setInterval(() => {
      if (!this.selectedKey) {
        this.pauseAutoPlay();
        return;
      }

      const conv = this.conversationsByKey[this.selectedKey];
      if (!conv) {
        this.pauseAutoPlay();
        return;
      }

      // If another conversation has become active (due to an unlock),
      // pause because we can't advance in the old conversation
      // EXCEPT if the active conversation is finished
      if (this.activeConversationKey &&
          this.selectedKey !== this.activeConversationKey &&
          this.conversationsByKey[this.activeConversationKey]) {
        const activeConv = this.conversationsByKey[this.activeConversationKey];
        if (!this.isConversationFinished(activeConv)) {
          this.pauseAutoPlay();
          return;
        }
      }

      // If waiting for choice, lock, or conversation finished, pause (keep mode)
      if (conv.waitingForChoice || conv.waitingForRealChoice || conv.waitingForLock || this.isConversationFinished(conv)) {
        this.pauseAutoPlay();
        return;
      }

      // Advance one message
      this.advanceConversation(conv);

      // Check if should pause after advancing (always keep mode)
      // - If waiting for choice, lock, or conversation finished
      // - If unlock changed active conversation (and the new one isn't finished)
      let shouldPauseAfterAdvance = conv.waitingForChoice || conv.waitingForRealChoice || conv.waitingForLock || this.isConversationFinished(conv);
      if (!shouldPauseAfterAdvance && this.activeConversationKey && this.selectedKey !== this.activeConversationKey) {
        const activeConv = this.conversationsByKey[this.activeConversationKey];
        if (activeConv && !this.isConversationFinished(activeConv)) {
          shouldPauseAfterAdvance = true;
        }
      }
      if (shouldPauseAfterAdvance) {
        this.pauseAutoPlay();
      }
    }, interval);

    // Update button display
    this.updateAutoplayButton();
  },

  /**
   * Stops autoplay and switches to manual mode
   * @param {boolean} updateButton - if true, updates the button
   */
  stopAutoPlay(updateButton = true) {
    if (this.autoplayInterval) {
      clearInterval(this.autoplayInterval);
      this.autoplayInterval = null;
    }
    this.autoplayMode = 'manual';

    if (updateButton) {
      this.updateAutoplayButton();
    }
  },

  /**
   * Pauses autoplay without changing mode
   * Used when switching conversations or when a choice appears
   */
  pauseAutoPlay() {
    if (this.autoplayInterval) {
      clearInterval(this.autoplayInterval);
      this.autoplayInterval = null;
    }
    // Keep autoplayMode as is
  },

  /**
   * Resumes autoplay if mode is not manual
   * Used after a choice or when returning to a conversation
   */
  resumeAutoPlay() {
    // Only resume if in auto or fast mode AND not already running
    if (this.autoplayMode !== 'manual' && !this.autoplayInterval) {
      const conv = this.conversationsByKey[this.selectedKey];
      // Don't resume if waiting for choice, lock, or conversation finished
      if (conv && !conv.waitingForChoice && !conv.waitingForRealChoice && !conv.waitingForLock && !this.isConversationFinished(conv)) {
        this.startAutoPlay(this.autoplayMode);
      }
    }
  },

  /**
   * Toggles autoplay: manual -> auto, auto/fast -> manual
   */
  toggleAutoPlay() {
    if (this.autoplayMode === 'manual') {
      this.startAutoPlay('auto');
    } else {
      this.stopAutoPlay();
    }
  },

  /**
   * Activates fast mode (called during long press)
   */
  activateFastMode() {
    this.startAutoPlay('fast');
  },

  /**
   * Updates autoplay button appearance
   */
  updateAutoplayButton() {
    const btn = this.root?.querySelector('.ms-chat-autoplay-btn');
    if (!btn) return;

    // Remove all mode classes
    btn.classList.remove('ms-chat-autoplay-btn--auto', 'ms-chat-autoplay-btn--fast');

    // Add the current mode class
    if (this.autoplayMode === 'auto') {
      btn.classList.add('ms-chat-autoplay-btn--auto');
    } else if (this.autoplayMode === 'fast') {
      btn.classList.add('ms-chat-autoplay-btn--fast');
    }

    // Update the SVG icon
    const svgContainer = btn.querySelector('.ms-autoplay-icon');
    if (svgContainer) {
      if (this.autoplayMode === 'manual') {
        // Hand icon
        svgContainer.innerHTML = `<svg viewBox="0 0 93.49 122.88" fill="currentColor"><path d="M2.34,62.52l-0.26,0.27l-2.08-0.83V31.27c0-1.42,0.42-2.76,1.14-3.89l0,0c0.14-0.22,0.29-0.44,0.46-0.64 c0.17-0.22,0.35-0.42,0.53-0.6l0.02-0.02c0.54-0.54,1.18-1.01,1.89-1.36l0.03-0.01l0.35-0.17l0.04-0.02 c0.86-0.37,1.82-0.58,2.81-0.58l0,0h0.04v0c2.01,0,3.84,0.82,5.16,2.14c0.54,0.54,1.01,1.18,1.36,1.88l0.02,0.04l0.16,0.35 l0.01,0.03c0.37,0.86,0.58,1.82,0.58,2.81l0,0.01v0.04v24.96v1.13l-1.13,0.07c-3.08,0.19-5.92,1.18-8.32,2.77 c-0.48,0.32-0.94,0.66-1.38,1.02c-0.41,0.34-0.84,0.72-1.26,1.15L2.34,62.52L2.34,62.52L2.34,62.52z M65.62,83.35l1.23,0.46 l0.53,0.39c0.09,0.12,0.2,0.22,0.33,0.31l0,0l0.16,0.09l0,0.01c0.17,0.08,0.35,0.12,0.54,0.12v0h0.03c0.18,0,0.34-0.03,0.49-0.09 l0.12-0.06l0.12-0.07l0.04-0.02l0.04-0.02c0.54-0.31,1.26-0.85,2.05-1.5c0.8-0.67,1.71-1.49,2.61-2.33 c1.76-1.66,3.76-3.66,4.56-4.45l0.04-0.04c2.53-2.53,5.11-3.7,7.38-3.85c0.46-0.03,0.92-0.02,1.35,0.03 c0.44,0.05,0.87,0.14,1.28,0.27h0.01l0.05,0.02l0.01,0c0.81,0.26,1.56,0.67,2.22,1.2l0.03,0.03l0.31,0.27l0.06,0.05l0.29,0.29 l0.05,0.06l0.01,0.01l0,0l0.01,0.02l0,0c0.56,0.62,1.01,1.35,1.34,2.16l0.02,0.03l0.15,0.42l0.02,0.09l0.12,0.43l0.01,0.05 l0.01,0.06h0c0.57,2.38,0.1,5.27-1.88,8.17c-0.37,0.55-0.81,1.11-1.29,1.65c-0.48,0.54-1.02,1.09-1.62,1.62l0,0l-0.08,0.07 l-0.1,0.09l-0.07,0.07l-0.04,0.04L63.64,114.3l-0.85,0.93l-0.06-0.06c-1.35,1.23-2.67,2.29-4.01,3.2c-1.6,1.08-3.22,1.95-4.9,2.61 c-1.69,0.67-3.46,1.15-5.33,1.46c-1.87,0.3-3.84,0.45-5.94,0.45h-15.9c-5.3,0-10.23-1.56-14.36-4.23l0,0 c-0.79-0.51-1.57-1.08-2.32-1.69c-0.76-0.62-1.47-1.26-2.12-1.92l-0.02-0.02l0,0c-2.01-2.04-3.71-4.42-5-7.03 c-0.25-0.52-0.49-1.04-0.71-1.56C0.76,103.2,0.01,99.65,0,95.93h0V95.9V74.93c0-1.93,0.36-3.79,1-5.49l0-0.01 c0.12-0.31,0.26-0.64,0.41-0.97h0c0.15-0.32,0.31-0.64,0.48-0.95l0.01-0.02l0.03-0.05l0.02-0.04c0.62-0.97,1.36-1.88,2.19-2.69 l0.02-0.02l0.46-0.43l0.04-0.03l0.48-0.41l0.04-0.04l0.02-0.02l0,0c1.06-0.85,2.24-1.57,3.51-2.11h0c0.29-0.12,0.57-0.24,0.76-0.3 v0c1.56-0.57,3.25-0.88,5.01-0.88v0h0.04h0.64l0.29,0.04l0.27,0.07l0.21,0.02v0h17.27v0l0.11,0h0.08l0.11,0v0h17.27v0l0.05,0h0.07 l0.05,0v0h1.28c2.54,0,4.94,0.65,7.05,1.79l0,0c0.42,0.23,0.82,0.47,1.19,0.72v0l0.01,0c0.36,0.24,0.74,0.52,1.11,0.82l0.01,0.01 l0.02,0.02l0,0c1.82,1.49,3.3,3.41,4.25,5.6c0.2,0.45,0.37,0.89,0.5,1.31v0c0.15,0.45,0.27,0.91,0.38,1.37v0.01l0.01,0.07 l0.02,0.11c0.01,0.08,0.02,0.16,0.04,0.22h0l0.01,0.03h0l0.04,0.11h0l0.02,0.06L67,73.21l0.06,0.65l0,0.04l0.02,0.26v0.04 l0.02,0.46v0.03l0,0.25l0,0.01v4.43v1.66l-1.58-0.52c-2.46-0.81-4.81-1.36-7.03-1.66h0c-0.5-0.07-0.98-0.12-1.42-0.17 c-0.45-0.04-0.92-0.08-1.39-0.1l-1.02-0.03c-2.85-0.04-5.48,0.37-7.81,1.17c-0.51,0.18-0.99,0.36-1.42,0.55 c-0.45,0.2-0.9,0.41-1.32,0.64l-0.71,0.41c-2.23,1.34-4.08,3.14-5.49,5.34c-0.29,0.46-0.56,0.9-0.78,1.33 c-0.24,0.45-0.46,0.94-0.68,1.44v0l-0.01,0.03h0c-0.68,1.62-1.17,3.4-1.45,5.33c-0.06,0.44-0.12,0.87-0.15,1.28 c-0.03,0.34-0.07,0.7-0.08,1.06l2.66,0.03c0.08-1.35,0.28-2.64,0.57-3.84h0c0.09-0.37,0.18-0.72,0.27-1.03h0 c0.09-0.3,0.2-0.64,0.33-0.98v0l0.32-0.82l0,0c0.89-2.13,2.18-3.94,3.8-5.38c0.32-0.28,0.66-0.55,0.99-0.8 c0.37-0.27,0.72-0.51,1.06-0.71l0.02-0.01l0.03-0.02v0c1.7-1.02,3.68-1.73,5.9-2.09c0.45-0.07,0.94-0.14,1.44-0.18 c0.49-0.05,1-0.07,1.49-0.09h0.03l0.98,0h0.02c2.3,0.03,4.79,0.39,7.44,1.07v0c0.61,0.15,1.18,0.32,1.72,0.49 c0.62,0.19,1.21,0.39,1.77,0.58L65.62,83.35L65.62,83.35z M15.74,60.59L15.74,60.59L15.74,60.59L15.74,60.59L15.74,60.59z M48.24,57.4H36.05h-1.2v-1.2V7.3h0c0-2.01,0.82-3.84,2.14-5.16c0.54-0.54,1.18-1.01,1.88-1.36l0.03-0.01l0.35-0.17l0.04-0.02 c0.86-0.37,1.81-0.58,2.81-0.58l0-0.01h0.04v0.01c2.01,0,3.84,0.82,5.16,2.14c0.54,0.54,1,1.18,1.36,1.88l0.02,0.03l0.16,0.35 l0.02,0.04c0.37,0.86,0.58,1.81,0.58,2.81l0,0.01V7.3v48.89v1.2H48.24L48.24,57.4z M53.63,57.45l-0.22-0.02l-1.12-0.09v-1.11V19.01 h0c0-2.01,0.82-3.84,2.14-5.16c0.54-0.54,1.18-1,1.89-1.36l0.04-0.02l0.35-0.16l0.03-0.02c0.86-0.37,1.81-0.58,2.81-0.58l0,0h0.04 c1.42,0,2.76,0.42,3.89,1.14l0,0l0.01,0.01c0.22,0.13,0.43,0.29,0.63,0.45l0,0l0.01,0.01c0.21,0.16,0.41,0.34,0.59,0.52l0.02,0.02 c0.54,0.54,1.01,1.18,1.36,1.88l0.01,0.03l0.17,0.35l0.02,0.04c0.37,0.86,0.58,1.82,0.58,2.81l0,0v0.04v42.9l-2.07,0.84l-0.2-0.2 c-2.06-2.06-4.63-3.62-7.49-4.45c-0.57-0.17-1.16-0.31-1.73-0.41C54.84,57.58,54.24,57.5,53.63,57.45L53.63,57.45z M30.68,57.4 H18.49h-1.21v-1.2V31.27h0V18.89h0c0-1.42,0.42-2.77,1.14-3.9h0c0.14-0.23,0.3-0.45,0.46-0.65c0.17-0.22,0.35-0.42,0.52-0.59 l0.02-0.02c0.54-0.54,1.18-1,1.89-1.36l0.03-0.01l0.35-0.16l0.04-0.02c0.86-0.37,1.81-0.58,2.81-0.58l0,0h0.04v0 c2.01,0,3.84,0.82,5.16,2.14c0.54,0.54,1,1.18,1.36,1.88l0.01,0.03L31.28,16l0.02,0.04c0.37,0.86,0.58,1.82,0.58,2.81l0,0v0.04 v37.3v1.2H30.68L30.68,57.4z"/></svg>`;
      } else if (this.autoplayMode === 'auto') {
        // Simple play icon
        svgContainer.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M8 5v14l11-7z"/>
        </svg>`;
      } else if (this.autoplayMode === 'fast') {
        // Double play icon
        svgContainer.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M4 5v14l8-7z"/>
          <path d="M12 5v14l8-7z"/>
        </svg>`;
      }
    }
  },

  /**
   * Generates a pizza-shaped SVG for the group avatar
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
    const fontSizes = {
      2: 14,
      3: 12,
      4: 11,
      5: 10,
      6: 9
    };
    const fontSize = fontSizes[n] || 10;

    // Unique ID for clipPath (avoids conflicts if multiple groups)
    const clipId = `circleClip_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`;

    // Circular clip
    svg += `<defs><clipPath id="${clipId}"><circle cx="${center}" cy="${center}" r="${radius}"/></clipPath></defs>`;
    svg += `<g clip-path="url(#${clipId})">`;

    // Draw each slice
    for (let i = 0; i < n; i++) {
      const startAngle = i * anglePerSlice - Math.PI / 2; // Start at the top
      const endAngle = (i + 1) * anglePerSlice - Math.PI / 2;

      // Arc points
      const x1 = center + radius * Math.cos(startAngle);
      const y1 = center + radius * Math.sin(startAngle);
      const x2 = center + radius * Math.cos(endAngle);
      const y2 = center + radius * Math.sin(endAngle);

      // Slice path (from center to arc)
      const largeArc = anglePerSlice > Math.PI ? 1 : 0;
      const pathD = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

      // Dark background for all slices
      svg += `<path d="${pathD}" fill="#2d3748"/>`;

      // Text position (at the center of the slice)
      const midAngle = startAngle + anglePerSlice / 2;
      const textRadius = radius * 0.55;
      const textX = center + textRadius * Math.cos(midAngle);
      const textY = center + textRadius * Math.sin(midAngle);

      // Participant's letter with their assigned color
      const key = participants[i];
      const name = this.keyToName[key] || key;
      const letter = name.charAt(0).toUpperCase();
      const letterColor = this.groupColors[i % this.groupColors.length];

      svg += `<text x="${textX}" y="${textY}" fill="${letterColor}" font-size="${fontSize}" font-weight="700" text-anchor="middle" dominant-baseline="central">${letter}</text>`;
    }

    // Draw separation lines (light on dark background)
    for (let i = 0; i < n; i++) {
      const angle = i * anglePerSlice - Math.PI / 2;
      const x = center + radius * Math.cos(angle);
      const y = center + radius * Math.sin(angle);
      svg += `<line x1="${center}" y1="${center}" x2="${x}" y2="${y}" stroke="#4a5568" stroke-width="1"/>`;
    }

    svg += `</g></svg>`;
    return svg;
  },

  // ===== VIRTUAL SCROLLING FUNCTIONS =====

  /**
   * Estimate the height of a message based on its type
   */
  estimateMessageHeight(msg, index) {
    // Check cache first
    if (this.virtualScroll.cachedHeights[index] !== undefined) {
      return this.virtualScroll.cachedHeights[index];
    }

    const heights = this.virtualScroll.estimatedHeights;
    let height = heights.spacerMin;

    if (msg.deleted) {
      height += 40;
    } else if (msg.kind === 'status') {
      height += heights.status;
    } else if (msg.kind === 'image') {
      height += heights.image;
    } else if (msg.kind === 'video') {
      height += heights.video;
    } else if (msg.kind === 'audio') {
      height += heights.audio;
    } else {
      // Text message - estimate based on length
      const textLength = msg.text ? msg.text.length : 0;
      const lines = Math.ceil(textLength / 40); // ~40 chars per line
      height += Math.max(heights.text, 30 + (lines * 20));
    }

    return height;
  },

  /**
   * Calculate cumulative heights for all messages
   */
  calculateCumulativeHeights(messages) {
    const heights = [];
    let cumulative = 0;

    for (let i = 0; i < messages.length; i++) {
      heights.push(cumulative);
      cumulative += this.estimateMessageHeight(messages[i], i);
    }

    // Store total height
    this.virtualScroll.totalHeight = cumulative;

    return heights;
  },

  /**
   * Calculate which messages should be visible based on scroll position
   */
  calculateVisibleRange(scrollTop, containerHeight, cumulativeHeights, totalMessages) {
    const buffer = this.virtualScroll.buffer;

    // Binary search to find start index
    let start = 0;
    let end = totalMessages - 1;

    while (start < end) {
      const mid = Math.floor((start + end) / 2);
      if (cumulativeHeights[mid] < scrollTop) {
        start = mid + 1;
      } else {
        end = mid;
      }
    }

    // Go back by buffer amount
    start = Math.max(0, start - buffer - 1);

    // Find end index
    const viewportBottom = scrollTop + containerHeight;
    end = start;

    while (end < totalMessages && cumulativeHeights[end] < viewportBottom) {
      end++;
    }

    // Add buffer to end
    end = Math.min(totalMessages, end + buffer);

    return { start, end };
  },

  /**
   * Create a single message DOM element
   */
  createMessageElement(msg, index, conv, previousFrom) {
    // Status message
    if (msg.kind === 'status') {
      const row = document.createElement('div');
      row.className = 'ms-status-row';
      row.dataset.msgIndex = index;

      const badge = document.createElement('div');
      badge.className = 'ms-status-badge';
      badge.textContent = this.replaceVariables(msg.text);

      row.appendChild(badge);
      return { element: row, newPreviousFrom: previousFrom };
    }

    // Regular message
    const isMc = msg.from === 'mc' || msg.speakerKey === 'mc';
    const row = document.createElement('div');
    row.dataset.msgIndex = index;

    let classes = 'ms-msg ' + (isMc ? 'ms-msg--mc' : 'ms-msg--npc');

    const currentSpeaker = msg.speakerKey || msg.from;
    const isFirstOfSeries = currentSpeaker !== previousFrom;
    if (isFirstOfSeries) {
      classes += ' ms-msg--first';
    }

    row.className = classes;

    // Group avatar handling
    if (conv.isGroup && !isMc && msg.speakerKey) {
      if (isFirstOfSeries) {
        const avatarPath = this.avatarsByKey[msg.speakerKey];
        if (avatarPath) {
          const avatarDiv = document.createElement('div');
          avatarDiv.className = 'ms-msg-avatar';
          const avatarImg = document.createElement('img');
          avatarImg.src = avatarPath;
          avatarImg.alt = this.keyToName[msg.speakerKey] || msg.speakerKey;
          avatarImg.style.cursor = 'pointer';
          avatarImg.addEventListener('click', () => {
            this.openLightbox(avatarPath, 'avatar');
          });
          avatarDiv.appendChild(avatarImg);
          row.appendChild(avatarDiv);
        }
      } else {
        const spacer = document.createElement('div');
        spacer.className = 'ms-msg-avatar-spacer';
        row.appendChild(spacer);
      }
    }

    const bubble = document.createElement('div');
    bubble.className = 'ms-msg-bubble';

    // Group speaker name
    if (conv.isGroup && !isMc && msg.speakerKey && isFirstOfSeries) {
      const speakerName = this.keyToName[msg.speakerKey] || msg.speakerKey;
      const speakerColor = conv.participantColors[msg.speakerKey] || '#ffffff';
      const speakerAvatar = this.avatarsByKey[msg.speakerKey];

      const nameTag = document.createElement('span');
      nameTag.className = 'ms-msg-speaker';
      nameTag.textContent = speakerName;
      nameTag.style.color = speakerColor;
      if (speakerAvatar) {
        nameTag.style.cursor = 'pointer';
        nameTag.addEventListener('click', () => {
          this.openLightbox(speakerAvatar, 'avatar');
        });
      }
      bubble.appendChild(nameTag);
    }

    // Deleted message
    if (msg.deleted) {
      bubble.classList.add('ms-msg-bubble--deleted');
      const deletedText = document.createElement('em');
      deletedText.textContent = 'Message deleted';
      bubble.appendChild(deletedText);
      row.appendChild(bubble);
      return { element: row, newPreviousFrom: currentSpeaker };
    }

    // Content based on type
    if (msg.kind === 'image') {
      bubble.classList.add('ms-msg-bubble--image');
      const img = document.createElement('img');
      const picsBasePath = msg.parentDir
        ? `${this.storyPath}/talks/${msg.parentDir}/pics`
        : `${this.storyPath}/talks/pics`;
      const imageSrc = this.getCacheBustedUrl(`${picsBasePath}/${msg.image}`);
      img.src = imageSrc;
      img.alt = 'Image';
      img.className = 'ms-msg-image';
      img.style.cursor = 'pointer';
      img.addEventListener('click', () => {
        this.openLightbox(imageSrc, 'image');
      });
      img.addEventListener('load', () => {
        // Cache actual height
        this.virtualScroll.cachedHeights[index] = row.offsetHeight + 8;
      });
      bubble.appendChild(img);
    } else if (msg.kind === 'video') {
      bubble.classList.add('ms-msg-bubble--video');
      const videoContainer = document.createElement('div');
      videoContainer.className = 'ms-msg-video-container';

      const video = document.createElement('video');
      const vidsBasePath = msg.parentDir
        ? `${this.storyPath}/talks/${msg.parentDir}/vids`
        : `${this.storyPath}/talks/vids`;
      const videoSrc = this.getCacheBustedUrl(`${vidsBasePath}/${msg.video}`);
      video.src = videoSrc;
      video.className = 'ms-msg-video';
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'metadata';

      const playOverlay = document.createElement('div');
      playOverlay.className = 'ms-msg-video-play-overlay';
      playOverlay.innerHTML = '▶';

      const durationEl = document.createElement('div');
      durationEl.className = 'ms-msg-video-duration';
      durationEl.textContent = '--:--';

      video.addEventListener('loadedmetadata', () => {
        const duration = video.duration;
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        durationEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        // Seek to a better frame for thumbnail (avoid black first frame)
        // Use 0.5s or 10% of duration, whichever is smaller
        const thumbnailTime = Math.min(0.5, duration * 0.1);
        if (thumbnailTime > 0 && duration > 0) {
          video.currentTime = thumbnailTime;
        }
      });

      videoContainer.appendChild(video);
      videoContainer.appendChild(playOverlay);
      videoContainer.appendChild(durationEl);

      videoContainer.style.cursor = 'pointer';
      videoContainer.addEventListener('click', () => {
        this.openLightbox(videoSrc, 'video');
      });

      bubble.appendChild(videoContainer);
    } else if (msg.kind === 'audio') {
      bubble.classList.add('ms-msg-bubble--audio');

      const audioContainer = document.createElement('div');
      audioContainer.className = 'ms-msg-audio-container';

      const speakerKey = msg.speakerKey || msg.from;
      const isMcAudio = speakerKey === 'mc';
      if (!conv.isGroup && !isMcAudio) {
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'ms-msg-audio-avatar';
        const avatarPath = this.avatarsByKey[speakerKey];
        if (avatarPath) {
          const avatarImg = document.createElement('img');
          avatarImg.src = avatarPath;
          avatarImg.alt = this.keyToName[speakerKey] || speakerKey;
          avatarImg.style.cursor = 'pointer';
          avatarImg.addEventListener('click', () => {
            this.openLightbox(avatarPath, 'avatar');
          });
          avatarDiv.appendChild(avatarImg);
          audioContainer.appendChild(avatarDiv);
        }
      }

      const playBtn = document.createElement('button');
      playBtn.className = 'ms-msg-audio-play ms-msg-audio-play--paused';
      playBtn.type = 'button';
      playBtn.innerHTML = '▶';

      const progressContainer = document.createElement('div');
      progressContainer.className = 'ms-msg-audio-progress';
      const progressBar = document.createElement('div');
      progressBar.className = 'ms-msg-audio-progress-bar';
      progressContainer.appendChild(progressBar);

      const durationEl = document.createElement('div');
      durationEl.className = 'ms-msg-audio-duration';
      durationEl.textContent = '--:--';

      const audio = document.createElement('audio');
      const audioBasePath = msg.parentDir
        ? `${this.storyPath}/talks/${msg.parentDir}/audio`
        : `${this.storyPath}/talks/audio`;
      const audioSrc = this.getCacheBustedUrl(`${audioBasePath}/${msg.audio}`);
      audio.src = audioSrc;
      audio.preload = 'metadata';
      audio.volume = this.getMediaVolume();
      if (window.isGlobalMuted && window.isGlobalMuted()) {
        audio.muted = true;
      }

      this.activeAudioElements.push(audio);

      audio.addEventListener('loadedmetadata', () => {
        const duration = audio.duration;
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        durationEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      });

      audio.addEventListener('timeupdate', () => {
        if (audio.duration) {
          const percent = (audio.currentTime / audio.duration) * 100;
          progressBar.style.width = percent + '%';
        }
      });

      audio.addEventListener('ended', () => {
        playBtn.innerHTML = '▶';
        playBtn.classList.add('ms-msg-audio-play--paused');
        progressBar.style.width = '0%';
      });

      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (audio.paused) {
          audio.play();
          playBtn.innerHTML = '❚❚';
          playBtn.classList.remove('ms-msg-audio-play--paused');
        } else {
          audio.pause();
          playBtn.innerHTML = '▶';
          playBtn.classList.add('ms-msg-audio-play--paused');
        }
      });

      progressContainer.addEventListener('click', (e) => {
        e.stopPropagation();
        const rect = progressContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percent = clickX / rect.width;
        audio.currentTime = percent * audio.duration;
      });

      audioContainer.appendChild(playBtn);
      audioContainer.appendChild(progressContainer);
      audioContainer.appendChild(durationEl);
      audioContainer.appendChild(audio);

      bubble.appendChild(audioContainer);
    } else {
      // Text message
      const textNode = document.createTextNode(this.replaceVariables(msg.text));
      bubble.appendChild(textNode);
    }

    row.appendChild(bubble);
    return { element: row, newPreviousFrom: currentSpeaker };
  },

  /**
   * Handle scroll event for virtual scrolling
   */
  onVirtualScroll() {
    if (!this.virtualScroll.enabled) return;
    if (!this.chatMessagesEl) return;
    // Don't update during scrollToBottom to prevent race conditions
    if (this.virtualScroll.isScrollingToBottom) return;

    const conv = this.conversationsByKey[this.selectedKey];
    if (!conv || !conv.playedMessages || conv.playedMessages.length === 0) return;

    // Debounce scroll updates
    if (this.virtualScroll.scrollTimeout) {
      clearTimeout(this.virtualScroll.scrollTimeout);
    }

    this.virtualScroll.scrollTimeout = setTimeout(() => {
      this.updateVirtualScroll(conv);
    }, 16); // ~60fps
  },

  /**
   * Update virtual scroll - render only visible messages
   */
  updateVirtualScroll(conv) {
    if (!conv.playedMessages || conv.playedMessages.length === 0) return;

    const scrollTop = this.chatMessagesEl.scrollTop;
    const containerHeight = this.chatMessagesEl.clientHeight;

    // Calculate cumulative heights
    const cumulativeHeights = this.calculateCumulativeHeights(conv.playedMessages);

    // Calculate new visible range
    const newRange = this.calculateVisibleRange(
      scrollTop,
      containerHeight,
      cumulativeHeights,
      conv.playedMessages.length
    );

    // Check if range changed
    const currentRange = this.virtualScroll.visibleRange;
    if (newRange.start === currentRange.start && newRange.end === currentRange.end) {
      return; // No change needed
    }

    // Update range
    this.virtualScroll.visibleRange = newRange;

    // Re-render messages
    this.renderVirtualMessages(conv, cumulativeHeights, false);
  },

  /**
   * Render messages using virtual scrolling
   */
  renderVirtualMessages(conv, cumulativeHeights, scrollToEnd = true) {
    if (!this.chatMessagesEl) return;

    const messages = conv.playedMessages;
    if (!messages || messages.length === 0) {
      this.chatMessagesEl.innerHTML = '';
      return;
    }

    // For small message counts, skip virtualization
    if (messages.length < 100) {
      this.virtualScroll.enabled = false;
      return false; // Signal to use normal rendering
    }

    this.virtualScroll.enabled = true;

    const { start, end } = this.virtualScroll.visibleRange;
    const totalHeight = this.virtualScroll.totalHeight;

    // Calculate spacer heights
    const topSpacerHeight = start > 0 ? cumulativeHeights[start] : 0;
    const bottomSpacerHeight = end < messages.length
      ? totalHeight - cumulativeHeights[end]
      : 0;

    // Clear and rebuild
    this.chatMessagesEl.innerHTML = '';

    // Top spacer
    if (topSpacerHeight > 0) {
      const topSpacer = document.createElement('div');
      topSpacer.className = 'ms-virtual-spacer ms-virtual-spacer--top';
      topSpacer.style.height = topSpacerHeight + 'px';
      this.chatMessagesEl.appendChild(topSpacer);
    }

    // Render visible messages
    let previousFrom = null;

    // Determine previousFrom from message before start
    if (start > 0) {
      const prevMsg = messages[start - 1];
      previousFrom = prevMsg.speakerKey || prevMsg.from;
    }

    for (let i = start; i < end; i++) {
      const msg = messages[i];
      const { element, newPreviousFrom } = this.createMessageElement(msg, i, conv, previousFrom);
      this.chatMessagesEl.appendChild(element);
      previousFrom = newPreviousFrom;
    }

    // Bottom spacer
    if (bottomSpacerHeight > 0) {
      const bottomSpacer = document.createElement('div');
      bottomSpacer.className = 'ms-virtual-spacer ms-virtual-spacer--bottom';
      bottomSpacer.style.height = bottomSpacerHeight + 'px';
      this.chatMessagesEl.appendChild(bottomSpacer);
    }

    // Scroll to bottom if requested (for new messages)
    if (scrollToEnd) {
      this.scrollToBottom();
    }

    return true; // Signal virtualization was used
  },

  /**
   * Initialize virtual scroll listener
   */
  initVirtualScroll() {
    if (!this.chatMessagesEl) return;

    // Remove existing listener if any
    this.chatMessagesEl.removeEventListener('scroll', this._boundVirtualScroll);

    // Bind and add listener
    this._boundVirtualScroll = this.onVirtualScroll.bind(this);
    this.chatMessagesEl.addEventListener('scroll', this._boundVirtualScroll, { passive: true });
  },

  /**
   * Reset virtual scroll state (call when changing conversation)
   */
  resetVirtualScroll() {
    this.virtualScroll.cachedHeights = {};
    this.virtualScroll.visibleRange = { start: 0, end: 50 };
    this.virtualScroll.totalHeight = 0;
    this.virtualScroll.scrollTop = 0;
  },

  // Robust scroll to bottom with race condition protection
  scrollToBottom() {
    if (!this.chatMessagesEl) return;

    // Block virtual scroll updates during our scroll operation
    this.virtualScroll.isScrollingToBottom = true;

    // Capture current render version to detect if a new render started
    const currentRenderVersion = this.renderVersion;

    const doScroll = () => {
      // Only scroll if render version hasn't changed (no new render started)
      if (this.renderVersion !== currentRenderVersion || !this.chatMessagesEl) {
        return;
      }
      // Force scroll to absolute bottom
      this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
    };

    // Immediate scroll attempt
    doScroll();

    // Use requestAnimationFrame to ensure DOM is ready
    this.pendingScrollRAF = requestAnimationFrame(() => {
      if (this.renderVersion !== currentRenderVersion) {
        this.virtualScroll.isScrollingToBottom = false;
        return;
      }

      // Force a reflow to ensure layout is complete
      void this.chatMessagesEl.offsetHeight;

      doScroll();

      // Multiple scroll attempts to handle async content loading
      this.pendingScrollTimeout = setTimeout(() => {
        if (this.renderVersion === currentRenderVersion) {
          doScroll();
          // One more attempt after another delay
          setTimeout(() => {
            if (this.renderVersion === currentRenderVersion) {
              doScroll();
            }
            // Unblock virtual scroll after all scroll attempts are done
            this.virtualScroll.isScrollingToBottom = false;
          }, 200);
        } else {
          this.virtualScroll.isScrollingToBottom = false;
        }
      }, 100);
    });
  },

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  onClose() {
    // Later if you want to reset something when leaving the app
  },

  /**
   * Gets media volume from Settings (with general volume)
   */
  getMediaVolume() {
    let mediaVolume = 0.5; // default value
    const saved = localStorage.getItem('studioSettings');
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        if (typeof settings.mediaVolume === 'number') {
          mediaVolume = settings.mediaVolume / 100;
        }
      } catch (e) {}
    }

    // Apply general volume as a multiplier
    const generalVolume = window.getGeneralVolume ? window.getGeneralVolume() : 1.0;
    return mediaVolume * generalVolume;
  },

  /**
   * Sets media volume (0 to 1)
   */
  setMediaVolume(value) {
    this.mediaVolume = Math.max(0, Math.min(1, value));

    // Update all audio elements (active or not)
    this.activeAudioElements.forEach(audio => {
      if (audio) {
        audio.volume = this.mediaVolume;
      }
    });

    // Update lightbox video if it exists
    if (this.lightboxEl) {
      const video = this.lightboxEl.querySelector('.ms-lightbox-video');
      if (video) {
        video.volume = this.mediaVolume;
      }
    }
  },

  /**
   * Sets volume from a percentage (0 to 100)
   */
  setMediaVolumePercent(percent) {
    this.setMediaVolume(percent / 100);
  }
};
