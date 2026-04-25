const express = require("express");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/auth.routes");
const scrapeIfscRoutes = require("./routes/scrapeIfsc");
const myQrRoutes = require("./routes/payment/myQr");
const paymentRoutes = require("./routes/payment/payment");
const indianApiRoutes = require("./routes/share_market/indian_api");
const setWalletSettingsRoutes = require("./routes/payment/setWalletSettings");
const autoInvestRoutes = require("./routes/payment/autoInvestment");
const portfolioRoutes = require("./routes/share_market/portfolio");
const adminRoutes = require("./routes/admin/auth");
const adminUserRoutes = require("./routes/admin/userCreation");
const analyticsRoutes = require("./routes/admin/userAnalysis");
const adminInvestmentRoutes = require("./routes/admin/investment");
const adminDashboardRoutes = require("./routes/admin/dashboard");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/scrape", scrapeIfscRoutes);
app.use("/api/payment", myQrRoutes, paymentRoutes, setWalletSettingsRoutes, autoInvestRoutes);
app.use("/api/share-market", indianApiRoutes, portfolioRoutes);
app.use("/api/admin", adminRoutes, adminUserRoutes, analyticsRoutes, adminInvestmentRoutes, adminDashboardRoutes);

app.get("/", (req, res) => {
  res.json({ message: "API running on Vercel!" });
});
module.exports = app;
