// frontend/js/feedback.js

// Backend base URL (Render)
const API_BASE =
  window.WEATHERE_API_BASE ||
  "https://weathere-backend.onrender.com"; // change if your backend URL differs

// For local dev you could override, but in production this will be the Render backend
const API_BASE_LOCAL = API_BASE;

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
    } catch {
      currentUser = null;
    }
  }
  updateAuthUI();
}

// Fetch current user from backend (to verify token still valid)
async function fetchCurrentUser() {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE_LOCAL}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!res.ok) {
      if (res.status === 401) {
        clearAuth();
      }
      return null;
    }
    const data = await res.json();
    currentUser = data.user || null;
    if (currentUser) {
      localStorage.setItem("weathere_user", JSON.stringify(currentUser));
    }
    updateAuthUI();
    return currentUser;
  } catch (err) {
    console.error("Error fetching current user:", err);
    return null;
  }
}

// Update sign-in / user UI state
function updateAuthUI() {
  const signInBtn = document.getElementById("signinButton");
  const userInfoEl = document.getElementById("user-info");
  const logoutBtn = document.getElementById("logoutButton");

  if (!signInBtn || !userInfoEl || !logoutBtn) {
    return;
  }

  if (currentUser) {
    signInBtn.style.display = "none";
    logoutBtn.style.display = "inline-flex";
    userInfoEl.textContent = currentUser.displayName || currentUser.email || "Signed in";
  } else {
    signInBtn.style.display = "inline-flex";
    logoutBtn.style.display = "none";
    userInfoEl.textContent = "Not signed in";
  }

  // Also disable feedback form if not logged in
  const feedbackForm = document.getElementById("feedback-form");
  const feedbackGuard = document.getElementById("feedback-login-guard");
  if (feedbackForm && feedbackGuard) {
    if (currentUser) {
      feedbackForm.style.display = "block";
      feedbackGuard.style.display = "none";
    } else {
      feedbackForm.style.display = "none";
      feedbackGuard.style.display = "block";
    }
  }
}

// Sign-in and registration helpers (assuming you have modals with these IDs)
function setupAuthHandlers() {
  const signInBtn = document.getElementById("signinButton");
  const logoutBtn = document.getElementById("logoutButton");

  const loginModal = document.getElementById("loginModal");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const loginError = document.getElementById("loginError");
  const registerError = document.getElementById("registerError");

  if (signInBtn && loginModal) {
    signInBtn.addEventListener("click", () => {
      loginModal.style.display = "flex";
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      clearAuth();
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (loginError) loginError.textContent = "";

      const email = loginForm.querySelector("input[name='email']").value.trim();
      const password = loginForm.querySelector("input[name='password']").value;

      try {
        const res = await fetch(`${API_BASE_LOCAL}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });

        const data = await res.json();
        if (!res.ok) {
          if (loginError) loginError.textContent = data.error || "Login failed.";
          return;
        }

        setAuth(data.token, data.user);
        if (loginModal) loginModal.style.display = "none";
        refreshFeedbackFromServer();
      } catch (err) {
        console.error("Login error:", err);
        if (loginError) loginError.textContent = "Network error during login.";
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (registerError) registerError.textContent = "";

      const displayName = registerForm.querySelector("input[name='displayName']").value.trim();
      const email = registerForm.querySelector("input[name='email']").value.trim();
      const password = registerForm.querySelector("input[name='password']").value;

      try {
        const res = await fetch(`${API_BASE_LOCAL}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName, email, password })
        });

        const data = await res.json();
        if (!res.ok) {
          if (registerError) registerError.textContent = data.error || "Registration failed.";
          return;
        }

        setAuth(data.token, data.user);
        if (loginModal) loginModal.style.display = "none";
        refreshFeedbackFromServer();
      } catch (err) {
        console.error("Registration error:", err);
        if (registerError) registerError.textContent = "Network error during registration.";
      }
    });
  }

  // Close modal when clicking background
  if (loginModal) {
    loginModal.addEventListener("click", (e) => {
      if (e.target === loginModal) {
        loginModal.style.display = "none";
      }
    });
  }
}

// Return how far back we query comments
function getTimeRangeHours() {
  return 24; // last 24 hours
}

