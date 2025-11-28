// frontend/js/feedback.js (CORRECTED VERSION)

// Backend base URL (Render)
const API_BASE =
  window.WEATHERE_API_BASE_URL ||
  "https://weathere-backend.onrender.com";

let currentUser = null;

// Utility: get JWT from localStorage
function getAuthToken() {
  return localStorage.getItem("weathere_token") || null;
}

// Utility: save JWT + user
function setAuth(token, user) {
  if (token) {
    localStorage.setItem("weathere_token", token);
  }
  if (user) {
    localStorage.setItem("weathere_user", JSON.stringify(user));
  }
  currentUser = user;
  updateAuthUI();
}

// Utility: clear JWT + user
function clearAuth() {
  localStorage.removeItem("weathere_token");
  localStorage.removeItem("weathere_user");
  currentUser = null;
  updateAuthUI();
}

// Load user from localStorage on startup
function loadAuthFromStorage() {
  const token = getAuthToken();
  const rawUser = localStorage.getItem("weathere_user");
  if (token && rawUser) {
    try {
      currentUser = JSON.parse(rawUser);
      updateAuthUI();
    } catch {
      currentUser = null;
    }
  }
}

// Update sign-in / user UI state - CORRECTED FOR YOUR HTML
function updateAuthUI() {
  const authButton = document.getElementById("auth-button");
  const authPanel = document.getElementById("auth-panel");

  if (!authButton) return;

  if (currentUser) {
    authButton.innerHTML = `<i class="fas fa-user"></i> ${currentUser.displayName} (Sign out)`;
    // Enable feedback features
    document.getElementById("like-btn").disabled = false;
    document.getElementById("dislike-btn").disabled = false;
    document.getElementById("feedback-text").disabled = false;
  } else {
    authButton.innerHTML = '<i class="fas fa-user"></i> Sign in';
    // Disable feedback features
    document.getElementById("like-btn").disabled = true;
    document.getElementById("dislike-btn").disabled = true;
    document.getElementById("feedback-text").disabled = true;
  }
}

// Sign-in and registration helpers - CORRECTED FOR YOUR HTML
function setupAuthHandlers() {
  const authButton = document.getElementById("auth-button");
  const authPanel = document.getElementById("auth-panel");
  const authLoginBtn = document.getElementById("auth-login-btn");
  const authRegisterBtn = document.getElementById("auth-register-btn");
  const authEmail = document.getElementById("auth-email");
  const authPassword = document.getElementById("auth-password");
  const authDisplayName = document.getElementById("auth-displayName");
  const authMessage = document.getElementById("auth-message");

  if (!authButton || !authPanel) return;

  // Main sign-in button toggle
  authButton.addEventListener("click", () => {
    if (currentUser) {
      // If user is logged in, log them out
      clearAuth();
      if (authMessage) authMessage.textContent = "Logged out successfully";
    } else {
      // Toggle auth panel visibility
      authPanel.classList.toggle("visible");
      
      if (authPanel.classList.contains("visible")) {
        authButton.innerHTML = '<i class="fas fa-times"></i> Cancel';
      } else {
        authButton.innerHTML = '<i class="fas fa-user"></i> Sign in';
        clearAuthForm();
        if (authMessage) authMessage.textContent = '';
      }
    }
  });

  // Login functionality
  if (authLoginBtn) {
    authLoginBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (authMessage) authMessage.textContent = "";

      const email = authEmail.value.trim();
      const password = authPassword.value.trim();

      if (!email || !password) {
        if (authMessage) authMessage.textContent = "Please enter both email and password";
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });

        const data = await res.json();
        if (!res.ok) {
          if (authMessage) authMessage.textContent = data.error || "Login failed.";
          return;
        }

        setAuth(data.token, data.user);
        authPanel.classList.remove("visible");
        authButton.innerHTML = `<i class="fas fa-user"></i> ${data.user.displayName} (Sign out)`;
        if (authMessage) authMessage.textContent = "Login successful!";
        clearAuthForm();
        if (typeof window.refreshFeedbackFromServer === "function") {
          window.refreshFeedbackFromServer();
        }
      } catch (err) {
        console.error("Login error:", err);
        if (authMessage) authMessage.textContent = "Network error during login.";
      }
    });
  }

  // Register functionality
  if (authRegisterBtn) {
    authRegisterBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (authMessage) authMessage.textContent = "";

      const email = authEmail.value.trim();
      const password = authPassword.value.trim();
      const displayName = authDisplayName.value.trim();

      if (!email || !password || !displayName) {
        if (authMessage) authMessage.textContent = "Please fill in all fields";
        return;
      }

      if (password.length < 6) {
        if (authMessage) authMessage.textContent = "Password must be at least 6 characters";
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName, email, password })
        });

        const data = await res.json();
        if (!res.ok) {
          if (authMessage) authMessage.textContent = data.error || "Registration failed.";
          return;
        }

        setAuth(data.token, data.user);
        authPanel.classList.remove("visible");
        authButton.innerHTML = `<i class="fas fa-user"></i> ${data.user.displayName} (Sign out)`;
        if (authMessage) authMessage.textContent = "Registration successful!";
        clearAuthForm();
        if (typeof window.refreshFeedbackFromServer === "function") {
          window.refreshFeedbackFromServer();
        }
      } catch (err) {
        console.error("Registration error:", err);
        if (authMessage) authMessage.textContent = "Network error during registration.";
      }
    });
  }

  function clearAuthForm() {
    if (authEmail) authEmail.value = '';
    if (authPassword) authPassword.value = '';
    if (authDisplayName) authDisplayName.value = '';
  }
}

