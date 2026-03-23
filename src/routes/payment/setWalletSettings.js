const express = require("express");
const router = express.Router();

const { updateWalletLimit, updateRiskFactor } = require("../../controllers/payment/setWalletSettings");

router.post("/update-wallet-limit", updateWalletLimit);
router.post("/risk-factor", updateRiskFactor);

module.exports = router;