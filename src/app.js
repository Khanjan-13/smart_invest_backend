const express = require("express");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/auth.routes");
const scrapeIfscRoutes = require("./routes/scrapeIfsc");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/scrape", scrapeIfscRoutes);
app.get("/", (req, res) => {
  res.json({ message: "API running on Vercel!" });
});
module.exports = app;