// Submit feedback - CORRECTED FOR YOUR HTML
function setupFeedbackForm() {
  const likeBtn = document.getElementById("like-btn");
  const dislikeBtn = document.getElementById("dislike-btn");
  const feedbackText = document.getElementById("feedback-text");
  const authMessage = document.getElementById("auth-message");

  let selectedRating = null;

  if (likeBtn) {
    likeBtn.addEventListener("click", () => {
      selectedRating = "like";
      likeBtn.classList.add("active");
      if (dislikeBtn) dislikeBtn.classList.remove("active");
    });
  }

  if (dislikeBtn) {
    dislikeBtn.addEventListener("click", () => {
      selectedRating = "dislike";
      dislikeBtn.classList.add("active");
      if (likeBtn) likeBtn.classList.remove("active");
    });
  }

  // Feedback submission (when clicking like/dislike buttons)
  function submitFeedback(rating) {
    if (!currentUser) {
      if (authMessage) authMessage.textContent = "Please sign in to submit feedback";
      return;
    }

    const commentText = feedbackText ? feedbackText.value.trim() : '';
    const token = getAuthToken();
    
    // Get current location and time
    const currentLocation = document.getElementById("current-location").textContent;
    const currentTime = new Date().toISOString();

    try {
      fetch(`${API_BASE}/api/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          locationName: currentLocation,
          forecastTime: currentTime,
          rating: rating,
          commentText: commentText
        })
      })
      .then(response => response.json())
      .then(data => {
        if (!response.ok) {
          if (authMessage) authMessage.textContent = data.error || "Failed to submit feedback.";
          return;
        }

        if (feedbackText) feedbackText.value = '';
        if (likeBtn) likeBtn.classList.remove("active");
        if (dislikeBtn) dislikeBtn.classList.remove("active");
        selectedRating = null;

        if (authMessage) authMessage.textContent = "Thanks for your feedback!";
        
        // Refresh feedback stats
        if (typeof window.refreshFeedbackFromServer === "function") {
          window.refreshFeedbackFromServer();
        }
      })
      .catch(err => {
        console.error("Feedback submission error:", err);
        if (authMessage) authMessage.textContent = "Network error while submitting feedback.";
      });
    } catch (err) {
      console.error("Error submitting feedback:", err);
    }
  }

  // Attach submission to buttons
  if (likeBtn) {
    likeBtn.addEventListener("click", () => submitFeedback("like"));
  }
  if (dislikeBtn) {
    dislikeBtn.addEventListener("click", () => submitFeedback("dislike"));
  }
}

// Return how far back we query comments
function getTimeRangeHours() {
  return 24; // last 24 hours
}

// Fetch feedback summary from backend for current location
async function refreshFeedbackFromServer() {
  if (!window.currentLocationData) return;

  const locationName = window.currentLocationData.display_name || "San Francisco, CA, USA";
  const forecastTime = new Date().toISOString();

  try {
    const url = new URL(`${API_BASE}/api/feedback/summary`);
    url.searchParams.set("locationName", locationName);
    url.searchParams.set("forecastTime", forecastTime);

    const res = await fetch(url.toString());
    if (!res.ok) return;
    const data = await res.json();
    renderFeedbackFromServer(data);
  } catch (e) {
    console.error("Error fetching feedback summary:", e);
  }
}

// Render feedback summary + comments into the UI - CORRECTED FOR YOUR HTML
function renderFeedbackFromServer(data) {
  const likesEl = document.getElementById("likes-count");
  const dislikesEl = document.getElementById("dislikes-count");
  const summaryEl = document.getElementById("ai-summary");
  const commentsList = document.getElementById("comments-list");

  const stats = data?.stats || {};
  const commentsRaw = data?.comments || [];
  let comments = commentsRaw.slice().sort((a, b) => {
    const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return db - da; // newest first
  });

  if (likesEl) likesEl.textContent = stats.likes ?? 0;
  if (dislikesEl) dislikesEl.textContent = stats.dislikes ?? 0;

  if (summaryEl) {
    if (data.aiSummary) {
      summaryEl.textContent = data.aiSummary;
    } else if (stats.totalFeedback > 0) {
      summaryEl.textContent = "Collecting more feedback to generate a stronger sentiment summary.";
    } else {
      summaryEl.textContent = "No feedback has been submitted for this location yet.";
    }
  }

  if (commentsList) {
    commentsList.innerHTML = "";
    if (!comments.length) {
      commentsList.innerHTML = '<div style="font-size:12px;color:#777;">No comments yet.</div>';
    } else {
      comments.forEach((c) => {
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
  }
}

// Hook into the rest of the app
document.addEventListener("DOMContentLoaded", async () => {
  loadAuthFromStorage();
  setupAuthHandlers();
  setupFeedbackForm();

  // Set up feedback refresh when location changes
  window.refreshFeedbackFromServer = refreshFeedbackFromServer;

  // Initial refresh after a delay
  setTimeout(() => {
    refreshFeedbackFromServer();
  }, 2000);
});
