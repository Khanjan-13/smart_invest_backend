const express = require("express");
const router = express.Router();
const {
  getUserSpendingAnalysis,
  getMonthlySpending,
  getInvestmentAnalysis,
  getInvestmentBehaviour
} = require("../../controllers/admin/userAnalysis");

// 📊 Spending
router.get("/spending/:user_id", getUserSpendingAnalysis);
router.get("/spending/monthly/:user_id", getMonthlySpending);

// 📈 Investment
router.get("/investment/:user_id", getInvestmentAnalysis);
router.get("/investment/behaviour/:user_id", getInvestmentBehaviour);

module.exports = router;