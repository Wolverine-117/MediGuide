import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

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

// Render uses PORT given in env
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