// Fetch feedback summary from backend for current location
async function refreshFeedbackFromServer() {
  const loc = window.currentLocationData;
  if (!loc) {
    return;
  }

  // locationName must match what backend stores, e.g. "San Francisco, CA, USA"
  const locationName = loc.display_name || loc.name || "San Francisco, CA, USA";

  const url = new URL(`${API_BASE_LOCAL}/api/feedback/summary`);
  url.searchParams.set("locationName", locationName);
  url.searchParams.set("timeRangeHours", String(getTimeRangeHours()));

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

// Render feedback summary + comments into the UI
function renderFeedbackFromServer(data) {
  const likesEl = document.getElementById("feedback-likes-count");
  const dislikesEl = document.getElementById("feedback-dislikes-count");
  const totalEl = document.getElementById("feedback-total-count");
  const summaryEl = document.getElementById("feedback-ai-summary");
  const commentsList = document.getElementById("feedback-comments-list");
  const statusEl = document.getElementById("feedback-status");

  const stats = data?.stats || {};
  const commentsRaw = data?.comments || [];
  let comments = commentsRaw.slice().sort((a, b) => {
    const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return db - da; // newest first
  });

  if (likesEl) likesEl.textContent = stats.likes ?? 0;
  if (dislikesEl) dislikesEl.textContent = stats.dislikes ?? 0;
  if (totalEl) totalEl.textContent = stats.totalFeedback ?? 0;

  if (statusEl) {
    if (stats.totalFeedback > 0) {
      statusEl.textContent = `Based on ${stats.totalFeedback} feedback entries in the last ${getTimeRangeHours()} hours.`;
    } else {
      statusEl.textContent = `No feedback yet in the last ${getTimeRangeHours()} hours.`;
    }
  }

  if (summaryEl) {
    if (data.aiSummary) {
      summaryEl.textContent = data.aiSummary;
    } else if (stats.totalFeedback > 0) {
      summaryEl.textContent =
        "Collecting more feedback to generate a stronger sentiment summary for this location.";
    } else {
      summaryEl.textContent =
        "No feedback has been submitted for this location yet. Once people start reporting how accurate the forecast feels, an AI summary will appear here.";
    }
  }

  if (!commentsList) return;

  commentsList.innerHTML = "";

  if (!comments.length) {
    commentsList.innerHTML =
      '<div style="font-size:12px;color:#777;">No comments yet in the last 24 hours. Be the first to share how the forecast matches real conditions.</div>';
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

      const label =
        c.rating === "like"
          ? '<span class="badge badge-like">Accurate</span>'
          : c.rating === "dislike"
          ? '<span class="badge badge-dislike">Inaccurate</span>'
          : "";

      div.innerHTML = `
        <div class="comment-header">
          <div class="comment-author">${c.userDisplayName || "User"}</div>
          <div class="comment-meta">
            ${label}
            <span class="comment-date">${dateStr}</span>
          </div>
        </div>
        <div class="comment-content">${c.commentText || ""}</div>
      `;

      commentsList.appendChild(div);
    });
  }
}

// Submit new feedback (like/dislike + optional comment)
function setupFeedbackForm() {
  const likeBtn = document.getElementById("feedback-like-button");
  const dislikeBtn = document.getElementById("feedback-dislike-button");
  const commentInput = document.getElementById("feedback-comment-input");
  const submitBtn = document.getElementById("feedback-submit-button");
  const noticeEl = document.getElementById("feedback-submit-notice");

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

  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      const token = getAuthToken();
      if (!token) {
        if (noticeEl) {
          noticeEl.textContent = "Please sign in to submit feedback.";
          noticeEl.style.color = "#d33";
        }
        return;
      }

      const loc = window.currentLocationData;
      const wx = window.currentWeatherData;
      if (!loc || !wx || !wx.current_weather) {
        if (noticeEl) {
          noticeEl.textContent = "Weather data not loaded yet.";
          noticeEl.style.color = "#d33";
        }
        return;
      }

      if (!selectedRating) {
        if (noticeEl) {
          noticeEl.textContent = "Please select whether the forecast feels accurate or inaccurate.";
          noticeEl.style.color = "#d33";
        }
        return;
      }

      const commentText = (commentInput?.value || "").trim();

      try {
        const body = {
          locationName: loc.display_name || loc.name || "San Francisco, CA, USA",
          latitude: loc.lat,
          longitude: loc.lon,
          timezone: wx.timezone || "America/Los_Angeles",
          rating: selectedRating,
          commentText
        };

        const res = await fetch(`${API_BASE_LOCAL}/api/feedback`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(body)
        });

        const data = await res.json();
        if (!res.ok) {
          console.error("Feedback submit failed:", data);
          if (noticeEl) {
            noticeEl.textContent = data.error || "Failed to submit feedback.";
            noticeEl.style.color = "#d33";
          }
          return;
        }

        if (commentInput) commentInput.value = "";
        if (likeBtn) likeBtn.classList.remove("active");
        if (dislikeBtn) dislikeBtn.classList.remove("active");
        selectedRating = null;

        if (noticeEl) {
          noticeEl.textContent = "Thanks for your feedback!";
          noticeEl.style.color = "#0a8";
        }

        // Refresh from server so new comment appears
        refreshFeedbackFromServer();
      } catch (err) {
        console.error("Error submitting feedback:", err);
        if (noticeEl) {
          noticeEl.textContent = "Network error while submitting feedback.";
          noticeEl.style.color = "#d33";
        }
      }
    });
  }
}

// Hook into the rest of the app
document.addEventListener("DOMContentLoaded", async () => {
  loadAuthFromStorage();
  setupAuthHandlers();
  setupFeedbackForm();

  // Once location/weather are ready, your weather core should call:
  //   refreshFeedbackFromServer();
  // If you want to force an initial attempt after a delay:
  setTimeout(() => {
    refreshFeedbackFromServer();
  }, 2000);
});
