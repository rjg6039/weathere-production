// weather-core.js
// Handles location search, weather fetching (Open-Meteo), tabs, favorites,
// comparison, and patterns. Favorites are account-based only (logged-in users).

function getApiBase() {
    return window.WEATHERE_API_BASE_URL || "http://localhost:4000";
}

window.currentLocationData = window.currentLocationData || {
    display_name: "San Francisco, CA, USA",
    lat: "37.7749",
    lon: "-122.4194"
};

let currentWeatherData = null;
let favorites = []; // account-based only

function getAuthTokenFromStorage() {
    try {
        const raw = localStorage.getItem("weathere_user");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.token) return parsed.token;
        return null;
    } catch (e) {
        console.error("Failed to read auth token:", e);
        return null;
    }
}

// -------- Favorites: server-only, account-based --------

async function loadFavoritesFromServer() {
    const token = getAuthTokenFromStorage();
    if (!token) {
        favorites = [];
        renderFavorites();
        updateFavoriteToggle();
        return;
    }

    try {
        const res = await fetch(getApiBase() + "/api/user/favorites", {
            headers: {
                "Authorization": "Bearer " + token
            }
        });
        if (!res.ok) {
            console.error("Failed to load account favorites:", res.status);
            favorites = [];
            renderFavorites();
            updateFavoriteToggle();
            return;
        }
        const data = await res.json();
        favorites = (data.favorites || []).map(f => ({
            display_name: f.name,
            lat: String(f.latitude),
            lon: String(f.longitude),
            timezone: f.timezone || "auto"
        }));
        renderFavorites();
        updateFavoriteToggle();
    } catch (e) {
        console.error("Error loading account favorites:", e);
    }
}

function isCurrentLocationFavorite() {
    if (!window.currentLocationData) return false;
    return favorites.some(f => f.display_name === window.currentLocationData.display_name);
}

function updateFavoriteToggle() {
    const btn = document.getElementById("add-favorite-btn");
    if (!btn || !window.currentLocationData) return;
    if (isCurrentLocationFavorite()) {
        btn.classList.add("active");
        btn.title = "Remove from favorites";
    } else {
        btn.classList.remove("active");
        btn.title = "Add to favorites";
    }
}

async function toggleFavoriteForCurrentLocation() {
    if (!window.currentLocationData) return;

    const token = getAuthTokenFromStorage();
    if (!token) {
        alert("You need to be signed in to save favorites for your account.");
        return;
    }

    const loc = window.currentLocationData;

    try {
        const res = await fetch(getApiBase() + "/api/user/favorites/toggle", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify({
                locationName: loc.display_name,
                latitude: Number(loc.lat),
                longitude: Number(loc.lon),
                timezone: loc.timezone || "auto"
            })
        });
        const data = await res.json();
        if (!res.ok) {
            console.error("Failed to toggle favorite:", data.error || res.statusText);
            return;
        }

        favorites = (data.favorites || []).map(f => ({
            display_name: f.name,
            lat: String(f.latitude),
            lon: String(f.longitude),
            timezone: f.timezone || "auto"
        }));
        renderFavorites();
        updateFavoriteToggle();
    } catch (e) {
        console.error("Network error toggling favorite:", e);
    }
}

// -------- General UI helpers --------

function setCurrentDate() {
    const dateEl = document.getElementById("current-date");
    if (!dateEl) return;
    const now = new Date();
    const options = { weekday: "long", month: "long", day: "numeric", year: "numeric" };
    dateEl.textContent = now.toLocaleDateString(undefined, options);
}

async function geocodeLocation(query) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
    try {
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.results || []).map(r => ({
            display_name: `${r.name}, ${r.country}`,
            lat: String(r.latitude),
            lon: String(r.longitude)
        }));
    } catch (e) {
        console.error("Geocoding failed:", e);
        return [];
    }
}

