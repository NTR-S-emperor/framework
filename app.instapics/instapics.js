// assets/instapics/instapics.js

window.InstaPics = {
    root: null,
    filterUser: null,
    storyPath: null,     // ex: "stories/1-Histoire 1/instapics"

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
    userPageStart: 0,        // index of the 1st visible user (in this.users)
    maxUsersPerPage: 3,      // in addition to the Home button

    /**
     * Initialize InstaPics for a given story.
     * storyPath = path to the story's "instapics" folder, web-side
     * ex: "stories/1-Histoire 1/instapics"
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
    // MOUNT + EVENTS
    // ---------------------------------------------------------------------

    mount() {
        if (this.root) return;

        const container =
            document.getElementById("instapicsScreen") ||
            document.querySelector(".phone-page-home");

        if (!container) {
            return;
        }

        // ----- Main app content (without the modal) -----
        this.root = document.createElement("div");
        this.root.id = "instapics-app";
        this.root.innerHTML = `
            <div class="ip-users-row">
                <button class="ip-users-nav ip-users-nav-left" data-dir="left" aria-label="Previous users">‹</button>
                <div class="ip-users"></div>
                <button class="ip-users-nav ip-users-nav-right" data-dir="right" aria-label="Next users">›</button>
            </div>
            <div class="ip-feed"></div>
        `;

        container.appendChild(this.root);

        // ----- Global modal, attached to .phone-frame -----
        let modal = document.querySelector(".ip-modal");
        if (!modal) {
            const phoneFrame = document.querySelector(".phone-frame");
            if (!phoneFrame) {
                return;
            }

            modal = document.createElement("div");
            modal.className = "ip-modal hidden";
            modal.innerHTML = `
                <div class="ip-modal-backdrop"></div>
                <div class="ip-modal-dialog">
                    <button class="ip-modal-close" type="button" aria-label="Close">×</button>
                    <div class="ip-modal-content"></div>
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
            // --- Left / right arrows ---
            const navBtn = e.target.closest(".ip-users-nav");
            if (navBtn) {
                const dir = navBtn.dataset.dir;
                const delta = dir === "left" ? -1 : 1;
                this.changeUserPage(delta);
                return;
            }

            // --- Click on a profile or on Home ---
            const userBtn = e.target.closest(".ip-user");
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

            // --- Like on a post ---
            const likePostBtn = e.target.closest(".ip-action-likes");
            if (likePostBtn) {
                const icon = likePostBtn.querySelector(".ip-action-icon");
                const countSpan = likePostBtn.querySelector(".ip-action-count");
                if (!icon || !countSpan) return;

                let count = parseInt(countSpan.textContent.trim() || "0", 10);
                if (Number.isNaN(count)) count = 0;

                if (likePostBtn.classList.contains("liked")) {
                    likePostBtn.classList.remove("liked");
                    icon.src = "assets/instapics/empty_heart.svg";
                    count = Math.max(0, count - 1);
                } else {
                    likePostBtn.classList.add("liked");
                    icon.src = "assets/instapics/filled_heart.svg";
                    count = count + 1;
                }

                countSpan.textContent = count;
                return;
            }

            // --- Like on a comment ---
            const likeCommentBtn = e.target.closest(".ip-comment-like");
            if (likeCommentBtn) {
                const icon = likeCommentBtn.querySelector(".ip-comment-like-icon");
                const countSpan = likeCommentBtn.querySelector(".ip-comment-like-count");
                if (!icon || !countSpan) return;

                let count = parseInt(countSpan.textContent.trim() || "0", 10);
                if (Number.isNaN(count)) count = 0;

                if (likeCommentBtn.classList.contains("liked")) {
                    likeCommentBtn.classList.remove("liked");
                    icon.src = "assets/instapics/empty_heart.svg";
                    count = Math.max(0, count - 1);
                } else {
                    likeCommentBtn.classList.add("liked");
                    icon.src = "assets/instapics/comments_heart.svg";
                    count = count + 1;
                }

                countSpan.textContent = count || "";
                return;
            }

            // --- See more... (open the modal) ---
            const moreBtn = e.target.closest(".ip-comments-more");
            if (moreBtn) {
                const postIndex = parseInt(moreBtn.dataset.postIndex, 10);
                this.openPostModal(postIndex);
                return;
            }

            // --- Click on the image (open the modal) ---
            const photoBtn = e.target.closest(".ip-photo-clickable");
            if (photoBtn) {
                const postIndex = parseInt(photoBtn.dataset.postIndex, 10);
                this.openPostModal(postIndex);
                return;
            }

            // --- Click on post avatar (display large) ---
            const avatarBtn = e.target.closest(".ip-avatar-clickable");
            if (avatarBtn) {
                const avatarUrl = avatarBtn.dataset.avatar;
                if (avatarUrl) {
                    this.openAvatarModal(avatarUrl);
                }
                return;
            }

            // --- Close modal (cross or backdrop) ---
            const closeBtn = e.target.closest(".ip-modal-close");
            const backdrop = e.target.closest(".ip-modal-backdrop");
            if (closeBtn || backdrop) {
                this.closeModal();
                return;
            }
        });

        // ESCAPE: closes the pop-up if it's open
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
        const ctn = this.root.querySelector(".ip-users");
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

        const home = window.InstaPicsTemplates.homeButton(this.filterUser === null);
        const usersHtml = visibleUsers
            .map(u => window.InstaPicsTemplates.userBubble(u, this.filterUser === u.id))
            .join("");

        ctn.innerHTML = home + usersHtml;

        const leftBtn = this.root.querySelector(".ip-users-nav-left");
        const rightBtn = this.root.querySelector(".ip-users-nav-right");

        if (leftBtn) {
            leftBtn.disabled = (this.userPageStart === 0);
        }
        if (rightBtn) {
            rightBtn.disabled = (this.userPageStart >= maxStart);
        }
    },

    renderFeed() {
        if (!this.root) return;
        const ctn = this.root.querySelector(".ip-feed");
        if (!ctn) return;

        let posts = this.posts.slice();

        // 1.txt = oldest, display most recent first
        posts.sort((a, b) => b.index - a.index);

        if (this.filterUser) {
            posts = posts.filter(p => p.userId === this.filterUser);
        }

        // If no posts, display a message
        if (posts.length === 0) {
            ctn.innerHTML = `<div class="ip-empty-message">${window.t('instapics.noposts')}</div>`;
            return;
        }

        ctn.innerHTML = posts.map(post => {
            const user = this.users.find(u => u.id === post.userId);
            if (!user) return "";
            return window.InstaPicsTemplates.postCard(post, user);
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
        const modal = document.querySelector('.ip-modal');
        return !!(modal && !modal.classList.contains('hidden'));
    },

    closeModal() {
        const modal = document.querySelector('.ip-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },

    openPostModal(postIndex) {
        const post = this.posts.find(p => p.index === postIndex);
        if (!post) return;

        const user = this.users.find(u => u.id === post.userId);
        if (!user) return;

        const modal = document.querySelector(".ip-modal");
        const content = modal?.querySelector(".ip-modal-content");
        if (!modal || !content) return;

        content.innerHTML = window.InstaPicsTemplates.fullPostCard(post, user);
        modal.classList.remove("hidden");
    },

    openAvatarModal(avatarUrl) {
        const modal = document.querySelector(".ip-modal");
        const content = modal?.querySelector(".ip-modal-content");
        if (!modal || !content) return;

        content.innerHTML = `
            <div class="ip-avatar-modal">
                <img class="ip-avatar-large" src="${avatarUrl}" alt="Avatar">
            </div>
        `;
        modal.classList.remove("hidden");
    },

    // ---------------------------------------------------------------------
    // LOADING FILES
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

        // Get the list of unlocked posts from Messenger
        const unlockedPosts = window.Messenger && typeof window.Messenger.getUnlockedInstaPosts === 'function'
            ? window.Messenger.getUnlockedInstaPosts()
            : [];

        // If no post is unlocked, load nothing
        if (unlockedPosts.length === 0) {
            return posts;
        }

        // Load each unlocked post (supports subfolders)
        for (let i = 0; i < unlockedPosts.length; i++) {
            const filePath = unlockedPosts[i]; // ex: "1.txt" ou "lovepath/chapter 1/1.txt"
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

        // Base path for images (relative to the post folder)
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
                //   Robert 3 = That's true!
                //   Osman 0 "comments.replied" = No...
                //   Naruto 2 "replied.replied" = Shut up
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
                    // Main comment
                    const comment = {
                        author: rawAuthor,
                        text,
                        likes: likeCount,
                        replies: []
                    };
                    post.comments.push(comment);
                    lastRoot = comment;
                    lastReply = null;
                } else if (tag === "comments.replied") {
                    const reply = {
                        author: rawAuthor,
                        text,
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
                        author: rawAuthor,
                        text,
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

    onOpen() {},
    onClose() {}
};
