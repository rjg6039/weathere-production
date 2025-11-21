import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

dotenv.config();

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || "weathere";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const JWT_SECRET = process.env.JWT_SECRET || "insecure-dev-secret-change-me";

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI in .env or environment");
  process.exit(1);
}

// ---------- Mongo connection ----------
let mongoConnected = false;
try {
  await mongoose.connect(MONGODB_URI, {
    dbName: DB_NAME
  });
  mongoConnected = true;
  console.log("Connected to MongoDB:", DB_NAME);
} catch (err) {
  console.error("Failed to connect to MongoDB:", err);
}

// ---------- Schemas & models ----------

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true },

    // Favorites tied to this account
    favorites: [
      {
        locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location" },
        name: String,
        latitude: Number,
        longitude: Number,
        timezone: String
      }
    ]
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

const locationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    latitude: Number,
    longitude: Number,
    timezone: String
  },
  { timestamps: true }
);

const Location = mongoose.model("Location", locationSchema);

const feedbackSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", required: true },
    forecastTime: { type: Date, required: true },
    rating: {
      type: String,
      enum: ["like", "dislike"],
      required: true
    },
    commentText: { type: String, default: "" },
    aiSentiment: {
      label: {
        type: String,
        enum: ["positive", "negative", "mixed", "neutral"],
        default: "mixed"
      },
      score: Number,
      model: String,
      processedAt: Date
    },
    reactionCounts: {
      likes: { type: Number, default: 0 },
      dislikes: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

feedbackSchema.index(
  { userId: 1, locationId: 1, forecastTime: 1 },
  { unique: true }
);

const Feedback = mongoose.model("Feedback", feedbackSchema);

const aiSummarySchema = new mongoose.Schema(
  {
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", required: true },
    forecastTime: { type: Date, required: true },
    window: { type: String, default: "hour" },
    stats: {
      totalFeedback: Number,
      likes: Number,
      dislikes: Number,
      uniqueUsers: Number
    },
    summaryText: String,
    model: String,
    generatedAt: Date
  },
  { timestamps: true }
);

aiSummarySchema.index(
  { locationId: 1, forecastTime: 1, window: 1 },
  { unique: true }
);

const AISummary = mongoose.model("AISummary", aiSummarySchema);

// ---------- Express app ----------
const app = express();
app.use(cors());
app.use(express.json());

// ---------- Helpers ----------

function normalizeToHour(date) {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
}

function createToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      displayName: user.displayName
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "Missing Authorization header" });
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Invalid Authorization header" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.sub,
      email: payload.email,
      displayName: payload.displayName
    };
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

async function getOrCreateLocation({ name, latitude, longitude, timezone }) {
  let loc = await Location.findOne({ name });
  if (!loc) {
    loc = await Location.create({
      name,
      latitude,
      longitude,
      timezone
    });
  }
  return loc;
}

