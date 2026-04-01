// instapics/templates.js

window.InstaPicsTemplates = {
    // "Home" button to the left of profiles
    homeButton(isActive = false) {
        const activeClass = isActive ? ' ip-user--active' : '';
        return `
            <button class="ip-user ip-user-home${activeClass}" data-user="all">
                <img src="assets/instapics/home_insta.svg" alt="">
                <span data-i18n="instapics.home">Home</span>
            </button>
        `;
    },

    // Detects #hashtag and @mention and colors them blue
    highlightKeywords(text) {
        if (!text) return "";

        return text
            // hashtags (#word, supports accented/unicode letters)
            .replace(/#([\w\p{L}]+)/gu, `<span class="ip-tag">#$1</span>`)
            // mentions (@name, supports accented/unicode letters)
            .replace(/@([\w\p{L}]+)/gu, `<span class="ip-mention">@$1</span>`);
    },

    userBubble(user, isActive = false) {
        const activeClass = isActive ? ' ip-user--active' : '';
        return `
            <button class="ip-user${activeClass}" data-user="${user.id}">
                <img src="${user.avatar}" alt="">
                <span>${user.name}</span>
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
            level === 0 ? "ip-comment-root" :
            level === 1 ? "ip-comment-reply" :
                          "ip-comment-subreply";

        const likeCount = comment.likes || 0;
        const likeCountHtml = likeCount > 0
            ? `<span class="ip-comment-like-count">${likeCount}</span>`
            : `<span class="ip-comment-like-count"></span>`;

        let html = `
            <div class="ip-comment ${indentClass}">
                <p>
                    <strong>${comment.author}</strong>
                    <button type="button" class="ip-comment-like">
                        <img class="ip-comment-like-icon" src="assets/instapics/empty_heart.svg" alt="Likes">
                        ${likeCountHtml}
                    </button>
                    <span class="ip-comment-text">${textHtml}</span>
                </p>
            </div>
        `;

        if (comment.replies && comment.replies.length) {
            const childrenHtml = comment.replies
                .map(child => this.renderComment(child, level + 1, counter, max))
                .join("");

            if (childrenHtml.trim()) {
                html += `
                    <div class="ip-comment-children">
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
                <div class="ip-comments">
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
            <div class="ip-comments">
                ${previewHtml}
                <button type="button"
                        class="ip-comments-more"
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
            <div class="ip-comments ip-comments-full">
                ${full}
            </div>
        `;
    },

    // Post card in the FEED (comments preview)
    postCard(post, user) {
        // If image: displays the image + text in footer
        // If no image: displays the text instead of the image
        let mediaHtml;
        let captionInFooter;

        if (post.image) {
            mediaHtml = `<div class="ip-photo-container"><img class="photo ip-photo-clickable" src="${post.image}" alt="" data-post-index="${post.index}"></div>`;
            captionInFooter = post.text ? `<p class="caption">${this.highlightKeywords(post.text)}</p>` : "";
        } else {
            mediaHtml = post.text ? `<div class="ip-text-placeholder"><p class="caption">${this.highlightKeywords(post.text)}</p></div>` : "";
            captionInFooter = "";
        }

        const noImageClass = post.image ? "" : " ip-post--no-image";
        const commentsBlock = this.buildCommentsPreview(post);

        const likeCount = post.likes ?? 0;
        const commentCount = post.commentCount ?? (post.comments ? post.comments.length : 0);

        // Check if GF liked this post (for spy mode)
        const gfLikedClass = post.gfLiked ? ' liked' : '';
        const heartIcon = post.gfLiked ? 'assets/instapics/filled_heart.svg' : 'assets/instapics/empty_heart.svg';

        return `
            <article class="ip-post${noImageClass}">
                <header>
                    <img class="avatar ip-avatar-clickable" src="${user.avatar}" alt="" data-avatar="${user.avatar}">
                    <span>${user.name}</span>
                </header>

                ${mediaHtml}

                <footer>
                    <div class="ip-actions">
                        <div class="ip-action ip-action-likes${gfLikedClass}">
                            <img class="ip-action-icon" src="${heartIcon}" alt="Likes">
                            <span class="ip-action-count">${likeCount}</span>
                        </div>
                        <div class="ip-action ip-action-comments">
                            <img class="ip-action-icon" src="assets/instapics/comments.svg" alt="Comments">
                            <span class="ip-action-count">${commentCount}</span>
                        </div>
                    </div>

                    ${captionInFooter}

                    ${commentsBlock}
                </footer>
            </article>
        `;
    },

    // Post card in the MODAL (all comments)
    fullPostCard(post, user) {
        // If image: displays the image + text in footer
        // If no image: displays the text instead of the image
        let mediaHtml;
        let captionInFooter;

        if (post.image) {
            mediaHtml = `<div class="ip-photo-container-full"><img class="photo" src="${post.image}" alt=""></div>`;
            captionInFooter = post.text ? `<p class="caption">${this.highlightKeywords(post.text)}</p>` : "";
        } else {
            mediaHtml = post.text ? `<div class="ip-text-placeholder"><p class="caption">${this.highlightKeywords(post.text)}</p></div>` : "";
            captionInFooter = "";
        }

        const noImageClass = post.image ? "" : " ip-post--no-image";
        const commentsBlock = this.buildCommentsFull(post);

        const likeCount = post.likes ?? 0;
        const commentCount = post.commentCount ?? (post.comments ? post.comments.length : 0);

        // Check if GF liked this post (for spy mode)
        const gfLikedClass = post.gfLiked ? ' liked' : '';
        const heartIcon = post.gfLiked ? 'assets/instapics/filled_heart.svg' : 'assets/instapics/empty_heart.svg';

        return `
            <article class="ip-post ip-post-full${noImageClass}">
                <header>
                    <img class="avatar ip-avatar-clickable" src="${user.avatar}" alt="" data-avatar="${user.avatar}">
                    <span>${user.name}</span>
                </header>

                ${mediaHtml}

                <footer>
                    <div class="ip-actions">
                        <div class="ip-action ip-action-likes${gfLikedClass}">
                            <img class="ip-action-icon" src="${heartIcon}" alt="Likes">
                            <span class="ip-action-count">${likeCount}</span>
                        </div>
                        <div class="ip-action ip-action-comments">
                            <img class="ip-action-icon" src="assets/instapics/comments.svg" alt="Comments">
                            <span class="ip-action-count">${commentCount}</span>
                        </div>
                    </div>

                    ${captionInFooter}

                    ${commentsBlock}
                </footer>
            </article>
        `;
    }
};
