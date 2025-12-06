import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json()); // Needed for POST JSON requests

// --------------------------
// Google Places API (GET)
// --------------------------
app.get("/google", async (req, res) => {
    try {
        const { query } = req.query;
        const API_KEY = process.env.GOOGLE_API_KEY;

        const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${API_KEY}`;

        const response = await fetch(url);
        const data = await response.json();

        res.json(data);

    } catch (err) {
        res.status(500).json({ error: "Server Error", message: err.message });
    }
});

// --------------------------
// Gemini API (POST)
// --------------------------
app.post("/gemini", async (req, res) => {
    try {
        const GOOGLE_KEY = process.env.GOOGLE_API_KEY;

        const googleUrl =
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GOOGLE_KEY}`;

        const response = await fetch(googleUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();
        res.status(response.status).json(data);

    } catch (err) {
        console.error("Gemini Proxy Error:", err);
        res.status(500).json({ error: "Server error", message: err.message });
    }
});

// --------------------------
// Port Handling (Render)
// --------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});

