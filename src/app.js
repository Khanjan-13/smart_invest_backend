const express = require("express");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/auth.routes");
const scrapeIfscRoutes = require("./routes/scrapeIfsc");
const myQrRoutes = require("./routes/payment/myQr");
const paymentRoutes = require("./routes/payment/payment");
const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/scrape", scrapeIfscRoutes);
app.use("/api/payment", myQrRoutes, paymentRoutes);

app.get("/", (req, res) => {
  res.json({ message: "API running on Vercel!" });
});
module.exports = app;
