const express = require("express");
const router = express.Router();

const { getUserPortfolio, deleteMultipleInvestments, getInvestmentHistory } = require("../../controllers/share_market/portfolio");

router.get("/user-portfolio/:upi_id", getUserPortfolio);
router.post("/delete-investments", deleteMultipleInvestments);
router.get("/investment-history/:upi_id", getInvestmentHistory);

module.exports = router;