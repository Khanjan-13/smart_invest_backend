const express = require("express");
const router = express.Router();

const { updateWalletLimit } = require("../../controllers/payment/setWalletSettings");

router.post("/update-wallet-limit", updateWalletLimit);

module.exports = router;