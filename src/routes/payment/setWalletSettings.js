const express = require("express");
const router = express.Router();

const { updateWalletLimit, updateRiskFactor, getUserInvestmentSettings } = require("../../controllers/payment/setWalletSettings");

router.post("/update-wallet-limit", updateWalletLimit);
router.post("/risk-factor", updateRiskFactor);
router.get("/user-wallet-settings/:upi_id", getUserInvestmentSettings);

module.exports = router;