// feedback.js
// Handles user auth, feedback submission, and fetching stats + AI summaries from backend.

const API_BASE = window.WEATHERE_API_BASE_URL || "http://localhost:4000";

let currentUser = {
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
        const raw = localStorage.getItem("weathere_user");
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.id && parsed.token) {
            currentUser = parsed;
        }
    } catch (e) {
        console.error("Failed to load user:", e);
    }
}

function updateAuthUI() {
    const authBtn = document.getElementById("auth-button");
    const authPanel = document.getElementById("auth-panel");
    const authMsg = document.getElementById("auth-message");
    if (!authBtn || !authPanel) return;

    if (currentUser && currentUser.id) {
        authBtn.innerHTML = '<i class="fas fa-user-check"></i> ' + (currentUser.displayName || "Signed in");
        if (authMsg) {
            authMsg.textContent = "Signed in as " + (currentUser.email || currentUser.displayName);
        }
    } else {
        authBtn.innerHTML = '<i class="fas fa-user"></i> Sign in';
        if (authMsg) {
            authMsg.textContent = "You must sign in to submit feedback.";
        }
    }
}

function toggleAuthPanel() {
    const panel = document.getElementById("auth-panel");
    if (!panel) return;
    panel.classList.toggle("visible");
}

async function registerUser() {
    const emailEl = document.getElementById("auth-email");
    const passEl = document.getElementById("auth-password");
    const nameEl = document.getElementById("auth-displayName");
    const msg = document.getElementById("auth-message");

    const email = emailEl.value.trim();
    const password = passEl.value;
    const displayName = nameEl.value.trim();

    if (!email || !password || !displayName) {
        msg.textContent = "Please fill in email, password, and display name.";
        msg.style.color = "#c0392b";
        return;
    }

    try {
        const res = await fetch(API_BASE + "/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, displayName })
        });

        const data = await res.json();

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
    } catch (e) {
        console.error(e);
        msg.textContent = "Network error during registration.";
        msg.style.color = "#c0392b";
    }
}

async function loginUser() {
    const emailEl = document.getElementById("auth-email");
    const passEl = document.getElementById("auth-password");
    const msg = document.getElementById("auth-message");

    const email = emailEl.value.trim();
    const password = passEl.value;

    if (!email || !password) {
        msg.textContent = "Please enter email and password.";
        msg.style.color = "#c0392b";
        return;
    }

    try {
        const res = await fetch(API_BASE + "/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();

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
    } catch (e) {
        console.error(e);
        msg.textContent = "Network error during login.";
        msg.style.color = "#c0392b";
    }
}

function getAuthHeaders() {
    const headers = { "Content-Type": "application/json" };
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

    const rating = isLike ? "like" : "dislike";
    const textarea = document.getElementById("feedback-text");
    const commentText = textarea ? textarea.value.trim() : "";
    const loc = window.currentLocationData;
    if (!loc) {
        alert("Location not ready yet.");
        return;
    }

    const body = {
        locationName: loc.display_name,
        latitude: Number(loc.lat),
        longitude: Number(loc.lon),
        timezone: "auto",
        forecastTime: getCurrentForecastTime(),
        rating,
        commentText
    };

    try {
        const res = await fetch(API_BASE + "/api/feedback", {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify(body)
        });
        const data = await res.json().catch(() => ({}));

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
    const loc = window.currentLocationData;
    if (!loc || !window.currentWeatherData || !window.currentWeatherData.current_weather) {
        return;
    }
    const forecastTime = getCurrentForecastTime();

    const url = new URL(API_BASE + "/api/feedback/summary");
    url.searchParams.set("locationName", loc.display_name);
    url.searchParams.set("forecastTime", forecastTime);

    try {
        const res = await fetch(url.toString());
        if (!res.ok) {
            console.error("Failed to fetch feedback summary:", res.status);
            return;
        }
        const data = await res.json();
        renderFeedbackFromServer(data);
    } catch (e) {
        console.error("Error fetching feedback summary:", e);
    }
}

function renderFeedbackFromServer(data) {
    const likesEl = document.getElementById("likes-count");
    const dislikesEl = document.getElementById("dislikes-count");
    const accEl = document.getElementById("accuracy-percent");
    const commentsList = document.getElementById("comments-list");
    const aiSummaryEl = document.getElementById("ai-summary");

    if (!likesEl || !dislikesEl || !accEl || !commentsList || !aiSummaryEl) return;

    const stats = data.stats || { likes: 0, dislikes: 0, totalFeedback: 0 };
    likesEl.textContent = stats.likes || 0;
    dislikesEl.textContent = stats.dislikes || 0;

    const total = (stats.likes || 0) + (stats.dislikes || 0);
    if (total === 0) {
        accEl.textContent = "–";
    } else {
        const percent = Math.round((stats.likes / total) * 100);
        accEl.textContent = percent + "%";
    }

    commentsList.innerHTML = "";
    const comments = data.comments || [];
    if (!comments.length) {
        commentsList.innerHTML = `<div style="font-size:12px;color:#777;">No comments yet. Be the first to share how the forecast matches real conditions.</div>`;
    } else {
        comments.forEach(c => {
            const div = document.createElement("div");
            div.className = "comment";
            const date = new Date(c.createdAt || Date.now());
            const dateStr = date.toLocaleString(undefined, {
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
    const likeBtn = document.getElementById("like-btn");
    const dislikeBtn = document.getElementById("dislike-btn");
    const authBtn = document.getElementById("auth-button");
    const loginBtn = document.getElementById("auth-login-btn");
    const registerBtn = document.getElementById("auth-register-btn");

    if (authBtn) {
        authBtn.addEventListener("click", toggleAuthPanel);
    }
    if (likeBtn) {
        likeBtn.addEventListener("click", () => submitFeedback(true));
    }
    if (dislikeBtn) {
        dislikeBtn.addEventListener("click", () => submitFeedback(false));
    }
    if (loginBtn) {
        loginBtn.addEventListener("click", loginUser);
    }
    if (registerBtn) {
        registerBtn.addEventListener("click", registerUser);
    }
}

window.refreshFeedbackFromServer = refreshFeedbackFromServer;

window.addEventListener("DOMContentLoaded", () => {
    loadUserFromStorage();
    updateAuthUI();
    registerFeedbackHandlers();
});
