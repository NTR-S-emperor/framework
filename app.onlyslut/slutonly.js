// assets/onlyslut/onlyslut.js

window.OnlySlut = {
    root: null,
    filterUser: null,
    storyPath: null,     // e.g.: "stories/1-Histoire 1/onlyslut"

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
    users: [],
    posts: [],
    loading: false,
    eventsAttached: false,   // prevents duplicate listeners

    // profile pagination (carousel)
    userPageStart: 0,        // index of first visible user (in this.users)
    maxUsersPerPage: 3,      // in addition to Home button

    /**
     * Initialize SlutOnly for a given story.
     * storyPath = path to the story's "slutonly" folder, on the web side
     * e.g.: "stories/1-Histoire 1/onlyslut"
     */
    async init(storyPath) {
        if (storyPath) {
            this.storyPath = storyPath;
        }

        if (!this.storyPath) {
            return;
        }

        this.mount();
        this.attachEvents();
        await this.reloadData();
    },

    /**
     * If you change story while the app is already open.
     */
    async setStory(storyPath) {
        if (this.storyPath === storyPath) return;
        this.storyPath = storyPath;
        this.filterUser = null;
        this.userPageStart = 0;
        await this.reloadData();
    },

    /**
     * Called by Messenger when a new post is unlocked.
     * Reloads data if the app is initialized.
     */
    async onPostUnlocked(filename) {
        if (this.storyPath && this.root) {
            await this.reloadData();
        }
    },

    async reloadData() {
        if (!this.storyPath) return;
        this.loading = true;

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

            // --- SORT USERS BY MOST RECENT POST ---
            const latestPerUser = new Map();
            for (const p of this.posts) {
                const prev = latestPerUser.get(p.userId);
                if (prev == null || p.index > prev) {
                    latestPerUser.set(p.userId, p.index);
                }
            }

            this.users.sort((a, b) => {
                const la = latestPerUser.get(a.id) ?? -Infinity;
                const lb = latestPerUser.get(b.id) ?? -Infinity;
                return lb - la; // most recent on the left
            });

            this.userPageStart = 0;

            this.renderUsers();
            this.renderFeed();
        } catch (e) {
        } finally {
            this.loading = false;
        }
    },

    // ---------------------------------------------------------------------
    // MOUNTING + EVENTS
    // ---------------------------------------------------------------------

    mount() {
        if (this.root) return;

        const container =
            document.getElementById("onlyslutScreen") ||
            document.querySelector(".phone-page-home");

        if (!container) {
            return;
        }

        // ----- Main app content (without the modal) -----
        this.root = document.createElement("div");
        this.root.id = "onlyslut-app";
        this.root.innerHTML = `
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
        `;

        container.appendChild(this.root);

        // ----- Global modal, attached to .phone-frame -----
        let modal = document.querySelector(".os-modal");
        if (!modal) {
            const phoneFrame = document.querySelector(".phone-frame");
            if (!phoneFrame) {
                return;
            }

            modal = document.createElement("div");
            modal.className = "os-modal hidden";
            modal.innerHTML = `
                <div class="os-modal-backdrop"></div>
                <div class="os-modal-dialog">
                    <button class="os-modal-close" type="button" aria-label="Close">×</button>
                    <div class="os-modal-content"></div>
                </div>
            `;

            phoneFrame.appendChild(modal);
        }

        // Listen for language changes to reload content
        window.addEventListener('languageChanged', () => {
            if (this.storyPath) {
                this.reloadData();
            }
        });
    },

    attachEvents() {
        if (this.eventsAttached) return;

        const phoneFrame = document.querySelector('.phone-frame');
        if (!phoneFrame) return;

        phoneFrame.addEventListener("click", (e) => {
            // --- Click on a profile or on Home ---
            const userBtn = e.target.closest(".os-user");
            if (userBtn) {
                const key = userBtn.dataset.user;

                if (key === "all") {
                    this.resetFilter();
                } else {
                    const id = parseInt(key, 10);
                    this.filterUser = (this.filterUser === id) ? null : id;
                    this.renderFeed();
                    this.renderUsers();
                }
                return;
            }

            // --- Like a post ---
            const likePostBtn = e.target.closest(".os-action-likes");
            if (likePostBtn) {
                const icon = likePostBtn.querySelector(".os-action-icon");
                const countSpan = likePostBtn.querySelector(".os-action-count");
                if (!icon || !countSpan) return;

                let count = parseInt(countSpan.textContent.trim() || "0", 10);
                if (Number.isNaN(count)) count = 0;

                if (likePostBtn.classList.contains("liked")) {
                    likePostBtn.classList.remove("liked");
                    icon.src = "assets/onlyslut/empty_heart.svg";
                    count = Math.max(0, count - 1);
                } else {
                    likePostBtn.classList.add("liked");
                    icon.src = "assets/onlyslut/filled_heart.svg";
                    count = count + 1;
                }

                countSpan.textContent = count;
                return;
            }

            // --- Like a comment ---
            const likeCommentBtn = e.target.closest(".os-comment-like");
            if (likeCommentBtn) {
                const icon = likeCommentBtn.querySelector(".os-comment-like-icon");
                const countSpan = likeCommentBtn.querySelector(".os-comment-like-count");
                if (!icon || !countSpan) return;

                let count = parseInt(countSpan.textContent.trim() || "0", 10);
                if (Number.isNaN(count)) count = 0;

                if (likeCommentBtn.classList.contains("liked")) {
                    likeCommentBtn.classList.remove("liked");
                    icon.src = "assets/onlyslut/empty_heart.svg";
                    count = Math.max(0, count - 1);
                } else {
                    likeCommentBtn.classList.add("liked");
                    icon.src = "assets/onlyslut/comments_heart.svg";
                    count = count + 1;
                }

                countSpan.textContent = count || "";
                return;
            }

            // --- See more... (open modal) ---
            const moreBtn = e.target.closest(".os-comments-more");
            if (moreBtn) {
                const postIndex = parseInt(moreBtn.dataset.postIndex, 10);
                this.openPostModal(postIndex);
                return;
            }

            // --- Click on image (open modal) ---
            const photoBtn = e.target.closest(".os-photo-clickable");
            if (photoBtn) {
                const postIndex = parseInt(photoBtn.dataset.postIndex, 10);
                this.openPostModal(postIndex);
                return;
            }

            // --- Click on post avatar (display large) ---
            const avatarBtn = e.target.closest(".os-avatar-clickable");
            if (avatarBtn) {
                const avatarUrl = avatarBtn.dataset.avatar;
                if (avatarUrl) {
                    this.openAvatarModal(avatarUrl);
                }
                return;
            }

            // --- Close modal (X or backdrop) ---
            const closeBtn = e.target.closest(".os-modal-close");
            const backdrop = e.target.closest(".os-modal-backdrop");
            if (closeBtn || backdrop) {
                this.closeModal();
                return;
            }
        });

        // ESCAPE: close the popup if it's open
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' || e.key === 'Esc') {
                if (this.isModalOpen()) {
                    this.closeModal();
                    e.preventDefault();
                }
            }
        });

        this.eventsAttached = true;
    },

    // ---------------------------------------------------------------------
    // RENDER
    // ---------------------------------------------------------------------

    renderUsers() {
        if (!this.root) return;
        const ctn = this.root.querySelector(".os-users");
        if (!ctn) return;

        // Home button + all users in vertical column
        const home = window.OnlySlutTemplates.homeButton(this.filterUser === null);
        const usersHtml = this.users
            .map(u => window.OnlySlutTemplates.userBubble(u, this.filterUser === u.id))
            .join("");

        ctn.innerHTML = home + usersHtml;
    },

    renderFeed() {
        if (!this.root) return;
        const ctn = this.root.querySelector(".os-feed");
        if (!ctn) return;

        let posts = this.posts.slice();

        // 1.txt = oldest, we display most recent first
        posts.sort((a, b) => b.index - a.index);

        if (this.filterUser) {
            posts = posts.filter(p => p.userId === this.filterUser);
        }

        // If no posts, display a message
        if (posts.length === 0) {
            ctn.innerHTML = `<div class="os-empty-message">${window.t('instapics.noposts')}</div>`;
            return;
        }

        ctn.innerHTML = posts.map(post => {
            const user = this.users.find(u => u.id === post.userId);
            if (!user) return "";
            return window.OnlySlutTemplates.postCard(post, user);
        }).join("");
    },

    // ---------------------------------------------------------------------
    // INTERNAL ACTIONS
    // ---------------------------------------------------------------------

    resetFilter() {
        this.filterUser = null;
        this.renderFeed();
        this.renderUsers();
    },

    changeUserPage(delta) {
        this.userPageStart += delta;
        this.renderUsers();
    },

    // ---------------------------------------------------------------------
    // MODAL
    // ---------------------------------------------------------------------

    isModalOpen() {
        const modal = document.querySelector('.os-modal');
        return !!(modal && !modal.classList.contains('hidden'));
    },

    closeModal() {
        const modal = document.querySelector('.os-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },

    openPostModal(postIndex) {
        const post = this.posts.find(p => p.index === postIndex);
        if (!post) return;

        const user = this.users.find(u => u.id === post.userId);
        if (!user) return;

        const modal = document.querySelector(".os-modal");
        const content = modal?.querySelector(".os-modal-content");
        if (!modal || !content) return;

        content.innerHTML = window.OnlySlutTemplates.fullPostCard(post, user);
        modal.classList.remove("hidden");
    },

    openAvatarModal(avatarUrl) {
        const modal = document.querySelector(".os-modal");
        const content = modal?.querySelector(".os-modal-content");
        if (!modal || !content) return;

        content.innerHTML = `
            <div class="os-avatar-modal">
                <img class="os-avatar-large" src="${avatarUrl}" alt="Avatar">
            </div>
        `;
        modal.classList.remove("hidden");
    },

    // ---------------------------------------------------------------------
    // FILE LOADING
    // ---------------------------------------------------------------------

    // Fetch with translation support (file-level fallback)
    translatedFetch(url) {
        if (window.Translations && window.Translations.fetchTranslated) {
            return window.Translations.fetchTranslated(url);
        }
        // Fallback with cache-busting
        return fetch(this.getCacheBustedUrl(url));
    },

    // Fetch with line-level merge (missing lines fall back to default)
    async fetchMergedText(url) {
        if (window.Translations && window.Translations.fetchMergedContent) {
            return window.Translations.fetchMergedContent(url);
        }
        // Fallback with cache-busting
        const res = await fetch(this.getCacheBustedUrl(url));
        return res.ok ? await res.text() : null;
    },

    async loadCharacters() {
        const url = `${this.storyPath}/characters/characters.txt`;
        const res = await this.translatedFetch(url);

        if (!res.ok) {
            return [];
        }

        const txt = await res.text();
        const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

        let id = 1;
        const users = [];

        for (const line of lines) {
            const match = line.match(/^(.+?)\s*\((.+?)\)\s*$/);
            if (!match) continue;

            const name = match[1].trim();
            const file = match[2].trim();

            // Use cache-busting for avatars
            users.push({
                id: id++,
                name,
                avatar: this.getCacheBustedUrl(`${this.storyPath}/characters/avatar/${file}`)
            });
        }

        return users;
    },

    async loadPosts() {
        const posts = [];

        // Get list of unlocked posts from Messenger
        const unlockedPosts = window.Messenger && typeof window.Messenger.getUnlockedSlutOnlyPosts === 'function'
            ? window.Messenger.getUnlockedSlutOnlyPosts()
            : [];

        // If no posts are unlocked, don't load anything
        if (unlockedPosts.length === 0) {
            return posts;
        }

        // Load each unlocked post (supports subfolders)
        for (let i = 0; i < unlockedPosts.length; i++) {
            const filePath = unlockedPosts[i]; // e.g.: "love1.txt" or "lovepath/love1.txt"
            const url = `${this.storyPath}/posts/${filePath}`;
            // Use line-level merge for translations
            const content = await this.fetchMergedText(url);

            if (content === null) {
                continue;
            }
            // Extract parent folder for relative images
            const parentDir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
            const parsed = this.parsePost(content, i + 1, parentDir);
            if (parsed) posts.push(parsed);
        }

        return posts;
    },

    parsePost(content, index, parentDir = '') {
        const lines = content.split(/\r?\n/);

        if (!lines.length) return null;

        const authorName = (lines[0] || "").trim();
        if (!authorName) return null;

        const post = {
            index,
            authorName,
            image: null,
            text: "",
            likes: 0,
            comments: [],      // top-level comments
            commentCount: 0    // total comment lines (including replies)
        };

        let inComments = false;
        let lastRoot = null;
        let lastReply = null;

        // Base path for images (relative to post folder)
        const imagesBasePath = parentDir
            ? `${this.storyPath}/posts/${parentDir}/images`
            : `${this.storyPath}/posts/images`;

        for (let i = 1; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) continue;

            if (!inComments) {
                const lower = line.toLowerCase();

                if (lower.startsWith("image")) {
                    const after = line.split(":")[1];
                    if (after) {
                        const file = after.trim();
                        if (file) {
                            // Use cache-busting for post images
                            post.image = this.getCacheBustedUrl(`${imagesBasePath}/${file}`);
                        }
                    }
                } else if (lower.startsWith("text")) {
                    const after = line.split(":")[1];
                    if (after) {
                        post.text = after.trim();
                    }
                } else if (lower.startsWith("like")) {
                    const after = line.split(":")[1];
                    const n = after ? parseInt(after.trim(), 10) : NaN;
                    if (!Number.isNaN(n)) {
                        post.likes = n;
                    }
                } else if (lower.startsWith("comments")) {
                    inComments = true;
                }
            } else {
                // Possible forms:
                //   Robert 3 = It's true!
                //   Osman 0 "comments.replied" = No...
                //   Naruto 2 "replied.replied" = Shut up
                const match = line.match(/^(.+?)(?:\s+(\d+))?(?:\s+"(comments\.replied|replied\.replied)")?\s*=\s*(.+)$/);
                if (!match) continue;

                const rawAuthor = match[1].trim();
                const likesRaw = match[2] ? match[2].trim() : null;
                const tag = match[3] ? match[3].trim() : null;
                const text = match[4].trim();

                if (!rawAuthor || !text) continue;

                // Apply variable substitution for $mc and $gf
                const author = this.replaceVariables(rawAuthor);
                const commentText = this.replaceVariables(text);

                const likeCount = likesRaw ? parseInt(likesRaw, 10) || 0 : 0;

                post.commentCount++;

                if (!tag) {
                    // Main comment
                    const comment = {
                        author: author,
                        text: commentText,
                        likes: likeCount,
                        replies: []
                    };
                    post.comments.push(comment);
                    lastRoot = comment;
                    lastReply = null;
                } else if (tag === "comments.replied") {
                    const reply = {
                        author: author,
                        text: commentText,
                        likes: likeCount,
                        replies: []
                    };
                    if (lastRoot) {
                        lastRoot.replies.push(reply);
                        lastReply = reply;
                    } else {
                        post.comments.push(reply);
                        lastRoot = reply;
                        lastReply = null;
                    }
                } else if (tag === "replied.replied") {
                    const subReply = {
                        author: author,
                        text: commentText,
                        likes: likeCount,
                        replies: []
                    };
                    if (lastReply) {
                        if (!lastReply.replies) lastReply.replies = [];
                        lastReply.replies.push(subReply);
                    } else if (lastRoot) {
                        if (!lastRoot.replies) lastRoot.replies = [];
                        lastRoot.replies.push(subReply);
                    } else {
                        post.comments.push(subReply);
                    }
                }
            }
        }

        return post;
    },

    // -------------------------------------------------------------------
    // TEXT VARIABLES
    // -------------------------------------------------------------------
    /**
     * Replaces variables in text (e.g.: $gf -> girlfriend's name, $mc -> player's name)
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

    onOpen() {},
    onClose() {}
};