async function fetchWeatherForLocation(loc) {
    const content = document.getElementById("weather-content");
    if (!content) return;

    content.innerHTML = `
        <div class="loading">
            <div class="spinner" aria-hidden="true"></div>
            <p>Loading weather data...</p>
        </div>
    `;

    const lat = loc.lat;
    const lon = loc.lon;

    const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${encodeURIComponent(lat)}` +
        `&longitude=${encodeURIComponent(lon)}` +
        `&hourly=temperature_2m,precipitation_probability,weathercode` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode` +
        `&current_weather=true` +
        `&timezone=auto` +
        `&temperature_unit=fahrenheit` +
        `&wind_speed_unit=mph` +
        `&precipitation_unit=inch`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Weather request failed");
        const data = await res.json();
        currentWeatherData = data;
        window.currentWeatherData = data;
        window.currentLocationData = loc;
        updateLocationDisplay();
        updateBodyBackgroundFromWeather(data);
        renderWeather();
        updatePatterns();
        updateFavoriteToggle();
        renderFavorites();
        if (typeof window.refreshFeedbackFromServer === "function") {
            window.refreshFeedbackFromServer();
        }
    } catch (e) {
        console.error(e);
        content.innerHTML = `<div class="loading" style="color:#e74c3c;">Failed to load weather data.</div>`;
    }
}

function updateLocationDisplay() {
    const locEl = document.getElementById("current-location");
    if (locEl && window.currentLocationData) {
        locEl.textContent = window.currentLocationData.display_name;
    }
}

function weatherCodeToIcon(code) {
    if (code === null || typeof code === "undefined") return '<i class="fas fa-question-circle"></i>';
    const n = Number(code);
    if (n === 0) return '<i class="fas fa-sun"></i>';
    if ([1, 2].includes(n)) return '<i class="fas fa-cloud-sun"></i>';
    if (n === 3) return '<i class="fas fa-cloud"></i>';
    if ([45, 48].includes(n)) return '<i class="fas fa-smog"></i>';
    if ([51, 53, 55, 56, 57, 61, 63, 65].includes(n)) return '<i class="fas fa-cloud-showers-heavy"></i>';
    if ([71, 73, 75, 77].includes(n)) return '<i class="fas fa-snowflake"></i>';
    if ([80, 81, 82].includes(n)) return '<i class="fas fa-cloud-showers-water"></i>';
    if ([95, 96, 99].includes(n)) return '<i class="fas fa-bolt"></i>';
    return '<i class="fas fa-cloud"></i>';
}

function updateBodyBackgroundFromWeather(data) {
    if (!data || !data.current_weather) return;
    const code = Number(data.current_weather.weathercode);
    let cls = "clear-sky";
    if (code === 0) cls = "clear-sky";
    else if ([1, 2, 3].includes(code)) cls = "few-clouds";
    else if ([45, 48].includes(code)) cls = "mist";
    else if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) cls = "rain";
    else if ([71, 73, 75, 77, 85, 86].includes(code)) cls = "snow";
    document.body.className = cls;
}

function renderWeather() {
    const content = document.getElementById("weather-content");
    if (!content) return;

    if (!currentWeatherData) {
        content.innerHTML = `<div class="loading">No weather data yet.</div>`;
        return;
    }
    const tab = document.querySelector(".tab.active");
    const mode = tab ? tab.getAttribute("data-tab") : "weekly";

    const current = currentWeatherData.current_weather || {};
    const temp = typeof current.temperature === "number" ? Math.round(current.temperature) : "--";
    const wcode = current.weathercode;
    const wind = current.windspeed;
    const iconHtml = weatherCodeToIcon(wcode);

    let inner = `
        <div class="current-weather">
            <div class="weather-icon">${iconHtml}</div>
            <div class="temperature">${temp}&deg;</div>
            <div class="weather-description">Current conditions</div>
            <div class="weather-details">
                <div class="detail">
                    <i class="fas fa-wind"></i>
                    <div class="detail-value">${wind != null ? Math.round(wind) + " mph" : "--"}</div>
                    <div class="detail-label">Wind</div>
                </div>
                <div class="detail">
                    <i class="fas fa-clock"></i>
                    <div class="detail-value">${new Date(current.time || Date.now()).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}</div>
                    <div class="detail-label">Observed</div>
                </div>
            </div>
        </div>
    `;

    if (mode === "weekly") {
        inner += renderWeeklyForecast();
    } else {
        inner += renderHourlyForecast();
    }

    content.innerHTML = inner;
}

