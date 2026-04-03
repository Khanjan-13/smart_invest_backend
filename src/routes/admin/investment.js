const express = require("express");
const router = express.Router();
const {
  getAllInvestments,
  getGlobalStats,
} = require("../../controllers/admin/investment");

router.get("/", getAllInvestments);
router.get("/stats", getGlobalStats);

module.exports = router;
