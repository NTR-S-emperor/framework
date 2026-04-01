// onlyslut/templates.js

window.OnlySlutTemplates = {
    // "Home" button at top of sidebar
    homeButton(isActive = false) {
        const activeClass = isActive ? ' os-user--active' : '';
        return `
            <button class="os-user os-user-home${activeClass}" data-user="all">
                <div class="os-user-avatar">
                    <img src="assets/onlyslut/home_onlyslut.svg" alt="">
                </div>
                <span class="os-user-name" data-i18n="instapics.home">Home</span>
            </button>
        `;
    },

    // Detect #hashtag and @mention and color them blue
    highlightKeywords(text) {
        if (!text) return "";

        return text
            // hashtags (#word, supports accented/unicode letters)
            .replace(/#([\w\p{L}]+)/gu, `<span class="os-tag">#$1</span>`)
            // mentions (@name, supports accented/unicode letters)
            .replace(/@([\w\p{L}]+)/gu, `<span class="os-mention">@$1</span>`);
    },

    userBubble(user, isActive = false) {
        const activeClass = isActive ? ' os-user--active' : '';
        return `
            <button class="os-user${activeClass}" data-user="${user.id}">
                <div class="os-user-avatar">
                    <img src="${user.avatar}" alt="">
                </div>
                <span class="os-user-name">${user.name}</span>
            </button>
        `;
    },

    /**
     * Recursive rendering of a comment + its replies
     * - level: 0 = root, 1 = reply, 2 = sub-reply
     * - counter / max: used for PREVIEW (limit number of lines)
     *   If counter is null → no limit (full version).
     */
    renderComment(comment, level = 0, counter = null, max = Infinity) {
        // Limitation for "preview" view (feed)
        if (counter) {
            if (counter.value >= max) {
                return "";
            }
            counter.value++;
        }

        const textHtml = this.highlightKeywords(comment.text || "");
        const indentClass =
            level === 0 ? "os-comment-root" :
            level === 1 ? "os-comment-reply" :
                          "os-comment-subreply";

        const likeCount = comment.likes || 0;
        const likeCountHtml = likeCount > 0
            ? `<span class="os-comment-like-count">${likeCount}</span>`
            : `<span class="os-comment-like-count"></span>`;

        let html = `
            <div class="os-comment ${indentClass}">
                <p>
                    <strong>${comment.author}</strong>
                    <button type="button" class="os-comment-like">
                        <img class="os-comment-like-icon" src="assets/onlyslut/empty_heart.svg" alt="Likes">
                        ${likeCountHtml}
                    </button>
                    <span class="os-comment-text">${textHtml}</span>
                </p>
            </div>
        `;

        if (comment.replies && comment.replies.length) {
            const childrenHtml = comment.replies
                .map(child => this.renderComment(child, level + 1, counter, max))
                .join("");

            if (childrenHtml.trim()) {
                html += `
                    <div class="os-comment-children">
                        ${childrenHtml}
                    </div>
                `;
            }
        }

        return html;
    },

    // ---- Comments block: "preview" version (max 4 lines) ----
    buildCommentsPreview(post) {
        const total = post.commentCount ?? (post.comments ? post.comments.length : 0);
        if (!post.comments || !post.comments.length) return "";

        const maxLines = 5;

        // If we have 4 lines or less → display everything normally
        if (total <= maxLines) {
            const full = post.comments
                .map(c => this.renderComment(c, 0, null, Infinity))
                .join("");
            return `
                <div class="os-comments">
                    ${full}
                </div>
            `;
        }

        // Otherwise: limit to 4 "lines" of comments (comment + replies)
        const counter = { value: 0 };
        const previewHtml = post.comments
            .map(c => this.renderComment(c, 0, counter, maxLines))
            .join("");

        return `
            <div class="os-comments">
                ${previewHtml}
                <button type="button"
                        class="os-comments-more"
                        data-post-index="${post.index}"
                        data-i18n="instapics.seemore">
                    See more...
                </button>
            </div>
        `;
    },

    // ---- Comments block: full version (modal) ----
    buildCommentsFull(post) {
        if (!post.comments || !post.comments.length) return "";

        const full = post.comments
            .map(c => this.renderComment(c, 0, null, Infinity))
            .join("");

        return `
            <div class="os-comments os-comments-full">
                ${full}
            </div>
        `;
    },

    // Post card in FEED (comments preview)
    postCard(post, user) {
        // If image: display image + text in footer
        // If no image: display text instead of image
        let mediaHtml;
        let captionInFooter;

        if (post.image) {
            mediaHtml = `<div class="os-photo-container"><img class="photo os-photo-clickable" src="${post.image}" alt="" data-post-index="${post.index}"></div>`;
            captionInFooter = post.text ? `<p class="caption">${this.highlightKeywords(post.text)}</p>` : "";
        } else {
            mediaHtml = post.text ? `<div class="os-text-placeholder"><p class="caption">${this.highlightKeywords(post.text)}</p></div>` : "";
            captionInFooter = "";
        }

        const noImageClass = post.image ? "" : " os-post--no-image";
        const commentsBlock = this.buildCommentsPreview(post);

        const likeCount = post.likes ?? 0;
        const commentCount = post.commentCount ?? (post.comments ? post.comments.length : 0);

        // Check if GF liked this post (for spy mode)
        const gfLikedClass = post.gfLiked ? ' liked' : '';
        const heartIcon = post.gfLiked ? 'assets/onlyslut/filled_heart.svg' : 'assets/onlyslut/empty_heart.svg';

        return `
            <article class="os-post${noImageClass}">
                <header>
                    <img class="avatar os-avatar-clickable" src="${user.avatar}" alt="" data-avatar="${user.avatar}">
                    <span>${user.name}</span>
                </header>

                ${mediaHtml}

                <footer>
                    <div class="os-actions">
                        <div class="os-action os-action-likes${gfLikedClass}">
                            <img class="os-action-icon" src="${heartIcon}" alt="Likes">
                            <span class="os-action-count">${likeCount}</span>
                        </div>
                        <div class="os-action os-action-comments">
                            <img class="os-action-icon" src="assets/onlyslut/comments.svg" alt="Comments">
                            <span class="os-action-count">${commentCount}</span>
                        </div>
                    </div>

                    ${captionInFooter}

                    ${commentsBlock}
                </footer>
            </article>
        `;
    },

    // Post card in MODAL (all comments)
    fullPostCard(post, user) {
        // If image: display image + text in footer
        // If no image: display text instead of image
        let mediaHtml;
        let captionInFooter;

        if (post.image) {
            mediaHtml = `<div class="os-photo-container-full"><img class="photo" src="${post.image}" alt=""></div>`;
            captionInFooter = post.text ? `<p class="caption">${this.highlightKeywords(post.text)}</p>` : "";
        } else {
            mediaHtml = post.text ? `<div class="os-text-placeholder"><p class="caption">${this.highlightKeywords(post.text)}</p></div>` : "";
            captionInFooter = "";
        }

        const noImageClass = post.image ? "" : " os-post--no-image";
        const commentsBlock = this.buildCommentsFull(post);

        const likeCount = post.likes ?? 0;
        const commentCount = post.commentCount ?? (post.comments ? post.comments.length : 0);

        // Check if GF liked this post (for spy mode)
        const gfLikedClass = post.gfLiked ? ' liked' : '';
        const heartIcon = post.gfLiked ? 'assets/onlyslut/filled_heart.svg' : 'assets/onlyslut/empty_heart.svg';

        return `
            <article class="os-post os-post-full${noImageClass}">
                <header>
                    <img class="avatar os-avatar-clickable" src="${user.avatar}" alt="" data-avatar="${user.avatar}">
                    <span>${user.name}</span>
                </header>

                ${mediaHtml}

                <footer>
                    <div class="os-actions">
                        <div class="os-action os-action-likes${gfLikedClass}">
                            <img class="os-action-icon" src="${heartIcon}" alt="Likes">
                            <span class="os-action-count">${likeCount}</span>
                        </div>
                        <div class="os-action os-action-comments">
                            <img class="os-action-icon" src="assets/onlyslut/comments.svg" alt="Comments">
                            <span class="os-action-count">${commentCount}</span>
                        </div>
                    </div>

                    ${captionInFooter}

                    ${commentsBlock}
                </footer>
            </article>
        `;
    }
};
