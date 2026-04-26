const express = require("express");
const router = express.Router();

const {
  listTransactions,
  getAnalyticsSummary,
  getCommissionAnalytics,
  getUserAnalytics,
} = require("../../controllers/admin/transactions");

router.get("/transactions", listTransactions);
router.get("/analytics/summary", getAnalyticsSummary);
router.get("/analytics/commission", getCommissionAnalytics);
router.get("/analytics/user/:user_id", getUserAnalytics);

module.exports = router;
