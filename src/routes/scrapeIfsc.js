const express = require("express");
const router = express.Router();

const { scrapeAllBanks } = require("../controllers/scrapeIfsc");

router.get("/scrape-banks", async (req, res) => {
  try {
    const banks = await scrapeAllBanks();
    res.json({
      success: true,
      total: banks.length,
      banks
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to scrape banks"
    });
  }
});

module.exports = router;