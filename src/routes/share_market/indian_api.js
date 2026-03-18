const express = require("express");
const router = express.Router();

const { getTrendingStocks, searchIndustry, getMutualFunds } = require("../../controllers/share_market/indian_api");

router.get("/trending", getTrendingStocks);
router.get("/industry-search", searchIndustry);
router.get("/mutual-funds", getMutualFunds);

module.exports = router;