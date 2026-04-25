const express = require("express");
const router = express.Router();

const {
  getDashboardSummary,
  getFinancialStats,
} = require("../../controllers/admin/dashboard");

router.get("/dashboard-summary", getDashboardSummary);
router.get("/financial-stats", getFinancialStats);

module.exports = router;
