const express = require("express");
const router = express.Router();

const { searchMutualFunds, getLatestNAV, getNAVRange } = require("../../controllers/share_market/mfapi");

router.get("/search", searchMutualFunds);
router.get("/latest-nav/:schemeCode", getLatestNAV);
router.get("/nav-range/:schemeCode", getNAVRange);

module.exports = router;