function renderWeeklyForecast() {
    const daily = currentWeatherData.daily;
    if (!daily) {
        return `<div class="loading">No daily forecast available.</div>`;
    }
    const days = daily.time || [];
    let html = `
        <div class="forecast-title">
            <i class="fas fa-calendar-week"></i> 7-day forecast
        </div>
        <div class="forecast-container">
    `;
    for (let i = 0; i < days.length; i++) {
        const dateStr = days[i];
        const d = new Date(dateStr);
        const label = d.toLocaleDateString(undefined, { weekday: "short" });
        const tmin = daily.temperature_2m_min?.[i];
        const tmax = daily.temperature_2m_max?.[i];
        const code = daily.weathercode?.[i];
        const icon = weatherCodeToIcon(code);
        html += `
            <div class="forecast-item">
                <div class="forecast-label">${label}</div>
                <div class="forecast-icon">${icon}</div>
                <div class="forecast-temp">
                    ${Math.round(tmax)}&deg; / ${Math.round(tmin)}&deg;
                </div>
            </div>
        `;
    }
    html += `</div>`;
    return html;
}

function renderHourlyForecast() {
    const hourly = currentWeatherData.hourly;
    if (!hourly) {
        return `<div class="loading">No hourly forecast available.</div>`;
    }
    const times = hourly.time || [];
    const now = Date.now();
    const hoursToShow = [];
    for (let i = 0; i < times.length; i++) {
        const tMs = new Date(times[i]).getTime();
        if (tMs >= now && hoursToShow.length < 12) {
            hoursToShow.push(i);
        }
    }
    if (hoursToShow.length === 0) {
        return `<div class="loading">No upcoming hourly data.</div>`;
    }
    let html = `
        <div class="forecast-title">
            <i class="fas fa-clock"></i> Next hours
        </div>
        <div class="forecast-container">
    `;
    for (const idx of hoursToShow) {
        const tStr = hourly.time[idx];
        const d = new Date(tStr);
        const label = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const temp = hourly.temperature_2m?.[idx];
        const code = hourly.weathercode?.[idx];
        const precip = hourly.precipitation_probability?.[idx];
        const icon = weatherCodeToIcon(code);
        html += `
            <div class="forecast-item">
                <div class="forecast-label">${label}</div>
                <div class="forecast-icon">${icon}</div>
                <div class="forecast-temp">
                    ${Math.round(temp)}&deg;${precip != null ? " · " + precip + "% rain" : ""}
                </div>
            </div>
        `;
    }
    html += `</div>`;
    return html;
}

function renderFavorites() {
    const container = document.getElementById("favorites-list");
    if (!container) return;
    container.innerHTML = "";
    if (!favorites.length) {
        container.innerHTML = `<div class="favorite-item disabled">Sign in to save favorite locations.</div>`;
        return;
    }
    favorites.forEach(fav => {
        const div = document.createElement("div");
        div.className = "favorite-item";
        div.innerHTML = `<i class="fas fa-map-marker-alt"></i>${fav.display_name}`;
        div.addEventListener("click", () => {
            fetchWeatherForLocation(fav);
        });
        container.appendChild(div);
    });
}

function updatePatterns() {
    const el = document.getElementById("patterns-content");
    if (!el || !currentWeatherData || !currentWeatherData.daily) {
        if (el) el.textContent = "Patterns unavailable.";
        return;
    }
    const daily = currentWeatherData.daily;
    const tminArr = daily.temperature_2m_min || [];
    const tmaxArr = daily.temperature_2m_max || [];
    if (!tminArr.length || !tmaxArr.length) {
        el.textContent = "Patterns unavailable.";
        return;
    }
    const min = Math.min(...tminArr);
    const max = Math.max(...tmaxArr);
    const avg = (min + max) / 2;
    el.innerHTML = `
        Typical temperatures this week range from <strong>${Math.round(min)}&deg;</strong> 
        to <strong>${Math.round(max)}&deg;</strong>. Average daytime conditions are around 
        <strong>${Math.round(avg)}&deg;</strong>.
        <br><br>
        Precipitation probabilities suggest 
        <strong>${(daily.precipitation_probability_max || [])[0] || 0}%</strong> chance of rain on the wettest day.
    `;
}

