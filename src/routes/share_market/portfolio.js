const express = require("express");
const router = express.Router();

const { getUserPortfolio, deleteMultipleInvestments } = require("../../controllers/share_market/portfolio");

router.get("/user-portfolio/:upi_id", getUserPortfolio);
router.delete("/delete-investments", deleteMultipleInvestments);

module.exports = router;