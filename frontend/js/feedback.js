// feedback.js
// Handles user auth, feedback submission, fetching stats and AI summaries,
// and exposes refreshFeedbackFromServer for weather-core to call.

(function () {
    var API_BASE_LOCAL = window.WEATHERE_API_BASE_URL || "http://localhost:4000";

    var currentUser = {
        id: null,
        displayName: null,
        email: null,
        token: null
    };

    function saveUserToStorage() {
        try {
            localStorage.setItem("weathere_user", JSON.stringify(currentUser));
        } catch (e) {
            console.error("Failed to save user:", e);
        }
    }

    function loadUserFromStorage() {
        try {
            var raw = localStorage.getItem("weathere_user");
            if (!raw) return;
            var parsed = JSON.parse(raw);
            if (parsed && parsed.id && parsed.token) {
                currentUser = parsed;
            }
        } catch (e) {
            console.error("Failed to load user:", e);
        }
    }

    function updateAuthUI() {
        var authBtn = document.getElementById("auth-button");
        var authPanel = document.getElementById("auth-panel");
        var authMsg = document.getElementById("auth-message");
        if (!authBtn || !authPanel) return;

        if (currentUser && currentUser.id) {
            authBtn.innerHTML =
                '<i class="fas fa-user-check"></i> ' + (currentUser.displayName || "Signed in");
            if (authMsg) {
                authMsg.textContent = "Signed in as " + (currentUser.email || currentUser.displayName);
                authMsg.style.color = "#555";
            }
        } else {
            authBtn.innerHTML = '<i class="fas fa-user"></i> Sign in';
            if (authMsg) {
                authMsg.textContent = "You must sign in to submit feedback.";
                authMsg.style.color = "#555";
            }
        }
    }

    function toggleAuthPanel() {
        var panel = document.getElementById("auth-panel");
        if (!panel) return;
        panel.classList.toggle("visible");
    }

    async function registerUser() {
        var emailEl = document.getElementById("auth-email");
        var passEl = document.getElementById("auth-password");
        var nameEl = document.getElementById("auth-displayName");
        var msg = document.getElementById("auth-message");

        var email = emailEl.value.trim();
        var password = passEl.value;
        var displayName = nameEl.value.trim();

        if (!email || !password || !displayName) {
            msg.textContent = "Please fill in email, password, and display name.";
            msg.style.color = "#c0392b";
            return;
        }

        try {
            var res = await fetch(API_BASE_LOCAL + "/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email, password: password, displayName: displayName })
            });

            var data = await res.json();

            if (!res.ok) {
                msg.textContent = data.error || "Registration failed.";
                msg.style.color = "#c0392b";
                return;
            }

            currentUser = {
                id: data.user.id,
                displayName: data.user.displayName,
                email: data.user.email,
                token: data.token
            };
            saveUserToStorage();
            msg.textContent = "Registered and signed in.";
            msg.style.color = "#27ae60";
            updateAuthUI();

            // Minimal global auth state for anything else that cares
            window.weathereAuth = {
                isLoggedIn: true,
                token: currentUser.token,
                displayName: currentUser.displayName,
                email: currentUser.email
            };
        } catch (e) {
            console.error(e);
            msg.textContent = "Network error during registration.";
            msg.style.color = "#c0392b";
        }
    }

    async function loginUser() {
        var emailEl = document.getElementById("auth-email");
        var passEl = document.getElementById("auth-password");
        var msg = document.getElementById("auth-message");

        var email = emailEl.value.trim();
        var password = passEl.value;

        if (!email || !password) {
            msg.textContent = "Please enter email and password.";
            msg.style.color = "#c0392b";
            return;
        }

        try {
            var res = await fetch(API_BASE_LOCAL + "/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email, password: password })
            });

            var data = await res.json();

            if (!res.ok) {
                msg.textContent = data.error || "Login failed.";
                msg.style.color = "#c0392b";
                return;
            }

            currentUser = {
                id: data.user.id,
                displayName: data.user.displayName,
                email: data.user.email,
                token: data.token
            };
            saveUserToStorage();
            msg.textContent = "Signed in.";
            msg.style.color = "#27ae60";
            updateAuthUI();

            window.weathereAuth = {
                isLoggedIn: true,
                token: currentUser.token,
                displayName: currentUser.displayName,
                email: currentUser.email
            };
        } catch (e) {
            console.error(e);
            msg.textContent = "Network error during login.";
            msg.style.color = "#c0392b";
        }
    }

    function getAuthHeaders() {
        var headers = { "Content-Type": "application/json" };
        if (currentUser && currentUser.token) {
            headers["Authorization"] = "Bearer " + currentUser.token;
        }
        return headers;
    }

    function getCurrentForecastTime() {
        if (!window.currentWeatherData || !window.currentWeatherData.current_weather) {
            return new Date().toISOString();
        }
        return window.currentWeatherData.current_weather.time || new Date().toISOString();
    }

    async function submitFeedback(isLike) {
        if (!currentUser || !currentUser.id || !currentUser.token) {
            alert("You need to be signed in to rate the forecast.");
            return;
        }

        var rating = isLike ? "like" : "dislike";
        var textarea = document.getElementById("feedback-text");
        var commentText = textarea ? textarea.value.trim() : "";
        var loc = window.currentLocationData;
        if (!loc) {
            alert("Location not ready yet.");
            return;
        }

        var body = {
            locationName: loc.display_name,
            latitude: Number(loc.lat),
            longitude: Number(loc.lon),
            timezone: "auto",
            forecastTime: getCurrentForecastTime(),
            rating: rating,
            commentText: commentText
        };

        try {
            var res = await fetch(API_BASE_LOCAL + "/api/feedback", {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify(body)
            });
            var data = await res.json().catch(function () { return {}; });

            if (res.status === 409) {
                alert("You’ve already submitted feedback for this forecast hour at this location.");
                return;
            }
            if (!res.ok) {
                alert("Failed to submit feedback: " + (data.error || res.statusText));
                return;
            }

            if (textarea) textarea.value = "";
            await refreshFeedbackFromServer();
        } catch (e) {
            console.error(e);
            alert("Network error while submitting feedback.");
        }
    }

    async function refreshFeedbackFromServer() {
        var loc = window.currentLocationData;
        if (!loc || !window.currentWeatherData || !window.currentWeatherData.current_weather) {
            return;
        }
        var forecastTime = getCurrentForecastTime();

        var url = new URL(API_BASE_LOCAL + "/api/feedback/summary");
        url.searchParams.set("locationName", loc.display_name);
        url.searchParams.set("forecastTime", forecastTime);

        try {
            var res = await fetch(url.toString());
            if (!res.ok) {
                console.error("Failed to fetch feedback summary:", res.status);
                return;
            }
            var data = await res.json();
            renderFeedbackFromServer(data);
        } catch (e) {
            console.error("Error fetching feedback summary:", e);
        }
    }

    function renderFeedbackFromServer(data) {
        var likesEl = document.getElementById("likes-count");
        var dislikesEl = document.getElementById("dislikes-count");
        var accEl = document.getElementById("accuracy-percent");
        var commentsList = document.getElementById("comments-list");
        var aiSummaryEl = document.getElementById("ai-summary");

        if (!likesEl || !dislikesEl || !accEl || !commentsList || !aiSummaryEl) return;

        var stats = data.stats || { likes: 0, dislikes: 0, totalFeedback: 0, uniqueUsers: 0 };
        likesEl.textContent = stats.likes || 0;
        dislikesEl.textContent = stats.dislikes || 0;

        var total = (stats.likes || 0) + (stats.dislikes || 0);
        if (total === 0) {
            accEl.textContent = "–";
        } else {
            var percent = Math.round((stats.likes / total) * 100);
            accEl.textContent = percent + "%";
        }

        commentsList.innerHTML = "";
        var comments = data.comments || [];
        if (!comments.length) {
            commentsList.innerHTML =
                '<div style="font-size:12px;color:#777;">No comments yet. Be the first to share how the forecast matches real conditions.</div>';
        } else {
            comments.forEach(function (c) {
                var div = document.createElement("div");
                div.className = "comment";
                var date = new Date(c.createdAt || Date.now());
                var dateStr = date.toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                });
                div.innerHTML = `
                    <div class="comment-header">
                        <div class="comment-author">${c.userDisplayName || "User"}</div>
                        <div class="comment-date">${dateStr}</div>
                    </div>
                    <div class="comment-content">${c.commentText || ""}</div>
                `;
                commentsList.appendChild(div);
            });
        }

        if (data.aiSummary) {
            aiSummaryEl.textContent = data.aiSummary;
        } else {
            aiSummaryEl.textContent =
                "No AI analysis yet. Once there are enough real user comments for this location and hour, the system will generate a summary based on stored feedback.";
        }
    }

    function registerFeedbackHandlers() {
        var likeBtn = document.getElementById("like-btn");
        var dislikeBtn = document.getElementById("dislike-btn");
        var authBtn = document.getElementById("auth-button");
        var loginBtn = document.getElementById("auth-login-btn");
        var registerBtn = document.getElementById("auth-register-btn");

        if (authBtn) {
            authBtn.addEventListener("click", toggleAuthPanel);
        }
        if (likeBtn) {
            likeBtn.addEventListener("click", function () { submitFeedback(true); });
        }
        if (dislikeBtn) {
            dislikeBtn.addEventListener("click", function () { submitFeedback(false); });
        }
        if (loginBtn) {
            loginBtn.addEventListener("click", loginUser);
        }
        if (registerBtn) {
            registerBtn.addEventListener("click", registerUser);
        }
    }

    // Expose refresh function so weather-core.js can call it after weather loads
    window.refreshFeedbackFromServer = refreshFeedbackFromServer;

    // -------- Init --------

    window.addEventListener("DOMContentLoaded", function () {
        loadUserFromStorage();

        window.weathereAuth = {
            isLoggedIn: !!(currentUser && currentUser.id && currentUser.token),
            token: currentUser ? currentUser.token : null,
            displayName: currentUser ? currentUser.displayName : null,
            email: currentUser ? currentUser.email : null
        };

        updateAuthUI();
        registerFeedbackHandlers();
    });
})();
