const express = require("express");
const router = express.Router();
const {
  getAllInvestments,
  getGlobalStats,
} = require("../../controllers/admin/investment.controller");

// 📊 GLOBAL INVESTMENTS
router.get("/", getAllInvestments);
router.get("/stats", getGlobalStats);

module.exports = router;
