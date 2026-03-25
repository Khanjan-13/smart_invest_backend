const express = require("express");
const router = express.Router();

const { getTrendingStocks, searchIndustry, getMutualFunds, getHistoricalStockData, getMutualFundDetails, searchMutualFunds } = require("../../controllers/share_market/indian_api");

router.get("/trending", getTrendingStocks);
router.get("/industry-search", searchIndustry);
router.get("/mutual-funds", getMutualFunds);
router.get("/historical-data", getHistoricalStockData);
router.get("/mutual-fund-details", getMutualFundDetails);
router.get("/search-mutual-fund", searchMutualFunds);

module.exports = router;