function setupTabs() {
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            renderWeather();
        });
    });
}

function setupLocationSearch() {
    const input = document.getElementById("location-input");
    const suggestions = document.getElementById("suggestions");
    if (!input || !suggestions) return;

    let timer = null;

    input.addEventListener("input", () => {
        const q = input.value.trim();
        if (!q) {
            suggestions.style.display = "none";
            suggestions.innerHTML = "";
            return;
        }
        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
            const results = await geocodeLocation(q);
            suggestions.innerHTML = "";
            if (!results.length) {
                suggestions.style.display = "none";
                return;
            }
            results.forEach(r => {
                const div = document.createElement("div");
                div.className = "suggestion-item";
                div.textContent = r.display_name;
                div.addEventListener("click", () => {
                    suggestions.style.display = "none";
                    input.value = "";
                    fetchWeatherForLocation(r);
                });
                suggestions.appendChild(div);
            });
            suggestions.style.display = "block";
        }, 300);
    });

    document.addEventListener("click", (e) => {
        if (!suggestions.contains(e.target) && e.target !== input) {
            suggestions.style.display = "none";
        }
    });
}

function setupComparison() {
    const input = document.getElementById("comparison-input");
    const btn = document.getElementById("compare-button");
    const resultsContainer = document.getElementById("comparison-results");
    if (!input || !btn || !resultsContainer) return;

    btn.addEventListener("click", async () => {
        const q = input.value.trim();
        if (!q || !currentWeatherData) {
            resultsContainer.innerHTML = "";
            return;
        }
        const matches = await geocodeLocation(q);
        if (!matches.length) {
            resultsContainer.innerHTML = "<div style='font-size:12px;color:#777;'>No matching location found.</div>";
            return;
        }
        const other = matches[0];
        try {
            const url =
                `https://api.open-meteo.com/v1/forecast` +
                `?latitude=${encodeURIComponent(other.lat)}` +
                `&longitude=${encodeURIComponent(other.lon)}` +
                `&current_weather=true` +
                `&timezone=auto` +
                `&temperature_unit=fahrenheit` +
                `&wind_speed_unit=mph` +
                `&precipitation_unit=inch`;
            const res = await fetch(url);
            if (!res.ok) throw new Error("Compare fetch failed");
            const data = await res.json();
            const current = currentWeatherData.current_weather || {};
            const otherCurrent = data.current_weather || {};
            const html = `
                <div class="comparison-card">
                    <div class="comparison-location">${window.currentLocationData.display_name}</div>
                    <div class="comparison-temp">${Math.round(current.temperature || 0)}&deg;</div>
                    <div style="font-size:11px;">Current</div>
                </div>
                <div class="comparison-card">
                    <div class="comparison-location">${other.display_name}</div>
                    <div class="comparison-temp">${Math.round(otherCurrent.temperature || 0)}&deg;</div>
                    <div style="font-size:11px;">Current</div>
                </div>
            `;
            resultsContainer.innerHTML = html;
        } catch (e) {
            console.error(e);
            resultsContainer.innerHTML = "<div style='font-size:12px;color:#e74c3c;'>Failed to compare.</div>";
        }
    });
}

function setupFavoriteToggle() {
    const btn = document.getElementById("add-favorite-btn");
    if (!btn) return;
    btn.addEventListener("click", () => {
        toggleFavoriteForCurrentLocation();
    });
}

// -------- Init --------

window.addEventListener("DOMContentLoaded", () => {
    setCurrentDate();
    setupTabs();
    setupLocationSearch();
    setupComparison();
    setupFavoriteToggle();
    renderFavorites();
    fetchWeatherForLocation(window.currentLocationData);
    // Try to load favorites for logged-in user
    loadFavoritesFromServer();
});