// ---------- Routes ----------

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    mongoConnected,
    aiConfigured: !!OPENAI_API_KEY
  });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password || !displayName) {
      return res.status(400).json({ error: "email, password, and displayName are required" });
    }
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: "Email is already registered" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash, displayName });
    const token = createToken(user);
    res.json({
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName
      },
      token
    });
  } catch (err) {
    console.error("register error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "Invalid email or password" });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(400).json({ error: "Invalid email or password" });
    }
    const token = createToken(user);
    res.json({
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName
      },
      token
    });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/feedback", authMiddleware, async (req, res) => {
  try {
    const {
      locationName,
      latitude,
      longitude,
      timezone,
      forecastTime,
      rating,
      commentText
    } = req.body;

    if (!locationName || !forecastTime || !rating) {
      return res.status(400).json({ error: "locationName, forecastTime, and rating are required" });
    }

    if (!["like", "dislike"].includes(rating)) {
      return res.status(400).json({ error: "rating must be 'like' or 'dislike'" });
    }

    const location = await getOrCreateLocation({
      name: locationName,
      latitude,
      longitude,
      timezone
    });

    const normalizedForecastTime = normalizeToHour(forecastTime);

    try {
      const feedback = await Feedback.findOneAndUpdate(
        {
          userId: req.user.id,
          locationId: location._id,
          forecastTime: normalizedForecastTime
        },
        {
          $set: {
            rating,
            commentText: commentText || ""
          }
        },
        {
          upsert: true,
          new: true,
          runValidators: true
        }
      );

      res.json({ ok: true, feedbackId: feedback._id });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({
          error: "User has already submitted feedback for this forecast hour."
        });
      }
      throw err;
    }
  } catch (err) {
    console.error("submit feedback error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/feedback/summary", async (req, res) => {
  try {
    const { locationName, forecastTime } = req.query;
    if (!locationName || !forecastTime) {
      return res.status(400).json({ error: "locationName and forecastTime are required" });
    }

    const location = await Location.findOne({ name: locationName });
    if (!location) {
      return res.json({
        stats: { likes: 0, dislikes: 0, totalFeedback: 0, uniqueUsers: 0 },
        comments: [],
        aiSummary: null
      });
    }

    const normalizedForecastTime = normalizeToHour(forecastTime);

    const feedbackDocs = await Feedback.find({
      locationId: location._id,
      forecastTime: normalizedForecastTime
    }).sort({ createdAt: -1 }).populate("userId", "displayName");

    const likes = feedbackDocs.filter(f => f.rating === "like").length;
    const dislikes = feedbackDocs.filter(f => f.rating === "dislike").length;
    const totalFeedback = feedbackDocs.length;
    const uniqueUsers = new Set(feedbackDocs.map(f => String(f.userId?._id || f.userId))).size;

    let summaryDoc = await AISummary.findOne({
      locationId: location._id,
      forecastTime: normalizedForecastTime,
      window: "hour"
    });

    let summaryText = summaryDoc ? summaryDoc.summaryText : null;

    if (!summaryText && totalFeedback > 0) {
  // Cheap spam / nonsense filter
  const rawComments = feedbackDocs
    .map(f => (f.commentText || "").trim())
    .filter(Boolean);

  const meaningfulComments = rawComments.filter(c =>
    c.length >= 10 && /[a-zA-Z]/.test(c) // at least 10 chars and contains letters
  );

  const MIN_MEANINGFUL_COMMENTS = 3;
  const MIN_UNIQUE_USERS_FOR_AI = 2;

  // If no AI key, or data is too thin / unreliable, fall back to a deterministic summary
  if (
    !OPENAI_API_KEY ||
    meaningfulComments.length < MIN_MEANINGFUL_COMMENTS ||
    uniqueUsers < MIN_UNIQUE_USERS_FOR_AI
  ) {
    summaryText =
      `Based on ${totalFeedback} feedback entr${totalFeedback === 1 ? "y" : "ies"} so far, ` +
      `${likes} like(s) and ${dislikes} dislike(s) have been recorded for this hour. ` +
      `There is not yet enough consistent commentary from multiple users to generate an AI summary.`;
  } else {
    // Robust prompt that includes stats + filtered comments
    const prompt = `
You are analyzing user comments about how accurate the current weather forecast is.

Location: ${location.name}
Forecast time (normalized hour): ${normalizedForecastTime.toISOString()}

Stats:
- Total feedback entries: ${totalFeedback}
- Likes (forecast accurate): ${likes}
- Dislikes (forecast inaccurate): ${dislikes}
- Unique users: ${uniqueUsers}

User comments (only a sample of meaningful ones):
${meaningfulComments.map((c, i) => `${i + 1}. ${c}`).join("\\n")}

Task:
Provide a concise 2–3 sentence summary that:
- describes how accurate the forecast seems compared to real conditions,
- clearly states the overall sentiment (positive, mixed, or negative),
- notes any recurring issues users mention (e.g. wrong temperature, wrong precipitation, timing off),
- and mentions when the sample size is small or feedback is sparse, instead of overgeneralizing.

Respond as plain text with no bullet points.
    `.trim();

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + OPENAI_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [
            { role: "system", content: "You summarize weather forecast accuracy based on user comments and basic statistics." },
            { role: "user", content: prompt }
          ],
          max_tokens: 220
        })
      });

      if (response.ok) {
        const data = await response.json();
        const aiText = data.choices?.[0]?.message?.content?.trim();
        if (aiText) {
          summaryText = aiText;
          summaryDoc = await AISummary.findOneAndUpdate(
            {
              locationId: location._id,
              forecastTime: normalizedForecastTime,
              window: "hour"
            },
            {
              $set: {
                summaryText: aiText,
                stats: { totalFeedback, likes, dislikes, uniqueUsers },
                model: OPENAI_MODEL,
                generatedAt: new Date()
              }
            },
            { new: true, upsert: true }
          );
        }
      } else {
        const err = await response.json().catch(() => ({}));
        console.error("OpenAI error:", err);
      }
    } catch (e) {
      console.error("OpenAI request failed:", e);
    }
  }
}

    const comments = feedbackDocs.map(f => ({
      id: f._id,
      userId: f.userId?._id || f.userId,
      userDisplayName: f.userId?.displayName || "User",
      commentText: f.commentText,
      rating: f.rating,
      createdAt: f.createdAt
    }));

    res.json({
      stats: { likes, dislikes, totalFeedback, uniqueUsers },
      comments,
      aiSummary: summaryText
    });
  } catch (err) {
    console.error("summary error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Weathere backend listening on port ${PORT}`);
});

// Get favorites for the current user
app.get("/api/user/favorites", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate("favorites.locationId");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const favorites = (user.favorites || []).map(f => {
      const locDoc = f.locationId;
      return {
        id: locDoc?._id || null,
        name: f.name || locDoc?.name,
        latitude: f.latitude ?? locDoc?.latitude,
        longitude: f.longitude ?? locDoc?.longitude,
        timezone: f.timezone ?? locDoc?.timezone
      };
    });

    res.json({ favorites });
  } catch (err) {
    console.error("get favorites error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Toggle favorite for current location (add/remove)
app.post("/api/user/favorites/toggle", authMiddleware, async (req, res) => {
  try {
    const { locationName, latitude, longitude, timezone } = req.body;
    if (!locationName) {
      return res.status(400).json({ error: "locationName is required" });
    }

    // Normalize location through the Location collection
    const location = await getOrCreateLocation({
      name: locationName,
      latitude,
      longitude,
      timezone
    });

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.favorites) user.favorites = [];

    const existingIndex = user.favorites.findIndex(
      (f) => String(f.locationId) === String(location._id)
    );

    let isFavorite;
    if (existingIndex >= 0) {
      // Remove from favorites
      user.favorites.splice(existingIndex, 1);
      isFavorite = false;
    } else {
      // Add to favorites
      user.favorites.push({
        locationId: location._id,
        name: location.name,
        latitude: location.latitude,
        longitude: location.longitude,
        timezone: location.timezone
      });
      isFavorite = true;
    }

    await user.save();

    const favorites = (user.favorites || []).map(f => ({
      id: f.locationId,
      name: f.name,
      latitude: f.latitude,
      longitude: f.longitude,
      timezone: f.timezone
    }));

    res.json({ favorites, isFavorite });
  } catch (err) {
    console.error("toggle favorites error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
