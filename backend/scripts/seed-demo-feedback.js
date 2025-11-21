// backend/scripts/seed-demo-feedback.js
//
// Seed ~40 demo feedback comments for San Francisco into MongoDB
// so the Weathere app has something real-looking to show.

/* eslint-disable no-console */

require("dotenv").config();
const mongoose = require("mongoose");

const User = require("../models/User");        // adjust path if needed
const Feedback = require("../models/Feedback"); // adjust path if needed

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error("MONGODB_URI is not set in .env");
    process.exit(1);
}

async function connect() {
    await mongoose.connect(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });
    console.log("Connected to MongoDB");
}

function getCurrentHour() {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    return now;
}

const SF_LOCATION = {
    locationName: "San Francisco, CA, USA",
    latitude: 37.7749,
    longitude: -122.4194,
    timezone: "America/Los_Angeles"
};

// A few demo users to attach comments to
const DEMO_USERS = [
    { email: "alex.sf@example.com",    displayName: "Alex in SoMa",      password: "Password123!" },
    { email: "jordan.sf@example.com",  displayName: "Jordan in Sunset",  password: "Password123!" },
    { email: "maria.sf@example.com",   displayName: "Maria in Mission",  password: "Password123!" },
    { email: "sam.sf@example.com",     displayName: "Sam in Richmond",   password: "Password123!" },
    { email: "taylor.sf@example.com",  displayName: "Taylor in Nob Hill",password: "Password123!" },
];

const COMMENT_TEMPLATES = [
    { rating: "like",    text: "Forecast said sunny and it actually is. Clear skies and mild breeze." },
    { rating: "like",    text: "Matched almost perfectly. Mild wind, sun peeking through, no surprise rain." },
    { rating: "like",    text: "Called the temp within a couple degrees. Feels spot on outside." },
    { rating: "like",    text: "Showed clouds and cool temps, which is exactly what I’m seeing." },
    { rating: "like",    text: "Forecast said light rain later, and the drizzle just started. Impressed." },
    { rating: "like",    text: "The timing on the fog rolling in was pretty accurate." },
    { rating: "like",    text: "Wind speed estimate is close enough. It definitely feels like what was shown." },
    { rating: "like",    text: "Temperature and cloud cover match really well for once." },
    { rating: "like",    text: "Said breezy and cool. I went out with a hoodie and it was exactly right." },
    { rating: "like",    text: "Very close call on the rainfall probability. It did sprinkle just like it said." },

    { rating: "dislike", text: "App said clear, but it’s actually foggy and damp in Outer Sunset." },
    { rating: "dislike", text: "Forecast showed no rain, but it’s been lightly raining for 30 minutes." },
    { rating: "dislike", text: "Way off on temperature. Feels at least 5 degrees colder than shown." },
    { rating: "dislike", text: "Said low chance of rain and I’m currently getting soaked at the bus stop." },
    { rating: "dislike", text: "Wind forecast was wrong. It’s much gustier than what the app shows." },
    { rating: "dislike", text: "Called for sun, but it’s overcast and gray everywhere I’ve been." },
    { rating: "dislike", text: "Precipitation probability feels unreliable. It said 5%, it’s clearly raining." },
    { rating: "dislike", text: "Completely missed the fog bank that rolled in from the ocean." },
    { rating: "dislike", text: "Sky condition is wrong. Definitely more cloud cover than predicted." },
    { rating: "dislike", text: "Feels like the app is lagging the actual conditions by a few hours." },

    { rating: "like",    text: "Near-perfect for my neighborhood in SoMa, temp and sky look right." },
    { rating: "like",    text: "Short-term forecast nailed it, especially the wind and chill." },
    { rating: "like",    text: "Good call on the cool temperatures even with the sun out." },
    { rating: "dislike", text: "Mission District is much warmer than the forecast suggests right now." },
    { rating: "dislike", text: "App said drizzle later, but it’s already raining steadily here." },
    { rating: "like",    text: "Fog forecast was solid. Felt accurate around Twin Peaks too." },
    { rating: "like",    text: "Hourly curve looks pretty accurate to what I’ve seen today." },
    { rating: "dislike", text: "Underestimates how windy it feels near the water." },
    { rating: "dislike", text: "The rain radar looked clean but it’s clearly raining in my area." },
    { rating: "like",    text: "Pretty close overall. Minor differences, but usable and helpful." },

    { rating: "like",    text: "Cloud coverage and temp match really well for downtown right now." },
    { rating: "dislike", text: "Forecast still says dry but the sidewalk is fully wet." },
    { rating: "like",    text: "It warned me about cooler temps later and that did happen." },
    { rating: "dislike", text: "Feels like the model doesn’t see microclimates well near the parks." },
    { rating: "like",    text: "Not perfect, but good enough that I trusted it for what to wear." },
    { rating: "dislike", text: "Sun icon is lying. Heavy marine layer overhead." },
];

async function getOrCreateDemoUsers() {
    const users = [];
    for (const u of DEMO_USERS) {
        let user = await User.findOne({ email: u.email });
        if (!user) {
            user = new User({
                email: u.email,
                displayName: u.displayName,
                password: u.password // model's pre-save hook should hash this
            });
            await user.save();
            console.log("Created demo user:", u.email);
        } else {
            console.log("Found existing demo user:", u.email);
        }
        users.push(user);
    }
    return users;
}

function shuffle(array) {
    const arr = array.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

async function seed() {
    await connect();

    const users = await getOrCreateDemoUsers();
    const currentHour = getCurrentHour();

    console.log("Seeding demo feedback for:", SF_LOCATION.locationName);
    console.log("Target forecastTime (current hour):", currentHour.toISOString());

    const shuffledComments = shuffle(COMMENT_TEMPLATES);

    const docs = [];

    // Distribute comments across users, all for same hour & location
    for (let i = 0; i < shuffledComments.length; i++) {
        const template = shuffledComments[i];
        const user = users[i % users.length];

        docs.push({
            userId: user._id,
            userDisplayName: user.displayName,
            locationName: SF_LOCATION.locationName,
            latitude: SF_LOCATION.latitude,
            longitude: SF_LOCATION.longitude,
            timezone: SF_LOCATION.timezone,
            forecastTime: currentHour,
            rating: template.rating,
            commentText: template.text
        });
    }

    // Optional: clear any existing demo feedback for this hour & location
    await Feedback.deleteMany({
        locationName: SF_LOCATION.locationName,
        forecastTime: currentHour
    });

    const inserted = await Feedback.insertMany(docs);
    console.log(`Inserted ${inserted.length} demo feedback documents.`);

    await mongoose.disconnect();
    console.log("Done.");
}

seed().catch(err => {
    console.error(err);
    mongoose.disconnect().finally(() => process.exit(1));
});
